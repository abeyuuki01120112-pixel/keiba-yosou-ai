/**
 * Race Result Artifactのappend-only JSON保存境界。
 * racePredictionArtifactStore.tsと同じ設計方針（idempotent同一内容・
 * 同一artifactId異内容拒否・上書き禁止）を踏襲する。
 *
 * CORRECTEDは既存Artifactを上書きしない。resultVersion/retrievedAtが
 * 異なれば別artifactId（別ファイル）になるため、旧versionは自動的に
 * そのままresults/配下に残り続ける（削除・更新は一切行わない）。
 */

import fs from "node:fs";
import path from "node:path";
import { keibaDataSubdir } from "../config/keibaDataDir";
import {
  deserializeRaceResultArtifact,
  serializeRaceResultArtifact,
  deserializeRaceResultArtifactV2,
  serializeRaceResultArtifactV2,
  type RaceResultArtifact,
  type RaceResultArtifactV2,
} from "./raceResultArtifact";

export const DEFAULT_RACE_RESULT_ARTIFACT_DIR = keibaDataSubdir("results");
/**
 * v2専用のサブディレクトリ。v1の`listRaceResultArtifactsForRace()`/
 * `findLatestCalibrationResult()`は`results/`直下の`.json`ファイルだけを
 * v1 schemaとしてdeserializeするため、v2ファイルを同じ階層へ平置きすると
 * それらの既存関数を壊す（v1既存挙動を変更しないという今回の絶対条件に抵触する）。
 * そのためv2は`results/v2/`という別ディレクトリへ保存し、v1側からは
 * ディレクトリエントリとして無害にスキップされる（`.json`拡張子フィルタで除外）。
 */
export const DEFAULT_RACE_RESULT_ARTIFACT_V2_DIR = path.join(DEFAULT_RACE_RESULT_ARTIFACT_DIR, "v2");

export interface RaceResultArtifactStoreOptions {
  dir?: string;
}

export type PersistRaceResultArtifactResult =
  | { status: "created"; artifactId: string; path: string }
  | { status: "duplicate"; artifactId: string; path: string }
  | { status: "rejected"; artifactId: string; path: string; reason: string };

export function persistRaceResultArtifact(
  artifact: RaceResultArtifact,
  options: RaceResultArtifactStoreOptions = {},
): PersistRaceResultArtifactResult {
  // serialize/deserializeを先に通し、不正・改変済みArtifactを保存しない。
  const serialized = serializeRaceResultArtifact(artifact);
  deserializeRaceResultArtifact(serialized);
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeRaceResultArtifact(existing);
      if (existingArtifact.resultContentFingerprint === artifact.resultContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのRace Result Artifactは変更・上書きできません（append-only）。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readRaceResultArtifact(
  artifactId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifact | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeRaceResultArtifact(fs.readFileSync(filePath, "utf-8"));
}

/**
 * 指定raceIdの全Result Artifactを読み込む（PROVISIONAL/FINAL/CORRECTEDすべて含む）。
 * 削除・上書きが無い前提のため、ディレクトリを走査するだけで全履歴を復元できる。
 */
export function listRaceResultArtifactsForRace(
  raceId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifact[] {
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_DIR;
  if (!fs.existsSync(dir)) return [];
  const results: RaceResultArtifact[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const artifact = deserializeRaceResultArtifact(fs.readFileSync(path.join(dir, fileName), "utf-8"));
    if (artifact.race.raceId === raceId) results.push(artifact);
  }
  return results;
}

/**
 * 指定raceIdについて、Calibrationに使える最新のFINAL/CORRECTED Artifactを返す。
 * CORRECTEDは常にsupersedesArtifactIdで旧版を指すだけの独立Artifactなので、
 * 「どのartifactもsupersedesArtifactIdとして指されていない、最新のFINAL系」を
 * 正としてchainを辿る（旧版を書き換えず、常に最新版だけを採用する）。
 */
export function findLatestCalibrationResult(
  raceId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifact | null {
  const all = listRaceResultArtifactsForRace(raceId, options);
  const finalCandidates = all.filter((a) => a.resultStatus === "FINAL" || a.resultStatus === "CORRECTED");
  if (finalCandidates.length === 0) return null;
  const supersededIds = new Set(
    finalCandidates.map((a) => a.supersedesArtifactId).filter((id): id is string => id !== null),
  );
  const latestCandidates = finalCandidates.filter((a) => !supersededIds.has(a.artifactId));
  if (latestCandidates.length === 0) return null;
  // 複数残る場合（chain不整合等）はresultVersionが最大のものを採用する。
  return latestCandidates.reduce((best, cur) => (cur.resultVersion > best.resultVersion ? cur : best));
}

/* ============================================================================
 * Race Result Artifact v2 store（Post-Race Pipeline V1・Phase 1）。
 * v1のpersist/read/list/findLatest関数は上記のとおり無変更。v2は専用ディレクトリ
 * （DEFAULT_RACE_RESULT_ARTIFACT_V2_DIR）で完全に独立して動作する。
 * ============================================================================ */

export function persistRaceResultArtifactV2(
  artifact: RaceResultArtifactV2,
  options: RaceResultArtifactStoreOptions = {},
): PersistRaceResultArtifactResult {
  const serialized = serializeRaceResultArtifactV2(artifact);
  deserializeRaceResultArtifactV2(serialized);
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_V2_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeRaceResultArtifactV2(existing);
      if (existingArtifact.resultContentFingerprint === artifact.resultContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのRace Result Artifact v2は変更・上書きできません（append-only）。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readRaceResultArtifactV2(
  artifactId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifactV2 | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_V2_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeRaceResultArtifactV2(fs.readFileSync(filePath, "utf-8"));
}

export function listRaceResultArtifactsForRaceV2(
  raceId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifactV2[] {
  const dir = options.dir ?? DEFAULT_RACE_RESULT_ARTIFACT_V2_DIR;
  if (!fs.existsSync(dir)) return [];
  const results: RaceResultArtifactV2[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const artifact = deserializeRaceResultArtifactV2(fs.readFileSync(path.join(dir, fileName), "utf-8"));
    if (artifact.race.raceId === raceId) results.push(artifact);
  }
  return results;
}

export function findLatestCalibrationResultV2(
  raceId: string,
  options: RaceResultArtifactStoreOptions = {},
): RaceResultArtifactV2 | null {
  const all = listRaceResultArtifactsForRaceV2(raceId, options);
  const finalCandidates = all.filter((a) => a.resultStatus === "FINAL" || a.resultStatus === "CORRECTED");
  if (finalCandidates.length === 0) return null;
  const supersededIds = new Set(
    finalCandidates.map((a) => a.supersedesArtifactId).filter((id): id is string => id !== null),
  );
  const latestCandidates = finalCandidates.filter((a) => !supersededIds.has(a.artifactId));
  if (latestCandidates.length === 0) return null;
  return latestCandidates.reduce((best, cur) => (cur.resultVersion > best.resultVersion ? cur : best));
}

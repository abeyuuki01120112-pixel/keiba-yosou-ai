/**
 * Actual Betting Recordのappend-only JSON保存境界。
 * raceResultArtifactStore.tsと同じ設計方針（idempotent同一内容・
 * 同一artifactId異内容拒否・上書き禁止）を踏襲する。
 *
 * 【絶対に守ること】払戻・的中結果を後からこのArtifactへ書き込まない。
 * 払戻はPhase 3のBet Settlementへ分離する（別Artifact、別store）。
 */

import fs from "node:fs";
import path from "node:path";
import { keibaDataSubdir } from "../config/keibaDataDir";
import {
  deserializeActualBettingRecord,
  serializeActualBettingRecord,
  type ActualBettingRecord,
} from "./actualBettingRecord";

export const DEFAULT_ACTUAL_BETTING_RECORD_DIR = keibaDataSubdir(path.join("bets", "actual"));

export interface ActualBettingRecordStoreOptions {
  dir?: string;
}

export type PersistActualBettingRecordResult =
  | { status: "created"; artifactId: string; path: string }
  | { status: "duplicate"; artifactId: string; path: string }
  | { status: "rejected"; artifactId: string; path: string; reason: string };

export function persistActualBettingRecord(
  artifact: ActualBettingRecord,
  options: ActualBettingRecordStoreOptions = {},
): PersistActualBettingRecordResult {
  const serialized = serializeActualBettingRecord(artifact);
  deserializeActualBettingRecord(serialized);
  const dir = options.dir ?? DEFAULT_ACTUAL_BETTING_RECORD_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeActualBettingRecord(existing);
      if (existingArtifact.betContentFingerprint === artifact.betContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのActual Betting Recordは変更・上書きできません（append-only）。" +
        "払戻情報の追記はPhase 3のBet Settlementで別Artifactとして行ってください。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readActualBettingRecord(
  artifactId: string,
  options: ActualBettingRecordStoreOptions = {},
): ActualBettingRecord | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_ACTUAL_BETTING_RECORD_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeActualBettingRecord(fs.readFileSync(filePath, "utf-8"));
}

export function listActualBettingRecordsForRace(
  raceId: string,
  options: ActualBettingRecordStoreOptions = {},
): ActualBettingRecord[] {
  const dir = options.dir ?? DEFAULT_ACTUAL_BETTING_RECORD_DIR;
  if (!fs.existsSync(dir)) return [];
  const results: ActualBettingRecord[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const artifact = deserializeActualBettingRecord(fs.readFileSync(path.join(dir, fileName), "utf-8"));
    if (artifact.raceId === raceId) results.push(artifact);
  }
  return results;
}

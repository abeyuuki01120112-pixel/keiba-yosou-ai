/**
 * Bet Settlement Artifactのappend-only JSON保存境界。
 * raceResultArtifactStore.ts／actualBettingRecordStore.tsと同じ設計方針
 * （idempotent同一内容・同一artifactId異内容拒否・上書き禁止）を踏襲する。
 *
 * CORRECTED Resultが後から届いた場合、resultArtifactIdが変わるためartifactIdも
 * 自然に変わり、旧Settlementを書き換えずに新しいSettlement Artifactが追加される。
 */

import fs from "node:fs";
import path from "node:path";
import { keibaDataSubdir } from "../config/keibaDataDir";
import {
  deserializeBetSettlement,
  serializeBetSettlement,
  type BetSettlementArtifact,
} from "./betSettlement";

export const DEFAULT_BET_SETTLEMENT_DIR = keibaDataSubdir("settlements");

export interface BetSettlementStoreOptions {
  dir?: string;
}

export type PersistBetSettlementResult =
  | { status: "created"; artifactId: string; path: string }
  | { status: "duplicate"; artifactId: string; path: string }
  | { status: "rejected"; artifactId: string; path: string; reason: string };

export function persistBetSettlement(
  artifact: BetSettlementArtifact,
  options: BetSettlementStoreOptions = {},
): PersistBetSettlementResult {
  const serialized = serializeBetSettlement(artifact);
  deserializeBetSettlement(serialized);
  const dir = options.dir ?? DEFAULT_BET_SETTLEMENT_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeBetSettlement(existing);
      if (existingArtifact.settlementContentFingerprint === artifact.settlementContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのBet Settlement Artifactは変更・上書きできません（append-only）。" +
        "Result訂正の場合は新しいresultArtifactIdを参照する新Settlementを追加してください。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readBetSettlement(
  artifactId: string,
  options: BetSettlementStoreOptions = {},
): BetSettlementArtifact | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_BET_SETTLEMENT_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeBetSettlement(fs.readFileSync(filePath, "utf-8"));
}

export function listBetSettlementsForRace(
  raceId: string,
  options: BetSettlementStoreOptions = {},
): BetSettlementArtifact[] {
  const dir = options.dir ?? DEFAULT_BET_SETTLEMENT_DIR;
  if (!fs.existsSync(dir)) return [];
  const results: BetSettlementArtifact[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const artifact = deserializeBetSettlement(fs.readFileSync(path.join(dir, fileName), "utf-8"));
    if (artifact.raceId === raceId) results.push(artifact);
  }
  return results;
}

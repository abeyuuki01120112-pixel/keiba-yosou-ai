/**
 * Bet Proposal Artifactのappend-only JSON保存境界。
 * raceResultArtifactStore.tsと同じ設計方針（idempotent同一内容・
 * 同一artifactId異内容拒否・上書き禁止）を踏襲する。
 */

import fs from "node:fs";
import path from "node:path";
import { keibaDataSubdir } from "../config/keibaDataDir";
import {
  deserializeBetProposalArtifact,
  serializeBetProposalArtifact,
  type BetProposalArtifact,
} from "./betProposal";

export const DEFAULT_BET_PROPOSAL_ARTIFACT_DIR = keibaDataSubdir(path.join("bets", "proposals"));

export interface BetProposalStoreOptions {
  dir?: string;
}

export type PersistBetProposalArtifactResult =
  | { status: "created"; artifactId: string; path: string }
  | { status: "duplicate"; artifactId: string; path: string }
  | { status: "rejected"; artifactId: string; path: string; reason: string };

export function persistBetProposalArtifact(
  artifact: BetProposalArtifact,
  options: BetProposalStoreOptions = {},
): PersistBetProposalArtifactResult {
  const serialized = serializeBetProposalArtifact(artifact);
  deserializeBetProposalArtifact(serialized);
  const dir = options.dir ?? DEFAULT_BET_PROPOSAL_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifact.artifactId}.json`);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    try {
      const existingArtifact = deserializeBetProposalArtifact(existing);
      if (existingArtifact.proposalContentFingerprint === artifact.proposalContentFingerprint) {
        return { status: "duplicate", artifactId: artifact.artifactId, path: filePath };
      }
    } catch {
      // 破損した既存ファイルも黙って上書きしない。
    }
    return {
      status: "rejected",
      artifactId: artifact.artifactId,
      path: filePath,
      reason: "同一artifactIdのBet Proposal Artifactは変更・上書きできません（append-only）。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serialized, "utf-8");
  return { status: "created", artifactId: artifact.artifactId, path: filePath };
}

export function readBetProposalArtifact(
  artifactId: string,
  options: BetProposalStoreOptions = {},
): BetProposalArtifact | null {
  if (path.basename(artifactId) !== artifactId || artifactId.includes(path.sep)) {
    throw new Error("artifactIdが不正です");
  }
  const dir = options.dir ?? DEFAULT_BET_PROPOSAL_ARTIFACT_DIR;
  const filePath = path.join(dir, `${artifactId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return deserializeBetProposalArtifact(fs.readFileSync(filePath, "utf-8"));
}

export function listBetProposalArtifactsForRace(
  raceId: string,
  options: BetProposalStoreOptions = {},
): BetProposalArtifact[] {
  const dir = options.dir ?? DEFAULT_BET_PROPOSAL_ARTIFACT_DIR;
  if (!fs.existsSync(dir)) return [];
  const results: BetProposalArtifact[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const artifact = deserializeBetProposalArtifact(fs.readFileSync(path.join(dir, fileName), "utf-8"));
    if (artifact.raceId === raceId) results.push(artifact);
  }
  return results;
}

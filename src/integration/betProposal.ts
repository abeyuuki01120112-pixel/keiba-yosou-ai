/**
 * Bet Proposal Artifact（Post-Race Pipeline V1・Phase 2）。
 *
 * AIが提案した買い目だけを保存する。実際にユーザーが購入した馬券
 * （ActualBettingRecord、別Artifact）とは完全に分離し、この提案自体を
 * 書き換える・実購入結果で上書きすることは一切しない（append-only）。
 *
 * selectionはcanonicalHorseIdをidentity keyとする（馬名・馬番はaudit/display専用、
 * betTypes.tsのBetSelectionEntry参照）。
 */

import { predictionTimestamp } from "../ability/predictionBoundary";
import { validateBetEntry, canonicalJson, sanitizeId, type BetEntry } from "./betTypes";
import { fnv1a } from "../ability/datasetVersion";

export const BET_PROPOSAL_ARTIFACT_SCHEMA_VERSION = "bet-proposal-v1";

export interface BetProposalArtifact {
  artifactId: string;
  artifactType: "BET_PROPOSAL";
  schemaVersion: string;
  raceId: string;
  /** 参照のみ。この提案がどのPrediction Artifactを見て作られたか。 */
  predictionArtifactId: string;
  strategyVersion: string;
  proposedAt: string;
  proposals: BetEntry[];
  proposalContentFingerprint: string;
}

export interface BuildBetProposalArtifactInput {
  raceId: string;
  predictionArtifactId: string;
  strategyVersion: string;
  proposedAt: string;
  proposals: BetEntry[];
}

export function buildBetProposalArtifactId(input: {
  raceId: string;
  predictionArtifactId: string;
  strategyVersion: string;
  proposedAt: string;
}): string {
  return [input.raceId, "BET_PROPOSAL", input.predictionArtifactId, input.strategyVersion, input.proposedAt]
    .map(sanitizeId).join("__");
}

export function validateBetProposalArtifact(input: BuildBetProposalArtifactInput): void {
  if (!input.raceId) throw new Error("BetProposalArtifact: raceIdが必要です");
  if (!input.predictionArtifactId) throw new Error("BetProposalArtifact: predictionArtifactIdが必要です");
  if (!input.strategyVersion) throw new Error("BetProposalArtifact: strategyVersionが必要です");
  predictionTimestamp(input.proposedAt, "proposedAt");
  if (!Array.isArray(input.proposals) || input.proposals.length === 0) {
    throw new Error("BetProposalArtifact: proposalsが空です");
  }
  input.proposals.forEach((proposal, index) =>
    validateBetEntry(proposal, `BetProposalArtifact: proposals[${index}]`),
  );
}

export function buildBetProposalArtifact(input: BuildBetProposalArtifactInput): BetProposalArtifact {
  validateBetProposalArtifact(input);
  const artifactId = buildBetProposalArtifactId(input);
  const withoutFingerprint: Omit<BetProposalArtifact, "proposalContentFingerprint"> = {
    artifactId,
    artifactType: "BET_PROPOSAL",
    schemaVersion: BET_PROPOSAL_ARTIFACT_SCHEMA_VERSION,
    raceId: input.raceId,
    predictionArtifactId: input.predictionArtifactId,
    strategyVersion: input.strategyVersion,
    proposedAt: input.proposedAt,
    proposals: input.proposals.map((proposal) => ({
      ...proposal,
      selection: proposal.selection.map((entry) => ({ ...entry })),
    })),
  };
  // proposedAtは識別・監査用の時刻であり、artifactId生成にも使うため、content
  // fingerprintからは除外する（raceResultArtifact.tsのretrievedAt除外と同じ考え方）。
  const contentForFingerprint = { ...withoutFingerprint, proposedAt: undefined };
  return {
    ...withoutFingerprint,
    proposalContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeBetProposalArtifact(artifact: BetProposalArtifact): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeBetProposalArtifact(serialized: string): BetProposalArtifact {
  const parsed = JSON.parse(serialized) as BetProposalArtifact;
  if (parsed.schemaVersion !== BET_PROPOSAL_ARTIFACT_SCHEMA_VERSION ||
      parsed.artifactType !== "BET_PROPOSAL" || !parsed.artifactId) {
    throw new Error("Bet Proposal Artifactの形式が不正です");
  }
  validateBetProposalArtifact(parsed);
  const expectedArtifactId = buildBetProposalArtifactId(parsed);
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Bet Proposal Artifactの識別子が内容と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, proposedAt: undefined, proposalContentFingerprint: undefined }),
  );
  if (parsed.proposalContentFingerprint !== expectedFingerprint) {
    throw new Error("Bet Proposal Artifactの内容fingerprintが一致しません");
  }
  return parsed;
}

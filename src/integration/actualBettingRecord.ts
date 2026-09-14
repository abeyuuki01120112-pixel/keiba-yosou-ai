/**
 * Actual Betting Record（Post-Race Pipeline V1・Phase 2）。
 *
 * ユーザーが実際に購入した馬券の事実だけを保存する。AIの提案（BetProposalArtifact）
 * とは完全に分離し、内容の完全一致を要求しない——提案と実購入の差（金額・組み合わせの
 * ずれ）をそのまま保持し、将来比較できることが目的。
 *
 * 【絶対に守ること】
 *   - 払戻・的中・回収率は一切保存しない（Phase 3のBet Settlementへ分離）。
 *   - 単にAIが提案しただけの内容を、実購入として無条件に受理しない
 *     （sourceType/sourceProvenanceで購入根拠を必ず保持する）。
 *   - 「記録した時刻」（recordedAt、必須）と「実際に購入した時刻」（purchasedAt、
 *     nullable）を混同しない。ユーザーが購入時刻を正確に覚えていない場合がある。
 */

import { predictionTimestamp } from "../ability/predictionBoundary";
import { validateBetEntry, sumStake, canonicalJson, sanitizeId, type BetEntry } from "./betTypes";
import { fnv1a } from "../ability/datasetVersion";

export const ACTUAL_BETTING_RECORD_SCHEMA_VERSION = "actual-betting-record-v1";

/**
 * 実購入の根拠種別。単にAIが提案しただけの内容をActual Betting Recordとして
 * 認定しないための最低限の出典区分（推測で広げない。実際に確認できた根拠のみ）。
 */
export const ACTUAL_BET_SOURCE_TYPES = [
  "USER_CONFIRMED",
  "PURCHASE_SCREENSHOT",
  "OTHER_VERIFIED_SOURCE",
] as const;
export type ActualBetSourceType = (typeof ACTUAL_BET_SOURCE_TYPES)[number];

export interface ActualBettingRecord {
  artifactId: string;
  artifactType: "ACTUAL_BET";
  schemaVersion: string;
  raceId: string;
  /** 参照のみ。無くてもよい（提案を見ずに購入した場合等）。 */
  predictionArtifactId: string | null;
  /** 参照のみ。無くてもよい（提案に無い独自購入・提案保存前の購入等）。 */
  betProposalArtifactId: string | null;
  strategyVersion: string;
  recordType: "ACTUAL";
  /** 実際に購入した時刻。ユーザーが正確に覚えていない場合はnull（推測で埋めない）。 */
  purchasedAt: string | null;
  /** この記録をシステムへ記録した時刻。必須。purchasedAtの代用にしない。 */
  recordedAt: string;
  bets: BetEntry[];
  totalStake: number;
  sourceType: ActualBetSourceType;
  sourceProvenance: string;
  betContentFingerprint: string;
}

export interface BuildActualBettingRecordInput {
  raceId: string;
  predictionArtifactId?: string | null;
  betProposalArtifactId?: string | null;
  strategyVersion: string;
  purchasedAt?: string | null;
  recordedAt: string;
  bets: BetEntry[];
  totalStake: number;
  sourceType: ActualBetSourceType;
  sourceProvenance: string;
}

export function buildActualBettingRecordId(input: {
  raceId: string;
  strategyVersion: string;
  recordedAt: string;
}): string {
  return [input.raceId, "ACTUAL_BET", input.strategyVersion, input.recordedAt].map(sanitizeId).join("__");
}

export function validateActualBettingRecord(input: BuildActualBettingRecordInput): void {
  if (!input.raceId) throw new Error("ActualBettingRecord: raceIdが必要です");
  if (!input.strategyVersion) throw new Error("ActualBettingRecord: strategyVersionが必要です");
  predictionTimestamp(input.recordedAt, "recordedAt");
  if (input.purchasedAt != null) predictionTimestamp(input.purchasedAt, "purchasedAt");
  if (input.predictionArtifactId != null && input.predictionArtifactId.length === 0) {
    throw new Error("ActualBettingRecord: predictionArtifactIdは非空文字列またはnullである必要があります");
  }
  if (input.betProposalArtifactId != null && input.betProposalArtifactId.length === 0) {
    throw new Error("ActualBettingRecord: betProposalArtifactIdは非空文字列またはnullである必要があります");
  }
  if (!ACTUAL_BET_SOURCE_TYPES.includes(input.sourceType)) {
    throw new Error(
      `ActualBettingRecord: sourceTypeは${ACTUAL_BET_SOURCE_TYPES.join("/")}のいずれかである必要があります` +
        `（実際: ${input.sourceType}）`,
    );
  }
  if (!input.sourceProvenance) {
    throw new Error("ActualBettingRecord: sourceProvenanceが必要です（単なるAI提案は実購入と認定しない）");
  }
  if (!Array.isArray(input.bets) || input.bets.length === 0) {
    throw new Error("ActualBettingRecord: betsが空です");
  }
  input.bets.forEach((bet, index) => validateBetEntry(bet, `ActualBettingRecord: bets[${index}]`));
  if (!Number.isInteger(input.totalStake) || input.totalStake <= 0) {
    throw new Error("ActualBettingRecord: totalStakeは正の整数（円）である必要があります");
  }
  const actualSum = sumStake(input.bets);
  if (actualSum !== input.totalStake) {
    throw new Error(
      `ActualBettingRecord: totalStake(${input.totalStake})がbetsの合計(${actualSum})と一致しません`,
    );
  }
}

export function buildActualBettingRecord(input: BuildActualBettingRecordInput): ActualBettingRecord {
  validateActualBettingRecord(input);
  const artifactId = buildActualBettingRecordId(input);
  const withoutFingerprint: Omit<ActualBettingRecord, "betContentFingerprint"> = {
    artifactId,
    artifactType: "ACTUAL_BET",
    schemaVersion: ACTUAL_BETTING_RECORD_SCHEMA_VERSION,
    raceId: input.raceId,
    predictionArtifactId: input.predictionArtifactId ?? null,
    betProposalArtifactId: input.betProposalArtifactId ?? null,
    strategyVersion: input.strategyVersion,
    recordType: "ACTUAL",
    purchasedAt: input.purchasedAt ?? null,
    recordedAt: input.recordedAt,
    bets: input.bets.map((bet) => ({ ...bet, selection: bet.selection.map((entry) => ({ ...entry })) })),
    totalStake: input.totalStake,
    sourceType: input.sourceType,
    sourceProvenance: input.sourceProvenance,
  };
  // recordedAtは「いつシステムへ記録したか」という運用時刻であり、artifactId生成にも
  // 使うため、content fingerprintからは除外する（raceResultArtifact.tsのretrievedAt除外と
  // 同じ考え方）。purchasedAtは実購入時刻という実質的内容のため除外しない。
  const contentForFingerprint = { ...withoutFingerprint, recordedAt: undefined };
  return {
    ...withoutFingerprint,
    betContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeActualBettingRecord(artifact: ActualBettingRecord): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeActualBettingRecord(serialized: string): ActualBettingRecord {
  const parsed = JSON.parse(serialized) as ActualBettingRecord;
  if (parsed.schemaVersion !== ACTUAL_BETTING_RECORD_SCHEMA_VERSION ||
      parsed.artifactType !== "ACTUAL_BET" || !parsed.artifactId) {
    throw new Error("Actual Betting Recordの形式が不正です");
  }
  validateActualBettingRecord(parsed);
  const expectedArtifactId = buildActualBettingRecordId(parsed);
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Actual Betting Recordの識別子が内容と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, recordedAt: undefined, betContentFingerprint: undefined }),
  );
  if (parsed.betContentFingerprint !== expectedFingerprint) {
    throw new Error("Actual Betting Recordの内容fingerprintが一致しません");
  }
  return parsed;
}

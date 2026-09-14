/**
 * Bet Settlement Artifact V1（Post-Race Pipeline V1・Phase 3）。
 *
 * Actual Betting Record（実購入の事実）＋ FINAL/CORRECTED Result Artifact（正式結果）＋
 * 正式払戻情報（OfficialPayoutEntry）から、的中・払戻・回収率をappend-onlyで記録する。
 *
 * 【絶対に守ること】
 *   - Actual Betting Record自体へhit/payout/returnRateを書き戻さない（別Artifactとして
 *     この場所だけに保存する）。
 *   - 的中判定はraceId + canonicalHorseIdのみで行う。馬名では絶対に判定しない。
 *   - 取消・除外・競走中止・同着等でResultの状態から的中を安全に決定できない場合は、
 *     推測せずエラーとする（Settlementを生成しない）。
 *   - Settlement V1が実際に払戻計算を行うのはWIN・QUINELLAのみ。他券種
 *     （PLACE/EXACTA/WIDE/TRIO/TRIFECTA）はBetTypeの型としては維持するが、
 *     Settlementへ渡された場合はUNSUPPORTED_BET_TYPEとして明示的に拒否する
 *     （黙って0円扱いにしない）。
 *   - オッズとpayoutPer100Yen（JRA公式の100円あたり払戻額）を混同しない。
 */

import { fnv1a } from "../ability/datasetVersion";
import { predictionTimestamp } from "../ability/predictionBoundary";
import { canonicalJson, sanitizeId, type BetEntry, type BetSelectionEntry, type BetType } from "./betTypes";
import type { ActualBettingRecord } from "./actualBettingRecord";
import { isCalibrationFinalResult, type RaceResultArtifact, type RaceResultArtifactRunner } from "./raceResultArtifact";

export const BET_SETTLEMENT_SCHEMA_VERSION = "bet-settlement-v1";

export type SettlementStatus = "SETTLED" | "VOID" | "PENDING_CORRECTION";

/** V1で実際に払戻計算を行う券種。他はUNSUPPORTED_BET_TYPEとして拒否する。 */
export const SETTLEABLE_BET_TYPES: readonly BetType[] = ["WIN", "QUINELLA"];

export interface SettledBetEntry {
  betType: BetType;
  selection: BetSelectionEntry[];
  stake: number;
  hit: boolean;
  /** 100円あたりの公式払戻額。miss（hit=false）の場合はnull。 */
  payoutPer100Yen: number | null;
  /** stake / 100 * payoutPer100Yen（整数円）。missの場合は0。 */
  payout: number;
}

export interface BetSettlementArtifact {
  artifactId: string;
  artifactType: "BET_SETTLEMENT";
  schemaVersion: string;
  raceId: string;
  actualBettingRecordArtifactId: string;
  resultArtifactId: string;
  settledAt: string;
  settlementStatus: SettlementStatus;
  perBet: SettledBetEntry[];
  totalStake: number;
  totalPayout: number;
  /** totalPayout / totalStake。表示時の百分率変換（×100%）はこの値を保存する側では行わない。 */
  returnRate: number;
  settlementContentFingerprint: string;
}

/**
 * 正式払戻入力（1件＝1券種の的中組み合わせに対する公式払戻）。
 * ChatGPTの記憶や推測は使わず、出典を明示できるものだけを渡すこと
 * （Production受理の可否・source whitelistはofficialPayoutInput.tsの責務。
 * ここでは構造としての最低限の妥当性だけを見る）。
 */
export interface OfficialPayoutEntry {
  raceId: string;
  source: string;
  sourceIdentifier: string;
  retrievedAt: string;
  betType: BetType;
  /** 的中組み合わせ（canonicalHorseIdベース）。 */
  selection: BetSelectionEntry[];
  /** 100円あたりの公式払戻額（円）。正の整数。 */
  payoutPer100Yen: number;
}

export interface BuildBetSettlementInput {
  actualBettingRecord: ActualBettingRecord;
  result: RaceResultArtifact;
  payouts: readonly OfficialPayoutEntry[];
  settledAt: string;
  /**
   * V1では自動判定しない状態（VOID等）を明示的に指定する場合のみ使う。
   * 省略時は、Resultの状態から機械的に決まる場合だけSETTLEDとして構築する。
   */
  settlementStatusOverride?: Exclude<SettlementStatus, "SETTLED">;
}

export function buildBetSettlementId(input: {
  raceId: string;
  actualBettingRecordArtifactId: string;
  resultArtifactId: string;
  settledAt: string;
}): string {
  return [input.raceId, "BET_SETTLEMENT", input.actualBettingRecordArtifactId, input.resultArtifactId, input.settledAt]
    .map(sanitizeId).join("__");
}

function validateOfficialPayoutEntry(entry: OfficialPayoutEntry, label: string): void {
  if (!entry.raceId) throw new Error(`${label}: raceIdが必要です`);
  if (!entry.source) throw new Error(`${label}: sourceが必要です`);
  if (!entry.sourceIdentifier) throw new Error(`${label}: sourceIdentifierが必要です`);
  predictionTimestamp(entry.retrievedAt, `${label}.retrievedAt`);
  if (!Array.isArray(entry.selection) || entry.selection.length === 0) {
    throw new Error(`${label}: selectionが必要です`);
  }
  for (const sel of entry.selection) {
    if (!sel.canonicalHorseId) throw new Error(`${label}: selectionにcanonicalHorseIdが必要です`);
  }
  if (!Number.isInteger(entry.payoutPer100Yen) || entry.payoutPer100Yen <= 0) {
    throw new Error(`${label}: payoutPer100Yenは正の整数である必要があります（実際: ${entry.payoutPer100Yen}）`);
  }
}

function findRunner(
  result: RaceResultArtifact,
  canonicalHorseId: string,
): RaceResultArtifactRunner {
  const runner = result.runners.find((r) => r.canonicalHorseId === canonicalHorseId);
  if (!runner) {
    throw new Error(
      `BetSettlement: canonicalHorseId(${canonicalHorseId})がResult Artifact(raceId=${result.race.raceId})に存在しません`,
    );
  }
  return runner;
}

/**
 * 1頭のrunnerが的中判定に使える状態か検証する。取消・除外・競走中止・失格は
 * 「勝手に推定せずエラーにする」対象（section 7）。
 */
function assertSettleableRunner(runner: RaceResultArtifactRunner, betType: BetType): void {
  if (runner.scratched || runner.excluded) {
    throw new Error(
      `BetSettlement: ${betType}のselectionに含まれる馬(${runner.canonicalHorseId})は` +
        "scratched/excludedのため、的中判定できません（この券種は返還対象の可能性があります。手動確認が必要です）。",
    );
  }
  if (runner.didNotFinish || runner.disqualified) {
    throw new Error(
      `BetSettlement: ${betType}のselectionに含まれる馬(${runner.canonicalHorseId})は` +
        "didNotFinish/disqualifiedのため、機械的な的中判定ができません（手動確認が必要です）。",
    );
  }
}

function resolveWinner(result: RaceResultArtifact): RaceResultArtifactRunner {
  const winners = result.runners.filter((r) => r.finishPosition === 1);
  if (winners.length !== 1) {
    throw new Error(
      `BetSettlement: finishPosition=1の馬が${winners.length}頭です（同着等で1着を一意に決定できません。` +
        "手動確認が必要です）。",
    );
  }
  return winners[0];
}

function resolveSecondPlace(result: RaceResultArtifact): RaceResultArtifactRunner {
  const seconds = result.runners.filter((r) => r.finishPosition === 2);
  if (seconds.length !== 1) {
    throw new Error(
      `BetSettlement: finishPosition=2の馬が${seconds.length}頭です（同着等で2着を一意に決定できません。` +
        "手動確認が必要です）。",
    );
  }
  return seconds[0];
}

/** raceId + canonicalHorseIdのみで的中判定する。馬名は一切参照しない。 */
function determineHit(bet: BetEntry, result: RaceResultArtifact): boolean {
  const selectedIds = bet.selection.map((entry) => entry.canonicalHorseId);
  for (const id of selectedIds) {
    assertSettleableRunner(findRunner(result, id), bet.betType);
  }

  if (bet.betType === "WIN") {
    const winner = resolveWinner(result);
    return selectedIds[0] === winner.canonicalHorseId;
  }
  if (bet.betType === "QUINELLA") {
    const winner = resolveWinner(result);
    const second = resolveSecondPlace(result);
    const winningIds = new Set([winner.canonicalHorseId, second.canonicalHorseId]);
    return selectedIds.length === 2 && selectedIds.every((id) => winningIds.has(id));
  }
  throw new Error(`BetSettlement: UNSUPPORTED_BET_TYPE: ${bet.betType}はSettlement V1で未対応です`);
}

/** 的中したbetに対応する公式払戻を、betTypeとcanonicalHorseId集合の一致で検索する。 */
function findOfficialPayout(
  bet: BetEntry,
  payouts: readonly OfficialPayoutEntry[],
  raceId: string,
): OfficialPayoutEntry {
  const selectedIds = new Set(bet.selection.map((entry) => entry.canonicalHorseId));
  const match = payouts.find((payout) => {
    if (payout.betType !== bet.betType || payout.raceId !== raceId) return false;
    const payoutIds = new Set(payout.selection.map((entry) => entry.canonicalHorseId));
    return payoutIds.size === selectedIds.size && [...selectedIds].every((id) => payoutIds.has(id));
  });
  if (!match) {
    throw new Error(
      `BetSettlement: betType=${bet.betType}・selection=${[...selectedIds].join(",")}に対応する` +
        "正式払戻情報が見つかりません（ChatGPTの記憶・推測での補完は禁止）。",
    );
  }
  return match;
}

function settleBet(bet: BetEntry, result: RaceResultArtifact, payouts: readonly OfficialPayoutEntry[], raceId: string): SettledBetEntry {
  if (!SETTLEABLE_BET_TYPES.includes(bet.betType)) {
    throw new Error(`BetSettlement: UNSUPPORTED_BET_TYPE: ${bet.betType}はSettlement V1で未対応です`);
  }
  const hit = determineHit(bet, result);
  if (!hit) {
    return {
      betType: bet.betType,
      selection: bet.selection.map((entry) => ({ ...entry })),
      stake: bet.stake,
      hit: false,
      payoutPer100Yen: null,
      payout: 0,
    };
  }
  const officialPayout = findOfficialPayout(bet, payouts, raceId);
  const payout = Math.round((bet.stake / 100) * officialPayout.payoutPer100Yen);
  return {
    betType: bet.betType,
    selection: bet.selection.map((entry) => ({ ...entry })),
    stake: bet.stake,
    hit: true,
    payoutPer100Yen: officialPayout.payoutPer100Yen,
    payout,
  };
}

export function validateBuildBetSettlementInput(input: BuildBetSettlementInput): void {
  if (input.actualBettingRecord.raceId !== input.result.race.raceId) {
    throw new Error(
      "BetSettlement: actualBettingRecordのraceIdとresultのraceIdが一致しません" +
        `（${input.actualBettingRecord.raceId} / ${input.result.race.raceId}）`,
    );
  }
  predictionTimestamp(input.settledAt, "settledAt");
  input.payouts.forEach((entry, index) => validateOfficialPayoutEntry(entry, `payouts[${index}]`));
}

export function buildBetSettlement(input: BuildBetSettlementInput): BetSettlementArtifact {
  validateBuildBetSettlementInput(input);

  let settlementStatus: SettlementStatus;
  let perBet: SettledBetEntry[];
  let totalPayout: number;

  if (input.settlementStatusOverride !== undefined) {
    settlementStatus = input.settlementStatusOverride;
    perBet = input.actualBettingRecord.bets.map((bet) => ({
      betType: bet.betType,
      selection: bet.selection.map((entry) => ({ ...entry })),
      stake: bet.stake,
      hit: false,
      payoutPer100Yen: null,
      payout: 0,
    }));
    totalPayout = 0;
  } else {
    if (!isCalibrationFinalResult(input.result)) {
      throw new Error(
        `BetSettlement: resultStatus=${input.result.resultStatus}はFINAL/CORRECTEDではないため、` +
          "Settlementを確定できません（PROVISIONALのまま払戻を確定させない）。",
      );
    }
    perBet = input.actualBettingRecord.bets.map((bet) =>
      settleBet(bet, input.result, input.payouts, input.result.race.raceId),
    );
    totalPayout = perBet.reduce((sum, bet) => sum + bet.payout, 0);
    settlementStatus = "SETTLED";
  }

  const artifactId = buildBetSettlementId({
    raceId: input.actualBettingRecord.raceId,
    actualBettingRecordArtifactId: input.actualBettingRecord.artifactId,
    resultArtifactId: input.result.artifactId,
    settledAt: input.settledAt,
  });
  const totalStake = input.actualBettingRecord.totalStake;
  const withoutFingerprint: Omit<BetSettlementArtifact, "settlementContentFingerprint"> = {
    artifactId,
    artifactType: "BET_SETTLEMENT",
    schemaVersion: BET_SETTLEMENT_SCHEMA_VERSION,
    raceId: input.actualBettingRecord.raceId,
    actualBettingRecordArtifactId: input.actualBettingRecord.artifactId,
    resultArtifactId: input.result.artifactId,
    settledAt: input.settledAt,
    settlementStatus,
    perBet,
    totalStake,
    totalPayout,
    returnRate: totalStake === 0 ? 0 : totalPayout / totalStake,
  };
  const contentForFingerprint = { ...withoutFingerprint, settledAt: undefined };
  return {
    ...withoutFingerprint,
    settlementContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeBetSettlement(artifact: BetSettlementArtifact): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeBetSettlement(serialized: string): BetSettlementArtifact {
  const parsed = JSON.parse(serialized) as BetSettlementArtifact;
  if (parsed.schemaVersion !== BET_SETTLEMENT_SCHEMA_VERSION ||
      parsed.artifactType !== "BET_SETTLEMENT" || !parsed.artifactId) {
    throw new Error("Bet Settlement Artifactの形式が不正です");
  }
  predictionTimestamp(parsed.settledAt, "settledAt");
  const expectedArtifactId = buildBetSettlementId(parsed);
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Bet Settlement Artifactの識別子が内容と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, settledAt: undefined, settlementContentFingerprint: undefined }),
  );
  if (parsed.settlementContentFingerprint !== expectedFingerprint) {
    throw new Error("Bet Settlement Artifactの内容fingerprintが一致しません");
  }
  return parsed;
}

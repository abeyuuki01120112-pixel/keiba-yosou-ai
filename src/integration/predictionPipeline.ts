/**
 * Collector → Predictionの発走前境界（P0-1）。
 * 明示cutoffと出走表の利用可能時刻を検証し、全頭が既存Evidence条件を満たす
 * 場合だけ凍結済みFinal/Probability関数を呼ぶ。診断時は確率を生成しない。
 * P0-2ではCollector priorHistoriesをcanonical horseId単位でproduction Horse Historyへ
 * 非破壊mergeし、raceScoreから再計算した同一履歴集合をStage AとFinalへ渡す。
 */

import {
  buildGateConfirmedSnapshot,
  buildAbilityBoard,
  GOING_UNKNOWN_SENTINEL,
  PREDICTION_SNAPSHOT_MODEL_VERSION,
} from "../ability/predictionSnapshot";
import type {
  RaceEntryInput,
  SnapshotRaceTarget,
  SnapshotGoingInput,
  AbilityBoardRow,
  PredictionOddsStatus,
} from "../ability/predictionSnapshot";
import type { OddsSnapshotEntry } from "../ability/oddsSnapshot";
import { computeFinalRaceAbility } from "../ability/finalRaceAbility";
import { computeOutcomeProbabilitiesRaw } from "../ability/outcomeProbability";
import { buildCanonicalHorseRegistry } from "../ability/import/canonicalHorseRegistry";
import { reasonsFromSnapshotEntry } from "../ability/import/raceCardBridge";
import { assertPredictionCutoff, predictionTimestamp, isKnownByCutoff, isPriorPerformance } from "../ability/predictionBoundary";
import { roundToOneDecimal } from "../ability/raceScore";
import type { FinalRaceAbilityResult, RunningStyleDistribution } from "../ability/raceContextTypes";
import type { RacePerformance } from "../ability/types";
import type { CollectedRaceIdentity, CollectedRunnerRow, PriorHistoryEntry } from "../collector/types";
import { connectCollectorHorseHistories } from "./collectorHorseHistory";
import {
  evaluateFormalPredictionGate,
  type FormalPredictionGateError,
  type FormalPredictionGateResult,
} from "./formalPredictionGate";
import {
  connectWinExpectedValue,
  type ExpectedValueUnavailableReason,
} from "./expectedValueConnection";
import {
  assessEvDecision,
  buildEvDecisionContext,
  type EvDecisionAssessment,
  type EvDecisionContext,
  type EvDecisionPolicy,
} from "../strategy/evDecision";

export interface PredictionPipelineHorseResult {
  horseId: string;
  horseName: string;
  horseNumber: number | null;
  gate: number | null;
  scratched: boolean;
  baseAbility: number | null;
  overallSuitabilityPercent: number | null;
  distanceSuitability: number | null;
  courseSuitability: number | null;
  goingSuitability: number | null;
  gateSuitability: number | null;
  effectiveAbility: number | null;
  finalRaceAbility: number | null;
  rankByEffectiveAbility: number | null;
  rankByFinalRaceAbility: number | null;
  winProbability: number | null;
  top2Probability: number | null;
  top3Probability: number | null;
  /** P0-5のEV入力候補。能力・Probability計算には使用しない。 */
  winOdds: number | null;
  winOddsSnapshot: OddsSnapshotEntry | null;
  /** Plackett-Luceの表示丸め前勝率（percent）。EV計算監査用。 */
  winProbabilityRaw: number | null;
  /** 期待回収倍率。1.00が理論上の損益分岐。 */
  expectedValue: number | null;
  oddsObservedAt: string | null;
  predictionCutoffAt: string;
  readyForEv: boolean;
  expectedValueUnavailableReason: ExpectedValueUnavailableReason | null;
  evDecision: EvDecisionAssessment;
  confidence: AbilityBoardRow["overallConfidence"];
  warnings: string[];
}

export interface PredictionPipelineResult {
  race: CollectedRaceIdentity;
  horses: PredictionPipelineHorseResult[];
  predictionStage: "STAGE_A" | "STAGE_B";
  predictionSource: "COLLECTOR_PREDICTION_PIPELINE" | "FORMAL_SNAPSHOT_PIPELINE";
  raceStartAt: string | null;
  generatedAt: string;
  modelVersion: string;
  predictionCutoffAt: string;
  formalPredictionReady: boolean;
  gate: FormalPredictionGateResult;
  odds: OddsSnapshotEntry[] | null;
  oddsStatus: PredictionOddsStatus & { readyForEv: boolean };
  evDecisionContext: EvDecisionContext;
  /** Stage A・Finalの両方が実際に参照した、cutoff適用済みの全履歴。 */
  horseHistoriesByHorseId: Record<string, RacePerformance[]>;
}

export interface RunPredictionPipelineOptions {
  /** 必須。generatedAtや現在時刻では代用しない。 */
  predictionCutoffAt: string;
  /** 出走表一式が利用可能になった時刻。取得時刻とは区別する。 */
  raceCardAvailableAt: string;
  /** 不明なら省略。同日cutoffは発走前と確認できないため拒否する。 */
  scheduledStartTime?: string;
  /** 未指定は未評価。確定結果のgoingを自動採用しない。 */
  going?: SnapshotGoingInput;
  goingAvailableAt?: string;
  /** 出力メタデータ専用。省略時はcutoffを使い、実行時計に依存しない。 */
  generatedAt?: string;
  /** 予測時点Odds Snapshot候補。cutoff/raceId/canonical horseIdで選別する。 */
  odds?: readonly OddsSnapshotEntry[] | null;
  /** Historical Replayで差し替えるEV候補分類Policy。省略時は未校正Policy。 */
  evDecisionPolicy?: EvDecisionPolicy;
}

function computeDescendingRanks(values: (number | null)[]): (number | null)[] {
  const withIndex = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null)
    .sort((a, b) => b.v - a.v);
  const ranks: (number | null)[] = values.map(() => null);
  withIndex.forEach(({ i }, order) => {
    ranks[i] = order + 1;
  });
  return ranks;
}

export function runPredictionPipeline(
  raceIdentity: CollectedRaceIdentity,
  runners: CollectedRunnerRow[],
  priorHistories: PriorHistoryEntry[],
  options: RunPredictionPipelineOptions,
): PredictionPipelineResult {
  const predictionCutoffAt = options?.predictionCutoffAt;
  const boundaryTarget = { ...raceIdentity, postTimeIso: options?.scheduledStartTime };
  assertPredictionCutoff(predictionCutoffAt, boundaryTarget);
  const cutoffMs = predictionTimestamp(predictionCutoffAt, "predictionCutoffAt");
  const globalGateErrors: FormalPredictionGateError[] = [];
  const runnerPreflightErrors = runners.map((): FormalPredictionGateError[] => []);
  const cutoffSatisfied = runners.map(() => true);
  const runnerInputComplete = runners.map(() => true);
  if (predictionTimestamp(options.raceCardAvailableAt, "raceCardAvailableAt") > cutoffMs) {
    globalGateErrors.push({ code: "FUTURE_DATA_REJECTED", message: "出走表がcutoff後に確定しています。" });
  }
  const generatedAt = options.generatedAt ?? predictionCutoffAt;
  const evDecisionContext = buildEvDecisionContext(options.evDecisionPolicy);
  predictionTimestamp(generatedAt, "generatedAt");
  const requestedGoing: SnapshotGoingInput = options.going ?? { evaluated: false };
  let going = requestedGoing;
  if (requestedGoing.evaluated && predictionTimestamp(options.goingAvailableAt, "goingAvailableAt") > cutoffMs) {
    globalGateErrors.push({ code: "FUTURE_DATA_REJECTED", message: "馬場情報がcutoff後に確定しています。" });
    going = { evaluated: false };
  }
  if (!raceIdentity.raceName || !raceIdentity.racecourse || !["turf", "dirt"].includes(raceIdentity.surface) ||
      !Number.isFinite(raceIdentity.distance) || raceIdentity.distance <= 0) {
    globalGateErrors.push({ code: "MISSING_RACE_INPUT", message: "正式予測に必要なRace情報が不足しています。" });
  }
  if (runners.length === 0) {
    globalGateErrors.push({ code: "EMPTY_RUNNER_SET", message: "出走予定馬が0頭です。" });
  }
  const horseIdCounts = new Map<string, number>();
  const horseNumberCounts = new Map<number, number>();
  for (const runner of runners) {
    horseIdCounts.set(runner.horseId, (horseIdCounts.get(runner.horseId) ?? 0) + 1);
    horseNumberCounts.set(runner.horseNumber, (horseNumberCounts.get(runner.horseNumber) ?? 0) + 1);
  }
  for (const [i, r] of runners.entries()) {
    if (r.entryStatus != null && !["declared", "scratched", "excluded"].includes(r.entryStatus)) {
      runnerInputComplete[i] = false;
      runnerPreflightErrors[i].push({ code: "MISSING_RUNNER_INPUT", message: "entryStatusが不正です。" });
    }
    try {
      cutoffSatisfied[i] = isKnownByCutoff(r, predictionCutoffAt);
    } catch {
      cutoffSatisfied[i] = false;
    }
    if (!cutoffSatisfied[i]) {
      runnerPreflightErrors[i].push({ code: "FUTURE_DATA_REJECTED", message: "Runner情報がcutoff境界を満たしません。" });
    }
    if (!r.horseId || (horseIdCounts.get(r.horseId) ?? 0) > 1) {
      runnerInputComplete[i] = false;
      runnerPreflightErrors[i].push({ code: "DUPLICATE_HORSE_ID", message: "horseIdが欠落または重複しています。" });
    }
    if (!Number.isInteger(r.horseNumber) || r.horseNumber < 1 || (horseNumberCounts.get(r.horseNumber) ?? 0) > 1) {
      runnerInputComplete[i] = false;
      runnerPreflightErrors[i].push({ code: "DUPLICATE_HORSE_NUMBER", message: "馬番が欠落・不正・重複しています。" });
    }
    // fieldSizeは取消行を含む出走表の全行数。行を削ってから予測してはいけない。
    if (!Number.isInteger(r.fieldSize) || r.fieldSize !== runners.length) {
      globalGateErrors.push({ code: "INCOMPLETE_RUNNER_SET", message: "出走表行数とfieldSizeが一致しません。" });
    }
    if (r.raceId !== raceIdentity.raceId || r.raceDate !== raceIdentity.raceDate ||
        r.racecourse !== raceIdentity.racecourse || r.surface !== raceIdentity.surface || r.distance !== raceIdentity.distance) {
      runnerInputComplete[i] = false;
      runnerPreflightErrors[i].push({ code: "RACE_IDENTITY_MISMATCH", message: "RunnerのRace情報が対象レースと一致しません。" });
    }
    if (r.entryStatus !== "scratched" && r.entryStatus !== "excluded" &&
        (!r.horseName || !Number.isInteger(r.gate) || r.gate < 1 || r.gate > 8 ||
         !Number.isFinite(r.carriedWeightKg) || (r.carriedWeightKg ?? 0) <= 0)) {
      runnerInputComplete[i] = false;
      runnerPreflightErrors[i].push({ code: "MISSING_RUNNER_INPUT", message: "馬名・枠番・斤量のいずれかが不足しています。" });
    }
  }

  const raceTarget: SnapshotRaceTarget = {
    raceId: raceIdentity.raceId,
    raceName: raceIdentity.raceName,
    raceDate: raceIdentity.raceDate,
    racecourse: raceIdentity.racecourse,
    surface: raceIdentity.surface,
    distance: raceIdentity.distance,
    // 時刻不明時は保守的な日付境界（上で同日cutoffを拒否済み）。
    postTimeIso: options.scheduledStartTime ?? `${raceIdentity.raceDate}T00:00:00+09:00`,
    raceNumber: raceIdentity.raceNumber,
  };

  const entries: RaceEntryInput[] = runners.map((r, i) => ({
    horseId: r.horseId,
    horseName: r.horseName,
    frame: cutoffSatisfied[i] ? r.gate : null,
    horseNumber: cutoffSatisfied[i] ? r.horseNumber : null,
    carriedWeight: cutoffSatisfied[i] ? r.carriedWeightKg : null,
    scratched: r.entryStatus === "scratched" || r.entryStatus === "excluded",
  }));

  const historyConnection = connectCollectorHorseHistories(
    runners,
    priorHistories,
    boundaryTarget,
    predictionCutoffAt,
  );
  const canonicalRegistry = buildCanonicalHorseRegistry();
  const registryByHorseId = new Map(canonicalRegistry.map((entry) => [entry.horseId, entry]));
  const resolvedCanonicalIds = new Set(registryByHorseId.keys());
  const runnerIdSet = new Set(runners.map((runner) => runner.horseId));
  for (const history of priorHistories) {
    if (history.status === "available" && runnerIdSet.has(history.horseId) &&
        !historyConnection.issues.some((issue) => issue.horseId === history.horseId)) {
      resolvedCanonicalIds.add(history.horseId);
    }
  }
  // STEP1-4: merge後に既存raceScore pipelineで再計算した同一履歴をBase Ability/Suitabilityへ渡す。
  const snapshot = buildGateConfirmedSnapshot({
    raceTarget,
    entries,
    going,
    generatedAt: predictionCutoffAt,
    horseHistories: historyConnection.historiesByHorseId,
    odds: options.odds,
    oddsCanonicalHorseIds: resolvedCanonicalIds,
  });
  const abilityBoard = buildAbilityBoard(snapshot);

  const priorHistoryByHorseId = new Map<string, PriorHistoryEntry>();
  for (const p of priorHistories) {
    if (priorHistoryByHorseId.has(p.horseId)) continue;
    const races = p.races.filter((r) => isPriorPerformance(r, boundaryTarget, predictionCutoffAt) &&
      (r.dataKind == null || r.dataKind === "real"));
    priorHistoryByHorseId.set(p.horseId, { ...p, races });
  }

  const runnerIds = new Set(runners.map((runner) => runner.horseId));
  const connectionErrorsByHorseId = new Map<string, FormalPredictionGateError[]>();
  for (const issue of historyConnection.issues) {
    const error: FormalPredictionGateError = {
      code: issue.code === "UNRESOLVED_CANONICAL_HORSE_ID"
        ? "UNRESOLVED_CANONICAL_HORSE_ID"
        : issue.code === "UNSUPPORTED_STAGE_B_HISTORY"
          ? "UNSUPPORTED_STAGE_B_HISTORY"
        : issue.code === "INSUFFICIENT_SCORABLE_HISTORY"
          ? "INSUFFICIENT_SCORABLE_HISTORY"
        : issue.code === "INCOMPLETE_PRIOR_HISTORY"
          ? "MISSING_HORSE_HISTORY"
          : "INVALID_HORSE_HISTORY",
      message: issue.message,
    };
    if (!runnerIds.has(issue.horseId)) {
      globalGateErrors.push(error);
      continue;
    }
    const current = connectionErrorsByHorseId.get(issue.horseId) ?? [];
    current.push(error);
    connectionErrorsByHorseId.set(issue.horseId, current);
  }

  const productionCanonicalIds = new Set(registryByHorseId.keys());
  const snapshotByHorseId = new Map(snapshot.runners.map((runner) => [runner.horseId, runner]));
  const gate = evaluateFormalPredictionGate(
    runners.map((runner, i) => {
      const snapshotRunner = snapshotByHorseId.get(runner.horseId);
      const suppliedHistory = priorHistoryByHorseId.get(runner.horseId);
      const suppliedRaceCount = suppliedHistory?.status === "available" ? suppliedHistory.races.length : 0;
      const requiredRaceCount = snapshotRunner?.abilityEvidence?.abilityEvidenceCount ?? 1;
      const connectedHistory = historyConnection.historiesByHorseId[runner.horseId] ?? [];
      const receivedCanonicalId = suppliedHistory?.status === "available";
      const existingEligibilityReasons = snapshotRunner == null
        ? ["snapshotEntryMissing"]
        : reasonsFromSnapshotEntry(snapshotRunner, registryByHorseId.get(runner.horseId));
      return {
        horseId: runner.horseId || null,
        horseName: runner.horseName,
        horseNumber: runner.horseNumber,
        explicitlyExcluded: runner.entryStatus === "scratched" || runner.entryStatus === "excluded",
        canonicalHorseIdResolved: Boolean(runner.horseId) &&
          (productionCanonicalIds.has(runner.horseId) || receivedCanonicalId),
        runnerInputComplete: runnerInputComplete[i],
        cutoffSatisfied: cutoffSatisfied[i] && connectedHistory.every((race) =>
          isPriorPerformance(race, boundaryTarget, predictionCutoffAt),
        ),
        hasHorseHistory: suppliedRaceCount >= requiredRaceCount && connectedHistory.length >= requiredRaceCount,
        baseAbilityAvailable: snapshotRunner?.baseAbility !== null &&
          snapshotRunner?.baseAbility !== undefined && Number.isFinite(snapshotRunner.baseAbility),
        existingPredictionEligible: snapshotRunner != null && !snapshotRunner.scratched &&
          snapshotRunner.baseAbility !== null && existingEligibilityReasons.length === 0,
        existingEligibilityReasons,
        historyErrors: [
          ...runnerPreflightErrors[i],
          ...(connectionErrorsByHorseId.get(runner.horseId) ?? []),
        ],
      };
    }),
    [
      ...globalGateErrors,
      ...(snapshot.runners.every((runner) => runner.scratched)
        ? [{ code: "NO_ACTIVE_RUNNERS" as const, message: "明示取消・除外以外の出走予定馬がいません。" }]
        : []),
    ],
  );
  const gateInputByHorseId = new Map(
    runners.map((r) => [r.horseId, { horseNumber: r.horseNumber, fieldSize: r.fieldSize, frame: r.gate }]),
  );
  const suitabilityTarget = {
    racecourse: raceIdentity.racecourse,
    surface: raceIdentity.surface,
    distance: raceIdentity.distance,
    going: going.evaluated ? going.going : GOING_UNKNOWN_SENTINEL,
  };
  const raceContextTarget = { raceId: raceIdentity.raceId, raceDate: raceIdentity.raceDate, raceNumber: raceIdentity.raceNumber };

  const activeRows = gate.formal ? abilityBoard.filter((row) => !row.scratched && row.baseAbility !== null) : [];

  function computeOnce(row: AbilityBoardRow, fieldDistributions: RunningStyleDistribution[]): FinalRaceAbilityResult {
    const recentRaces = (historyConnection.historiesByHorseId[row.horseId] ?? [])
      .filter((race) => race.dataKind == null || race.dataKind === "real");
    const gate = gateInputByHorseId.get(row.horseId) ?? { horseNumber: row.horseNumber, fieldSize: null, frame: row.frame };
    return computeFinalRaceAbility({
      baseAbility: row.baseAbility as number,
      horseId: row.horseId,
      recentRaces,
      suitabilityTarget,
      gate,
      raceContextTarget,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldDistributions,
      manualTrackBias: null,
      autoTrackBias: null,
    });
  }

  // STEP5: finalRaceAbility（既存finalRaceAbility.tsを2-passで呼び出す）。
  // pass1: 各馬自身のrunningStyle distributionを、フィールド分布無しで暫定算出する。
  const pass1 = new Map(activeRows.map((row) => [row.horseId, computeOnce(row, [])]));
  const fieldDistributions = [...pass1.values()].map((r) => r.autoRunningStyle.distribution);
  // pass2: フィールド全体の脚質分布を使って、想定ペース・最終finalRaceAbilityを確定する。
  const finalResults = new Map(activeRows.map((row) => [row.horseId, computeOnce(row, fieldDistributions)]));

  // STEP6: Plackett-Luce勝率（既存outcomeProbability.tsをそのまま呼び出す、Temperature変更なし）
  const strengthEntries = [...finalResults.entries()].map(([horseId, r]) => ({ id: horseId, finalRaceAbility: r.finalRaceAbility }));
  const probabilities = gate.formal ? computeOutcomeProbabilitiesRaw(strengthEntries) : [];
  const probabilityByHorseId = new Map(probabilities.map((p) => [p.id, p]));
  const winOddsByHorseId = new Map(
    (snapshot.odds ?? []).filter((odds) => odds.market === "win").map((odds) => [odds.horseId, odds]),
  );

  const finalRaceAbilityRanks = computeDescendingRanks(
    abilityBoard.map((row) => finalResults.get(row.horseId)?.finalRaceAbility ?? null),
  );

  const horses: PredictionPipelineHorseResult[] = abilityBoard.map((row, i) => {
    const finalResult = finalResults.get(row.horseId) ?? null;
    const prob = probabilityByHorseId.get(row.horseId) ?? null;
    const winOddsSnapshot = winOddsByHorseId.get(row.horseId) ?? null;
    const ev = connectWinExpectedValue({
      formalPredictionReady: gate.formalPredictionReady,
      raceId: raceIdentity.raceId,
      horseId: row.horseId,
      winProbabilityPercent: prob?.winProbability ?? null,
      winOddsSnapshot,
    });
    const evDecision = assessEvDecision({
      expectedValue: ev.expectedValue,
      readyForEv: ev.readyForEv,
      policy: evDecisionContext.policy,
    });
    return {
      horseId: row.horseId,
      horseName: row.horseName,
      horseNumber: row.horseNumber,
      gate: row.frame,
      scratched: row.scratched,
      baseAbility: row.baseAbility,
      overallSuitabilityPercent: row.overallSuitabilityPercent,
      distanceSuitability: row.distanceSuitability,
      courseSuitability: row.courseSuitability,
      goingSuitability: row.goingSuitability,
      gateSuitability: row.gateSuitability,
      effectiveAbility: row.effectiveAbility,
      finalRaceAbility: finalResult?.finalRaceAbility ?? null,
      rankByEffectiveAbility: row.rankByEffectiveAbility,
      rankByFinalRaceAbility: finalRaceAbilityRanks[i],
      winProbability: prob ? roundToOneDecimal(prob.winProbability) : null,
      top2Probability: prob ? roundToOneDecimal(prob.top2Probability) : null,
      top3Probability: prob ? roundToOneDecimal(prob.top3Probability) : null,
      winOdds: winOddsSnapshot?.odds ?? null,
      winOddsSnapshot,
      ...ev,
      evDecision,
      predictionCutoffAt,
      confidence: row.overallConfidence,
      warnings: row.warnings,
    };
  });

  return {
    race: { ...raceIdentity, going: going.evaluated ? going.going : GOING_UNKNOWN_SENTINEL },
    horses,
    predictionStage: "STAGE_A",
    predictionSource: "COLLECTOR_PREDICTION_PIPELINE",
    raceStartAt: options.scheduledStartTime ?? null,
    generatedAt,
    predictionCutoffAt,
    formalPredictionReady: gate.formalPredictionReady,
    gate,
    odds: snapshot.odds,
    oddsStatus: {
      ...snapshot.oddsStatus,
      readyForEv: gate.formalPredictionReady && horses
        .filter((horse) => !horse.scratched)
        .every((horse) => horse.readyForEv),
    },
    evDecisionContext,
    modelVersion: PREDICTION_SNAPSHOT_MODEL_VERSION,
    horseHistoriesByHorseId: Object.fromEntries(
      runners.map((runner) => [runner.horseId, historyConnection.historiesByHorseId[runner.horseId] ?? []]),
    ),
  };
}

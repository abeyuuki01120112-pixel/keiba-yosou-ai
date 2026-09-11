/**
 * Formal Prediction Snapshot（CHECKPOINT13.5B〜、既存・凍結）から、STEP5
 * （finalRaceAbility）・STEP6（Plackett-Luce勝率）までを追加算出する
 * Integration Layerの別経路（PRE-WINDOWS INTEGRATION + UI V0、PHASE C/D）。
 *
 * `predictionPipeline.ts`のCollector経由の経路と異なり、こちらは既に
 * Stage A（Base Ability V1・Suitability V1・effectiveAbility）が確定・
 * 永続化済みのFormal Snapshot（`predictionSnapshotStore.ts`、immutable）を
 * そのまま入力に使う。Stage Aの再計算は一切行わない
 * （`buildFormalPredictionSnapshotRecord()`が既に確定した値をそのまま使う）。
 *
 * 既存production関数（`computeFinalRaceAbility`・`computeOutcomeProbabilitiesRaw`・
 * `getHorseRecentRaces`）は一切変更しない。
 */

import { assertPredictionCutoff } from "../ability/predictionBoundary";
import { getHorseRecentRacesAsOf, getProductionDatasetVersionInfo } from "../ability/horseAbilityData";
import { computeFinalRaceAbility } from "../ability/finalRaceAbility";
import { computeOutcomeProbabilitiesRaw } from "../ability/outcomeProbability";
import { roundToOneDecimal } from "../ability/raceScore";
import { GOING_UNKNOWN_SENTINEL } from "../ability/predictionSnapshot";
import { selectOddsSnapshotsAsOf, type OddsSnapshotEntry } from "../ability/oddsSnapshot";
import type { FormalPredictionSnapshotRecord } from "../ability/import/formalPredictionSnapshot";

/**
 * `FormalPredictionSnapshotRecord`（`raceCardInput`含む）はraceName（レース名）を
 * 一切保持していない——正式なレース名の記録先が現状どこにも無いという実データ上の
 * ギャップである。表示上の識別名が無いよりはましなフォールバックとして
 * 「競馬場+レース番号R」を使うが、これは正式なレース名ではないことを呼び出し側は
 * 認識すること（本当のレース名が必要な場合は呼び出し側で別途上書きすること）。
 */
function fallbackRaceName(record: Pick<FormalPredictionSnapshotRecord, "racecourse" | "raceNumber">): string {
  return `${record.racecourse}${record.raceNumber ?? ""}R`;
}
import type { FinalRaceAbilityResult, RunningStyleDistribution } from "../ability/raceContextTypes";
import type { DerivedHorseResult, DerivedRacePrediction } from "./uiTypes";
import { evaluateFormalPredictionGate, type FormalPredictionGateError } from "./formalPredictionGate";
import { connectWinExpectedValue } from "./expectedValueConnection";
import {
  assessEvDecision,
  buildEvDecisionContext,
  type EvDecisionPolicy,
} from "../strategy/evDecision";

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

export function runPredictionPipelineFromFormalSnapshot(
  record: FormalPredictionSnapshotRecord,
  options: {
    odds?: readonly OddsSnapshotEntry[] | null;
    evDecisionPolicy?: EvDecisionPolicy;
  } = {},
): DerivedRacePrediction {
  const boundaryTarget = { raceId: record.raceId, raceDate: record.raceDate, postTimeIso: record.scheduledStartTime };
  assertPredictionCutoff(record.predictionCutoffAt, boundaryTarget);
  const globalErrors: FormalPredictionGateError[] = [];
  if (record.formal !== true) {
    globalErrors.push({ code: "NOT_A_FORMAL_SNAPSHOT", message: "正式Snapshotではありません。" });
  }
  if (record.totalRunners !== record.runners.length || record.runners.length === 0 ||
      new Set(record.runners.map((r) => r.horseId)).size !== record.runners.length) {
    globalErrors.push({ code: "INCOMPLETE_RUNNER_SET", message: "保存された出走馬集合が不完全です。" });
  }
  if (record.datasetVersion.datasetFingerprint !== getProductionDatasetVersionInfo().datasetFingerprint) {
    globalErrors.push({ code: "SNAPSHOT_DATASET_MISMATCH", message: "保存Snapshotとproduction datasetが一致しません。" });
  }
  const suitabilityTarget = {
    racecourse: record.racecourse,
    surface: record.surface,
    distance: record.distance,
    going: record.going.evaluated && record.going.going !== null ? record.going.going : GOING_UNKNOWN_SENTINEL,
  };
  const raceContextTarget = { raceId: record.raceId, raceDate: record.raceDate, raceNumber: record.raceNumber };

  const declaredRunners = record.runners.filter((r) => !r.scratched);
  const priorHistoriesByHorseId: Record<string, ReturnType<typeof getHorseRecentRacesAsOf>> = {};
  for (const r of record.runners) {
    priorHistoriesByHorseId[r.horseId] = getHorseRecentRacesAsOf(r.horseId, boundaryTarget, record.predictionCutoffAt).filter(
      (p) => p.dataKind == null || p.dataKind === "real",
    );
  }

  const gate = evaluateFormalPredictionGate(record.runners.map((runner) => {
    const historyCount = priorHistoriesByHorseId[runner.horseId]?.length ?? 0;
    return {
      horseId: runner.horseId,
      horseName: runner.horseName,
      horseNumber: runner.horseNumber,
      explicitlyExcluded: runner.scratched,
      canonicalHorseIdResolved: Boolean(runner.horseId),
      runnerInputComplete: Boolean(runner.horseName) && Number.isInteger(runner.horseNumber) &&
        Number.isInteger(runner.frame) && Number.isFinite(runner.assignedWeight),
      cutoffSatisfied: true,
      hasHorseHistory: historyCount >= (runner.abilityEvidenceCount ?? 1),
      baseAbilityAvailable: runner.baseAbility !== null && Number.isFinite(runner.baseAbility),
      existingPredictionEligible: runner.predictionEligible,
      existingEligibilityReasons: runner.predictionEligible ? [] : ["savedSnapshotPredictionIneligible"],
      historyErrors: [],
    };
  }), globalErrors);
  const activeRunners = gate.formal ? declaredRunners : [];
  const evDecisionContext = buildEvDecisionContext(options.evDecisionPolicy);
  const oddsInput = options.odds === undefined ? (record.odds ?? null) : options.odds;
  const oddsSelection = selectOddsSnapshotsAsOf({
    raceId: record.raceId,
    predictionCutoffAt: record.predictionCutoffAt,
    canonicalHorseIds: new Set(record.runners.map((runner) => runner.horseId)),
    requiredWinHorseIds: declaredRunners.map((runner) => runner.horseId),
    snapshots: oddsInput ?? [],
  });

  function computeOnce(
    r: (typeof activeRunners)[number],
    fieldDistributions: RunningStyleDistribution[],
  ): FinalRaceAbilityResult {
    return computeFinalRaceAbility({
      baseAbility: r.baseAbility as number,
      horseId: r.horseId,
      recentRaces: priorHistoriesByHorseId[r.horseId] ?? [],
      suitabilityTarget,
      gate: { horseNumber: r.horseNumber, fieldSize: record.totalRunners, frame: r.frame },
      raceContextTarget,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldDistributions,
      manualTrackBias: null,
      autoTrackBias: null,
    });
  }

  const pass1 = new Map(activeRunners.map((r) => [r.horseId, computeOnce(r, [])]));
  const fieldDistributions = [...pass1.values()].map((r) => r.autoRunningStyle.distribution);
  const finalResults = new Map(activeRunners.map((r) => [r.horseId, computeOnce(r, fieldDistributions)]));

  const strengthEntries = [...finalResults.entries()].map(([horseId, r]) => ({ id: horseId, finalRaceAbility: r.finalRaceAbility }));
  const probabilities = gate.formal ? computeOutcomeProbabilitiesRaw(strengthEntries) : [];
  const probabilityByHorseId = new Map(probabilities.map((p) => [p.id, p]));
  const winOddsByHorseId = new Map(Object.entries(oddsSelection.winByHorseId));

  const finalRaceAbilityRanks = computeDescendingRanks(
    record.runners.map((r) => finalResults.get(r.horseId)?.finalRaceAbility ?? null),
  );

  const horses: DerivedHorseResult[] = record.runners.map((r, i) => {
    const finalResult = finalResults.get(r.horseId) ?? null;
    const prob = probabilityByHorseId.get(r.horseId) ?? null;
    const winOddsSnapshot = winOddsByHorseId.get(r.horseId) ?? null;
    const ev = connectWinExpectedValue({
      formalPredictionReady: gate.formalPredictionReady,
      raceId: record.raceId,
      horseId: r.horseId,
      winProbabilityPercent: prob?.winProbability ?? null,
      winOddsSnapshot,
    });
    const evDecision = assessEvDecision({
      expectedValue: ev.expectedValue,
      readyForEv: ev.readyForEv,
      policy: evDecisionContext.policy,
    });
    return {
      horseId: r.horseId,
      horseName: r.horseName,
      horseNumber: r.horseNumber,
      gate: r.frame,
      scratched: r.scratched,
      baseAbility: r.baseAbility,
      overallSuitabilityPercent: r.overallSuitabilityPercent,
      distanceSuitability: r.distanceSuitability,
      courseSuitability: r.courseSuitability,
      goingSuitability: r.goingSuitability,
      gateSuitability: r.gateSuitability,
      effectiveAbility: r.effectiveAbility,
      finalRaceAbility: finalResult?.finalRaceAbility ?? null,
      rankByEffectiveAbility: r.rankByEffectiveAbility,
      rankByFinalRaceAbility: finalRaceAbilityRanks[i],
      winProbability: prob ? roundToOneDecimal(prob.winProbability) : null,
      top2Probability: prob ? roundToOneDecimal(prob.top2Probability) : null,
      top3Probability: prob ? roundToOneDecimal(prob.top3Probability) : null,
      winOdds: winOddsSnapshot?.odds ?? null,
      winOddsSnapshot,
      ...ev,
      evDecision,
      predictionCutoffAt: record.predictionCutoffAt,
      confidence: r.overallConfidence,
      warnings: r.warnings,
      actualFinishPosition: null,
      ev: null,
    };
  });

  return {
    race: {
      raceId: record.raceId,
      raceDate: record.raceDate,
      racecourse: record.racecourse,
      raceNumber: record.raceNumber,
      raceName: fallbackRaceName(record),
      surface: record.surface,
      distance: record.distance,
      going: record.going.evaluated ? (record.going.going ?? "unknown") : "unknown",
      courseLayout: null,
      courseVariant: null,
    },
    generatedAt: record.generatedAt,
    modelVersion: record.modelVersion,
    predictionStage: record.stage === "t2h" ? "STAGE_B" : "STAGE_A",
    predictionSource: "FORMAL_SNAPSHOT_PIPELINE",
    raceStartAt: record.scheduledStartTime,
    predictionCutoffAt: record.predictionCutoffAt,
    formalPredictionReady: gate.formalPredictionReady,
    gate,
    odds: oddsInput == null ? null : oddsSelection.selected,
    oddsStatus: {
      market: "win",
      winOddsComplete: oddsSelection.winOddsComplete,
      missingHorseIds: oddsSelection.missingWinOddsHorseIds,
      diagnostics: oddsSelection.diagnostics,
      readyForEv: gate.formalPredictionReady && horses
        .filter((horse) => !horse.scratched)
        .every((horse) => horse.readyForEv),
    },
    evDecisionContext,
    predicted: gate.formal,
    hasResult: false,
    horses,
    priorHistoriesByHorseId,
  };
}

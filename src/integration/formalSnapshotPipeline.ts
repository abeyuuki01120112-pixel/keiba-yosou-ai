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

import { getHorseRecentRaces } from "../ability/horseAbilityData";
import { computeFinalRaceAbility } from "../ability/finalRaceAbility";
import { computeOutcomeProbabilitiesRaw } from "../ability/outcomeProbability";
import { roundToOneDecimal } from "../ability/raceScore";
import { GOING_UNKNOWN_SENTINEL } from "../ability/predictionSnapshot";
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

export function runPredictionPipelineFromFormalSnapshot(record: FormalPredictionSnapshotRecord): DerivedRacePrediction {
  const cutoffMs = Date.parse(record.predictionCutoffAt);
  const suitabilityTarget = {
    racecourse: record.racecourse,
    surface: record.surface,
    distance: record.distance,
    going: record.going.evaluated && record.going.going !== null ? record.going.going : GOING_UNKNOWN_SENTINEL,
  };
  const raceContextTarget = { raceId: record.raceId, raceDate: record.raceDate, raceNumber: record.raceNumber };

  const activeRunners = record.runners.filter((r) => !r.scratched && r.baseAbility !== null);
  const priorHistoriesByHorseId: Record<string, ReturnType<typeof getHorseRecentRaces>> = {};
  for (const r of record.runners) {
    priorHistoriesByHorseId[r.horseId] = getHorseRecentRaces(r.horseId).filter(
      (p) => (p.dataKind == null || p.dataKind === "real") && Date.parse(p.raceDate) < cutoffMs,
    );
  }

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
  const probabilities = computeOutcomeProbabilitiesRaw(strengthEntries);
  const probabilityByHorseId = new Map(probabilities.map((p) => [p.id, p]));

  const finalRaceAbilityRanks = computeDescendingRanks(
    record.runners.map((r) => finalResults.get(r.horseId)?.finalRaceAbility ?? null),
  );

  const horses: DerivedHorseResult[] = record.runners.map((r, i) => {
    const finalResult = finalResults.get(r.horseId) ?? null;
    const prob = probabilityByHorseId.get(r.horseId) ?? null;
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
      confidence: r.overallConfidence,
      warnings: r.warnings,
      actualFinishPosition: null,
      winOdds: null,
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
    predicted: horses.some((h) => h.finalRaceAbility !== null),
    hasResult: false,
    horses,
    priorHistoriesByHorseId,
  };
}

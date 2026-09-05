/**
 * Research Integration Layer（PRE-WINDOWS INTEGRATION + UI V0、PHASE C）。
 *
 * Collector V0が生成した`CollectedRunnerRow[]`（normalized）を、既存の
 * 凍結済みPrediction Logic（Base Ability V1・Suitability V1・Stage A・
 * finalRaceAbility・Plackett-Luce勝率）へ安全に接続する。
 *
 * 【絶対原則】既存production関数（`buildGateConfirmedSnapshot`・
 * `buildAbilityBoard`・`computeFinalRaceAbility`・
 * `computeOutcomeProbabilitiesRaw`）は一切書き換えない。すべて既存のまま
 * importして呼び出すだけの統合レイヤーである。Base Ability V1・
 * Suitability V1・memberLevel・final3F・finalRaceAbility・Plackett-Luce・
 * Temperature・各種weight/parameterはこのファイルでは一切変更していない。
 *
 * 【重要な技術的事実】`buildGateConfirmedSnapshot`（`predictionSnapshot.ts`）は
 * 内部で`getHorseRecentRaces()`を直接呼び出しており、Collectorが取得した
 * `priorHistories`引数を経由しない（既存の凍結済み設計）。そのため
 * Base Ability/Suitability/Stage Aの結果は、常にproduction `data/horses/`
 * 側の実データ状況をそのまま反映する——Collectorが別のraw sourceから
 * runnerを取得しても、その馬がproduction側に無ければbaseAbility=null
 * （データ不足）のままになる。これは仕様であり、バグではない
 * （Ability Model V1が「対象レース出走馬だけを抜き出してBase Abilityを
 * 再計算することを禁止」しているため）。
 *
 * finalRaceAbility（STEP5）・勝率（STEP6）はStage Aのように内部で
 * 自動的にprior historyを取得する経路が無いため、Collectorの
 * `priorHistories`をそのまま入力として使う。
 */

import {
  buildGateConfirmedSnapshot,
  buildAbilityBoard,
  GOING_UNKNOWN_SENTINEL,
  PREDICTION_SNAPSHOT_MODEL_VERSION,
} from "../ability/predictionSnapshot";
import type { RaceEntryInput, SnapshotRaceTarget, SnapshotGoingInput, AbilityBoardRow } from "../ability/predictionSnapshot";
import { computeFinalRaceAbility } from "../ability/finalRaceAbility";
import { computeOutcomeProbabilitiesRaw } from "../ability/outcomeProbability";
import { roundToOneDecimal } from "../ability/raceScore";
import type { FinalRaceAbilityResult, RunningStyleDistribution } from "../ability/raceContextTypes";
import type { CollectedRaceIdentity, CollectedRunnerRow, PriorHistoryEntry } from "../collector/types";

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
  confidence: AbilityBoardRow["overallConfidence"];
  warnings: string[];
}

export interface PredictionPipelineResult {
  race: CollectedRaceIdentity;
  horses: PredictionPipelineHorseResult[];
  generatedAt: string;
  modelVersion: string;
}

export interface RunPredictionPipelineOptions {
  /**
   * 未指定時は対象レースに記録されているgoingをそのまま使う（過去レースの
   * 回顧・研究用途）。将来ライブ予測（レース前）に転用する場合は、
   * 呼び出し側で`{ evaluated: false }`を明示的に渡すこと
   * （馬場未確定時に推測で埋めないための既存の安全設計、predictionSnapshot.ts）。
   */
  going?: SnapshotGoingInput;
  generatedAt?: string;
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
  options: RunPredictionPipelineOptions = {},
): PredictionPipelineResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const going: SnapshotGoingInput = options.going ?? { evaluated: true, going: raceIdentity.going };

  const raceTarget: SnapshotRaceTarget = {
    raceId: raceIdentity.raceId,
    raceName: raceIdentity.raceName,
    raceDate: raceIdentity.raceDate,
    racecourse: raceIdentity.racecourse,
    surface: raceIdentity.surface,
    distance: raceIdentity.distance,
    // V0: 正確な発走時刻データをCollectorがまだ保持していないための代替値。
    // buildGateConfirmedSnapshot（Stage A）はpostTimeIsoを使わない（T2h Snapshot専用のため無関係）。
    postTimeIso: `${raceIdentity.raceDate}T00:00:00.000Z`,
    raceNumber: raceIdentity.raceNumber,
  };

  const entries: RaceEntryInput[] = runners.map((r) => ({
    horseId: r.horseId,
    horseName: r.horseName,
    frame: r.gate,
    horseNumber: r.horseNumber,
    carriedWeight: r.carriedWeightKg,
    scratched: r.finishPosition == null,
  }));

  // STEP1-4: Base Ability V1・Suitability V1・Stage A（既存predictionSnapshot.tsをそのまま呼び出す）
  const snapshot = buildGateConfirmedSnapshot({ raceTarget, entries, going, generatedAt });
  const abilityBoard = buildAbilityBoard(snapshot);

  const priorHistoryByHorseId = new Map(priorHistories.map((p) => [p.horseId, p]));
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

  const activeRows = abilityBoard.filter((row) => !row.scratched && row.baseAbility !== null);

  function computeOnce(row: AbilityBoardRow, fieldDistributions: RunningStyleDistribution[]): FinalRaceAbilityResult {
    const priorHistory = priorHistoryByHorseId.get(row.horseId);
    const recentRaces = priorHistory?.status === "available" ? priorHistory.races : [];
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
  const probabilities = computeOutcomeProbabilitiesRaw(strengthEntries);
  const probabilityByHorseId = new Map(probabilities.map((p) => [p.id, p]));

  const finalRaceAbilityRanks = computeDescendingRanks(
    abilityBoard.map((row) => finalResults.get(row.horseId)?.finalRaceAbility ?? null),
  );

  const horses: PredictionPipelineHorseResult[] = abilityBoard.map((row, i) => {
    const finalResult = finalResults.get(row.horseId) ?? null;
    const prob = probabilityByHorseId.get(row.horseId) ?? null;
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
      confidence: row.overallConfidence,
      warnings: row.warnings,
    };
  });

  return { race: raceIdentity, horses, generatedAt, modelVersion: PREDICTION_SNAPSHOT_MODEL_VERSION };
}

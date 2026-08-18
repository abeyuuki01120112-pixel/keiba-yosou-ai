/**
 * finalRaceAbility（STEP5・第23実装、STEP5.1・第24実装で脚質推定を強化）の統合オーケストレーター。
 *
 *   baseAbility（STEP1、絶対能力）
 *     × suitability（STEP4、馬固有の条件適性）        → effectiveAbility
 *     × raceContextFactor（STEP5、今回の展開・馬場）  → finalRaceAbility
 *
 * baseAbility.ts / raceScore.ts / suitability.ts の既存計算式は一切変更しない。
 * STEP5は完全な追加レイヤーとして、effectiveAbility確定後にのみ作用する。
 *
 * runningStyleの解決優先順位（STEP5.1）:
 *   manualRunningStyle > passingPositionRunningStyle > fallbackAutoRunningStyle
 * 通過順位データが無い/信頼できない馬は常にfallbackAutoRunningStyleが選ばれるため、
 * STEP5 V1時点の挙動は変わらない。
 */

import { roundToOneDecimal } from "./raceScore";
import { computeAutoRunningStyle, resolveAutoRunningStyle, resolveRunningStyle } from "./runningStyle";
import { computePassingPositionRunningStyle } from "./passingPositionRunningStyle";
import { classifyPredictedPace } from "./predictedPace";
import { computePaceScenarioFactor } from "./paceScenarioFactor";
import { resolveTrackBias } from "./trackBias";
import { computeTrackBiasFactor } from "./trackBiasFactor";
import { computeRaceContextFactor } from "./raceContextFactor";
import { computeSuitabilityBreakdown } from "./suitability";
import type { RacePerformance } from "./types";
import type { SuitabilityTargetRaceContext } from "./suitabilityTypes";
import type {
  FinalRaceAbilityResult,
  RaceContextTargetInfo,
  RunningStyleDistribution,
  RunningStyleProfile,
  TrackBiasObservation,
} from "./raceContextTypes";

export interface FinalRaceAbilityInput {
  baseAbility: number;
  /** baseAbility/suitabilityと同じ、対象馬自身の直近5走（新しい順） */
  recentRaces: RacePerformance[];
  /** STEP4: 対象レースの距離・馬場状態・競馬場条件 */
  suitabilityTarget: SuitabilityTargetRaceContext;
  /** STEP5のfuture leakage判定に使う、対象レースの識別情報 */
  raceContextTarget: RaceContextTargetInfo;
  /** 人間/ウマプロ入力の脚質情報。無ければnull（自動推定にフォールバック） */
  manualRunningStyle: RunningStyleProfile | null;
  /** 想定ペース算出に使う、出走予定メンバー全体の脚質分布（呼び出し側が用意する） */
  fieldRunningStyleDistributions: RunningStyleDistribution[];
  /** 人間/ウマプロ入力のtrackBias観測。無ければnull */
  manualTrackBias: TrackBiasObservation | null;
  /** 自動計算のtrackBias観測（V1では未実装のため常にnullを渡す想定） */
  autoTrackBias: TrackBiasObservation | null;
}

export function computeFinalRaceAbility(input: FinalRaceAbilityInput): FinalRaceAbilityResult {
  // future leakage対策の安全網: recentRacesに対象レース自身が紛れ込んでいても必ず除外する
  // （本来recentRaces自体が「対象レースより前の確定走」だけを持つ前提だが、二重に防御する）
  const priorRaces = input.recentRaces.filter((r) => r.raceId !== input.raceContextTarget.raceId);

  const suitability = computeSuitabilityBreakdown(priorRaces, input.suitabilityTarget);
  const effectiveAbility = roundToOneDecimal((input.baseAbility * suitability.overallSuitability) / 100);

  const fallbackAutoRunningStyle = computeAutoRunningStyle(priorRaces);
  const passingPositionRunningStyle = computePassingPositionRunningStyle(priorRaces);
  const autoRunningStyle = resolveAutoRunningStyle(passingPositionRunningStyle, fallbackAutoRunningStyle);
  const { actuallyUsed: runningStyle, usedSource: runningStyleUsedSource } = resolveRunningStyle(
    autoRunningStyle,
    input.manualRunningStyle,
  );

  const predictedPace = classifyPredictedPace(input.fieldRunningStyleDistributions);
  const paceScenarioFactor = computePaceScenarioFactor(runningStyle, runningStyleUsedSource, predictedPace);

  const { actuallyUsed: trackBiasObservation, usedSource: trackBiasUsedSource } = resolveTrackBias(
    input.manualTrackBias,
    input.autoTrackBias,
    input.raceContextTarget,
  );
  const trackBiasFactor = computeTrackBiasFactor(runningStyle, trackBiasObservation, trackBiasUsedSource);

  const raceContext = computeRaceContextFactor(paceScenarioFactor, trackBiasFactor);
  const finalRaceAbility = roundToOneDecimal((effectiveAbility * raceContext.value) / 100);

  return {
    baseAbility: input.baseAbility,
    suitability,
    effectiveAbility,
    manualRunningStyle: input.manualRunningStyle,
    passingPositionRunningStyle,
    fallbackAutoRunningStyle,
    autoRunningStyle,
    autoRunningStyleSource: autoRunningStyle.source,
    runningStyle,
    runningStyleUsedSource,
    validPassingPositionSampleCount: passingPositionRunningStyle?.sampleCount ?? 0,
    predictedPace,
    raceContext,
    finalRaceAbility,
  };
}

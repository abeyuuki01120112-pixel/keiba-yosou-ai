/**
 * paceScenarioFactor（STEP5・第23実装）。
 * 対象馬の脚質（actuallyUsedのrunningStyle）と想定ペースの相性を、
 * 100%を中心に95〜105%の範囲で数値化する。
 *
 *   raw = 100 + PACE_SCENARIO_AMPLITUDE(5) × paceLevelScore × runningStyleLeanScore
 *
 * paceLevelScore: slow=-1 / average=0 / high=+1
 * runningStyleLeanScore: -1(nige寄り) 〜 +1(oikomi寄り)
 * → 両者ともに|値|<=1なので、rawは算出式自体によって95〜105に収まる。
 *
 * confidenceが低い場合は、STEP4のconfidence処理（Design-2縮小）と同じ方式で
 * 100%側へ縮小する。overall統合と同様、二重に重み付けはしない。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { runningStyleLeanScore } from "./runningStyle";
import { shrinkTowardCenter, SUITABILITY_CENTER } from "./suitabilityConfidence";
import type { PaceScenarioFactor, PredictedPace, RunningStyleProfile } from "./raceContextTypes";

export const PACE_SCENARIO_CLAMP_MIN = 95;
export const PACE_SCENARIO_CLAMP_MAX = 105;
export const PACE_SCENARIO_AMPLITUDE = 5;

const PACE_LEVEL_SCORE: Record<PredictedPace["level"], number> = { slow: -1, average: 0, high: 1 };

export function computePaceScenarioFactor(
  runningStyle: RunningStyleProfile,
  usedRunningStyleSource: "manual" | "auto",
  predictedPace: PredictedPace,
): PaceScenarioFactor {
  const leanScore = runningStyleLeanScore(runningStyle.distribution);
  const paceLevelScore = PACE_LEVEL_SCORE[predictedPace.level];

  const raw = clamp(
    roundToOneDecimal(SUITABILITY_CENTER + PACE_SCENARIO_AMPLITUDE * paceLevelScore * leanScore),
    PACE_SCENARIO_CLAMP_MIN,
    PACE_SCENARIO_CLAMP_MAX,
  );

  const adjusted = clamp(
    roundToOneDecimal(shrinkTowardCenter(raw, runningStyle.confidence)),
    PACE_SCENARIO_CLAMP_MIN,
    PACE_SCENARIO_CLAMP_MAX,
  );

  const reason =
    predictedPace.level === "average"
      ? "想定ペースが平均のため、脚質による有利不利はほぼ無い（中立100%付近）。"
      : `想定ペース(${predictedPace.level})と脚質傾向(leanScore=${roundToOneDecimal(leanScore)})の相性からraw=${raw}%。confidence(${runningStyle.confidence})で縮小しadjusted=${adjusted}%。`;

  return {
    raw,
    adjusted,
    confidence: runningStyle.confidence,
    usedRunningStyleSource,
    predictedPace: predictedPace.level,
    reason,
  };
}

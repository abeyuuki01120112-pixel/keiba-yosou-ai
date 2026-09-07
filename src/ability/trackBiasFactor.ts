/**
 * trackBiasFactor（STEP5・第23実装）。
 * 対象馬の脚質（actuallyUsedのrunningStyle）とtrackBias観測(frontBackBias)の相性を、
 * 100%を中心に95〜105%の範囲で数値化する。
 *
 *   raw = 100 + TRACK_BIAS_AMPLITUDE(5) × frontBackBiasScore × runningStyleLeanScore
 *
 * frontBackBiasScore: front=-1 / neutral=0 / closer=+1
 * runningStyleLeanScore: -1(nige寄り) 〜 +1(oikomi寄り)
 *
 * insideOutsideBiasは型として保持するが、枠番データが現状のRacePerformanceに
 * 無いため、V1のfactor算出には使わない（将来、枠番データを取り込んだ時点で拡張する）。
 *
 * trackBias観測が無い場合（manual・auto双方null）はneutral（factor=100・confidence=low）。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { runningStyleLeanScore } from "./runningStyle";
import { shrinkTowardCenter, SUITABILITY_CENTER } from "./suitabilityConfidence";
import type { FrontBackBias, RunningStyleProfile, TrackBiasFactor, TrackBiasObservation } from "./raceContextTypes";

export const TRACK_BIAS_CLAMP_MIN = 95;
export const TRACK_BIAS_CLAMP_MAX = 105;
export const TRACK_BIAS_AMPLITUDE = 5;

const FRONT_BACK_BIAS_SCORE: Record<FrontBackBias, number> = { front: -1, neutral: 0, closer: 1 };

export function computeTrackBiasFactor(
  runningStyle: RunningStyleProfile,
  observation: TrackBiasObservation | null,
  usedSource: "manual" | "auto" | "neutral",
): TrackBiasFactor {
  if (observation === null) {
    return {
      raw: SUITABILITY_CENTER,
      adjusted: SUITABILITY_CENTER,
      confidence: "low",
      usedSource: "neutral",
      reason: "trackBiasの観測情報（人間入力/自動計算とも）が無いため、中立100%とした。",
    };
  }

  const leanScore = runningStyleLeanScore(runningStyle.distribution);
  const biasScore = FRONT_BACK_BIAS_SCORE[observation.frontBackBias];

  const raw = clamp(
    roundToOneDecimal(SUITABILITY_CENTER + TRACK_BIAS_AMPLITUDE * biasScore * leanScore),
    TRACK_BIAS_CLAMP_MIN,
    TRACK_BIAS_CLAMP_MAX,
  );

  const adjusted = clamp(
    roundToOneDecimal(shrinkTowardCenter(raw, observation.confidence)),
    TRACK_BIAS_CLAMP_MIN,
    TRACK_BIAS_CLAMP_MAX,
  );

  const reason =
    observation.frontBackBias === "neutral"
      ? "trackBias観測が中立のため、脚質による有利不利はほぼ無い（中立100%付近）。"
      : `trackBias観測(${observation.frontBackBias})と脚質傾向(leanScore=${roundToOneDecimal(leanScore)})の相性からraw=${raw}%。confidence(${observation.confidence})で縮小しadjusted=${adjusted}%。`;

  return { raw, adjusted, confidence: observation.confidence, usedSource, reason };
}

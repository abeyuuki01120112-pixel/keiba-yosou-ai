/**
 * 1走スコア（raceScore）の計算。
 * 実質メンバーレベル30% / タイム差25% / 走破タイム25% / 上がり3F15% / 斤量補正5%
 */

import { clamp } from "../simulation/probability";
import type { RacePerformance } from "./types";

export const RACE_SCORE_WEIGHTS = {
  memberLevel: 0.3,
  timeGap: 0.25,
  raceTime: 0.25,
  final3F: 0.15,
  weight: 0.05,
} as const;

/** 小数第1位に丸める */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 5項目のスコア（memberLevelScoreAtRace, timeGapScore, raceTimeScore, final3FScore, weightScore）
 * から1走スコアを算出する。0〜100にclampし、小数第1位に丸める。
 */
export function calculateRaceScore(
  performance: Pick<
    RacePerformance,
    "memberLevelScoreAtRace" | "timeGapScore" | "raceTimeScore" | "final3FScore" | "weightScore"
  >,
): number {
  const raw =
    performance.memberLevelScoreAtRace * RACE_SCORE_WEIGHTS.memberLevel +
    performance.timeGapScore * RACE_SCORE_WEIGHTS.timeGap +
    performance.raceTimeScore * RACE_SCORE_WEIGHTS.raceTime +
    performance.final3FScore * RACE_SCORE_WEIGHTS.final3F +
    performance.weightScore * RACE_SCORE_WEIGHTS.weight;

  return roundToOneDecimal(clamp(raw, 0, 100));
}

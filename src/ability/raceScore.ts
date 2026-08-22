/**
 * 1走スコア（raceScore）の計算。
 * 実質メンバーレベル30% / タイム差25% / 走破タイム25% / 上がり3F15% / 斤量補正5%
 *
 * Ability Model V1として2026-08-22に正式確定・凍結（docs/ability-model-v1.md）。
 *
 * TODO（docs/prediction-philosophy.md 思想4・docs/step6-decisions.md 衝突点2）:
 * 上記5項目は独立加重平均（線形結合）であり、「着差×相手レベル×レース内容」のような
 * 項目間の掛け算的な文脈評価（例: 相手レベルが低い時は着差の価値を割り引く）にはなって
 * いない。この差分は現時点では変更しない。将来の検討事項として記録のみ行う。
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

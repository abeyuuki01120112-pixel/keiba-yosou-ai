/**
 * 斤量補正スコア（weightScore）の計算。
 *
 * 「56kgなら70点」のような固定点数方式は使わない。
 * その馬が背負った斤量差を、距離に応じた「秒」へ換算して評価する。
 * 重い斤量を背負って走った馬ほど高評価、軽斤量ほど低評価とするが、
 * raceScore全体の5%でしかないため、斤量だけで能力順位が大きく逆転しない
 * よう連続関数（tanh）で評価を鈍化させる。
 */

import { clamp, median } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import type { WeightBreakdown } from "./types";

/** 2000mでの1kgあたり秒換算（V0暫定値。1kg ≒ 約1馬身 ≒ 約0.2秒を基準とする） */
export const BASE_SECONDS_PER_KG_AT_2000M = 0.2;
/** BASE_SECONDS_PER_KG_AT_2000M の基準距離（メートル） */
export const REFERENCE_DISTANCE = 2000;

/** weightAdjustmentSeconds=0（中央値どおりの斤量）のときのスコア */
export const WEIGHT_SCORE_CENTER = 70;
/** 飽和時にCENTERへ加算/減算される最大幅（理論上限のみで実際には到達しない） */
export const WEIGHT_SCORE_AMPLITUDE = 25;
/** カーブの伸び方を決めるスケール（秒） */
export const WEIGHT_SCORE_SCALE = 1.2;

/** 距離に応じた1kgあたりの秒換算。距離が長いほど斤量の影響が大きくなる */
export function calculateSecondsPerKg(distance: number): number {
  return BASE_SECONDS_PER_KG_AT_2000M * (distance / REFERENCE_DISTANCE);
}

/**
 * 出走馬の斤量一覧からレース斤量中央値を求める。
 * 有効な斤量（正の有限値）が1つも無い場合はnull。
 */
export function calculateRaceMedianWeight(carriedWeights: number[]): number | null {
  const valid = carriedWeights.filter((w) => Number.isFinite(w) && w > 0);
  if (valid.length === 0) return null;
  return median(valid);
}

export function calculateWeightScore(weightAdjustmentSeconds: number): number {
  const raw =
    WEIGHT_SCORE_CENTER + WEIGHT_SCORE_AMPLITUDE * Math.tanh(weightAdjustmentSeconds / WEIGHT_SCORE_SCALE);
  return roundToOneDecimal(clamp(raw, 0, 100));
}

/**
 * 1頭分の斤量評価を組み立てる。
 * raceMedianWeightKgがnull（出走馬全頭の斤量が不足）の場合は、
 * 中立値（weightScore=70・weightAdjustmentSeconds=0）に安全にフォールバックする。
 */
export function buildWeightEvaluation(
  horseCarriedWeightKg: number,
  raceMedianWeightKg: number | null,
  distance: number,
): { weightScore: number; breakdown: WeightBreakdown } {
  const secondsPerKg = calculateSecondsPerKg(distance);

  if (raceMedianWeightKg === null) {
    return {
      weightScore: WEIGHT_SCORE_CENTER,
      breakdown: {
        horseCarriedWeightKg,
        raceMedianWeightKg: horseCarriedWeightKg,
        weightDiffKg: 0,
        distance,
        secondsPerKg,
        weightAdjustmentSeconds: 0,
        isReliable: false,
      },
    };
  }

  const weightDiffKg = roundToOneDecimal(horseCarriedWeightKg - raceMedianWeightKg);
  const weightAdjustmentSeconds = roundToOneDecimal(weightDiffKg * secondsPerKg);

  return {
    weightScore: calculateWeightScore(weightAdjustmentSeconds),
    breakdown: {
      horseCarriedWeightKg,
      raceMedianWeightKg,
      weightDiffKg,
      distance,
      secondsPerKg,
      weightAdjustmentSeconds,
      isReliable: true,
    },
  };
}

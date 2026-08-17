/**
 * 上がり3Fスコア（final3FScore）の計算。
 *
 * 「上がり1位だから高得点」のような順位評価は使わない。
 * レース内相対評価（そのレースの上がり中央値との差）と、
 * 絶対評価（5年基準＋当日上がり補正との差）を60/40で組み合わせ、
 * 連続関数で0〜100点へ変換する。
 *
 * V0の目安（暫定値。実データを見ながらこのファイルの定数だけ調整すればよい）：
 *   非常に優秀 → 85〜90台
 *   優秀       → 78〜84
 *   標準       → 68〜72（中央値70前後）
 *   やや低い   → 60台
 *   低い       → 50以下
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";

/** レース内相対評価の重み */
export const RELATIVE_WEIGHT = 0.6;
/** 5年基準＋当日補正による絶対評価の重み */
export const ABSOLUTE_WEIGHT = 0.4;

/** final3FValue=0秒のときのスコア */
export const FINAL3F_SCORE_CENTER = 70;
/** 飽和時にCENTERへ加算/減算される最大幅（理論上限のみで実際には到達しない） */
export const FINAL3F_SCORE_AMPLITUDE = 25;
/** カーブの伸び方を決めるスケール（秒） */
export const FINAL3F_SCORE_SCALE = 1.2;

/**
 * レース内相対評価（relativeDiffSeconds）と絶対評価（absoluteDiffSeconds）を60/40で合成する。
 * absoluteDiffSecondsがnull（5年基準タイムが無い条件）の場合は、相対評価100%にフォールバックする。
 */
export function combineFinal3FValue(
  relativeDiffSeconds: number,
  absoluteDiffSeconds: number | null,
): number {
  if (absoluteDiffSeconds === null) {
    return relativeDiffSeconds;
  }
  return relativeDiffSeconds * RELATIVE_WEIGHT + absoluteDiffSeconds * ABSOLUTE_WEIGHT;
}

export function calculateFinal3FScore(final3FValue: number): number {
  const raw =
    FINAL3F_SCORE_CENTER + FINAL3F_SCORE_AMPLITUDE * Math.tanh(final3FValue / FINAL3F_SCORE_SCALE);
  return roundToOneDecimal(clamp(raw, 0, 100));
}

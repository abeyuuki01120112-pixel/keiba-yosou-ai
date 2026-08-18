/**
 * 上がり3Fスコア（final3FScore）の計算。
 *
 * 「上がり1位だから高得点」のような順位評価は使わない。
 * レース内相対評価（そのレースの上がり中央値との差）と、
 * 絶対評価（5年基準＋当日上がり補正との差）を60/40で組み合わせ、
 * 連続関数で0〜100点へ変換する。
 *
 * 第26実装: absolute側の40%は、baselineのsampleReliabilityWeight（0〜1、
 * sampleCount/MIN_RELIABLE_SAMPLE_COUNTをclampした値。仮データ由来なら0）に応じて
 * 縮小する。低信頼なexact baseline（例: sampleCount=1）を100%信じてしまわないための
 * 措置で、relative 60% / absolute 40%という基本比率自体は変更していない
 * （sampleReliabilityWeight=1.0のときは従来と完全に同じ計算になる）。
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
import { isPlaceholderSource, MIN_RELIABLE_SAMPLE_COUNT } from "./baselineLookup";
import type { CourseFinal3FBaseline } from "./types";

/** レース内相対評価の重み（sampleReliabilityWeight=1.0のときの絶対評価の重みは以下ABSOLUTE_WEIGHT） */
export const RELATIVE_WEIGHT = 0.6;
/** 5年基準＋当日補正による絶対評価の重み（sampleReliabilityWeight=1.0のときに適用される上限） */
export const ABSOLUTE_WEIGHT = 0.4;

/** final3FValue=0秒のときのスコア */
export const FINAL3F_SCORE_CENTER = 70;
/** 飽和時にCENTERへ加算/減算される最大幅（理論上限のみで実際には到達しない） */
export const FINAL3F_SCORE_AMPLITUDE = 25;
/** カーブの伸び方を決めるスケール（秒） */
export const FINAL3F_SCORE_SCALE = 1.2;

/**
 * baselineのsampleCountから、absolute評価に適用する信頼度重み（0〜1）を算出する。
 * V0仮データ由来（isPlaceholderSource）の場合は、sampleCountの値に関わらず0
 * （absolute評価へ一切寄与させない。exactでも仮データを信じない）。
 * MIN_RELIABLE_SAMPLE_COUNT（baselineLookup.tsと共通）以上で1.0（従来どおりフル適用）。
 */
export function computeSampleReliabilityWeight(baseline: CourseFinal3FBaseline): number {
  if (isPlaceholderSource(baseline.source)) return 0;
  return clamp(baseline.sampleCount / MIN_RELIABLE_SAMPLE_COUNT, 0, 1);
}

/** sampleReliabilityWeightを高/中/低の3段階に丸める（score/confidenceを分離して扱うための表示用） */
export function classifyAbsoluteConfidence(sampleReliabilityWeight: number): "high" | "medium" | "low" {
  if (sampleReliabilityWeight >= 1) return "high";
  if (sampleReliabilityWeight >= 0.5) return "medium";
  return "low";
}

/**
 * レース内相対評価（relativeDiffSeconds）と絶対評価（absoluteDiffSeconds）を合成する。
 * absoluteDiffSecondsがnull（5年基準タイムが無い条件）の場合は、相対評価100%にフォールバックする。
 * sampleReliabilityWeight（省略時1.0=従来どおり）に応じて、絶対評価の実効的な重みを
 * ABSOLUTE_WEIGHT×sampleReliabilityWeightへ縮小し、その分をrelative側へ振り戻す
 * （relative+absoluteの合計は常に1.0を維持する）。
 */
export function combineFinal3FValue(
  relativeDiffSeconds: number,
  absoluteDiffSeconds: number | null,
  sampleReliabilityWeight: number = 1,
): number {
  if (absoluteDiffSeconds === null) {
    return relativeDiffSeconds;
  }
  const effectiveAbsoluteWeight = ABSOLUTE_WEIGHT * clamp(sampleReliabilityWeight, 0, 1);
  const effectiveRelativeWeight = 1 - effectiveAbsoluteWeight;
  return relativeDiffSeconds * effectiveRelativeWeight + absoluteDiffSeconds * effectiveAbsoluteWeight;
}

export function calculateFinal3FScore(final3FValue: number): number {
  const raw =
    FINAL3F_SCORE_CENTER + FINAL3F_SCORE_AMPLITUDE * Math.tanh(final3FValue / FINAL3F_SCORE_SCALE);
  return roundToOneDecimal(clamp(raw, 0, 100));
}

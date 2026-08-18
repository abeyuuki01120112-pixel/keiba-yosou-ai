/**
 * stabilityFactor（STEP6・第27実装）: 馬自身の直近成績の「安定性」を表す0〜100点。
 *
 * baseAbility/suitabilityと同じ母集団（直近最大5走、RECENT_RACE_COUNT）のraceScoreを使う。
 * 通常の標準偏差ではなく「下方半偏差（downside semi-deviation）」を使う。
 * 平均を上回る好走（上振れ）は安定性の評価を下げない。平均を下回る凡走（下振れ）だけが
 * 「安定していない」という評価につながる、という考え方をそのまま式にしている。
 *
 * サンプル数が少ない場合（例: 5走中2走しか無い）、stabilityFactor自体をNEUTRAL側へ縮小する
 * （suitabilityのDesign-2縮小と同じ考え方）。ただし「安定しているかどうか分からない」ことを
 * 「能力が低い」と混同しないよう、stabilityConfidenceは別フィールドとして返す。
 */

import { clamp, mean } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { baseConfidenceFromSampleCount, CONFIDENCE_SHRINK_WEIGHTS } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { SuitabilityConfidence } from "./suitabilityTypes";

/** downsideSemiDeviation=0（下振れが一切無い）ときのstabilityFactor */
export const STABILITY_FACTOR_CENTER = 70;
/** downsideSemiDeviationが大きいほどCENTERから減算される最大幅 */
export const STABILITY_FACTOR_AMPLITUDE = 25;
/** カーブの伸び方を決めるスケール（raceScoreの点差） */
export const STABILITY_FACTOR_SCALE = 10;
/** サンプル不足時にshrinkする先の中立値（何走も無い馬を「不安定」と決めつけないための基準点） */
export const STABILITY_FACTOR_NEUTRAL = 65;

export interface StabilityFactorResult {
  /** confidenceに応じてNEUTRAL側へ縮小した後の最終値。0〜100 */
  stabilityFactor: number;
  /** 縮小前の生値 */
  raw: number;
  /** 下方半偏差（raceScore点、丸め済み） */
  downsideSemiDeviation: number;
  /** 算出に使った過去走数（RECENT_RACE_COUNTまで） */
  sampleCount: number;
  stabilityConfidence: SuitabilityConfidence;
}

/**
 * 下方半偏差を算出する。平均を下回るraceScoreの二乗差だけを合計し、
 * 標本サイズ全体（下回った件数だけではない）で割ってからルートを取る、
 * 一般的な semi-deviation の定義に従う。
 */
export function computeDownsideSemiDeviation(raceScores: number[]): number {
  if (raceScores.length === 0) return 0;
  const average = mean(raceScores);
  const squaredDownsideDiffs = raceScores.map((score) => (score < average ? (average - score) ** 2 : 0));
  const semiVariance = mean(squaredDownsideDiffs);
  return Math.sqrt(semiVariance);
}

export function computeStabilityFactor(recentRaces: RacePerformance[]): StabilityFactorResult {
  const races = recentRaces.slice(0, RECENT_RACE_COUNT);
  const raceScores = races.map((r) => r.raceScore);
  const sampleCount = raceScores.length;

  const downsideSemiDeviation = computeDownsideSemiDeviation(raceScores);
  const raw = clamp(
    STABILITY_FACTOR_CENTER - STABILITY_FACTOR_AMPLITUDE * Math.tanh(downsideSemiDeviation / STABILITY_FACTOR_SCALE),
    0,
    100,
  );

  const stabilityConfidence = baseConfidenceFromSampleCount(sampleCount);
  const shrinkWeight = CONFIDENCE_SHRINK_WEIGHTS[stabilityConfidence];
  const stabilityFactor = clamp(
    STABILITY_FACTOR_NEUTRAL + (raw - STABILITY_FACTOR_NEUTRAL) * shrinkWeight,
    0,
    100,
  );

  return {
    stabilityFactor: roundToOneDecimal(stabilityFactor),
    raw: roundToOneDecimal(raw),
    downsideSemiDeviation: roundToOneDecimal(downsideSemiDeviation),
    sampleCount,
    stabilityConfidence,
  };
}

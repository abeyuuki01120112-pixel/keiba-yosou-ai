/**
 * memberLevel V1候補比較（STEP5.2・検証専用モジュール）。
 *
 * 【重要】このファイルはmemberLevel.ts（本番ロジック）を置き換えるものではない。
 * raceHistoryPipeline.ts はこのファイルを一切importせず、memberLevelScoreAtRace の
 * 算出は引き続き memberLevel.ts の calculateMemberLevel() のみが担う。
 * ここにある関数群は「宝塚記念の実データで4方式を比較検証する」ためだけの読み取り専用
 * ユーティリティであり、どれか1つを正式採用したわけではない（ユーザー＋ChatGPTの判断待ち）。
 *
 * 4候補:
 *   A) Top3単純平均
 *   B) Top5単純平均
 *   C) Top5中央値
 *   D) confidence考慮型（Top5の重み付き平均。weight=confidenceWeight）
 *
 * confidenceの定義は新規に作らず、STEP4/STEP6で既に確定している
 * baseConfidenceFromSampleCount / CONFIDENCE_SHRINK_WEIGHTS（suitabilityConfidence.ts）を
 * そのまま流用する（プロジェクト内で複数のconfidence定義を作らないため）。
 */

import { mean, median } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { baseConfidenceFromSampleCount, CONFIDENCE_SHRINK_WEIGHTS } from "./suitabilityConfidence";
import type { SuitabilityConfidence } from "./suitabilityTypes";

export interface AbilityCandidate {
  id: string;
  /** 対象レースより前に確定していた能力値（abilityBeforeRace相当）。NaN/非有限は集計から除外する */
  ability: number;
  /** 根拠になった過去走数（sample size） */
  sampleCount: number;
}

/** sampleCountから、既存のconfidence定義（STEP4/STEP6と共通）に基づく重み(0〜1)を返す */
export function confidenceWeightFromSampleCount(sampleCount: number): number {
  return CONFIDENCE_SHRINK_WEIGHTS[baseConfidenceFromSampleCount(sampleCount)];
}

export function confidenceFromSampleCount(sampleCount: number): SuitabilityConfidence {
  return baseConfidenceFromSampleCount(sampleCount);
}

function sanitize(candidates: AbilityCandidate[]): AbilityCandidate[] {
  return candidates.filter((c) => Number.isFinite(c.ability) && Number.isFinite(c.sampleCount) && c.sampleCount >= 0);
}

function selectTopN(candidates: AbilityCandidate[], n: number): AbilityCandidate[] {
  return [...sanitize(candidates)].sort((a, b) => b.ability - a.ability).slice(0, n);
}

/** A/B: Top-N単純平均。対象馬が1頭も無ければnull（=判断不能、勝手に0や中立値で埋めない） */
export function calculateTopNSimpleAverage(candidates: AbilityCandidate[], n: number): number | null {
  const top = selectTopN(candidates, n);
  if (top.length === 0) return null;
  return roundToOneDecimal(mean(top.map((c) => c.ability)));
}

/** C: Top-N中央値 */
export function calculateTopNMedian(candidates: AbilityCandidate[], n: number): number | null {
  const top = selectTopN(candidates, n);
  if (top.length === 0) return null;
  return roundToOneDecimal(median(top.map((c) => c.ability)));
}

/**
 * D: confidence考慮型（Top-Nの重み付き平均）。
 *   memberLevel = Σ(ability_i × confidenceWeight_i) / ΣconfidenceWeight_i
 * 単純に ability × confidence をそのまま足すと、confidenceが低い馬ほど値そのものが
 * 縮小されスケールが崩れる（例: ability=79.3, confidence=0.3 → 23.79 は「能力値」ではなくなる）。
 * そのため加重平均（分母で正規化）を採用し、出力を常にability本来の0〜100スケールに保つ。
 * 全対象馬のconfidenceWeightが0（=分母0）の場合はnullを返し、無理に0除算を回避しない
 * （判断不能であることをそのまま呼び出し側に伝える）。
 */
export function calculateTopNConfidenceWeightedMean(candidates: AbilityCandidate[], n: number): number | null {
  const top = selectTopN(candidates, n);
  if (top.length === 0) return null;
  const weighted = top.map((c) => ({ ability: c.ability, weight: confidenceWeightFromSampleCount(c.sampleCount) }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) return null;
  const raw = weighted.reduce((sum, w) => sum + w.ability * w.weight, 0) / totalWeight;
  return roundToOneDecimal(raw);
}

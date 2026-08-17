/**
 * baseline（5年基準タイム／5年上がり3F基準）の3段階fallback検索まわりの共通ロジック。
 *
 * 検索順序：
 *   ① exact             … 競馬場×surface×距離×馬場状態が完全一致
 *   ② distanceFallback   … 競馬場×surface×距離は一致・馬場状態は問わない
 *   ③ defaultFallback    … 一致なし。既存の中立値フォールバック（raceTimeScore=70／
 *                          final3FScoreはレース内相対評価100%）に委ねる
 *
 * サンプルが少ないbaselineを実データ同等に扱わないよう、sampleCountが
 * MIN_RELIABLE_SAMPLE_COUNT未満の場合はisReliable=falseとする（1箇所で調整可能）。
 *
 * さらに、sourceが仮データ・placeholder由来であると判別できる場合は、
 * sampleCountの値に関わらずisReliable=falseとする（baseAbility V1監査で、
 * V0仮データにsampleCount=30という実データらしい値が仮置きされていたため
 * isReliable=trueと誤表示される事例が見つかったことへの対処）。
 */

import type { BaselineMeta, BaselineSourceTier } from "./types";

/** この件数未満のサンプルは信頼度「低」として扱う（V0暫定値） */
export const MIN_RELIABLE_SAMPLE_COUNT = 15;

/**
 * sourceの自由記述から、実データではなく仮データ・placeholder由来だと判別できるかを判定する。
 * 大文字小文字は区別しない。誤検出を避けるため、実データバッチが使ってきた
 * 「JRA確認済みサンプル」等の文言とは重複しないキーワードのみを対象にする。
 */
export function isPlaceholderSource(source: string): boolean {
  return /v0|仮データ|仮のデータ|placeholder|synthetic|未投入/i.test(source);
}

/**
 * exact一致・distanceFallback一致（どちらか一方、または両方null）から
 * BaselineMetaと実際に使うbaselineレコードを組み立てる。
 */
export function resolveBaselineLookup<T extends { sampleCount: number; source: string }>(
  exactMatch: T | undefined,
  distanceFallbackMatch: T | undefined,
): { baseline: T | null; meta: BaselineMeta } {
  const matched = exactMatch ?? distanceFallbackMatch;
  const baselineSource: BaselineSourceTier = exactMatch
    ? "exact"
    : distanceFallbackMatch
      ? "distanceFallback"
      : "defaultFallback";

  if (!matched) {
    return {
      baseline: null,
      meta: { baselineSource, sampleCount: null, isReliable: false, dataSource: null },
    };
  }

  return {
    baseline: matched,
    meta: {
      baselineSource,
      sampleCount: matched.sampleCount,
      isReliable: matched.sampleCount >= MIN_RELIABLE_SAMPLE_COUNT && !isPlaceholderSource(matched.source),
      dataSource: matched.source,
    },
  };
}

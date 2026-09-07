/**
 * オッズ・期待値まわりの計算。V0では単勝のみ対応。
 */

/** 勝率（0〜100の%表記）から適正オッズを求める */
export function fairOdds(winRatePercent: number): number {
  if (winRatePercent <= 0) return Infinity;
  return 100 / winRatePercent;
}

/**
 * 単勝期待値を求める。
 * expectedValue = 勝率(0〜1) × 実オッズ
 * 戻り値は% 表記（例: 144 は期待値144%）
 */
export function expectedValue(
  winRatePercent: number,
  actualOdds: number,
): number {
  const winRateRatio = winRatePercent / 100;
  return winRateRatio * actualOdds * 100;
}

export const EXPECTED_VALUE_THRESHOLD = 100;

export function isPositiveExpectedValue(evPercent: number): boolean {
  return evPercent >= EXPECTED_VALUE_THRESHOLD;
}

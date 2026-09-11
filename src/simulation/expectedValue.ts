/**
 * オッズ・期待値まわりの計算。V0では単勝のみ対応。
 */

function assertProbabilityRatio(winProbability: number): void {
  if (!Number.isFinite(winProbability) || winProbability < 0 || winProbability > 1) {
    throw new RangeError("winProbabilityは0以上1以下の有限値である必要があります");
  }
}

function assertDecimalOdds(actualOdds: number): void {
  if (!Number.isFinite(actualOdds) || actualOdds <= 0) {
    throw new RangeError("actualOddsは0より大きい有限値である必要があります");
  }
}

/**
 * 単勝の期待回収倍率。1.00が理論上の損益分岐。
 * 表示丸め前の勝率（0〜1）をそのまま使う。
 */
export function expectedReturn(winProbability: number, actualOdds: number): number {
  assertProbabilityRatio(winProbability);
  assertDecimalOdds(actualOdds);
  return winProbability * actualOdds;
}

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
  return expectedReturn(winRatePercent / 100, actualOdds) * 100;
}

export const EXPECTED_VALUE_THRESHOLD = 100;

export function isPositiveExpectedValue(evPercent: number): boolean {
  return evPercent >= EXPECTED_VALUE_THRESHOLD;
}

import { describe, expect, it } from "vitest";
import { expectedReturn, expectedValue, fairOdds, isPositiveExpectedValue } from "../expectedValue";

describe("expectedValue", () => {
  it("勝率0.20・単勝6.0から期待回収倍率1.20を計算する", () => {
    expect(expectedReturn(0.20, 6.0)).toBeCloseTo(1.20, 12);
  });

  it("表示用に丸める前の勝率をそのまま使用する", () => {
    expect(expectedReturn(0.17342, 7.2)).toBeCloseTo(1.248624, 12);
    expect(expectedReturn(0.17342, 7.2)).not.toBeCloseTo(0.173 * 7.2, 12);
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正Probability=%sを拒否する", (probability) => {
      expect(() => expectedReturn(probability, 6.0)).toThrow(/winProbability/);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正Odds=%sを拒否する", (odds) => {
      expect(() => expectedReturn(0.2, odds)).toThrow(/actualOdds/);
    },
  );

  it("適正オッズが 1/勝率 で計算される", () => {
    expect(fairOdds(20)).toBeCloseTo(5.0, 5);
    expect(fairOdds(50)).toBeCloseTo(2.0, 5);
  });

  it("単勝期待値が勝率×実オッズで計算される", () => {
    // 勝率18%, 実オッズ8.0倍 -> 期待値144%
    expect(expectedValue(18, 8.0)).toBeCloseTo(144, 5);
  });

  it("期待値100%以上を判別できる", () => {
    expect(isPositiveExpectedValue(144)).toBe(true);
    expect(isPositiveExpectedValue(99.9)).toBe(false);
    expect(isPositiveExpectedValue(100)).toBe(true);
  });
});

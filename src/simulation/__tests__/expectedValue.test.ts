import { describe, expect, it } from "vitest";
import { expectedValue, fairOdds, isPositiveExpectedValue } from "../expectedValue";

describe("expectedValue", () => {
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

import { describe, expect, it } from "vitest";
import { median } from "../probability";

describe("median", () => {
  it("奇数個の中央値を返す", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("偶数個の中央値（中央2つの平均）を返す", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("平均ではなく中央値を使う（外れ値に引っ張られにくい）", () => {
    const withOutlier = [-0.7, -0.9, -0.6, -1.0, 100];
    const mean = withOutlier.reduce((a, b) => a + b, 0) / withOutlier.length;
    const med = median(withOutlier);
    // 極端な外れ値(100)があっても中央値はほぼ動かない
    expect(med).toBeCloseTo(-0.7, 5);
    expect(med).not.toBeCloseTo(mean, 1);
  });

  it("空配列は0を返す", () => {
    expect(median([])).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { calculateTimeGapScore } from "../timeGapScore";

describe("calculateTimeGapScore", () => {
  it("2000m基準ではそのままのタイム差で計算される", () => {
    // timeGapScore = 90 - 28 * timeGap (distance補正係数が1のため)
    expect(calculateTimeGapScore(0.5, 2000)).toBeCloseTo(90 - 28 * 0.5, 5);
  });

  it("同じ0.5秒差でも距離によって補正後の重みが変わる（1200mの方が重い）", () => {
    const shortDistanceScore = calculateTimeGapScore(0.5, 1200);
    const longDistanceScore = calculateTimeGapScore(0.5, 3200);
    expect(shortDistanceScore).toBeLessThan(longDistanceScore);
  });

  it("勝ち馬の着差はマイナス値で90点を超えうる", () => {
    // 0.2秒差で勝利 -> timeGap = -0.2
    const score = calculateTimeGapScore(-0.2, 2000);
    expect(score).toBeGreaterThan(90);
  });

  it("0〜100にclampされる", () => {
    expect(calculateTimeGapScore(-10, 2000)).toBe(100);
    expect(calculateTimeGapScore(10, 2000)).toBe(0);
  });
});

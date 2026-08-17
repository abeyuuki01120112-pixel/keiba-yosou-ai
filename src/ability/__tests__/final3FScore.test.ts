import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_WEIGHT,
  calculateFinal3FScore,
  combineFinal3FValue,
  FINAL3F_SCORE_CENTER,
  RELATIVE_WEIGHT,
} from "../final3FScore";

describe("重み比率", () => {
  it("レース内相対評価60% / 絶対評価40%で合計1.0になる", () => {
    expect(RELATIVE_WEIGHT).toBeCloseTo(0.6, 5);
    expect(ABSOLUTE_WEIGHT).toBeCloseTo(0.4, 5);
    expect(RELATIVE_WEIGHT + ABSOLUTE_WEIGHT).toBeCloseTo(1.0, 5);
  });
});

describe("combineFinal3FValue", () => {
  it("60/40比率で合成される", () => {
    expect(combineFinal3FValue(1.0, 0.5)).toBeCloseTo(1.0 * 0.6 + 0.5 * 0.4, 5);
  });

  it("絶対評価がnull（5年基準なし）の場合、相対評価100%にフォールバックする", () => {
    expect(combineFinal3FValue(0.7, null)).toBeCloseTo(0.7, 5);
  });
});

describe("calculateFinal3FScore", () => {
  it("final3FValue=0のときCENTER(70点)になる", () => {
    expect(calculateFinal3FScore(0)).toBe(FINAL3F_SCORE_CENTER);
  });

  it("目安表とおおむね一致する", () => {
    // 優秀(78〜84)
    expect(calculateFinal3FScore(0.5)).toBeGreaterThan(75);
    expect(calculateFinal3FScore(0.5)).toBeLessThan(85);
    // 非常に優秀(85〜90台)
    expect(calculateFinal3FScore(1.2)).toBeGreaterThan(85);
    // やや低い(60台)
    expect(calculateFinal3FScore(-0.5)).toBeGreaterThan(55);
    expect(calculateFinal3FScore(-0.5)).toBeLessThan(65);
  });

  it("単調増加する", () => {
    const scores = [-2, -1, -0.5, 0, 0.5, 1, 2].map(calculateFinal3FScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it("0〜100にclampされる（極端な値でも）", () => {
    expect(calculateFinal3FScore(1000)).toBeLessThanOrEqual(100);
    expect(calculateFinal3FScore(-1000)).toBeGreaterThanOrEqual(0);
  });

  it("90点台が簡単には出ない", () => {
    expect(calculateFinal3FScore(0.5)).toBeLessThan(90);
  });
});

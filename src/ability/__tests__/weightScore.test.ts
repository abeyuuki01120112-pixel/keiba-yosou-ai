import { describe, expect, it } from "vitest";
import {
  buildWeightEvaluation,
  calculateRaceMedianWeight,
  calculateSecondsPerKg,
  calculateWeightScore,
  WEIGHT_SCORE_CENTER,
} from "../weightScore";

describe("calculateRaceMedianWeight", () => {
  it("レース斤量中央値が正しい", () => {
    expect(calculateRaceMedianWeight([56, 57, 58])).toBe(57);
    expect(calculateRaceMedianWeight([55, 56, 57, 58])).toBe(56.5);
  });

  it("有効な斤量が1つも無い場合はnull", () => {
    expect(calculateRaceMedianWeight([])).toBeNull();
    expect(calculateRaceMedianWeight([0, -1, NaN])).toBeNull();
  });

  it("不正値は除外して中央値を計算する", () => {
    expect(calculateRaceMedianWeight([56, 57, 58, NaN, -1])).toBe(57);
  });
});

describe("calculateSecondsPerKg", () => {
  it("2000mで1kg=0.2秒", () => {
    expect(calculateSecondsPerKg(2000)).toBeCloseTo(0.2, 5);
  });

  it("1200mで約0.12秒", () => {
    expect(calculateSecondsPerKg(1200)).toBeCloseTo(0.12, 5);
  });

  it("2400mで約0.24秒", () => {
    expect(calculateSecondsPerKg(2400)).toBeCloseTo(0.24, 5);
  });

  it("距離が長いほど斤量影響が増える", () => {
    const short = calculateSecondsPerKg(1200);
    const mid = calculateSecondsPerKg(2000);
    const long = calculateSecondsPerKg(3200);
    expect(short).toBeLessThan(mid);
    expect(mid).toBeLessThan(long);
  });
});

describe("calculateWeightScore", () => {
  it("weightAdjustmentSeconds=0（基準斤量）のときCENTER(70点)になる", () => {
    expect(calculateWeightScore(0)).toBe(WEIGHT_SCORE_CENTER);
  });

  it("重斤量（プラスのweightAdjustmentSeconds）でプラス評価になる", () => {
    expect(calculateWeightScore(0.4)).toBeGreaterThan(WEIGHT_SCORE_CENTER);
  });

  it("軽斤量（マイナスのweightAdjustmentSeconds）でマイナス評価になる", () => {
    expect(calculateWeightScore(-0.4)).toBeLessThan(WEIGHT_SCORE_CENTER);
  });

  it("0〜100にclampされる（極端な値でも）", () => {
    expect(calculateWeightScore(1000)).toBeLessThanOrEqual(100);
    expect(calculateWeightScore(-1000)).toBeGreaterThanOrEqual(0);
  });

  it("90点台が簡単には出ない", () => {
    expect(calculateWeightScore(0.4)).toBeLessThan(90);
  });

  it("単調増加する", () => {
    const scores = [-1, -0.5, 0, 0.5, 1].map(calculateWeightScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });
});

describe("buildWeightEvaluation", () => {
  it("例: 2000mでレース中央値57kg・実斤量59kgなら+0.4秒の負荷", () => {
    const { breakdown } = buildWeightEvaluation(59, 57, 2000);
    expect(breakdown.weightDiffKg).toBeCloseTo(2, 5);
    expect(breakdown.secondsPerKg).toBeCloseTo(0.2, 5);
    expect(breakdown.weightAdjustmentSeconds).toBeCloseTo(0.4, 5);
    expect(breakdown.isReliable).toBe(true);
  });

  it("基準斤量（差0kg）なら中央値付近のweightScoreになる", () => {
    const { weightScore } = buildWeightEvaluation(57, 57, 2000);
    expect(weightScore).toBe(WEIGHT_SCORE_CENTER);
  });

  it("レース斤量中央値がnull（欠損）の場合、中立値に安全にフォールバックする", () => {
    const { weightScore, breakdown } = buildWeightEvaluation(58, null, 2000);
    expect(weightScore).toBe(WEIGHT_SCORE_CENTER);
    expect(breakdown.weightAdjustmentSeconds).toBe(0);
    expect(breakdown.isReliable).toBe(false);
  });
});

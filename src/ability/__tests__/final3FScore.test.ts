import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_WEIGHT,
  calculateFinal3FScore,
  classifyAbsoluteConfidence,
  combineFinal3FValue,
  computeSampleReliabilityWeight,
  FINAL3F_SCORE_CENTER,
  RELATIVE_WEIGHT,
} from "../final3FScore";
import { MIN_RELIABLE_SAMPLE_COUNT } from "../baselineLookup";
import type { CourseFinal3FBaseline } from "../types";

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

  it("sampleReliabilityWeightを省略すると1.0(従来どおりフル適用)になる", () => {
    expect(combineFinal3FValue(1.0, 0.5)).toBeCloseTo(combineFinal3FValue(1.0, 0.5, 1), 5);
  });

  it("sampleReliabilityWeight=0なら絶対評価は完全に無視され、相対評価100%になる", () => {
    expect(combineFinal3FValue(0.7, 999, 0)).toBeCloseTo(0.7, 5);
  });

  it("sampleReliabilityWeightに応じて絶対評価の実効的な重みが線形に縮小する", () => {
    const relative = 1.0;
    const absolute = 2.0;
    const atHalf = combineFinal3FValue(relative, absolute, 0.5);
    // effectiveAbsoluteWeight = 0.4*0.5=0.2, effectiveRelativeWeight=0.8
    expect(atHalf).toBeCloseTo(relative * 0.8 + absolute * 0.2, 5);
  });

  it("relative+absoluteの実効的な重みの合計は常に1.0を維持する（sampleReliabilityWeightによらず）", () => {
    for (const weight of [0, 0.2, 0.5, 0.8, 1]) {
      // 同じ値を渡して合成値が「その値自体」になることを確認すれば、重みの合計が1であることが分かる
      const same = 3.14;
      expect(combineFinal3FValue(same, same, weight)).toBeCloseTo(same, 5);
    }
  });
});

describe("computeSampleReliabilityWeight", () => {
  function makeBaseline(overrides: Partial<CourseFinal3FBaseline> = {}): CourseFinal3FBaseline {
    return {
      racecourse: "阪神",
      surface: "turf",
      distance: 2200,
      going: "重",
      sampleYears: 1,
      sampleCount: 1,
      medianFinal3FSeconds: 36.85,
      source: "JRA確認済みサンプル(n=1レース) verified",
      ...overrides,
    };
  }

  it(`sampleCount>=${MIN_RELIABLE_SAMPLE_COUNT}なら1.0（フル適用）`, () => {
    expect(computeSampleReliabilityWeight(makeBaseline({ sampleCount: MIN_RELIABLE_SAMPLE_COUNT }))).toBe(1);
    expect(computeSampleReliabilityWeight(makeBaseline({ sampleCount: MIN_RELIABLE_SAMPLE_COUNT + 10 }))).toBe(1);
  });

  it("sampleCount=1（現在の阪神2200重相当）は1/15程度の小さい重みになる", () => {
    const weight = computeSampleReliabilityWeight(makeBaseline({ sampleCount: 1 }));
    expect(weight).toBeCloseTo(1 / MIN_RELIABLE_SAMPLE_COUNT, 5);
    expect(weight).toBeLessThan(0.1);
  });

  it("sampleCount=0なら0", () => {
    expect(computeSampleReliabilityWeight(makeBaseline({ sampleCount: 0 }))).toBe(0);
  });

  it("V0仮データ由来（isPlaceholderSource）は、sampleCountがどれだけ大きくても0になる", () => {
    const weight = computeSampleReliabilityWeight(
      makeBaseline({ sampleCount: 30, source: "V0テスト用仮データ（実データ未投入）" }),
    );
    expect(weight).toBe(0);
  });
});

describe("classifyAbsoluteConfidence", () => {
  it("weight>=1で高", () => {
    expect(classifyAbsoluteConfidence(1)).toBe("high");
  });

  it("0.5<=weight<1で中", () => {
    expect(classifyAbsoluteConfidence(0.5)).toBe("medium");
    expect(classifyAbsoluteConfidence(0.9)).toBe("medium");
  });

  it("weight<0.5で低", () => {
    expect(classifyAbsoluteConfidence(0)).toBe("low");
    expect(classifyAbsoluteConfidence(1 / 15)).toBe("low");
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

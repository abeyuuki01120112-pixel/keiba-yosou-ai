import { describe, expect, it } from "vitest";
import {
  computeOutcomeProbabilities,
  computeOutcomeProbabilitiesRaw,
  computeStrength,
  PLACKETT_LUCE_TEMPERATURE,
} from "../outcomeProbability";

function field(abilities: number[]) {
  return abilities.map((a, i) => ({ id: `h${i}`, finalRaceAbility: a }));
}

describe("PLACKETT_LUCE_TEMPERATURE", () => {
  it("T=10が定数として定義されている", () => {
    expect(PLACKETT_LUCE_TEMPERATURE).toBe(10);
  });
});

describe("computeStrength", () => {
  it("strength = exp(finalRaceAbility / T) をT=10で実際に使う", () => {
    expect(computeStrength(80)).toBeCloseTo(Math.exp(80 / 10), 8);
    expect(computeStrength(70)).toBeCloseTo(Math.exp(70 / PLACKETT_LUCE_TEMPERATURE), 8);
  });

  it("temperatureを明示指定すればそちらが使われる（校正用）", () => {
    expect(computeStrength(80, 20)).toBeCloseTo(Math.exp(80 / 20), 8);
  });
});

describe("computeOutcomeProbabilitiesRaw", () => {
  const entries = field([85, 78, 74, 70, 65, 60, 55, 50]);
  const results = computeOutcomeProbabilitiesRaw(entries);

  it("① ΣwinProbability = 100%", () => {
    const total = results.reduce((sum, r) => sum + r.winProbability, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it("② Σtop2Probability = 200%", () => {
    const total = results.reduce((sum, r) => sum + r.top2Probability, 0);
    expect(total).toBeCloseTo(200, 5);
  });

  it("③ Σtop3Probability = 300%", () => {
    const total = results.reduce((sum, r) => sum + r.top3Probability, 0);
    expect(total).toBeCloseTo(300, 5);
  });

  it("④ 各馬について 0 <= win <= top2 <= top3 <= 100(%)", () => {
    for (const r of results) {
      expect(r.winProbability).toBeGreaterThanOrEqual(0);
      expect(r.winProbability).toBeLessThanOrEqual(r.top2Probability);
      expect(r.top2Probability).toBeLessThanOrEqual(r.top3Probability);
      expect(r.top3Probability).toBeLessThanOrEqual(100);
    }
  });

  it("⑤ 各確率は0〜100%の範囲に収まる", () => {
    for (const r of results) {
      for (const v of [r.winProbability, r.top2Probability, r.top3Probability]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("能力が高い馬ほど確率も高い（単調性）", () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].winProbability).toBeGreaterThanOrEqual(results[i].winProbability);
      expect(results[i - 1].top3Probability).toBeGreaterThanOrEqual(results[i].top3Probability);
    }
  });

  it("winProbability×2やwinProbability×3で近似していない（実際にPLの逐次除外計算をしている証拠）", () => {
    for (const r of results) {
      // 一般に全馬が同着でない限り、top2は単純な2倍にはならない
      expect(r.top2Probability).not.toBeCloseTo(r.winProbability * 2, 5);
    }
  });

  it("2頭のみの場合、両馬ともtop2=top3=100%になる（自明に連対・複勝圏）", () => {
    const two = computeOutcomeProbabilitiesRaw(field([80, 60]));
    for (const r of two) {
      expect(r.top2Probability).toBeCloseTo(100, 5);
      expect(r.top3Probability).toBeCloseTo(100, 5);
    }
  });

  it("1頭のみの場合、win=top2=top3=100%", () => {
    const one = computeOutcomeProbabilitiesRaw(field([80]));
    expect(one[0].winProbability).toBeCloseTo(100, 5);
    expect(one[0].top2Probability).toBeCloseTo(100, 5);
    expect(one[0].top3Probability).toBeCloseTo(100, 5);
  });

  it("0頭なら空配列", () => {
    expect(computeOutcomeProbabilitiesRaw([])).toEqual([]);
  });

  it("能力が同じ馬同士は確率も同じになる", () => {
    const results3 = computeOutcomeProbabilitiesRaw(field([70, 70, 70]));
    expect(results3[0].winProbability).toBeCloseTo(results3[1].winProbability, 8);
    expect(results3[1].winProbability).toBeCloseTo(results3[2].winProbability, 8);
  });
});

describe("computeOutcomeProbabilities（表示用丸め）", () => {
  it("小数第1位に丸められる", () => {
    const results = computeOutcomeProbabilities(field([85, 78, 74, 70, 65]));
    for (const r of results) {
      expect(r.winProbability).toBeCloseTo(Math.round(r.winProbability * 10) / 10, 8);
    }
  });
});

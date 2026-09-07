import { describe, expect, it } from "vitest";
import {
  computeOutcomeScores,
  STABILITY_WEIGHT_2,
  STABILITY_WEIGHT_3,
  STABILITY_WEIGHT_WIN,
} from "../outcomeScore";
import { STABILITY_FACTOR_NEUTRAL } from "../stabilityFactor";

function field(entries: { id: string; finalRaceAbility: number; stabilityFactor?: number }[]) {
  return entries.map((e) => ({ ...e, stabilityFactor: e.stabilityFactor ?? STABILITY_FACTOR_NEUTRAL }));
}

describe("STABILITY_WEIGHT定数", () => {
  it("STABILITY_WEIGHT_3 > STABILITY_WEIGHT_2 > 0 が成立する", () => {
    expect(STABILITY_WEIGHT_2).toBeGreaterThan(0);
    expect(STABILITY_WEIGHT_3).toBeGreaterThan(STABILITY_WEIGHT_2);
  });

  it("winScoreのstability重みは0（影響なし）", () => {
    expect(STABILITY_WEIGHT_WIN).toBe(0);
  });
});

describe("computeOutcomeScores", () => {
  it("⑩ winScore/top2Score/top3Scoreは全て0〜100の範囲", () => {
    const results = computeOutcomeScores(
      field([
        { id: "a", finalRaceAbility: 95 },
        { id: "b", finalRaceAbility: 70 },
        { id: "c", finalRaceAbility: 40 },
      ]),
    );
    for (const r of results) {
      for (const v of [r.winScore, r.top2Score, r.top3Score]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("winScore <= top2Score <= top3Score が一般に成立する", () => {
    const results = computeOutcomeScores(
      field([
        { id: "a", finalRaceAbility: 90 },
        { id: "b", finalRaceAbility: 75 },
        { id: "c", finalRaceAbility: 60 },
        { id: "d", finalRaceAbility: 50 },
      ]),
    );
    for (const r of results) {
      expect(r.winScore).toBeLessThanOrEqual(r.top2Score);
      expect(r.top2Score).toBeLessThanOrEqual(r.top3Score);
    }
  });

  it("⑪⑫ stabilityFactorが高いほどtop2Score/top3Scoreは上がるが、winScoreは変わらない", () => {
    const base = { id: "x", finalRaceAbility: 75 };
    const rivals = [
      { id: "r1", finalRaceAbility: 70, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
      { id: "r2", finalRaceAbility: 65, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
    ];
    const lowStability = computeOutcomeScores([{ ...base, stabilityFactor: 40 }, ...rivals]).find(
      (r) => r.id === "x",
    )!;
    const highStability = computeOutcomeScores([{ ...base, stabilityFactor: 95 }, ...rivals]).find(
      (r) => r.id === "x",
    )!;

    expect(lowStability.winScore).toBe(highStability.winScore); // stability重み0 → 完全不変
    expect(highStability.top2Score).toBeGreaterThan(lowStability.top2Score);
    expect(highStability.top3Score).toBeGreaterThan(lowStability.top3Score);
  });

  it("stabilityFactorの効きはtop2ScoreよりもTOP3Scoreの方が強い（STABILITY_WEIGHT_3 > STABILITY_WEIGHT_2）", () => {
    const base = { id: "x", finalRaceAbility: 75 };
    const rivals = [
      { id: "r1", finalRaceAbility: 70, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
      { id: "r2", finalRaceAbility: 65, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
    ];
    const low = computeOutcomeScores([{ ...base, stabilityFactor: 40 }, ...rivals]).find((r) => r.id === "x")!;
    const high = computeOutcomeScores([{ ...base, stabilityFactor: 95 }, ...rivals]).find((r) => r.id === "x")!;

    const top2Diff = high.top2Score - low.top2Score;
    const top3Diff = high.top3Score - low.top3Score;
    expect(top3Diff).toBeGreaterThan(top2Diff);
  });

  it("「上限は低いが安定した馬」がtop3ScoreではwinScoreより高く評価されうる", () => {
    // finalRaceAbilityは平凡だが極めて安定した馬
    const steady = { id: "steady", finalRaceAbility: 68, stabilityFactor: 95 };
    const rivals = [
      { id: "r1", finalRaceAbility: 85, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
      { id: "r2", finalRaceAbility: 80, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
      { id: "r3", finalRaceAbility: 76, stabilityFactor: STABILITY_FACTOR_NEUTRAL },
    ];
    const result = computeOutcomeScores([steady, ...rivals]).find((r) => r.id === "steady")!;
    expect(result.top3Score).toBeGreaterThan(result.winScore);
  });

  it("能力が高いほどスコアも高くなる（絶対能力が支配的）", () => {
    const results = computeOutcomeScores(
      field([
        { id: "a", finalRaceAbility: 90 },
        { id: "b", finalRaceAbility: 70 },
        { id: "c", finalRaceAbility: 50 },
      ]),
    );
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.a.winScore).toBeGreaterThan(byId.b.winScore);
    expect(byId.b.winScore).toBeGreaterThan(byId.c.winScore);
  });

  it("同じfinalRaceAbility・stabilityFactorの馬は同じスコアになる（フィールド構成だけで暴れない）", () => {
    const results = computeOutcomeScores(field([{ id: "a", finalRaceAbility: 70 }, { id: "b", finalRaceAbility: 70 }]));
    expect(results[0].winScore).toBe(results[1].winScore);
    expect(results[0].top3Score).toBe(results[1].top3Score);
  });

  it("1頭だけでも壊れない（ライバル不在→margin=0）", () => {
    const results = computeOutcomeScores(field([{ id: "a", finalRaceAbility: 75 }]));
    expect(results).toHaveLength(1);
    expect(results[0].winScore).toBeGreaterThanOrEqual(0);
    expect(results[0].winScore).toBeLessThanOrEqual(100);
  });
});

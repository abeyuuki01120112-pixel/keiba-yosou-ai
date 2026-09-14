import { describe, expect, it } from "vitest";
import { validateBetEntry, sumStake, type BetEntry } from "../betTypes";

function entry(overrides: Partial<{ canonicalHorseId: string; role: "ANY" | "FIRST" | "SECOND" | "THIRD" }> = {}) {
  return { canonicalHorseId: "h1", role: "ANY" as const, ...overrides };
}

describe("betTypes: validateBetEntry", () => {
  it("H. WIN/PLACEは1頭・role=ANYを要求する", () => {
    const bet: BetEntry = { betType: "WIN", selection: [entry()], stake: 100 };
    expect(() => validateBetEntry(bet, "test")).not.toThrow();
  });

  it("H. WINで2頭指定は拒否する（券種別必要頭数validation）", () => {
    const bet: BetEntry = {
      betType: "WIN",
      selection: [entry({ canonicalHorseId: "h1" }), entry({ canonicalHorseId: "h2" })],
      stake: 100,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/1頭/);
  });

  it("QUINELLA（馬連）は2頭・両方role=ANYを要求する", () => {
    const bet: BetEntry = {
      betType: "QUINELLA",
      selection: [entry({ canonicalHorseId: "h6" }), entry({ canonicalHorseId: "h9" })],
      stake: 500,
    };
    expect(() => validateBetEntry(bet, "test")).not.toThrow();
  });

  it("I. QUINELLAでrole=FIRSTを混ぜると拒否する（role整合性validation）", () => {
    const bet: BetEntry = {
      betType: "QUINELLA",
      selection: [entry({ canonicalHorseId: "h6", role: "FIRST" }), entry({ canonicalHorseId: "h9" })],
      stake: 500,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/ANY/);
  });

  it("EXACTA（馬単）はFIRST/SECONDをそれぞれ1つずつ要求する", () => {
    const bet: BetEntry = {
      betType: "EXACTA",
      selection: [
        entry({ canonicalHorseId: "h6", role: "FIRST" }),
        entry({ canonicalHorseId: "h9", role: "SECOND" }),
      ],
      stake: 300,
    };
    expect(() => validateBetEntry(bet, "test")).not.toThrow();
  });

  it("I. EXACTAで両方role=ANYは拒否する", () => {
    const bet: BetEntry = {
      betType: "EXACTA",
      selection: [entry({ canonicalHorseId: "h6" }), entry({ canonicalHorseId: "h9" })],
      stake: 300,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/FIRST\/SECOND/);
  });

  it("TRIFECTA（三連単）はFIRST/SECOND/THIRDをそれぞれ1つずつ要求する", () => {
    const bet: BetEntry = {
      betType: "TRIFECTA",
      selection: [
        entry({ canonicalHorseId: "h6", role: "FIRST" }),
        entry({ canonicalHorseId: "h9", role: "SECOND" }),
        entry({ canonicalHorseId: "h10", role: "THIRD" }),
      ],
      stake: 100,
    };
    expect(() => validateBetEntry(bet, "test")).not.toThrow();
  });

  it("H. TRIO（三連複）で2頭のみは拒否する（3頭必要）", () => {
    const bet: BetEntry = {
      betType: "TRIO",
      selection: [entry({ canonicalHorseId: "h6" }), entry({ canonicalHorseId: "h9" })],
      stake: 100,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/3頭/);
  });

  it("G. 同一bet内でcanonicalHorseIdが重複していれば拒否する", () => {
    const bet: BetEntry = {
      betType: "QUINELLA",
      selection: [entry({ canonicalHorseId: "h6" }), entry({ canonicalHorseId: "h6" })],
      stake: 500,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/重複/);
  });

  it("F. canonicalHorseIdが欠損していれば拒否する", () => {
    const bet: BetEntry = {
      betType: "WIN",
      selection: [{ canonicalHorseId: "", role: "ANY" }],
      stake: 100,
    };
    expect(() => validateBetEntry(bet, "test")).toThrow(/canonicalHorseId/);
  });

  it("J. stake<=0は拒否する（0円禁止）", () => {
    expect(() => validateBetEntry({ betType: "WIN", selection: [entry()], stake: 0 }, "test")).toThrow(/stake/);
    expect(() => validateBetEntry({ betType: "WIN", selection: [entry()], stake: -100 }, "test")).toThrow(/stake/);
  });

  it("J. stakeが非整数（小数）は拒否する", () => {
    expect(() => validateBetEntry({ betType: "WIN", selection: [entry()], stake: 100.5 }, "test")).toThrow(/stake/);
  });

  it("未知のbetTypeは拒否する", () => {
    // @ts-expect-error 意図的に不正な値を渡す
    expect(() => validateBetEntry({ betType: "UNKNOWN", selection: [entry()], stake: 100 }, "test")).toThrow(/betType/);
  });

  it("sumStakeはbets.stakeの合計を返す", () => {
    const bets: BetEntry[] = [
      { betType: "WIN", selection: [entry()], stake: 1200 },
      { betType: "QUINELLA", selection: [entry({ canonicalHorseId: "h2" }), entry({ canonicalHorseId: "h6" })], stake: 500 },
    ];
    expect(sumStake(bets)).toBe(1700);
  });

  it("A. 100円単位のstakeは正常（100円/300円/1,200円）", () => {
    for (const stake of [100, 300, 1200]) {
      expect(() => validateBetEntry({ betType: "WIN", selection: [entry()], stake }, "test")).not.toThrow();
    }
  });

  it("B. 100円単位でないstakeは拒否する（150円/1円）", () => {
    for (const stake of [150, 1]) {
      expect(() => validateBetEntry({ betType: "WIN", selection: [entry()], stake }, "test")).toThrow(/100円単位/);
    }
  });
});

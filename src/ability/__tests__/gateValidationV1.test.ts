import { describe, expect, it } from "vitest";
import {
  computeFrameStats,
  computeFrameFinishCorrelation,
  findRepeatedHorses,
  simulatePercentFixedWidth,
  simulatePercentConfidenceWeighted,
  simulateHypotheticalEffectiveAbility,
  lookupGateCoefficient,
  GATE_VALIDATION_ROWS,
  type GateValidationRow,
} from "../gateValidationV1";

describe("GATE_VALIDATION_ROWS（実データ読み込み）", () => {
  it("157行、全て東京・dirt・1600mのみ", () => {
    expect(GATE_VALIDATION_ROWS).toHaveLength(157);
    for (const row of GATE_VALIDATION_ROWS) {
      expect(row.venue).toBe("東京");
      expect(row.surface).toBe("dirt");
      expect(row.distance).toBe(1600);
    }
  });

  it("10レース分である", () => {
    const raceIds = new Set(GATE_VALIDATION_ROWS.map((r) => r.raceId));
    expect(raceIds.size).toBe(10);
  });
});

describe("computeFrameStats", () => {
  const stats = computeFrameStats(GATE_VALIDATION_ROWS);

  it("1〜8枠すべてのstatsを返す", () => {
    expect(stats).toHaveLength(8);
    expect(stats.map((s) => s.frame)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("starts合計が157になる", () => {
    const total = stats.reduce((sum, s) => sum + s.starts, 0);
    expect(total).toBe(157);
  });

  it("勝率・連対率・複勝率は0〜100の範囲", () => {
    for (const s of stats) {
      expect(s.winRate).toBeGreaterThanOrEqual(0);
      expect(s.winRate).toBeLessThanOrEqual(100);
      expect(s.quinellaRate).toBeGreaterThanOrEqual(s.winRate);
      expect(s.placeRate).toBeGreaterThanOrEqual(s.quinellaRate);
    }
  });
});

describe("computeFrameFinishCorrelation", () => {
  it("実データでは弱い負の相関（外枠がやや有利な方向）が観測される", () => {
    const corr = computeFrameFinishCorrelation(GATE_VALIDATION_ROWS);
    expect(corr).toBeLessThan(0);
    expect(corr).toBeGreaterThan(-1);
  });
});

describe("findRepeatedHorses", () => {
  it("同一horseNameが2回以上出現する馬だけを抽出する", () => {
    const repeated = findRepeatedHorses(GATE_VALIDATION_ROWS);
    for (const [, rows] of repeated) {
      expect(rows.length).toBeGreaterThanOrEqual(2);
    }
    expect(repeated.size).toBeGreaterThan(0);
  });

  it("1回しか出走していない馬は含まれない", () => {
    const repeated = findRepeatedHorses(GATE_VALIDATION_ROWS);
    const counts = new Map<string, number>();
    for (const r of GATE_VALIDATION_ROWS) counts.set(r.horseName, (counts.get(r.horseName) ?? 0) + 1);
    for (const [name, count] of counts) {
      if (count === 1) expect(repeated.has(name)).toBe(false);
    }
  });
});

describe("simulatePercentFixedWidth（案A）", () => {
  it("gateCoefficient=1.0・MAX_WIDTH=8ならpercent=108", () => {
    expect(simulatePercentFixedWidth(1.0, 8)).toBeCloseTo(108, 5);
  });

  it("gateCoefficient=-1.0・MAX_WIDTH=8ならpercent=92", () => {
    expect(simulatePercentFixedWidth(-1.0, 8)).toBeCloseTo(92, 5);
  });
});

describe("simulatePercentConfidenceWeighted（案B）", () => {
  it("confidence=lowなら重み0.3で縮小される", () => {
    const percent = simulatePercentConfidenceWeighted(1.0, 8, "low");
    expect(percent).toBeCloseTo(100 + 1.0 * 8 * 0.3, 5);
  });

  it("confidence=highなら案Aと一致する", () => {
    const percent = simulatePercentConfidenceWeighted(1.0, 8, "high");
    expect(percent).toBeCloseTo(simulatePercentFixedWidth(1.0, 8), 5);
  });
});

describe("simulateHypotheticalEffectiveAbility", () => {
  it("percent=100ならbaseAbilityそのまま", () => {
    expect(simulateHypotheticalEffectiveAbility(70, 100)).toBeCloseTo(70, 5);
  });

  it("baseAbility80×70%=56 > baseAbility50×100%=50（能力の高い馬が多少適性が悪くても上回りうる）", () => {
    expect(simulateHypotheticalEffectiveAbility(80, 70)).toBeGreaterThan(
      simulateHypotheticalEffectiveAbility(50, 100),
    );
  });
});

describe("lookupGateCoefficient", () => {
  it("frame=8は正、frame=1は負（既存CourseContextPriorと同じ方向）", () => {
    expect(lookupGateCoefficient(8)).toBeGreaterThan(0);
    expect(lookupGateCoefficient(1)).toBeLessThan(0);
  });
});

describe("baseAbility非依存性の確認", () => {
  it("GateValidationRowにfinishPosition以外の能力計算用フィールド（raceScore等）を含まない", () => {
    const sample: GateValidationRow = GATE_VALIDATION_ROWS[0];
    expect(sample).not.toHaveProperty("raceScore");
    expect(sample).not.toHaveProperty("memberLevelScoreAtRace");
    expect(sample).not.toHaveProperty("baseAbility");
  });
});

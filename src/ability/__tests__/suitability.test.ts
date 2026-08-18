import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeEffectiveAbility, computeSuitabilityBreakdown } from "../suitability";
import { SUITABILITY_CLAMP_MAX, SUITABILITY_CLAMP_MIN } from "../suitabilityConfidence";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

function makeRace(
  fields: { racecourse: string; going: string; distance: number },
  raceScoreLevel: "high" | "low",
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  const level = raceScoreLevel === "high" ? 100 : 0;
  const timeGap = raceScoreLevel === "high" ? -5 : 10;
  return buildRacePerformance({
    raceId: `race-${fields.racecourse}-${fields.going}-${fields.distance}-${raceScoreLevel}-${Math.random()}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: fields.racecourse,
    surface: "turf",
    distance: fields.distance,
    going: fields.going,
    finishPosition: 1,
    timeGap,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: level,
    raceTimeScore: level,
    final3FScore: level,
    weightScore: level,
    memberLevelBreakdown: cleanMemberLevelBreakdown(),
    final3FBreakdown: {
      horseFinal3FSeconds: 34,
      raceFinal3FMedianSeconds: 34,
      relativeDiffSeconds: 0,
      courseBaselineSeconds: 34,
      trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true },
      absoluteDiffSeconds: 0,
      baselineMeta: cleanBaselineMeta(),
    },
    raceTimeBreakdown: {
      baselineTimeSeconds: 120,
      actualTimeSeconds: 120,
      baseDiffSeconds: 0,
      trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true },
      trackAdjustedDiffSeconds: 0,
      baselineMeta: cleanBaselineMeta(),
    },
    ...overrides,
  });
}

const TARGET: SuitabilityTargetRaceContext = { racecourse: "阪神", surface: "turf", distance: 2000, going: "重" };

describe("computeSuitabilityBreakdown / computeEffectiveAbility", () => {
  it("① 3項目とも過去走が対象条件と完全一致するならoverallSuitability=100%、effectiveAbility=baseAbility", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
    ];
    const result = computeEffectiveAbility(80, races, TARGET);
    expect(result.suitability.overallSuitability).toBe(100);
    expect(result.effectiveAbility).toBe(80);
    expect(result.baseAbility).toBe(80);
  });

  it("② 距離だけ対象条件からズレて平均を押し下げる場合、overallSuitabilityは100%未満へ正しく減少する（clampされない範囲）", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2400 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 1200 }, "high"),
    ];
    const breakdown = computeSuitabilityBreakdown(races, TARGET);
    // 距離のみ低下、going/courseは全走一致のためraw=100
    expect(breakdown.goingSuitability.raw).toBe(100);
    expect(breakdown.courseSuitability.raw).toBe(100);
    expect(breakdown.distanceSuitability.raw).toBeLessThan(100);
    expect(breakdown.overallSuitability).toBeCloseTo(91.9, 1);
    expect(breakdown.overallSuitability).toBeGreaterThan(SUITABILITY_CLAMP_MIN);

    const result = computeEffectiveAbility(80, races, TARGET);
    expect(result.effectiveAbility).toBeCloseTo(80 * (breakdown.overallSuitability / 100), 1);
  });

  it("③ 距離だけ対象条件と近く高水準な場合、overallSuitabilityは100%超へ正しく増加する（clampされない範囲）", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2400 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 1200 }, "low"),
    ];
    const breakdown = computeSuitabilityBreakdown(races, TARGET);
    expect(breakdown.distanceSuitability.raw).toBeGreaterThan(100);
    expect(breakdown.overallSuitability).toBeCloseTo(105.4, 1);
    expect(breakdown.overallSuitability).toBeLessThan(SUITABILITY_CLAMP_MAX);
  });

  it("⑥-a 極端に低い場合でも最終suitabilityは90%を下回らない（下限clamp）", () => {
    const matched = { racecourse: "阪神", going: "良", distance: 2000 };
    const unmatched = { racecourse: "中京", going: "不良", distance: 1200 };
    const races = [
      makeRace(matched, "low"),
      makeRace(matched, "low"),
      makeRace(matched, "low"),
      makeRace(matched, "low"),
      makeRace(unmatched, "high"),
    ];
    const target: SuitabilityTargetRaceContext = { racecourse: "阪神", surface: "turf", distance: 2000, going: "良" };
    const breakdown = computeSuitabilityBreakdown(races, target);
    expect(breakdown.distanceSuitability.raw).toBeCloseTo(0, 1);
    expect(breakdown.goingSuitability.raw).toBeCloseTo(0, 1);
    expect(breakdown.courseSuitability.raw).toBeCloseTo(0, 1);
    expect(breakdown.overallSuitability).toBe(SUITABILITY_CLAMP_MIN);

    const result = computeEffectiveAbility(80, races, target);
    expect(result.effectiveAbility).toBeCloseTo(80 * 0.9, 5);
  });

  it("⑥-b 極端に高い場合でも最終suitabilityは110%を超えない（上限clamp）", () => {
    const matched = { racecourse: "阪神", going: "良", distance: 2000 };
    const unmatched = { racecourse: "中京", going: "不良", distance: 1200 };
    const races = [
      makeRace(matched, "high"),
      makeRace(matched, "high"),
      makeRace(matched, "high"),
      makeRace(matched, "high"),
      makeRace(unmatched, "low"),
    ];
    const target: SuitabilityTargetRaceContext = { racecourse: "阪神", surface: "turf", distance: 2000, going: "良" };
    const breakdown = computeSuitabilityBreakdown(races, target);
    expect(breakdown.distanceSuitability.raw).toBeCloseTo(125, 1);
    expect(breakdown.goingSuitability.raw).toBeCloseTo(125, 1);
    expect(breakdown.courseSuitability.raw).toBeCloseTo(125, 1);
    expect(breakdown.overallSuitability).toBe(SUITABILITY_CLAMP_MAX);

    const result = computeEffectiveAbility(80, races, target);
    expect(result.effectiveAbility).toBeCloseTo(80 * 1.1, 5);
  });

  it("④ 小サンプル(1走のみ)の場合、adjustedはrawより100%側へ縮小される", () => {
    const races = [makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high")];
    const breakdown = computeSuitabilityBreakdown(races, TARGET);
    // sampleCount=1のcomponentはconfidence=低となり、adjustedはrawと100の間になる
    const d = breakdown.distanceSuitability;
    expect(d.sampleCount).toBe(1);
    expect(d.confidence).toBe("low");
    if (d.raw !== 100) {
      expect(Math.abs(d.adjusted - 100)).toBeLessThan(Math.abs(d.raw - 100));
    }
  });

  it("⑤ confidence=高の場合はadjusted=rawのまま維持される（縮小されない）", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2400 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 1200 }, "low"),
    ];
    const breakdown = computeSuitabilityBreakdown(races, TARGET);
    expect(breakdown.distanceSuitability.confidence).toBe("high");
    expect(breakdown.distanceSuitability.adjusted).toBe(breakdown.distanceSuitability.raw);
  });

  it("⑦ baseAbility自体はsuitability計算によって変更されない", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
    ];
    for (const baseAbility of [0, 50, 71.8, 100]) {
      const result = computeEffectiveAbility(baseAbility, races, TARGET);
      expect(result.baseAbility).toBe(baseAbility);
    }
  });

  it("confidenceはoverall統合の重みとして二重適用されない（3項目のadjustedの単純平均のみ）", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
    ];
    const breakdown = computeSuitabilityBreakdown(races, TARGET);
    const simpleAverage =
      (breakdown.distanceSuitability.adjusted + breakdown.goingSuitability.adjusted + breakdown.courseSuitability.adjusted) / 3;
    expect(breakdown.overallSuitability).toBeCloseTo(Math.min(Math.max(simpleAverage, SUITABILITY_CLAMP_MIN), SUITABILITY_CLAMP_MAX), 5);
  });
});

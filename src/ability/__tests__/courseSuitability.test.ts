import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeCourseSuitability } from "../courseSuitability";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

function makeRace(
  racecourse: string,
  raceScoreLevel: "high" | "low" | number,
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  const level = raceScoreLevel === "high" ? 100 : raceScoreLevel === "low" ? 0 : raceScoreLevel;
  const timeGap = raceScoreLevel === "high" ? -5 : raceScoreLevel === "low" ? 10 : 0;
  return buildRacePerformance({
    raceId: `race-${racecourse}-${raceScoreLevel}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse,
    surface: "turf",
    distance: 2000,
    going: "重",
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

describe("computeCourseSuitability", () => {
  it("同競馬場の実績が無ければ中立100%・confidence=低", () => {
    const races = [makeRace("中山", 80), makeRace("中京", 80)];
    const result = computeCourseSuitability(races, TARGET);
    expect(result.raw).toBe(100);
    expect(result.sampleCount).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("阪神2戦2勝のような極端な連対率ではなく、raceScore平均で評価する", () => {
    // 阪神2走とも高raceScore、他競馬場1走は低raceScore → raceScore平均比で適性を見る
    const races = [makeRace("阪神", "high"), makeRace("阪神", "high"), makeRace("中山", "low")];
    const result = computeCourseSuitability(races, TARGET);
    // matched(阪神)平均=100、全体平均=(100+100+0)/3=66.7、raw=100/66.7*100=149.9...
    expect(result.sampleCount).toBe(2);
    expect(result.raw).toBeGreaterThan(100);
    // 小サンプル(2走)のためconfidence=中となり、Design-2でrawより中立側へ縮小される
    expect(result.confidence).toBe("medium");
    expect(result.adjusted).toBeLessThan(result.raw);
    expect(result.adjusted).toBeGreaterThan(100);
  });

  it("surfaceが異なる同競馬場の実績は対象外にする", () => {
    const dirtRace = makeRace("阪神", "high", { surface: "dirt" });
    const result = computeCourseSuitability([dirtRace], TARGET);
    expect(result.sampleCount).toBe(0);
  });
});

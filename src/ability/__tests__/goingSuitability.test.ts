import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeGoingSuitability, GOING_ADJACENCY_WEIGHTS, GOING_ORDER } from "../goingSuitability";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

function makeRace(
  going: string,
  raceScoreLevel: "high" | "low" | number,
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  const level = raceScoreLevel === "high" ? 100 : raceScoreLevel === "low" ? 0 : raceScoreLevel;
  const timeGap = raceScoreLevel === "high" ? -5 : raceScoreLevel === "low" ? 10 : 0;
  return buildRacePerformance({
    raceId: `race-${going}-${raceScoreLevel}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "阪神",
    surface: "turf",
    distance: 2000,
    going,
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

describe("GOING_ORDER / GOING_ADJACENCY_WEIGHTS", () => {
  it("良→稍重→重→不良の順で、重みは1.0/0.5/0.2/0.0", () => {
    expect(GOING_ORDER).toEqual(["良", "稍重", "重", "不良"]);
    expect(GOING_ADJACENCY_WEIGHTS).toEqual([1.0, 0.5, 0.2, 0.0]);
  });
});

describe("computeGoingSuitability", () => {
  it("仕様の例: target=重の場合、重=1.0・稍重/不良=0.5・良=0.2の重みになる", () => {
    // 重(weight1.0)=100点、稍重(weight0.5)=100点、良(weight0.2)=100点、不良(weight0.5)=100点 → 全て一致するのでraw=100
    // 重みの違いを見るため、良だけ0点にして重み0.2分だけ平均が動くか確認する
    const races = [makeRace("重", "high"), makeRace("稍重", "high"), makeRace("良", "low"), makeRace("不良", "high")];
    const result = computeGoingSuitability(races, TARGET);
    // weightSum = 1.0 + 0.5 + 0.2 + 0.5 = 2.2
    // weightedAvg = (100*1.0 + 100*0.5 + 0*0.2 + 100*0.5) / 2.2 = 200/2.2 = 90.9...
    expect(result.basis.weightedRaceScoreAverage).toBeCloseTo(90.9, 1);
    expect(result.sampleCount).toBe(4);
  });

  it("良⇔不良の3段階差はweight=0で対象外になる", () => {
    const targetGood: SuitabilityTargetRaceContext = { ...TARGET, going: "良" };
    const races = [makeRace("不良", "high"), makeRace("不良", "high")];
    const result = computeGoingSuitability(races, targetGood);
    expect(result.sampleCount).toBe(0);
    expect(result.raw).toBe(100);
  });

  it("同一goingのみのレースはraw=100（全体平均と一致）", () => {
    const races = [makeRace("重", 70), makeRace("重", 90)];
    const result = computeGoingSuitability(races, TARGET);
    expect(result.raw).toBe(100);
    expect(result.sampleCount).toBe(2);
  });
});

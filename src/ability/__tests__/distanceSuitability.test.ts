import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeDistanceSuitability, DISTANCE_MATCH_WEIGHTS } from "../distanceSuitability";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return {
    candidates: [{ horseId: "dummy", ability: 65, sampleCount: 5, confidence: "high", weight: 1.0 }],
    weightedMean: 65,
    simpleTop5Average: 65,
    participantCount: 10,
  };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

/** raceScoreをtimeGap経由でほぼ100点/0点に固定するためのヘルパー */
function makeRace(
  distance: number,
  raceScoreLevel: "high" | "low" | number,
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  const level = raceScoreLevel === "high" ? 100 : raceScoreLevel === "low" ? 0 : raceScoreLevel;
  const timeGap = raceScoreLevel === "high" ? -5 : raceScoreLevel === "low" ? 10 : 0;
  return buildRacePerformance({
    raceId: `race-${distance}-${raceScoreLevel}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "阪神",
    surface: "turf",
    distance,
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

describe("computeDistanceSuitability", () => {
  it("該当する過去走が無ければ中立100%・sampleCount=0・confidence=低", () => {
    const races = [makeRace(1200, 80), makeRace(1200, 80)];
    const result = computeDistanceSuitability(races, TARGET);
    expect(result.raw).toBe(100);
    expect(result.adjusted).toBe(100);
    expect(result.sampleCount).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("同距離(weight=1.0)が最も重視される：同距離帯だが別距離(weight=0.6)より影響が大きい", () => {
    // 同距離(2000, target自身の帯=middle)=100点×3走(weight1.0)、同距離帯(1800もmiddle帯)=0点×1走(weight0.6)
    const races = [makeRace(2000, "high"), makeRace(1800, "low"), makeRace(2000, "high"), makeRace(2000, "high")];
    const result = computeDistanceSuitability(races, TARGET);
    // weightSum = 1.0*3 + 0.6*1 = 3.6, weightedAvg = (100*3 + 0*0.6) / 3.6 = 83.3...
    expect(result.basis.weightedRaceScoreAverage).toBeCloseTo(83.3, 1);
    expect(result.sampleCount).toBe(4);
  });

  it("距離帯の重み定数がDISTANCE_MATCH_WEIGHTSの想定どおり", () => {
    expect(DISTANCE_MATCH_WEIGHTS.sameDistance).toBe(1.0);
    expect(DISTANCE_MATCH_WEIGHTS.sameBand).toBe(0.6);
    expect(DISTANCE_MATCH_WEIGHTS.adjacentBand).toBe(0.3);
    expect(DISTANCE_MATCH_WEIGHTS.other).toBe(0);
  });

  it("帯が2つ以上離れた距離は重み0で対象外になる", () => {
    // target=2000(middle帯)。1200(short帯)はmiddleと2帯離れているため除外される
    const races = [makeRace(1200, "high"), makeRace(1200, "high")];
    const result = computeDistanceSuitability(races, TARGET);
    expect(result.sampleCount).toBe(0);
  });

  it("distanceChangeMetersは対象距離−直近5走平均距離として記録される（数値には使わない）", () => {
    const races = [makeRace(2500, 70), makeRace(2500, 70)];
    const result = computeDistanceSuitability(races, TARGET);
    expect(result.distanceChangeMeters).toBeCloseTo(2000 - 2500, 5);
  });

  it("surfaceが異なる過去走は対象外にする", () => {
    const dirtRace = makeRace(2000, "high", { surface: "dirt" });
    const result = computeDistanceSuitability([dirtRace], TARGET);
    expect(result.sampleCount).toBe(0);
  });
});

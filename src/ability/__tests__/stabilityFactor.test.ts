import { describe, expect, it } from "vitest";
import {
  computeDownsideSemiDeviation,
  computeStabilityFactor,
  STABILITY_FACTOR_NEUTRAL,
} from "../stabilityFactor";
import type { RacePerformance } from "../types";

function race(raceScore: number): RacePerformance {
  return {
    raceId: `r-${Math.random()}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    timeGapScore: 70,
    raceTime: 120,
    raceTimeScore: 70,
    raceTimeBreakdown: null,
    final3F: 34,
    final3FScore: 70,
    final3FBreakdown: {
      horseFinal3FSeconds: 34,
      raceFinal3FMedianSeconds: 34,
      relativeDiffSeconds: 0,
      courseBaselineSeconds: null,
      trackAdjustment: null,
      absoluteDiffSeconds: null,
      baselineMeta: { baselineSource: "defaultFallback", sampleCount: null, isReliable: false, dataSource: null },
    },
    carriedWeight: 56,
    weightScore: 70,
    weightBreakdown: {
      horseCarriedWeightKg: 56,
      raceMedianWeightKg: 56,
      weightDiffKg: 0,
      distance: 2000,
      secondsPerKg: 0,
      weightAdjustmentSeconds: 0,
      isReliable: true,
    },
    memberLevelScoreAtRace: 70,
    retrospectiveMemberLevelScore: null,
    memberLevelBreakdown: null,
    raceScore,
  };
}

describe("computeDownsideSemiDeviation", () => {
  it("全て平均以上（下振れ無し）なら0", () => {
    expect(computeDownsideSemiDeviation([80, 80, 80])).toBe(0);
    expect(computeDownsideSemiDeviation([70, 80, 90])).not.toBeNaN();
  });

  it("同じ大きさの乖離でも、上振れより下振れの方が値が大きくなる（上振れは軽いペナルティしか生まない）", () => {
    // 平均を押し上げるため上振れも他の値を相対的に「平均未満」にしてしまうが、
    // それでも下振れ由来（downOutlier）の方が明確に大きくなることを確認する
    const downOutlier = computeDownsideSemiDeviation([70, 70, 70, 70, 40]);
    const upOutlier = computeDownsideSemiDeviation([70, 70, 70, 70, 100]);
    expect(downOutlier).toBeGreaterThan(upOutlier);
  });

  it("下振れが大きいほど値が大きくなる", () => {
    const small = computeDownsideSemiDeviation([78, 80, 82, 76, 75]);
    const large = computeDownsideSemiDeviation([90, 80, 82, 40, 75]);
    expect(large).toBeGreaterThan(small);
  });

  it("空配列は0", () => {
    expect(computeDownsideSemiDeviation([])).toBe(0);
  });
});

describe("computeStabilityFactor", () => {
  it("下振れの無い5走は高いstabilityFactorになる", () => {
    const races = [race(80), race(80), race(80), race(80), race(80)];
    const result = computeStabilityFactor(races);
    expect(result.downsideSemiDeviation).toBe(0);
    expect(result.stabilityFactor).toBeGreaterThan(STABILITY_FACTOR_NEUTRAL);
    expect(result.stabilityConfidence).toBe("high"); // 5走 >= 4
  });

  it("大きく下振れする馬は低いstabilityFactorになる", () => {
    const races = [race(90), race(88), race(40), race(35), race(92)];
    const result = computeStabilityFactor(races);
    expect(result.stabilityFactor).toBeLessThan(STABILITY_FACTOR_NEUTRAL);
  });

  it("サンプル数が少ない（5走中2走）場合、NEUTRAL側へ縮小され、'不安定'と断定しない", () => {
    const volatileFull = computeStabilityFactor([race(90), race(88), race(40), race(35), race(92)]);
    const volatilePartial = computeStabilityFactor([race(40), race(35)]);
    // 同じ下振れ傾向でも、サンプルが少ない方はNEUTRALに近い（=断定的に低くならない）
    expect(volatilePartial.stabilityFactor).toBeGreaterThan(volatileFull.stabilityFactor);
    expect(volatilePartial.stabilityConfidence).not.toBe("high");
  });

  it("サンプル数が少ない場合、'能力が低い'とは別軸としてconfidenceが独立して報告される", () => {
    const result = computeStabilityFactor([race(40), race(35)]);
    expect(result.sampleCount).toBe(2);
    expect(result.stabilityConfidence).toBe("medium"); // 2〜3走
    expect(typeof result.stabilityFactor).toBe("number");
  });

  it("過去走が0件でも壊れない（NEUTRAL・low confidence）", () => {
    const result = computeStabilityFactor([]);
    expect(result.sampleCount).toBe(0);
    expect(result.stabilityConfidence).toBe("low");
    expect(result.stabilityFactor).toBeGreaterThanOrEqual(0);
    expect(result.stabilityFactor).toBeLessThanOrEqual(100);
  });

  it("直近5走まで（RECENT_RACE_COUNTと同じ母集団）しか見ない", () => {
    const races = [race(50), race(50), race(50), race(50), race(50), race(0), race(0)];
    const result = computeStabilityFactor(races);
    expect(result.sampleCount).toBe(5);
    expect(result.downsideSemiDeviation).toBe(0); // 6走目以降の極端な下振れは無視される
  });

  it("0〜100にclampされる", () => {
    const result = computeStabilityFactor([race(100), race(0), race(100), race(0), race(100)]);
    expect(result.stabilityFactor).toBeGreaterThanOrEqual(0);
    expect(result.stabilityFactor).toBeLessThanOrEqual(100);
  });
});

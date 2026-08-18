import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import {
  closernessToDistribution,
  computeAutoRunningStyle,
  dominantRunningStyle,
  resolveAutoRunningStyle,
  resolveRunningStyle,
  runningStyleLeanScore,
} from "../runningStyle";
import type { RunningStyleProfile } from "../raceContextTypes";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";

describe("closernessToDistribution", () => {
  it("closeness=-1は逃げ100%", () => {
    expect(closernessToDistribution(-1)).toEqual({ nige: 100, senko: 0, sashi: 0, oikomi: 0 });
  });

  it("closeness=+1は追込100%", () => {
    expect(closernessToDistribution(1)).toEqual({ nige: 0, senko: 0, sashi: 0, oikomi: 100 });
  });

  it("closeness=0は先行/差しの中間（50/50）", () => {
    const dist = closernessToDistribution(0);
    expect(dist.senko).toBeCloseTo(50, 1);
    expect(dist.sashi).toBeCloseTo(50, 1);
    expect(dist.nige).toBe(0);
    expect(dist.oikomi).toBe(0);
  });

  it("closeness=-1/3は先行100%、+1/3は差し100%", () => {
    expect(closernessToDistribution(-1 / 3).senko).toBeCloseTo(100, 1);
    expect(closernessToDistribution(1 / 3).sashi).toBeCloseTo(100, 1);
  });

  it("範囲外の値は-1〜1にclampされる", () => {
    expect(closernessToDistribution(-5)).toEqual(closernessToDistribution(-1));
    expect(closernessToDistribution(5)).toEqual(closernessToDistribution(1));
  });
});

describe("runningStyleLeanScore", () => {
  it("純粋な逃げ分布は-1", () => {
    expect(runningStyleLeanScore({ nige: 100, senko: 0, sashi: 0, oikomi: 0 })).toBeCloseTo(-1, 5);
  });

  it("純粋な追込分布は+1", () => {
    expect(runningStyleLeanScore({ nige: 0, senko: 0, sashi: 0, oikomi: 100 })).toBeCloseTo(1, 5);
  });

  it("中立分布(25/25/25/25)は0", () => {
    expect(runningStyleLeanScore({ nige: 25, senko: 25, sashi: 25, oikomi: 25 })).toBeCloseTo(0, 5);
  });
});

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

function makeRace(
  relativeDiffSeconds: number,
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  return buildRacePerformance({
    raceId: `race-${relativeDiffSeconds}-${Math.random()}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "阪神",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 70,
    raceTimeScore: 70,
    final3FScore: 70,
    weightScore: 70,
    memberLevelBreakdown: cleanMemberLevelBreakdown(),
    final3FBreakdown: {
      horseFinal3FSeconds: 34 - relativeDiffSeconds,
      raceFinal3FMedianSeconds: 34,
      relativeDiffSeconds,
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

describe("computeAutoRunningStyle", () => {
  it("過去走が無ければ中立分布・sampleCount=0・confidence=low・source=insufficientData", () => {
    const result = computeAutoRunningStyle([]);
    expect(result.distribution).toEqual({ nige: 25, senko: 25, sashi: 25, oikomi: 25 });
    expect(result.sampleCount).toBe(0);
    expect(result.confidence).toBe("low");
    expect(result.source).toBe("insufficientData");
  });

  it("上がり3Fが相対的に速い(正の値)ほど差し/追込寄りの分布になる", () => {
    const result = computeAutoRunningStyle([makeRace(0.8), makeRace(0.8)]);
    const lean = result.distribution.sashi * (1 / 3) + result.distribution.oikomi * 1 - result.distribution.nige * 1 - result.distribution.senko * (1 / 3);
    expect(lean).toBeGreaterThan(0);
    expect(result.source).toBe("final3FProxy");
  });

  it("サンプル数に関わらずconfidenceは常にlow（通過順位データが無いため）", () => {
    const many = Array.from({ length: 5 }, () => makeRace(0.5));
    const result = computeAutoRunningStyle(many);
    expect(result.sampleCount).toBe(5);
    expect(result.confidence).toBe("low");
  });
});

describe("resolveRunningStyle", () => {
  const auto: RunningStyleProfile = {
    distribution: { nige: 25, senko: 25, sashi: 25, oikomi: 25 },
    sampleCount: 3,
    confidence: "low",
    source: "final3FProxy",
    reason: "auto",
  };
  const manual: RunningStyleProfile = {
    distribution: { nige: 0, senko: 90, sashi: 10, oikomi: 0 },
    sampleCount: 0,
    confidence: "high",
    source: "manualInput",
    reason: "manual",
  };

  it("manualがあればmanualを優先する", () => {
    const result = resolveRunningStyle(auto, manual);
    expect(result.usedSource).toBe("manual");
    expect(result.actuallyUsed).toBe(manual);
  });

  it("manualが無ければautoを使う", () => {
    const result = resolveRunningStyle(auto, null);
    expect(result.usedSource).toBe("auto");
    expect(result.actuallyUsed).toBe(auto);
  });
});

describe("dominantRunningStyle", () => {
  it("最も比率が高いスタイルを返す", () => {
    expect(dominantRunningStyle({ nige: 60, senko: 20, sashi: 10, oikomi: 10 })).toBe("nige");
    expect(dominantRunningStyle({ nige: 0, senko: 0, sashi: 0, oikomi: 100 })).toBe("oikomi");
  });
});

describe("resolveAutoRunningStyle（STEP5.1）", () => {
  const fallbackAuto: RunningStyleProfile = {
    distribution: { nige: 25, senko: 25, sashi: 25, oikomi: 25 },
    sampleCount: 3,
    confidence: "low",
    source: "final3FProxy",
    reason: "fallback",
  };
  const passingPositionAuto: RunningStyleProfile = {
    distribution: { nige: 100, senko: 0, sashi: 0, oikomi: 0 },
    sampleCount: 4,
    confidence: "high",
    source: "passingPosition",
    reason: "passingPosition",
  };

  it("通過順位ベースの推定があれば優先する", () => {
    expect(resolveAutoRunningStyle(passingPositionAuto, fallbackAuto)).toBe(passingPositionAuto);
  });

  it("通過順位ベースの推定が無ければ既存fallback(final3Fベース)をそのまま使う（挙動不変）", () => {
    expect(resolveAutoRunningStyle(null, fallbackAuto)).toBe(fallbackAuto);
  });
});

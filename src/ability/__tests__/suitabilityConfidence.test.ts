import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import {
  baseConfidenceFromSampleCount,
  CONFIDENCE_SHRINK_WEIGHTS,
  hasDataQualityIssue,
  resolveConfidence,
  shrinkTowardCenter,
} from "../suitabilityConfidence";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}

function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

function makeRace(overrides: Partial<RacePerformanceInput> = {}): ReturnType<typeof buildRacePerformance> {
  return buildRacePerformance({
    raceId: "test",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "阪神",
    surface: "turf",
    distance: 2000,
    going: "重",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 80,
    raceTimeScore: 80,
    final3FScore: 80,
    weightScore: 80,
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

describe("baseConfidenceFromSampleCount", () => {
  it("4走以上は高", () => {
    expect(baseConfidenceFromSampleCount(4)).toBe("high");
    expect(baseConfidenceFromSampleCount(10)).toBe("high");
  });

  it("2〜3走は中", () => {
    expect(baseConfidenceFromSampleCount(2)).toBe("medium");
    expect(baseConfidenceFromSampleCount(3)).toBe("medium");
  });

  it("0〜1走は低", () => {
    expect(baseConfidenceFromSampleCount(0)).toBe("low");
    expect(baseConfidenceFromSampleCount(1)).toBe("low");
  });
});

describe("shrinkTowardCenter", () => {
  it("仕様の例: raw=110・confidence=低 → 103", () => {
    expect(shrinkTowardCenter(110, "low")).toBeCloseTo(103, 5);
  });

  it("confidence=高はrawをそのまま維持する（weight=1.0）", () => {
    expect(shrinkTowardCenter(123.4, "high")).toBeCloseTo(123.4, 5);
    expect(CONFIDENCE_SHRINK_WEIGHTS.high).toBe(1.0);
  });

  it("confidence=中はweight=0.6で縮小する", () => {
    // 100 + (120-100)*0.6 = 112
    expect(shrinkTowardCenter(120, "medium")).toBeCloseTo(112, 5);
  });

  it("raw=100（中立）はどのconfidenceでも100のまま", () => {
    expect(shrinkTowardCenter(100, "low")).toBeCloseTo(100, 5);
    expect(shrinkTowardCenter(100, "medium")).toBeCloseTo(100, 5);
    expect(shrinkTowardCenter(100, "high")).toBeCloseTo(100, 5);
  });
});

describe("hasDataQualityIssue", () => {
  it("memberLevelBreakdownがnull（fallback）の場合はtrue", () => {
    const race = makeRace({ memberLevelBreakdown: null });
    expect(hasDataQualityIssue(race)).toBe(true);
  });

  it("final3FのdataSourceがV0仮データ由来の場合はtrue", () => {
    const race = makeRace({
      final3FBreakdown: {
        horseFinal3FSeconds: 34,
        raceFinal3FMedianSeconds: 34,
        relativeDiffSeconds: 0,
        courseBaselineSeconds: 34,
        trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true },
        absoluteDiffSeconds: 0,
        baselineMeta: {
          baselineSource: "distanceFallback",
          sampleCount: 30,
          isReliable: false,
          dataSource: "V0テスト用仮データ（実データ未投入）",
        },
      },
    });
    expect(hasDataQualityIssue(race)).toBe(true);
  });

  it("実データかつmemberLevelBreakdownありのクリーンなレースはfalse", () => {
    const race = makeRace();
    expect(hasDataQualityIssue(race)).toBe(false);
  });
});

describe("resolveConfidence", () => {
  it("データ品質問題が無ければsampleCountどおりのconfidenceになる", () => {
    const races = [makeRace(), makeRace(), makeRace(), makeRace()];
    expect(resolveConfidence(4, races)).toBe("high");
  });

  it("データ品質問題がある過去走が1件でも含まれると1段階下がる（高→中）", () => {
    const races = [makeRace(), makeRace(), makeRace(), makeRace({ memberLevelBreakdown: null })];
    expect(resolveConfidence(4, races)).toBe("medium");
  });

  it("中→低にも1段階下がる", () => {
    const races = [makeRace(), makeRace({ memberLevelBreakdown: null })];
    expect(resolveConfidence(2, races)).toBe("low");
  });

  it("低はそれ以上下がらない", () => {
    const races = [makeRace({ memberLevelBreakdown: null })];
    expect(resolveConfidence(1, races)).toBe("low");
  });
});

import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeFinalRaceAbility } from "../finalRaceAbility";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";
import type { RaceContextTargetInfo, RunningStyleDistribution, RunningStyleProfile, TrackBiasObservation } from "../raceContextTypes";

function cleanMemberLevelBreakdown(): MemberLevelBreakdown {
  return { top3Average: 70, top5Average: 65, fieldAverage: 60, depthScore: 80, participantCount: 10 };
}
function cleanBaselineMeta(): BaselineMeta {
  return { baselineSource: "exact", sampleCount: 20, isReliable: true, dataSource: "JRA確認済みサンプル(n=20) verified" };
}

/** STEP4のsuitabilityが常に100%になる（=effectiveAbility=baseAbility）よう、対象条件と完全一致させたレース */
function makeMatchingRace(overrides: Partial<RacePerformanceInput> = {}): ReturnType<typeof buildRacePerformance> {
  return buildRacePerformance({
    raceId: `race-${Math.random()}`,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 75,
    raceTimeScore: 75,
    final3FScore: 75,
    weightScore: 75,
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

const SUITABILITY_TARGET: SuitabilityTargetRaceContext = { racecourse: "札幌", surface: "turf", distance: 2000, going: "良" };
const RACE_CONTEXT_TARGET: RaceContextTargetInfo = { raceId: "JRA-20260816-SAPPORO-11", raceDate: "2026-08-16", raceNumber: 11 };

const PURE_OIKOMI: RunningStyleDistribution = { nige: 0, senko: 0, sashi: 0, oikomi: 100 };
const PURE_NIGE: RunningStyleDistribution = { nige: 100, senko: 0, sashi: 0, oikomi: 0 };

function manualStyle(distribution: RunningStyleDistribution, confidence: RunningStyleProfile["confidence"] = "high"): RunningStyleProfile {
  return { distribution, sampleCount: 0, confidence, source: "manualInput", reason: "manual test input" };
}

function fieldGivingAveragePace(): RunningStyleDistribution[] {
  // 逃げ候補0・先行候補1 → 平均ペース想定
  return [{ nige: 10, senko: 60, sashi: 20, oikomi: 10 }, { nige: 10, senko: 10, sashi: 20, oikomi: 60 }];
}
function fieldGivingHighPace(): RunningStyleDistribution[] {
  // 逃げ候補2 → ハイペース想定
  return [
    { nige: 60, senko: 20, sashi: 10, oikomi: 10 },
    { nige: 60, senko: 20, sashi: 10, oikomi: 10 },
    { nige: 10, senko: 10, sashi: 20, oikomi: 60 },
  ];
}

function manualTrackBias(
  frontBackBias: TrackBiasObservation["frontBackBias"],
  confidence: TrackBiasObservation["confidence"] = "high",
  overrides: Partial<TrackBiasObservation> = {},
): TrackBiasObservation {
  return {
    frontBackBias,
    insideOutsideBias: "neutral",
    confidence,
    source: "テスト入力",
    observedAt: "2026-08-16T10:00:00Z",
    observedRaceId: "JRA-20260816-SAPPORO-5",
    observedRaceDate: "2026-08-16",
    observedRaceNumber: 5,
    dayRelation: "sameDay",
    ...overrides,
  };
}

describe("computeFinalRaceAbility", () => {
  const races5 = [makeMatchingRace(), makeMatchingRace(), makeMatchingRace(), makeMatchingRace(), makeMatchingRace()];

  it("① pace=100・trackBias=100（情報なし）ならfinalRaceAbility=effectiveAbility=baseAbility", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.suitability.overallSuitability).toBe(100);
    expect(result.effectiveAbility).toBe(80);
    expect(result.raceContext.paceScenarioFactor.adjusted).toBeCloseTo(100, 5); // 平均ペース→中立
    expect(result.raceContext.trackBiasFactor.adjusted).toBe(100); // 情報なし→中立
    expect(result.raceContext.value).toBeCloseTo(100, 5);
    expect(result.finalRaceAbility).toBe(80);
  });

  it("② ハイペース×追込傾向でpaceScenarioFactorが正しく増加する（105%）", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI, "high"),
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.predictedPace.level).toBe("high");
    expect(result.raceContext.paceScenarioFactor.adjusted).toBeCloseTo(105, 5);
    expect(result.finalRaceAbility).toBeCloseTo(80 * 1.05, 5);
  });

  it("③ ハイペース×逃げ傾向でpaceScenarioFactorが正しく低下する（95%）", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.raceContext.paceScenarioFactor.adjusted).toBeCloseTo(95, 5);
    expect(result.finalRaceAbility).toBeCloseTo(80 * 0.95, 5);
  });

  it("④ trackBiasFactorも95〜105を超えない", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: manualTrackBias("front", "high"),
      autoTrackBias: null,
    });
    expect(result.raceContext.trackBiasFactor.adjusted).toBeCloseTo(105, 5);
    expect(result.raceContext.trackBiasFactor.adjusted).toBeLessThanOrEqual(105);
    expect(result.raceContext.trackBiasFactor.adjusted).toBeGreaterThanOrEqual(95);
  });

  it("⑤ 統合後のraceContextFactorが90〜110を超えない", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI, "high"),
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: manualTrackBias("closer", "high"),
      autoTrackBias: null,
    });
    // pace=105・trackBias=105 → raw=110.25 → clampされ110
    expect(result.raceContext.value).toBe(110);
    expect(result.finalRaceAbility).toBeCloseTo(80 * 1.1, 5);
  });

  it("⑥ auto脚質（confidence常にlow）はpaceScenarioFactorが100方向へ縮小される", () => {
    const closerLeaningRaces = [
      makeMatchingRace({ final3FBreakdown: { horseFinal3FSeconds: 33.4, raceFinal3FMedianSeconds: 34, relativeDiffSeconds: 0.6, courseBaselineSeconds: 34, trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true }, absoluteDiffSeconds: 0, baselineMeta: cleanBaselineMeta() } }),
      makeMatchingRace({ final3FBreakdown: { horseFinal3FSeconds: 33.4, raceFinal3FMedianSeconds: 34, relativeDiffSeconds: 0.6, courseBaselineSeconds: 34, trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true }, absoluteDiffSeconds: 0, baselineMeta: cleanBaselineMeta() } }),
    ];
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: closerLeaningRaces,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null, // autoにフォールバック
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.runningStyleUsedSource).toBe("auto");
    expect(result.autoRunningStyle.confidence).toBe("low");
    const { raw, adjusted } = result.raceContext.paceScenarioFactor;
    if (raw !== 100) {
      expect(Math.abs(adjusted - 100)).toBeLessThan(Math.abs(raw - 100));
    }
  });

  it("⑦ manualRunningStyleが指定されればautoより優先される", () => {
    const nigeLeaningRaces = [
      makeMatchingRace({ final3FBreakdown: { horseFinal3FSeconds: 34.6, raceFinal3FMedianSeconds: 34, relativeDiffSeconds: -0.6, courseBaselineSeconds: 34, trackAdjustment: { adjustmentSeconds: 0, sampleCount: 10, isReliable: true }, absoluteDiffSeconds: 0, baselineMeta: cleanBaselineMeta() } }),
    ];
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: nigeLeaningRaces,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI, "high"), // autoとは逆の傾向を手動指定
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.runningStyleUsedSource).toBe("manual");
    expect(result.runningStyle.distribution).toEqual(PURE_OIKOMI);
    // ハイペース×追込(manual優先)なので有利方向(105%)になっているはず
    expect(result.raceContext.paceScenarioFactor.adjusted).toBeCloseTo(105, 5);
  });

  it("⑧ manualTrackBiasが指定されればautoより優先される", () => {
    const auto = manualTrackBias("closer", "high", { source: "auto-mock" });
    const manual = manualTrackBias("front", "high", { source: "manual-mock" });
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: manual,
      autoTrackBias: auto,
    });
    expect(result.raceContext.trackBiasFactor.usedSource).toBe("manual");
    // 前有利(manual)×逃げ傾向 → 有利(105%)
    expect(result.raceContext.trackBiasFactor.adjusted).toBeCloseTo(105, 5);
  });

  it("⑨ trackBias情報が無ければneutral(100%)になる", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.raceContext.trackBiasFactor.usedSource).toBe("neutral");
    expect(result.raceContext.trackBiasFactor.adjusted).toBe(100);
  });

  it("⑩ future leakageに該当するmanualTrackBias（自己参照・未来日付）は事前予想に使用されない", () => {
    const selfReferencing = manualTrackBias("front", "high", {
      observedRaceId: RACE_CONTEXT_TARGET.raceId,
      observedRaceDate: RACE_CONTEXT_TARGET.raceDate,
      observedRaceNumber: 11,
    });
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: selfReferencing,
      autoTrackBias: null,
    });
    // 自己参照は棄却され、autoも無いためneutralへフォールバックする
    expect(result.raceContext.trackBiasFactor.usedSource).toBe("neutral");
    expect(result.raceContext.trackBiasFactor.adjusted).toBe(100);

    const futureDated = manualTrackBias("front", "high", { observedRaceDate: "2026-08-17", observedRaceNumber: 1 });
    const result2 = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: futureDated,
      autoTrackBias: null,
    });
    expect(result2.raceContext.trackBiasFactor.usedSource).toBe("neutral");
  });

  it("⑪ baseAbility/suitability自体はSTEP5の入力によって変更されない", () => {
    const inputsA = {
      baseAbility: 71.8,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI, "high"),
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: manualTrackBias("closer", "high"),
      autoTrackBias: null,
    };
    const inputsB = { ...inputsA, manualRunningStyle: manualStyle(PURE_NIGE, "high"), manualTrackBias: manualTrackBias("front", "high") };

    const resultA = computeFinalRaceAbility(inputsA);
    const resultB = computeFinalRaceAbility(inputsB);

    expect(resultA.baseAbility).toBe(71.8);
    expect(resultB.baseAbility).toBe(71.8);
    expect(resultA.suitability.overallSuitability).toBe(resultB.suitability.overallSuitability);
    expect(resultA.effectiveAbility).toBe(resultB.effectiveAbility);
    expect(resultA.effectiveAbility).toBe(71.8);
    // STEP5側は変わっているのにSTEP4までは完全に不変であることの確認
    expect(resultA.finalRaceAbility).not.toBe(resultB.finalRaceAbility);
  });
});

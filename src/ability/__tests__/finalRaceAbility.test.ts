import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeFinalRaceAbility } from "../finalRaceAbility";
import type { RaceGateInput } from "../courseContextPrior";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";
import type { RaceContextTargetInfo, RunningStyleDistribution, RunningStyleProfile, TrackBiasObservation } from "../raceContextTypes";

const TEST_HORSE_ID = "test-horse";
/** gate情報が無いテスト（枠番の影響を対象としないケース）向けの共通null補完。推測値ではなく「不明」の明示 */
const NO_GATE_INFO: RaceGateInput = { horseNumber: null, fieldSize: null, frame: null };

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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.suitability.overallSuitabilityPercent).toBe(100);
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
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
    expect(resultA.suitability.overallSuitabilityPercent).toBe(resultB.suitability.overallSuitabilityPercent);
    expect(resultA.effectiveAbility).toBe(resultB.effectiveAbility);
    expect(resultA.effectiveAbility).toBe(71.8);
    // STEP5側は変わっているのにSTEP4までは完全に不変であることの確認
    expect(resultA.finalRaceAbility).not.toBe(resultB.finalRaceAbility);
  });
});

describe("computeFinalRaceAbility - STEP5.1: 通過順位データ統合", () => {
  const races5 = [makeMatchingRace(), makeMatchingRace(), makeMatchingRace(), makeMatchingRace(), makeMatchingRace()];

  function racesWithPassingPosition(cornerPositionsList: number[][], fieldSize = 10) {
    return cornerPositionsList.map((cornerPositions) =>
      makeMatchingRace({
        passingPosition: { cornerPositions, fieldSize, source: "テストデータ", isReliable: true },
      }),
    );
  }

  it("1. 通過順位データがある場合、それがautoRunningStyleの第一優先になる（fallbackAutoより優先）", () => {
    // 4走とも1番手(逃げ)の通過順位データを持たせる
    const racesNige = racesWithPassingPosition([[1], [1], [1], [1]]);
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: racesNige,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.passingPositionRunningStyle).not.toBeNull();
    expect(result.autoRunningStyleSource).toBe("passingPosition");
    expect(result.autoRunningStyle).toBe(result.passingPositionRunningStyle);
    expect(result.autoRunningStyle.distribution.nige).toBeCloseTo(100, 1);
    expect(result.autoRunningStyle.confidence).toBe("high"); // 4走分の有効データ
    expect(result.runningStyleUsedSource).toBe("auto");
  });

  it("2. manualRunningStyleは通過順位autoより優先される", () => {
    const racesNige = racesWithPassingPosition([[1], [1], [1], [1]]);
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: racesNige,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_OIKOMI, "high"),
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.runningStyleUsedSource).toBe("manual");
    expect(result.runningStyle.distribution).toEqual(PURE_OIKOMI);
    // passingPositionRunningStyleは削除されず保持されている（逃げ寄りのはず）
    expect(result.passingPositionRunningStyle).not.toBeNull();
    expect(result.passingPositionRunningStyle!.distribution.nige).toBeCloseTo(100, 1);
  });

  it("3. 通過順位が無い場合、既存fallback auto(final3Fベース)へ戻る", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5, // passingPositionを持たない
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.passingPositionRunningStyle).toBeNull();
    expect(result.autoRunningStyleSource).toBe(result.fallbackAutoRunningStyle.source);
    expect(result.autoRunningStyle).toBe(result.fallbackAutoRunningStyle);
    expect(result.validPassingPositionSampleCount).toBe(0);
  });

  it("4. manual/通過順位/fallbackすべて材料が無ければ中立分布になる（fallbackAuto自体が中立を返す）", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: [], // 過去走ゼロ
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.runningStyle.distribution).toEqual({ nige: 25, senko: 25, sashi: 25, oikomi: 25 });
    expect(result.runningStyle.source).toBe("insufficientData");
  });

  it("5〜7. positionRatio・複数走からのdistribution・confidenceが統合結果へ正しく反映される", () => {
    // 1番手(逃げ)を2走、8/10番手(追込寄り)を1走 → 逃げ2/追込1のdistribution、sampleCount=3→confidence=medium
    const races = racesWithPassingPosition([[1], [1], [8, 8]], 10);
    const result = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(result.validPassingPositionSampleCount).toBe(3);
    expect(result.autoRunningStyle.distribution.nige).toBeCloseTo(66.7, 1);
    expect(result.autoRunningStyle.distribution.oikomi).toBeCloseTo(33.3, 1);
    expect(result.autoRunningStyle.dominantStyle).toBe("nige");
    expect(result.autoRunningStyle.confidence).toBe("medium"); // 3走
  });

  it("8. future leakage: recentRacesに対象レース自身が紛れ込んでいても計算から除外される", () => {
    const selfRace = makeMatchingRace({
      raceId: RACE_CONTEXT_TARGET.raceId,
      passingPosition: { cornerPositions: [1], fieldSize: 10, source: "test", isReliable: true },
    });
    const withoutSelf = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: races5,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    const withSelfLeaked = computeFinalRaceAbility({
      baseAbility: 80,
      recentRaces: [selfRace, ...races5],
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    // 対象レース自身のpassingPositionが計算に混入していれば通過順位autoが採用されてしまうが、
    // future leakageガードにより除外されるため、結果はwithoutSelfと同一になるはず
    expect(withSelfLeaked.passingPositionRunningStyle).toBeNull();
    expect(withSelfLeaked.autoRunningStyleSource).toBe(withoutSelf.autoRunningStyleSource);
    expect(withSelfLeaked.effectiveAbility).toBe(withoutSelf.effectiveAbility);
  });

  it("9. 通過順位データが無い既存馬のSTEP5結果は、STEP5.1導入前と不必要に変化しない", () => {
    const result = computeFinalRaceAbility({
      baseAbility: 71.8,
      recentRaces: races5,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle(PURE_NIGE, "high"),
      fieldRunningStyleDistributions: fieldGivingHighPace(),
      manualTrackBias: manualTrackBias("front", "high"),
      autoTrackBias: null,
    });
    // 通過順位データが無いため、manual > fallbackAuto という従来どおりのチェーンで解決される
    expect(result.passingPositionRunningStyle).toBeNull();
    expect(result.runningStyleUsedSource).toBe("manual");
    // ハイペース×逃げ傾向(PURE_NIGE)は不利方向になる（従来どおりの計算結果、シナリオ③と同じ式）
    expect(result.raceContext.paceScenarioFactor.adjusted).toBeCloseTo(95, 5);
  });

  it("10. baseAbility/suitabilityの値は通過順位データの有無によって変更されない", () => {
    const racesNige = racesWithPassingPosition([[1], [1], [1], [1]]);
    const resultWithPassing = computeFinalRaceAbility({
      baseAbility: 71.8,
      recentRaces: racesNige,
      horseId: TEST_HORSE_ID,
      gate: NO_GATE_INFO,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: null,
      fieldRunningStyleDistributions: fieldGivingAveragePace(),
      manualTrackBias: null,
      autoTrackBias: null,
    });
    expect(resultWithPassing.baseAbility).toBe(71.8);
    expect(resultWithPassing.effectiveAbility).toBe(71.8); // races全て対象条件一致→suitability=100%
    expect(resultWithPassing.suitability.overallSuitabilityPercent).toBe(100);
  });
});

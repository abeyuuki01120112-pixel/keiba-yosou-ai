import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import { computeFinalRaceAbility } from "../finalRaceAbility";
import { evaluateRaceOutcomes, resolveEvaluationConfidence } from "../raceOutcomeEvaluation";
import type { HorseOutcomeInput } from "../raceOutcomeTypes";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityTargetRaceContext } from "../suitabilityTypes";
import type { FinalRaceAbilityResult, RaceContextTargetInfo, RunningStyleDistribution, RunningStyleProfile } from "../raceContextTypes";

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

function makeMatchingRace(raceScoreLevel: number, overrides: Partial<RacePerformanceInput> = {}): ReturnType<typeof buildRacePerformance> {
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
    memberLevelScoreAtRace: raceScoreLevel,
    raceTimeScore: raceScoreLevel,
    final3FScore: raceScoreLevel,
    weightScore: raceScoreLevel,
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
const NEUTRAL_DISTRIBUTION: RunningStyleDistribution = { nige: 10, senko: 40, sashi: 40, oikomi: 10 };

function manualStyle(confidence: RunningStyleProfile["confidence"] = "high"): RunningStyleProfile {
  return { distribution: NEUTRAL_DISTRIBUTION, sampleCount: 0, confidence, source: "manualInput", reason: "manual test input" };
}

function buildFinalRaceAbility(raceScoreLevel: number, confidence: RunningStyleProfile["confidence"] = "high"): FinalRaceAbilityResult {
  const races5 = Array.from({ length: 5 }, () => makeMatchingRace(raceScoreLevel));
  return computeFinalRaceAbility({
    baseAbility: raceScoreLevel,
    recentRaces: races5,
    suitabilityTarget: SUITABILITY_TARGET,
    raceContextTarget: RACE_CONTEXT_TARGET,
    manualRunningStyle: manualStyle(confidence),
    fieldRunningStyleDistributions: [NEUTRAL_DISTRIBUTION, NEUTRAL_DISTRIBUTION],
    manualTrackBias: null,
    autoTrackBias: null,
  });
}

function horseInput(
  horseId: string,
  horseName: string,
  raceScoreLevel: number,
  overrides: Partial<HorseOutcomeInput> = {},
): HorseOutcomeInput {
  const races5 = Array.from({ length: 5 }, () => makeMatchingRace(raceScoreLevel));
  return {
    horseId,
    horseName,
    scratched: false,
    finalRaceAbilityResult: buildFinalRaceAbility(raceScoreLevel),
    recentRaces: races5,
    ...overrides,
  };
}

describe("evaluateRaceOutcomes", () => {
  const field = [
    horseInput("h1", "馬A", 85),
    horseInput("h2", "馬B", 78),
    horseInput("h3", "馬C", 72),
    horseInput("h4", "馬D", 65),
    horseInput("h5", "馬E", 58),
  ];

  it("① ΣwinProbability=100% ② Σtop2Probability=200% ③ Σtop3Probability=300%", () => {
    const results = evaluateRaceOutcomes(field);
    expect(results.reduce((s, r) => s + r.winProbability, 0)).toBeCloseTo(100, 0);
    expect(results.reduce((s, r) => s + r.top2Probability, 0)).toBeCloseTo(200, 0);
    expect(results.reduce((s, r) => s + r.top3Probability, 0)).toBeCloseTo(300, 0);
  });

  it("④⑤ 各馬 win<=top2<=top3、かつ0〜100%の範囲", () => {
    const results = evaluateRaceOutcomes(field);
    for (const r of results) {
      expect(r.winProbability).toBeGreaterThanOrEqual(0);
      expect(r.winProbability).toBeLessThanOrEqual(r.top2Probability);
      expect(r.top2Probability).toBeLessThanOrEqual(r.top3Probability);
      expect(r.top3Probability).toBeLessThanOrEqual(100);
    }
  });

  it("⑥ 除外馬（scratched）はPLプール・スコアのfieldAverage・margin比較対象のすべてから除かれ、残りが再正規化される", () => {
    const withoutScratch = evaluateRaceOutcomes(field);
    const totalWinWithout = withoutScratch.reduce((s, r) => s + r.winProbability, 0);

    const scratchedField = field.map((h) => (h.horseId === "h1" ? { ...h, scratched: true } : h));
    const withScratch = evaluateRaceOutcomes(scratchedField);

    expect(withScratch.find((r) => r.horseId === "h1")).toBeUndefined();
    expect(withScratch).toHaveLength(4);
    // 除外後も残りの合計は同じく100%に再正規化される
    const totalWinWith = withScratch.reduce((s, r) => s + r.winProbability, 0);
    expect(totalWinWith).toBeCloseTo(100, 0);
    expect(totalWinWith).toBeCloseTo(totalWinWithout, 0);

    // 除外により、残った馬のwinProbabilityは除外前より上がる（h1という強い馬が消えたため）
    const h2Before = withoutScratch.find((r) => r.horseId === "h2")!.winProbability;
    const h2After = withScratch.find((r) => r.horseId === "h2")!.winProbability;
    expect(h2After).toBeGreaterThan(h2Before);
  });

  it("⑦ T=10が実際に適用されている（能力差から期待される確率順位になる）", () => {
    const results = evaluateRaceOutcomes(field);
    const byId = Object.fromEntries(results.map((r) => [r.horseId, r]));
    expect(byId.h1.winProbability).toBeGreaterThan(byId.h2.winProbability);
    expect(byId.h2.winProbability).toBeGreaterThan(byId.h3.winProbability);
  });

  it("⑧ score/probabilityは別変換であり、直接変換されていない", () => {
    const results = evaluateRaceOutcomes(field);
    for (const r of results) {
      expect(r.top2Probability).not.toBeCloseTo(r.winProbability * 2, 3);
      expect(r.winScore).not.toBeCloseTo(r.winProbability, 3);
    }
  });

  it("⑨ confidenceはprobabilityを直接変えない（Design A）", () => {
    const highConf = horseInput("hc", "馬High", 75, { finalRaceAbilityResult: buildFinalRaceAbility(75, "high") });
    const lowConf = horseInput("lc", "馬Low", 75, { finalRaceAbilityResult: buildFinalRaceAbility(75, "low") });
    const rival = horseInput("r", "馬Rival", 70);

    const highResult = evaluateRaceOutcomes([highConf, rival]).find((r) => r.horseId === "hc")!;
    const lowResult = evaluateRaceOutcomes([lowConf, rival]).find((r) => r.horseId === "lc")!;

    expect(highResult.winProbability).toBeCloseTo(lowResult.winProbability, 5);
    expect(highResult.winScore).toBeCloseTo(lowResult.winScore, 5);
  });

  it("⑩ winScore/top2Score/top3Scoreは0〜100の範囲", () => {
    const results = evaluateRaceOutcomes(field);
    for (const r of results) {
      for (const v of [r.winScore, r.top2Score, r.top3Score]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("⑬ 対象レース自身の結果（finishPosition等）は一切入力に含まれない（future leakage不可能な型設計）", () => {
    // HorseOutcomeInputはfinalRaceAbilityResultとrecentRaces（過去走）のみを受け取り、
    // 対象レース自身の結果を渡す経路が型として存在しない
    const results = evaluateRaceOutcomes(field);
    expect(results).toHaveLength(field.length);
    // 同一入力なら常に同一出力になる（対象レースの「結果」に依存する余地が無い決定的な計算であることの確認）
    const results2 = evaluateRaceOutcomes(field);
    expect(results).toEqual(results2);
  });

  it("必須フィールドが全て含まれる", () => {
    const [r] = evaluateRaceOutcomes(field);
    for (const key of [
      "horseId",
      "horseName",
      "baseAbility",
      "suitability",
      "finalRaceAbility",
      "winScore",
      "top2Score",
      "top3Score",
      "winProbability",
      "top2Probability",
      "top3Probability",
      "evaluationConfidence",
      "stabilityFactor",
      "stabilityConfidence",
    ] as const) {
      expect(r).toHaveProperty(key);
    }
  });

  it("空フィールド（全馬除外）でも壊れない", () => {
    const allScratched = field.map((h) => ({ ...h, scratched: true }));
    expect(evaluateRaceOutcomes(allScratched)).toEqual([]);
  });
});

describe("resolveEvaluationConfidence（weakest-link）", () => {
  it("suitability/runningStyle/pace/trackBiasのうち最も低いconfidenceが採用される", () => {
    const races5 = Array.from({ length: 5 }, () => makeMatchingRace(75));
    const highEverything = computeFinalRaceAbility({
      baseAbility: 75,
      recentRaces: races5,
      suitabilityTarget: SUITABILITY_TARGET,
      raceContextTarget: RACE_CONTEXT_TARGET,
      manualRunningStyle: manualStyle("high"),
      fieldRunningStyleDistributions: [NEUTRAL_DISTRIBUTION, NEUTRAL_DISTRIBUTION],
      manualTrackBias: {
        frontBackBias: "neutral",
        insideOutsideBias: "neutral",
        confidence: "high",
        source: "テスト入力",
        observedAt: "2026-08-16T10:00:00Z",
        observedRaceId: "JRA-20260816-SAPPORO-5",
        observedRaceDate: "2026-08-16",
        observedRaceNumber: 5,
        dayRelation: "sameDay",
      },
      autoTrackBias: null,
    });
    expect(resolveEvaluationConfidence(highEverything)).toBe("high");

    const lowRunningStyle = buildFinalRaceAbility(75, "low");
    expect(resolveEvaluationConfidence(lowRunningStyle)).toBe("low");
  });
});

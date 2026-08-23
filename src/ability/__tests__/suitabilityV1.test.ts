import { describe, expect, it } from "vitest";
import { roundToOneDecimal } from "../raceScore";
import { shrinkTowardCenter } from "../suitabilityConfidence";
import {
  aggregateSuitabilityComponents,
  computeSuitabilityV1,
  GATE_COURSE_PRIOR_AMPLITUDE,
  GATE_HORSE_EVIDENCE_AMPLITUDE,
  SUITABILITY_V1_SAFETY_MAX,
  SUITABILITY_V1_SAFETY_MIN,
} from "../suitabilityV1";
import type { SuitabilityComponentResultV1 } from "../suitabilityV1Types";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import type { BaselineMeta, MemberLevelBreakdown } from "../types";
import type { SuitabilityConfidence, SuitabilityTargetRaceContext } from "../suitabilityTypes";

/** CASE A〜D検証用: rawPercentとconfidenceから、本番と同じshrinkTowardCenterでadjustedPercentを作る */
function componentAt(
  key: SuitabilityComponentResultV1["key"],
  rawPercent: number,
  confidence: SuitabilityConfidence,
): SuitabilityComponentResultV1 {
  return {
    key,
    evaluated: true,
    rawPercent,
    adjustedPercent: roundToOneDecimal(shrinkTowardCenter(rawPercent, confidence)),
    confidence,
    reason: "test fixture",
    horseEvidence: { sampleCount: 5, confidence, reason: "test" },
    coursePrior: null,
  };
}

function unevaluated(key: SuitabilityComponentResultV1["key"]): SuitabilityComponentResultV1 {
  return {
    key,
    evaluated: false,
    rawPercent: 100,
    adjustedPercent: 100,
    confidence: "unknown",
    reason: "no evidence",
    horseEvidence: { sampleCount: 0, confidence: "unknown", reason: "no evidence" },
    coursePrior: null,
  };
}

describe("aggregateSuitabilityComponents（STEP9: CASE A〜D）", () => {
  it("CASE A: 全component raw=100 → overallSuitability=100（confidenceに関わらず）", () => {
    for (const confidence of ["high", "medium", "low"] as const) {
      const components = [
        componentAt("distance", 100, confidence),
        componentAt("course", 100, confidence),
        componentAt("going", 100, confidence),
        componentAt("gate", 100, confidence),
      ];
      const result = aggregateSuitabilityComponents(components);
      expect(result.overallSuitabilityPercent).toBe(100);
      expect(result.evaluatedComponentCount).toBe(4);
    }
  });

  it("CASE B: distance90/course95/going100/gate100 — confidence別の期待値", () => {
    const raws = { distance: 90, course: 95, going: 100, gate: 100 } as const;
    const expected: Record<SuitabilityConfidence, number> = { high: 96.3, medium: 97.8, low: 98.9 };
    for (const confidence of ["high", "medium", "low"] as const) {
      const components = (Object.keys(raws) as (keyof typeof raws)[]).map((key) => componentAt(key, raws[key], confidence));
      const result = aggregateSuitabilityComponents(components);
      expect(result.overallSuitabilityPercent).toBeCloseTo(expected[confidence], 5);
    }
  });

  it("CASE C: distance70/course90/going80/gate100 — confidence=highでも安全境界(60-120)に収まり歪められない", () => {
    const raws = { distance: 70, course: 90, going: 80, gate: 100 } as const;
    const expected: Record<SuitabilityConfidence, number> = { high: 85, medium: 91, low: 95.5 };
    for (const confidence of ["high", "medium", "low"] as const) {
      const components = (Object.keys(raws) as (keyof typeof raws)[]).map((key) => componentAt(key, raws[key], confidence));
      const result = aggregateSuitabilityComponents(components);
      expect(result.overallSuitabilityPercent).toBeCloseTo(expected[confidence], 5);
    }
    // confidence=highの85.0が、旧clamp(90,110)のように90へ引き上げられていないことを明示的に確認
    const highComponents = (Object.keys(raws) as (keyof typeof raws)[]).map((key) => componentAt(key, raws[key], "high"));
    expect(aggregateSuitabilityComponents(highComponents).overallSuitabilityPercent).toBeLessThan(90);
  });

  it("CASE D: distance105/course105/going100/gate102 — confidence別の期待値", () => {
    const raws = { distance: 105, course: 105, going: 100, gate: 102 } as const;
    const expected: Record<SuitabilityConfidence, number> = { high: 103, medium: 101.8, low: 100.9 };
    for (const confidence of ["high", "medium", "low"] as const) {
      const components = (Object.keys(raws) as (keyof typeof raws)[]).map((key) => componentAt(key, raws[key], confidence));
      const result = aggregateSuitabilityComponents(components);
      expect(result.overallSuitabilityPercent).toBeCloseTo(expected[confidence], 5);
    }
  });

  it("unknown（evaluated=false）のcomponentは平均に混ぜず除外する（100として埋めない）", () => {
    const components = [
      componentAt("distance", 70, "high"),
      unevaluated("course"),
      unevaluated("going"),
      unevaluated("gate"),
    ];
    const result = aggregateSuitabilityComponents(components);
    // 100を3つ混ぜて希釈された92.5ではなく、evaluatedな1件(distance=70)のみで算出される
    expect(result.overallSuitabilityPercent).toBe(70);
    expect(result.evaluatedComponentCount).toBe(1);
  });

  it("4component全てunknownの場合はoverallSuitability=100（中立）・evaluatedComponentCount=0", () => {
    const components = [unevaluated("distance"), unevaluated("course"), unevaluated("going"), unevaluated("gate")];
    const result = aggregateSuitabilityComponents(components);
    expect(result.overallSuitabilityPercent).toBe(100);
    expect(result.evaluatedComponentCount).toBe(0);
  });

  it("安全境界(60〜120)は極端な入力でのみ発動する（通常のCASE A〜Dでは発動しない）", () => {
    const extremeLow = [
      componentAt("distance", 0, "high"),
      componentAt("course", 0, "high"),
      componentAt("going", 0, "high"),
      componentAt("gate", 0, "high"),
    ];
    expect(aggregateSuitabilityComponents(extremeLow).overallSuitabilityPercent).toBe(SUITABILITY_V1_SAFETY_MIN);

    const extremeHigh = [
      componentAt("distance", 300, "high"),
      componentAt("course", 300, "high"),
      componentAt("going", 300, "high"),
      componentAt("gate", 300, "high"),
    ];
    expect(aggregateSuitabilityComponents(extremeHigh).overallSuitabilityPercent).toBe(SUITABILITY_V1_SAFETY_MAX);
  });
});

// ---- computeSuitabilityV1の結合テスト（distance/course/goingは系統Aをそのまま再利用） ----

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

describe("computeSuitabilityV1（系統A: distance/course/going、系統B: gateの結合確認）", () => {
  it("distance/course/goingとも完全一致・gateは同一条件への再訪問がありHorseEvidenceで評価される", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low"),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"),
    ];
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races,
      target: TARGET,
      gate: { horseNumber: 5, fieldSize: 16, frame: 3 },
    });
    expect(result.distance.evaluated).toBe(true);
    expect(result.distance.rawPercent).toBe(100);
    expect(result.course.evaluated).toBe(true);
    expect(result.going.evaluated).toBe(true);
    // gateは東京ダート1600m限定のCoursePriorではなく、racecourse×surface×distance完全一致への
    // 再訪問（このfixtureは全走が阪神/turf/2000mで一致）からHorseEvidenceで評価される
    // （CHECKPOINT11.5でgate HorseEvidence→percentの正式式を実装したことによる挙動変更）。
    expect(result.gate.evaluated).toBe(true);
    expect(result.gate.horseEvidence?.sampleCount).toBeGreaterThan(0);
    expect(result.gate.coursePrior).toBeNull(); // 阪神は東京ダート1600m限定のCoursePrior対象外
    expect(Math.abs(result.gate.rawPercent - 100)).toBeLessThanOrEqual(GATE_HORSE_EVIDENCE_AMPLITUDE);
    expect(result.evaluatedComponentCount).toBe(4);
  });

  it("過去走が1件も無い場合、distance/course/goingはすべてevaluated=false・unknownとなる", () => {
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: [],
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    expect(result.distance.evaluated).toBe(false);
    expect(result.distance.confidence).toBe("unknown");
    expect(result.course.evaluated).toBe(false);
    expect(result.going.evaluated).toBe(false);
    expect(result.gate.evaluated).toBe(false);
    expect(result.overallSuitabilityPercent).toBe(100);
    expect(result.evaluatedComponentCount).toBe(0);
  });

  it("東京ダート1600mの場合、gateはCoursePriorのみでevaluated=trueとなり、影響幅はGATE_COURSE_PRIOR_AMPLITUDE以内に収まる", () => {
    const tokyoDirt1600Target: SuitabilityTargetRaceContext = { racecourse: "東京", surface: "dirt", distance: 1600, going: "良" };
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: [],
      target: tokyoDirt1600Target,
      gate: { horseNumber: 1, fieldSize: 16, frame: 1 },
    });
    expect(result.gate.evaluated).toBe(true);
    expect(result.gate.coursePrior).not.toBeNull();
    expect(result.gate.horseEvidence).not.toBeNull();
    expect(Math.abs(result.gate.rawPercent - 100)).toBeLessThanOrEqual(GATE_COURSE_PRIOR_AMPLITUDE);
    // CoursePrior単独で100→80のような大きな補正にはならない（STEP5の禁止事項）
    expect(result.gate.rawPercent).toBeGreaterThan(80);
  });

  it("枠番(frame)が不明な場合、東京ダート1600mでもgateはevaluated=falseとなる（推測しない）", () => {
    const tokyoDirt1600Target: SuitabilityTargetRaceContext = { racecourse: "東京", surface: "dirt", distance: 1600, going: "良" };
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: [],
      target: tokyoDirt1600Target,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    expect(result.gate.evaluated).toBe(false);
    expect(result.gate.confidence).toBe("unknown");
  });
});

// ---- CHECKPOINT11.5 STEP11: gate異常系テスト（NaN/Infinity/不自然な100固定にならないことの確認） ----

const TOKYO_DIRT_1600: SuitabilityTargetRaceContext = { racecourse: "東京", surface: "dirt", distance: 1600, going: "良" };

describe("computeSuitabilityV1 gate異常系（STEP11）", () => {
  it("極端な正のaggregatedDeltaでもrawPercentはamplitudeの範囲内に飽和し、NaN/Infinityにならない", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high", { finishPosition: 1 }),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high", { finishPosition: 1 }),
    ];
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races,
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    expect(Number.isFinite(result.gate.rawPercent)).toBe(true);
    expect(Number.isFinite(result.gate.adjustedPercent)).toBe(true);
    expect(Math.abs(result.gate.rawPercent - 100)).toBeLessThanOrEqual(GATE_HORSE_EVIDENCE_AMPLITUDE);
  });

  it("極端な負のaggregatedDeltaでもrawPercentはamplitudeの範囲内に飽和し、NaN/Infinityにならない", () => {
    const races = [
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low", { finishPosition: 16 }),
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "low", { finishPosition: 16 }),
    ];
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races,
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    expect(Number.isFinite(result.gate.rawPercent)).toBe(true);
    expect(Number.isFinite(result.gate.adjustedPercent)).toBe(true);
    expect(Math.abs(result.gate.rawPercent - 100)).toBeLessThanOrEqual(GATE_HORSE_EVIDENCE_AMPLITUDE);
  });

  it("HorseEvidenceとCoursePriorが両方利用可能な場合（東京ダート1600m×再訪問）、HorseEvidenceが優先されCoursePriorは監査用メタデータのみになる", () => {
    const races = [
      makeRace({ racecourse: "東京", going: "良", distance: 1600 }, "high", { surface: "dirt" }),
      makeRace({ racecourse: "東京", going: "良", distance: 1600 }, "low", { surface: "dirt" }),
    ];
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races,
      target: TOKYO_DIRT_1600,
      gate: { horseNumber: 1, fieldSize: 16, frame: 1 },
    });
    expect(result.gate.evaluated).toBe(true);
    expect(result.gate.horseEvidence?.sampleCount).toBeGreaterThan(0);
    // CoursePriorも監査用に保持されるが、percentの根拠には使われない（reasonに明記）
    expect(result.gate.coursePrior).not.toBeNull();
    expect(result.gate.reason).toContain("HorseEvidenceが優先度1のため今回のpercentには使用していない");
    expect(Math.abs(result.gate.rawPercent - 100)).toBeLessThanOrEqual(GATE_HORSE_EVIDENCE_AMPLITUDE);
  });

  it("sampleCount=0・CoursePriorも無い場合、confidence=unknownかつrawPercent=100（0点やNaNにならない）", () => {
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: [],
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    expect(result.gate.evaluated).toBe(false);
    expect(result.gate.confidence).toBe("unknown");
    expect(result.gate.rawPercent).toBe(100);
    expect(Number.isNaN(result.gate.rawPercent)).toBe(false);
  });
});

// ---- CHECKPOINT11.11: confidence閾値統一のsampleCount 0〜6境界値テスト ----

describe("confidence閾値統一（CHECKPOINT11.11）: sampleCount 0〜6境界値", () => {
  // HorseEvidence側の閾値（resolveHorseEvidenceConfidence、既存関数）に統一された期待値
  const EXPECTED_CONFIDENCE: Record<number, SuitabilityConfidence | "unknown"> = {
    0: "unknown",
    1: "low",
    2: "low",
    3: "medium",
    4: "medium",
    5: "high",
  };
  const SHRINK_WEIGHT: Record<SuitabilityConfidence, number> = { high: 1.0, medium: 0.6, low: 0.3 };

  it("distance component: sampleCount 0〜5（RECENT_RACE_COUNT上限）でconfidence/adjustedPercentが期待通り", () => {
    for (let n = 0; n <= 5; n++) {
      const races = Array.from({ length: n }, () => makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"));
      const result = computeSuitabilityV1({
        horseId: "h1",
        recentRaces: races,
        target: TARGET,
        gate: { horseNumber: null, fieldSize: null, frame: null },
      });
      expect(result.distance.confidence).toBe(EXPECTED_CONFIDENCE[n]);
      expect(result.distance.evaluated).toBe(n > 0);

      if (n === 0) {
        // 評価不能: raw=100固定、shrinkしても100のまま
        expect(result.distance.rawPercent).toBe(100);
        expect(result.distance.adjustedPercent).toBe(100);
      } else {
        const confidence = EXPECTED_CONFIDENCE[n] as SuitabilityConfidence;
        const expectedAdjusted = roundToOneDecimal(shrinkTowardCenter(result.distance.rawPercent, confidence));
        expect(result.distance.adjustedPercent).toBeCloseTo(expectedAdjusted, 5);
        // shrink weightが正しく適用されている（rawが100でなければadjustedはrawと100の間）
        if (result.distance.rawPercent !== 100) {
          const weight = SHRINK_WEIGHT[confidence];
          expect(result.distance.adjustedPercent - 100).toBeCloseTo((result.distance.rawPercent - 100) * weight, 5);
        }
      }
    }
  });

  it("sampleCount=2/4はHorseEvidence側閾値(low/medium)を採用し、旧Suitability側閾値(medium/high)とは異なる", () => {
    const races2 = Array.from({ length: 2 }, () => makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"));
    const result2 = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races2,
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    // 旧Suitability側(baseConfidenceFromSampleCount)なら sampleCount=2 は "medium" だったが、
    // 統一後は resolveHorseEvidenceConfidence(2) = "low" になる
    expect(result2.distance.confidence).toBe("low");

    const races4 = Array.from({ length: 4 }, () => makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, "high"));
    const result4 = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races4,
      target: TARGET,
      gate: { horseNumber: null, fieldSize: null, frame: null },
    });
    // 旧Suitability側なら sampleCount=4 は "high" だったが、統一後は "medium" になる
    expect(result4.distance.confidence).toBe("medium");
  });

  it("gate component: sampleCount=6（5走を超える再訪問）でもconfidence=highのまま安全に処理される", () => {
    // gateはRECENT_RACE_COUNTの5走制限を受けず、recentRaces全体からマッチ条件を数える。
    // 7走を同一条件で用意すると、最古の1走はabilityBeforeRace算出不能で除外され、
    // 残り6走がdelta算出対象になる（sampleCount=6）。
    // recentRacesは新しい順（[0]が最新）である必要があるため、日付降順で並べる
    const races = Array.from({ length: 7 }, (_, i) =>
      makeRace({ racecourse: "阪神", going: "重", distance: 2000 }, i % 2 === 0 ? "high" : "low", {
        raceDate: `2025-${String(7 - i).padStart(2, "0")}-01`,
      }),
    );
    const result = computeSuitabilityV1({
      horseId: "h1",
      recentRaces: races,
      target: TARGET,
      gate: { horseNumber: 5, fieldSize: 16, frame: 3 },
    });
    expect(result.gate.evaluated).toBe(true);
    expect(result.gate.horseEvidence?.sampleCount).toBe(6);
    expect(result.gate.confidence).toBe("high");
    expect(Number.isFinite(result.gate.rawPercent)).toBe(true);
    expect(Number.isFinite(result.gate.adjustedPercent)).toBe(true);
    // confidence=highはshrink weight=1.0のため、adjustedPercent===rawPercent
    expect(result.gate.adjustedPercent).toBe(result.gate.rawPercent);
  });
});

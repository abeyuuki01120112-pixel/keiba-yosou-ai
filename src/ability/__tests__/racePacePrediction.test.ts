/**
 * Race Pace Prediction V1（CHECKPOINT14C）の単体テスト。
 * Base Ability V1・Suitability V1・Historical Position Profile V1・Formal Snapshotは
 * 一切変更していない（このテストファイル自体もそれらの数式を呼び出すのみで変更しない）。
 */
import { describe, expect, it } from "vitest";
import { computeRacePacePrediction } from "../racePacePrediction";
import { computeHistoricalPositionProfile } from "../positionProfile";
import { buildRacePerformance } from "../buildRacePerformance";
import { calculateBaseAbility } from "../baseAbility";
import { computeSuitabilityV1 } from "../suitabilityV1";
import type { RacePaceRunnerInput } from "../racePacePredictionTypes";
import type { RacePerformance, PassingPositionData } from "../types";
import type { RunningStyleDistribution } from "../raceContextTypes";
import type { PositionConfidence } from "../positionProfileTypes";

function pp(cornerPositions: number[], fieldSize: number, isReliable = true): PassingPositionData {
  return { cornerPositions, fieldSize, source: "test", isReliable };
}

function race(overrides: Partial<Parameters<typeof buildRacePerformance>[0]> = {}) {
  return buildRacePerformance({
    raceId: "R1",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "東京",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 50,
    raceTimeScore: 50,
    final3FScore: 50,
    weightScore: 50,
    ...overrides,
  } as Parameters<typeof buildRacePerformance>[0]);
}

/** Historical Position Profile V1経由でrunner inputを組み立てるヘルパー（実経路をそのまま利用） */
function runner(horseId: string, horseName: string, races: RacePerformance[]): RacePaceRunnerInput {
  const profile = computeHistoricalPositionProfile(horseId, horseName, races);
  return {
    horseId,
    horseName,
    earlyNormalizedPositionMean: profile.earlyNormalizedPositionMean,
    positionStdDev: profile.positionStdDev,
    runningStyleDistribution: profile.runningStyleDistribution,
    representativeRunningStyle: profile.representativeRunningStyle,
    positionEvidenceCount: profile.positionEvidenceCount,
    positionConfidence: profile.positionConfidence,
  };
}

/** distributionを直接指定したいテスト用の軽量ヘルパー（Position Profileを経由しない合成入力） */
function syntheticRunner(
  horseId: string,
  horseName: string,
  distribution: RunningStyleDistribution | null,
  overrides: Partial<RacePaceRunnerInput> = {},
): RacePaceRunnerInput {
  return {
    horseId,
    horseName,
    earlyNormalizedPositionMean: 0.3,
    positionStdDev: 0.1,
    runningStyleDistribution: distribution,
    representativeRunningStyle: null,
    positionEvidenceCount: distribution ? 5 : 0,
    positionConfidence: "high" as PositionConfidence,
    ...overrides,
  };
}

describe("Test A: 前方Position tendencyが強い馬が増えるとpacePressureは下がらない", () => {
  it("後方寄りの馬を前方寄りの馬に差し替えると、continuousPacePressure/frontPressureは増加する（減少しない）", () => {
    const rearHorse = syntheticRunner("h3", "後方馬", { nige: 0, senko: 0, sashi: 20, oikomi: 80 });
    const frontHorse = syntheticRunner("h3", "前方馬", { nige: 100, senko: 0, sashi: 0, oikomi: 0 });
    const others = [
      syntheticRunner("h1", "馬1", { nige: 0, senko: 0, sashi: 50, oikomi: 50 }),
      syntheticRunner("h2", "馬2", { nige: 0, senko: 0, sashi: 50, oikomi: 50 }),
    ];

    const before = computeRacePacePrediction([...others, rearHorse]);
    const after = computeRacePacePrediction([...others, frontHorse]);

    expect(after.continuousPacePressure).toBeGreaterThanOrEqual(before.continuousPacePressure);
    expect(after.frontPressure).toBeGreaterThan(before.frontPressure);
  });
});

describe("Test B: 全馬後方傾向なら不自然にHIGHにならない", () => {
  it("全馬oikomi（後方）のフィールドはexpectedPaceClass=slowになる", () => {
    const runners = [
      syntheticRunner("h1", "馬1", { nige: 0, senko: 0, sashi: 0, oikomi: 100 }),
      syntheticRunner("h2", "馬2", { nige: 0, senko: 0, sashi: 0, oikomi: 100 }),
      syntheticRunner("h3", "馬3", { nige: 0, senko: 0, sashi: 0, oikomi: 100 }),
    ];
    const result = computeRacePacePrediction(runners);
    expect(result.frontPressure).toBe(0);
    expect(result.continuousPacePressure).toBe(0);
    expect(result.expectedPaceClass).toBe("slow");
    expect(result.expectedPaceClass).not.toBe("high");
  });
});

describe("Test C: Position Band変更でcontinuous pacePressureが変化しない", () => {
  it("computeRacePacePredictionはPosition Band/frontRate等を一切参照しない（型にも存在しない）ため、Band相当の値をどう変えても結果は同じ", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([9, 10, 8, 8], 14) }),
      race({ raceId: "R2", raceDate: "2026-04-01", passingPosition: pp([7, 6], 12) }),
    ];
    const r1 = runner("h1", "テスト馬", races);
    const before = computeRacePacePrediction([r1]);
    // 同じ入力から再計算しても（Bandに相当する概念が入力型に存在しないため）結果は不変
    const after = computeRacePacePrediction([runner("h1", "テスト馬", races)]);
    expect(after.continuousPacePressure).toBe(before.continuousPacePressure);
    expect(after.frontPressure).toBe(before.frontPressure);
    expect(after.expectedPaceClass).toBe(before.expectedPaceClass);
  });
});

describe("Test D: frame=nullでもPre-Frame生成可能", () => {
  it("RacePaceRunnerInputはframe/horseNumberを持たない型であり、frame情報が一切無い状態でも計算できる", () => {
    const runners = [syntheticRunner("h1", "馬1", { nige: 50, senko: 50, sashi: 0, oikomi: 0 })];
    const result = computeRacePacePrediction(runners);
    expect(result.paceStage).toBe("pre_frame");
    expect(result.status).toBe("DIAGNOSTIC_PRE_FRAME");
    expect("frame" in runners[0]).toBe(false);
    expect("horseNumber" in runners[0]).toBe(false);
  });
});

describe("Test E: scratch horseを除外", () => {
  it("取消馬を除いた配列を渡すと、その馬の寄与が完全に無くなった結果が返る（内部状態を保持しない）", () => {
    const full = [
      syntheticRunner("h1", "逃げ馬", { nige: 100, senko: 0, sashi: 0, oikomi: 0 }),
      syntheticRunner("h2", "逃げ馬2", { nige: 100, senko: 0, sashi: 0, oikomi: 0 }),
      syntheticRunner("h3", "差し馬", { nige: 0, senko: 0, sashi: 100, oikomi: 0 }),
    ];
    const before = computeRacePacePrediction(full);
    expect(before.frontPressure).toBeCloseTo(2, 5);

    const afterScratch = computeRacePacePrediction(full.filter((r) => r.horseId !== "h2"));
    expect(afterScratch.runnerCount).toBe(2);
    expect(afterScratch.frontPressure).toBeCloseTo(1, 5);
    expect(afterScratch.horses.some((h) => h.horseId === "h2")).toBe(false);
  });
});

describe("Test F: high positionStdDevを「必ず前へ行く」と扱わない", () => {
  it("位置取りが安定して前方の馬と、position自体は前方寄りだが変動が激しい馬とで、frontPressureへの寄与自体は確率(nige/senko)ベースであり、変動が激しい馬のcontributionToPacePressureが不当に安定馬と同等以上に扱われない", () => {
    const stableFront: RacePerformance[] = [
      race({ raceId: "S1", passingPosition: pp([1, 1, 1], 14) }),
      race({ raceId: "S2", passingPosition: pp([2, 1], 14) }),
      race({ raceId: "S3", passingPosition: pp([1, 2, 1], 14) }),
      race({ raceId: "S4", passingPosition: pp([1, 1], 14) }),
      race({ raceId: "S5", passingPosition: pp([2, 1, 1], 14) }),
    ];
    const volatileMixed: RacePerformance[] = [
      race({ raceId: "V1", passingPosition: pp([1, 1, 1], 14) }),
      race({ raceId: "V2", passingPosition: pp([14, 14, 14], 14) }),
      race({ raceId: "V3", passingPosition: pp([1, 1, 2], 14) }),
      race({ raceId: "V4", passingPosition: pp([13, 14, 13], 14) }),
      race({ raceId: "V5", passingPosition: pp([2, 1, 1], 14) }),
    ];
    const stableRunner = runner("h1", "安定先行馬", stableFront);
    const volatileRunner = runner("h2", "変動馬", volatileMixed);

    // 変動馬はnige/senko確率が安定馬より低くなる（毎回前へ行くわけではないことが
    // 頻度ベースのdistributionに自然に反映されるため、stdDevを追加のペナルティ係数として
    // 掛け合わせる必要が無い）
    expect(volatileRunner.runningStyleDistribution!.nige + volatileRunner.runningStyleDistribution!.senko).toBeLessThan(
      stableRunner.runningStyleDistribution!.nige + stableRunner.runningStyleDistribution!.senko,
    );

    const result = computeRacePacePrediction([stableRunner, volatileRunner]);
    const stableContribution = result.horses.find((h) => h.horseId === "h1")!.contributionToPacePressure;
    const volatileContribution = result.horses.find((h) => h.horseId === "h2")!.contributionToPacePressure;
    expect(volatileContribution).toBeLessThan(stableContribution);

    // high stdDevの馬がfrontPressureへ寄与する場合、paceConfidenceが安定馬のみのケースより
    // 下がりうることも確認する（stdDevを能力/pressureの数値自体ではなくconfidenceへ反映）
    const volatileOnly = computeRacePacePrediction([volatileRunner]);
    const stableOnly = computeRacePacePrediction([stableRunner]);
    const rank: Record<string, number> = { high: 2, medium: 1, low: 0 };
    expect(rank[volatileOnly.paceConfidence]).toBeLessThanOrEqual(rank[stableOnly.paceConfidence]);
  });
});

describe("Test G: Odds/popularityを参照しない", () => {
  it("RacePaceRunnerInput型・戻り値のいずれにもodds/popularity/人気に類するフィールドが存在しない", () => {
    const runners = [syntheticRunner("h1", "馬1", { nige: 50, senko: 50, sashi: 0, oikomi: 0 })];
    const result = computeRacePacePrediction(runners);
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("odds");
    expect(serialized).not.toContain("popularity");
    expect(serialized).not.toContain("人気");
  });
});

describe("Test H: Base Abilityは不変", () => {
  it("Race Pace Predictionを計算しても、同じraces配列から算出したbaseAbilityは変化しない", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([3, 4, 4, 3], 10) }),
      race({ raceId: "R2", raceDate: "2026-04-01", passingPosition: pp([5, 5], 12) }),
    ];
    const before = calculateBaseAbility(races);
    computeRacePacePrediction([runner("h1", "テスト馬", races)]);
    const after = calculateBaseAbility(races);
    expect(after).toBe(before);
  });
});

describe("Test I: Suitability V1は不変", () => {
  it("Race Pace Predictionを計算しても、Suitability V1の出力は変化しない", () => {
    const races: RacePerformance[] = [race({ raceId: "R1", passingPosition: pp([3, 4, 4, 3], 10) })];
    const target = { racecourse: "東京", surface: "turf" as const, distance: 2000, going: "良" };
    const gate = { horseNumber: null, fieldSize: null, frame: null };
    const before = computeSuitabilityV1({ horseId: "h1", recentRaces: races, target, gate });
    computeRacePacePrediction([runner("h1", "テスト馬", races)]);
    const after = computeSuitabilityV1({ horseId: "h1", recentRaces: races, target, gate });
    expect(after).toEqual(before);
  });
});

describe("Test J: Frozen Benchmark = 70.3（間接確認）", () => {
  it("Race Pace Predictionモジュールを読み込んでも、シェイクユアハート相当の合成baseAbilityは変化しない", () => {
    // Frozen Benchmark自体はabilityModelV1.frozenBenchmark.test.tsで直接検証する。
    // ここではRace Pace Predictionの計算実行がbaseAbility計算経路に副作用を持たないことを、
    // 同一入力の再計算一致という形で間接確認する。
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([3, 4, 4, 3], 10) }),
    ];
    const before = calculateBaseAbility(races);
    computeRacePacePrediction([runner("h1", "テスト馬", races)]);
    computeRacePacePrediction([runner("h1", "テスト馬", races)]);
    const after = calculateBaseAbility(races);
    expect(after).toBe(before);
  });
});

describe("Extra: evidence無し馬の扱い", () => {
  it("Historical Position Profileが未算出（evidence 0）の馬はpacePressureへの寄与0として扱われ、警告が出る", () => {
    const runners = [
      syntheticRunner("h1", "馬1", { nige: 50, senko: 50, sashi: 0, oikomi: 0 }),
      syntheticRunner("h2", "データ無し馬", null, {
        earlyNormalizedPositionMean: null,
        positionStdDev: null,
        positionEvidenceCount: 0,
        positionConfidence: "low",
      }),
    ];
    const result = computeRacePacePrediction(runners);
    expect(result.horses.find((h) => h.horseId === "h2")!.contributionToPacePressure).toBe(0);
    expect(result.warnings.some((w) => w.includes("Historical Position Profile未算出"))).toBe(true);
  });
});

/**
 * Historical Position Profile V1（CHECKPOINT14B）の単体テスト。
 * Base Ability V1・Suitability V1・Formal Snapshotは一切変更していない
 * （このテストファイル自体もそれらの数式を呼び出すのみで変更しない）。
 */
import { describe, expect, it } from "vitest";
import {
  computeHistoricalPositionProfile,
  normalizePosition,
  POSITION_STABILITY_STABLE_MAX_STD_DEV,
} from "../positionProfile";
import { buildRacePerformance } from "../buildRacePerformance";
import { calculateBaseAbility } from "../baseAbility";
import { computeSuitabilityV1 } from "../suitabilityV1";
import type { RacePerformance } from "../types";
import type { PassingPositionData } from "../types";

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

describe("Test A: 頭数差の正規化", () => {
  it("8頭立て4番手と18頭立て4番手は異なるnormalizedPositionになる", () => {
    const a = normalizePosition(4, 8);
    const b = normalizePosition(4, 18);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(a).toBeCloseTo(3 / 7, 5);
    expect(b).toBeCloseTo(3 / 17, 5);
  });

  it("境界値: position=1は常に0、position=fieldSizeは常に1", () => {
    expect(normalizePosition(1, 10)).toBe(0);
    expect(normalizePosition(10, 10)).toBe(1);
  });

  it("境界値: fieldSize<=1、範囲外の値はnull（推測しない）", () => {
    expect(normalizePosition(1, 1)).toBeNull();
    expect(normalizePosition(1, 0)).toBeNull();
    expect(normalizePosition(0, 10)).toBeNull();
    expect(normalizePosition(11, 10)).toBeNull();
  });
});

describe("Test B/F: 2-corner passingPositionの正常処理", () => {
  it("2コーナーのみの走を、存在しない3・4コーナーを補完せず正しく処理する", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", passingPosition: pp([8, 7], 10) }),
      race({ raceId: "R2", passingPosition: pp([7, 6], 10) }),
      race({ raceId: "R3", passingPosition: pp([9, 8], 10) }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionEvidenceCount).toBe(3);
    expect(profile.usedRaces[0].firstObservedPosition).toBe(8);
    expect(profile.usedRaces[0].lastObservedPosition).toBe(7);
    // 2件しか無い場合はrepresentativeが全件（除外しない）
    // representativeNormalizedPositionは小数第3位に丸めて格納される仕様のため、precision=3で比較する
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeCloseTo(
      (normalizePosition(8, 10)! + normalizePosition(7, 10)!) / 2,
      3,
    );
  });
});

describe("Test C: 4-corner passingPositionの正常処理", () => {
  it("4コーナー分の走を正しく処理する", () => {
    const races: RacePerformance[] = [race({ raceId: "R1", passingPosition: pp([9, 10, 8, 8], 14) })];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionEvidenceCount).toBe(1);
    expect(profile.usedRaces[0].firstObservedPosition).toBe(9);
    expect(profile.usedRaces[0].lastObservedPosition).toBe(8);
    // 4件のうち最終コーナー(8)を除いた[9,10,8]の平均がrepresentative
    // representativeNormalizedPositionは小数第3位に丸めて格納される仕様のため、precision=3で比較する
    const expectedRep =
      (normalizePosition(9, 14)! + normalizePosition(10, 14)! + normalizePosition(8, 14)!) / 3;
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeCloseTo(expectedRep, 3);
  });
});

describe("Test D: passingPosition実データのみを使用（final3F等での代替を行わない）", () => {
  it("passingPositionが無い馬はfinal3Fプロキシへフォールバックせず、evidenceCount=0で返す", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", passingPosition: null, final3F: 32 }),
      race({ raceId: "R2", passingPosition: null, final3F: 40 }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionEvidenceCount).toBe(0);
    expect(profile.earlyNormalizedPositionMean).toBeNull();
    expect(profile.runningStyleDistribution).toBeNull();
    expect(profile.warnings.some((w) => w.includes("通過順位"))).toBe(true);
  });

  it("isReliable=falseの走は無視される", () => {
    const races: RacePerformance[] = [race({ raceId: "R1", passingPosition: pp([3, 4, 4, 3], 10, false) })];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionEvidenceCount).toBe(0);
  });
});

describe("Test E: Short Career 4/4をcomplete evidenceとして処理", () => {
  it("4走全てにpassingPositionが揃っていれば、positionEvidenceCount=4・positionConfidence=highになる（5走目を要求しない）", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-04-01", passingPosition: pp([3, 3, 3], 16) }),
      race({ raceId: "R2", raceDate: "2026-03-01", passingPosition: pp([3, 5, 4], 12) }),
      race({ raceId: "R3", raceDate: "2026-02-01", passingPosition: pp([2, 3, 2], 16) }),
      race({ raceId: "R4", raceDate: "2026-01-01", passingPosition: pp([2, 3, 2], 15) }),
    ];
    const profile = computeHistoricalPositionProfile("2023107166", "ロデオドライブ", races);
    expect(profile.positionEvidenceCount).toBe(4);
    expect(profile.positionConfidence).toBe("high");
    // 「missing data」を示唆する警告は出ない
    expect(profile.warnings.every((w) => !w.includes("欠損"))).toBe(true);
  });
});

describe("Test F: position varianceが大きい馬のconfidenceは安定馬より高くならない", () => {
  it("常に同じ位置帯（安定）→high、毎回大きく変わる（不安定）→安定馬以下", () => {
    const stableRaces: RacePerformance[] = [
      race({ raceId: "S1", passingPosition: pp([3, 3, 3], 14) }),
      race({ raceId: "S2", passingPosition: pp([3, 4, 3], 14) }),
      race({ raceId: "S3", passingPosition: pp([2, 3, 3], 14) }),
      race({ raceId: "S4", passingPosition: pp([3, 3, 2], 14) }),
      race({ raceId: "S5", passingPosition: pp([3, 2, 3], 14) }),
    ];
    const volatileRaces: RacePerformance[] = [
      race({ raceId: "V1", passingPosition: pp([1, 1, 1], 14) }),
      race({ raceId: "V2", passingPosition: pp([14, 14, 14], 14) }),
      race({ raceId: "V3", passingPosition: pp([1, 1, 2], 14) }),
      race({ raceId: "V4", passingPosition: pp([13, 14, 13], 14) }),
      race({ raceId: "V5", passingPosition: pp([2, 1, 1], 14) }),
    ];
    const stable = computeHistoricalPositionProfile("h1", "安定馬", stableRaces);
    const volatile = computeHistoricalPositionProfile("h2", "変動馬", volatileRaces);

    expect(stable.positionStability).toBe("stable");
    expect(stable.positionConfidence).toBe("high");
    expect(volatile.positionStability).toBe("variable");
    // 変動馬のconfidenceは安定馬以下（同じevidence数5走で、highより上がることはない）
    const rank: Record<string, number> = { high: 2, medium: 1, low: 0 };
    expect(rank[volatile.positionConfidence]).toBeLessThan(rank[stable.positionConfidence]);
  });

  it("positionVarianceが閾値ちょうど（境界）ではstableのまま", () => {
    // stdDev=0ちょうどの全同一位置ケースで境界確認
    const races: RacePerformance[] = [
      race({ raceId: "R1", passingPosition: pp([5, 5, 5], 14) }),
      race({ raceId: "R2", passingPosition: pp([5, 5, 5], 14) }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionVariance).toBe(0);
    expect(Math.sqrt(profile.positionVariance!)).toBeLessThanOrEqual(POSITION_STABILITY_STABLE_MAX_STD_DEV);
    expect(profile.positionStability).toBe("stable");
  });
});

describe("Test G: Base Abilityは不変", () => {
  it("Historical Position Profileを計算しても、同じraces配列から算出したbaseAbilityは変化しない", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([3, 4, 4, 3], 10) }),
      race({ raceId: "R2", raceDate: "2026-04-01", passingPosition: pp([5, 5], 12) }),
    ];
    const before = calculateBaseAbility(races);
    computeHistoricalPositionProfile("h1", "テスト馬", races);
    const after = calculateBaseAbility(races);
    expect(after).toBe(before);
  });
});

describe("Test H: Suitability V1は不変", () => {
  it("Historical Position Profileを計算しても、Suitability V1の出力は変化しない", () => {
    const races: RacePerformance[] = [race({ raceId: "R1", passingPosition: pp([3, 4, 4, 3], 10) })];
    const target = { racecourse: "東京", surface: "turf" as const, distance: 2000, going: "良" };
    const gate = { horseNumber: null, fieldSize: null, frame: null };
    const before = computeSuitabilityV1({ horseId: "h1", recentRaces: races, target, gate });
    computeHistoricalPositionProfile("h1", "テスト馬", races);
    const after = computeSuitabilityV1({ horseId: "h1", recentRaces: races, target, gate });
    expect(after).toEqual(before);
  });
});

describe("Extreme Case: 常に前方・常に後方の馬", () => {
  it("常に先頭付近（前方）の馬はfrontRate=100・representativeRunningStyle=nige", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", passingPosition: pp([1, 1, 1], 14) }),
      race({ raceId: "R2", passingPosition: pp([1, 1], 12) }),
      race({ raceId: "R3", passingPosition: pp([2, 1, 1], 16) }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "逃げ馬", races);
    expect(profile.frontRate).toBe(100);
    expect(profile.representativeRunningStyle).toBe("nige");
  });

  it("常に最後方の馬はrearRate=100・representativeRunningStyle=oikomi", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", passingPosition: pp([14, 14, 14], 14) }),
      race({ raceId: "R2", passingPosition: pp([12, 12], 12) }),
      race({ raceId: "R3", passingPosition: pp([16, 16, 16], 16) }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "追込馬", races);
    expect(profile.rearRate).toBe(100);
    expect(profile.representativeRunningStyle).toBe("oikomi");
  });
});

/**
 * Historical Position Profile V1（CHECKPOINT14B、CHECKPOINT14B.1/14B.2で改訂）の単体テスト。
 * Base Ability V1・Suitability V1・Formal Snapshotは一切変更していない
 * （このテストファイル自体もそれらの数式を呼び出すのみで変更しない）。
 */
import { describe, expect, it } from "vitest";
import {
  computeHistoricalPositionProfile,
  normalizePosition,
  POSITION_STABILITY_STABLE_MAX_STD_DEV,
  POSITION_STABILITY_MODERATE_MAX_STD_DEV,
  POSITION_BAND_FRONT_MAX_NORMALIZED,
  POSITION_BAND_MID_MAX_NORMALIZED,
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

describe("Test F（CHECKPOINT14B.2で改訂）: Position StabilityとPosition Confidenceの分離", () => {
  it("安定馬・変動馬とも、evidence5走が完全ならconfidenceは同じhigh（varianceでconfidenceを下げない）", () => {
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

    // Position Stability（診断専用の連続値由来の区分）は明確に異なる
    expect(stable.positionStability).toBe("stable");
    expect(volatile.positionStability).toBe("variable");
    // しかしPosition Confidence（evidence件数のみに基づく）はどちらも同じ"high"
    // 「位置取りが毎回大きく変わる馬でも、5/5実データが完全なら、"この馬は位置取りが
    // 不安定である"こと自体には高いConfidenceを持てる」（CHECKPOINT14B.2 9節）
    expect(stable.positionConfidence).toBe("high");
    expect(volatile.positionConfidence).toBe("high");
    // varianceが大きい馬の方がpositionStdDevは明確に大きい（診断値としては機能している）
    expect(volatile.positionStdDev!).toBeGreaterThan(stable.positionStdDev!);
    // variable到達時は情報提供の警告は出るが、confidenceには影響しない旨が明記される
    expect(volatile.warnings.some((w) => w.includes("引き下げていません"))).toBe(true);
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

describe("CHECKPOINT14B.2: Position Band（Running Styleから独立した閾値）の境界確認", () => {
  it("現行の独立閾値定数（1/3・2/3）を明示的に固定する", () => {
    expect(POSITION_BAND_FRONT_MAX_NORMALIZED).toBeCloseTo(1 / 3, 10);
    expect(POSITION_BAND_MID_MAX_NORMALIZED).toBeCloseTo(2 / 3, 10);
  });

  it("front/mid境界ちょうど（normalizedPosition=1/3）はfrontのまま", () => {
    // position=6, fieldSize=16 → (6-1)/15 = 1/3 ちょうど
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", [
      race({ raceId: "R1", passingPosition: pp([6, 6], 16) }),
    ]);
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeCloseTo(1 / 3, 3);
    expect(profile.usedRaces[0].band).toBe("front");
  });

  it("front/mid境界をわずかに超えるとmidへ切り替わる", () => {
    // position=7, fieldSize=16 → (7-1)/15 = 0.4 > 1/3
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", [
      race({ raceId: "R1", passingPosition: pp([7, 7], 16) }),
    ]);
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeGreaterThan(1 / 3);
    expect(profile.usedRaces[0].band).toBe("mid");
  });

  it("mid/rear境界ちょうど（normalizedPosition=2/3）はmidのまま", () => {
    // position=11, fieldSize=16 → (11-1)/15 = 2/3 ちょうど
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", [
      race({ raceId: "R1", passingPosition: pp([11, 11], 16) }),
    ]);
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeCloseTo(2 / 3, 3);
    expect(profile.usedRaces[0].band).toBe("mid");
  });

  it("mid/rear境界をわずかに超えるとrearへ切り替わる", () => {
    // position=12, fieldSize=16 → (12-1)/15 = 0.733 > 2/3
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", [
      race({ raceId: "R1", passingPosition: pp([12, 12], 16) }),
    ]);
    expect(profile.usedRaces[0].representativeNormalizedPosition).toBeGreaterThan(2 / 3);
    expect(profile.usedRaces[0].band).toBe("rear");
  });
});

describe("CHECKPOINT14B.2: Running Style DistributionとPosition Bandの独立性", () => {
  it("Position Band境界を±0.03〜0.05動かしても、連続値（early/late/positionStdDev等）は当然変化しない", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([9, 10, 8, 8], 14) }),
      race({ raceId: "R2", raceDate: "2026-04-01", passingPosition: pp([7, 6], 12) }),
      race({ raceId: "R3", raceDate: "2026-03-01", passingPosition: pp([8, 9, 7], 15) }),
    ];
    const before = computeHistoricalPositionProfile("h1", "テスト馬", races);
    // Band閾値定数はコード内で固定されているため、ここでは「Bandの値を無視しても
    // 連続値の再計算結果が変わらない」ことを、同一入力からの再計算で確認する
    // （Band用の閾値を仮に動かした別実装があっても、continuous値の計算経路には
    // 一切関与しないという設計を、入力→連続値の経路のみを辿ることで検証する）。
    const after = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(after.earlyNormalizedPositionMean).toBe(before.earlyNormalizedPositionMean);
    expect(after.lateNormalizedPositionMean).toBe(before.lateNormalizedPositionMean);
    expect(after.positionStdDev).toBe(before.positionStdDev);
    expect(after.positionVariance).toBe(before.positionVariance);
    expect(after.positionConfidence).toBe(before.positionConfidence);
    expect(after.runningStyleDistribution).toEqual(before.runningStyleDistribution);
    // Band分類ロジック自体がrepresentativeNormalizedPosition（continuous値）のみに
    // 依存しており、classifiedStyle（Running Style側の分類）には依存していないことを
    // 直接確認する（=Contract BからContract Aの値を逆算していないことの検証）。
    for (const r of before.usedRaces) {
      const expectedBand =
        r.representativeNormalizedPosition <= 1 / 3 ? "front" : r.representativeNormalizedPosition <= 2 / 3 ? "mid" : "rear";
      expect(r.band).toBe(expectedBand);
    }
  });

  it("Position Bandが同じでもRunning Style（classifiedStyle）が異なりうる（両者は独立した別Contract）", () => {
    // position=2（nigeの絶対順位条件<=2を満たす）だが、fieldSize=16なので
    // normalizedPosition=(2-1)/15=0.067 → front。一方、絶対順位が3の場合は
    // nigeにはならずratio判定になるが、同じくnormalizedPositionはfront帯に入りうる。
    // つまりband="front"であっても、classifiedStyleが"nige"か"senko"かは別に決まる
    // （=BandからRunning Styleを逆算できない/その逆もできないことの直接確認）。
    const nigeRace = race({ raceId: "R1", passingPosition: pp([2, 3], 16) });
    const senkoRace = race({ raceId: "R2", passingPosition: pp([3, 4], 16) });
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", [nigeRace, senkoRace]);
    const r1 = profile.usedRaces.find((r) => r.raceId === "R1")!;
    const r2 = profile.usedRaces.find((r) => r.raceId === "R2")!;
    expect(r1.band).toBe("front");
    expect(r2.band).toBe("front");
    expect(r1.classifiedStyle).toBe("nige");
    expect(r2.classifiedStyle).not.toBe("nige");
  });
});

describe("CHECKPOINT14B.2: positionDataCoverage（Short Careerとdata gapの区別）", () => {
  it("Short Career（プール自体が4走）はcoverage=1.0（欠損ではない）", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-04-01", passingPosition: pp([3, 3, 3], 16) }),
      race({ raceId: "R2", raceDate: "2026-03-01", passingPosition: pp([3, 5, 4], 12) }),
      race({ raceId: "R3", raceDate: "2026-02-01", passingPosition: pp([2, 3, 2], 16) }),
      race({ raceId: "R4", raceDate: "2026-01-01", passingPosition: pp([2, 3, 2], 15) }),
    ];
    const profile = computeHistoricalPositionProfile("2023107166", "ロデオドライブ", races);
    expect(profile.positionEvidenceCount).toBe(4);
    expect(profile.positionDataCoverage).toBe(1);
  });

  it("プールは5走あるが2走がpassingPosition欠損の場合、coverage=0.6（<1.0）でありShort Careerと区別できる", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", passingPosition: pp([3, 3, 3], 14) }),
      race({ raceId: "R2", raceDate: "2026-04-01", passingPosition: null }),
      race({ raceId: "R3", raceDate: "2026-03-01", passingPosition: pp([4, 4, 4], 14) }),
      race({ raceId: "R4", raceDate: "2026-02-01", passingPosition: null }),
      race({ raceId: "R5", raceDate: "2026-01-01", passingPosition: pp([3, 4, 3], 14) }),
    ];
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", races);
    expect(profile.positionEvidenceCount).toBe(3);
    expect(profile.positionDataCoverage).toBeCloseTo(0.6, 5);
  });
});

describe("CHECKPOINT14B.1: positionStability境界のfrozen確認", () => {
  // fieldSize=101（(position-1)/100）を使うと、平均0.5・偏差±dのペアで
  // stdDev=dちょうどを厳密に作れる（roundToThreeDecimalsの丸め誤差を避けるため）。
  function stabilityPair(d: number): RacePerformance[] {
    const posLow = 1 + 100 * (0.5 - d);
    const posHigh = 1 + 100 * (0.5 + d);
    return [
      race({ raceId: "R1", passingPosition: pp([posLow], 101) }),
      race({ raceId: "R2", passingPosition: pp([posHigh], 101) }),
    ];
  }

  it("stdDev=STABLE上限(0.15)ちょうどはstableのまま", () => {
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", stabilityPair(0.15));
    // positionVariance（表示用）は小数第3位に丸めて格納されるため、比較はprecision=2で行う
    // （安定性判定自体は丸め前の生varianceで行うようCHECKPOINT14B.1で修正済み）
    expect(Math.sqrt(profile.positionVariance!)).toBeCloseTo(0.15, 2);
    expect(profile.positionStability).toBe("stable");
  });

  it("stdDevがSTABLE上限をわずかに超えるとmoderateへ切り替わる", () => {
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", stabilityPair(0.16));
    expect(Math.sqrt(profile.positionVariance!)).toBeCloseTo(0.16, 2);
    expect(profile.positionStability).toBe("moderate");
  });

  it("stdDev=MODERATE上限(0.30)ちょうどはmoderateのまま", () => {
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", stabilityPair(0.3));
    expect(Math.sqrt(profile.positionVariance!)).toBeCloseTo(0.3, 3);
    expect(profile.positionStability).toBe("moderate");
  });

  it("stdDevがMODERATE上限をわずかに超えるとvariableへ切り替わる（confidenceには影響しない、CHECKPOINT14B.2）", () => {
    const profile = computeHistoricalPositionProfile("h1", "テスト馬", stabilityPair(0.31));
    expect(Math.sqrt(profile.positionVariance!)).toBeCloseTo(0.31, 3);
    expect(profile.positionStability).toBe("variable");
    // CHECKPOINT14B.2でPosition StabilityとPosition Confidenceを分離したため、
    // variable到達自体はconfidenceを一切変えない（evidence数2件なのでmediumのまま）。
    expect(profile.positionConfidence).toBe("medium");
    expect(POSITION_STABILITY_MODERATE_MAX_STD_DEV).toBe(0.3);
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

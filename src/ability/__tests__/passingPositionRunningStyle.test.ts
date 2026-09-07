import { describe, expect, it } from "vitest";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";
import {
  classifyRunningStyleFromPositions,
  computePassingPositionRunningStyle,
  computePositionRatio,
  NIGE_LEAD_POSITION_THRESHOLD,
  RUNNING_STYLE_POSITION_THRESHOLDS,
} from "../passingPositionRunningStyle";
import type { PassingPositionData } from "../types";

describe("computePositionRatio", () => {
  it("position / fieldSize を返す", () => {
    expect(computePositionRatio(4, 16)).toBeCloseTo(0.25, 5);
    expect(computePositionRatio(1, 10)).toBeCloseTo(0.1, 5);
  });
});

describe("classifyRunningStyleFromPositions", () => {
  it(`最初の通過順位が${NIGE_LEAD_POSITION_THRESHOLD}番手以内なら逃げ`, () => {
    expect(classifyRunningStyleFromPositions([1], 10)).toBe("nige");
    expect(classifyRunningStyleFromPositions([2, 2, 3], 10)).toBe("nige");
  });

  it("前半〜中盤の平均位置比率が35%以内なら先行", () => {
    // 先頭ではない(3番手)が、比率0.3(<=0.35)なので先行
    expect(classifyRunningStyleFromPositions([3, 3], 10)).toBe("senko");
  });

  it("前半〜中盤の平均位置比率が35〜70%なら差し", () => {
    // 3走以上の場合、最終コーナー(終盤)を除いた平均で判定する
    expect(classifyRunningStyleFromPositions([5, 5, 5], 10)).toBe("sashi"); // 除外後[5,5]→0.5
  });

  it("前半〜中盤の平均位置比率が70%超なら追込", () => {
    expect(classifyRunningStyleFromPositions([8, 8], 10)).toBe("oikomi"); // 0.8
  });

  it("境界値(35%・70%ちょうど)はそれぞれ先行/差し側に含まれる", () => {
    expect(RUNNING_STYLE_POSITION_THRESHOLDS.senkoMaxRatio).toBe(0.35);
    expect(RUNNING_STYLE_POSITION_THRESHOLDS.sashiMaxRatio).toBe(0.7);
    expect(classifyRunningStyleFromPositions([3.5, 3.5], 10)).toBe("senko"); // 0.35ちょうど
    expect(classifyRunningStyleFromPositions([7, 7], 10)).toBe("sashi"); // 0.70ちょうど
  });
});

function raceWithPassingPosition(
  raceId: string,
  passingPosition: PassingPositionData | null,
  overrides: Partial<RacePerformanceInput> = {},
): ReturnType<typeof buildRacePerformance> {
  return buildRacePerformance({
    raceId,
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    passingPosition,
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 70,
    raceTimeScore: 70,
    final3FScore: 70,
    weightScore: 70,
    ...overrides,
  });
}

function pp(cornerPositions: number[], fieldSize = 10, isReliable = true): PassingPositionData {
  return { cornerPositions, fieldSize, source: "テストデータ", isReliable };
}

describe("computePassingPositionRunningStyle", () => {
  it("過去走が0件ならnull", () => {
    expect(computePassingPositionRunningStyle([])).toBeNull();
  });

  it("通過順位データを持つ過去走が1件も無ければnull", () => {
    const races = [raceWithPassingPosition("r1", null), raceWithPassingPosition("r2", null)];
    expect(computePassingPositionRunningStyle(races)).toBeNull();
  });

  it("isReliable=falseのデータは有効サンプルとして扱わない", () => {
    const races = [raceWithPassingPosition("r1", pp([1], 10, false))];
    expect(computePassingPositionRunningStyle(races)).toBeNull();
  });

  it("cornerPositionsが空配列のデータは有効サンプルとして扱わない", () => {
    const races = [raceWithPassingPosition("r1", pp([], 10, true))];
    expect(computePassingPositionRunningStyle(races)).toBeNull();
  });

  it("有効な通過順位データだけを使ってdistribution/dominantStyle/sampleCountを算出する", () => {
    const races = [
      raceWithPassingPosition("r1", pp([1], 10)), // nige
      raceWithPassingPosition("r2", pp([1], 10)), // nige
      raceWithPassingPosition("r3", pp([3, 3], 10)), // senko
      raceWithPassingPosition("r4", null), // 無効（無視される）
    ];
    const result = computePassingPositionRunningStyle(races)!;
    expect(result).not.toBeNull();
    expect(result.sampleCount).toBe(3);
    expect(result.distribution.nige).toBeCloseTo(66.7, 1);
    expect(result.distribution.senko).toBeCloseTo(33.3, 1);
    expect(result.dominantStyle).toBe("nige");
    expect(result.source).toBe("passingPosition");
    expect(result.usedPastRaces).toHaveLength(3);
  });

  it("有効サンプル数によってconfidenceが変化する（高:4走以上/中:2〜3走/低:0〜1走）", () => {
    const oneRace = [raceWithPassingPosition("r1", pp([1], 10))];
    expect(computePassingPositionRunningStyle(oneRace)!.confidence).toBe("low");

    const twoRaces = [raceWithPassingPosition("r1", pp([1], 10)), raceWithPassingPosition("r2", pp([1], 10))];
    expect(computePassingPositionRunningStyle(twoRaces)!.confidence).toBe("medium");

    const fourRaces = Array.from({ length: 4 }, (_, i) => raceWithPassingPosition(`r${i}`, pp([1], 10)));
    expect(computePassingPositionRunningStyle(fourRaces)!.confidence).toBe("high");
  });

  it("直近5走(RECENT_RACE_COUNT)を超える過去走は使わない", () => {
    const sixRaces = Array.from({ length: 6 }, (_, i) => raceWithPassingPosition(`r${i}`, pp([1], 10)));
    const result = computePassingPositionRunningStyle(sixRaces)!;
    expect(result.sampleCount).toBe(5);
  });
});

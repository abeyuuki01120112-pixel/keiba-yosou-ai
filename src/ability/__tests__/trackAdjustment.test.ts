import { describe, expect, it } from "vitest";
import { calculateTrackAdjustment, MIN_TRACK_ADJUSTMENT_SAMPLE_COUNT } from "../trackAdjustment";
import type { DayRaceRecord } from "../trackAdjustment";
import type { CourseTimeBaseline } from "../types";

const baseline: CourseTimeBaseline = {
  racecourse: "札幌",
  surface: "turf",
  distance: 2000,
  going: "良",
  sampleYears: 5,
  sampleCount: 40,
  medianTimeSeconds: 120.0,
};
const baselines: CourseTimeBaseline[] = [baseline];

function dayRace(overrides: Partial<DayRaceRecord> & Pick<DayRaceRecord, "raceId" | "officialTimeSeconds">): DayRaceRecord {
  return {
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    ...overrides,
  };
}

describe("calculateTrackAdjustment", () => {
  it("対象レース自身を当日補正の計算から除外できる（自己参照回避）", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 200 }); // 極端な値
    const others = [
      dayRace({ raceId: "a", officialTimeSeconds: 119.3 }),
      dayRace({ raceId: "b", officialTimeSeconds: 119.1 }),
      dayRace({ raceId: "c", officialTimeSeconds: 119.2 }),
    ];
    const result = calculateTrackAdjustment(target, [target, ...others], baselines);
    // targetの極端な200秒が補正値に混入していないこと
    expect(result.adjustmentSeconds).toBeCloseTo(119.2 - 120.0, 5);
  });

  it("当日芝とダートが混ざらない", () => {
    const dirtBaseline: CourseTimeBaseline = { ...baseline, surface: "dirt", medianTimeSeconds: 125.0 };
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0, surface: "turf" });
    const races = [
      target,
      dayRace({ raceId: "turf2", officialTimeSeconds: 119.0, surface: "turf" }),
      dayRace({ raceId: "turf3", officialTimeSeconds: 119.0, surface: "turf" }),
      dayRace({ raceId: "dirt1", officialTimeSeconds: 200.0, surface: "dirt" }), // 極端なダート値
      dayRace({ raceId: "dirt2", officialTimeSeconds: 200.0, surface: "dirt" }),
    ];
    const result = calculateTrackAdjustment(target, races, [baseline, dirtBaseline]);
    expect(result.sampleCount).toBe(2); // turf2・turf3のみ（dirtは含まれない）
    expect(result.adjustmentSeconds).toBeCloseTo(119.0 - 120.0, 5);
  });

  it("同じ競馬場でない他会場のレースは含めない", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0, racecourse: "札幌" });
    const races = [
      target,
      dayRace({ raceId: "other-course", officialTimeSeconds: 999, racecourse: "函館" }),
    ];
    const result = calculateTrackAdjustment(target, races, baselines);
    expect(result.sampleCount).toBe(0);
    expect(result.isReliable).toBe(false);
  });

  it("当日馬場補正の中央値が正しい", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0 });
    const times = [119.3, 119.1, 119.4, 119.0, 119.2]; // baseline=120.0 -> diffs: -0.7,-0.9,-0.6,-1.0,-0.8
    const races = [
      target,
      ...times.map((t, i) => dayRace({ raceId: `r${i}`, officialTimeSeconds: t })),
    ];
    const result = calculateTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeCloseTo(-0.8, 5);
  });

  it("高速馬場（実タイムが基準より速い）でマイナス補正になる", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0 });
    const races = [
      target,
      dayRace({ raceId: "a", officialTimeSeconds: 118.5 }),
      dayRace({ raceId: "b", officialTimeSeconds: 118.7 }),
    ];
    const result = calculateTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeLessThan(0);
  });

  it("時計のかかる馬場（実タイムが基準より遅い）でプラス補正になる", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0 });
    const races = [
      target,
      dayRace({ raceId: "a", officialTimeSeconds: 121.5 }),
      dayRace({ raceId: "b", officialTimeSeconds: 121.7 }),
    ];
    const result = calculateTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeGreaterThan(0);
  });

  it("サンプル不足でも壊れない（adjustmentSeconds=0・isReliable=falseにフォールバック）", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0 });
    const races = [target, dayRace({ raceId: "only-one-other", officialTimeSeconds: 118.0 })];
    expect(() => calculateTrackAdjustment(target, races, baselines)).not.toThrow();
    const result = calculateTrackAdjustment(target, races, baselines);
    expect(result.sampleCount).toBeLessThan(MIN_TRACK_ADJUSTMENT_SAMPLE_COUNT);
    expect(result.adjustmentSeconds).toBe(0);
    expect(result.isReliable).toBe(false);
  });

  it("同日・同競馬場・同surfaceのレースが1件も無くても壊れない", () => {
    const target = dayRace({ raceId: "target", officialTimeSeconds: 119.0 });
    expect(() => calculateTrackAdjustment(target, [target], baselines)).not.toThrow();
    const result = calculateTrackAdjustment(target, [target], baselines);
    expect(result.sampleCount).toBe(0);
    expect(result.isReliable).toBe(false);
    expect(result.adjustmentSeconds).toBe(0);
  });
});

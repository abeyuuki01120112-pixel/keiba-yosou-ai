import { describe, expect, it } from "vitest";
import {
  calculateFinal3FTrackAdjustment,
  MIN_FINAL3F_ADJUSTMENT_SAMPLE_COUNT,
} from "../final3FTrackAdjustment";
import type { DayFinal3FRecord } from "../final3FTrackAdjustment";
import type { CourseFinal3FBaseline } from "../types";

const baseline: CourseFinal3FBaseline = {
  racecourse: "札幌",
  surface: "turf",
  distance: 2000,
  going: "良",
  sampleYears: 5,
  sampleCount: 40,
  medianFinal3FSeconds: 35.0,
  source: "test",
};
const baselines: CourseFinal3FBaseline[] = [baseline];

function dayRace(
  overrides: Partial<DayFinal3FRecord> & Pick<DayFinal3FRecord, "raceId" | "raceFinal3FMedianSeconds">,
): DayFinal3FRecord {
  return {
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    ...overrides,
  };
}

describe("calculateFinal3FTrackAdjustment", () => {
  it("対象レース自身を当日補正の計算から除外できる（自己参照回避）", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 50 }); // 極端な値
    const others = [
      dayRace({ raceId: "a", raceFinal3FMedianSeconds: 34.3 }),
      dayRace({ raceId: "b", raceFinal3FMedianSeconds: 34.1 }),
      dayRace({ raceId: "c", raceFinal3FMedianSeconds: 34.2 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, [target, ...others], baselines);
    expect(result.adjustmentSeconds).toBeCloseTo(34.2 - 35.0, 5);
  });

  it("当日芝とダートが混ざらない", () => {
    const dirtBaseline: CourseFinal3FBaseline = { ...baseline, surface: "dirt", medianFinal3FSeconds: 38.0 };
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, surface: "turf" });
    const races = [
      target,
      dayRace({ raceId: "turf2", raceFinal3FMedianSeconds: 34.0, surface: "turf" }),
      dayRace({ raceId: "turf3", raceFinal3FMedianSeconds: 34.0, surface: "turf" }),
      dayRace({ raceId: "dirt1", raceFinal3FMedianSeconds: 50.0, surface: "dirt" }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, [baseline, dirtBaseline]);
    expect(result.sampleCount).toBe(2);
    expect(result.adjustmentSeconds).toBeCloseTo(34.0 - 35.0, 5);
  });

  it("当日上がり補正の中央値が正しい", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0 });
    const values = [34.3, 34.1, 34.4, 34.0, 34.2]; // baseline=35.0 -> diffs: -0.7,-0.9,-0.6,-1.0,-0.8
    const races = [
      target,
      ...values.map((v, i) => dayRace({ raceId: `r${i}`, raceFinal3FMedianSeconds: v })),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeCloseTo(-0.8, 5);
  });

  it("高速馬場（上がりが基準より速い）でマイナス補正になる", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0 });
    const races = [
      target,
      dayRace({ raceId: "a", raceFinal3FMedianSeconds: 33.5 }),
      dayRace({ raceId: "b", raceFinal3FMedianSeconds: 33.7 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeLessThan(0);
  });

  it("時計のかかる馬場（上がりが基準より遅い）でプラス補正になる", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0 });
    const races = [
      target,
      dayRace({ raceId: "a", raceFinal3FMedianSeconds: 36.5 }),
      dayRace({ raceId: "b", raceFinal3FMedianSeconds: 36.7 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeGreaterThan(0);
  });

  it("サンプル不足でも壊れない（adjustmentSeconds=0・isReliable=falseにフォールバック）", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0 });
    const races = [target, dayRace({ raceId: "only-one-other", raceFinal3FMedianSeconds: 33.5 })];
    expect(() => calculateFinal3FTrackAdjustment(target, races, baselines)).not.toThrow();
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.sampleCount).toBeLessThan(MIN_FINAL3F_ADJUSTMENT_SAMPLE_COUNT);
    expect(result.adjustmentSeconds).toBe(0);
    expect(result.isReliable).toBe(false);
  });
});

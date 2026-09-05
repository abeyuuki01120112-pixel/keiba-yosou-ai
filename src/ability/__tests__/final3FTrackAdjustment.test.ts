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
    raceNumber: null,
    ...overrides,
  };
}

/** target=11R想定。他レースは1R〜10Rとして、対象より前のraceNumberを与える */
function earlierRace(
  raceNumber: number,
  overrides: Partial<DayFinal3FRecord> & Pick<DayFinal3FRecord, "raceId" | "raceFinal3FMedianSeconds">,
): DayFinal3FRecord {
  return dayRace({ raceNumber, ...overrides });
}

describe("calculateFinal3FTrackAdjustment", () => {
  it("対象レース自身を当日補正の計算から除外できる（自己参照回避）", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 50, raceNumber: 11 }); // 極端な値
    const others = [
      earlierRace(1, { raceId: "a", raceFinal3FMedianSeconds: 34.3 }),
      earlierRace(2, { raceId: "b", raceFinal3FMedianSeconds: 34.1 }),
      earlierRace(3, { raceId: "c", raceFinal3FMedianSeconds: 34.2 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, [target, ...others], baselines);
    expect(result.adjustmentSeconds).toBeCloseTo(34.2 - 35.0, 5);
  });

  it("当日芝とダートが混ざらない", () => {
    const dirtBaseline: CourseFinal3FBaseline = { ...baseline, surface: "dirt", medianFinal3FSeconds: 38.0 };
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, surface: "turf", raceNumber: 11 });
    const races = [
      target,
      earlierRace(1, { raceId: "turf2", raceFinal3FMedianSeconds: 34.0, surface: "turf" }),
      earlierRace(2, { raceId: "turf3", raceFinal3FMedianSeconds: 34.0, surface: "turf" }),
      earlierRace(3, { raceId: "dirt1", raceFinal3FMedianSeconds: 50.0, surface: "dirt" }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, [baseline, dirtBaseline]);
    expect(result.sampleCount).toBe(2);
    expect(result.adjustmentSeconds).toBeCloseTo(34.0 - 35.0, 5);
  });

  it("当日上がり補正の中央値が正しい", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
    const values = [34.3, 34.1, 34.4, 34.0, 34.2]; // baseline=35.0 -> diffs: -0.7,-0.9,-0.6,-1.0,-0.8
    const races = [
      target,
      ...values.map((v, i) => earlierRace(i + 1, { raceId: `r${i}`, raceFinal3FMedianSeconds: v })),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeCloseTo(-0.8, 5);
  });

  it("高速馬場（上がりが基準より速い）でマイナス補正になる", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
    const races = [
      target,
      earlierRace(1, { raceId: "a", raceFinal3FMedianSeconds: 33.5 }),
      earlierRace(2, { raceId: "b", raceFinal3FMedianSeconds: 33.7 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeLessThan(0);
  });

  it("時計のかかる馬場（上がりが基準より遅い）でプラス補正になる", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
    const races = [
      target,
      earlierRace(1, { raceId: "a", raceFinal3FMedianSeconds: 36.5 }),
      earlierRace(2, { raceId: "b", raceFinal3FMedianSeconds: 36.7 }),
    ];
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.adjustmentSeconds).toBeGreaterThan(0);
  });

  it("サンプル不足でも壊れない（adjustmentSeconds=0・isReliable=falseにフォールバック）", () => {
    const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
    const races = [target, earlierRace(1, { raceId: "only-one-other", raceFinal3FMedianSeconds: 33.5 })];
    expect(() => calculateFinal3FTrackAdjustment(target, races, baselines)).not.toThrow();
    const result = calculateFinal3FTrackAdjustment(target, races, baselines);
    expect(result.sampleCount).toBeLessThan(MIN_FINAL3F_ADJUSTMENT_SAMPLE_COUNT);
    expect(result.adjustmentSeconds).toBe(0);
    expect(result.isReliable).toBe(false);
  });

  describe("future leakage防止（第26実装）", () => {
    it("1. 11R予想時に1R〜10Rは使用可能", () => {
      const target = dayRace({ raceId: "11R", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [
        target,
        earlierRace(1, { raceId: "1R", raceFinal3FMedianSeconds: 34.3 }),
        earlierRace(10, { raceId: "10R", raceFinal3FMedianSeconds: 34.1 }),
      ];
      const result = calculateFinal3FTrackAdjustment(target, races, baselines);
      expect(result.sampleCount).toBe(2);
    });

    it("2. 11R自身は使用禁止（自己参照）", () => {
      const target = dayRace({ raceId: "11R", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const result = calculateFinal3FTrackAdjustment(target, [target], baselines);
      expect(result.sampleCount).toBe(0);
    });

    it("3. 12R（対象より後のレース）は使用禁止", () => {
      const target = dayRace({ raceId: "11R", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [
        target,
        earlierRace(1, { raceId: "1R", raceFinal3FMedianSeconds: 34.3 }),
        earlierRace(12, { raceId: "12R", raceFinal3FMedianSeconds: 34.1 }),
      ];
      const result = calculateFinal3FTrackAdjustment(target, races, baselines);
      expect(result.sampleCount).toBe(1); // 1Rのみ使用され、12Rは除外される
    });

    it("同じraceNumber(target自身と同番号の別レコード)は使用禁止", () => {
      const target = dayRace({ raceId: "11R", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [target, dayRace({ raceId: "11R-dup", raceFinal3FMedianSeconds: 34.1, raceNumber: 11 })];
      const result = calculateFinal3FTrackAdjustment(target, races, baselines);
      expect(result.sampleCount).toBe(0);
    });

    it("raceNumberが不明（null）なレースは安全側に倒し使用しない", () => {
      const target = dayRace({ raceId: "11R", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [
        target,
        dayRace({ raceId: "unknown", raceFinal3FMedianSeconds: 34.3, raceNumber: null }),
        earlierRace(1, { raceId: "1R", raceFinal3FMedianSeconds: 34.1 }),
      ];
      const result = calculateFinal3FTrackAdjustment(target, races, baselines);
      expect(result.sampleCount).toBe(1); // unknownは除外、1Rのみ使用
    });

    it("targetのraceNumber自体が不明な場合は同日プール全体を使用しない", () => {
      const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: null });
      const races = [target, earlierRace(1, { raceId: "1R", raceFinal3FMedianSeconds: 34.1 })];
      const result = calculateFinal3FTrackAdjustment(target, races, baselines);
      expect(result.sampleCount).toBe(0);
    });
  });

  describe("仮データ・低信頼baselineの混入防止（第26実装）", () => {
    it("4. isReliable=false（sampleCount不足）のbaselineを参照するレースはtrackAdjustment対象から除外される", () => {
      const unreliableBaseline: CourseFinal3FBaseline = {
        racecourse: "小倉",
        surface: "turf",
        distance: 1800,
        going: "良",
        sampleYears: 1,
        sampleCount: 3, // MIN_RELIABLE_SAMPLE_COUNT(15)未満
        medianFinal3FSeconds: 40.0,
        source: "JRA確認済みサンプル(n=3) verified",
      };
      const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [
        target,
        earlierRace(1, { raceId: "reliable1", raceFinal3FMedianSeconds: 34.3 }), // baseline(sc=40, 高信頼)
        earlierRace(2, {
          raceId: "unreliable1",
          raceFinal3FMedianSeconds: 39.5,
          racecourse: "小倉",
          distance: 1800,
        }), // unreliableBaseline(sc=3, 低信頼)
      ];
      const result = calculateFinal3FTrackAdjustment(target, races, [baseline, unreliableBaseline]);
      expect(result.sampleCount).toBe(1); // unreliable1は除外され、reliable1のみ使用される
    });

    it("placeholder(V0仮データ)由来のbaselineを参照するレースも除外される", () => {
      const placeholderBaseline: CourseFinal3FBaseline = {
        racecourse: "東京",
        surface: "turf",
        distance: 2000,
        going: "良",
        sampleYears: 5,
        sampleCount: 30, // sampleCountは高いが仮データ
        medianFinal3FSeconds: 33.0,
        source: "V0テスト用仮データ（実データ未投入）",
      };
      const target = dayRace({ raceId: "target", raceFinal3FMedianSeconds: 34.0, raceNumber: 11 });
      const races = [
        target,
        earlierRace(1, { raceId: "reliable1", raceFinal3FMedianSeconds: 34.3 }),
        earlierRace(2, {
          raceId: "placeholder1",
          raceFinal3FMedianSeconds: 33.0,
          racecourse: "東京",
          distance: 2000,
        }),
      ];
      const result = calculateFinal3FTrackAdjustment(target, races, [baseline, placeholderBaseline]);
      expect(result.sampleCount).toBe(1); // placeholder1は除外され、reliable1のみ使用される
    });
  });
});

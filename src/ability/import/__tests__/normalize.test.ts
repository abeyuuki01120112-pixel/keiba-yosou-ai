import { describe, expect, it } from "vitest";
import { normalizeRacePerformance } from "../normalize";

function validRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    raceId: "r1",
    raceDate: "2026-06-20",
    racecourse: "東京",
    raceNumber: "11",
    raceName: "テストレース",
    surface: "turf",
    distance: "2000",
    going: "良",
    horseId: "horse1",
    horseName: "テストホース",
    horseNumber: "1",
    gate: "1",
    finishPosition: "1",
    carriedWeightKg: "56",
    actualRaceTimeSeconds: "119.5",
    final3FSeconds: "34.5",
    timeGapSeconds: "-0.3",
    fieldSize: "10",
    ...overrides,
  };
}

describe("normalizeRacePerformance", () => {
  it("正常な行を検証済みデータへ変換する", () => {
    const result = normalizeRacePerformance(validRow(), 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.raceId).toBe("r1");
      expect(result.data.horseId).toBe("horse1");
      expect(result.data.distance).toBe(2000);
      expect(result.data.finishPosition).toBe(1);
      expect(result.data.timeGapSeconds).toBe(-0.3);
    }
  });

  it("raceIdが無ければエラー", () => {
    const result = normalizeRacePerformance(validRow({ raceId: "" }), 1);
    expect(result.ok).toBe(false);
  });

  it("horseIdが無ければエラー", () => {
    const result = normalizeRacePerformance(validRow({ horseId: "" }), 1);
    expect(result.ok).toBe(false);
  });

  it("raceDateの形式が不正ならエラー", () => {
    expect(normalizeRacePerformance(validRow({ raceDate: "2026/06/20" }), 1).ok).toBe(false);
    expect(normalizeRacePerformance(validRow({ raceDate: "not-a-date" }), 1).ok).toBe(false);
  });

  it("surfaceがturf/dirt以外ならエラー", () => {
    expect(normalizeRacePerformance(validRow({ surface: "grass" }), 1).ok).toBe(false);
  });

  it("distanceが0以下ならエラー", () => {
    expect(normalizeRacePerformance(validRow({ distance: "0" }), 1).ok).toBe(false);
    expect(normalizeRacePerformance(validRow({ distance: "-100" }), 1).ok).toBe(false);
  });

  it("actualRaceTimeSecondsが0以下ならエラー", () => {
    expect(normalizeRacePerformance(validRow({ actualRaceTimeSeconds: "0" }), 1).ok).toBe(false);
  });

  it("final3FSecondsが0以下ならエラー", () => {
    expect(normalizeRacePerformance(validRow({ final3FSeconds: "-1" }), 1).ok).toBe(false);
  });

  it("carriedWeightKgが常識的範囲外ならエラー（異常値除外）", () => {
    expect(normalizeRacePerformance(validRow({ carriedWeightKg: "10" }), 1).ok).toBe(false);
    expect(normalizeRacePerformance(validRow({ carriedWeightKg: "500" }), 1).ok).toBe(false);
  });

  it("finishPositionが1未満・整数でなければエラー", () => {
    expect(normalizeRacePerformance(validRow({ finishPosition: "0" }), 1).ok).toBe(false);
    expect(normalizeRacePerformance(validRow({ finishPosition: "1.5" }), 1).ok).toBe(false);
  });

  it("timeGapSecondsは負の値でもエラーにならない（勝ち馬の着差表現）", () => {
    const result = normalizeRacePerformance(validRow({ timeGapSeconds: "-1.2" }), 1);
    expect(result.ok).toBe(true);
  });

  describe("null安全処理（欠損許容フィールド）", () => {
    it("finishPosition/carriedWeightKg/actualRaceTimeSeconds/final3FSeconds/timeGapSecondsが空セルならnullになる（0にしない）", () => {
      const result = normalizeRacePerformance(
        validRow({
          finishPosition: "",
          carriedWeightKg: "",
          actualRaceTimeSeconds: "",
          final3FSeconds: "",
          timeGapSeconds: "",
        }),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.finishPosition).toBeNull();
        expect(result.data.carriedWeightKg).toBeNull();
        expect(result.data.actualRaceTimeSeconds).toBeNull();
        expect(result.data.final3FSeconds).toBeNull();
        expect(result.data.timeGapSeconds).toBeNull();
      }
    });

    it("raceNumber/gate/horseNumber/fieldSizeも空セルならnullになる", () => {
      const result = normalizeRacePerformance(
        validRow({ raceNumber: "", gate: "", horseNumber: "", fieldSize: "" }),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.raceNumber).toBeNull();
        expect(result.data.gate).toBeNull();
        expect(result.data.horseNumber).toBeNull();
        expect(result.data.fieldSize).toBeNull();
      }
    });

    it("空セルではなく不正な文字列（非数値）が入っていればエラーにする", () => {
      const result = normalizeRacePerformance(validRow({ actualRaceTimeSeconds: "不明" }), 1);
      expect(result.ok).toBe(false);
    });
  });

  it("異常データ1件でも例外を投げない（呼び出し側が落ちない）", () => {
    expect(() => normalizeRacePerformance({}, 1)).not.toThrow();
    const result = normalizeRacePerformance({}, 1);
    expect(result.ok).toBe(false);
  });

  it("エラー時はrowIndex等の手がかりを含む", () => {
    const result = normalizeRacePerformance(validRow({ distance: "-1" }), 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rowIndex).toBe(5);
      expect(result.error.raceId).toBe("r1");
      expect(result.error.horseId).toBe("horse1");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});

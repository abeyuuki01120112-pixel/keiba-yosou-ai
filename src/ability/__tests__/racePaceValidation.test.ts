/**
 * Historical Pace Validation V1（CHECKPOINT14C.1）の単体テスト。
 * 実Lapデータが存在しないため、全て合成データによる純粋関数の検証のみ
 * （CHECKPOINT14CのRace Pace Prediction Engineは一切呼び出さない・変更しない）。
 */
import { describe, expect, it } from "vitest";
import { buildActualPaceMetrics, deriveFirst1000mSeconds, deriveFirst600mSeconds } from "../racePaceValidation";
import type { RaceLapSequenceRecord } from "../racePaceValidationTypes";

function lapRecord(overrides: Partial<RaceLapSequenceRecord> = {}): RaceLapSequenceRecord {
  return {
    raceId: "JRA-TEST-01",
    raceDate: "2026-01-01",
    raceName: "テストレース",
    raceNumber: 11,
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    fieldSize: 14,
    courseLayout: null,
    raceClass: null,
    segmentMeters: 200,
    // 10区間 × 200m = 2000m。前半3区間の合計=600m、前半5区間の合計=1000m
    lapSequence: [12.5, 11.2, 11.8, 11.9, 12.0, 12.1, 12.0, 11.7, 11.5, 11.9],
    source: "test",
    ...overrides,
  };
}

describe("deriveFirst600mSeconds", () => {
  it("200m区間×3を合計してfirst600mを算出する", () => {
    const record = lapRecord();
    const expected = Math.round((12.5 + 11.2 + 11.8) * 100) / 100;
    expect(deriveFirst600mSeconds(record)).toBeCloseTo(expected, 5);
  });

  it("distance<600mの場合はnull（600m自体走らないレース）", () => {
    const record = lapRecord({ distance: 500, lapSequence: [12.5, 11.2] });
    expect(deriveFirst600mSeconds(record)).toBeNull();
  });

  it("segmentMetersが600mを割り切れない場合はnull（推測しない）", () => {
    const record = lapRecord({ segmentMeters: 400, lapSequence: [23.0, 22.5, 22.0, 21.5, 21.0] });
    expect(deriveFirst600mSeconds(record)).toBeNull();
  });

  it("lapSequenceが必要区間数に満たない場合はnull", () => {
    const record = lapRecord({ lapSequence: [12.5, 11.2] }); // 600mには3区間必要だが2区間しかない
    expect(deriveFirst600mSeconds(record)).toBeNull();
  });
});

describe("deriveFirst1000mSeconds", () => {
  it("200m区間×5を合計してfirst1000mを算出する", () => {
    const record = lapRecord();
    const expected = Math.round((12.5 + 11.2 + 11.8 + 11.9 + 12.0) * 100) / 100;
    expect(deriveFirst1000mSeconds(record)).toBeCloseTo(expected, 5);
  });

  it("distance<1000mの場合はnull（距離別対応、CHECKPOINT14C.1 5節）", () => {
    const record = lapRecord({ distance: 800, lapSequence: [12.5, 11.2, 11.8, 11.9] });
    expect(deriveFirst1000mSeconds(record)).toBeNull();
  });

  it("スプリント1200mではfirst1000mを算出できる（distance>=1000mなら算出対象）", () => {
    const record = lapRecord({
      distance: 1200,
      segmentMeters: 200,
      lapSequence: [12.0, 11.0, 11.5, 11.8, 12.0, 11.9],
    });
    const expected = Math.round((12.0 + 11.0 + 11.5 + 11.8 + 12.0) * 100) / 100;
    expect(deriveFirst1000mSeconds(record)).toBeCloseTo(expected, 5);
  });
});

describe("buildActualPaceMetrics", () => {
  it("first600m/first1000mは算出するが、continuousActualPace/actualPaceClassはbaseline未実装のため常にnull", () => {
    const metrics = buildActualPaceMetrics(lapRecord());
    expect(metrics.first600mSeconds).not.toBeNull();
    expect(metrics.first1000mSeconds).not.toBeNull();
    expect(metrics.continuousActualPace).toBeNull();
    expect(metrics.actualPaceClass).toBeNull();
    expect(metrics.warnings.some((w) => w.includes("baseline"))).toBe(true);
  });

  it("着順等の結果論に依存するフィールドが型・出力のいずれにも存在しない", () => {
    const metrics = buildActualPaceMetrics(lapRecord());
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toMatch(/finishPosition|着順|winner|勝ち馬/);
  });

  it("lapSequenceの区間数×segmentMetersがdistanceと大きく食い違う場合は警告する", () => {
    const record = lapRecord({ distance: 3200, lapSequence: [12.5, 11.2, 11.8] }); // 600mしか無いのに3200m戦
    const metrics = buildActualPaceMetrics(record);
    expect(metrics.warnings.some((w) => w.includes("食い違って"))).toBe(true);
  });

  it("lapSequenceが空の場合も安全に処理する（例外を投げない）", () => {
    const record = lapRecord({ lapSequence: [] });
    const metrics = buildActualPaceMetrics(record);
    expect(metrics.first600mSeconds).toBeNull();
    expect(metrics.first1000mSeconds).toBeNull();
    expect(metrics.warnings.some((w) => w.includes("空です"))).toBe(true);
  });
});

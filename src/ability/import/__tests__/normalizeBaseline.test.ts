import { describe, expect, it } from "vitest";
import { normalizeCourseFinal3FBaselineRow, normalizeCourseTimeBaselineRow } from "../normalizeBaseline";

function timeRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    racecourse: "札幌",
    surface: "turf",
    distance: "2000",
    going: "良",
    sampleYears: "5",
    sampleCount: "42",
    medianTimeSeconds: "119.8",
    source: "netkeiba 2021-2025集計",
    ...overrides,
  };
}

function final3fRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    racecourse: "札幌",
    surface: "turf",
    distance: "2000",
    going: "良",
    sampleYears: "5",
    sampleCount: "42",
    medianFinal3FSeconds: "35.0",
    source: "netkeiba 2021-2025集計",
    ...overrides,
  };
}

describe("normalizeCourseTimeBaselineRow", () => {
  it("正常な行を検証済みデータへ変換できる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      racecourse: "札幌",
      surface: "turf",
      distance: 2000,
      going: "良",
      sampleYears: 5,
      sampleCount: 42,
      medianTimeSeconds: 119.8,
      source: "netkeiba 2021-2025集計",
    });
  });

  it("sourceが空ならエラーになる（実データ差し替えの入口として出典必須）", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ source: "" }), 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("source");
  });

  it("surfaceがturf/dirt以外ならエラーになる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ surface: "芝" }), 1);
    expect(result.ok).toBe(false);
  });

  it("distanceが数値でなければエラーになる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ distance: "abc" }), 1);
    expect(result.ok).toBe(false);
  });

  it("sampleCountが正の整数でなければエラーになる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ sampleCount: "0" }), 1);
    expect(result.ok).toBe(false);
  });

  it("medianTimeSecondsが正の値でなければエラーになる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ medianTimeSeconds: "-1" }), 1);
    expect(result.ok).toBe(false);
  });

  it("rowIndexがエラーに含まれる", () => {
    const result = normalizeCourseTimeBaselineRow(timeRow({ racecourse: "" }), 7);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.rowIndex).toBe(7);
  });
});

describe("normalizeCourseFinal3FBaselineRow", () => {
  it("正常な行を検証済みデータへ変換できる", () => {
    const result = normalizeCourseFinal3FBaselineRow(final3fRow(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.medianFinal3FSeconds).toBe(35.0);
    expect(result.data.source).toBe("netkeiba 2021-2025集計");
  });

  it("medianFinal3FSecondsが空ならエラーになる", () => {
    const result = normalizeCourseFinal3FBaselineRow(final3fRow({ medianFinal3FSeconds: "" }), 1);
    expect(result.ok).toBe(false);
  });

  it("goingが空ならエラーになる", () => {
    const result = normalizeCourseFinal3FBaselineRow(final3fRow({ going: "" }), 1);
    expect(result.ok).toBe(false);
  });
});

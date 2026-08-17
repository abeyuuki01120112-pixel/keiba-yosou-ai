import { describe, expect, it } from "vitest";
import {
  buildCourseFinal3FBaselineImportResult,
  buildCourseTimeBaselineImportResult,
} from "../buildBaselineImportResult";

describe("buildCourseTimeBaselineImportResult", () => {
  it("CSVを読み込み、正常行をbaselinesへ変換する", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source",
      "札幌,turf,2000,良,5,42,119.8,netkeiba集計",
      "函館,turf,2000,良,5,30,120.5,netkeiba集計",
    ].join("\n");
    const result = buildCourseTimeBaselineImportResult(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.baselines).toHaveLength(2);
    expect(result.baselines[0].medianTimeSeconds).toBe(119.8);
  });

  it("不正な行はエラーとして分離され、baselinesには含まれない", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source",
      "札幌,turf,2000,良,5,42,119.8,netkeiba集計",
      "函館,turf,2000,良,5,30,,netkeiba集計", // medianTimeSeconds欠落
    ].join("\n");
    const result = buildCourseTimeBaselineImportResult(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].rowIndex).toBe(2);
  });

  it("baselineSource・isReliable列があっても無視され、ignoredColumnsとして報告される", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source,baselineSource,isReliable",
      "札幌,turf,2000,良,5,42,119.8,netkeiba集計,exact,true",
    ].join("\n");
    const result = buildCourseTimeBaselineImportResult(csv);
    expect(result.validCount).toBe(1);
    expect(result.ignoredColumns.sort()).toEqual(["baselineSource", "isReliable"]);
    // baselinesオブジェクトにbaselineSource/isReliableが保存されていないこと
    expect(result.baselines[0]).not.toHaveProperty("baselineSource");
    expect(result.baselines[0]).not.toHaveProperty("isReliable");
  });

  it("同一条件（競馬場×surface×距離×馬場状態）の重複行はエラーになる", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source",
      "札幌,turf,2000,良,5,42,119.8,netkeiba集計",
      "札幌,turf,2000,良,5,50,120.0,別の出典",
    ].join("\n");
    const result = buildCourseTimeBaselineImportResult(csv);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].message).toContain("重複");
  });

  it("空のCSVはtotalRows=0で正常終了する", () => {
    const result = buildCourseTimeBaselineImportResult("racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source");
    expect(result.totalRows).toBe(0);
    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(0);
  });
});

describe("buildCourseFinal3FBaselineImportResult", () => {
  it("CSVを読み込み、正常行をbaselinesへ変換する", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianFinal3FSeconds,source",
      "札幌,turf,2000,良,5,42,35.0,netkeiba集計",
    ].join("\n");
    const result = buildCourseFinal3FBaselineImportResult(csv);
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.baselines[0].medianFinal3FSeconds).toBe(35.0);
  });

  it("重複条件はエラーになる", () => {
    const csv = [
      "racecourse,surface,distance,going,sampleYears,sampleCount,medianFinal3FSeconds,source",
      "札幌,turf,2000,良,5,42,35.0,netkeiba集計",
      "札幌,turf,2000,良,5,50,34.0,別の出典",
    ].join("\n");
    const result = buildCourseFinal3FBaselineImportResult(csv);
    expect(result.errorCount).toBe(1);
  });
});

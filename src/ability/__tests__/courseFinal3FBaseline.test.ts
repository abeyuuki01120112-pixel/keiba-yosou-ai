import { describe, expect, it } from "vitest";
import { findCourseFinal3FBaseline } from "../courseFinal3FBaseline";
import type { CourseFinal3FBaseline } from "../types";

const baselines: CourseFinal3FBaseline[] = [
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 42, medianFinal3FSeconds: 35.0 },
  { racecourse: "札幌", surface: "turf", distance: 1800, going: "良", sampleYears: 5, sampleCount: 40, medianFinal3FSeconds: 34.5 },
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "重", sampleYears: 5, sampleCount: 20, medianFinal3FSeconds: 36.2 },
  { racecourse: "函館", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 30, medianFinal3FSeconds: 35.4 },
  { racecourse: "札幌", surface: "dirt", distance: 2000, going: "良", sampleYears: 5, sampleCount: 25, medianFinal3FSeconds: 38.0 },
];

describe("findCourseFinal3FBaseline", () => {
  it("過去5年同条件上がり基準が取得できる", () => {
    const baseline = findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(baseline).toBeDefined();
    expect(baseline!.medianFinal3FSeconds).toBe(35.0);
  });

  it("競馬場で正しく分離される", () => {
    const sapporo = findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    const hakodate = findCourseFinal3FBaseline(baselines, "函館", "turf", 2000, "良");
    expect(sapporo!.medianFinal3FSeconds).not.toBe(hakodate!.medianFinal3FSeconds);
  });

  it("surfaceで正しく分離される（芝とダートを混同しない）", () => {
    const turf = findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    const dirt = findCourseFinal3FBaseline(baselines, "札幌", "dirt", 2000, "良");
    expect(turf!.medianFinal3FSeconds).toBe(35.0);
    expect(dirt!.medianFinal3FSeconds).toBe(38.0);
  });

  it("馬場状態で正しく分離される", () => {
    const yoi = findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    const omoi = findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "重");
    expect(yoi!.medianFinal3FSeconds).toBe(35.0);
    expect(omoi!.medianFinal3FSeconds).toBe(36.2);
  });

  it("該当する基準が無い場合はundefinedを返す", () => {
    expect(findCourseFinal3FBaseline(baselines, "小倉", "turf", 2000, "良")).toBeUndefined();
  });
});

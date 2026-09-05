import { describe, expect, it } from "vitest";
import { findCourseFinal3FBaseline, lookupCourseFinal3FBaseline } from "../courseFinal3FBaseline";
import { MIN_RELIABLE_SAMPLE_COUNT } from "../baselineLookup";
import type { CourseFinal3FBaseline } from "../types";

const baselines: CourseFinal3FBaseline[] = [
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 42, medianFinal3FSeconds: 35.0, source: "test" },
  { racecourse: "札幌", surface: "turf", distance: 1800, going: "良", sampleYears: 5, sampleCount: 40, medianFinal3FSeconds: 34.5, source: "test" },
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "重", sampleYears: 5, sampleCount: 20, medianFinal3FSeconds: 36.2, source: "test" },
  { racecourse: "函館", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 30, medianFinal3FSeconds: 35.4, source: "test" },
  { racecourse: "札幌", surface: "dirt", distance: 2000, going: "良", sampleYears: 5, sampleCount: 25, medianFinal3FSeconds: 38.0, source: "test" },
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

describe("lookupCourseFinal3FBaseline（3段階fallback検索）", () => {
  it("①完全一致すればbaselineSource=exactで返す", () => {
    const { baseline, meta } = lookupCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(baseline!.medianFinal3FSeconds).toBe(35.0);
    expect(meta.baselineSource).toBe("exact");
    expect(meta.sampleCount).toBe(42);
  });

  it("②馬場状態が一致しなくても競馬場×surface×距離が一致すればbaselineSource=distanceFallbackで返す", () => {
    const { baseline, meta } = lookupCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "不良");
    expect(baseline).not.toBeNull();
    expect(meta.baselineSource).toBe("distanceFallback");
    expect([35.0, 36.2]).toContain(baseline!.medianFinal3FSeconds);
  });

  it("③競馬場×surface×距離すら一致しなければbaselineSource=defaultFallbackでbaselineはnull", () => {
    const { baseline, meta } = lookupCourseFinal3FBaseline(baselines, "小倉", "turf", 2000, "良");
    expect(baseline).toBeNull();
    expect(meta.baselineSource).toBe("defaultFallback");
    expect(meta.sampleCount).toBeNull();
    expect(meta.isReliable).toBe(false);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT以上ならisReliable=true（札幌turf2000良=42件）", () => {
    const { meta } = lookupCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(meta.sampleCount).toBe(42);
    expect(meta.sampleCount).toBeGreaterThanOrEqual(MIN_RELIABLE_SAMPLE_COUNT);
    expect(meta.isReliable).toBe(true);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT未満ならisReliable=false", () => {
    const lowSampleBaselines: CourseFinal3FBaseline[] = [
      {
        racecourse: "小倉",
        surface: "turf",
        distance: 1800,
        going: "良",
        sampleYears: 5,
        sampleCount: MIN_RELIABLE_SAMPLE_COUNT - 1,
        medianFinal3FSeconds: 34.0,
        source: "test",
      },
    ];
    const { meta } = lookupCourseFinal3FBaseline(lowSampleBaselines, "小倉", "turf", 1800, "良");
    expect(meta.sampleCount).toBe(MIN_RELIABLE_SAMPLE_COUNT - 1);
    expect(meta.isReliable).toBe(false);
  });

  it("既存のfindCourseFinal3FBaseline（exact専用）の挙動は変えない", () => {
    expect(findCourseFinal3FBaseline(baselines, "札幌", "turf", 2000, "不良")).toBeUndefined();
  });
});

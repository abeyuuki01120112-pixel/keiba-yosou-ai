import { describe, expect, it } from "vitest";
import { findCourseTimeBaseline, lookupCourseTimeBaseline } from "../courseTimeBaseline";
import { MIN_RELIABLE_SAMPLE_COUNT } from "../baselineLookup";
import type { CourseTimeBaseline } from "../types";

const baselines: CourseTimeBaseline[] = [
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 42, medianTimeSeconds: 119.8, source: "test" },
  { racecourse: "札幌", surface: "turf", distance: 1800, going: "良", sampleYears: 5, sampleCount: 40, medianTimeSeconds: 107.5, source: "test" },
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "重", sampleYears: 5, sampleCount: 20, medianTimeSeconds: 122.3, source: "test" },
  { racecourse: "函館", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 30, medianTimeSeconds: 120.5, source: "test" },
  { racecourse: "札幌", surface: "dirt", distance: 2000, going: "良", sampleYears: 5, sampleCount: 25, medianTimeSeconds: 125.0, source: "test" },
];

describe("findCourseTimeBaseline", () => {
  it("過去5年基準タイム中央値が取得できる", () => {
    const baseline = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(baseline).toBeDefined();
    expect(baseline!.medianTimeSeconds).toBe(119.8);
    expect(baseline!.sampleYears).toBe(5);
  });

  it("競馬場で正しく分離される（札幌と函館を混同しない）", () => {
    const sapporo = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    const hakodate = findCourseTimeBaseline(baselines, "函館", "turf", 2000, "良");
    expect(sapporo!.medianTimeSeconds).not.toBe(hakodate!.medianTimeSeconds);
  });

  it("surfaceで正しく分離される（芝とダートを混同しない）", () => {
    const turf = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    const dirt = findCourseTimeBaseline(baselines, "札幌", "dirt", 2000, "良");
    expect(turf!.medianTimeSeconds).toBe(119.8);
    expect(dirt!.medianTimeSeconds).toBe(125.0);
  });

  it("距離で正しく分離される", () => {
    const d2000 = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    const d1800 = findCourseTimeBaseline(baselines, "札幌", "turf", 1800, "良");
    expect(d2000!.medianTimeSeconds).toBe(119.8);
    expect(d1800!.medianTimeSeconds).toBe(107.5);
  });

  it("馬場状態で正しく分離される", () => {
    const yoi = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    const omoi = findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "重");
    expect(yoi!.medianTimeSeconds).toBe(119.8);
    expect(omoi!.medianTimeSeconds).toBe(122.3);
  });

  it("該当する基準タイムが無い場合はundefinedを返す", () => {
    expect(findCourseTimeBaseline(baselines, "小倉", "turf", 2000, "良")).toBeUndefined();
  });
});

describe("lookupCourseTimeBaseline（3段階fallback検索）", () => {
  it("①完全一致すればbaselineSource=exactで返す", () => {
    const { baseline, meta } = lookupCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(baseline!.medianTimeSeconds).toBe(119.8);
    expect(meta.baselineSource).toBe("exact");
    expect(meta.sampleCount).toBe(42);
  });

  it("②馬場状態が一致しなくても競馬場×surface×距離が一致すればbaselineSource=distanceFallbackで返す", () => {
    // 馬場状態「不良」は baselines に無い。良し悪しを問わない②段階に落ちる
    const { baseline, meta } = lookupCourseTimeBaseline(baselines, "札幌", "turf", 2000, "不良");
    expect(baseline).not.toBeNull();
    expect(meta.baselineSource).toBe("distanceFallback");
    // 「良」「重」どちらか（distance一致の先頭ヒット）が返る
    expect([119.8, 122.3]).toContain(baseline!.medianTimeSeconds);
  });

  it("③競馬場×surface×距離すら一致しなければbaselineSource=defaultFallbackでbaselineはnull", () => {
    const { baseline, meta } = lookupCourseTimeBaseline(baselines, "小倉", "turf", 2000, "良");
    expect(baseline).toBeNull();
    expect(meta.baselineSource).toBe("defaultFallback");
    expect(meta.sampleCount).toBeNull();
    expect(meta.isReliable).toBe(false);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT以上ならisReliable=true（札幌turf2000良=42件）", () => {
    const { meta } = lookupCourseTimeBaseline(baselines, "札幌", "turf", 2000, "良");
    expect(meta.sampleCount).toBe(42);
    expect(meta.sampleCount).toBeGreaterThanOrEqual(MIN_RELIABLE_SAMPLE_COUNT);
    expect(meta.isReliable).toBe(true);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT未満ならisReliable=false", () => {
    const lowSampleBaselines: CourseTimeBaseline[] = [
      {
        racecourse: "小倉",
        surface: "turf",
        distance: 1800,
        going: "良",
        sampleYears: 5,
        sampleCount: MIN_RELIABLE_SAMPLE_COUNT - 1,
        medianTimeSeconds: 108.0,
        source: "test",
      },
    ];
    const { meta } = lookupCourseTimeBaseline(lowSampleBaselines, "小倉", "turf", 1800, "良");
    expect(meta.sampleCount).toBe(MIN_RELIABLE_SAMPLE_COUNT - 1);
    expect(meta.isReliable).toBe(false);
  });

  it("既存のfindCourseTimeBaseline（exact専用）の挙動は変えない", () => {
    expect(findCourseTimeBaseline(baselines, "札幌", "turf", 2000, "不良")).toBeUndefined();
  });
});

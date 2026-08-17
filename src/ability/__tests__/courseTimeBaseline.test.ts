import { describe, expect, it } from "vitest";
import { findCourseTimeBaseline } from "../courseTimeBaseline";
import type { CourseTimeBaseline } from "../types";

const baselines: CourseTimeBaseline[] = [
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 42, medianTimeSeconds: 119.8 },
  { racecourse: "札幌", surface: "turf", distance: 1800, going: "良", sampleYears: 5, sampleCount: 40, medianTimeSeconds: 107.5 },
  { racecourse: "札幌", surface: "turf", distance: 2000, going: "重", sampleYears: 5, sampleCount: 20, medianTimeSeconds: 122.3 },
  { racecourse: "函館", surface: "turf", distance: 2000, going: "良", sampleYears: 5, sampleCount: 30, medianTimeSeconds: 120.5 },
  { racecourse: "札幌", surface: "dirt", distance: 2000, going: "良", sampleYears: 5, sampleCount: 25, medianTimeSeconds: 125.0 },
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

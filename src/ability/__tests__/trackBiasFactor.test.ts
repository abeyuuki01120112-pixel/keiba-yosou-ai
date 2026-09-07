import { describe, expect, it } from "vitest";
import { computeTrackBiasFactor, TRACK_BIAS_CLAMP_MAX, TRACK_BIAS_CLAMP_MIN } from "../trackBiasFactor";
import type { FrontBackBias, RunningStyleProfile, TrackBiasObservation } from "../raceContextTypes";

function style(distribution: RunningStyleProfile["distribution"], confidence: RunningStyleProfile["confidence"] = "high"): RunningStyleProfile {
  return { distribution, sampleCount: 5, confidence, source: "final3FProxy", reason: "test" };
}

function observation(frontBackBias: FrontBackBias, confidence: RunningStyleProfile["confidence"] = "high"): TrackBiasObservation {
  return {
    frontBackBias,
    insideOutsideBias: "neutral",
    confidence,
    source: "テスト入力",
    observedAt: "2026-08-16T10:00:00Z",
    observedRaceId: "JRA-20260816-SAPPORO-5",
    observedRaceDate: "2026-08-16",
    observedRaceNumber: 5,
    dayRelation: "sameDay",
  };
}

const PURE_OIKOMI = { nige: 0, senko: 0, sashi: 0, oikomi: 100 };
const PURE_NIGE = { nige: 100, senko: 0, sashi: 0, oikomi: 0 };

describe("computeTrackBiasFactor", () => {
  it("観測が無ければneutral(100%・confidence=low・usedSource=neutral)", () => {
    const result = computeTrackBiasFactor(style(PURE_OIKOMI), null, "neutral");
    expect(result.raw).toBe(100);
    expect(result.adjusted).toBe(100);
    expect(result.confidence).toBe("low");
    expect(result.usedSource).toBe("neutral");
  });

  it("前有利バイアス×逃げ傾向(confidence高)は有利=105（上限）", () => {
    const result = computeTrackBiasFactor(style(PURE_NIGE, "high"), observation("front", "high"), "manual");
    expect(result.raw).toBeCloseTo(105, 5);
    expect(result.adjusted).toBeCloseTo(105, 5);
  });

  it("差し有利バイアス×追込傾向(confidence高)は有利=105（上限）", () => {
    const result = computeTrackBiasFactor(style(PURE_OIKOMI, "high"), observation("closer", "high"), "manual");
    expect(result.raw).toBeCloseTo(105, 5);
  });

  it("前有利バイアス×追込傾向は不利=95（下限）", () => {
    const result = computeTrackBiasFactor(style(PURE_OIKOMI, "high"), observation("front", "high"), "manual");
    expect(result.raw).toBeCloseTo(95, 5);
  });

  it("中立バイアスならraw=100", () => {
    const result = computeTrackBiasFactor(style(PURE_OIKOMI, "high"), observation("neutral", "high"), "manual");
    expect(result.raw).toBeCloseTo(100, 5);
  });

  it("観測のconfidenceが低ければDesign-2で100側へ縮小される", () => {
    const result = computeTrackBiasFactor(style(PURE_NIGE, "high"), observation("front", "low"), "manual");
    expect(result.raw).toBeCloseTo(105, 5);
    expect(result.adjusted).toBeCloseTo(101.5, 5); // 100 + (105-100)*0.3
  });

  it("raw/adjustedとも95〜105の範囲を超えない", () => {
    for (const bias of ["front", "neutral", "closer"] as const) {
      for (const dist of [PURE_OIKOMI, PURE_NIGE]) {
        const result = computeTrackBiasFactor(style(dist, "high"), observation(bias, "high"), "manual");
        expect(result.raw).toBeGreaterThanOrEqual(TRACK_BIAS_CLAMP_MIN);
        expect(result.raw).toBeLessThanOrEqual(TRACK_BIAS_CLAMP_MAX);
      }
    }
  });
});

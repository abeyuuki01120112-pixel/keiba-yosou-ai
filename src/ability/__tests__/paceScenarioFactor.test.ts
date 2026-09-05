import { describe, expect, it } from "vitest";
import {
  computePaceScenarioFactor,
  PACE_SCENARIO_CLAMP_MAX,
  PACE_SCENARIO_CLAMP_MIN,
} from "../paceScenarioFactor";
import type { PredictedPace, RunningStyleProfile } from "../raceContextTypes";

function style(distribution: RunningStyleProfile["distribution"], confidence: RunningStyleProfile["confidence"]): RunningStyleProfile {
  return { distribution, sampleCount: 5, confidence, source: "final3FProxy", reason: "test" };
}

function pace(level: PredictedPace["level"]): PredictedPace {
  return { level, nigeCandidateCount: 0, senkoCandidateCount: 0, fieldSize: 5, reason: "test" };
}

const PURE_OIKOMI = { nige: 0, senko: 0, sashi: 0, oikomi: 100 };
const PURE_NIGE = { nige: 100, senko: 0, sashi: 0, oikomi: 0 };

describe("computePaceScenarioFactor", () => {
  it("ハイペース×追込傾向(confidence高)はraw=adjusted=105（上限）", () => {
    const result = computePaceScenarioFactor(style(PURE_OIKOMI, "high"), "auto", pace("high"));
    expect(result.raw).toBeCloseTo(105, 5);
    expect(result.adjusted).toBeCloseTo(105, 5);
  });

  it("ハイペース×逃げ傾向(confidence高)はraw=adjusted=95（下限）", () => {
    const result = computePaceScenarioFactor(style(PURE_NIGE, "high"), "auto", pace("high"));
    expect(result.raw).toBeCloseTo(95, 5);
    expect(result.adjusted).toBeCloseTo(95, 5);
  });

  it("スローペース×追込傾向は不利（raw=95）、スロー×逃げ傾向は有利（raw=105）", () => {
    expect(computePaceScenarioFactor(style(PURE_OIKOMI, "high"), "auto", pace("slow")).raw).toBeCloseTo(95, 5);
    expect(computePaceScenarioFactor(style(PURE_NIGE, "high"), "auto", pace("slow")).raw).toBeCloseTo(105, 5);
  });

  it("平均ペース想定なら脚質に関わらずraw=100（中立）", () => {
    expect(computePaceScenarioFactor(style(PURE_OIKOMI, "high"), "auto", pace("average")).raw).toBeCloseTo(100, 5);
    expect(computePaceScenarioFactor(style(PURE_NIGE, "high"), "auto", pace("average")).raw).toBeCloseTo(100, 5);
  });

  it("confidence=lowならDesign-2でadjustedが100側へ縮小される（weight=0.3）", () => {
    const result = computePaceScenarioFactor(style(PURE_OIKOMI, "low"), "auto", pace("high"));
    expect(result.raw).toBeCloseTo(105, 5);
    // 100 + (105-100)*0.3 = 101.5
    expect(result.adjusted).toBeCloseTo(101.5, 5);
  });

  it("raw/adjustedとも95〜105の範囲を超えない", () => {
    for (const level of ["slow", "average", "high"] as const) {
      for (const dist of [PURE_OIKOMI, PURE_NIGE]) {
        for (const confidence of ["high", "medium", "low"] as const) {
          const result = computePaceScenarioFactor(style(dist, confidence), "auto", pace(level));
          expect(result.raw).toBeGreaterThanOrEqual(PACE_SCENARIO_CLAMP_MIN);
          expect(result.raw).toBeLessThanOrEqual(PACE_SCENARIO_CLAMP_MAX);
          expect(result.adjusted).toBeGreaterThanOrEqual(PACE_SCENARIO_CLAMP_MIN);
          expect(result.adjusted).toBeLessThanOrEqual(PACE_SCENARIO_CLAMP_MAX);
        }
      }
    }
  });

  it("usedRunningStyleSource/predictedPaceが結果に反映される", () => {
    const result = computePaceScenarioFactor(style(PURE_OIKOMI, "high"), "manual", pace("high"));
    expect(result.usedRunningStyleSource).toBe("manual");
    expect(result.predictedPace).toBe("high");
  });
});

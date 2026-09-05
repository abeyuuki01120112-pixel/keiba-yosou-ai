import { describe, expect, it } from "vitest";
import { computeRaceContextFactor, RACE_CONTEXT_CLAMP_MAX, RACE_CONTEXT_CLAMP_MIN } from "../raceContextFactor";
import type { PaceScenarioFactor, PredictedPace, TrackBiasFactor } from "../raceContextTypes";

function pace(adjusted: number): PaceScenarioFactor {
  return { raw: adjusted, adjusted, confidence: "high", usedRunningStyleSource: "auto", predictedPace: "average", reason: "test" };
}
function trackBias(adjusted: number, usedSource: TrackBiasFactor["usedSource"] = "manual"): TrackBiasFactor {
  return { raw: adjusted, adjusted, confidence: "high", usedSource, reason: "test" };
}
function predictedPace(fieldSize: number): PredictedPace {
  return { level: "average", nigeCandidateCount: 0, senkoCandidateCount: 0, fieldSize, reason: "test" };
}

describe("computeRaceContextFactor", () => {
  it("pace=100・trackBias=100ならraceContextFactor=100", () => {
    const result = computeRaceContextFactor(pace(100), trackBias(100), predictedPace(1));
    expect(result.raw).toBe(100);
    expect(result.value).toBe(100);
  });

  it("両方とも上限105%の場合、raw=110.25%(小数第1位に丸めて110.3%)となり110%へclampされる", () => {
    const result = computeRaceContextFactor(pace(105), trackBias(105), predictedPace(1));
    expect(result.raw).toBeCloseTo(110.3, 5);
    expect(result.value).toBe(RACE_CONTEXT_CLAMP_MAX);
  });

  it("両方とも下限95%の場合でもraw=90.25%(丸めて90.3%)となり90%は下回らない（clampは実質発動しない）", () => {
    const result = computeRaceContextFactor(pace(95), trackBias(95), predictedPace(1));
    expect(result.raw).toBeCloseTo(90.3, 5);
    expect(result.value).toBeCloseTo(90.3, 5);
    expect(result.value).toBeGreaterThanOrEqual(RACE_CONTEXT_CLAMP_MIN);
  });

  it("value は常に90〜110の範囲に収まる", () => {
    for (const p of [95, 97.5, 100, 102.5, 105]) {
      for (const t of [95, 97.5, 100, 102.5, 105]) {
        const result = computeRaceContextFactor(pace(p), trackBias(t), predictedPace(1));
        expect(result.value).toBeGreaterThanOrEqual(RACE_CONTEXT_CLAMP_MIN);
        expect(result.value).toBeLessThanOrEqual(RACE_CONTEXT_CLAMP_MAX);
      }
    }
  });

  it("結果にpaceScenarioFactor/trackBiasFactorそのものも保持される", () => {
    const p = pace(102);
    const t = trackBias(98);
    const result = computeRaceContextFactor(p, t, predictedPace(1));
    expect(result.paceScenarioFactor).toBe(p);
    expect(result.trackBiasFactor).toBe(t);
  });

  describe("evaluated（CHECKPOINT11.17: 未評価ガード）", () => {
    it("fieldSize>0ならtrackBiasが中立でもevaluated=true・valueはraw通り適用される", () => {
      const result = computeRaceContextFactor(pace(105), trackBias(100, "neutral"), predictedPace(1));
      expect(result.evaluated).toBe(true);
      expect(result.value).toBeCloseTo(105, 5);
    });

    it("trackBiasが実観測(manual/auto)ならfieldSize=0でもevaluated=true・valueはraw通り適用される", () => {
      const result = computeRaceContextFactor(pace(105), trackBias(100, "manual"), predictedPace(0));
      expect(result.evaluated).toBe(true);
      expect(result.value).toBeCloseTo(105, 5);
    });

    it("fieldSize=0かつtrackBiasが中立(実観測なし)ならevaluated=false・valueは中立100に上書きされる（rawは実計算値のまま保持）", () => {
      const result = computeRaceContextFactor(pace(105), trackBias(105, "neutral"), predictedPace(0));
      expect(result.evaluated).toBe(false);
      expect(result.value).toBe(100);
      expect(result.raw).toBeCloseTo(110.3, 5);
    });
  });
});

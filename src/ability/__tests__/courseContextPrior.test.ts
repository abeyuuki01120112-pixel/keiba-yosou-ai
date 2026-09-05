import { describe, expect, it } from "vitest";
import {
  calculateRelativeGatePosition,
  combineConfidence,
  computeTokyoDirt1600CourseContextPrior,
  evaluateTokyoDirt1600GateContext,
  resolveTokyoDirt1600StyleReasonCode,
} from "../courseContextPrior";
import type { RunningStyleProfile } from "../raceContextTypes";

function makeRunningStyleProfile(dominantStyle: RunningStyleProfile["dominantStyle"]): RunningStyleProfile {
  return {
    distribution: { nige: 0, senko: 100, sashi: 0, oikomi: 0 },
    sampleCount: 3,
    confidence: "low",
    source: "final3FProxy",
    reason: "test fixture",
    dominantStyle,
  };
}

describe("calculateRelativeGatePosition", () => {
  it("horseNumber/fieldSizeが両方揃っていれば計算できる", () => {
    expect(calculateRelativeGatePosition(1, 16)).toBeCloseTo(0, 5);
    expect(calculateRelativeGatePosition(16, 16)).toBeCloseTo(1, 5);
    expect(calculateRelativeGatePosition(8, 15)).toBeCloseTo(0.5, 5);
  });

  it("horseNumberが無ければ推測せずnull", () => {
    expect(calculateRelativeGatePosition(null, 16)).toBeNull();
  });

  it("fieldSizeが無ければ推測せずnull", () => {
    expect(calculateRelativeGatePosition(5, null)).toBeNull();
  });

  it("fieldSize<=1やhorseNumberが範囲外なら安全にnull", () => {
    expect(calculateRelativeGatePosition(1, 1)).toBeNull();
    expect(calculateRelativeGatePosition(20, 16)).toBeNull();
    expect(calculateRelativeGatePosition(0, 16)).toBeNull();
  });
});

describe("computeTokyoDirt1600CourseContextPrior", () => {
  it("empiricalValidationStatus=weakOrUnstable（CHECKPOINT10.3・30レース実測検証を踏まえた設定）", () => {
    const prior = computeTokyoDirt1600CourseContextPrior(8);
    expect(prior!.empiricalValidationStatus).toBe("weakOrUnstable");
    expect(prior!.reasonCodes).toContain("EMPIRICAL_30RACE_INCONCLUSIVE");
    // gateBiasLevel（出典の記述としての確信度）自体は変更していない
    expect(prior!.gateBiasLevel).toBe("high");
  });

  it("frame=8（最も外枠有利）でgateCoefficient=1.0", () => {
    const prior = computeTokyoDirt1600CourseContextPrior(8);
    expect(prior).not.toBeNull();
    expect(prior!.gateCoefficient).toBeCloseTo(1.0, 5);
    expect(prior!.gateBiasLevel).toBe("high");
    expect(prior!.sourceConfidence).toBe("high");
  });

  it("frame=1（最も内枠不利側）で負のgateCoefficient", () => {
    const prior = computeTokyoDirt1600CourseContextPrior(1);
    expect(prior).not.toBeNull();
    expect(prior!.gateCoefficient).toBeCloseTo(-0.409, 3);
  });

  it("frameがnullなら算出不能でnull", () => {
    expect(computeTokyoDirt1600CourseContextPrior(null)).toBeNull();
  });

  it("frameが1〜8の範囲外なら算出不能でnull", () => {
    expect(computeTokyoDirt1600CourseContextPrior(9)).toBeNull();
    expect(computeTokyoDirt1600CourseContextPrior(0)).toBeNull();
  });

  it("gateCoefficientは常に-1〜+1の範囲に収まる（unitless、percent換算されていない）", () => {
    for (let frame = 1; frame <= 8; frame++) {
      const prior = computeTokyoDirt1600CourseContextPrior(frame)!;
      expect(prior.gateCoefficient).toBeGreaterThanOrEqual(-1);
      expect(prior.gateCoefficient).toBeLessThanOrEqual(1);
    }
  });
});

describe("resolveTokyoDirt1600StyleReasonCode", () => {
  it("先行はfavoredに一致してSTYLE_FAVORED", () => {
    expect(resolveTokyoDirt1600StyleReasonCode("senko")).toBe("STYLE_FAVORED");
  });

  it("差しは「上級条件の差し」に部分一致してSTYLE_FAVORED", () => {
    expect(resolveTokyoDirt1600StyleReasonCode("sashi")).toBe("STYLE_FAVORED");
  });

  it("逃げ・追込はfavored/disfavoredどちらにも該当せずSTYLE_NEUTRAL", () => {
    expect(resolveTokyoDirt1600StyleReasonCode("nige")).toBe("STYLE_NEUTRAL");
    expect(resolveTokyoDirt1600StyleReasonCode("oikomi")).toBe("STYLE_NEUTRAL");
  });
});

describe("combineConfidence", () => {
  it("低い方のconfidenceを採用する", () => {
    expect(combineConfidence("high", "low")).toBe("low");
    expect(combineConfidence("low", "high")).toBe("low");
    expect(combineConfidence("medium", "high")).toBe("medium");
    expect(combineConfidence("high", "high")).toBe("high");
  });
});

describe("evaluateTokyoDirt1600GateContext（STEP7比較ケース相当）", () => {
  it("枠情報が無ければgateCoefficient算出不能・confidence=lowになる（0点扱いにはしない）", () => {
    const result = evaluateTokyoDirt1600GateContext({
      gate: { horseNumber: null, fieldSize: null, frame: null },
      runningStyle: makeRunningStyleProfile("senko"),
      horseEvidenceConfidence: "low",
    });
    expect(result.relativeGatePosition).toBeNull();
    expect(result.courseContextPrior).toBeNull();
    expect(result.rawCoursePrior).toBeNull();
    expect(result.overallConfidence).toBe("low");
    expect(result.reasonCodes).toContain("GATE_INFO_UNAVAILABLE");
  });

  it("8枠・先行はgateCoefficientが正、styleもFAVORED", () => {
    const result = evaluateTokyoDirt1600GateContext({
      gate: { horseNumber: 15, fieldSize: 16, frame: 8 },
      runningStyle: makeRunningStyleProfile("senko"),
      horseEvidenceConfidence: "low",
    });
    expect(result.rawCoursePrior).toBeGreaterThan(0);
    expect(result.styleReasonCode).toBe("STYLE_FAVORED");
    // horse evidence confidence(low) と courseKarte confidence(high) の低い方 = low
    expect(result.overallConfidence).toBe("low");
  });

  it("1枠・差しはgateCoefficientが負、styleはFAVORED（差しはfavoredに含まれるため）", () => {
    const result = evaluateTokyoDirt1600GateContext({
      gate: { horseNumber: 1, fieldSize: 16, frame: 1 },
      runningStyle: makeRunningStyleProfile("sashi"),
      horseEvidenceConfidence: "low",
    });
    expect(result.rawCoursePrior).toBeLessThan(0);
    expect(result.styleReasonCode).toBe("STYLE_FAVORED");
  });
});

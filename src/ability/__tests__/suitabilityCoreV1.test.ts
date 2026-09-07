import { describe, expect, it } from "vitest";
import {
  buildNotEvaluatedComponent,
  buildNotEvaluatedSuitabilityCoreV1,
  buildTokyoDirt1600GateComponent,
} from "../suitabilityCoreV1";
import type { SuitabilityComponentKey } from "../suitabilityCoreV1Types";
import type { RunningStyleProfile } from "../raceContextTypes";

function style(dominantStyle: RunningStyleProfile["dominantStyle"]): RunningStyleProfile {
  return {
    distribution: { nige: 0, senko: 0, sashi: 0, oikomi: 0 },
    sampleCount: 0,
    confidence: "low",
    source: "final3FProxy",
    reason: "test fixture",
    dominantStyle,
  };
}

const ALL_KEYS: SuitabilityComponentKey[] = [
  "distance",
  "course",
  "surface",
  "turn",
  "going",
  "gate",
  "runningStyle",
];

describe("buildNotEvaluatedComponent", () => {
  it("scoreは常にnull、evaluated=false、confidence=unknownの安全な既定値を返す", () => {
    const component = buildNotEvaluatedComponent("distance");
    expect(component.key).toBe("distance");
    expect(component.evaluated).toBe(false);
    expect(component.score).toBeNull();
    expect(component.confidence).toBe("unknown");
    expect(component.source).toBe("none");
    expect(component.horseEvidence).toBeNull();
    expect(component.coursePrior).toBeNull();
  });
});

describe("buildNotEvaluatedSuitabilityCoreV1", () => {
  it("7要素すべてが未評価の安全な既定値を返す（推測値なし）", () => {
    const core = buildNotEvaluatedSuitabilityCoreV1();
    for (const key of ALL_KEYS) {
      expect(core[key].key).toBe(key);
      expect(core[key].evaluated).toBe(false);
      expect(core[key].score).toBeNull();
    }
  });
});

describe("buildTokyoDirt1600GateComponent", () => {
  it("枠情報が揃っていればevaluated=true・coursePriorが埋まるが、scoreは常にnullのまま", () => {
    const component = buildTokyoDirt1600GateComponent({
      gate: { horseNumber: 16, fieldSize: 16, frame: 8 },
      runningStyle: style("senko"),
    });
    expect(component.key).toBe("gate");
    expect(component.evaluated).toBe(true);
    expect(component.score).toBeNull(); // percent変換はまだ行わない
    expect(component.source).toBe("coursePrior");
    expect(component.coursePrior).not.toBeNull();
    expect(component.coursePrior!.referenceSource).toContain("courseContextPrior.ts");
    // 本人実績を集計する仕組みが無いため、常にhorseEvidence=null
    expect(component.horseEvidence).toBeNull();
  });

  it("枠情報が無ければevaluated=false・推測しない", () => {
    const component = buildTokyoDirt1600GateComponent({
      gate: { horseNumber: null, fieldSize: null, frame: null },
      runningStyle: style("senko"),
    });
    expect(component.evaluated).toBe(false);
    expect(component.score).toBeNull();
    expect(component.coursePrior).toBeNull();
    expect(component.source).toBe("none");
  });
});

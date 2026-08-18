import { describe, expect, it } from "vitest";
import { resolveTrackBias } from "../trackBias";
import type { RaceContextTargetInfo, TrackBiasObservation } from "../raceContextTypes";

const TARGET: RaceContextTargetInfo = { raceId: "JRA-20260816-SAPPORO-11", raceDate: "2026-08-16", raceNumber: 11 };

function makeObservation(overrides: Partial<TrackBiasObservation> = {}): TrackBiasObservation {
  return {
    frontBackBias: "front",
    insideOutsideBias: "neutral",
    confidence: "medium",
    source: "テスト入力",
    observedAt: "2026-08-16T10:00:00Z",
    observedRaceId: "JRA-20260816-SAPPORO-5",
    observedRaceDate: "2026-08-16",
    observedRaceNumber: 5,
    dayRelation: "sameDay",
    ...overrides,
  };
}

describe("resolveTrackBias", () => {
  it("manualが有効ならmanualを優先する", () => {
    const manual = makeObservation({ frontBackBias: "front" });
    const auto = makeObservation({ frontBackBias: "closer" });
    const result = resolveTrackBias(manual, auto, TARGET);
    expect(result.usedSource).toBe("manual");
    expect(result.actuallyUsed).toBe(manual);
  });

  it("manualが無くautoが有効ならautoを使う", () => {
    const auto = makeObservation({ frontBackBias: "closer" });
    const result = resolveTrackBias(null, auto, TARGET);
    expect(result.usedSource).toBe("auto");
    expect(result.actuallyUsed).toBe(auto);
  });

  it("manual/autoともに無ければneutral", () => {
    const result = resolveTrackBias(null, null, TARGET);
    expect(result.usedSource).toBe("neutral");
    expect(result.actuallyUsed).toBeNull();
  });

  it("manualがfuture leakage（自己参照）で無効な場合、autoがあればautoにフォールバックする", () => {
    const manual = makeObservation({ observedRaceId: TARGET.raceId, observedRaceDate: TARGET.raceDate, observedRaceNumber: 11 });
    const auto = makeObservation({ frontBackBias: "closer" });
    const result = resolveTrackBias(manual, auto, TARGET);
    expect(result.usedSource).toBe("auto");
    expect(result.actuallyUsed).toBe(auto);
  });

  it("manualがfuture leakageで無効かつautoも無ければneutralになる", () => {
    const manual = makeObservation({ observedRaceDate: "2026-08-17" });
    const result = resolveTrackBias(manual, null, TARGET);
    expect(result.usedSource).toBe("neutral");
    expect(result.actuallyUsed).toBeNull();
  });
});

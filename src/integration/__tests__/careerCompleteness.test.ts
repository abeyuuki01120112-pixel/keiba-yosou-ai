import { describe, expect, it } from "vitest";
import { resolveCareerCompleteness } from "../careerCompleteness";
import type { PriorHistoryEntry } from "../../collector/types";

const CUTOFF = "2026-09-13T15:44:59+09:00";

function jvLinkHistory(overrides: Partial<PriorHistoryEntry> = {}): PriorHistoryEntry {
  return {
    horseId: "2023000001",
    status: "available",
    races: [],
    selectedRaceKeys: ["k1", "k2", "k3"],
    provenance: {
      source: "JRA-VAN/JV-Link",
      sourceIdentifier: "SE_HISTORY.jvd",
      targetRaceId: "JRA-20260913-HANSHIN-11",
      retrievedAt: "2026-09-11T12:56:16+09:00",
      targetAsOf: CUTOFF,
      method: "jv_link",
      collectorVersion: "test",
    },
    careerStartCountAsOf: 3,
    ...overrides,
  };
}

describe("Career Completeness Contract V1", () => {
  it("通算3走・取得3走 → COMPLETE（エンネ相当）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory());
    expect(contract).toMatchObject({
      careerStartCount: 3,
      availableHistoryCount: 3,
      selectedHistoryCount: 3,
      allPriorStartsCaptured: true,
      careerCompletenessStatus: "COMPLETE",
      source: "JRA_VAN",
    });
    expect(contract.sourceProvenance).toContain("JVOpen");
  });

  it("通算4走・取得4走 → COMPLETE（リッツパーティー相当）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      selectedRaceKeys: ["k1", "k2", "k3", "k4"],
      careerStartCountAsOf: 4,
    }));
    expect(contract.careerCompletenessStatus).toBe("COMPLETE");
    expect(contract.allPriorStartsCaptured).toBe(true);
  });

  it("通算5走・取得5走 → COMPLETE", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      selectedRaceKeys: ["k1", "k2", "k3", "k4", "k5"],
      careerStartCountAsOf: 5,
    }));
    expect(contract.careerCompletenessStatus).toBe("COMPLETE");
  });

  it("通算2走・取得2走 → COMPLETE（ミリタリータトゥー相当。Evidence Sufficiencyは別問題）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      selectedRaceKeys: ["k1", "k2"],
      careerStartCountAsOf: 2,
    }));
    expect(contract.careerCompletenessStatus).toBe("COMPLETE");
    expect(contract.allPriorStartsCaptured).toBe(true);
  });

  it("通算5走・取得3走 → INCOMPLETE（取得漏れ）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      selectedRaceKeys: ["k1", "k2", "k3"],
      careerStartCountAsOf: 5,
    }));
    expect(contract).toMatchObject({
      careerStartCount: 5,
      availableHistoryCount: 3,
      allPriorStartsCaptured: false,
      careerCompletenessStatus: "INCOMPLETE",
    });
  });

  it("careerStartCountAsOfが無ければ → UNKNOWN（推測しない）", () => {
    const { careerStartCountAsOf: _omit, ...rest } = jvLinkHistory();
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, rest as PriorHistoryEntry);
    expect(contract.careerCompletenessStatus).toBe("UNKNOWN");
    expect(contract.careerStartCount).toBeNull();
    expect(contract.source).toBe("UNKNOWN");
  });

  it("historyが存在しない（undefined） → UNKNOWN", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, undefined);
    expect(contract.careerCompletenessStatus).toBe("UNKNOWN");
  });

  it("status!==available → UNKNOWN", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({ status: "missing" }));
    expect(contract.careerCompletenessStatus).toBe("UNKNOWN");
  });

  it("JV-Link以外のsource（production_history_reference等）→ UNKNOWN（出典付き証明ができない）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      provenance: {
        source: "production_data_horses",
        sourceIdentifier: "2023000001",
        targetRaceId: "JRA-20260913-HANSHIN-11",
        retrievedAt: "2026-09-11T12:56:16+09:00",
        targetAsOf: CUTOFF,
        method: "production_history_reference",
        collectorVersion: "test",
      },
    }));
    expect(contract.careerCompletenessStatus).toBe("UNKNOWN");
  });

  it("provenance.targetAsOfとasOfCutoffが不一致（future/stale contamination疑い）→ UNKNOWN", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory({
      provenance: {
        source: "JRA-VAN/JV-Link",
        sourceIdentifier: "SE_HISTORY.jvd",
        targetRaceId: "JRA-20260913-HANSHIN-11",
        retrievedAt: "2026-09-11T12:56:16+09:00",
        targetAsOf: "2026-09-20T15:44:59+09:00",
        method: "jv_link",
        collectorVersion: "test",
      },
    }));
    expect(contract.careerCompletenessStatus).toBe("UNKNOWN");
  });

  it("asOfCutoffは常にcontractへそのまま反映される（future leakage監査用）", () => {
    const contract = resolveCareerCompleteness("2023000001", CUTOFF, jvLinkHistory());
    expect(contract.asOfCutoff).toBe(CUTOFF);
    expect(contract.canonicalHorseId).toBe("2023000001");
  });
});

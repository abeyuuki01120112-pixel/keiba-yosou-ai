import { describe, expect, it } from "vitest";
import { isRaceReviewEligible, isTrackBiasEligible } from "../raceContextLeakageGuard";
import type { ManualRaceReviewNote, RaceContextTargetInfo, TrackBiasObservation } from "../raceContextTypes";

const TARGET: RaceContextTargetInfo = { raceId: "JRA-20260816-SAPPORO-11", raceDate: "2026-08-16", raceNumber: 11 };

function makeTrackBias(overrides: Partial<TrackBiasObservation> = {}): TrackBiasObservation {
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

describe("isTrackBiasEligible", () => {
  it("対象レース自身からの観測は禁止（自己参照禁止）", () => {
    const obs = makeTrackBias({ observedRaceId: TARGET.raceId, observedRaceDate: TARGET.raceDate, observedRaceNumber: 11 });
    expect(isTrackBiasEligible(obs, TARGET)).toBe(false);
  });

  it("対象レースより後の日付からの観測は禁止", () => {
    const obs = makeTrackBias({ observedRaceDate: "2026-08-17" });
    expect(isTrackBiasEligible(obs, TARGET)).toBe(false);
  });

  it("同日・対象レースより前のレース番号は許可（例: 11Rに対する1R〜10R）", () => {
    const obs = makeTrackBias({ observedRaceNumber: 1 });
    expect(isTrackBiasEligible(obs, TARGET)).toBe(true);
  });

  it("同日・対象レースと同じ/後のレース番号は禁止", () => {
    expect(isTrackBiasEligible(makeTrackBias({ observedRaceNumber: 11 }), TARGET)).toBe(false);
    expect(isTrackBiasEligible(makeTrackBias({ observedRaceNumber: 12 }), TARGET)).toBe(false);
  });

  it("同日でレース番号が不明（null）な観測は禁止", () => {
    expect(isTrackBiasEligible(makeTrackBias({ observedRaceNumber: null }), TARGET)).toBe(false);
  });

  it("前日以前の観測は許可", () => {
    const obs = makeTrackBias({ observedRaceDate: "2026-08-15", dayRelation: "previousDay", observedRaceNumber: null });
    expect(isTrackBiasEligible(obs, TARGET)).toBe(true);
  });
});

describe("isRaceReviewEligible", () => {
  const note: ManualRaceReviewNote = {
    raceId: "JRA-20260614-HANSHIN-11",
    raceDate: "2026-06-14",
    horseId: "shakeyourheart",
    note: "前走で不利を受けた",
    source: "テスト入力",
    observedAt: "2026-06-15T00:00:00Z",
  };

  it("対象馬自身の過去レースの回顧は使用可能", () => {
    expect(isRaceReviewEligible(note, TARGET)).toBe(true);
  });

  it("対象レース自身の回顧は事前予想に使用禁止", () => {
    expect(isRaceReviewEligible({ ...note, raceId: TARGET.raceId, raceDate: TARGET.raceDate }, TARGET)).toBe(false);
  });

  it("対象レースより後の日付の回顧は禁止", () => {
    expect(isRaceReviewEligible({ ...note, raceDate: "2026-08-17" }, TARGET)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildRaceResultArtifact } from "../raceResultArtifact";
import { buildActualBettingRecord } from "../actualBettingRecord";
import { submitBetSettlement } from "../officialPayoutInput";
import type { OfficialPayoutEntry } from "../betSettlement";

function baseResult() {
  return buildRaceResultArtifact({
    resultStatus: "FINAL", resultVersion: 1,
    resultAvailableAt: "2026-09-13T16:00:00+09:00", retrievedAt: "2026-09-13T16:30:00+09:00",
    source: "JRA_OFFICIAL_RESULT", sourceIdentifier: "official-001",
    race: {
      raceId: "JRA-TEST-RACE-01", raceDate: "2026-09-13", raceName: "テストレース",
      scheduledStartTime: "2026-09-13T15:00:00+09:00", officialStarterCount: 2, resultEntryCount: 2,
    },
    runners: [
      { canonicalHorseId: "h6", horseName: "テスト馬6", horseNumber: 6, frameNumber: 3,
        resultStatus: "FINAL", finishPosition: 1, started: true, scratched: false, excluded: false,
        didNotFinish: false, disqualified: false },
      { canonicalHorseId: "h9", horseName: "テスト馬9", horseNumber: 9, frameNumber: 5,
        resultStatus: "FINAL", finishPosition: 2, started: true, scratched: false, excluded: false,
        didNotFinish: false, disqualified: false },
    ],
  });
}

function baseRecord() {
  return buildActualBettingRecord({
    raceId: "JRA-TEST-RACE-01", predictionArtifactId: null, betProposalArtifactId: null,
    strategyVersion: "KOHEI_V1", purchasedAt: null, recordedAt: "2026-09-13T20:00:00+09:00",
    bets: [{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }],
    totalStake: 100, sourceType: "USER_CONFIRMED", sourceProvenance: "test",
  });
}

describe("Official Payout Input（Post-Race Pipeline V1・Phase 3）", () => {
  it("M. 正式source（JRA_OFFICIAL_RESULT）の払戻は受理される", () => {
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "JRA_OFFICIAL_RESULT", sourceIdentifier: "official-payout-001",
        retrievedAt: "2026-09-13T16:31:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    const outcome = submitBetSettlement({
      actualBettingRecord: baseRecord(), result: baseResult(), payouts, settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(outcome.status).toBe("accepted");
  });

  it("正式source（JV_LINK）の払戻も受理される", () => {
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "JV_LINK", sourceIdentifier: "jvlink-payout-001",
        retrievedAt: "2026-09-13T16:31:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    const outcome = submitBetSettlement({
      actualBettingRecord: baseRecord(), result: baseResult(), payouts, settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(outcome.status).toBe("accepted");
  });

  it("M. 正式source情報が無い払戻（人間/ChatGPT作成）は拒否する", () => {
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "chatgpt-manual-guess", sourceIdentifier: "manual-1",
        retrievedAt: "2026-09-13T16:31:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    const outcome = submitBetSettlement({
      actualBettingRecord: baseRecord(), result: baseResult(), payouts, settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) => r.code === "UNAPPROVED_PAYOUT_SOURCE")).toBe(true);
    }
  });

  it("構造検証エラー（対応payout無し）はSTRUCTURAL_VALIDATION_FAILEDとして返す", () => {
    const outcome = submitBetSettlement({
      actualBettingRecord: baseRecord(), result: baseResult(), payouts: [], settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) => r.code === "STRUCTURAL_VALIDATION_FAILED")).toBe(true);
    }
  });
});

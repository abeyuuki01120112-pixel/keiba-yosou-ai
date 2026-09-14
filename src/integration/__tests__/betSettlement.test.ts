import { describe, expect, it } from "vitest";
import { buildRaceResultArtifact, type RaceResultArtifactRunner } from "../raceResultArtifact";
import { buildActualBettingRecord } from "../actualBettingRecord";
import {
  buildBetSettlement,
  type OfficialPayoutEntry,
} from "../betSettlement";
import type { BetEntry } from "../betTypes";

function resultRunner(overrides: Partial<RaceResultArtifactRunner> = {}): RaceResultArtifactRunner {
  return {
    canonicalHorseId: "h1", horseName: "テスト馬", horseNumber: 1, frameNumber: 1,
    resultStatus: "FINAL", finishPosition: null, started: true, scratched: false,
    excluded: false, didNotFinish: false, disqualified: false,
    ...overrides,
  };
}

function buildResult(runners: RaceResultArtifactRunner[], overrides: { resultStatus?: "FINAL" | "PROVISIONAL" | "CORRECTED"; supersedesArtifactId?: string; resultVersion?: number } = {}) {
  const resultStatus = overrides.resultStatus ?? "FINAL";
  return buildRaceResultArtifact({
    resultStatus,
    resultVersion: overrides.resultVersion ?? 1,
    resultAvailableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: "2026-09-13T16:30:00+09:00",
    source: "settlement-test-fixture（実在の公式結果ではない）",
    sourceIdentifier: "settlement-test-fixture-001",
    supersedesArtifactId: overrides.supersedesArtifactId ?? null,
    race: {
      raceId: "JRA-TEST-RACE-01",
      raceDate: "2026-09-13",
      raceName: "テストレース",
      scheduledStartTime: "2026-09-13T15:00:00+09:00",
      officialStarterCount: runners.length,
      resultEntryCount: runners.length,
    },
    runners: runners.map((r) => ({ ...r, resultStatus })),
  });
}

function actualRecord(bets: BetEntry[], totalStake?: number) {
  return buildActualBettingRecord({
    raceId: "JRA-TEST-RACE-01",
    predictionArtifactId: null,
    betProposalArtifactId: null,
    strategyVersion: "KOHEI_V1",
    purchasedAt: null,
    recordedAt: "2026-09-13T20:00:00+09:00",
    bets,
    totalStake: totalStake ?? bets.reduce((sum, b) => sum + b.stake, 0),
    sourceType: "USER_CONFIRMED",
    sourceProvenance: "test",
  });
}

describe("BetSettlement V1（Post-Race Pipeline V1・Phase 3）", () => {
  it("C. WIN的中を判定し、payoutPer100Yenからpayoutを計算する（I）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 1200 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0]).toMatchObject({ hit: true, payoutPer100Yen: 250, payout: 3000 });
    expect(settlement.totalPayout).toBe(3000);
  });

  it("D. WIN不的中はpayout=0・payoutPer100Yen=null", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h9", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0]).toMatchObject({ hit: false, payoutPer100Yen: null, payout: 0 });
  });

  it("E. QUINELLA的中を判定する", () => {
    const record = actualRecord([{
      betType: "QUINELLA",
      selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
      stake: 400,
    }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
        payoutPer100Yen: 1500 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0]).toMatchObject({ hit: true, payoutPer100Yen: 1500, payout: 6000 });
  });

  it("F. QUINELLAは選択順序が逆でも的中と判定する（順不同）", () => {
    const record = actualRecord([{
      betType: "QUINELLA",
      selection: [{ canonicalHorseId: "h9", role: "ANY" }, { canonicalHorseId: "h6", role: "ANY" }],
      stake: 400,
    }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
        payoutPer100Yen: 1500 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0].hit).toBe(true);
  });

  it("G. QUINELLA不的中", () => {
    const record = actualRecord([{
      betType: "QUINELLA",
      selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h8", role: "ANY" }],
      stake: 400,
    }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
      resultRunner({ canonicalHorseId: "h8", finishPosition: 3 }),
    ]);
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0].hit).toBe(false);
  });

  it("H. 的中判定はcanonicalHorseIdのみで行う（horseNameが同名でも別canonicalHorseIdなら不的中）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "different-id", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", horseName: "同じ名前", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "different-id", horseName: "同じ名前", finishPosition: 3 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.perBet[0].hit).toBe(false);
  });

  it("J. 複数betのtotalStakeはActualBettingRecordのtotalStakeをそのまま保持する", () => {
    const record = actualRecord([
      { betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 400 },
    ]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t2", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
        payoutPer100Yen: 1500 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.totalStake).toBe(1600);
  });

  it("K. totalPayoutはperBetのpayout合計", () => {
    const record = actualRecord([
      { betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 400 },
    ]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t2", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
        payoutPer100Yen: 1500 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.totalPayout).toBe(3000 + 6000);
  });

  it("L. returnRateはtotalPayout/totalStake（百分率変換はしない）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 3000 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 200 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(settlement.totalPayout).toBe(6000);
    expect(settlement.returnRate).toBe(2.0);
  });

  it("N. UNSUPPORTED_BET_TYPE（PLACE等）は明示的に拒否する", () => {
    const record = actualRecord([{ betType: "PLACE", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    expect(() => buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" }))
      .toThrow(/UNSUPPORTED_BET_TYPE/);
  });

  it("M. 対応する正式払戻情報が無い的中betは拒否する（推測で補完しない）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    expect(() => buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" }))
      .toThrow(/正式払戻情報が見つかりません/);
  });

  it("PROVISIONAL Resultに対するSettlementは拒否する", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ], { resultStatus: "PROVISIONAL" });
    expect(() => buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" }))
      .toThrow(/PROVISIONAL/);
  });

  it("scratched/excludedの馬を含むbetは的中判定できずエラーになる（推定しない）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", scratched: true, started: false, finishPosition: null }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 1 }),
    ]);
    expect(() => buildBetSettlement({ actualBettingRecord: record, result, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" }))
      .toThrow(/scratched\/excluded/);
  });

  it("raceIdが一致しないactualBettingRecord/resultは拒否する", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const mismatchedResult = { ...buildResult([resultRunner({ canonicalHorseId: "h6", finishPosition: 1 })]), race: { ...buildResult([resultRunner({ canonicalHorseId: "h6", finishPosition: 1 })]).race, raceId: "JRA-DIFFERENT" } };
    expect(() => buildBetSettlement({ actualBettingRecord: record, result: mismatchedResult, payouts: [], settledAt: "2026-09-13T21:00:00+09:00" }))
      .toThrow(/raceId/);
  });

  it("S. Actual Betting Record自体は変更されない（Settlement構築後も同一）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const snapshot = JSON.parse(JSON.stringify(record));
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(record).toEqual(snapshot);
    expect(record).not.toHaveProperty("hit");
    expect(record).not.toHaveProperty("payout");
  });

  it("T. Result Artifact自体は変更されない（Settlement構築後も同一）", () => {
    const record = actualRecord([{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }]);
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
    ]);
    const snapshot = JSON.parse(JSON.stringify(result));
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "test", sourceIdentifier: "t1", retrievedAt: "2026-09-13T16:31:00+09:00",
        betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
    ];
    buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-13T21:00:00+09:00" });
    expect(result).toEqual(snapshot);
  });
});

describe("U. セントライト記念2026 実購入Settlement fixture（テスト専用・Production保存はしない）", () => {
  it("3,000円実購入を合成Result+払戻fixtureでSettlementできる", () => {
    const bets: BetEntry[] = [
      { betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h2", role: "ANY" }, { canonicalHorseId: "h6", role: "ANY" }], stake: 500 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h8", role: "ANY" }], stake: 400 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 400 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h10", role: "ANY" }], stake: 500 },
    ];
    const record = actualRecord(bets, 3000);
    // 合成fixture: h6が1着、h9が2着（実在の公式結果ではない）。
    const result = buildResult([
      resultRunner({ canonicalHorseId: "h6", finishPosition: 1 }),
      resultRunner({ canonicalHorseId: "h9", finishPosition: 2 }),
      resultRunner({ canonicalHorseId: "h2", finishPosition: 3 }),
      resultRunner({ canonicalHorseId: "h8", finishPosition: 4 }),
      resultRunner({ canonicalHorseId: "h10", finishPosition: 5 }),
    ]);
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-01", source: "settlement-test-fixture", sourceIdentifier: "t1",
        retrievedAt: "2026-09-13T16:31:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
      { raceId: "JRA-TEST-RACE-01", source: "settlement-test-fixture", sourceIdentifier: "t2",
        retrievedAt: "2026-09-13T16:31:00+09:00", betType: "QUINELLA",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], payoutPer100Yen: 1500 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-14T00:00:00+09:00" });

    expect(settlement.totalStake).toBe(3000);
    // WIN h6: hit → 1200/100*250 = 3000。QUINELLA 6-9: hit → 400/100*1500 = 6000。他は不的中。
    expect(settlement.totalPayout).toBe(3000 + 6000);
    expect(settlement.returnRate).toBe((3000 + 6000) / 3000);
    expect(settlement.perBet.filter((b) => b.hit)).toHaveLength(2);
    expect(settlement.settlementStatus).toBe("SETTLED");
  });
});

describe("V. チャレンジカップ2026 実購入Settlement fixture（schema表現可能性のみ確認・Production保存はしない）", () => {
  it("3,000円実購入をschema上でSettlementできる", () => {
    const bets: BetEntry[] = [
      { betType: "WIN", selection: [{ canonicalHorseId: "h10", role: "ANY" }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h1", role: "ANY" }, { canonicalHorseId: "h10", role: "ANY" }], stake: 300 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h4", role: "ANY" }, { canonicalHorseId: "h10", role: "ANY" }], stake: 500 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h10", role: "ANY" }, { canonicalHorseId: "h11", role: "ANY" }], stake: 600 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h10", role: "ANY" }, { canonicalHorseId: "h15", role: "ANY" }], stake: 400 },
    ];
    const record = buildActualBettingRecord({
      raceId: "JRA-20260912-HANSHIN-11", predictionArtifactId: null, betProposalArtifactId: null,
      strategyVersion: "KOHEI_V1", purchasedAt: null, recordedAt: "2026-09-14T00:00:00+09:00",
      bets, totalStake: 3000, sourceType: "USER_CONFIRMED",
      sourceProvenance: "test-fixture（schema表現可能性の確認のみ）",
    });
    const result = buildRaceResultArtifact({
      resultStatus: "FINAL", resultVersion: 1,
      resultAvailableAt: "2026-09-12T16:00:00+09:00", retrievedAt: "2026-09-12T16:30:00+09:00",
      source: "settlement-test-fixture（実在の公式結果ではない）", sourceIdentifier: "cc-fixture-001",
      race: {
        raceId: "JRA-20260912-HANSHIN-11", raceDate: "2026-09-12", raceName: "テストレース",
        scheduledStartTime: "2026-09-12T15:45:00+09:00", officialStarterCount: 5, resultEntryCount: 5,
      },
      runners: [
        resultRunner({ canonicalHorseId: "h10", finishPosition: 1 }),
        resultRunner({ canonicalHorseId: "h11", finishPosition: 2 }),
        resultRunner({ canonicalHorseId: "h1", finishPosition: 3 }),
        resultRunner({ canonicalHorseId: "h4", finishPosition: 4 }),
        resultRunner({ canonicalHorseId: "h15", finishPosition: 5 }),
      ],
    });
    const payouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-20260912-HANSHIN-11", source: "settlement-test-fixture", sourceIdentifier: "t1",
        retrievedAt: "2026-09-12T16:31:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h10", role: "ANY" }], payoutPer100Yen: 300 },
      { raceId: "JRA-20260912-HANSHIN-11", source: "settlement-test-fixture", sourceIdentifier: "t2",
        retrievedAt: "2026-09-12T16:31:00+09:00", betType: "QUINELLA",
        selection: [{ canonicalHorseId: "h10", role: "ANY" }, { canonicalHorseId: "h11", role: "ANY" }], payoutPer100Yen: 2200 },
    ];
    const settlement = buildBetSettlement({ actualBettingRecord: record, result, payouts, settledAt: "2026-09-14T00:05:00+09:00" });
    expect(settlement.raceId).toBe("JRA-20260912-HANSHIN-11");
    expect(settlement.totalStake).toBe(3000);
    expect(settlement.perBet.filter((b) => b.hit)).toHaveLength(2);
  });
});

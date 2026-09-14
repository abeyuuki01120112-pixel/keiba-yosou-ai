import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRaceResultArtifact, type BuildRaceResultArtifactInput } from "../raceResultArtifact";
import { buildActualBettingRecord } from "../actualBettingRecord";
import { buildBetSettlement, type OfficialPayoutEntry } from "../betSettlement";
import {
  listBetSettlementsForRace,
  persistBetSettlement,
  readBetSettlement,
} from "../betSettlementStore";

function baseResultInput(overrides: Partial<BuildRaceResultArtifactInput> = {}): BuildRaceResultArtifactInput {
  return {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: "2026-09-13T16:30:00+09:00",
    source: "settlement-store-test-fixture",
    sourceIdentifier: "fixture-001",
    race: {
      raceId: "JRA-TEST-RACE-STORE", raceDate: "2026-09-13", raceName: "テストレース",
      scheduledStartTime: "2026-09-13T15:00:00+09:00", officialStarterCount: 2, resultEntryCount: 2,
    },
    runners: [
      { canonicalHorseId: "h6", horseName: "馬6", horseNumber: 6, frameNumber: 3,
        resultStatus: "FINAL", finishPosition: 1, started: true, scratched: false, excluded: false,
        didNotFinish: false, disqualified: false },
      { canonicalHorseId: "h9", horseName: "馬9", horseNumber: 9, frameNumber: 5,
        resultStatus: "FINAL", finishPosition: 2, started: true, scratched: false, excluded: false,
        didNotFinish: false, disqualified: false },
    ],
    ...overrides,
  };
}

function record() {
  return buildActualBettingRecord({
    raceId: "JRA-TEST-RACE-STORE", predictionArtifactId: null, betProposalArtifactId: null,
    strategyVersion: "KOHEI_V1", purchasedAt: null, recordedAt: "2026-09-13T20:00:00+09:00",
    bets: [{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 100 }],
    totalStake: 100, sourceType: "USER_CONFIRMED", sourceProvenance: "test",
  });
}

function payouts(): OfficialPayoutEntry[] {
  return [
    { raceId: "JRA-TEST-RACE-STORE", source: "test", sourceIdentifier: "t1",
      retrievedAt: "2026-09-13T16:31:00+09:00", betType: "WIN",
      selection: [{ canonicalHorseId: "h6", role: "ANY" }], payoutPer100Yen: 250 },
  ];
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bet-settlement-store-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("BetSettlementStore（Post-Race Pipeline V1・Phase 3）", () => {
  it("O. JSON round-tripで保存・再読込した内容が一致する", () => {
    const result = buildRaceResultArtifact(baseResultInput());
    const settlement = buildBetSettlement({
      actualBettingRecord: record(), result, payouts: payouts(), settledAt: "2026-09-13T21:00:00+09:00",
    });
    const persisted = persistBetSettlement(settlement, { dir: tempDir });
    expect(persisted.status).toBe("created");
    expect(readBetSettlement(settlement.artifactId, { dir: tempDir })).toEqual(settlement);
  });

  it("P. append-only: 同一artifactId・同一内容ならidempotentにduplicate扱いする", () => {
    const result = buildRaceResultArtifact(baseResultInput());
    const settlement = buildBetSettlement({
      actualBettingRecord: record(), result, payouts: payouts(), settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(persistBetSettlement(settlement, { dir: tempDir }).status).toBe("created");
    expect(persistBetSettlement(settlement, { dir: tempDir }).status).toBe("duplicate");
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("Q. append-only: 同一artifactId・異なる内容は拒否する（上書きしない）", () => {
    const result = buildRaceResultArtifact(baseResultInput());
    const settlement = buildBetSettlement({
      actualBettingRecord: record(), result, payouts: payouts(), settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(persistBetSettlement(settlement, { dir: tempDir }).status).toBe("created");

    // 同じ識別フィールド（raceId/actualBettingRecordArtifactId/resultArtifactId/settledAt）だが、
    // 払戻内容が異なる正当なSettlementを別途構築する（fingerprintは正しく再計算される）。
    const differentPayouts: OfficialPayoutEntry[] = [
      { ...payouts()[0], payoutPer100Yen: 999900 },
    ];
    const differentContentSameId = buildBetSettlement({
      actualBettingRecord: record(), result, payouts: differentPayouts, settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(differentContentSameId.artifactId).toBe(settlement.artifactId);
    expect(differentContentSameId.settlementContentFingerprint).not.toBe(settlement.settlementContentFingerprint);
    const persisted = persistBetSettlement(differentContentSameId, { dir: tempDir });
    expect(persisted.status).toBe("rejected");
    expect(readBetSettlement(settlement.artifactId, { dir: tempDir })?.perBet[0].payoutPer100Yen).toBe(250);
  });

  it("R. CORRECTED Resultが追加された場合、旧Settlementを書き換えず新しいSettlement Artifactが追加される", () => {
    const originalResult = buildRaceResultArtifact(baseResultInput());
    const originalSettlement = buildBetSettlement({
      actualBettingRecord: record(), result: originalResult, payouts: payouts(),
      settledAt: "2026-09-13T21:00:00+09:00",
    });
    expect(persistBetSettlement(originalSettlement, { dir: tempDir }).status).toBe("created");

    // 降着等でh6とh9が入れ替わったCORRECTED Result（旧Artifactは上書きしない、別ファイル）。
    const correctedResult = buildRaceResultArtifact(baseResultInput({
      resultStatus: "CORRECTED", resultVersion: 2, retrievedAt: "2026-09-14T09:00:00+09:00",
      supersedesArtifactId: originalResult.artifactId,
      runners: [
        { ...baseResultInput().runners[0], resultStatus: "CORRECTED", finishPosition: 2 },
        { ...baseResultInput().runners[1], resultStatus: "CORRECTED", finishPosition: 1 },
      ],
    }));
    const correctedPayouts: OfficialPayoutEntry[] = [
      { raceId: "JRA-TEST-RACE-STORE", source: "test", sourceIdentifier: "t2",
        retrievedAt: "2026-09-14T09:01:00+09:00", betType: "WIN",
        selection: [{ canonicalHorseId: "h9", role: "ANY" }], payoutPer100Yen: 400 },
    ];
    const correctedSettlement = buildBetSettlement({
      actualBettingRecord: record(), result: correctedResult, payouts: correctedPayouts,
      settledAt: "2026-09-14T10:00:00+09:00",
    });
    expect(correctedSettlement.artifactId).not.toBe(originalSettlement.artifactId);
    expect(correctedSettlement.resultArtifactId).toBe(correctedResult.artifactId);
    expect(persistBetSettlement(correctedSettlement, { dir: tempDir }).status).toBe("created");

    // 旧Settlementはそのまま残っている（削除・変更されていない）。
    const originalReloaded = readBetSettlement(originalSettlement.artifactId, { dir: tempDir });
    expect(originalReloaded?.perBet[0].hit).toBe(true);
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(2);

    const all = listBetSettlementsForRace("JRA-TEST-RACE-STORE", { dir: tempDir });
    expect(all).toHaveLength(2);

    // 新Settlementでは的中が逆転している（h6がWINのbetは、CORRECTED後は不的中）。
    expect(correctedSettlement.perBet[0].hit).toBe(false);
  });

  it("存在しないartifactIdの読み込みはnullを返す", () => {
    expect(readBetSettlement("nonexistent-id", { dir: tempDir })).toBeNull();
  });
});

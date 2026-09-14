import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildActualBettingRecord, type BuildActualBettingRecordInput } from "../actualBettingRecord";
import {
  listActualBettingRecordsForRace,
  persistActualBettingRecord,
  readActualBettingRecord,
} from "../actualBettingRecordStore";

function baseInput(overrides: Partial<BuildActualBettingRecordInput> = {}): BuildActualBettingRecordInput {
  const bets = overrides.bets ?? [
    { betType: "WIN" as const, selection: [{ canonicalHorseId: "h6", role: "ANY" as const }], stake: 1200 },
  ];
  return {
    raceId: "JRA-TEST-RACE-STORE",
    predictionArtifactId: null,
    betProposalArtifactId: null,
    strategyVersion: "KOHEI_V1",
    purchasedAt: null,
    recordedAt: "2026-09-13T11:30:00+09:00",
    bets,
    totalStake: overrides.totalStake ?? bets.reduce((sum, b) => sum + b.stake, 0),
    sourceType: "USER_CONFIRMED",
    sourceProvenance: "test",
    ...overrides,
  };
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "actual-betting-record-store-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ActualBettingRecordStore（Post-Race Pipeline V1・Phase 2）", () => {
  it("N. JSON round-tripで保存・再読込した内容が一致する", () => {
    const artifact = buildActualBettingRecord(baseInput());
    const result = persistActualBettingRecord(artifact, { dir: tempDir });
    expect(result.status).toBe("created");
    expect(readActualBettingRecord(artifact.artifactId, { dir: tempDir })).toEqual(artifact);
  });

  it("O. append-only: 同一artifactId・同一内容ならidempotentにduplicate扱いする", () => {
    const artifact = buildActualBettingRecord(baseInput());
    expect(persistActualBettingRecord(artifact, { dir: tempDir }).status).toBe("created");
    expect(persistActualBettingRecord(artifact, { dir: tempDir }).status).toBe("duplicate");
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("P. append-only: 同一artifactId・異なる内容は拒否する（上書きしない）", () => {
    const artifact = buildActualBettingRecord(baseInput());
    expect(persistActualBettingRecord(artifact, { dir: tempDir }).status).toBe("created");
    const differentContentSameId = buildActualBettingRecord(baseInput({
      bets: [{ betType: "WIN", selection: [{ canonicalHorseId: "h9", role: "ANY" }], stake: 1200 }],
    }));
    expect(differentContentSameId.artifactId).toBe(artifact.artifactId);
    const result = persistActualBettingRecord(differentContentSameId, { dir: tempDir });
    expect(result.status).toBe("rejected");
    expect(readActualBettingRecord(artifact.artifactId, { dir: tempDir })?.bets[0].selection[0].canonicalHorseId)
      .toBe("h6");
  });

  it("払戻情報を後から追記できない（append-onlyのみ、上書き経路が存在しない）", () => {
    const artifact = buildActualBettingRecord(baseInput());
    persistActualBettingRecord(artifact, { dir: tempDir });
    // 同一artifactIdへ「払戻を追記したつもり」の改変オブジェクトを保存しようとすると、
    // fingerprint不一致としてpersist前のvalidateで即座に拒否される（保存すら試みられない）。
    const withPayoutAttempt = { ...artifact, payout: 5000 } as unknown as typeof artifact;
    expect(() => persistActualBettingRecord(withPayoutAttempt, { dir: tempDir })).toThrow(/fingerprint/);
    expect(readActualBettingRecord(artifact.artifactId, { dir: tempDir })).not.toHaveProperty("payout");
  });

  it("listActualBettingRecordsForRaceは同一raceIdの全件を返す", () => {
    const a = buildActualBettingRecord(baseInput({ recordedAt: "2026-09-13T11:00:00+09:00" }));
    const b = buildActualBettingRecord(baseInput({ recordedAt: "2026-09-13T12:00:00+09:00" }));
    persistActualBettingRecord(a, { dir: tempDir });
    persistActualBettingRecord(b, { dir: tempDir });
    expect(listActualBettingRecordsForRace(baseInput().raceId, { dir: tempDir })).toHaveLength(2);
  });

  it("存在しないartifactIdの読み込みはnullを返す", () => {
    expect(readActualBettingRecord("nonexistent-id", { dir: tempDir })).toBeNull();
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importJvLinkFinalResult } from "../jvLinkFinalResultImport";

const targetRaceId = "JRA-20260913-NAKAYAMA-11";
const targetKey = "2026091306090911";
const targetProvidedAt = "20260913160000";
const retrievedAt = "2026-09-13T16:30:00+09:00";

interface Envelope {
  bytes: string;
  sourceFile: string;
  providedAt: string;
  retrievedAt: string;
}

function put(buffer: Buffer, position: number, length: number, value: string): void {
  const encoded = Buffer.from(value, "ascii");
  if (encoded.length > length) throw new Error(`fixture field too long: ${value}`);
  buffer.fill(0x20, position - 1, position - 1 + length);
  encoded.copy(buffer, position - 1);
}

function record(type: "RA" | "SE", stage: string, key: string): Buffer {
  const buffer = Buffer.alloc(type === "RA" ? 1272 : 555, 0x20);
  put(buffer, 1, 2, type);
  put(buffer, 3, 1, stage);
  put(buffer, 4, 8, "20260913");
  put(buffer, 12, 16, key);
  buffer[buffer.length - 2] = 13;
  buffer[buffer.length - 1] = 10;
  return buffer;
}

function ra(key: string): Buffer {
  const buffer = record("RA", "7", key);
  put(buffer, 20, 2, "06"); // NAKAYAMA
  put(buffer, 26, 2, "11");
  put(buffer, 33, 60, "SENTO ISHI KINEN");
  put(buffer, 698, 4, "2200");
  put(buffer, 706, 2, "17");
  put(buffer, 710, 2, "A");
  put(buffer, 884, 2, "04");
  put(buffer, 889, 1, "1"); // 良
  return buffer;
}

interface SeOptions {
  nonStartFlag?: string;
  finishPosition?: string;
  gate?: string;
}

function se(key: string, horseId: string, horseNumber: number, options: SeOptions = {}): Buffer {
  const buffer = record("SE", "7", key);
  put(buffer, 28, 1, options.gate ?? String(horseNumber));
  put(buffer, 29, 2, String(horseNumber).padStart(2, "0"));
  put(buffer, 31, 10, horseId);
  put(buffer, 41, 36, `HORSE${String(horseNumber).padStart(2, "0")}`);
  put(buffer, 289, 3, "560");
  put(buffer, 332, 1, options.nonStartFlag ?? "0");
  put(buffer, 335, 2, options.finishPosition ?? String(horseNumber).padStart(2, "0"));
  put(buffer, 339, 4, "2213");
  [352, 354, 356, 358].forEach((position) => put(buffer, position, 2, "03"));
  put(buffer, 391, 3, "345");
  put(buffer, 532, 4, horseNumber === 1 ? "+000" : `+00${horseNumber - 1}`);
  return buffer;
}

function envelope(buffer: Buffer, sourceFile: string, providedAt: string): Envelope {
  return { bytes: buffer.toString("base64"), sourceFile, providedAt, retrievedAt };
}

function writeJsonLines(filePath: string, rows: Envelope[]): void {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

const horseIds = ["2022000001", "2022000002", "2022000003", "2022000004"];

function createRunFolder(seOptionsList: SeOptions[] = horseIds.map(() => ({}))): string {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-jvlink-final-result-import-"));
  fs.mkdirSync(path.join(runDir, "raw"));
  const targetRows: Envelope[] = [envelope(ra(targetKey), "RA_TARGET.jvd", targetProvidedAt)];
  horseIds.forEach((horseId, index) => {
    targetRows.push(envelope(se(targetKey, horseId, index + 1, seOptionsList[index]), "SE_TARGET.jvd", targetProvidedAt));
  });
  const historySelections = horseIds.map((horseId, index) => ({
    horseId, horseName: `HORSE${String(index + 1).padStart(2, "0")}`,
    status: "available", availableHistoryCount: 0, selectedRaceKeys: [] as string[],
  }));
  fs.writeFileSync(path.join(runDir, "raw/manifest.json"), JSON.stringify({
    schemaVersion: "jvlink-raw-v1",
    source: "JRA-VAN/JV-Link",
    targetRaceId,
    targetRaceKey: targetKey,
    raceDate: "2026-09-13",
    targetAsOf: "2026-09-13T17:00:00+09:00",
    collectedAt: "2026-09-13T16:31:00+09:00",
    historySelections,
    targetRecordCount: targetRows.length,
    historyRecordCount: 0,
  }, null, 2));
  writeJsonLines(path.join(runDir, "raw/target-records.jsonl"), targetRows);
  writeJsonLines(path.join(runDir, "raw/history-records.jsonl"), []);
  return runDir;
}

describe("importJvLinkFinalResult（Post-Race Pipeline V1・JV-Link Final Result Adapter）", () => {
  it("L. canonicalHorseIdはSE recordのhorseIdをそのまま使う（正常系）", () => {
    const outcome = importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
    });
    expect(outcome.status).toBe("built");
    if (outcome.status !== "built") throw new Error("unreachable");
    expect(outcome.artifact.runners.map((r) => r.canonicalHorseId).sort()).toEqual([...horseIds].sort());
  });

  it("M. 自動分類不能な走者がいる場合はneeds_manual_classificationを返し、Artifactを構築しない", () => {
    const runDir = createRunFolder([{}, { nonStartFlag: "1", finishPosition: "00", gate: "0" }, {}, {}]);
    const outcome = importJvLinkFinalResult(runDir, {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
    });
    expect(outcome.status).toBe("needs_manual_classification");
    if (outcome.status !== "needs_manual_classification") throw new Error("unreachable");
    expect(outcome.unclassified).toHaveLength(1);
    expect(outcome.unclassified[0].canonicalHorseId).toBe("2022000002");

    const classified = importJvLinkFinalResult(runDir, {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
      manualAbnormalRunnerClassifications: [{ canonicalHorseId: "2022000002", scratched: true }],
    });
    expect(classified.status).toBe("built");
    if (classified.status !== "built") throw new Error("unreachable");
    const scratchedRunner = classified.artifact.runners.find((r) => r.canonicalHorseId === "2022000002")!;
    expect(scratchedRunner).toMatchObject({
      scratched: true, started: false, finishPosition: null,
      actualRaceTime: null, timeGap: null, final3F: null, final3FRank: null, passingPosition: null,
    });
    expect(classified.artifact.race).toMatchObject({
      officialStarterCount: 3,
      resultEntryCount: 4,
    });
  });

  it("手動分類でscratched等を一つもtrueにしないと拒否する", () => {
    const runDir = createRunFolder([{}, { nonStartFlag: "1", finishPosition: "00", gate: "0" }, {}, {}]);
    expect(() => importJvLinkFinalResult(runDir, {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
      manualAbnormalRunnerClassifications: [{ canonicalHorseId: "2022000002" }],
    })).toThrow("IMPORT_JVLINK_FINAL_RESULT_INVALID_CLASSIFICATION");
  });

  it("N. 対象raceIdの不整合はloadJvLinkRunFolder経由で拒否される", () => {
    expect(() => importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: "JRA-20260913-HANSHIN-11", resultStatus: "FINAL", resultVersion: 1,
    })).toThrow("JVLINK_TARGET_RACE_ID_MISMATCH");
  });

  it("O. source=JV_LINKと、run folder追跡用のsourceIdentifierを既定で持つ", () => {
    const outcome = importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
    });
    if (outcome.status !== "built") throw new Error("unreachable");
    expect(outcome.artifact.source).toBe("JV_LINK");
    expect(outcome.artifact.sourceIdentifier).toContain(targetKey);
    expect(outcome.artifact.sourceIdentifier).toContain("SE_TARGET.jvd");
    expect(outcome.artifact.sourceIdentifier).toContain("RA_TARGET.jvd");
  });

  it("P. Official Result Inputのexpected集合と一致しない場合はrejectedを返す", () => {
    const outcome = importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
      expectedCanonicalHorseIds: ["2022000001", "2022000002", "2022000003"],
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.rejections.some((r) => r.code === "RUNNER_SET_MISMATCH_WITH_EXPECTED")).toBe(true);
  });

  it("P. Official Result Inputのexpected集合と一致する場合はbuiltを返す", () => {
    const outcome = importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
      expectedCanonicalHorseIds: horseIds,
    });
    expect(outcome.status).toBe("built");
  });

  it("Q. Result Artifact v2として正しくbuildされる（schemaVersion・実測値mapping）", () => {
    const outcome = importJvLinkFinalResult(createRunFolder(), {
      expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
    });
    if (outcome.status !== "built") throw new Error("unreachable");
    expect(outcome.artifact.schemaVersion).toBe("race-result-artifact-v2");
    expect(outcome.artifact.race).toMatchObject({ raceId: targetRaceId, going: "良", scheduledStartTime: null });
    const winner = outcome.artifact.runners.find((r) => r.horseNumber === 1)!;
    expect(winner.finishPosition).toBe(1);
    expect(winner.actualRaceTime).toBeCloseTo(2 * 60 + 21.3, 5);
    expect(winner.carriedWeight).toBeCloseTo(56, 5);
  });

  it("R. append-only: persist=trueで1回目はcreated、同一run folder再投入はduplicate", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-result-v2-store-"));
    try {
      const runDir = createRunFolder();
      const first = importJvLinkFinalResult(runDir, {
        expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
        persist: true, persistDir: tempDir,
      });
      expect(first.status).toBe("persisted");
      if (first.status !== "persisted") throw new Error("unreachable");
      expect(first.persistence.status).toBe("created");

      const second = importJvLinkFinalResult(runDir, {
        expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1,
        persist: true, persistDir: tempDir,
      });
      if (second.status !== "persisted") throw new Error("unreachable");
      expect(second.persistence.status).toBe("duplicate");
      expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("S. dry-run（persist省略）はArtifactを一切保存しない", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-result-v2-dry-run-"));
    try {
      const outcome = importJvLinkFinalResult(createRunFolder(), {
        expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1, persistDir: tempDir,
      });
      expect(outcome.status).toBe("built");
      expect(fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : []).toHaveLength(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

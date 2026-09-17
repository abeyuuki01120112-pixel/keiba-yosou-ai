import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeJvTimeGap } from "../../collector/jvlink/timeGap";
import { buildRaceResultArtifactV2 } from "../raceResultArtifact";
import { buildJvLinkTimeGapEvidence, deriveAbilityTimeGaps } from "../postRaceTimeGap";
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
  raceTime?: string;
  gap?: string;
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
  put(buffer, 339, 4, options.raceTime ?? "2213");
  [352, 354, 356, 358].forEach((position) => put(buffer, position, 2, "03"));
  put(buffer, 391, 3, "345");
  put(buffer, 532, 4, options.gap ?? (horseNumber === 1 ? "+000" : `+00${horseNumber - 1}`));
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

describe("C3 official / Result / Ability time-gap boundary", () => {
  const calculatedAt = "2026-09-13T17:00:00+09:00";
  const normal: SeOptions[] = [
    { raceTime: "2140", gap: "-002" }, { raceTime: "2142", gap: "+002" },
    { raceTime: "2143", gap: "+003" }, { raceTime: "2144", gap: "+004" },
  ];
  function fixture(rows: SeOptions[] = normal) {
    const out = importJvLinkFinalResult(createRunFolder(rows), { expectedRaceId: targetRaceId, resultStatus: "FINAL", resultVersion: 1 });
    if (out.status !== "built") throw new Error("fixture not built");
    const review = { raceId: targetRaceId, resultArtifactId: out.artifact.artifactId,
      resultContentFingerprint: out.artifact.resultContentFingerprint, source: "JV_LINK",
      sourceIdentifier: "fixture-only:official-finish-and-adjudication-review",
      status: "VERIFIED_NORMAL_NO_DEAD_HEAT_OR_RELEGATION" };
    return { ...out, review };
  }
  it("Windows-reported -002/+002/+003 remain signed evidence, Result stays nonnegative, Ability projection is explicit", () => {
    const f = fixture();
    const before = JSON.stringify(f);
    expect(f.artifact.runners.map(r => r.timeGap)).toEqual([0, 0.2, 0.3, 0.4]);
    const result = deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, f.review, calculatedAt);
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") throw new Error("unreachable");
    expect(result.runners.map(r => r.abilityTimeGapSeconds)).toEqual([-0.2, 0.2, 0.3, 0.4]);
    expect(result.runners[0].racePerformanceInput).toEqual({ timeGap: -0.2 });
    expect(result.runners[0].raw).toBe("-002");
    expect(result.runners[0].referenceHorseId).toBe(horseIds[1]);
    expect(result.evidenceContentIdentity).toBe(f.timeGapEvidence.contentIdentity);
    expect(JSON.stringify(f)).toBe(before);
    expect(deriveAbilityTimeGaps(JSON.parse(JSON.stringify(f.artifact)), JSON.parse(JSON.stringify(f.timeGapEvidence)), f.review, calculatedAt)).toEqual(result);
  });
  it("non-dead-heat equal displayed times are allowed only with official finish-order evidence", () => {
    const f = fixture([{ raceTime: "2140", gap: "-000" }, { raceTime: "2140", gap: "+000" }, normal[2], normal[3]]);
    const result = deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, f.review, calculatedAt);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.runners.slice(0, 2).map(r => r.abilityTimeGapSeconds)).toEqual([0, 0]);
    expect(deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, null, calculatedAt).status).toBe("UNAVAILABLE");
  });
  it.each(["9999", "0000", "", "    ", "abcd", undefined, null, 9999])("unavailable decoder input %s never becomes seconds", raw => {
    expect(decodeJvTimeGap(raw).status).toBe("UNAVAILABLE");
  });
  it.each(["9999", "0000", "    ", "abcd"])("winner %s remains missing in Result and cannot flow to Ability", gap => {
    const f = fixture([{ ...normal[0], gap }, ...normal.slice(1)]);
    expect(f.artifact.runners[0].timeGap).toBeNull();
    expect(deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
  });
  it.each(["scratched", "excluded", "didNotFinish", "disqualified"] as const)("%s never enters normal Ability gap", flag => {
    const rows = [...normal]; rows[1] = { nonStartFlag: "1", finishPosition: "00", gap: "9999" };
    const out = importJvLinkFinalResult(createRunFolder(rows), { resultStatus: "FINAL", resultVersion: 1,
      manualAbnormalRunnerClassifications: [{ canonicalHorseId: horseIds[1], [flag]: true }] });
    if (out.status !== "built") throw new Error("fixture not built");
    const review = { ...fixture().review, resultArtifactId: out.artifact.artifactId, resultContentFingerprint: out.artifact.resultContentFingerprint };
    expect(deriveAbilityTimeGaps(out.artifact, out.timeGapEvidence, review, calculatedAt).status).toBe("UNAVAILABLE");
  });
  it.each([
    ["missing second", [{ ...normal[0] }, { ...normal[1], finishPosition: "03" }, { ...normal[2], finishPosition: "04" }, { ...normal[3], finishPosition: "05" }]],
    ["first dead heat", [{ ...normal[0], gap: "-000" }, { ...normal[1], finishPosition: "01", gap: "-000" }, normal[2], normal[3]]],
    ["second dead heat", [normal[0], normal[1], { ...normal[2], finishPosition: "02" }, normal[3]]],
    ["time inconsistency", [{ ...normal[0], gap: "-003" }, ...normal.slice(1)]],
    ["wrong winner sign", [{ ...normal[0], gap: "+002" }, ...normal.slice(1)]],
    ["missing winner time", [{ ...normal[0], raceTime: "0000" }, ...normal.slice(1)]],
  ] as [string, SeOptions[]][])("%s fails closed", (_, rows) => {
    const f = fixture(rows);
    expect(deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
  });
  it("stale Result, missing evidence, wrong race, unknown review and malformed raw reject structurally", () => {
    const f = fixture();
    for (const result of [null, { ...f.artifact, resultContentFingerprint: "stale" }, { ...f.artifact, runners: [null] }]) {
      expect(deriveAbilityTimeGaps(result, f.timeGapEvidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
    }
    for (const evidence of [null, { ...f.timeGapEvidence, raceId: "OTHER" }, { ...f.timeGapEvidence, records: [null] }]) {
      expect(deriveAbilityTimeGaps(f.artifact, evidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
    }
    expect(deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, { ...f.review, status: "UNKNOWN" }, calculatedAt).status).toBe("UNAVAILABLE");
    expect(deriveAbilityTimeGaps(f.artifact, f.timeGapEvidence, f.review, "2026-09-12T17:00:00+09:00").status).toBe("UNAVAILABLE");
  });
  it("a freshly hashed evidence envelope still rejects invalid raw and another race", () => {
    const f = fixture();
    for (const change of ["race", "horse", "gap", "abnormal", "future", "duplicate", "malformed"] as const) {
      const records = structuredClone(f.timeGapEvidence.records);
      const bytes = Buffer.from(records[0].bytes, "base64");
      if (change === "race") put(bytes, 12, 16, "2026091206090911");
      if (change === "horse") put(bytes, 31, 10, "2022999999");
      if (change === "gap") put(bytes, 532, 4, "-009");
      if (change === "abnormal") put(bytes, 332, 1, "1");
      records[0].bytes = bytes.toString("base64");
      if (change === "future") records[0].retrievedAt = "2026-10-01T17:00:00+09:00";
      if (change === "duplicate") records[0] = { ...records[1] };
      if (change === "malformed") records[0].bytes = "bad";
      const evidence = buildJvLinkTimeGapEvidence(f.artifact, records);
      expect(deriveAbilityTimeGaps(f.artifact, evidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
    }
  });
  it("a valid Result checksum cannot legitimize the wrong gap semantic", () => {
    const f = fixture();
    const altered = buildRaceResultArtifactV2({ ...f.input, runners: f.input.runners.map((r, i) => i === 0 ? { ...r, timeGap: 0.2 } : r) });
    const evidence = buildJvLinkTimeGapEvidence(altered, f.timeGapEvidence.records);
    const review = { ...f.review, resultContentFingerprint: altered.resultContentFingerprint };
    expect(deriveAbilityTimeGaps(altered, evidence, review, calculatedAt)).toMatchObject({ status: "UNAVAILABLE", issues: [{ code: "RESULT_GAP_SEMANTIC_MISMATCH" }] });
  });
  it("CORRECTED revision cannot reuse the old evidence/review; no Result mutation", () => {
    const f = fixture();
    const corrected = buildRaceResultArtifactV2({ ...f.input, runners: f.input.runners.map(r => ({ ...r, resultStatus: "CORRECTED" })), resultStatus: "CORRECTED", resultVersion: 2, supersedesArtifactId: f.artifact.artifactId });
    expect(deriveAbilityTimeGaps(corrected, f.timeGapEvidence, f.review, calculatedAt).status).toBe("UNAVAILABLE");
    const evidence = buildJvLinkTimeGapEvidence(corrected, f.timeGapEvidence.records);
    const review = { ...f.review, resultArtifactId: corrected.artifactId, resultContentFingerprint: corrected.resultContentFingerprint };
    const derived = deriveAbilityTimeGaps(corrected, evidence, review, calculatedAt);
    expect(derived.status).toBe("AVAILABLE");
    if (derived.status === "AVAILABLE") expect(derived.supersedesArtifactId).toBe(f.artifact.artifactId);
  });
});

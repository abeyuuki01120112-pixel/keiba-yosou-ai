import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateBaseAbility } from "../../../ability/baseAbility";
import type { RaceHistoryRawInput } from "../../../ability/raceHistoryPipeline";
import { connectCollectorHorseHistories, toRaceHistoryRawInput } from "../../../integration/collectorHorseHistory";
import { importJvLinkRunFolder } from "../../../integration/jvLinkRunImport";
import { selectJvLinkCanonicalRuntimeHistory } from "../../../integration/jvLinkHistoryConflict";
import { loadJvLinkRunFolder } from "../runFolderLoader";

const targetRaceId = "JRA-20260912-HANSHIN-11";
const targetKey = "2026091209040311";
const targetProvidedAt = "20260911112817";
const historyProvidedAt = "20260910181040";
const retrievedAt = "2026-09-11T12:56:16+09:00";
const stageBHorseId = "2022103995";
const stageBKey = "20260426G0000009";
const secondStageBKey = "20250330G0000008";

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
  put(buffer, 4, 8, "20260910");
  put(buffer, 12, 16, key);
  buffer[buffer.length - 2] = 13;
  buffer[buffer.length - 1] = 10;
  return buffer;
}

function ra(key: string, stage = "7", target = false): Buffer {
  const buffer = record("RA", stage, key);
  put(buffer, 33, 60, stage === "B" ? "QUEEN ELIZABETH II CUP" : target ? "CHALLENGE CUP" : "HISTORY RACE");
  if (stage !== "B") {
    put(buffer, 698, 4, "2000");
    put(buffer, 706, 2, "17");
    put(buffer, 710, 2, "A");
    put(buffer, 874, 4, target ? "1545" : "1500");
    put(buffer, 882, 2, target ? "16" : "18");
    put(buffer, 884, 2, target ? "00" : "18");
    put(buffer, 889, 1, target ? "0" : "1");
  }
  return buffer;
}

function se(key: string, horseId: string, horseNumber: number, stage = "7", target = false): Buffer {
  const buffer = record("SE", stage, key);
  put(buffer, 28, 1, stage === "B" ? "0" : String(Math.ceil(horseNumber / 2)));
  put(buffer, 29, 2, String(horseNumber).padStart(2, "0"));
  put(buffer, 31, 10, horseId);
  put(buffer, 41, 36, horseId === stageBHorseId ? "GIOVANNI" : `HORSE${String(horseNumber).padStart(2, "0")}`);
  put(buffer, 289, 3, stage === "B" ? "570" : "560");
  put(buffer, 332, 1, "0");
  put(buffer, 335, 2, target ? "00" : stage === "B" ? "05" : String((horseNumber % 9) + 1).padStart(2, "0"));
  put(buffer, 339, 4, target ? "0000" : stage === "B" ? "2011" : "1599");
  for (const position of [352, 354, 356, 358]) put(buffer, position, 2, stage === "B" || target ? "00" : "05");
  put(buffer, 391, 3, target || stage === "B" ? "000" : "345");
  put(buffer, 532, 4, target ? "0000" : stage === "B" ? "+005" : "+003");
  return buffer;
}

function envelope(buffer: Buffer, sourceFile: string, providedAt: string): Envelope {
  return { bytes: buffer.toString("base64"), sourceFile, providedAt, retrievedAt };
}

function dateKey(index: number): string {
  const date = new Date(Date.UTC(2025, 0, 1 + index));
  const datePart = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `${datePart}09010111`;
}

function writeJsonLines(filePath: string, rows: Envelope[]): void {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function createRunFolder(stageBCount = 1): string {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-jvlink-run-"));
  fs.mkdirSync(path.join(runDir, "raw"));
  const horseIds = Array.from({ length: 16 }, (_, index) =>
    index === 14 ? stageBHorseId : `2022${String(index + 1).padStart(6, "0")}`,
  );
  const targetRows: Envelope[] = [envelope(ra(targetKey, "2", true), "RA_TARGET.jvd", targetProvidedAt)];
  horseIds.forEach((horseId, index) => {
    targetRows.push(envelope(se(targetKey, horseId, index + 1, "2", true), "SE_TARGET.jvd", targetProvidedAt));
  });

  const domesticKeys = Array.from({ length: 62 }, (_, index) => dateKey(index));
  const selections: { horseId: string; horseName: string; status: string; availableHistoryCount: number; selectedRaceKeys: string[] }[] = [];
  const historySeRows: Envelope[] = [];
  let domesticIndex = 0;
  horseIds.forEach((horseId, horseIndex) => {
    const keys: string[] = [];
    for (let raceIndex = 0; raceIndex < 5; raceIndex++) {
      const isStageB = horseId === stageBHorseId && raceIndex >= 1 && raceIndex <= stageBCount;
      const key = isStageB
        ? [stageBKey, secondStageBKey][raceIndex - 1]
        : domesticKeys[domesticIndex++ % domesticKeys.length];
      keys.push(key);
      historySeRows.push(envelope(
        se(key, horseId, horseIndex + 1, isStageB ? "B" : "7"),
        isStageB ? "SE_OVERSEAS.jvd" : "SE_HISTORY.jvd",
        historyProvidedAt,
      ));
    }
    selections.push({ horseId, horseName: horseId === stageBHorseId ? "GIOVANNI" : `HORSE${horseIndex + 1}`, status: "available", availableHistoryCount: 5, selectedRaceKeys: keys });
  });
  const historyRaRows = domesticKeys.map((key) => envelope(ra(key), "RA_HISTORY.jvd", "20260910181038"));
  for (const key of [stageBKey, secondStageBKey].slice(0, stageBCount)) {
    historyRaRows.push(envelope(ra(key, "B"), "RA_OVERSEAS.jvd", "20260910181038"));
  }
  const historyRows = [...historyRaRows, ...historySeRows];

  fs.writeFileSync(path.join(runDir, "raw/manifest.json"), JSON.stringify({
    schemaVersion: "jvlink-raw-v1",
    source: "JRA-VAN/JV-Link",
    targetRaceId,
    targetRaceKey: targetKey,
    raceDate: "2026-09-12",
    targetAsOf: "2026-09-12T15:44:59+09:00",
    collectedAt: "2026-09-11T03:56:19.038Z",
    historySelections: selections,
    targetRecordCount: targetRows.length,
    historyRecordCount: historyRows.length,
  }, null, 2));
  writeJsonLines(path.join(runDir, "raw/target-records.jsonl"), targetRows);
  writeJsonLines(path.join(runDir, "raw/history-records.jsonl"), historyRows);
  return runDir;
}

function rawHistory(overrides: Partial<RaceHistoryRawInput> = {}): RaceHistoryRawInput {
  return {
    raceId: "JRA-20260222-KOKURA-11",
    raceName: "TEST",
    raceDate: "2026-02-22",
    racecourse: "小倉",
    surface: "turf",
    distance: 1800,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 106.0,
    final3F: 34.5,
    carriedWeight: 57,
    ...overrides,
  };
}

describe("JV-Link run-folder Mac import", () => {
  it("validates 1+16 target records and 63+80 matched histories", () => {
    const loaded = loadJvLinkRunFolder(createRunFolder(), targetRaceId);
    expect(loaded.targetRecords.filter((row) => row.type === "RA")).toHaveLength(1);
    expect(loaded.targetEntries).toHaveLength(16);
    expect(loaded.historyRaByKey.size).toBe(63);
    expect(loaded.historyEntries).toHaveLength(80);
    expect(loaded.historyEntries.every((row) => loaded.historyRaByKey.has(row.key))).toBe(true);
    expect(loaded.historyRecords.filter((row) => row.date >= loaded.manifest.raceDate)).toHaveLength(0);
  });

  it("keeps Selected-5, excludes one unscorable Stage B only from scoring, and produces 16 Abilities", () => {
    const result = importJvLinkRunFolder(createRunFolder(), { expectedRaceId: targetRaceId, skipCache: true });
    expect(result.validation.ok).toBe(true);
    expect(result.leakage).toMatchObject({ ok: true, checkedRowCount: 80, violations: [] });
    expect(result.normalized.runners).toHaveLength(16);
    expect(result.normalized.runners.every((runner) => runner.finishPosition === null && runner.actualRaceTimeSeconds === null)).toBe(true);
    expect(result.normalized.provenance?.every((row) => row.method === "jv_link")).toBe(true);
    expect(result.normalized.diagnostics?.unsupportedHistoryCount).toBe(1);

    const giovanni = result.normalized.priorHistories.find((row) => row.horseId === stageBHorseId)!;
    expect(giovanni.selectedRaceKeys).toHaveLength(5);
    expect(giovanni.races).toHaveLength(4);
    expect(giovanni.unsupportedHistories).toHaveLength(1);
    expect(giovanni.unsupportedHistories?.[0]).toMatchObject({
      status: "unscorable_for_ability",
      raceKey: stageBKey,
      raw: {
        final3F: "000",
        gate: "0",
        passingPosition: ["00", "00", "00", "00"],
      },
    });
    expect(giovanni.unsupportedHistories?.[0].raw.final3F).not.toBe(0);

    expect(result.ability.filter((row) => row.ready)).toHaveLength(16);
    expect(result.ability.filter((row) => row.horseId !== stageBHorseId).every((row) =>
      row.historyCount === 5 && row.selectedHistoryCount === 5 && row.scorableHistoryCount === 5 &&
      row.historyCompleteness === 1 && row.baseAbility !== null,
    )).toBe(true);
    for (const row of result.ability.filter((item) => item.horseId !== stageBHorseId)) {
      expect(row.baseAbility).toBe(calculateBaseAbility(result.historyConnection.historiesByHorseId[row.horseId]));
    }
    expect(result.ability.find((row) => row.horseId === stageBHorseId)).toMatchObject({
      ready: true,
      historyCount: 4,
      selectedHistoryCount: 5,
      scorableHistoryCount: 4,
      unscorableHistoryCount: 1,
      historyCompleteness: 0.8,
      historyConfidence: "medium",
      reasons: [],
      unscorableHistories: [{
        raceKey: stageBKey,
        stage: "B",
        reason: "FINAL3F_NOT_PROVIDED",
        source: expect.any(Object),
      }],
    });
    const selectedKeys = giovanni.selectedRaceKeys!;
    expect(selectedKeys).toContain(stageBKey);
    expect(result.historyConnection.rawHistoriesByHorseId[stageBHorseId]).toHaveLength(4);
    expect(result.historyConnection.rawHistoriesByHorseId[stageBHorseId]
      .every((race) => selectedKeys.includes(race.sourceRaceId!))).toBe(true);
  });

  it("hard-stops Selected-5 when only three histories are scorable", () => {
    const imported = importJvLinkRunFolder(createRunFolder(2), { expectedRaceId: targetRaceId, skipCache: true });
    expect(imported.ability.find((row) => row.horseId === stageBHorseId)).toMatchObject({
      ready: false,
      selectedHistoryCount: 5,
      scorableHistoryCount: 3,
      unscorableHistoryCount: 2,
      historyCompleteness: 0.6,
      baseAbility: null,
      reasons: ["INSUFFICIENT_SCORABLE_HISTORY"],
    });
  });

  it("rejects manifest count mismatches", () => {
    const runDir = createRunFolder();
    const manifestPath = path.join(runDir, "raw/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.targetRecordCount = 16;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => loadJvLinkRunFolder(runDir)).toThrow("JVLINK_TARGET_COUNT_MISMATCH");
  });

  it("rejects a history record on or after the target date", () => {
    const runDir = createRunFolder();
    const historyPath = path.join(runDir, "raw/history-records.jsonl");
    const rows = fs.readFileSync(historyPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Envelope);
    const first = rows.find((row) => Buffer.from(row.bytes, "base64").subarray(0, 2).toString() === "RA")!;
    const oldKey = Buffer.from(first.bytes, "base64").subarray(11, 27).toString().trim();
    const newKey = `20260913${oldKey.slice(8)}`;
    for (const row of rows) {
      const buffer = Buffer.from(row.bytes, "base64");
      if (buffer.subarray(11, 27).toString().trim() !== oldKey) continue;
      put(buffer, 12, 16, newKey);
      row.bytes = buffer.toString("base64");
    }
    writeJsonLines(historyPath, rows);
    const manifestPath = path.join(runDir, "raw/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      historySelections: { selectedRaceKeys: string[] }[];
    };
    for (const selection of manifest.historySelections) {
      selection.selectedRaceKeys = selection.selectedRaceKeys.map((key) => key === oldKey ? newKey : key);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => loadJvLinkRunFolder(runDir)).toThrow("FUTURE_OR_TARGET_HISTORY_DETECTED");
  });

  it("hard-stops conflicting official JV-Link records for the same identity", () => {
    const runDir = createRunFolder();
    const targetPath = path.join(runDir, "raw/target-records.jsonl");
    const rows = fs.readFileSync(targetPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Envelope);
    const firstSe = rows[1];
    const conflicting = structuredClone(firstSe);
    const buffer = Buffer.from(conflicting.bytes, "base64");
    put(buffer, 41, 36, "CONFLICTING HORSE NAME");
    conflicting.bytes = buffer.toString("base64");
    rows.push(conflicting);
    writeJsonLines(targetPath, rows);
    const manifestPath = path.join(runDir, "raw/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.targetRecordCount = rows.length;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => loadJvLinkRunFolder(runDir)).toThrow("CONFLICTING_JV_REVISIONS");
  });

  it("writes the normalized cache idempotently with provenance and diagnostics", () => {
    const runDir = createRunFolder();
    const normalizedDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-jvlink-normalized-"));
    const first = importJvLinkRunFolder(runDir, { normalizedDir });
    const second = importJvLinkRunFolder(runDir, { normalizedDir });
    expect(first.cache.wasCached).toBe(false);
    expect(second.cache.wasCached).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(first.cache.writtenPath!, "utf8")) as Record<string, unknown>;
    expect(persisted).toHaveProperty("provenance");
    expect(persisted).toHaveProperty("diagnostics.unsupportedHistoryCount", 1);
  });

  it("continues Formal Ability with the JV-Link value when Repository has a MATERIAL difference", () => {
    const imported = importJvLinkRunFolder(createRunFolder(), { expectedRaceId: targetRaceId, skipCache: true });
    const prior = imported.normalized.priorHistories[0];
    const incoming = prior.races[0];
    const repositoryRace = { ...toRaceHistoryRawInput(incoming), timeGap: incoming.timeGap + 9 };
    const connected = connectCollectorHorseHistories(
      imported.normalized.runners,
      imported.normalized.priorHistories,
      {
        raceId: imported.race.raceId,
        raceDate: imported.race.raceDate,
        postTimeIso: imported.adapted.scheduledStartTime,
      },
      imported.adapted.predictionCutoffAt,
      { [prior.horseId]: [repositoryRace] },
    );
    expect(connected.abilityEvidenceByHorseId[prior.horseId].formalAbilityReady).toBe(true);
    expect(connected.rawHistoriesByHorseId[prior.horseId][0].timeGap).toBe(incoming.timeGap);
    expect(connected.jvLinkConflictDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "timeGap", classification: "MATERIAL", selectedSource: "jv_link" }),
    ]));
  });

  it("does not change the 5/5 horses when a 4/5 evidence horse is added", () => {
    const imported = importJvLinkRunFolder(createRunFolder(), { expectedRaceId: targetRaceId, skipCache: true });
    const target = {
      raceId: imported.race.raceId,
      raceDate: imported.race.raceDate,
      postTimeIso: imported.adapted.scheduledStartTime,
    };
    const withoutPartial = connectCollectorHorseHistories(
      imported.normalized.runners.filter((runner) => runner.horseId !== stageBHorseId),
      imported.normalized.priorHistories.filter((history) => history.horseId !== stageBHorseId),
      target,
      imported.adapted.predictionCutoffAt,
    );
    for (const row of imported.ability.filter((item) => item.horseId !== stageBHorseId)) {
      expect(row.baseAbility).toBe(calculateBaseAbility(withoutPartial.historiesByHorseId[row.horseId]));
    }
  });
});

describe("JV-Link canonical runtime conflict policy", () => {
  it("classifies race-name differences as NON_MATERIAL and uses JV-Link", () => {
    const existing = rawHistory({ raceName: "金鯱賞" });
    const incoming = rawHistory({ raceName: "東海テレビ杯金鯱賞", sourceRaceId: "2026031507010211" });
    const result = selectJvLinkCanonicalRuntimeHistory("2022103995", [existing], [incoming]);
    expect(result.runtimeHistory[0].raceName).toBe("東海テレビ杯金鯱賞");
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "raceName", classification: "NON_MATERIAL", selectedSource: "jv_link" }),
    ]));
  });

  it("classifies timeGap differences as MATERIAL and uses the JV-Link value", () => {
    const existing = rawHistory({ timeGap: 0 });
    const incoming = rawHistory({ timeGap: -0.1, sourceRaceId: "2026022210011011" });
    const result = selectJvLinkCanonicalRuntimeHistory("2021106548", [existing], [incoming]);
    expect(result.runtimeHistory[0].timeGap).toBe(-0.1);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "timeGap",
        repositoryValue: 0,
        jvLinkValue: -0.1,
        classification: "MATERIAL",
        selectedSource: "jv_link",
      }),
    ]));
  });
});

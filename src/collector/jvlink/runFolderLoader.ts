import fs from "node:fs";
import path from "node:path";
import { JvRecord, recordsAsOf, type JvRecordEnvelope } from "./records";

export interface JvLinkManifestHistorySelection {
  horseId: string;
  horseName: string;
  status: string;
  availableHistoryCount: number;
  selectedRaceKeys: string[];
  /**
   * Career Completeness Contract（P0）用。JV-Link SDKのJVOpen照会が対象馬のSE履歴に対して
   * 返す総件数（ReadCount相当、targetAsOf時点・Selected-N windowingで切り捨てる前の値）。
   * RA/SE固定長recordのbyte fieldには「通算出走数」に相当するfieldが無いため、
   * RA/SEの内容から推測してはならない。Mac側Collectorが実際のJV-Link照会結果から
   * 明示的に設定した場合のみ存在する（存在しない＝未確認→Career Completenessはunknownとして扱う）。
   * 省略可能（既存v1 manifestとの後方互換のため必須にしない）。
   */
  careerStartCountAsOf?: number;
}

export interface JvLinkRunManifest {
  schemaVersion: string;
  source: string;
  targetRaceId: string;
  targetRaceKey: string;
  raceDate: string;
  targetAsOf: string;
  collectedAt: string;
  historySelections: JvLinkManifestHistorySelection[];
  targetRecordCount: number;
  historyRecordCount: number;
  provenance?: unknown;
  diagnostics?: unknown;
}

export interface LoadedJvLinkRunFolder {
  runDir: string;
  manifest: JvLinkRunManifest;
  targetEnvelopes: JvRecordEnvelope[];
  historyEnvelopes: JvRecordEnvelope[];
  targetRecords: JvRecord[];
  historyRecords: JvRecord[];
  targetRa: JvRecord;
  targetEntries: JvRecord[];
  historyRaByKey: Map<string, JvRecord>;
  historyEntries: JvRecord[];
}

function requiredFile(runDir: string, relativePath: string): string {
  const filePath = path.join(runDir, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`JVLINK_RUN_FILE_NOT_FOUND: ${relativePath}`);
  }
  return filePath;
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`INVALID_JVLINK_JSON: ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`INVALID_JVLINK_MANIFEST_FIELD: ${field}`);
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`INVALID_JVLINK_MANIFEST_FIELD: ${field}`);
  return value as number;
}

function parseManifest(value: unknown): JvLinkRunManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_JVLINK_MANIFEST");
  }
  const manifest = value as Record<string, unknown>;
  if (!Array.isArray(manifest.historySelections)) throw new Error("INVALID_JVLINK_MANIFEST_HISTORY_SELECTIONS");
  const historySelections = manifest.historySelections.map((item, index): JvLinkManifestHistorySelection => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`INVALID_JVLINK_HISTORY_SELECTION: ${index}`);
    }
    const row = item as Record<string, unknown>;
    if (!Array.isArray(row.selectedRaceKeys) || row.selectedRaceKeys.some((key) => typeof key !== "string")) {
      throw new Error(`INVALID_JVLINK_SELECTED_RACE_KEYS: ${index}`);
    }
    let careerStartCountAsOf: number | undefined;
    if (row.careerStartCountAsOf !== undefined) {
      careerStartCountAsOf = requiredInteger(row.careerStartCountAsOf, `historySelections[${index}].careerStartCountAsOf`);
      if (careerStartCountAsOf < row.selectedRaceKeys.length) {
        throw new Error(`INVALID_JVLINK_CAREER_START_COUNT: ${index}`);
      }
    }
    return {
      horseId: requiredString(row.horseId, `historySelections[${index}].horseId`),
      horseName: requiredString(row.horseName, `historySelections[${index}].horseName`),
      status: requiredString(row.status, `historySelections[${index}].status`),
      availableHistoryCount: requiredInteger(row.availableHistoryCount, `historySelections[${index}].availableHistoryCount`),
      selectedRaceKeys: [...row.selectedRaceKeys] as string[],
      ...(careerStartCountAsOf !== undefined ? { careerStartCountAsOf } : {}),
    };
  });
  const targetAsOf = requiredString(manifest.targetAsOf, "targetAsOf");
  const collectedAt = requiredString(manifest.collectedAt, "collectedAt");
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(targetAsOf) || !Number.isFinite(Date.parse(targetAsOf))) {
    throw new Error("INVALID_JVLINK_TARGET_AS_OF");
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(collectedAt) || !Number.isFinite(Date.parse(collectedAt))) {
    throw new Error("INVALID_JVLINK_COLLECTED_AT");
  }
  return {
    schemaVersion: requiredString(manifest.schemaVersion, "schemaVersion"),
    source: requiredString(manifest.source, "source"),
    targetRaceId: requiredString(manifest.targetRaceId, "targetRaceId"),
    targetRaceKey: requiredString(manifest.targetRaceKey, "targetRaceKey"),
    raceDate: requiredString(manifest.raceDate, "raceDate"),
    targetAsOf,
    collectedAt,
    historySelections,
    targetRecordCount: requiredInteger(manifest.targetRecordCount, "targetRecordCount"),
    historyRecordCount: requiredInteger(manifest.historyRecordCount, "historyRecordCount"),
    provenance: manifest.provenance,
    diagnostics: manifest.diagnostics,
  };
}

function readJsonLines(filePath: string): JvRecordEnvelope[] {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`INVALID_JVLINK_JSONL: ${path.basename(filePath)}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`INVALID_JVLINK_ENVELOPE: ${path.basename(filePath)}:${index + 1}`);
    }
    const row = value as Record<string, unknown>;
    if (typeof row.bytes !== "string" || typeof row.sourceFile !== "string" ||
        typeof row.providedAt !== "string" || typeof row.retrievedAt !== "string") {
      throw new Error(`INVALID_JVLINK_ENVELOPE: ${path.basename(filePath)}:${index + 1}`);
    }
    return {
      bytes: row.bytes,
      sourceFile: row.sourceFile,
      providedAt: row.providedAt,
      retrievedAt: row.retrievedAt,
    };
  });
}

/** manifestが指すraw 3ファイルだけを読み、件数・identity・future境界を検証する。 */
export function loadJvLinkRunFolder(runDir: string, expectedRaceId?: string): LoadedJvLinkRunFolder {
  const resolvedRunDir = path.resolve(runDir);
  if (!fs.existsSync(resolvedRunDir) || !fs.statSync(resolvedRunDir).isDirectory()) {
    throw new Error(`JVLINK_RUN_FOLDER_NOT_FOUND: ${resolvedRunDir}`);
  }
  const manifest = parseManifest(readJson(requiredFile(resolvedRunDir, "raw/manifest.json")));
  if (manifest.schemaVersion !== "jvlink-raw-v1") throw new Error(`UNSUPPORTED_JVLINK_SCHEMA: ${manifest.schemaVersion}`);
  if (expectedRaceId !== undefined && manifest.targetRaceId !== expectedRaceId) {
    throw new Error(`JVLINK_TARGET_RACE_ID_MISMATCH: expected=${expectedRaceId} actual=${manifest.targetRaceId}`);
  }
  if (!/^JRA-\d{8}-[A-Z]+-\d{2}$/.test(manifest.targetRaceId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.raceDate) ||
      manifest.targetRaceId.slice(4, 12) !== manifest.raceDate.replaceAll("-", "")) {
    throw new Error("INVALID_JVLINK_TARGET_IDENTITY");
  }

  const targetEnvelopes = readJsonLines(requiredFile(resolvedRunDir, "raw/target-records.jsonl"));
  const historyEnvelopes = readJsonLines(requiredFile(resolvedRunDir, "raw/history-records.jsonl"));
  if (targetEnvelopes.length !== manifest.targetRecordCount) {
    throw new Error(`JVLINK_TARGET_COUNT_MISMATCH: manifest=${manifest.targetRecordCount} actual=${targetEnvelopes.length}`);
  }
  if (historyEnvelopes.length !== manifest.historyRecordCount) {
    throw new Error(`JVLINK_HISTORY_COUNT_MISMATCH: manifest=${manifest.historyRecordCount} actual=${historyEnvelopes.length}`);
  }

  const targetRecords = recordsAsOf(targetEnvelopes, manifest.targetAsOf);
  const historyRecords = recordsAsOf(historyEnvelopes, manifest.targetAsOf);
  if (targetRecords.length !== targetEnvelopes.length || historyRecords.length !== historyEnvelopes.length) {
    throw new Error("JVLINK_RAW_CONTAINS_DUPLICATE_OR_FUTURE_REVISIONS");
  }
  const targetRaRows = targetRecords.filter((record) => record.type === "RA");
  const targetEntries = targetRecords.filter((record) => record.type === "SE");
  if (targetRaRows.length !== 1 || targetEntries.length === 0) throw new Error("INVALID_JVLINK_TARGET_RECORD_SET");
  const targetRa = targetRaRows[0];
  if (targetRa.key !== manifest.targetRaceKey || targetRa.raceId !== manifest.targetRaceId ||
      targetRa.date !== manifest.raceDate || targetRecords.some((record) => record.key !== manifest.targetRaceKey)) {
    throw new Error("JVLINK_TARGET_IDENTITY_MISMATCH");
  }
  if (new Set(targetEntries.map((record) => record.horseId)).size !== targetEntries.length) {
    throw new Error("DUPLICATE_JVLINK_TARGET_HORSE_ID");
  }

  const historyRaRows = historyRecords.filter((record) => record.type === "RA");
  const historyEntries = historyRecords.filter((record) => record.type === "SE");
  const historyRaByKey = new Map(historyRaRows.map((record) => [record.key, record]));
  if (historyRaByKey.size !== historyRaRows.length) throw new Error("DUPLICATE_JVLINK_HISTORY_RA");
  if (historyRecords.some((record) => record.date >= manifest.raceDate || record.key === manifest.targetRaceKey)) {
    throw new Error("FUTURE_OR_TARGET_HISTORY_DETECTED");
  }
  const missingRa = historyEntries.filter((record) => !historyRaByKey.has(record.key));
  if (missingRa.length > 0) throw new Error(`JVLINK_HISTORY_RA_MISSING: ${missingRa[0].key}`);

  const entriesByHorse = new Map<string, string[]>();
  for (const entry of historyEntries) {
    const keys = entriesByHorse.get(entry.horseId) ?? [];
    keys.push(entry.key);
    entriesByHorse.set(entry.horseId, keys);
  }
  if (manifest.historySelections.length !== targetEntries.length ||
      new Set(manifest.historySelections.map((selection) => selection.horseId)).size !== manifest.historySelections.length) {
    throw new Error("JVLINK_HISTORY_SELECTION_HORSE_MISMATCH");
  }
  const targetHorseIds = new Set(targetEntries.map((entry) => entry.horseId));
  if (manifest.historySelections.some((selection) => !targetHorseIds.has(selection.horseId)) ||
      targetEntries.some((entry) => !manifest.historySelections.some((selection) => selection.horseId === entry.horseId))) {
    throw new Error("JVLINK_HISTORY_SELECTION_HORSE_MISMATCH");
  }
  for (const selection of manifest.historySelections) {
    const actual = entriesByHorse.get(selection.horseId) ?? [];
    if (selection.status !== "available" || selection.availableHistoryCount !== selection.selectedRaceKeys.length ||
        actual.length !== selection.selectedRaceKeys.length ||
        selection.selectedRaceKeys.some((key, index) => actual[index] !== key)) {
      throw new Error(`JVLINK_HISTORY_SELECTION_MISMATCH: ${selection.horseId}`);
    }
  }
  if (historyEntries.length !== manifest.historySelections.reduce((sum, row) => sum + row.selectedRaceKeys.length, 0)) {
    throw new Error("JVLINK_HISTORY_SELECTION_TOTAL_MISMATCH");
  }

  return {
    runDir: resolvedRunDir,
    manifest,
    targetEnvelopes,
    historyEnvelopes,
    targetRecords,
    historyRecords,
    targetRa,
    targetEntries,
    historyRaByKey,
    historyEntries,
  };
}

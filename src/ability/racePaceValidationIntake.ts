/**
 * Historical Lap Data Intake V1（CHECKPOINT14C.2B）。
 *
 * ChatGPT側から届く`RaceLapSequenceRecord[]`（Lap Data Package）を、実際に
 * `raceLapData.json`へ書き込む前に検証するDry Run契約と、非破壊importのみを提供する。
 * Race Pace Prediction Engine（racePacePrediction.ts）・Historical Position Profile
 * （positionProfile.ts）は一切参照・変更しない（このファイルはimport intake専用）。
 *
 * 【絶対に守ること】
 *   - 1件でも重大conflict（既存recordとの内容不一致・構造不正・distance不整合）が
 *     あれば、そのDry Run結果はblocked=trueとなり、`planLapDataImport()`は
 *     mergedにnullを返す（自動importしない、CHECKPOINT14C.2B 9節）。
 *   - 既存raceIdへの同一内容の再送信はduplicate（no-op、安全）として扱い、blockしない。
 *   - 推測補完は一切行わない（欠損値をそのまま「エラー」または「警告」として報告する）。
 *   - race-level enrichment（`raceLapData.json`）としてのみ保存し、
 *     `data/horses/`・`race_performances.csv`（horse-level）への複製は行わない。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RaceLapSequenceRecord } from "./racePaceValidationTypes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 既定の保存先。CHECKPOINT14C.1で新設したrace-level enrichment file */
export const DEFAULT_RACE_LAP_DATA_PATH = path.resolve(__dirname, "./data/raceLapData.json");

interface RaceLapDataStoreFile {
  note: string;
  laps: RaceLapSequenceRecord[];
}

export interface LapDataDryRunResult {
  /** 受け取ったレコード総数 */
  records: number;
  /** 構造的に妥当（必須メタデータ・segmentMeters>0・lapSequence非空かつ全て正の有限数）なレコード数 */
  validRecords: number;
  /** バッチ内または既存storeと内容が完全一致する（安全なno-op）raceId */
  duplicates: string[];
  /** バッチ内で同一raceIdのメタデータ（raceName/racecourse/surface/distance/going等）が矛盾しているraceId */
  metadataConflicts: string[];
  /** segmentMeters<=0、lapSequenceが空、または非有限・非正の値を含むraceId */
  lapLengthErrors: string[];
  /** lapSequence×segmentMetersがdistanceと大きく食い違うraceId */
  distanceMismatch: string[];
  /** 既存raceLapData.jsonに同一raceIdが存在し、内容が異なるraceId（silent overwrite防止のため要手動判断） */
  existingRaceConflicts: string[];
  warnings: string[];
  /** true の場合、1件でも重大な問題があるため自動importしない */
  blocked: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function hasRequiredMetadata(r: RaceLapSequenceRecord): boolean {
  return (
    typeof r.raceId === "string" &&
    r.raceId.length > 0 &&
    typeof r.raceDate === "string" &&
    r.raceDate.length > 0 &&
    typeof r.raceName === "string" &&
    r.raceName.length > 0 &&
    typeof r.racecourse === "string" &&
    r.racecourse.length > 0 &&
    (r.surface === "turf" || r.surface === "dirt") &&
    isFiniteNumber(r.distance) &&
    r.distance > 0 &&
    typeof r.going === "string" &&
    r.going.length > 0 &&
    typeof r.source === "string" &&
    r.source.length > 0
  );
}

function hasValidLapSequence(r: RaceLapSequenceRecord): boolean {
  if (!isFiniteNumber(r.segmentMeters) || r.segmentMeters <= 0) return false;
  if (!Array.isArray(r.lapSequence) || r.lapSequence.length === 0) return false;
  return r.lapSequence.every((v) => isFiniteNumber(v) && v > 0);
}

/** lapSequence×segmentMetersがdistanceとsegmentMeters超で食い違うかを確認する（末尾半端区間は許容） */
function hasDistanceMismatch(r: RaceLapSequenceRecord): boolean {
  if (!hasValidLapSequence(r)) return false; // 構造不正は別カテゴリ(lapLengthErrors)で扱う
  const covered = r.lapSequence.length * r.segmentMeters;
  return Math.abs(covered - r.distance) > r.segmentMeters;
}

/** JSON往復可能な値同士の再帰的な構造比較（キー順に依存しない。predictionSnapshotStore.tsと同じ考え方） */
function deepEqualJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualJsonValue(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqualJsonValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Lap Data Package（incoming）を、既存store（existing）に対してDry Runする。
 * ファイルI/Oは行わない純粋関数（テスト容易性・呼び出し側の柔軟性のため）。
 */
export function runLapDataDryRun(
  incoming: RaceLapSequenceRecord[],
  existing: RaceLapSequenceRecord[],
): LapDataDryRunResult {
  const warnings: string[] = [];
  const duplicates = new Set<string>();
  const metadataConflicts = new Set<string>();
  const lapLengthErrors = new Set<string>();
  const distanceMismatch = new Set<string>();
  const existingRaceConflicts = new Set<string>();

  const existingById = new Map(existing.map((r) => [r.raceId, r]));
  const seenInBatch = new Map<string, RaceLapSequenceRecord>();

  let validRecords = 0;

  for (const record of incoming) {
    const structurallyValid = hasRequiredMetadata(record) && hasValidLapSequence(record);
    if (structurallyValid) validRecords++;
    else {
      lapLengthErrors.add(record.raceId || "(raceId不明)");
      warnings.push(`raceId=${record.raceId || "(不明)"}: 必須メタデータ不足またはlapSequence/segmentMetersが不正です。`);
      continue; // 構造不正なレコードは他チェックの対象にしない（安全側）
    }

    if (hasDistanceMismatch(record)) {
      distanceMismatch.add(record.raceId);
      warnings.push(
        `raceId=${record.raceId}: lapSequence×segmentMeters（${record.lapSequence.length * record.segmentMeters}m）がdistance（${record.distance}m）と大きく食い違っています。`,
      );
    }

    // バッチ内重複チェック
    const priorInBatch = seenInBatch.get(record.raceId);
    if (priorInBatch) {
      if (deepEqualJsonValue(priorInBatch, record)) {
        duplicates.add(record.raceId);
      } else {
        metadataConflicts.add(record.raceId);
        warnings.push(`raceId=${record.raceId}: 同一バッチ内で内容の異なる重複レコードがあります。`);
      }
    } else {
      seenInBatch.set(record.raceId, record);
    }

    // 既存store（raceLapData.json）との比較
    const existingRecord = existingById.get(record.raceId);
    if (existingRecord) {
      if (deepEqualJsonValue(existingRecord, record)) {
        duplicates.add(record.raceId);
      } else {
        existingRaceConflicts.add(record.raceId);
        warnings.push(
          `raceId=${record.raceId}: 既存raceLapData.jsonに異なる内容のレコードが既にあります。silent overwriteはしません（手動判断が必要）。`,
        );
      }
    }
  }

  const blocked = metadataConflicts.size > 0 || lapLengthErrors.size > 0 || distanceMismatch.size > 0 || existingRaceConflicts.size > 0;

  return {
    records: incoming.length,
    validRecords,
    duplicates: [...duplicates],
    metadataConflicts: [...metadataConflicts],
    lapLengthErrors: [...lapLengthErrors],
    distanceMismatch: [...distanceMismatch],
    existingRaceConflicts: [...existingRaceConflicts],
    warnings,
    blocked,
  };
}

export interface PlanLapDataImportResult {
  dryRun: LapDataDryRunResult;
  /** blocked=trueの場合は常にnull（何も書き込まない）。blocked=falseの場合のみ、既存+新規（重複除く）のマージ結果 */
  merged: RaceLapSequenceRecord[] | null;
}

/**
 * Dry Runを実行し、blockedでなければ既存storeと非破壊マージした結果を返す（ファイルI/Oはしない）。
 * 実際にraceLapData.jsonへ書き込むかどうかは呼び出し側が`merged`を見て判断する。
 */
export function planLapDataImport(incoming: RaceLapSequenceRecord[], existing: RaceLapSequenceRecord[]): PlanLapDataImportResult {
  const dryRun = runLapDataDryRun(incoming, existing);
  if (dryRun.blocked) return { dryRun, merged: null };

  const existingById = new Map(existing.map((r) => [r.raceId, r]));
  const newOnes = incoming.filter((r) => !existingById.has(r.raceId));
  return { dryRun, merged: [...existing, ...newOnes] };
}

/** raceLapData.jsonを読み込む（存在しなければ空のstoreを返す） */
export function loadRaceLapDataStore(filePath: string = DEFAULT_RACE_LAP_DATA_PATH): RaceLapDataStoreFile {
  if (!fs.existsSync(filePath)) {
    return { note: "", laps: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RaceLapDataStoreFile;
}

export type WriteRaceLapDataResult =
  | { status: "written"; addedCount: number; path: string }
  | { status: "blocked"; dryRun: LapDataDryRunResult; path: string }
  | { status: "noop"; path: string };

/**
 * Dry Runがクリーンな場合のみraceLapData.jsonへ書き込む。1件でも重大conflictがあれば
 * 何も書き込まずblockedを返す（CHECKPOINT14C.2B 9節）。新規追加が0件（全件duplicate）の
 * 場合もファイルを書き換えないnoopとする。
 */
export function writeRaceLapDataStoreIfClean(
  incoming: RaceLapSequenceRecord[],
  filePath: string = DEFAULT_RACE_LAP_DATA_PATH,
  note?: string,
): WriteRaceLapDataResult {
  const store = loadRaceLapDataStore(filePath);
  const plan = planLapDataImport(incoming, store.laps);

  if (plan.merged === null) {
    return { status: "blocked", dryRun: plan.dryRun, path: filePath };
  }

  const addedCount = plan.merged.length - store.laps.length;
  if (addedCount === 0) {
    return { status: "noop", path: filePath };
  }

  const updated: RaceLapDataStoreFile = { note: note ?? store.note, laps: plan.merged };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return { status: "written", addedCount, path: filePath };
}

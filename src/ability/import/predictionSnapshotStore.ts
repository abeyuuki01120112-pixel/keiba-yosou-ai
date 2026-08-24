/**
 * Formal Prediction Snapshot Persistence V1（CHECKPOINT13.5B）。
 *
 * FormalPredictionSnapshotRecord（formalPredictionSnapshot.ts、無変更）を
 * file-basedで永続化するだけの層。Base Ability/Suitability/MemberLevel Evidence等の
 * 計算ロジックはここには一切無い（既に計算済みの値をそのままJSONへ書き出すだけ）。
 *
 * 【絶対に守ること】
 *   - 既存snapshotIdへのoverwrite/update/mutationは禁止（CHECKPOINT13.5B 5節）。
 *     同一内容の再保存はno-op（duplicate）、異なる内容での再保存はrejectする。
 *     silent overwriteは一切行わない。
 *   - update/delete APIはV1では提供しない（13節）。
 *   - formal!==trueのrecordは`persistPredictionSnapshot()`が拒否する（12節、
 *     型レベルでも`FormalPredictionSnapshotRecord.formal`は常にtrueだが、
 *     直接オブジェクトリテラルで渡された不正な値にも念のため防御する）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FormalPredictionSnapshotRecord } from "./formalPredictionSnapshot";
import type { PredictionStage } from "../predictionSnapshot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 既定の保存先。src/ability/data/配下の既存規約（provisional/, racecards/等）に合わせる */
export const DEFAULT_SNAPSHOT_STORE_DIR = path.resolve(__dirname, "../data/predictionSnapshots");

export type PersistPredictionSnapshotResult =
  | { status: "created"; snapshotId: string; path: string }
  | { status: "duplicate"; snapshotId: string; path: string }
  | { status: "rejected"; snapshotId: string; path: string; reason: string };

export interface SnapshotStoreOptions {
  /** テスト用に保存先ディレクトリを差し替える。省略時はDEFAULT_SNAPSHOT_STORE_DIR */
  dir?: string;
}

function snapshotFilePath(snapshotId: string, dir: string): string {
  return path.join(dir, `${snapshotId}.json`);
}

/** JSON往復可能な値同士の再帰的な構造比較（キー順に依存しない） */
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
 * Formal Snapshotを永続化する。
 *
 * 既存snapshotIdが無ければ新規作成（created）。
 * 既存snapshotIdがあり内容が完全一致すればno-op（duplicate、既存ファイルは書き換えない）。
 * 既存snapshotIdがあり内容が異なればreject（rejected、既存ファイルは書き換えない）。
 * どちらの場合もsilent overwriteは発生しない。
 */
export function persistPredictionSnapshot(
  record: FormalPredictionSnapshotRecord,
  options: SnapshotStoreOptions = {},
): PersistPredictionSnapshotResult {
  if (record.formal !== true) {
    throw new Error("formal=trueでないSnapshotは正式Prediction Historyへ保存できません（CHECKPOINT13.5B 12節）");
  }

  const dir = options.dir ?? DEFAULT_SNAPSHOT_STORE_DIR;
  const filePath = snapshotFilePath(record.snapshotId, dir);
  const newParsed = JSON.parse(JSON.stringify(record));

  if (fs.existsSync(filePath)) {
    const existingParsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (deepEqualJsonValue(existingParsed, newParsed)) {
      return { status: "duplicate", snapshotId: record.snapshotId, path: filePath };
    }
    return {
      status: "rejected",
      snapshotId: record.snapshotId,
      path: filePath,
      reason:
        "同一snapshotIdに異なる内容のSnapshotを保存しようとしました。正式recordのoverwriteは禁止です（CHECKPOINT13.5B 5節）。",
    };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  return { status: "created", snapshotId: record.snapshotId, path: filePath };
}

/** snapshotIdで正式recordを1件読み込む。存在しなければnull */
export function loadPredictionSnapshot(
  snapshotId: string,
  options: SnapshotStoreOptions = {},
): FormalPredictionSnapshotRecord | null {
  const dir = options.dir ?? DEFAULT_SNAPSHOT_STORE_DIR;
  const filePath = snapshotFilePath(snapshotId, dir);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as FormalPredictionSnapshotRecord;
}

export interface ListPredictionSnapshotsFilter {
  raceId?: string;
  stage?: PredictionStage;
}

/** 保存済みの正式recordを一覧する（フィルタ省略時は全件） */
export function listPredictionSnapshots(
  filter: ListPredictionSnapshotsFilter = {},
  options: SnapshotStoreOptions = {},
): FormalPredictionSnapshotRecord[] {
  const dir = options.dir ?? DEFAULT_SNAPSHOT_STORE_DIR;
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const records = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as FormalPredictionSnapshotRecord);
  return records.filter((r) => {
    if (filter.raceId !== undefined && r.raceId !== filter.raceId) return false;
    if (filter.stage !== undefined && r.stage !== filter.stage) return false;
    return true;
  });
}

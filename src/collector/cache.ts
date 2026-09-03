import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CollectedRunnerRow, PriorHistoryEntry } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_NORMALIZED_DIR = path.join(__dirname, "data", "normalized");

export interface NormalizedCacheEntry {
  raceId: string;
  collectedAt: string;
  runners: CollectedRunnerRow[];
  priorHistories: PriorHistoryEntry[];
}

/**
 * Idempotency / Cache（STEP6）。同一raceIdを複数回実行しても、書き込み先は
 * 常にraceId単位の同一ファイル1つのみ（重複ファイル・重複行は生成されない）。
 * runners/priorHistoriesの内容が既存キャッシュと完全に同一な場合は書き込み
 * 自体をスキップする（no-op、`wasCached: true`を返す）。
 */
/**
 * 内容比較用に、実行のたびに変わって当然の項目（`retrievedAt`＝この
 * Collector呼び出しの実行時刻）を除いた版を作る。`retrievedAt`まで比較に
 * 含めると、同一データの再実行が毎回「差分あり」と誤判定されてしまう
 * ——Idempotencyの定義（同じ入力から同じnormalized dataを再生成できる）を
 * 満たすため、データ内容のみを比較対象にする。
 */
function toComparableEntry(entry: NormalizedCacheEntry): unknown {
  return {
    raceId: entry.raceId,
    runners: entry.runners,
    priorHistories: entry.priorHistories.map((p) => ({
      horseId: p.horseId,
      status: p.status,
      races: p.races,
      provenance: { ...p.provenance, retrievedAt: undefined },
    })),
  };
}

export function writeNormalizedCache(
  entry: NormalizedCacheEntry,
  normalizedDir: string = DEFAULT_NORMALIZED_DIR,
): { wasCached: boolean; writtenPath: string } {
  if (!fs.existsSync(normalizedDir)) {
    fs.mkdirSync(normalizedDir, { recursive: true });
  }
  const filePath = path.join(normalizedDir, `${entry.raceId}.json`);

  if (fs.existsSync(filePath)) {
    const existingRaw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as NormalizedCacheEntry;
    if (JSON.stringify(toComparableEntry(existingRaw)) === JSON.stringify(toComparableEntry(entry))) {
      return { wasCached: true, writtenPath: filePath };
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + "\n", "utf-8");
  return { wasCached: false, writtenPath: filePath };
}

export function readNormalizedCache(
  raceId: string,
  normalizedDir: string = DEFAULT_NORMALIZED_DIR,
): NormalizedCacheEntry | null {
  const filePath = path.join(normalizedDir, `${raceId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as NormalizedCacheEntry;
}

/**
 * Race Card Input Bridge V1 のCLI（CHECKPOINT13.2B）。
 *
 * 実際の1レースの出走表（JSON または CSV）を読み込み、
 *   Runner Resolver → RaceEntryInput → Stage A Snapshot（診断用）
 * まで通した結果のレポートを表示する。
 *
 * 【重要】このCLIは data/horses/ を一切書き込まない（読み取り専用）。
 * 過去走データのimport/merge（npm run import:csv）とは完全に別の経路である。
 *
 * 使い方:
 *   npm run racecard:check -- path/to/racecard.json
 *   npm run racecard:check -- path/to/racecard.csv
 *
 * JSON形式の例は docs/race-card-input-v1.md を参照。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/ability/import/csvParser";
import { normalizeRaceCard, raceCardFromCsvRows } from "../src/ability/import/raceCardTypes";
import { runRaceCardBridge, formatRaceCardBridgeReport } from "../src/ability/import/raceCardBridge";
import { buildAbilityBoard } from "../src/ability/predictionSnapshot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const inputArg = args.find((a) => !a.startsWith("--"));
const showBoard = args.includes("--board");

if (!inputArg) {
  console.error("使い方: npm run racecard:check -- path/to/racecard.json [--board]");
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(`入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf-8");
const ext = path.extname(inputPath).toLowerCase();

const normalizeResult =
  ext === ".csv" ? raceCardFromCsvRows(parseCsv(raw)) : normalizeRaceCard(JSON.parse(raw));

console.log(`入力: ${path.relative(ROOT, inputPath)}`);

if (!normalizeResult.ok) {
  console.log(`\nRace Cardの検証に失敗しました（${normalizeResult.errors.length}件のエラー）:`);
  for (const e of normalizeResult.errors) {
    console.log(`  ${e.path}: ${e.message}`);
  }
  process.exit(1);
}

const bridgeResult = runRaceCardBridge(normalizeResult.data);

console.log("");
console.log(formatRaceCardBridgeReport(bridgeResult));

if (showBoard) {
  console.log("\n=== Ability Board（診断用。gate.formal=falseの場合は正式な予想として扱わないこと） ===");
  const board = buildAbilityBoard(bridgeResult.diagnosticSnapshot);
  for (const row of board) {
    console.log(
      `${row.horseNumber ?? "?"}番 ${row.horseName}: baseAbility=${row.baseAbility ?? "N/A"} ` +
        `overallSuitability=${row.overallSuitabilityPercent ?? "N/A"}% effectiveAbility=${row.effectiveAbility ?? "N/A"} ` +
        `rankByBase=${row.rankByBaseAbility ?? "-"} rankByEffective=${row.rankByEffectiveAbility ?? "-"}`,
    );
  }
}

console.log("\n(このCLIはdata/horses/を一切書き込んでいません。読み取り専用の診断ツールです。)");
process.exit(bridgeResult.gate.formal ? 0 : 1);

/**
 * CSV実データを src/ability/data/horses/<horseId>.json へ取り込むCLI。
 *
 * src/ability/import/ のnormalize/検証ロジックをそのまま使う
 * （CLIとアプリ本体で判定ロジックが二重管理にならないようにするため、TypeScriptで実装しtsxで実行する）。
 *
 * 使い方:
 *   npm run import:csv -- <input.csv> [--dry-run]
 *   npm run import:csv                              # 引数省略時は src/ability/data/import/race-performances.csv を使う
 *
 * --dry-run を付けるとファイルには書き込まず、集計結果だけ表示する。
 *
 * 動作: CSVを読み込み、horseIdごとにグルーピングして
 * src/ability/data/horses/<horseId>.json を「まるごと置き換える」。
 * 既存のレースと過去走を合算したい場合は、既存ファイルの内容をCSVにも含めてから実行すること
 * （このV0では自動マージはしない。誤って過去走を消さないよう、常に集計件数を確認してから実行する）。
 *
 * horseIdの差し替え: CSVのhorseIdがJRA公式IDなど、既存ロスター
 * （src/simulation/data/sapporoKinen.json）の内部horseIdと異なっていても、
 * 馬名が一致すればロスター側のhorseIdへ自動的に差し替えてから書き込む
 * （予想ロジックには影響しない。詳細は src/ability/import/horseIdAliases.ts）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildImportResult } from "../src/ability/import/buildImportResult";
import { buildHorseIdAliasesByName } from "../src/ability/import/horseIdAliases";
import rawSapporoKinen from "../src/simulation/data/sapporoKinen.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "src/ability/data/import/race-performances.csv");
const HORSES_DIR = path.join(ROOT, "src/ability/data/horses");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputArg = args.find((a) => !a.startsWith("--"));
const inputPath = inputArg ? path.resolve(process.cwd(), inputArg) : DEFAULT_INPUT;

if (!fs.existsSync(inputPath)) {
  console.error(`入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

const csvText = fs.readFileSync(inputPath, "utf-8");
const horseIdAliasesByName = buildHorseIdAliasesByName(rawSapporoKinen.horses);
const result = buildImportResult(csvText, { horseIdAliasesByName });

console.log(`入力: ${path.relative(ROOT, inputPath)}`);
console.log(`読み込み件数: ${result.totalRows}`);
console.log(`正常データ件数: ${result.normalizedCount}`);
console.log(`除外データ件数（欠損のため能力計算対象外）: ${result.excludedFromScoringCount}`);
console.log(`エラー件数: ${result.errorCount}`);

if (result.errors.length > 0) {
  console.log("\nエラー詳細:");
  for (const e of result.errors) {
    console.log(`  行${e.rowIndex} (raceId=${e.raceId ?? "?"}, horseId=${e.horseId ?? "?"}): ${e.message}`);
  }
}

if (result.excluded.length > 0) {
  console.log("\n除外詳細（欠損のため能力計算対象外）:");
  for (const e of result.excluded) {
    console.log(`  raceId=${e.raceId} horseId=${e.horseId}（${e.horseName}）`);
  }
}

const horseIds = Object.keys(result.byHorseId);
console.log(`\n対象馬: ${horseIds.length}頭 (${horseIds.join(", ")})`);

const rosterHorseIds = new Set(rawSapporoKinen.horses.map((h) => h.horseId));
const aliasedHorseIds = horseIds.filter((id) => rosterHorseIds.has(id));
if (aliasedHorseIds.length > 0) {
  console.log(`既存ロスターに接続された馬: ${aliasedHorseIds.join(", ")}`);
}

if (dryRun) {
  console.log("\n--dry-run のため書き込みは行っていません。");
  process.exit(result.errorCount > 0 ? 1 : 0);
}

fs.mkdirSync(HORSES_DIR, { recursive: true });
for (const horseId of horseIds) {
  const filePath = path.join(HORSES_DIR, `${horseId}.json`);
  const newRaces = result.byHorseId[horseId];

  if (fs.existsSync(filePath)) {
    const existingRaces = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Array.isArray(existingRaces) && existingRaces.length > newRaces.length) {
      console.log(
        `警告: ${path.relative(ROOT, filePath)} は既存${existingRaces.length}走 → 新規${newRaces.length}走（自動マージしないため置き換えられます）`,
      );
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(newRaces, null, 2) + "\n");
  console.log(`書き込み: ${path.relative(ROOT, filePath)} (${newRaces.length}走)`);
}

console.log("\n次に `npm run validate:data` と `npm test` で確認してください。");
process.exit(result.errorCount > 0 ? 1 : 0);

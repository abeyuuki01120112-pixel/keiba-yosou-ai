/**
 * 「5年基準タイム」CSV実データを src/ability/data/courseTimeBaselines.json へ取り込むCLI。
 *
 * 第7実装の方針：baselineの計算式（raceTimeScore・trackAdjustment等）は一切変更しない。
 * ここは「CSVの仮値を実データへ安全に差し替える入口」だけを提供する。
 *
 * 使い方:
 *   npm run import:time-baselines -- <input.csv> [--dry-run]
 *   npm run import:time-baselines                                  # 引数省略時は src/ability/data/import/course-time-baselines.csv を使う
 *
 * --dry-run を付けるとファイルには書き込まず、集計結果だけ表示する。
 * エラーが1件でもあれば書き込みを中止する（部分的な差し替えをしない）。
 *
 * CSVの列: racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source
 * baselineSource・isReliable列を含めても構わないが、それらは検索（lookupCourseTimeBaseline）の
 * たびに毎回計算しなおす値のため、CSVにあっても読み捨てる。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCourseTimeBaselineImportResult } from "../src/ability/import/buildBaselineImportResult";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "src/ability/data/import/course-time-baselines.csv");
const OUTPUT_PATH = path.join(ROOT, "src/ability/data/courseTimeBaselines.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputArg = args.find((a) => !a.startsWith("--"));
const inputPath = inputArg ? path.resolve(process.cwd(), inputArg) : DEFAULT_INPUT;

if (!fs.existsSync(inputPath)) {
  console.error(`入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

const csvText = fs.readFileSync(inputPath, "utf-8");
const result = buildCourseTimeBaselineImportResult(csvText);

console.log(`入力: ${path.relative(ROOT, inputPath)}`);
console.log(`読み込み件数: ${result.totalRows}`);
console.log(`正常データ件数: ${result.validCount}`);
console.log(`エラー件数: ${result.errorCount}`);

if (result.errors.length > 0) {
  console.log("\nエラー詳細:");
  for (const e of result.errors) {
    console.log(`  行${e.rowIndex}: ${e.message}`);
  }
}

if (result.ignoredColumns.length > 0) {
  console.log(
    `\n注: CSVの列 [${result.ignoredColumns.join(", ")}] は無視されます` +
      "（baselineSource/isReliableは検索のたびに自動計算される値のため、保存はしません）。",
  );
}

if (result.errorCount > 0) {
  console.log("\nエラーがあるため書き込みを中止しました。CSVを修正して再実行してください。");
  process.exit(1);
}

if (dryRun) {
  console.log("\n--dry-run のため書き込みは行っていません。");
  process.exit(0);
}

const output = {
  note: "npm run import:time-baselines で実データから生成。手動で編集する場合はこの行を書き換えること。",
  baselines: result.baselines,
};
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`\n書き込み: ${path.relative(ROOT, OUTPUT_PATH)} (${result.baselines.length}件)`);
console.log("次に `npm run validate:data` と `npm test` で確認してください。");
process.exit(0);

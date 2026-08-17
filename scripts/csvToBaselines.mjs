#!/usr/bin/env node
/**
 * 過去5年基準タイム／上がり3F基準のCSVを、courseTimeBaselines.json /
 * courseFinal3FBaselines.json 形式に変換する。
 *
 * 使い方:
 *   node scripts/csvToBaselines.mjs time <input.csv> [出力先.json]
 *   node scripts/csvToBaselines.mjs final3f <input.csv> [出力先.json]
 *
 * CSVの列（1行目はヘッダー）:
 *   racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds      (type=time)
 *   racecourse,surface,distance,going,sampleYears,sampleCount,medianFinal3FSeconds   (type=final3f)
 *
 * 例は templates/course-time-baselines-template.csv /
 * templates/course-final3f-baselines-template.csv を参照。
 * 出力先を省略した場合は src/ability/data/courseTimeBaselines.json または
 * courseFinal3FBaselines.json を丸ごと差し替える。
 *
 * 変換後は `npm run validate:data` で構造チェックすること。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toNumber } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TYPE_CONFIG = {
  time: {
    valueField: "medianTimeSeconds",
    defaultOutput: "src/ability/data/courseTimeBaselines.json",
    note: "実データ投入済み（またはV0仮データ）。5年基準タイム。",
  },
  final3f: {
    valueField: "medianFinal3FSeconds",
    defaultOutput: "src/ability/data/courseFinal3FBaselines.json",
    note: "実データ投入済み（またはV0仮データ）。5年上がり3F基準。",
  },
};

const [, , type, inputPath, outputPathArg] = process.argv;

const config = TYPE_CONFIG[type];
if (!config || !inputPath) {
  console.error("使い方: node scripts/csvToBaselines.mjs <time|final3f> <input.csv> [出力先.json]");
  process.exit(1);
}

const outputPath = outputPathArg
  ? path.resolve(process.cwd(), outputPathArg)
  : path.join(ROOT, config.defaultOutput);

const NUMBER_FIELDS = ["distance", "sampleYears", "sampleCount", config.valueField];
const REQUIRED_COLUMNS = ["racecourse", "surface", "distance", "going", "sampleYears", "sampleCount", config.valueField];

const csvText = fs.readFileSync(path.resolve(process.cwd(), inputPath), "utf-8");
const rows = parseCsv(csvText);

if (rows.length === 0) {
  console.error("CSVにデータ行がありません");
  process.exit(1);
}

const missingColumns = REQUIRED_COLUMNS.filter((col) => !(col in rows[0]));
if (missingColumns.length > 0) {
  console.error(`CSVに必要な列がありません: ${missingColumns.join(", ")}`);
  process.exit(1);
}

const baselines = rows.map((row, idx) => {
  const entry = {};
  for (const col of REQUIRED_COLUMNS) {
    entry[col] = NUMBER_FIELDS.includes(col) ? toNumber(row[col], col, idx) : row[col];
  }
  return entry;
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ note: config.note, baselines }, null, 2) + "\n");

console.log(`${baselines.length}件の基準を書き込みました: ${path.relative(ROOT, outputPath)}`);
console.log("次に `npm run validate:data` で構造を確認してください。");

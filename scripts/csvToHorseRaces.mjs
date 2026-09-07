#!/usr/bin/env node
/**
 * 1頭分のレース実績CSVを、data/horses/<horseId>.json 形式に変換する。
 * 将来のスクレイピング／表計算からの取り込みの土台。
 *
 * 使い方:
 *   node scripts/csvToHorseRaces.mjs <horseId> <input.csv> [出力先.json]
 *
 * CSVの列（1行目はヘッダー、この名前・順序で用意する）:
 *   raceId,raceName,raceDate,racecourse,surface,distance,going,finishPosition,timeGap,raceTime,final3F,carriedWeight
 *
 * 例は templates/race-performances-template.csv を参照。
 * 出力先を省略した場合は src/ability/data/horses/<horseId>.json に書き込む
 * （既存馬のデータを丸ごと差し替える）。
 *
 * 変換後は `npm run validate:data` で構造チェックすること。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toNumber } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [, , horseId, inputPath, outputPathArg] = process.argv;

if (!horseId || !inputPath) {
  console.error("使い方: node scripts/csvToHorseRaces.mjs <horseId> <input.csv> [出力先.json]");
  process.exit(1);
}

const outputPath = outputPathArg
  ? path.resolve(process.cwd(), outputPathArg)
  : path.join(ROOT, "src/ability/data/horses", `${horseId}.json`);

const NUMBER_FIELDS = ["distance", "finishPosition", "timeGap", "raceTime", "final3F", "carriedWeight"];
const REQUIRED_COLUMNS = [
  "raceId",
  "raceName",
  "raceDate",
  "racecourse",
  "surface",
  "distance",
  "going",
  "finishPosition",
  "timeGap",
  "raceTime",
  "final3F",
  "carriedWeight",
];

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

const races = rows.map((row, idx) => {
  const race = {};
  for (const col of REQUIRED_COLUMNS) {
    race[col] = NUMBER_FIELDS.includes(col) ? toNumber(row[col], col, idx) : row[col];
  }
  return race;
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(races, null, 2) + "\n");

console.log(`${races.length}走を書き込みました: ${path.relative(ROOT, outputPath)}`);
console.log("次に `npm run validate:data` で構造を確認してください。");

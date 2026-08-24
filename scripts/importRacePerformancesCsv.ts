/**
 * CSV実データを src/ability/data/horses/<horseId>.json へ取り込むCLI。
 *
 * src/ability/import/ のnormalize/検証ロジックをそのまま使う
 * （CLIとアプリ本体で判定ロジックが二重管理にならないようにするため、TypeScriptで実装しtsxで実行する）。
 *
 * 使い方:
 *   npm run import:csv -- <input.csv> [--dry-run] [--replace]
 *   npm run import:csv                              # 引数省略時は src/ability/data/import/race-performances.csv を使う
 *
 * --dry-run を付けるとファイルには書き込まず、集計結果だけ表示する。
 *
 * 【CHECKPOINT13.2で挙動変更】デフォルトは Merge / Upsert 方式。
 * 既存 data/horses/<horseId>.json の内容は削除せず、CSVに含まれる新しいraceIdだけを
 * 追加する。既存と完全一致するraceId（重複import）は無視する。既存と内容が食い違う
 * 同一raceId（conflict）は自動採用せず、そのraceIdだけ書き込みをスキップし、
 * 既存の値をそのまま残した上でconflict内容をレポートする（silent overwrite禁止）。
 * conflictが1件でもある馬は、その馬のファイル全体を書き込まない（安全側に倒す）。
 *
 * --replace を付けると、CHECKPOINT13.1以前と同じ「まるごと置き換え」方式に戻せる
 * （既存の過去走を意図的に一括修正したい場合など、限定的な用途向け）。
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
import { mergeHorseRaceHistory } from "../src/ability/import/mergeHorseHistory";
import type { RaceHistoryRawInput } from "../src/ability/raceHistoryPipeline";
import rawSapporoKinen from "../src/simulation/data/sapporoKinen.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(ROOT, "src/ability/data/import/race-performances.csv");
const HORSES_DIR = path.join(ROOT, "src/ability/data/horses");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replaceMode = args.includes("--replace");
const inputArg = args.find((a) => !a.startsWith("--"));
const inputPath = inputArg ? path.resolve(process.cwd(), inputArg) : DEFAULT_INPUT;
const importedAt = new Date().toISOString();

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

// --dry-runでもここで打ち切らず、以降のmerge/replaceシミュレーションを実行し
// 「実際に書き込んだ場合どうなるか」（追加/重複/conflict件数）まで表示する
// （書き込み自体は各分岐内のif (!dryRun)でスキップする）。

fs.mkdirSync(HORSES_DIR, { recursive: true });

// CSVから取り込んだ行に importedAt を付与する（dataKindはbuildImportResult内で"real"固定済み）
const incomingByHorseId: Record<string, RaceHistoryRawInput[]> = {};
for (const horseId of horseIds) {
  incomingByHorseId[horseId] = result.byHorseId[horseId].map((race) => ({ ...race, importedAt }));
}

let hadConflict = false;

if (replaceMode) {
  console.log("\n--replace が指定されたため、まるごと置き換え方式で書き込みます（既存の過去走は保持されません）。");
  for (const horseId of horseIds) {
    const filePath = path.join(HORSES_DIR, `${horseId}.json`);
    const newRaces = incomingByHorseId[horseId];

    if (fs.existsSync(filePath)) {
      const existingRaces = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(existingRaces) && existingRaces.length > newRaces.length) {
        console.log(
          `警告: ${path.relative(ROOT, filePath)} は既存${existingRaces.length}走 → 新規${newRaces.length}走（--replaceのため置き換えられます）`,
        );
      }
    }

    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(newRaces, null, 2) + "\n");
    }
    console.log(`${dryRun ? "(dry-run) " : ""}書き込み: ${path.relative(ROOT, filePath)} (${newRaces.length}走)`);
  }
} else {
  console.log("\nMerge / Upsert方式で取り込みます（既存の過去走は削除されません）。");
  for (const horseId of horseIds) {
    const filePath = path.join(HORSES_DIR, `${horseId}.json`);
    const existingRaces: RaceHistoryRawInput[] = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : [];
    const incomingRaces = incomingByHorseId[horseId];

    const mergeResult = mergeHorseRaceHistory(existingRaces, incomingRaces);

    console.log(`\n${horseId}:`);
    console.log(`  既存: ${existingRaces.length}走 / 新規追加: ${mergeResult.addedRaceIds.length}走`);
    if (mergeResult.duplicateRaceIds.length > 0) {
      console.log(`  重複import（無視、実害なし）: ${mergeResult.duplicateRaceIds.join(", ")}`);
    }
    if (mergeResult.conflicts.length > 0) {
      hadConflict = true;
      console.log(`  conflict検出（${mergeResult.conflicts.length}件、このファイルへの書き込みをスキップします）:`);
      for (const conflict of mergeResult.conflicts) {
        console.log(`    raceId=${conflict.raceId}:`);
        for (const diff of conflict.differences) {
          console.log(`      ${diff.field}: 既存=${JSON.stringify(diff.existingValue)} / 新規=${JSON.stringify(diff.incomingValue)}`);
        }
      }
      continue; // このhorseIdはconflictがあるため書き込まない（既存ファイルは無変更のまま）
    }

    if (mergeResult.addedRaceIds.length === 0) {
      console.log("  変更なし（新規raceは無く、書き込みをスキップします）");
      continue;
    }

    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(mergeResult.merged, null, 2) + "\n");
    }
    console.log(`  ${dryRun ? "(dry-run) " : ""}書き込み: ${path.relative(ROOT, filePath)} (計${mergeResult.merged.length}走)`);
  }
}

console.log("\n次に `npm run validate:data` と `npm test` で確認してください。");
if (hadConflict) {
  console.log("\nconflictが検出されたため、該当馬のファイルは書き込まれていません。上記の差分を確認し、CSV側を修正してから再実行してください。");
}
process.exit(result.errorCount > 0 || hadConflict ? 1 : 0);

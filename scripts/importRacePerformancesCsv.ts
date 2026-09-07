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
 * 【CHECKPOINT13.2B: --replaceはlegacy/destructive操作】
 * --replace を付けると、CHECKPOINT13.1以前と同じ「まるごと置き換え」方式に戻せるが、
 * これは破壊的操作（既存の過去走が消える）であり、正式運用では使用しない方針とする。
 * 意図的な一括修正が必要な限定的な場面のみに留め、通常のRace Card Input Bridge
 * （scripts/raceCardCheck.ts）や通常のCSV取り込みフローからは呼び出さない
 * （実際、raceCardCheck.tsはこのファイルを一切importしていない＝呼び出しようがない）。
 * 実行時には警告banner付きでその旨を表示する。
 *
 * horseIdの差し替え（CHECKPOINT13.4Dで挙動変更・オプトイン化）:
 * CSVのhorseIdがJRA公式IDなど、既存ロスター（src/simulation/data/sapporoKinen.json）の
 * 内部horseIdと異なっていても、馬名が一致すればロスター側のhorseIdへ差し替える機能が
 * ある（詳細は src/ability/import/horseIdAliases.ts）。
 *
 * 【重要・CHECKPOINT13.4C/13.4Dで修正】これは元々「ロースター上の対象馬自身の
 * 過去走CSV（外部ID体系）を、既存プロフィールへ接続する」ための機構であり、
 * デフォルトでは適用しない。--alias-roster-names を明示的に付けた場合のみ有効になる。
 * 通常のCSV取り込み（対戦馬データ等、対象レースの実際の出走馬データ）では、
 * horseNameが偶然ロースターの馬名と一致するだけで、無関係な対戦馬のデータが
 * ロースターの（架空のことがある）canonical horseIdへ誤って混入するのを防ぐため。
 * CSVのhorseId列は、それ自体が既にcanonical horseIdとして安全に使える前提とする。
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
// CHECKPOINT13.4D: ロースター馬名エイリアスはデフォルトOFF。
// 対象馬自身の外部ID体系CSVを既存プロフィールへ接続する場合のみ明示的に付ける。
const aliasRosterNames = args.includes("--alias-roster-names");
const inputArg = args.find((a) => !a.startsWith("--"));
const inputPath = inputArg ? path.resolve(process.cwd(), inputArg) : DEFAULT_INPUT;
const importedAt = new Date().toISOString();

if (!fs.existsSync(inputPath)) {
  console.error(`入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

// CHECKPOINT13.2B STEP14: --replaceはlegacy/destructive操作として明示する。
// 正式運用（Race Card Input Bridge経由の通常フロー含む）はMerge/Upsert（デフォルト）のみを使い、
// --replaceを内部から呼び出すことは無い（raceCardCheck.ts等、このスクリプト以外の
// どのファイルもimportRacePerformancesCsv.tsを呼び出していない＝呼び出しようがない）。
if (replaceMode) {
  console.warn(
    "\n" +
      "!!! 警告: --replace は破壊的なlegacy操作です !!!\n" +
      "既存の過去走履歴を丸ごと置き換えます（Merge/Upsertと違い、CSVに含まれない既存raceは消えます）。\n" +
      "正式運用（Race Card Input Bridge・通常のCSV取り込みフロー）ではMerge/Upsert（デフォルト、\n" +
      "--replaceを付けない）を使ってください。--replaceは意図的な一括修正が必要な限定的な場面のみ" +
      (dryRun ? "（今回は--dry-runのため実際の書き込みはありません）" : "") +
      "。\n",
  );
}

const csvText = fs.readFileSync(inputPath, "utf-8");
const horseIdAliasesByName = aliasRosterNames ? buildHorseIdAliasesByName(rawSapporoKinen.horses) : {};
if (aliasRosterNames) {
  console.log(
    "\n--alias-roster-names が指定されたため、CSVのhorseNameがロースター16頭のいずれかと一致する行は、\n" +
      "そのロースターのcanonical horseIdへ差し替えて取り込みます（対象馬自身のCSVを接続する場合のみ使用）。\n",
  );
}
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

  // CHECKPOINT14A.2 12節: dry-runでも全馬横断の集計（rows parsed/new race records/
  // exact duplicates/enrichment candidates/enriched fields/conflicts/errors）を確認できるようにする
  let totalAdded = 0;
  let totalDuplicate = 0;
  let totalEnrichedRecords = 0;
  let totalEnrichedFields = 0;
  let totalConflicts = 0;
  const mergeResultsByHorseId: Record<string, ReturnType<typeof mergeHorseRaceHistory>> = {};
  for (const horseId of horseIds) {
    const filePath = path.join(HORSES_DIR, `${horseId}.json`);
    const existingRaces: RaceHistoryRawInput[] = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : [];
    const mergeResult = mergeHorseRaceHistory(existingRaces, incomingByHorseId[horseId]);
    mergeResultsByHorseId[horseId] = mergeResult;
    totalAdded += mergeResult.addedRaceIds.length;
    totalDuplicate += mergeResult.duplicateRaceIds.length;
    totalEnrichedRecords += mergeResult.enriched.length;
    totalEnrichedFields += mergeResult.enriched.reduce((sum, e) => sum + e.enrichedFields.length, 0);
    totalConflicts += mergeResult.conflicts.length;
  }
  console.log("\n=== Dry Run Summary（全馬横断集計） ===");
  console.log(`  rows parsed: ${result.totalRows}`);
  console.log(`  new race records: ${totalAdded}`);
  console.log(`  exact duplicates: ${totalDuplicate}`);
  console.log(`  enrichment candidates（record数）: ${totalEnrichedRecords}`);
  console.log(`  enriched fields（延べfield数）: ${totalEnrichedFields}`);
  console.log(`  conflicts: ${totalConflicts}`);
  console.log(`  errors: ${result.errorCount}`);

  for (const horseId of horseIds) {
    const filePath = path.join(HORSES_DIR, `${horseId}.json`);
    const existingRaces: RaceHistoryRawInput[] = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : [];
    const mergeResult = mergeResultsByHorseId[horseId];

    console.log(`\n${horseId}:`);
    console.log(`  既存: ${existingRaces.length}走 / 新規追加: ${mergeResult.addedRaceIds.length}走`);
    if (mergeResult.duplicateRaceIds.length > 0) {
      console.log(`  重複import（無視、実害なし）: ${mergeResult.duplicateRaceIds.join(", ")}`);
    }
    if (mergeResult.enriched.length > 0) {
      console.log(`  enrichment候補（既存recordのoptional fieldをnull→populatedへ安全に補完）: ${mergeResult.enriched.length}件`);
      for (const e of mergeResult.enriched) {
        console.log(`    raceId=${e.raceId}: ${e.enrichedFields.join(", ")}`);
      }
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
      continue; // このhorseIdはconflictがあるため書き込まない（既存ファイルは無変更のまま、enrichmentも含め一切適用しない）
    }

    if (mergeResult.addedRaceIds.length === 0 && mergeResult.enriched.length === 0) {
      console.log("  変更なし（新規raceもenrichmentも無く、書き込みをスキップします）");
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

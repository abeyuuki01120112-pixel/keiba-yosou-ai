/**
 * Provisional Runner Resolve / Data Gap Audit のCLI（CHECKPOINT13.3）。
 *
 * 正式枠順・馬場・オッズが未確定な「登録段階」の出走予定馬一覧（JSON）を読み込み、
 * Runner Resolver → Prediction Eligibility → Base Ability診断 →
 * Missing Data Report → DATA REQUEST MANIFEST まで通した結果を表示する。
 *
 * 【重要】このCLIは data/horses/ を一切書き込まない（読み取り専用）。
 * 出力は常にPROVISIONAL・DIAGNOSTIC（正式Stage A/Prediction Snapshotではない）。
 *
 * 使い方:
 *   npm run provisional:check -- path/to/registered-runners.json
 *
 * 入力JSON形式は src/ability/data/provisional/niigata-kinen-2026-registered.json
 * を参照。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDataRequestManifest,
  formatProvisionalDiagnosticReport,
  runProvisionalDiagnostic,
  type ProvisionalRaceTarget,
  type ProvisionalRegisteredRunner,
} from "../src/ability/import/provisionalRunnerDiagnostic";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const inputArg = args.find((a) => !a.startsWith("--"));

if (!inputArg) {
  console.error("使い方: npm run provisional:check -- path/to/registered-runners.json");
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(`入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

interface InputFile {
  raceLabel: string;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string | null;
  runners: ProvisionalRegisteredRunner[];
}

const input = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as InputFile;
console.log(`入力: ${path.relative(ROOT, inputPath)}`);
console.log("");

const raceTarget: ProvisionalRaceTarget = {
  raceLabel: input.raceLabel,
  racecourse: input.racecourse,
  surface: input.surface,
  distance: input.distance,
  going: input.going,
};

const result = runProvisionalDiagnostic(input.runners, raceTarget);

console.log(formatProvisionalDiagnosticReport(result));

const manifest = buildDataRequestManifest(result);
if (manifest.length > 0) {
  console.log("\n=== DATA REQUEST MANIFEST ===");
  for (const entry of manifest) {
    console.log(`\n${entry.horseName} (sourceHorseId: ${entry.sourceHorseId})`);
    console.log("requiredRaces:");
    for (const r of entry.requiredRaces) console.log(`  - ${r}`);
    console.log("requiredFields:");
    for (const f of entry.requiredFields) console.log(`  - ${f}`);
    console.log(`note: ${entry.note}`);
  }
} else {
  console.log("\n=== DATA REQUEST MANIFEST ===\n不足データはありません（全馬predictionEligible=true）。");
}

console.log("\n(このCLIはdata/horses/を一切書き込んでいません。出力は常にPROVISIONAL・DIAGNOSTICであり、正式Stage A/Prediction Snapshotではありません。)");
process.exit(0);

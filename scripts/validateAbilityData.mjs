#!/usr/bin/env node
/**
 * data/horses/*.json・courseTimeBaselines.json・courseFinal3FBaselines.json の
 * 構造を検証するスクリプト。実データを手動で差し替えた後、必ずこれを実行してから
 * `npm test` / `npm run dev` に進むことを想定している（詳細は docs/data-input-guide.md）。
 *
 * 使い方:
 *   npm run validate:data
 *
 * 終了コード: エラーが1件でもあれば1、無ければ0（警告のみなら0）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SIMULATION_HORSES_PATH = path.join(ROOT, "src/simulation/data/sapporoKinen.json");
const HORSES_DIR = path.join(ROOT, "src/ability/data/horses");
const COURSE_TIME_BASELINES_PATH = path.join(ROOT, "src/ability/data/courseTimeBaselines.json");
const COURSE_FINAL3F_BASELINES_PATH = path.join(ROOT, "src/ability/data/courseFinal3FBaselines.json");

const errors = [];
const warnings = [];

function error(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    error(`${path.relative(ROOT, filePath)}: JSONとして読み込めません (${e.message})`);
    return null;
  }
}

// --- RacePerformance（1走）の生データスキーマ ---
// raceHistoryPipeline.ts の RaceHistoryRawInput と一致させること
const RACE_FIELDS = {
  raceId: { type: "string", nonEmpty: true },
  raceName: { type: "string", nonEmpty: true },
  raceDate: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/, patternHint: "YYYY-MM-DD" },
  racecourse: { type: "string", nonEmpty: true },
  surface: { type: "string", oneOf: ["turf", "dirt"] },
  distance: { type: "number", positive: true },
  going: { type: "string", nonEmpty: true },
  finishPosition: { type: "number", positiveInteger: true },
  timeGap: { type: "number" },
  raceTime: { type: "number", positive: true },
  final3F: { type: "number", positive: true },
  carriedWeight: { type: "number", positive: true },
};

const BASELINE_COMMON_FIELDS = {
  racecourse: { type: "string", nonEmpty: true },
  surface: { type: "string", oneOf: ["turf", "dirt"] },
  distance: { type: "number", positive: true },
  going: { type: "string", nonEmpty: true },
  sampleYears: { type: "number", positive: true },
  sampleCount: { type: "number", positive: true },
  source: { type: "string", nonEmpty: true },
};

function validateField(value, spec, label) {
  if (value === undefined) {
    error(`${label}: フィールドがありません`);
    return;
  }
  if (spec.type === "string" && typeof value !== "string") {
    error(`${label}: 文字列である必要があります（実際: ${typeof value}）`);
    return;
  }
  if (spec.type === "number" && typeof value !== "number") {
    error(`${label}: 数値である必要があります（実際: ${typeof value}）`);
    return;
  }
  if (spec.type === "number" && !Number.isFinite(value)) {
    error(`${label}: 有限の数値である必要があります（実際: ${value}）`);
    return;
  }
  if (spec.nonEmpty && value.trim() === "") {
    error(`${label}: 空文字は不可です`);
  }
  if (spec.pattern && !spec.pattern.test(value)) {
    error(`${label}: 形式が不正です（期待: ${spec.patternHint}, 実際: "${value}"）`);
  }
  if (spec.oneOf && !spec.oneOf.includes(value)) {
    error(`${label}: "${value}" は許可された値ではありません（許可: ${spec.oneOf.join(" / ")}）`);
  }
  if (spec.positive && typeof value === "number" && value <= 0) {
    error(`${label}: 正の値である必要があります（実際: ${value}）`);
  }
  if (spec.positiveInteger) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      error(`${label}: 1以上の整数である必要があります（実際: ${value}）`);
    }
  }
}

function validateRecord(record, fields, label) {
  if (typeof record !== "object" || record === null) {
    error(`${label}: オブジェクトではありません`);
    return;
  }
  for (const [key, spec] of Object.entries(fields)) {
    validateField(record[key], spec, `${label}.${key}`);
  }
  const knownKeys = new Set(Object.keys(fields));
  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key)) {
      warn(`${label}: 未知のフィールド "${key}" があります（無視されます）`);
    }
  }
}

// --- 1. simulation側の出走馬一覧を読み込む ---
const simData = readJson(SIMULATION_HORSES_PATH);
const simHorseIds = new Set();
if (simData) {
  if (!Array.isArray(simData.horses)) {
    error(`${path.relative(ROOT, SIMULATION_HORSES_PATH)}: "horses" 配列がありません`);
  } else {
    for (const h of simData.horses) {
      if (!h.horseId) {
        error(`${path.relative(ROOT, SIMULATION_HORSES_PATH)}: horseId の無い馬がいます (${h.horseName ?? "?"})`);
        continue;
      }
      simHorseIds.add(h.horseId);
    }
  }
}

// --- 2. data/horses/*.json を読み込んで検証 ---
const raceFieldConditions = new Map(); // key: racecourse|surface|distance|going -> true
const horseDataIds = new Set();
const allRaceIds = new Set(); // raceFieldAggregatesの整合性チェック用（全馬横断）

if (!fs.existsSync(HORSES_DIR)) {
  error(`${path.relative(ROOT, HORSES_DIR)} が存在しません`);
} else {
  const files = fs.readdirSync(HORSES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    warn(`${path.relative(ROOT, HORSES_DIR)} にファイルがありません`);
  }
  for (const file of files) {
    const horseId = file.replace(/\.json$/, "");
    horseDataIds.add(horseId);
    const filePath = path.join(HORSES_DIR, file);
    const races = readJson(filePath);
    if (races === null) continue;

    if (!Array.isArray(races)) {
      error(`${path.relative(ROOT, filePath)}: 配列である必要があります`);
      continue;
    }
    if (races.length === 0) {
      warn(`${path.relative(ROOT, filePath)}: レースが0件です`);
    }

    const seenRaceIds = new Set();
    races.forEach((race, idx) => {
      const label = `${horseId}[${idx}]`;
      validateRecord(race, RACE_FIELDS, label);

      if (typeof race.raceId === "string") {
        if (seenRaceIds.has(race.raceId)) {
          error(`${label}: raceId "${race.raceId}" がこの馬の中で重複しています`);
        }
        seenRaceIds.add(race.raceId);
        allRaceIds.add(race.raceId);
      }
      if (typeof race.raceDate === "string" && Number.isNaN(Date.parse(race.raceDate))) {
        error(`${label}: raceDate "${race.raceDate}" を日付として解釈できません`);
      }
      if (race.racecourse && race.surface && race.distance && race.going) {
        const key = `${race.racecourse}|${race.surface}|${race.distance}|${race.going}`;
        raceFieldConditions.set(key, {
          racecourse: race.racecourse,
          surface: race.surface,
          distance: race.distance,
          going: race.going,
        });
      }
    });
  }
}

// --- 3. horseId の整合性チェック（simulation側 <-> ability側） ---
for (const id of simHorseIds) {
  if (!horseDataIds.has(id)) {
    warn(`horseId "${id}" は simulation/data/sapporoKinen.json にありますが、data/horses/${id}.json がありません（基礎能力が空になります）`);
  }
}
for (const id of horseDataIds) {
  if (!simHorseIds.has(id)) {
    warn(`horseId "${id}" は data/horses/ にありますが、simulation/data/sapporoKinen.json にありません（馬詳細画面から参照できません）`);
  }
}

// --- 4. 基準タイム系ファイルの検証 ---
function validateBaselineFile(filePath, valueField, label) {
  const data = readJson(filePath);
  if (data === null) return null;
  if (!Array.isArray(data.baselines)) {
    error(`${path.relative(ROOT, filePath)}: "baselines" 配列がありません`);
    return null;
  }
  const seenKeys = new Set();
  data.baselines.forEach((b, idx) => {
    const fields = { ...BASELINE_COMMON_FIELDS, [valueField]: { type: "number", positive: true } };
    validateRecord(b, fields, `${label}[${idx}]`);
    if (b.racecourse && b.surface && b.distance && b.going) {
      const key = `${b.racecourse}|${b.surface}|${b.distance}|${b.going}`;
      if (seenKeys.has(key)) {
        error(`${label}[${idx}]: 条件 (${key}) の基準が重複しています`);
      }
      seenKeys.add(key);
    }
  });
  return data.baselines;
}

const timeBaselines = validateBaselineFile(COURSE_TIME_BASELINES_PATH, "medianTimeSeconds", "courseTimeBaselines");
const final3FBaselines = validateBaselineFile(
  COURSE_FINAL3F_BASELINES_PATH,
  "medianFinal3FSeconds",
  "courseFinal3FBaselines",
);

// --- 4-2. raceFieldAggregates.json の検証（第11実装：ロスター外対戦馬の集団統計上書き） ---
const RACE_FIELD_AGGREGATE_PATH = path.join(ROOT, "src/ability/data/raceFieldAggregates.json");
const RACE_FIELD_AGGREGATE_FIELDS = {
  raceId: { type: "string", nonEmpty: true },
  fieldCount: { type: "number", positiveInteger: true },
  raceMedianWeightKg: { type: "number", positive: true },
  raceMedianFinal3FSeconds: { type: "number", positive: true },
  source: { type: "string", nonEmpty: true },
};

if (fs.existsSync(RACE_FIELD_AGGREGATE_PATH)) {
  const data = readJson(RACE_FIELD_AGGREGATE_PATH);
  if (data !== null) {
    if (!Array.isArray(data.aggregates)) {
      error(`${path.relative(ROOT, RACE_FIELD_AGGREGATE_PATH)}: "aggregates" 配列がありません`);
    } else {
      const seenRaceIds = new Set();
      data.aggregates.forEach((a, idx) => {
        const label = `raceFieldAggregates[${idx}]`;
        validateRecord(a, RACE_FIELD_AGGREGATE_FIELDS, label);
        if (typeof a.raceId === "string") {
          if (seenRaceIds.has(a.raceId)) {
            error(`${label}: raceId "${a.raceId}" が重複しています`);
          }
          seenRaceIds.add(a.raceId);
          if (!allRaceIds.has(a.raceId)) {
            warn(`${label}: raceId "${a.raceId}" はdata/horses/内のどの馬の実績にも存在しません（上書きが適用されません）`);
          }
        }
      });
    }
  }
}

// --- 5. カバレッジ情報（実際のレース条件に対して基準タイムがあるか。無くても壊れないが情報として出す） ---
function hasBaseline(baselines, condition) {
  if (!baselines) return false;
  return baselines.some(
    (b) =>
      b.racecourse === condition.racecourse &&
      b.surface === condition.surface &&
      b.distance === condition.distance &&
      b.going === condition.going,
  );
}

let missingTimeBaselineCount = 0;
let missingFinal3FBaselineCount = 0;
for (const condition of raceFieldConditions.values()) {
  if (!hasBaseline(timeBaselines, condition)) missingTimeBaselineCount++;
  if (!hasBaseline(final3FBaselines, condition)) missingFinal3FBaselineCount++;
}
if (missingTimeBaselineCount > 0) {
  warn(
    `${missingTimeBaselineCount}/${raceFieldConditions.size} 条件に courseTimeBaselines の基準が無く、raceTimeScoreは中立値(70点)にフォールバックします`,
  );
}
if (missingFinal3FBaselineCount > 0) {
  warn(
    `${missingFinal3FBaselineCount}/${raceFieldConditions.size} 条件に courseFinal3FBaselines の基準が無く、final3FScoreはレース内相対評価100%にフォールバックします`,
  );
}

// --- レポート出力 ---
console.log(`検証対象: 馬${horseDataIds.size}頭, レース条件${raceFieldConditions.size}種類`);
console.log("");

if (warnings.length > 0) {
  console.log(`警告 ${warnings.length}件:`);
  for (const w of warnings) console.log(`  - ${w}`);
  console.log("");
}

if (errors.length > 0) {
  console.log(`エラー ${errors.length}件:`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log("");
  console.log("検証失敗。上記エラーを修正してください。");
  process.exit(1);
}

console.log("検証成功（エラーなし）。");
process.exit(0);

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
  // 枠番・馬番・出走頭数（CHECKPOINT9で追加）。CourseContextPrior検証用の参考データであり、
  // baseAbility/raceScore/memberLevelの計算には使わない。フィールド自体が無い（optional）
  // 場合も、値がある場合はnullも許容する（不明を推測で埋めないため）。
  gate: { type: "number", optional: true, nullable: true, positiveInteger: true },
  horseNumber: { type: "number", optional: true, nullable: true, positiveInteger: true },
  fieldSize: { type: "number", optional: true, nullable: true, positiveInteger: true },
  // レース番号（第26実装で追加済みだがこのスキーマには未登録だったため、CHECKPOINT13.2で追加）。
  // ability計算には使わない。
  raceNumber: { type: "number", optional: true, nullable: true, positiveInteger: true },
  // データ出所・監査用メタデータ（CHECKPOINT13.2で追加）。いずれもability計算には使わない。
  source: { type: "string", optional: true, nullable: true },
  sourceRaceId: { type: "string", optional: true, nullable: true },
  sourceHorseId: { type: "string", optional: true, nullable: true },
  importedAt: { type: "string", optional: true, nullable: true },
  // データ種別（CHECKPOINT13.2 Placeholder隔離）。未記載は"real"として扱われる（後方互換）。
  dataKind: { type: "string", optional: true, nullable: true, oneOf: ["real", "placeholder", "fixture"] },
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
    if (spec.optional) return;
    error(`${label}: フィールドがありません`);
    return;
  }
  if (value === null) {
    if (spec.nullable) return;
    error(`${label}: nullは許可されていません`);
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

// CHECKPOINT12.6: raceId単位で「比較母集団（同一レースを共有する他馬データ）が
// 十分に揃っているか」を機械判定するための集計。raceScore算出時にfinal3FScore・
// weightScore・memberLevel・raceTimeScoreが必要とする同一レース比較母集団
// （buildRaceHistory()のgroup）の完全性を、実際にロードされたhorseId数・
// fieldSize・finishPosition=1(勝ち馬)の有無から推定する。数式は一切変更せず、
// あくまで「不完全な比較母集団で誤った検証をしていないか」を警告するのみ。
const raceGroupInfoByRaceId = new Map(); // raceId -> { horseIds: Set, maxFieldSize: number|null, hasWinner: boolean }

function recordRaceGroupInfo(raceId, horseId, fieldSize, finishPosition) {
  let info = raceGroupInfoByRaceId.get(raceId);
  if (!info) {
    info = { horseIds: new Set(), maxFieldSize: null, hasWinner: false };
    raceGroupInfoByRaceId.set(raceId, info);
  }
  info.horseIds.add(horseId);
  if (typeof fieldSize === "number" && (info.maxFieldSize === null || fieldSize > info.maxFieldSize)) {
    info.maxFieldSize = fieldSize;
  }
  if (finishPosition === 1) {
    info.hasWinner = true;
  }
}

// CHECKPOINT13.2 D: raceIdMismatch。同一raceIdなのに馬ごとにracecourse/surface/
// distance/going/raceDateが食い違っていないかを検出する（本来同じ実レースを指す
// はずのraceIdが、実は別々のレースを指してしまっている可能性の検知）。
const raceMetaByRaceId = new Map(); // raceId -> { key: string, sample: {...}, horseIds: Set }

function raceMetaKey(race) {
  return `${race.racecourse}|${race.surface}|${race.distance}|${race.going}|${race.raceDate}`;
}

function recordRaceMeta(raceId, horseId, race) {
  const key = raceMetaKey(race);
  let entry = raceMetaByRaceId.get(raceId);
  if (!entry) {
    entry = { variants: new Map(), horseIds: new Set() };
    raceMetaByRaceId.set(raceId, entry);
  }
  entry.horseIds.add(horseId);
  if (!entry.variants.has(key)) {
    entry.variants.set(key, { racecourse: race.racecourse, surface: race.surface, distance: race.distance, going: race.going, raceDate: race.raceDate, horseIds: [] });
  }
  entry.variants.get(key).horseIds.push(horseId);
}

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
        recordRaceGroupInfo(
          race.raceId,
          horseId,
          typeof race.fieldSize === "number" ? race.fieldSize : null,
          typeof race.finishPosition === "number" ? race.finishPosition : null,
        );
        if (race.racecourse && race.surface && race.distance && race.going && race.raceDate) {
          recordRaceMeta(race.raceId, horseId, race);
        }
      }
      if (typeof race.raceDate === "string" && Number.isNaN(Date.parse(race.raceDate))) {
        error(`${label}: raceDate "${race.raceDate}" を日付として解釈できません`);
      }
      // horseNumber > fieldSize は除外・取消・中止馬がいた実レースでも起こりうる正当なケース
      // （馬番は除外後も詰め直されないため）。誤りとは断定せず、勝手に補正もせず警告のみ出す。
      if (
        typeof race.horseNumber === "number" &&
        typeof race.fieldSize === "number" &&
        race.horseNumber > race.fieldSize
      ) {
        warn(
          `${label}: horseNumber(${race.horseNumber})がfieldSize(${race.fieldSize})を超えています` +
            `（除外・取消・中止馬がいたレースで起こりうる正当なケースの可能性があります。relativeGatePositionはnullとして扱われます）`,
        );
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

const raceFieldAggregateRaceIds = new Set(); // CHECKPOINT12.6: 4-3で「上書き済みraceId」の除外に使う

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
          raceFieldAggregateRaceIds.add(a.raceId);
          if (!allRaceIds.has(a.raceId)) {
            warn(`${label}: raceId "${a.raceId}" はdata/horses/内のどの馬の実績にも存在しません（上書きが適用されません）`);
          }
        }
      });
    }
  }
}

// --- 4-3. 比較母集団の完全性チェック（CHECKPOINT12.6）---
// raceScore算出時、final3FScore・weightScore・memberLevelは「同一raceIdを共有する
// 実データ」を比較母集団として使う（raceHistoryPipeline.ts の group）。
// raceFieldAggregatesByRaceId による上書きが無いraceIdについて、
// 「data/horses/内で実際にロードされている頭数」がfieldSizeより少ない場合、
// final3FScore/weightScore/memberLevelが自己参照的に中立化する（自分自身との
// 比較になり、relativeDiffSeconds=0等の見かけ上妥当だが誤った値になる）リスクが
// ある。除外・取消・中止による正当な差分もあり得るため、エラーではなく警告のみ
// とする（CHECKPOINT12.5 STEP9の採用、CHECKPOINT12.6 STEP3）。
//
// また、raceTimeScoreは「そのレースの勝ち馬(finishPosition=1)のraceTime」を
// 基準タイムとして使う（raceHistoryPipeline.ts の buildRaceHistory 内、
// `group.find((e) => e.raw.finishPosition === 1) ?? group[0]`）。ロードされた
// データの中に勝ち馬が1件も無い場合、暗黙に別の馬（group[0]）のタイムが
// 「勝ち馬タイム」として扱われてしまい、final3F/weightの自己参照よりも
// 気づきにくい形でraceTimeScoreが汚染されるおそれがある。これを検知するため
// 勝ち馬の有無も別途チェックする。
for (const [raceId, info] of raceGroupInfoByRaceId.entries()) {
  if (raceFieldAggregateRaceIds.has(raceId)) {
    // raceFieldAggregatesで実データの中央値に上書き済みのため、
    // final3FScore/weightScoreの自己参照中央値リスクは既に回避されている。
    continue;
  }
  const loadedCount = info.horseIds.size;
  if (info.maxFieldSize !== null && loadedCount < info.maxFieldSize) {
    warn(
      `raceId "${raceId}": data/horses/内で実際にロードされている頭数(${loadedCount})が` +
        `fieldSize(${info.maxFieldSize})より少ない可能性があります` +
        `（除外・取消・中止馬がいた場合の正当な差の可能性もあります）。` +
        `final3FScore/weightScore/memberLevelの比較母集団が不足し、自己参照的に` +
        `中立化するリスクがあります。raceFieldAggregates.jsonでの実データ中央値上書きを検討してください。`,
    );
  }
  if (!info.hasWinner) {
    warn(
      `raceId "${raceId}": finishPosition=1（勝ち馬）のデータがdata/horses/内に見当たりません。` +
        `raceTimeScoreの基準タイムには本来の勝ち馬ではない馬のraceTimeが使われている可能性があります。`,
    );
  }
}

// --- 4-4. raceIdMismatch（CHECKPOINT13.2 D）---
// 同一raceIdのはずなのに、馬ごとにracecourse/surface/distance/going/raceDateが
// 食い違っている場合、そのraceIdが実は別々のレースを指してしまっている可能性がある
// （複数Sourceの統合時や、raceIdの手打ちミス等で起こりうる）。
for (const [raceId, entry] of raceMetaByRaceId.entries()) {
  if (entry.variants.size <= 1) continue;
  const variantSummaries = [...entry.variants.values()].map(
    (v) => `[${v.racecourse}/${v.surface}/${v.distance}m/${v.going}/${v.raceDate}] (${v.horseIds.join(", ")})`,
  );
  warn(
    `raceId "${raceId}": 同一raceIdなのにracecourse/surface/distance/going/raceDateが` +
      `馬によって食い違っています（raceIdMismatchの可能性）。内訳: ${variantSummaries.join(" / ")}`,
  );
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

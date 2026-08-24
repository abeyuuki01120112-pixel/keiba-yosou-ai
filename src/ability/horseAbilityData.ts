/**
 * 馬の直近5走データのロード。
 *
 * data/horses/<horseId>.json（1頭1ファイル。実績の生データのみ。memberLevelScore・
 * raceTimeScore・final3FScore・weightScoreは含まない）と、
 * data/courseTimeBaselines.json（過去5年基準タイム）、
 * data/courseFinal3FBaselines.json（過去5年上がり3F基準）、
 * data/raceFieldAggregates.json（ロスター外の対戦馬を含む、レース単位の
 * raceMedianWeightKg/raceMedianFinal3FSecondsの実データ上書き。第11実装）から、
 * raceHistoryPipeline.buildRaceHistory() で、実質メンバーレベル・走破タイムスコア・
 * 上がり3Fスコア・斤量補正スコア込みの timeGapScore・raceScoreを一括計算し、
 * buildHorseAbilityProfile() で baseAbility を算出する。
 *
 * 実データを投入する場合は data/horses/ 配下の対象馬のJSONファイルを差し替えるだけでよい
 * （馬を追加する場合は新しいファイルを置くだけで自動的に読み込まれる）。
 * 手順の詳細は docs/data-input-guide.md を参照。データを差し替えたら
 * `npm run validate:data` で構造チェックできる。
 */

import rawCourseTimeBaselines from "./data/courseTimeBaselines.json";
import rawCourseFinal3FBaselines from "./data/courseFinal3FBaselines.json";
import rawRaceFieldAggregates from "./data/raceFieldAggregates.json";
import rawCareerCounts from "./data/careerCounts.json";
import { loadDefaultHorses } from "../simulation/horseData";
import { buildHorseAbilityProfile } from "./buildHorseAbilityProfile";
import { buildRaceHistory, type RaceHistoryRawInput } from "./raceHistoryPipeline";
import { computeDatasetVersionInfo, type DatasetVersionInfo } from "./datasetVersion";
import type { CareerCountRecord } from "./abilityEvidence";
import type {
  CourseFinal3FBaseline,
  CourseTimeBaseline,
  HorseAbilityProfile,
  RaceFieldAggregate,
  RacePerformance,
} from "./types";

type RawData = Record<string, RaceHistoryRawInput[]>;

// data/horses/*.json を1頭1ファイルとしてまとめて読み込む。
// ファイルを追加/削除するだけで対象馬が増減する（コード変更不要）。
const horseFileModules = import.meta.glob<RaceHistoryRawInput[]>("./data/horses/*.json", {
  eager: true,
  import: "default",
});

const typedRawData: RawData = {};
for (const [filePath, races] of Object.entries(horseFileModules)) {
  const horseId = filePath.replace(/^.*\//, "").replace(/\.json$/, "");
  typedRawData[horseId] = races;
}

const typedTimeBaselines = rawCourseTimeBaselines.baselines as unknown as CourseTimeBaseline[];
const typedFinal3FBaselines = rawCourseFinal3FBaselines.baselines as unknown as CourseFinal3FBaseline[];
const typedRaceFieldAggregates = rawRaceFieldAggregates.aggregates as unknown as RaceFieldAggregate[];
const raceFieldAggregatesByRaceId: Record<string, RaceFieldAggregate> = {};
for (const aggregate of typedRaceFieldAggregates) {
  raceFieldAggregatesByRaceId[aggregate.raceId] = aggregate;
}

// モジュール読み込み時に一度だけ全馬横断でパイプラインを実行する
const historyByHorseId = buildRaceHistory(
  typedRawData,
  typedTimeBaselines,
  typedFinal3FBaselines,
  raceFieldAggregatesByRaceId,
);

export function loadHorseAbilityProfile(horseId: string): HorseAbilityProfile | undefined {
  const horse = loadDefaultHorses().find((h) => h.horseId === horseId);
  if (!horse) return undefined;
  const recentRaces = historyByHorseId[horseId] ?? [];
  return buildHorseAbilityProfile(horseId, horse.horseName, recentRaces);
}

export function loadAllHorseAbilityProfiles(): HorseAbilityProfile[] {
  return loadDefaultHorses().map((h) => {
    const recentRaces = historyByHorseId[h.horseId] ?? [];
    return buildHorseAbilityProfile(h.horseId, h.horseName, recentRaces);
  });
}

/**
 * horseId単体の確定済みRacePerformance[]（新しい順）を返す（CHECKPOINT13で追加）。
 *
 * loadHorseAbilityProfile()と異なり、loadDefaultHorses()（simulation/data/sapporoKinen.json）
 * への登録有無を問わない。data/horses/にJSONファイルさえあれば、どのhorseIdでも
 * このモジュール読み込み時に一度だけ計算済みのhistoryByHorseId（data/horses/全体を
 * 投入したbuildRaceHistory()の結果、CHECKPOINT12.5/12.6で安全性を確認済みの正式経路）
 * から参照するだけであり、この関数自体がbuildRaceHistory()を部分データで
 * 再実行することは無い。
 */
export function getHorseRecentRaces(horseId: string): RacePerformance[] {
  return historyByHorseId[horseId] ?? [];
}

/**
 * data/horses/ に実在する全horseIdの一覧を返す（CHECKPOINT13.2Bで追加）。
 * canonicalHorseRegistry.ts が、24頭分の馬名をハードコードせず
 * data/horses/ から自動的にresolver indexを構築するために使う。
 */
export function getAllCanonicalHorseIds(): string[] {
  return Object.keys(historyByHorseId);
}

/**
 * 現在のdata/horses全体のmodelVersion/datasetFingerprintを返す（CHECKPOINT13.4Dで追加）。
 * Model Freeze（BA-V1の数式）とDataset Freeze（特定時点のdata/horsesスナップショット）を
 * 分離して追跡するための最小実装。Production Base Abilityの値を報告する際、
 * どのモデル・どのデータセットから算出されたかを明示するために使う。
 */
export function getProductionDatasetVersionInfo(): DatasetVersionInfo {
  return computeDatasetVersionInfo(typedRawData);
}

const typedCareerCounts = rawCareerCounts.records as unknown as (CareerCountRecord & { horseId: string })[];
const careerCountByHorseId: Record<string, CareerCountRecord> = {};
for (const record of typedCareerCounts) {
  const { horseId, ...rest } = record;
  careerCountByHorseId[horseId] = rest;
}

/**
 * source-backedなknownCareerRaceCountの記録を返す（CHECKPOINT13.4G、Short Career
 * Eligibility V1）。data/careerCounts.jsonに明示的に登録されていない馬はnullを返す
 * （data/horses内の記録走数から推測しない。絶対原則、CHECKPOINT13.4F 9節）。
 */
export function getCareerCountRecord(horseId: string): CareerCountRecord | null {
  return careerCountByHorseId[horseId] ?? null;
}

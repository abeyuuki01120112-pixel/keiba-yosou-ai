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

import { predictionTimestamp, isRaceDate, isPriorPerformance, isKnownByCutoff, type PredictionTarget } from "./predictionBoundary";
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

export type HorseHistoryRawData = Record<string, RaceHistoryRawInput[]>;

// data/horses/*.json を1頭1ファイルとしてまとめて読み込む。
// ファイルを追加/削除するだけで対象馬が増減する（コード変更不要）。
const horseFileModules = import.meta.glob<RaceHistoryRawInput[]>("./data/horses/*.json", {
  eager: true,
  import: "default",
});

const typedRawData: HorseHistoryRawData = {};
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
 * 予測専用の時点境界。対象馬だけで再計算せず、全馬の入力を先にcutoffで制限する。
 * 既存V1の数式・窓・比較母集団の組立て自体は変更しない。
 * 時刻メタデータのないlegacy基準値は同梱データ版として扱う。
 */
let predictionHistoryCache: { key: string; histories: Record<string, RacePerformance[]> } | undefined;

/**
 * Collector履歴との非破壊merge用に、production Horse Historyの生実績を返す。
 * 呼び出し側による配列の追加・削除がmodule内の正本へ波及しないよう配列を複製する。
 */
export function getProductionRawHorseHistories(): HorseHistoryRawData {
  return Object.fromEntries(Object.entries(typedRawData).map(([horseId, races]) => [horseId, [...races]]));
}

/**
 * 任意のcanonical horseId別生履歴を、既存V1の全馬横断pipelineで再計算する。
 * 保存件数は制限せず、対象レース自身・cutoff後・cutoff後に利用可能になった版だけを
 * 入力境界で除外する。直近5走の選択は後段のcalculateBaseAbility()だけが行う。
 */
export function buildHorseHistoriesAsOf(
  rawByHorseId: HorseHistoryRawData,
  target: PredictionTarget,
  cutoff: string,
): Record<string, RacePerformance[]> {
  predictionTimestamp(cutoff, "predictionCutoffAt");
  if (!isRaceDate(target.raceDate)) throw new Error("INVALID_RACE_DATE");
  const raw = Object.fromEntries(Object.entries(rawByHorseId).map(([id, races]) => [
    id, races.filter((r) => isPriorPerformance(r, target, cutoff)),
  ]));
  const aggregates = Object.fromEntries(Object.entries(raceFieldAggregatesByRaceId).filter(
    ([raceId, aggregate]) => raceId !== target.raceId && isKnownByCutoff(aggregate, cutoff),
  ));
  return buildRaceHistory(
    raw,
    typedTimeBaselines.filter((b) => isKnownByCutoff(b, cutoff)),
    typedFinal3FBaselines.filter((b) => isKnownByCutoff(b, cutoff)),
    aggregates,
  );
}

export function getHorseRecentRacesAsOf(horseId: string, target: PredictionTarget, cutoff: string): RacePerformance[] {
  predictionTimestamp(cutoff, "predictionCutoffAt");
  if (!isRaceDate(target.raceDate)) throw new Error("INVALID_RACE_DATE");
  const key = JSON.stringify([target.raceId, target.raceDate, cutoff]);
  if (predictionHistoryCache?.key !== key) {
    predictionHistoryCache = { key, histories: buildHorseHistoriesAsOf(typedRawData, target, cutoff) };
  }
  return predictionHistoryCache.histories[horseId] ?? [];
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

/** Structural No-Prior判定にも同一cutoffの全馬集合を使う。 */
export function getRaceFieldPriorRaceCountsAsOf(raceId: string, raceDate: string, target: PredictionTarget, cutoff: string): number[] {
  getHorseRecentRacesAsOf("", target, cutoff); // 同じ全馬集合を準備する（空IDは結果を利用しない）
  return Object.values(predictionHistoryCache!.histories)
    .filter((races) => races.some((r) => r.raceId === raceId))
    .map((races) => races.filter((r) => r.raceDate < raceDate).length);
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
 * 指定raceIdに出走した馬（data/horses全体を横断し、実際にそのraceIdの走を
 * 持つ馬）について、raceDateより前の実績走数の一覧を返す（CHECKPOINT13.4J、
 * memberLevelEvidence.tsのStructural No-Prior History判定用）。
 * data/horses内で1頭も見つからなければ空配列を返す（判定不能を意味する）。
 * この関数自体はbuildRaceHistory()を再実行しない（既存のhistoryByHorseIdを
 * 走査するだけ）。
 */
export function getRaceFieldPriorRaceCounts(raceId: string, raceDate: string): number[] {
  const counts: number[] = [];
  for (const races of Object.values(historyByHorseId)) {
    if (!races.some((r) => r.raceId === raceId)) continue;
    counts.push(races.filter((r) => r.raceDate < raceDate).length);
  }
  return counts;
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

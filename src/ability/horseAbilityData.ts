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
import { loadDefaultHorses } from "../simulation/horseData";
import { buildHorseAbilityProfile } from "./buildHorseAbilityProfile";
import { buildRaceHistory, type RaceHistoryRawInput } from "./raceHistoryPipeline";
import type {
  CourseFinal3FBaseline,
  CourseTimeBaseline,
  HorseAbilityProfile,
  RaceFieldAggregate,
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

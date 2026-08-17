/**
 * 馬の直近5走データのロード。
 * data/racePerformances.json（実績の生データ＋仮サブスコア。memberLevelScore・raceTimeScore・
 * final3FScoreは含まない）と、data/courseTimeBaselines.json（過去5年基準タイム）、
 * data/courseFinal3FBaselines.json（過去5年上がり3F基準）から、
 * raceHistoryPipeline.buildRaceHistory() で、実質メンバーレベル・走破タイムスコア・
 * 上がり3Fスコア込みの timeGapScore・raceScoreを一括計算し、
 * buildHorseAbilityProfile() で baseAbility を算出する。
 * 実データが確定したらそれぞれのJSONを差し替えるだけでよい構造にしている。
 */

import rawRacePerformances from "./data/racePerformances.json";
import rawCourseTimeBaselines from "./data/courseTimeBaselines.json";
import rawCourseFinal3FBaselines from "./data/courseFinal3FBaselines.json";
import { loadDefaultHorses } from "../simulation/horseData";
import { buildHorseAbilityProfile } from "./buildHorseAbilityProfile";
import { buildRaceHistory, type RaceHistoryRawInput } from "./raceHistoryPipeline";
import type { CourseFinal3FBaseline, CourseTimeBaseline, HorseAbilityProfile } from "./types";

type RawData = Record<string, RaceHistoryRawInput[]>;

const typedRawData = rawRacePerformances as unknown as RawData;
const typedTimeBaselines = rawCourseTimeBaselines.baselines as unknown as CourseTimeBaseline[];
const typedFinal3FBaselines = rawCourseFinal3FBaselines.baselines as unknown as CourseFinal3FBaseline[];

// モジュール読み込み時に一度だけ全馬横断でパイプラインを実行する
const historyByHorseId = buildRaceHistory(typedRawData, typedTimeBaselines, typedFinal3FBaselines);

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

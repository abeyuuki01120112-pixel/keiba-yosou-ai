/**
 * 馬の直近5走データのロード。
 * data/racePerformances.json（実績の生データ＋仮サブスコア。memberLevelScoreは含まない）から
 * raceHistoryPipeline.buildRaceHistory() で、実質メンバーレベル込みの
 * timeGapScore・raceScoreを一括計算し、buildHorseAbilityProfile() で baseAbility を算出する。
 * 実データが確定したら racePerformances.json を差し替えるだけでよい構造にしている。
 */

import rawRacePerformances from "./data/racePerformances.json";
import { loadDefaultHorses } from "../simulation/horseData";
import { buildHorseAbilityProfile } from "./buildHorseAbilityProfile";
import { buildRaceHistory, type RaceHistoryRawInput } from "./raceHistoryPipeline";
import type { HorseAbilityProfile } from "./types";

type RawData = Record<string, RaceHistoryRawInput[]>;

const typedRawData = rawRacePerformances as unknown as RawData;

// モジュール読み込み時に一度だけ全馬横断でパイプラインを実行する
const historyByHorseId = buildRaceHistory(typedRawData);

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

/**
 * 馬の直近5走データのロード。
 * data/racePerformances.json（実績の生データ＋仮サブスコア）から
 * buildRacePerformance() で timeGapScore・raceScore を計算し、
 * buildHorseAbilityProfile() で baseAbility を算出する。
 * 実データが確定したら racePerformances.json を差し替えるだけでよい構造にしている。
 */

import rawRacePerformances from "./data/racePerformances.json";
import { loadDefaultHorses } from "../simulation/horseData";
import { buildHorseAbilityProfile } from "./buildHorseAbilityProfile";
import { buildRacePerformance, type RacePerformanceInput } from "./buildRacePerformance";
import type { HorseAbilityProfile } from "./types";

type RawData = Record<string, RacePerformanceInput[]>;

const typedRawData = rawRacePerformances as unknown as RawData;

function loadProfile(horseId: string, horseName: string): HorseAbilityProfile {
  const inputs = typedRawData[horseId] ?? [];
  const recentRaces = inputs.map(buildRacePerformance);
  return buildHorseAbilityProfile(horseId, horseName, recentRaces);
}

export function loadHorseAbilityProfile(horseId: string): HorseAbilityProfile | undefined {
  const horse = loadDefaultHorses().find((h) => h.horseId === horseId);
  if (!horse) return undefined;
  return loadProfile(horseId, horse.horseName);
}

export function loadAllHorseAbilityProfiles(): HorseAbilityProfile[] {
  return loadDefaultHorses().map((h) => loadProfile(h.horseId, h.horseName));
}

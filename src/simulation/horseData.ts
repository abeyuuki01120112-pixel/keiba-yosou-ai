/**
 * 出走馬データのロード。
 * 実データが確定したら sapporoKinen.json を差し替えるだけでよい構造にしている。
 */

import type { HorseAbility } from "./types";
import raceData from "./data/sapporoKinen.json";

interface RaceDataFile {
  raceName: string;
  note?: string;
  horses: HorseAbility[];
}

const typedRaceData = raceData as RaceDataFile;

export const RACE_NAME = typedRaceData.raceName;

export function loadDefaultHorses(): HorseAbility[] {
  // JSONを直接importしているため、呼び出し側の変更で参照が汚染されないようdeep copyを返す
  return typedRaceData.horses.map((h) => ({ ...h }));
}

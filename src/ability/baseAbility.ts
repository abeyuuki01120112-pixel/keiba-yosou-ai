/**
 * baseAbility（基礎能力）の計算。
 * 直近5走のraceScoreを均等20%ずつ平均する。前走を特別に重くしない。
 */

import { roundToOneDecimal } from "./raceScore";
import type { RacePerformance } from "./types";

export const RECENT_RACE_COUNT = 5;

/**
 * 直近5走（多くても5走、それ未満ならある分だけ）を均等平均してbaseAbilityを算出する。
 * recentRacesは新しい順（[0]が前走）を想定。
 */
export function calculateBaseAbility(recentRaces: RacePerformance[]): number {
  const races = recentRaces.slice(0, RECENT_RACE_COUNT);
  if (races.length === 0) return 0;

  const total = races.reduce((sum, race) => sum + race.raceScore, 0);
  return roundToOneDecimal(total / races.length);
}

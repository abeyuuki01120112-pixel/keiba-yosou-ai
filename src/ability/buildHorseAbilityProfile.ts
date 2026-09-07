import { calculateBaseAbility } from "./baseAbility";
import type { HorseAbilityProfile, RacePerformance } from "./types";

export function buildHorseAbilityProfile(
  horseId: string,
  horseName: string,
  recentRaces: RacePerformance[],
): HorseAbilityProfile {
  return {
    horseId,
    horseName,
    recentRaces,
    baseAbility: calculateBaseAbility(recentRaces),
  };
}

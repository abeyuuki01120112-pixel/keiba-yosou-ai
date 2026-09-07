/**
 * suitability（第22実装・STEP4）の統合とeffectiveAbility算出。
 *
 *   overallSuitability = clamp(average(distance.adjusted, going.adjusted, course.adjusted), 90, 110)
 *   effectiveAbility    = baseAbility × overallSuitability / 100
 *
 * baseAbility / raceScore 側の既存計算式は一切変更しない。
 * confidenceは各コンポーネントのadjusted算出（Design-2縮小）で既に反映済みのため、
 * overall統合の段階でさらにconfidenceを重みとして二重適用しない（単純平均のみ）。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { computeCourseSuitability } from "./courseSuitability";
import { computeDistanceSuitability } from "./distanceSuitability";
import { computeGoingSuitability } from "./goingSuitability";
import { SUITABILITY_CLAMP_MAX, SUITABILITY_CLAMP_MIN } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { EffectiveAbilityResult, SuitabilityBreakdown, SuitabilityTargetRaceContext } from "./suitabilityTypes";

export function computeSuitabilityBreakdown(
  recentRaces: RacePerformance[],
  target: SuitabilityTargetRaceContext,
): SuitabilityBreakdown {
  const distanceSuitability = computeDistanceSuitability(recentRaces, target);
  const goingSuitability = computeGoingSuitability(recentRaces, target);
  const courseSuitability = computeCourseSuitability(recentRaces, target);

  const overallRaw = (distanceSuitability.adjusted + goingSuitability.adjusted + courseSuitability.adjusted) / 3;
  const overallSuitability = clamp(roundToOneDecimal(overallRaw), SUITABILITY_CLAMP_MIN, SUITABILITY_CLAMP_MAX);

  return { distanceSuitability, goingSuitability, courseSuitability, overallSuitability };
}

export function computeEffectiveAbility(
  baseAbility: number,
  recentRaces: RacePerformance[],
  target: SuitabilityTargetRaceContext,
): EffectiveAbilityResult {
  const suitability = computeSuitabilityBreakdown(recentRaces, target);
  const effectiveAbility = roundToOneDecimal((baseAbility * suitability.overallSuitability) / 100);
  return { baseAbility, suitability, effectiveAbility };
}

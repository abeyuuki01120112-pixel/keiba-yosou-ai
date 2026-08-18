/**
 * raceContextFactor（STEP5・第23実装）: paceScenarioFactorとtrackBiasFactorの統合。
 *
 *   rawRaceContextFactor = paceScenarioFactor.adjusted × trackBiasFactor.adjusted / 100
 *   raceContextFactor    = clamp(rawRaceContextFactor, 90, 110)
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import type { PaceScenarioFactor, RaceContextFactor, TrackBiasFactor } from "./raceContextTypes";

export const RACE_CONTEXT_CLAMP_MIN = 90;
export const RACE_CONTEXT_CLAMP_MAX = 110;

export function computeRaceContextFactor(
  paceScenarioFactor: PaceScenarioFactor,
  trackBiasFactor: TrackBiasFactor,
): RaceContextFactor {
  const raw = roundToOneDecimal((paceScenarioFactor.adjusted * trackBiasFactor.adjusted) / 100);
  const value = clamp(raw, RACE_CONTEXT_CLAMP_MIN, RACE_CONTEXT_CLAMP_MAX);

  return { paceScenarioFactor, trackBiasFactor, raw, value };
}

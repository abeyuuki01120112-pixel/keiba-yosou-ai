/**
 * trackBias（STEP5・第23実装）の優先解決。
 * 優先順位: manualTrackBias > autoTrackBias（未実装のためV1では常にnull） > neutral(100%)。
 * future leakage（対象レース自身・対象レースより後の観測）に該当する入力は自動的に除外する。
 */

import { isTrackBiasEligible } from "./raceContextLeakageGuard";
import type { RaceContextTargetInfo, TrackBiasObservation } from "./raceContextTypes";

export function resolveTrackBias(
  manual: TrackBiasObservation | null,
  auto: TrackBiasObservation | null,
  target: RaceContextTargetInfo,
): { actuallyUsed: TrackBiasObservation | null; usedSource: "manual" | "auto" | "neutral" } {
  if (manual !== null && isTrackBiasEligible(manual, target)) {
    return { actuallyUsed: manual, usedSource: "manual" };
  }
  if (auto !== null && isTrackBiasEligible(auto, target)) {
    return { actuallyUsed: auto, usedSource: "auto" };
  }
  return { actuallyUsed: null, usedSource: "neutral" };
}

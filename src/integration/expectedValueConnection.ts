/** P0-4選別済み単勝Oddsと正式Pipelineの丸め前勝率をEVへ接続する。 */

import type { OddsSnapshotEntry } from "../ability/oddsSnapshot";
import { expectedReturn } from "../simulation/expectedValue";

export type ExpectedValueUnavailableReason =
  | "FORMAL_PREDICTION_NOT_READY"
  | "WIN_PROBABILITY_UNAVAILABLE"
  | "INVALID_WIN_PROBABILITY"
  | "WIN_ODDS_UNAVAILABLE"
  | "INVALID_WIN_ODDS"
  | "ODDS_IDENTITY_MISMATCH";

export interface ConnectedExpectedValue {
  /** Plackett-Luceの丸め前値。単位はpercent（0〜100）。 */
  winProbabilityRaw: number | null;
  /** 期待回収倍率。1.00が理論上の損益分岐。 */
  expectedValue: number | null;
  oddsObservedAt: string | null;
  readyForEv: boolean;
  expectedValueUnavailableReason: ExpectedValueUnavailableReason | null;
}

export function connectWinExpectedValue(input: {
  formalPredictionReady: boolean;
  raceId: string;
  horseId: string;
  winProbabilityPercent: number | null;
  winOddsSnapshot: OddsSnapshotEntry | null;
}): ConnectedExpectedValue {
  const { winProbabilityPercent, winOddsSnapshot } = input;
  if (!input.formalPredictionReady) {
    return unavailable(winProbabilityPercent, winOddsSnapshot, "FORMAL_PREDICTION_NOT_READY");
  }
  if (winProbabilityPercent === null) {
    return unavailable(null, winOddsSnapshot, "WIN_PROBABILITY_UNAVAILABLE");
  }
  if (!Number.isFinite(winProbabilityPercent) || winProbabilityPercent < 0 || winProbabilityPercent > 100) {
    return unavailable(winProbabilityPercent, winOddsSnapshot, "INVALID_WIN_PROBABILITY");
  }
  if (winOddsSnapshot === null) {
    return unavailable(winProbabilityPercent, null, "WIN_ODDS_UNAVAILABLE");
  }
  if (winOddsSnapshot.raceId !== input.raceId || winOddsSnapshot.horseId !== input.horseId ||
      winOddsSnapshot.market !== "win") {
    return unavailable(winProbabilityPercent, winOddsSnapshot, "ODDS_IDENTITY_MISMATCH");
  }
  if (!Number.isFinite(winOddsSnapshot.odds) || winOddsSnapshot.odds <= 0) {
    return unavailable(winProbabilityPercent, winOddsSnapshot, "INVALID_WIN_ODDS");
  }

  return {
    winProbabilityRaw: winProbabilityPercent,
    expectedValue: expectedReturn(winProbabilityPercent / 100, winOddsSnapshot.odds),
    oddsObservedAt: winOddsSnapshot.observedAt,
    readyForEv: true,
    expectedValueUnavailableReason: null,
  };
}

function unavailable(
  winProbabilityRaw: number | null,
  winOddsSnapshot: OddsSnapshotEntry | null,
  reason: ExpectedValueUnavailableReason,
): ConnectedExpectedValue {
  return {
    winProbabilityRaw,
    expectedValue: null,
    oddsObservedAt: winOddsSnapshot?.observedAt ?? null,
    readyForEv: false,
    expectedValueUnavailableReason: reason,
  };
}

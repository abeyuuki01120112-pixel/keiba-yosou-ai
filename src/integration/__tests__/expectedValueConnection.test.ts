import { describe, expect, it } from "vitest";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
import { connectWinExpectedValue } from "../expectedValueConnection";

const odds: OddsSnapshotEntry = {
  raceId: "RACE-1",
  horseId: "HORSE-1",
  observedAt: "2026-08-28T03:00:00Z",
  availableAt: "2026-08-28T03:00:30Z",
  odds: 7.2,
  market: "win",
  source: "test",
};

function connect(overrides: Partial<Parameters<typeof connectWinExpectedValue>[0]> = {}) {
  return connectWinExpectedValue({
    formalPredictionReady: true,
    raceId: "RACE-1",
    horseId: "HORSE-1",
    winProbabilityPercent: 17.342,
    winOddsSnapshot: odds,
    ...overrides,
  });
}

describe("Expected Value formal pipeline connection", () => {
  it("丸め前Probabilityから期待回収倍率を生成する", () => {
    expect(connect()).toEqual({
      winProbabilityRaw: 17.342,
      expectedValue: 1.248624,
      oddsObservedAt: odds.observedAt,
      readyForEv: true,
      expectedValueUnavailableReason: null,
    });
  });

  it("Formal Gate未通過ならEVを生成しない", () => {
    expect(connect({ formalPredictionReady: false })).toMatchObject({
      expectedValue: null,
      readyForEv: false,
      expectedValueUnavailableReason: "FORMAL_PREDICTION_NOT_READY",
    });
  });

  it("Odds欠損を診断する", () => {
    expect(connect({ winOddsSnapshot: null })).toMatchObject({
      expectedValue: null,
      oddsObservedAt: null,
      readyForEv: false,
      expectedValueUnavailableReason: "WIN_ODDS_UNAVAILABLE",
    });
  });

  it.each([Number.NaN, -0.1, 100.1, Number.POSITIVE_INFINITY])(
    "不正Probability=%sを診断する", (winProbabilityPercent) => {
      expect(connect({ winProbabilityPercent })).toMatchObject({
        expectedValue: null,
        readyForEv: false,
        expectedValueUnavailableReason: "INVALID_WIN_PROBABILITY",
      });
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正Odds=%sを診断する", (value) => {
      expect(connect({ winOddsSnapshot: { ...odds, odds: value } })).toMatchObject({
        expectedValue: null,
        readyForEv: false,
        expectedValueUnavailableReason: "INVALID_WIN_ODDS",
      });
    },
  );

  it("raceId・horseId・market不一致を拒否する", () => {
    for (const winOddsSnapshot of [
      { ...odds, raceId: "OTHER" },
      { ...odds, horseId: "OTHER" },
      { ...odds, market: "place" as const },
    ]) {
      expect(connect({ winOddsSnapshot })).toMatchObject({
        expectedValue: null,
        readyForEv: false,
        expectedValueUnavailableReason: "ODDS_IDENTITY_MISMATCH",
      });
    }
  });

  it("同一Probability・Oddsなら実行時刻に依存しない", () => {
    const first = connect();
    const second = connect();
    expect(second).toEqual(first);
  });
});

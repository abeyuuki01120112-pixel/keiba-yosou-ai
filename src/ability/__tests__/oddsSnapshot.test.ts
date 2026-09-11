import { describe, expect, it } from "vitest";
import {
  selectOddsSnapshotsAsOf,
  type OddsSnapshotEntry,
} from "../oddsSnapshot";

const cutoff = "2026-08-28T03:00:00Z";
const base: OddsSnapshotEntry = {
  raceId: "RACE-1",
  horseId: "HORSE-1",
  observedAt: "2026-08-28T02:00:00Z",
  availableAt: "2026-08-28T02:00:30Z",
  odds: 4.2,
  market: "win",
  source: "JRA-VAN",
  sourceIdentifier: "odds-feed-1",
};

function select(
  snapshots: readonly OddsSnapshotEntry[],
  requiredWinHorseIds: readonly string[] = ["HORSE-1"],
) {
  return selectOddsSnapshotsAsOf({
    raceId: "RACE-1",
    predictionCutoffAt: cutoff,
    canonicalHorseIds: new Set(["HORSE-1", "HORSE-2"]),
    requiredWinHorseIds,
    snapshots,
  });
}

describe("Odds Snapshot cutoff selection", () => {
  it("raceId・canonical horseIdが一致するcutoff以前の最新単勝を選ぶ", () => {
    const earlier = { ...base, observedAt: "2026-08-28T01:00:00Z", odds: 5.1 };
    const latest = { ...base, odds: 4.0 };
    const result = select([latest, earlier]);

    expect(result.selected).toEqual([latest]);
    expect(result.winByHorseId["HORSE-1"]).toEqual(latest);
    expect(result.winOddsComplete).toBe(true);
    expect(result.missingWinOddsHorseIds).toEqual([]);
  });

  it("observedAtまたはavailableAtがcutoff後のオッズを使用しない", () => {
    const futureObserved = { ...base, observedAt: "2026-08-28T03:00:01Z", odds: 2.0 };
    const futureAvailable = { ...base, availableAt: "2026-08-28T03:00:01Z", odds: 2.1 };
    const safe = { ...base, odds: 4.4 };
    const result = select([futureObserved, futureAvailable, safe]);

    expect(result.winByHorseId["HORSE-1"]).toEqual(safe);
    expect(result.diagnostics.filter((d) => d.code === "FUTURE_ODDS_REJECTED")).toHaveLength(2);
  });

  it("別レースと未解決horseIdを推測mergeせず診断する", () => {
    const otherRace = { ...base, raceId: "RACE-2", odds: 1.5 };
    const unresolved = { ...base, horseId: "UNKNOWN", odds: 1.6 };
    const result = select([otherRace, unresolved]);

    expect(result.selected).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "ODDS_RACE_ID_MISMATCH")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "UNRESOLVED_ODDS_HORSE_ID")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "MISSING_WIN_ODDS_BEFORE_CUTOFF" && d.horseId === "HORSE-1")).toBe(true);
  });

  it("単勝欠損を馬単位で返し、複勝Snapshot自体は壊さない", () => {
    const place = { ...base, horseId: "HORSE-2", odds: 1.8, market: "place" as const };
    const result = select([base, place], ["HORSE-1", "HORSE-2"]);

    expect(result.selected).toContainEqual(place);
    expect(result.winOddsComplete).toBe(false);
    expect(result.missingWinOddsHorseIds).toEqual(["HORSE-2"]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "MISSING_WIN_ODDS_BEFORE_CUTOFF",
      horseId: "HORSE-2",
    }));
  });

  it("同一時刻の矛盾する値を任意選択せず曖昧として拒否する", () => {
    const conflict = { ...base, odds: 9.9, source: "other" };
    const result = select([base, conflict]);

    expect(result.selected).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "AMBIGUOUS_ODDS_SNAPSHOT")).toBe(true);
    expect(result.winOddsComplete).toBe(false);
  });
});

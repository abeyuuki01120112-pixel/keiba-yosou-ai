import { describe, expect, it } from "vitest";
import { calculateBaseAbility } from "../../ability/baseAbility";
import { getHorseRecentRaces } from "../../ability/horseAbilityData";
import type { RacePerformance } from "../../ability/types";
import type { CollectedRunnerRow, PriorHistoryEntry, SourceProvenance } from "../../collector/types";
import { connectCollectorHorseHistories } from "../collectorHorseHistory";

const horseId = "2022104645";
const target = { raceId: "JRA-20260830-NIIGATA-08", raceDate: "2026-08-30" };
const cutoff = "2026-08-28T06:00:00Z";

const provenance: SourceProvenance = {
  source: "test",
  sourceIdentifier: horseId,
  targetRaceId: target.raceId,
  retrievedAt: "2026-09-08T00:00:00Z",
  targetAsOf: cutoff,
  method: "production_history_reference",
  collectorVersion: "test",
};

function runner(id = horseId): CollectedRunnerRow {
  return {
    raceId: target.raceId,
    raceDate: target.raceDate,
    racecourse: "新潟",
    raceNumber: 8,
    raceName: "新潟記念",
    surface: "turf",
    distance: 2000,
    going: "良",
    courseLayout: null,
    courseVariant: null,
    horseId: id,
    horseName: "ダノンシーマ",
    horseNumber: 8,
    gate: 6,
    finishPosition: null,
    carriedWeightKg: 57,
    actualRaceTimeSeconds: null,
    final3FSeconds: null,
    timeGapSeconds: null,
    fieldSize: 1,
    passingPosition: null,
    source: "test",
    sourceRaceId: target.raceId,
    sourceHorseId: id,
  };
}

function history(races: RacePerformance[], id = horseId): PriorHistoryEntry {
  return { horseId: id, status: "available", races, provenance: { ...provenance, sourceIdentifier: id } };
}

function addedRace(date: string, raceId: string): RacePerformance {
  const base = structuredClone(getHorseRecentRaces(horseId)[0]);
  return {
    ...base,
    raceId,
    sourceRaceId: raceId,
    raceName: `追加 ${raceId}`,
    raceDate: date,
    availableAt: `${date}T08:00:00+09:00`,
    raceScore: 999,
  };
}

describe("P0-2: Collector priorHistories → canonical Horse History", () => {
  it("5走超を保持し、新しい履歴を追加しても古い履歴を削除しない", () => {
    const existing = structuredClone(getHorseRecentRaces(horseId));
    const extra = addedRace("2024-01-10", "P0-2-OLDER");
    const result = connectCollectorHorseHistories([runner()], [history([...existing, extra])], target, cutoff);

    expect(result.ok).toBe(true);
    expect(result.rawHistoriesByHorseId[horseId]).toHaveLength(existing.length + 1);
    expect(result.historiesByHorseId[horseId]).toHaveLength(existing.length + 1);
    expect(result.historiesByHorseId[horseId].map((race) => race.raceId)).toContain(extra.raceId);
    expect(existing.every((race) => result.historiesByHorseId[horseId].some((item) => item.raceId === race.raceId))).toBe(true);
    expect(result.historiesByHorseId[horseId].map((race) => race.raceDate)).toEqual(
      [...result.historiesByHorseId[horseId].map((race) => race.raceDate)].sort().reverse(),
    );

    const next = addedRace("2024-02-10", "P0-2-NEXT-UPDATE");
    const reused = connectCollectorHorseHistories(
      [runner()],
      [history([next])],
      target,
      cutoff,
      result.rawHistoriesByHorseId,
    );
    const reusedIds = reused.historiesByHorseId[horseId].map((race) => race.raceId);
    expect(reused.ok).toBe(true);
    expect(reusedIds).toContain(extra.raceId);
    expect(reusedIds).toContain(next.raceId);
    expect(existing.every((race) => reusedIds.includes(race.raceId))).toBe(true);
  });

  it("同一raceIdを既存・同一受信バッチのどちらでも二重登録しない", () => {
    const existing = structuredClone(getHorseRecentRaces(horseId));
    const extra = addedRace("2024-01-10", "P0-2-DUPLICATE");
    const result = connectCollectorHorseHistories(
      [runner()],
      [history([...existing, extra, structuredClone(extra)])],
      target,
      cutoff,
    );
    expect(result.ok).toBe(true);
    expect(result.historiesByHorseId[horseId].filter((race) => race.raceId === extra.raceId)).toHaveLength(1);
  });

  it("6走以上を保持してもBase Ability V1は時系列の直近5走だけを使う", () => {
    const existing = structuredClone(getHorseRecentRaces(horseId));
    const newest = addedRace("2026-08-01", "P0-2-NEWEST");
    const result = connectCollectorHorseHistories([runner()], [history([...existing, newest])], target, cutoff);
    const connected = result.historiesByHorseId[horseId];

    expect(connected).toHaveLength(6);
    expect(connected[0].raceId).toBe(newest.raceId);
    expect(calculateBaseAbility(connected)).toBe(calculateBaseAbility(connected.slice(0, 5)));
    expect(calculateBaseAbility(connected)).not.toBe(
      Math.round((connected.reduce((sum, race) => sum + race.raceScore, 0) / connected.length) * 10) / 10,
    );
  });

  it("canonical Horse ID不一致を推測mergeせず診断する", () => {
    const result = connectCollectorHorseHistories(
      [runner()],
      [history(structuredClone(getHorseRecentRaces(horseId)), "different-horse")],
      target,
      cutoff,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("UNRESOLVED_CANONICAL_HORSE_ID: different-horse");
    expect(result.errors).toContain(`INCOMPLETE_PRIOR_HISTORY: ${horseId}`);
    expect(result.mergeByHorseId["different-horse"]).toBeUndefined();
  });

  it("対象レース自身とcutoff後・未来日の履歴を発走前履歴へ入れない", () => {
    const existing = structuredClone(getHorseRecentRaces(horseId));
    const targetResult = addedRace("2026-01-10", target.raceId);
    const afterCutoff = addedRace("2026-01-11", "P0-2-AFTER-CUTOFF");
    afterCutoff.availableAt = "2026-08-29T00:00:00Z";
    const future = addedRace("2026-08-29", "P0-2-FUTURE");
    const result = connectCollectorHorseHistories(
      [runner()],
      [history([...existing, targetResult, afterCutoff, future])],
      target,
      cutoff,
    );
    const ids = result.historiesByHorseId[horseId].map((race) => race.raceId);
    expect(result.ok).toBe(true);
    expect(ids).not.toContain(target.raceId);
    expect(ids).not.toContain(afterCutoff.raceId);
    expect(ids).not.toContain(future.raceId);
  });

  it("同一入力・同一cutoffなら実行時刻に依存せず同一結果になる", () => {
    const input = history([...structuredClone(getHorseRecentRaces(horseId)), addedRace("2024-01-10", "P0-2-STABLE")]);
    const first = connectCollectorHorseHistories([runner()], [input], target, cutoff);
    const second = connectCollectorHorseHistories([runner()], [structuredClone(input)], target, cutoff);
    expect(second).toEqual(first);
  });
});

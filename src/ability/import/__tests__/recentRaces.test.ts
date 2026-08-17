import { describe, expect, it } from "vitest";
import { getRecentRacePerformances } from "../recentRaces";
import type { RacePerformanceInput } from "../types";

function perf(raceId: string, horseId: string, raceDate: string): RacePerformanceInput {
  return {
    raceId,
    horseId,
    horseName: "テスト",
    raceDate,
    racecourse: "東京",
    raceName: "テストレース",
    raceNumber: null,
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    carriedWeightKg: 56,
    actualRaceTimeSeconds: 119.0,
    final3FSeconds: 34.0,
    timeGapSeconds: -0.2,
    gate: null,
    horseNumber: null,
    fieldSize: null,
  };
}

describe("getRecentRacePerformances", () => {
  const performances = [
    perf("r1", "h1", "2026-01-01"),
    perf("r2", "h1", "2026-03-01"),
    perf("r3", "h1", "2026-02-01"),
    perf("r4", "h1", "2026-04-01"),
    perf("r5", "h1", "2026-05-01"),
    perf("r6", "h1", "2026-06-01"),
    perf("other", "h2", "2026-06-15"), // 別の馬
  ];

  it("raceDateの新しい順に並び替えて返す", () => {
    const result = getRecentRacePerformances("h1", performances, { limit: 10 });
    expect(result.map((r) => r.raceId)).toEqual(["r6", "r5", "r4", "r2", "r3", "r1"]);
  });

  it("horseIdで絞り込む", () => {
    const result = getRecentRacePerformances("h2", performances);
    expect(result).toHaveLength(1);
    expect(result[0].raceId).toBe("other");
  });

  it("limit件数までしか返さない（直近5走）", () => {
    const result = getRecentRacePerformances("h1", performances, { limit: 5 });
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.raceId)).toEqual(["r6", "r5", "r4", "r2", "r3"]);
  });

  it("beforeDateより前（未来を含まない）のレースだけを対象にする", () => {
    // 2026-04-01 時点で見えるはずの過去走のみ（同日・未来は除外）
    const result = getRecentRacePerformances("h1", performances, { beforeDate: "2026-04-01", limit: 10 });
    expect(result.map((r) => r.raceId).sort()).toEqual(["r1", "r2", "r3"]);
    // 2026-04-01 (r4) 自身と、それより後(r5, r6)は含まれない
    expect(result.some((r) => r.raceId === "r4")).toBe(false);
    expect(result.some((r) => r.raceId === "r5")).toBe(false);
    expect(result.some((r) => r.raceId === "r6")).toBe(false);
  });

  it("beforeDate未指定なら未来リーク判定をせず全件が対象になる", () => {
    const result = getRecentRacePerformances("h1", performances, { limit: 100 });
    expect(result).toHaveLength(6);
  });
});

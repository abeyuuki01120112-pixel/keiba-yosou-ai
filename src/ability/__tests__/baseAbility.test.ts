import { describe, expect, it } from "vitest";
import { calculateBaseAbility } from "../baseAbility";
import { buildRacePerformance } from "../buildRacePerformance";
import type { RacePerformanceInput } from "../buildRacePerformance";

function makeRace(overrides: Partial<RacePerformanceInput> = {}): ReturnType<typeof buildRacePerformance> {
  return buildRacePerformance({
    raceId: "test",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScore: 80,
    raceTimeScore: 80,
    final3FScore: 80,
    weightScore: 80,
    ...overrides,
  });
}

describe("calculateBaseAbility", () => {
  it("直近5走を均等20%ずつ平均する（前走を重くしない）", () => {
    const baseline = [makeRace(), makeRace(), makeRace(), makeRace(), makeRace()];
    const baselineAbility = calculateBaseAbility(baseline);

    // 前走(index 0)のみraceScoreが+10点になるよう変更
    const frontBoosted = [
      makeRace({ memberLevelScore: 80 + 10 / 0.3 }),
      makeRace(),
      makeRace(),
      makeRace(),
      makeRace(),
    ];
    const frontBoostedAbility = calculateBaseAbility(frontBoosted);

    // 5走前(index 4)のみ同じ+10点になるよう変更
    const backBoosted = [
      makeRace(),
      makeRace(),
      makeRace(),
      makeRace(),
      makeRace({ memberLevelScore: 80 + 10 / 0.3 }),
    ];
    const backBoostedAbility = calculateBaseAbility(backBoosted);

    // どちらを+10点しても、baseAbilityへの影響（+2点=10点/5走）は同じでなければならない
    expect(frontBoostedAbility - baselineAbility).toBeCloseTo(
      backBoostedAbility - baselineAbility,
      1,
    );
    expect(frontBoostedAbility - baselineAbility).toBeCloseTo(2, 1);
  });

  it("5走の平均とbaseAbilityが一致する", () => {
    const races = [
      makeRace({ memberLevelScore: 90 }),
      makeRace({ memberLevelScore: 85 }),
      makeRace({ memberLevelScore: 70 }),
      makeRace({ memberLevelScore: 60 }),
      makeRace({ memberLevelScore: 75 }),
    ];
    const expectedAverage = races.reduce((sum, r) => sum + r.raceScore, 0) / 5;
    expect(calculateBaseAbility(races)).toBeCloseTo(expectedAverage, 5);
  });

  it("データが無い場合は0を返す", () => {
    expect(calculateBaseAbility([])).toBe(0);
  });
});

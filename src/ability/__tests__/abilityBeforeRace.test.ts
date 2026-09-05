import { describe, expect, it } from "vitest";
import { calculateAbilityBeforeRace, MAX_PRIOR_RACES_FOR_ABILITY } from "../abilityBeforeRace";

describe("calculateAbilityBeforeRace", () => {
  it("過去走が無ければnull（集計対象から除外）", () => {
    expect(calculateAbilityBeforeRace([])).toBeNull();
  });

  it("過去走の単純平均を返す", () => {
    expect(calculateAbilityBeforeRace([80, 70, 60])).toBeCloseTo((80 + 70 + 60) / 3, 5);
  });

  it("5走を超える分は直近5走のみを使う", () => {
    const withSix = calculateAbilityBeforeRace([90, 80, 70, 60, 50, 999]);
    const withFive = calculateAbilityBeforeRace([90, 80, 70, 60, 50]);
    expect(withSix).toBeCloseTo(withFive!, 5);
    expect(MAX_PRIOR_RACES_FOR_ABILITY).toBe(5);
  });
});

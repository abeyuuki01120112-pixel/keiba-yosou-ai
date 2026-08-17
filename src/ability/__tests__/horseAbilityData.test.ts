import { describe, expect, it } from "vitest";
import { loadAllHorseAbilityProfiles, loadHorseAbilityProfile } from "../horseAbilityData";
import { calculateBaseAbility } from "../baseAbility";

describe("loadHorseAbilityProfile", () => {
  it("直近5走を取得できる", () => {
    const profile = loadHorseAbilityProfile("roshampark");
    expect(profile).toBeDefined();
    expect(profile?.recentRaces).toHaveLength(5);
  });

  it("5走の平均とbaseAbilityが一致する", () => {
    const profile = loadHorseAbilityProfile("roshampark");
    expect(profile).toBeDefined();
    const manualAverage = calculateBaseAbility(profile!.recentRaces);
    expect(profile!.baseAbility).toBeCloseTo(manualAverage, 5);
  });

  it("各過去走の内訳（5項目＋1走スコア）を確認できる", () => {
    const profile = loadHorseAbilityProfile("roshampark");
    for (const race of profile!.recentRaces) {
      expect(race.memberLevelScoreAtRace).toBeGreaterThanOrEqual(0);
      expect(race.timeGapScore).toBeGreaterThanOrEqual(0);
      expect(race.raceTimeScore).toBeGreaterThanOrEqual(0);
      expect(race.final3FScore).toBeGreaterThanOrEqual(0);
      expect(race.weightScore).toBeGreaterThanOrEqual(0);
      expect(race.raceScore).toBeGreaterThanOrEqual(0);
      expect(race.raceScore).toBeLessThanOrEqual(100);
    }
  });

  it("小数第1位まで正常に表示できる", () => {
    const profile = loadHorseAbilityProfile("roshampark");
    expect(profile!.baseAbility.toFixed(1)).toMatch(/^\d+\.\d$/);
    for (const race of profile!.recentRaces) {
      expect(race.raceScore.toFixed(1)).toMatch(/^\d+\.\d$/);
    }
  });

  it("存在しない馬IDはundefinedを返す", () => {
    expect(loadHorseAbilityProfile("not-a-horse")).toBeUndefined();
  });
});

describe("loadAllHorseAbilityProfiles", () => {
  it("16頭全馬のプロフィールを取得できる", () => {
    const profiles = loadAllHorseAbilityProfiles();
    expect(profiles).toHaveLength(16);
    for (const p of profiles) {
      expect(p.recentRaces.length).toBeGreaterThan(0);
    }
  });
});

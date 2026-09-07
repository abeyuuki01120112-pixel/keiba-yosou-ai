import { describe, expect, it } from "vitest";
import {
  calculateRaceTimeScore,
  formatRaceTimeSeconds,
  RACE_TIME_SCORE_CENTER,
} from "../raceTimeScore";

describe("calculateRaceTimeScore", () => {
  it("trackAdjustedDiff=0のときCENTER(70点)になる", () => {
    expect(calculateRaceTimeScore(0)).toBe(RACE_TIME_SCORE_CENTER);
  });

  it("目安表とおおむね一致する（連続関数による近似）", () => {
    expect(calculateRaceTimeScore(1.5)).toBeGreaterThan(85);
    expect(calculateRaceTimeScore(1.5)).toBeLessThan(97);
    expect(calculateRaceTimeScore(1.0)).toBeGreaterThan(78);
    expect(calculateRaceTimeScore(1.0)).toBeLessThan(90);
    expect(calculateRaceTimeScore(-1.5)).toBeGreaterThan(40);
    expect(calculateRaceTimeScore(-1.5)).toBeLessThan(55);
  });

  it("単調増加する（差が大きいほど高得点）", () => {
    const scores = [-2, -1, -0.5, 0, 0.5, 1, 2].map(calculateRaceTimeScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it("0〜100にclampされる（極端な値でも）", () => {
    expect(calculateRaceTimeScore(1000)).toBeLessThanOrEqual(100);
    expect(calculateRaceTimeScore(-1000)).toBeGreaterThanOrEqual(0);
  });

  it("90点台が簡単には出ない（飽和カーブ）", () => {
    // +0.5秒程度の平凡な差では90点に届かない
    expect(calculateRaceTimeScore(0.5)).toBeLessThan(85);
  });
});

describe("formatRaceTimeSeconds", () => {
  it("分:秒.小数1桁の表記に変換する", () => {
    expect(formatRaceTimeSeconds(119.8)).toBe("1:59.8");
    expect(formatRaceTimeSeconds(65.3)).toBe("1:05.3");
    expect(formatRaceTimeSeconds(45.2)).toBe("0:45.2");
  });
});

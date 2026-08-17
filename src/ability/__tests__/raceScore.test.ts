import { describe, expect, it } from "vitest";
import { calculateRaceScore, RACE_SCORE_WEIGHTS, roundToOneDecimal } from "../raceScore";

describe("RACE_SCORE_WEIGHTS", () => {
  it("5項目の比率が仕様どおり(30/25/25/15/5)で合計1.0になる", () => {
    expect(RACE_SCORE_WEIGHTS.memberLevel).toBeCloseTo(0.3, 5);
    expect(RACE_SCORE_WEIGHTS.timeGap).toBeCloseTo(0.25, 5);
    expect(RACE_SCORE_WEIGHTS.raceTime).toBeCloseTo(0.25, 5);
    expect(RACE_SCORE_WEIGHTS.final3F).toBeCloseTo(0.15, 5);
    expect(RACE_SCORE_WEIGHTS.weight).toBeCloseTo(0.05, 5);

    const total =
      RACE_SCORE_WEIGHTS.memberLevel +
      RACE_SCORE_WEIGHTS.timeGap +
      RACE_SCORE_WEIGHTS.raceTime +
      RACE_SCORE_WEIGHTS.final3F +
      RACE_SCORE_WEIGHTS.weight;
    expect(total).toBeCloseTo(1.0, 5);
  });
});

describe("calculateRaceScore", () => {
  it("5項目の加重平均で計算される", () => {
    const performance = {
      memberLevelScoreAtRace: 80,
      timeGapScore: 70,
      raceTimeScore: 60,
      final3FScore: 90,
      weightScore: 50,
    };
    const expected =
      80 * 0.3 + 70 * 0.25 + 60 * 0.25 + 90 * 0.15 + 50 * 0.05;
    expect(calculateRaceScore(performance)).toBeCloseTo(roundToOneDecimal(expected), 5);
  });

  it("全項目満点なら100になる", () => {
    expect(
      calculateRaceScore({
        memberLevelScoreAtRace: 100,
        timeGapScore: 100,
        raceTimeScore: 100,
        final3FScore: 100,
        weightScore: 100,
      }),
    ).toBe(100);
  });

  it("0〜100にclampされる", () => {
    expect(
      calculateRaceScore({
        memberLevelScoreAtRace: 200,
        timeGapScore: 200,
        raceTimeScore: 200,
        final3FScore: 200,
        weightScore: 200,
      }),
    ).toBe(100);
    expect(
      calculateRaceScore({
        memberLevelScoreAtRace: -50,
        timeGapScore: -50,
        raceTimeScore: -50,
        final3FScore: -50,
        weightScore: -50,
      }),
    ).toBe(0);
  });

  it("小数第1位に丸められる", () => {
    const score = calculateRaceScore({
      memberLevelScoreAtRace: 81.234,
      timeGapScore: 77.777,
      raceTimeScore: 63.001,
      final3FScore: 90.9,
      weightScore: 55.55,
    });
    expect(Number.isInteger(score * 10)).toBe(true);
  });
});

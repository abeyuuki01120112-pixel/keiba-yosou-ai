import { describe, expect, it } from "vitest";
import { buildRaceHistory, type RaceHistoryRawInput } from "../raceHistoryPipeline";
import { calculateMemberLevel } from "../memberLevel";
import { buildHorseAbilityProfile } from "../buildHorseAbilityProfile";
import { calculateBaseAbility } from "../baseAbility";
import { FALLBACK_MEMBER_LEVEL_SCORE } from "../memberLevel";

function race(overrides: Partial<RaceHistoryRawInput> & Pick<RaceHistoryRawInput, "raceId" | "raceDate">): RaceHistoryRawInput {
  return {
    raceName: "テストレース",
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    raceTimeScore: 80,
    final3FScore: 80,
    weightScore: 80,
    ...overrides,
  };
}

describe("buildRaceHistory", () => {
  it("abilityBeforeRaceは対象レースより前の過去走だけで計算される（同レースの相手の当日成績は使わない）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "old-A", raceDate: "2025-01-01", finishPosition: 1, timeGap: -0.2 }),
        race({ raceId: "shared", raceDate: "2025-06-01", finishPosition: 1, timeGap: -0.1 }),
      ],
      B: [
        race({ raceId: "old-B", raceDate: "2025-01-01", finishPosition: 1, timeGap: -0.3 }),
        race({ raceId: "shared", raceDate: "2025-06-01", finishPosition: 2, timeGap: 0.5 }),
      ],
    };

    const result = buildRaceHistory(raw);
    const aShared = result.A.find((r) => r.raceId === "shared")!;
    const bShared = result.B.find((r) => r.raceId === "shared")!;
    const aOld = result.A.find((r) => r.raceId === "old-A")!;
    const bOld = result.B.find((r) => r.raceId === "old-B")!;

    // sharedレースのmemberLevelScoreは、A・Bそれぞれの「old」レースのraceScoreだけから
    // 算出されているはず（sharedレース自身のスコアは一切使わない）
    const expected = calculateMemberLevel([aOld.raceScore, bOld.raceScore]);
    expect(aShared.memberLevelScoreAtRace).toBeCloseTo(expected.memberLevelScore, 5);
    expect(bShared.memberLevelScoreAtRace).toBeCloseTo(expected.memberLevelScore, 5);
  });

  it("未来のレースデータを参照しない（未来のレースを追加しても過去のレース結果は変わらない）", () => {
    const baseRaw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "r1", raceDate: "2025-01-01" }),
        race({ raceId: "r2", raceDate: "2025-03-01" }),
      ],
      B: [
        race({ raceId: "r1", raceDate: "2025-01-01" }),
        race({ raceId: "r2", raceDate: "2025-03-01" }),
      ],
    };
    const withoutFuture = buildRaceHistory(baseRaw);

    const rawWithFuture: Record<string, RaceHistoryRawInput[]> = {
      A: [...baseRaw.A, race({ raceId: "r3-future", raceDate: "2025-12-01", finishPosition: 1, timeGap: -5 })],
      B: baseRaw.B,
    };
    const withFuture = buildRaceHistory(rawWithFuture);

    const r1A_before = withoutFuture.A.find((r) => r.raceId === "r1")!;
    const r1A_after = withFuture.A.find((r) => r.raceId === "r1")!;
    const r2A_before = withoutFuture.A.find((r) => r.raceId === "r2")!;
    const r2A_after = withFuture.A.find((r) => r.raceId === "r2")!;

    expect(r1A_after.memberLevelScoreAtRace).toBeCloseTo(r1A_before.memberLevelScoreAtRace, 5);
    expect(r1A_after.raceScore).toBeCloseTo(r1A_before.raceScore, 5);
    expect(r2A_after.memberLevelScoreAtRace).toBeCloseTo(r2A_before.memberLevelScoreAtRace, 5);
    expect(r2A_after.raceScore).toBeCloseTo(r2A_before.raceScore, 5);
  });

  it("循環参照が発生しない（同一レース内の相手の当該レーススコアを使っていない）", () => {
    // Aだけ極端に強い今回の走り（大差勝ち）にしても、そのレース自身のmemberLevelScoreには影響しない
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "prior-A", raceDate: "2025-01-01", finishPosition: 1, timeGap: -0.1 }),
        race({ raceId: "target", raceDate: "2025-06-01", finishPosition: 1, timeGap: -10 }), // 極端な大差勝ち
      ],
      B: [
        race({ raceId: "prior-B", raceDate: "2025-01-01", finishPosition: 1, timeGap: -0.1 }),
        race({ raceId: "target", raceDate: "2025-06-01", finishPosition: 2, timeGap: 10 }),
      ],
    };
    const result = buildRaceHistory(raw);
    const targetA = result.A.find((r) => r.raceId === "target")!;
    const targetB = result.B.find((r) => r.raceId === "target")!;
    // 同じレースなのでmemberLevelScoreは両者で同一のはず
    expect(targetA.memberLevelScoreAtRace).toBeCloseTo(targetB.memberLevelScoreAtRace, 5);

    const priorA = result.A.find((r) => r.raceId === "prior-A")!;
    const priorB = result.B.find((r) => r.raceId === "prior-B")!;
    const expected = calculateMemberLevel([priorA.raceScore, priorB.raceScore]);
    // targetレースの極端なtimeGapがmemberLevelScoreに混入していないことを確認
    expect(targetA.memberLevelScoreAtRace).toBeCloseTo(expected.memberLevelScore, 5);
  });

  it("raceScoreに新memberLevelScoreが30%で反映される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "prior-A", raceDate: "2025-01-01" }),
        race({ raceId: "target", raceDate: "2025-06-01", timeGap: 0.2, distance: 2000 }),
      ],
      B: [
        race({ raceId: "prior-B", raceDate: "2025-01-01" }),
        race({ raceId: "target", raceDate: "2025-06-01", finishPosition: 2, timeGap: 0.8 }),
      ],
    };
    const result = buildRaceHistory(raw);
    const targetA = result.A.find((r) => r.raceId === "target")!;

    const expectedRaceScore =
      targetA.memberLevelScoreAtRace * 0.3 +
      targetA.timeGapScore * 0.25 +
      targetA.raceTimeScore * 0.25 +
      targetA.final3FScore * 0.15 +
      targetA.weightScore * 0.05;
    expect(targetA.raceScore).toBeCloseTo(Math.round(expectedRaceScore * 10) / 10, 1);
  });

  it("baseAbilityがmemberLevelScore込みで再計算される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "a1", raceDate: "2025-01-01" }),
        race({ raceId: "a2", raceDate: "2025-02-01" }),
        race({ raceId: "shared", raceDate: "2025-06-01" }),
      ],
      B: [race({ raceId: "shared", raceDate: "2025-06-01", finishPosition: 2, timeGap: 0.5 })],
    };
    const result = buildRaceHistory(raw);
    const profile = buildHorseAbilityProfile("A", "馬A", result.A);
    expect(profile.baseAbility).toBeCloseTo(calculateBaseAbility(result.A), 5);
  });

  it("出走頭数が5頭未満でも壊れない", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "small", raceDate: "2025-01-01" })],
      B: [race({ raceId: "small", raceDate: "2025-01-01", finishPosition: 2, timeGap: 0.3 })],
      C: [race({ raceId: "small", raceDate: "2025-01-01", finishPosition: 3, timeGap: 0.6 })],
    };
    expect(() => buildRaceHistory(raw)).not.toThrow();
    const result = buildRaceHistory(raw);
    expect(result.A[0].memberLevelScoreAtRace).toBe(FALLBACK_MEMBER_LEVEL_SCORE);
  });

  it("abilityBeforeRaceが存在しない馬がいても壊れない（過去走ゼロの馬を除外して計算する）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "prior-A", raceDate: "2025-01-01" }),
        race({ raceId: "target", raceDate: "2025-06-01" }),
      ],
      // Bは今回が初戦（過去走なし）
      B: [race({ raceId: "target", raceDate: "2025-06-01", finishPosition: 2, timeGap: 0.5 })],
    };
    expect(() => buildRaceHistory(raw)).not.toThrow();
    const result = buildRaceHistory(raw);
    const targetA = result.A.find((r) => r.raceId === "target")!;
    const priorA = result.A.find((r) => r.raceId === "prior-A")!;

    // Bのabilityが不明なので、Aの過去走スコアのみで算出されているはず
    const expected = calculateMemberLevel([priorA.raceScore]);
    expect(targetA.memberLevelScoreAtRace).toBeCloseTo(expected.memberLevelScore, 5);
    expect(targetA.memberLevelBreakdown?.participantCount).toBe(1);
  });

  it("全出走馬が過去走ゼロならフォールバック値になり、落ちない", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "debut", raceDate: "2025-01-01" })],
      B: [race({ raceId: "debut", raceDate: "2025-01-01", finishPosition: 2, timeGap: 0.4 })],
    };
    expect(() => buildRaceHistory(raw)).not.toThrow();
    const result = buildRaceHistory(raw);
    expect(result.A[0].memberLevelScoreAtRace).toBe(FALLBACK_MEMBER_LEVEL_SCORE);
    expect(result.A[0].memberLevelBreakdown).toBeNull();
  });
});

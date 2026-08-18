import { describe, expect, it } from "vitest";
import { buildRaceHistory, type RaceHistoryRawInput } from "../raceHistoryPipeline";
import { calculateMemberLevel } from "../memberLevel";
import { buildHorseAbilityProfile } from "../buildHorseAbilityProfile";
import { calculateBaseAbility } from "../baseAbility";
import { FALLBACK_MEMBER_LEVEL_SCORE } from "../memberLevel";
import { RACE_TIME_SCORE_CENTER } from "../raceTimeScore";
import { FINAL3F_SCORE_CENTER } from "../final3FScore";
import type { CourseFinal3FBaseline, CourseTimeBaseline, RaceFieldAggregate } from "../types";

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

describe("buildRaceHistory の raceTimeScore（走破タイムスコア）", () => {
  const baseline: CourseTimeBaseline = {
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    sampleYears: 5,
    sampleCount: 40,
    medianTimeSeconds: 119.8, // 1:59.8
    source: "test",
  };

  it("trackAdjustedDiffの符号が正しい（基準より速い日に、さらに速いタイムを出した場合）", () => {
    // 5年基準1:59.8、実走1:57.6 -> baseDiff=+2.2
    // 当日馬場補正が-0.8秒（速い馬場）になるよう、同日同競馬場同surfaceに複数レースを用意
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", raceTime: 117.6 })],
      B: [race({ raceId: "pool1", raceDate: "2026-01-01", raceTime: 119.1 })], // diff -0.7
      C: [race({ raceId: "pool2", raceDate: "2026-01-01", raceTime: 118.9 })], // diff -0.9
      D: [race({ raceId: "pool3", raceDate: "2026-01-01", raceTime: 119.2 })], // diff -0.6
      E: [race({ raceId: "pool4", raceDate: "2026-01-01", raceTime: 118.8 })], // diff -1.0
      F: [race({ raceId: "pool5", raceDate: "2026-01-01", raceTime: 119.0 })], // diff -0.8
    };
    const result = buildRaceHistory(raw, [baseline]);
    const target = result.A[0];

    expect(target.raceTimeBreakdown).not.toBeNull();
    expect(target.raceTimeBreakdown!.baseDiffSeconds).toBeCloseTo(2.2, 1);
    expect(target.raceTimeBreakdown!.trackAdjustment.adjustmentSeconds).toBeCloseTo(-0.8, 1);
    expect(target.raceTimeBreakdown!.trackAdjustedDiffSeconds).toBeCloseTo(1.4, 1);
  });

  it("同じレースの出走馬全員に同じraceTimeScoreが適用される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, raceTime: 118.0 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, raceTime: 118.5 })],
    };
    const result = buildRaceHistory(raw, [baseline]);
    expect(result.A[0].raceTimeScore).toBe(result.B[0].raceTimeScore);
  });

  it("raceScoreへ25%で反映される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", raceTime: 118.0 })],
    };
    const result = buildRaceHistory(raw, [baseline]);
    const target = result.A[0];
    const expectedRaceScore =
      target.memberLevelScoreAtRace * 0.3 +
      target.timeGapScore * 0.25 +
      target.raceTimeScore * 0.25 +
      target.final3FScore * 0.15 +
      target.weightScore * 0.05;
    expect(target.raceScore).toBeCloseTo(Math.round(expectedRaceScore * 10) / 10, 1);
  });

  it("baseAbilityが新raceTimeScore込みで再計算される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "a1", raceDate: "2026-01-01", raceTime: 118.0 }),
        race({ raceId: "a2", raceDate: "2026-02-01", raceTime: 119.5 }),
      ],
    };
    const result = buildRaceHistory(raw, [baseline]);
    const profile = buildHorseAbilityProfile("A", "馬A", result.A);
    expect(profile.baseAbility).toBeCloseTo(calculateBaseAbility(result.A), 5);
  });

  it("該当する基準タイムが無い場合はサンプル不足として壊れず、中立値にフォールバックする", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "no-baseline", raceDate: "2026-01-01", racecourse: "小倉", distance: 1800 })],
    };
    expect(() => buildRaceHistory(raw, [baseline])).not.toThrow();
    const result = buildRaceHistory(raw, [baseline]);
    expect(result.A[0].raceTimeScore).toBe(RACE_TIME_SCORE_CENTER);
    expect(result.A[0].raceTimeBreakdown).toBeNull();
  });

  it("raceTimeScoreが0〜100にclampされる", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "extreme", raceDate: "2026-01-01", raceTime: 60 })], // 極端に速い
    };
    const result = buildRaceHistory(raw, [baseline]);
    expect(result.A[0].raceTimeScore).toBeGreaterThanOrEqual(0);
    expect(result.A[0].raceTimeScore).toBeLessThanOrEqual(100);
  });
});

describe("buildRaceHistory と baselineMeta の接続（第7実装：baseline実データ投入基盤）", () => {
  it("raceTimeBreakdown.baselineMetaに完全一致（exact）が反映される", () => {
    const exactBaseline: CourseTimeBaseline = {
      racecourse: "札幌",
      surface: "turf",
      distance: 2000,
      going: "良",
      sampleYears: 5,
      sampleCount: 40,
      medianTimeSeconds: 119.8,
      source: "test-exact",
    };
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01" })],
    };
    const result = buildRaceHistory(raw, [exactBaseline]);
    expect(result.A[0].raceTimeBreakdown!.baselineMeta.baselineSource).toBe("exact");
    expect(result.A[0].raceTimeBreakdown!.baselineMeta.sampleCount).toBe(40);
    expect(result.A[0].raceTimeBreakdown!.baselineMeta.dataSource).toBe("test-exact");
  });

  it("raceTimeBreakdown.baselineMetaに馬場状態違いのdistanceFallbackが反映される", () => {
    // race()のgoing既定値は「良」。baseline側は「重」しか無いので②段階(distanceFallback)に落ちる
    const goingOnlyDifferentBaseline: CourseTimeBaseline = {
      racecourse: "札幌",
      surface: "turf",
      distance: 2000,
      going: "重",
      sampleYears: 5,
      sampleCount: 25,
      medianTimeSeconds: 121.0,
      source: "test-fallback",
    };
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01" })],
    };
    const result = buildRaceHistory(raw, [goingOnlyDifferentBaseline]);
    expect(result.A[0].raceTimeBreakdown).not.toBeNull();
    expect(result.A[0].raceTimeBreakdown!.baselineMeta.baselineSource).toBe("distanceFallback");
    expect(result.A[0].raceTimeBreakdown!.baselineMeta.sampleCount).toBe(25);
  });

  it("該当baselineが無い場合、raceTimeBreakdownはnullのまま（baselineMetaは存在しない）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", racecourse: "小倉", distance: 1800 })],
    };
    const result = buildRaceHistory(raw, []);
    expect(result.A[0].raceTimeBreakdown).toBeNull();
  });

  it("final3FBreakdown.baselineMetaに完全一致（exact）が反映される", () => {
    const exactBaseline: CourseFinal3FBaseline = {
      racecourse: "札幌",
      surface: "turf",
      distance: 2000,
      going: "良",
      sampleYears: 5,
      sampleCount: 40,
      medianFinal3FSeconds: 35.0,
      source: "test-exact",
    };
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01" })],
    };
    const result = buildRaceHistory(raw, [], [exactBaseline]);
    expect(result.A[0].final3FBreakdown.baselineMeta.baselineSource).toBe("exact");
    expect(result.A[0].final3FBreakdown.baselineMeta.sampleCount).toBe(40);
  });

  it("final3FBreakdownは該当baselineが無くてもnullにならず、baselineMeta.baselineSource=defaultFallbackになる", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", racecourse: "小倉", distance: 1800 })],
    };
    const result = buildRaceHistory(raw, [], []);
    expect(result.A[0].final3FBreakdown).not.toBeNull();
    expect(result.A[0].final3FBreakdown.courseBaselineSeconds).toBeNull();
    expect(result.A[0].final3FBreakdown.baselineMeta.baselineSource).toBe("defaultFallback");
    expect(result.A[0].final3FBreakdown.baselineMeta.sampleCount).toBeNull();
    expect(result.A[0].final3FBreakdown.baselineMeta.isReliable).toBe(false);
  });
});

describe("buildRaceHistory の final3FScore（上がり3Fスコア）", () => {
  const timeBaseline: CourseTimeBaseline = {
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    sampleYears: 5,
    sampleCount: 40,
    medianTimeSeconds: 119.8,
    source: "test",
  };
  const final3FBaseline: CourseFinal3FBaseline = {
    racecourse: "札幌",
    surface: "turf",
    distance: 2000,
    going: "良",
    sampleYears: 5,
    sampleCount: 40,
    medianFinal3FSeconds: 35.0,
    source: "test",
  };

  it("レース内上がり中央値が正しく計算される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, final3F: 34.0 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, final3F: 35.0 })],
      C: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 3, final3F: 36.0 })],
    };
    const result = buildRaceHistory(raw, [], []);
    // 中央値は35.0（[34,35,36]の中央）
    expect(result.A[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(35.0);
    expect(result.B[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(35.0);
    expect(result.C[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(35.0);
  });

  it("上がり順位を直接評価していない（同じ実タイムなら着順が違っても同じfinal3FScore）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, final3F: 34.5 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 5, final3F: 34.5 })],
      C: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 3, final3F: 36.0 })],
    };
    const result = buildRaceHistory(raw, [], []);
    // Aは1着・Bは5着だが上がりタイムが同じ34.5なのでfinal3FScoreも同じはず
    expect(result.A[0].final3FScore).toBe(result.B[0].final3FScore);
  });

  it("出走馬ごとに異なるfinal3FScoreになる（レース単位の共通値ではない）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, final3F: 33.5 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, final3F: 36.5 })],
    };
    const result = buildRaceHistory(raw, [], []);
    expect(result.A[0].final3FScore).not.toBe(result.B[0].final3FScore);
    expect(result.A[0].final3FScore).toBeGreaterThan(result.B[0].final3FScore);
  });

  it("対象レース自身を当日上がり補正の計算から除外できる（自己参照回避）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", final3F: 33.0 })], // 極端に速い上がり
      B: [race({ raceId: "pool1", raceDate: "2026-01-01", final3F: 35.1 })],
      C: [race({ raceId: "pool2", raceDate: "2026-01-01", final3F: 34.9 })],
    };
    const result = buildRaceHistory(raw, [], [final3FBaseline]);
    // targetの極端な33.0秒が当日上がり補正に混入していないこと
    expect(result.A[0].final3FBreakdown.trackAdjustment!.adjustmentSeconds).toBeCloseTo(35.0 - 35.0, 5);
  });

  it("trackAdjustedFinal3FDiffの符号が正しい（高速馬場で速い上がりを出した場合）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", raceNumber: 11, final3F: 34.2 })],
      B: [race({ raceId: "pool1", raceDate: "2026-01-01", raceNumber: 1, final3F: 34.5 })], // diff -0.5
      C: [race({ raceId: "pool2", raceDate: "2026-01-01", raceNumber: 2, final3F: 34.3 })], // diff -0.7
    };
    const result = buildRaceHistory(raw, [], [final3FBaseline]);
    const breakdown = result.A[0].final3FBreakdown;
    // courseBaselineDiff = 35.0 - 34.2 = +0.8
    // trackAdjustment = median(-0.5, -0.7) = -0.6
    // absoluteDiff = 0.8 + (-0.6) = +0.2
    expect(breakdown.absoluteDiffSeconds).toBeCloseTo(0.2, 5);
  });

  it("raceScoreへ15%で反映される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", raceTime: 118.0, final3F: 34.5 })],
    };
    const result = buildRaceHistory(raw, [timeBaseline], [final3FBaseline]);
    const target = result.A[0];
    const expectedRaceScore =
      target.memberLevelScoreAtRace * 0.3 +
      target.timeGapScore * 0.25 +
      target.raceTimeScore * 0.25 +
      target.final3FScore * 0.15 +
      target.weightScore * 0.05;
    expect(target.raceScore).toBeCloseTo(Math.round(expectedRaceScore * 10) / 10, 1);
  });

  it("baseAbilityが新final3FScore込みで再計算される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "a1", raceDate: "2026-01-01", final3F: 34.0 }),
        race({ raceId: "a2", raceDate: "2026-02-01", final3F: 35.5 }),
      ],
    };
    const result = buildRaceHistory(raw, [], [final3FBaseline]);
    const profile = buildHorseAbilityProfile("A", "馬A", result.A);
    expect(profile.baseAbility).toBeCloseTo(calculateBaseAbility(result.A), 5);
  });

  it("5年上がり基準が無い場合はサンプル不足として壊れず、レース内相対評価100%にフォールバックする", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, final3F: 34.0 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, final3F: 36.0 })],
    };
    expect(() => buildRaceHistory(raw, [], [])).not.toThrow();
    const result = buildRaceHistory(raw, [], []);
    expect(result.A[0].final3FBreakdown.courseBaselineSeconds).toBeNull();
    expect(result.A[0].final3FBreakdown.trackAdjustment).toBeNull();
    // 相対評価100%: final3FValue = relativeDiff = 35.0 - 34.0 = +1.0
    expect(result.A[0].final3FBreakdown.relativeDiffSeconds).toBeCloseTo(1.0, 5);
  });

  it("final3FScoreが0〜100にclampされる", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "extreme", raceDate: "2026-01-01", final3F: 10 })], // 極端に速い
    };
    const result = buildRaceHistory(raw, [], [final3FBaseline]);
    expect(result.A[0].final3FScore).toBeGreaterThanOrEqual(0);
    expect(result.A[0].final3FScore).toBeLessThanOrEqual(100);
  });

  it("final3FScoreのCENTER定数と一致する基準を持つ", () => {
    expect(FINAL3F_SCORE_CENTER).toBe(70);
  });

  describe("sampleReliabilityWeight / absoluteConfidence（第26実装）", () => {
    it("sampleCountが十分なbaseline(sc=40)ではweight=1.0・confidence=highになる", () => {
      const raw: Record<string, RaceHistoryRawInput[]> = {
        A: [race({ raceId: "target", raceDate: "2026-01-01", final3F: 34.5 })],
      };
      const result = buildRaceHistory(raw, [], [final3FBaseline]);
      const breakdown = result.A[0].final3FBreakdown;
      expect(breakdown.sampleReliabilityWeight).toBe(1);
      expect(breakdown.absoluteConfidence).toBe("high");
    });

    it("sampleCount=1(阪神2200重相当)のbaselineではweightが小さく縮小され、absolute寄与がほぼ相対評価だけになる", () => {
      const thinBaseline: CourseFinal3FBaseline = {
        racecourse: "阪神",
        surface: "turf",
        distance: 2200,
        going: "重",
        sampleYears: 1,
        sampleCount: 1,
        medianFinal3FSeconds: 36.85,
        source: "JRA確認済みサンプル(n=1レース) verified",
      };
      const raw: Record<string, RaceHistoryRawInput[]> = {
        A: [
          race({
            raceId: "target",
            raceDate: "2026-01-01",
            racecourse: "阪神",
            distance: 2200,
            going: "重",
            final3F: 36.9,
          }),
        ],
      };
      const result = buildRaceHistory(raw, [], [thinBaseline]);
      const breakdown = result.A[0].final3FBreakdown;
      expect(breakdown.sampleReliabilityWeight).toBeLessThanOrEqual(0.1);
      expect(breakdown.absoluteConfidence).toBe("low");

      // 同じrelativeDiff/absoluteDiffで、weight=1.0のときと比べてabsoluteの影響がほぼ消えていることを確認
      const scoreWithThinWeight = result.A[0].final3FScore;
      const fullWeightBaseline: CourseFinal3FBaseline = { ...thinBaseline, sampleCount: 15 };
      const resultFull = buildRaceHistory(raw, [], [fullWeightBaseline]);
      const scoreWithFullWeight = resultFull.A[0].final3FScore;
      // 同じ実データ（relativeDiff・absoluteDiffの値自体）でも、confidenceが低いほうがscoreは
      // relative評価（このケースではabsoluteより悪い値）寄りになり、両者は異なる値になるはず
      expect(scoreWithThinWeight).not.toBe(scoreWithFullWeight);
    });

    it("baselineが見つからない場合（defaultFallback）はweight/confidenceともnull", () => {
      const raw: Record<string, RaceHistoryRawInput[]> = {
        A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, final3F: 34.0 })],
        B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, final3F: 36.0 })],
      };
      const result = buildRaceHistory(raw, [], []);
      expect(result.A[0].final3FBreakdown.sampleReliabilityWeight).toBeNull();
      expect(result.A[0].final3FBreakdown.absoluteConfidence).toBeNull();
    });

    it("V0仮データ由来のbaselineはweight=0・confidence=lowになる（sampleCountが大きくても信じない）", () => {
      const placeholderBaseline: CourseFinal3FBaseline = {
        racecourse: "阪神",
        surface: "turf",
        distance: 2000,
        going: "重",
        sampleYears: 5,
        sampleCount: 30,
        medianFinal3FSeconds: 34,
        source: "V0テスト用仮データ（実データ未投入）",
      };
      const raw: Record<string, RaceHistoryRawInput[]> = {
        A: [
          race({
            raceId: "target",
            raceDate: "2026-01-01",
            racecourse: "阪神",
            distance: 2000,
            going: "重",
            final3F: 34.5,
          }),
        ],
      };
      const result = buildRaceHistory(raw, [], [placeholderBaseline]);
      const breakdown = result.A[0].final3FBreakdown;
      expect(breakdown.sampleReliabilityWeight).toBe(0);
      expect(breakdown.absoluteConfidence).toBe("low");
    });
  });
});

describe("buildRaceHistory の weightScore（斤量補正スコア）", () => {
  it("出走馬ごとに異なるweightScoreになる（重斤量ほど高評価）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, carriedWeight: 59 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, carriedWeight: 55 })],
    };
    const result = buildRaceHistory(raw);
    expect(result.A[0].weightScore).toBeGreaterThan(result.B[0].weightScore);
  });

  it("raceScoreへ5%で反映される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", carriedWeight: 58 })],
      B: [race({ raceId: "target", raceDate: "2026-01-01", finishPosition: 2, carriedWeight: 55 })],
    };
    const result = buildRaceHistory(raw);
    const target = result.A[0];
    const expectedRaceScore =
      target.memberLevelScoreAtRace * 0.3 +
      target.timeGapScore * 0.25 +
      target.raceTimeScore * 0.25 +
      target.final3FScore * 0.15 +
      target.weightScore * 0.05;
    expect(target.raceScore).toBeCloseTo(Math.round(expectedRaceScore * 10) / 10, 1);
  });

  it("baseAbilityが新weightScore込みで再計算される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        race({ raceId: "a1", raceDate: "2026-01-01", carriedWeight: 58 }),
        race({ raceId: "a2", raceDate: "2026-02-01", carriedWeight: 54 }),
      ],
    };
    const result = buildRaceHistory(raw);
    const profile = buildHorseAbilityProfile("A", "馬A", result.A);
    expect(profile.baseAbility).toBeCloseTo(calculateBaseAbility(result.A), 5);
  });

  it("欠損時（不正な斤量データ）でも壊れず、中立値にフォールバックする", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "broken", raceDate: "2026-01-01", carriedWeight: -1 })],
    };
    expect(() => buildRaceHistory(raw)).not.toThrow();
    const result = buildRaceHistory(raw);
    expect(result.A[0].weightScore).toBe(70);
    expect(result.A[0].weightBreakdown.isReliable).toBe(false);
  });

  it("weightScoreが0〜100にclampされる", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", carriedWeight: 90, distance: 3200 })],
      B: [race({ raceId: "target", raceDate: "2026-01-01", finishPosition: 2, carriedWeight: 40, distance: 3200 })],
    };
    const result = buildRaceHistory(raw);
    expect(result.A[0].weightScore).toBeGreaterThanOrEqual(0);
    expect(result.A[0].weightScore).toBeLessThanOrEqual(100);
    expect(result.B[0].weightScore).toBeGreaterThanOrEqual(0);
    expect(result.B[0].weightScore).toBeLessThanOrEqual(100);
  });
});

describe("buildRaceHistory の raceFieldAggregatesByRaceId（第11実装：ロスター外対戦馬の集団統計上書き）", () => {
  it("上書きが無い場合は、従来どおり手持ちの出走馬（自馬のみ）から中央値を計算する（退化ケース）", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "solo", raceDate: "2026-01-01", carriedWeight: 57, final3F: 34.5 })],
    };
    const result = buildRaceHistory(raw, [], []);
    expect(result.A[0].weightBreakdown.raceMedianWeightKg).toBe(57);
    expect(result.A[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(34.5);
  });

  it("上書きがあれば、自馬のみの退化中央値ではなく上書き値がraceMedianWeightKg/raceFinal3FMedianSecondsに使われる", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", carriedWeight: 57, final3F: 34.5 })],
    };
    const aggregate: RaceFieldAggregate = {
      raceId: "target",
      fieldCount: 14,
      raceMedianWeightKg: 55.0,
      raceMedianFinal3FSeconds: 33.8,
      source: "test",
    };
    const result = buildRaceHistory(raw, [], [], { target: aggregate });
    expect(result.A[0].weightBreakdown.raceMedianWeightKg).toBe(55.0);
    expect(result.A[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(33.8);
    // weightDiffKgも上書き後の中央値との差になる（57 - 55 = 2）
    expect(result.A[0].weightBreakdown.weightDiffKg).toBeCloseTo(2, 5);
  });

  it("上書きされたraceMedianWeightKg/raceFinal3FMedianSecondsに応じてweightScore/final3FScoreが変化する", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "target", raceDate: "2026-01-01", carriedWeight: 57, final3F: 34.5 })],
    };
    const withoutOverride = buildRaceHistory(raw, [], []).A[0];
    const aggregate: RaceFieldAggregate = {
      raceId: "target",
      fieldCount: 14,
      raceMedianWeightKg: 55.0,
      raceMedianFinal3FSeconds: 33.8,
      source: "test",
    };
    const withOverride = buildRaceHistory(raw, [], [], { target: aggregate }).A[0];
    expect(withOverride.weightScore).not.toBe(withoutOverride.weightScore);
    expect(withOverride.final3FScore).not.toBe(withoutOverride.final3FScore);
  });

  it("該当raceIdに一致しない上書きは無視され、他のレースの計算に影響しない", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "unrelated", raceDate: "2026-01-01", carriedWeight: 57, final3F: 34.5 })],
    };
    const aggregate: RaceFieldAggregate = {
      raceId: "different-race",
      fieldCount: 14,
      raceMedianWeightKg: 55.0,
      raceMedianFinal3FSeconds: 33.8,
      source: "test",
    };
    const result = buildRaceHistory(raw, [], [], { "different-race": aggregate });
    expect(result.A[0].weightBreakdown.raceMedianWeightKg).toBe(57);
    expect(result.A[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(34.5);
  });

  it("複数頭が同じraceIdを共有する場合でも、上書きがあればそちらが優先される", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 1, carriedWeight: 56, final3F: 34.0 })],
      B: [race({ raceId: "shared", raceDate: "2026-01-01", finishPosition: 2, carriedWeight: 58, final3F: 35.0 })],
    };
    const aggregate: RaceFieldAggregate = {
      raceId: "shared",
      fieldCount: 14,
      raceMedianWeightKg: 55.0,
      raceMedianFinal3FSeconds: 33.8,
      source: "test",
    };
    const result = buildRaceHistory(raw, [], [], { shared: aggregate });
    expect(result.A[0].weightBreakdown.raceMedianWeightKg).toBe(55.0);
    expect(result.B[0].weightBreakdown.raceMedianWeightKg).toBe(55.0);
    expect(result.A[0].final3FBreakdown.raceFinal3FMedianSeconds).toBe(33.8);
  });
});

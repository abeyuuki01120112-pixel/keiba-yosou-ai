/**
 * 単発の RacePerformance を組み立てるヘルパー（主にテスト・単体動作確認用）。
 * memberLevelScoreAtRace・raceTimeScore・final3FScore は既知の値として受け取り、
 * timeGapScore・raceScoreをここで一元的に計算する。
 *
 * 実際のデータロードでは、複数馬の履歴を横断して memberLevelScoreAtRace・
 * raceTimeScore・final3FScore 自体を算出する必要があるため
 * raceHistoryPipeline.buildRaceHistory() を使う。
 */

import { calculateRaceScore } from "./raceScore";
import { calculateTimeGapScore } from "./timeGapScore";
import type { Final3FBreakdown, RacePerformance } from "./types";

const EMPTY_FINAL3F_BREAKDOWN: Final3FBreakdown = {
  horseFinal3FSeconds: 0,
  raceFinal3FMedianSeconds: 0,
  relativeDiffSeconds: 0,
  courseBaselineSeconds: null,
  trackAdjustment: null,
  absoluteDiffSeconds: null,
};

export type RacePerformanceInput = Omit<
  RacePerformance,
  | "timeGapScore"
  | "raceScore"
  | "retrospectiveMemberLevelScore"
  | "memberLevelBreakdown"
  | "raceTimeBreakdown"
  | "final3FBreakdown"
> &
  Partial<
    Pick<
      RacePerformance,
      "retrospectiveMemberLevelScore" | "memberLevelBreakdown" | "raceTimeBreakdown" | "final3FBreakdown"
    >
  >;

export function buildRacePerformance(input: RacePerformanceInput): RacePerformance {
  const timeGapScore = calculateTimeGapScore(input.timeGap, input.distance);
  const raceScore = calculateRaceScore({
    memberLevelScoreAtRace: input.memberLevelScoreAtRace,
    timeGapScore,
    raceTimeScore: input.raceTimeScore,
    final3FScore: input.final3FScore,
    weightScore: input.weightScore,
  });

  return {
    ...input,
    retrospectiveMemberLevelScore: input.retrospectiveMemberLevelScore ?? null,
    memberLevelBreakdown: input.memberLevelBreakdown ?? null,
    raceTimeBreakdown: input.raceTimeBreakdown ?? null,
    final3FBreakdown: input.final3FBreakdown ?? EMPTY_FINAL3F_BREAKDOWN,
    timeGapScore,
    raceScore,
  };
}

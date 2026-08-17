/**
 * 単発の RacePerformance を組み立てるヘルパー（主にテスト・単体動作確認用）。
 * memberLevelScoreAtRace・raceTimeScore は既知の値として受け取り、
 * timeGapScore・raceScoreをここで一元的に計算する。
 *
 * 実際のデータロードでは、複数馬の履歴を横断して memberLevelScoreAtRace・
 * raceTimeScore 自体を算出する必要があるため raceHistoryPipeline.buildRaceHistory() を使う。
 */

import { calculateRaceScore } from "./raceScore";
import { calculateTimeGapScore } from "./timeGapScore";
import type { RacePerformance } from "./types";

export type RacePerformanceInput = Omit<
  RacePerformance,
  "timeGapScore" | "raceScore" | "retrospectiveMemberLevelScore" | "memberLevelBreakdown" | "raceTimeBreakdown"
> &
  Partial<Pick<RacePerformance, "retrospectiveMemberLevelScore" | "memberLevelBreakdown" | "raceTimeBreakdown">>;

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
    timeGapScore,
    raceScore,
  };
}

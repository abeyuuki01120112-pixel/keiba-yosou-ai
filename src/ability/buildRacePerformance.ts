/**
 * 単発の RacePerformance を組み立てるヘルパー（主にテスト・単体動作確認用）。
 * memberLevelScoreAtRace は既知の値として受け取り、timeGapScore・raceScoreを
 * ここで一元的に計算する。
 *
 * 実際のデータロードでは、複数馬の履歴を横断して memberLevelScoreAtRace 自体を
 * 算出する必要があるため raceHistoryPipeline.buildRaceHistory() を使う。
 */

import { calculateRaceScore } from "./raceScore";
import { calculateTimeGapScore } from "./timeGapScore";
import type { RacePerformance } from "./types";

export type RacePerformanceInput = Omit<
  RacePerformance,
  "timeGapScore" | "raceScore" | "retrospectiveMemberLevelScore" | "memberLevelBreakdown"
> &
  Partial<Pick<RacePerformance, "retrospectiveMemberLevelScore" | "memberLevelBreakdown">>;

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
    timeGapScore,
    raceScore,
  };
}

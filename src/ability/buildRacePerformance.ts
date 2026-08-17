/**
 * 生データ（実績値＋仮のサブスコア）からRacePerformanceを組み立てるヘルパー。
 * timeGapScore・raceScoreを毎回手計算しなくて済むよう、ここで一元的に計算する。
 * データ層（sampleData等）はこの関数を経由することで、
 * UIやテストにハードコードした計算結果を直書きしない構造にする。
 */

import { calculateRaceScore } from "./raceScore";
import { calculateTimeGapScore } from "./timeGapScore";
import type { RacePerformance } from "./types";

export type RacePerformanceInput = Omit<RacePerformance, "timeGapScore" | "raceScore">;

export function buildRacePerformance(input: RacePerformanceInput): RacePerformance {
  const timeGapScore = calculateTimeGapScore(input.timeGap, input.distance);
  const raceScore = calculateRaceScore({
    memberLevelScore: input.memberLevelScore,
    timeGapScore,
    raceTimeScore: input.raceTimeScore,
    final3FScore: input.final3FScore,
    weightScore: input.weightScore,
  });

  return { ...input, timeGapScore, raceScore };
}

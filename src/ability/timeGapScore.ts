/**
 * タイム差スコア（V0）。
 * 着順そのものではなく、勝ち馬とのタイム差を距離補正した上で評価する。
 */

import { clamp } from "../simulation/probability";

const REFERENCE_DISTANCE = 2000;
const BASE_SCORE = 90;
const SECONDS_PENALTY_PER_UNIT = 28;

/**
 * 距離補正込みのタイム差スコアを計算する。
 * timeGap: 勝ち馬とのタイム差（秒）。負けた馬は正の値、
 *          勝った馬は2着馬につけた着差をマイナス値として渡す。
 * distance: レース距離（メートル）。
 */
export function calculateTimeGapScore(timeGap: number, distance: number): number {
  const adjustedTimeGap = timeGap * (REFERENCE_DISTANCE / distance);
  const score = BASE_SCORE - SECONDS_PENALTY_PER_UNIT * adjustedTimeGap;
  return clamp(score, 0, 100);
}

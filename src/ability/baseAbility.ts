/**
 * baseAbility（基礎能力）の計算。
 * 直近5走のraceScoreを均等20%ずつ平均する。前走を特別に重くしない。
 *
 * Ability Model V1として2026-08-22に正式確定・凍結（docs/ability-model-v1.md）。
 */

import { roundToOneDecimal } from "./raceScore";
import type { RacePerformance } from "./types";

export const RECENT_RACE_COUNT = 5;

/**
 * 直近5走（多くても5走、それ未満ならある分だけ）を均等平均してbaseAbilityを算出する。
 * recentRacesは新しい順（[0]が前走）を想定。
 *
 * 【重要・2026-08-19正式決定（docs/step6-decisions.md 1-4）】
 * recentRacesが0件の場合、やむを得ず数値として0を返す。**この0は「能力0点」ではない。**
 * 「評価不能／データ不足」を意味する。呼び出し側（現状はSTEP6のstabilityFactor.ts・
 * outcomeScore.ts・outcomeProbability.tsを経由してHorseOutcomeResultに伝播する）は、
 * この0を「本当に能力の低い馬」と区別できていない（既知の課題。将来UI統合時にrecentRaces
 * が空だったかどうかを別途判定できる構造を検討する。TODO・現時点では未実装）。
 */
export function calculateBaseAbility(recentRaces: RacePerformance[]): number {
  const races = recentRaces.slice(0, RECENT_RACE_COUNT);
  if (races.length === 0) return 0; // 「能力0点」ではなく「評価不能／データ不足」の意味

  const total = races.reduce((sum, race) => sum + race.raceScore, 0);
  return roundToOneDecimal(total / races.length);
}

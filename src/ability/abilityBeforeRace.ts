/**
 * abilityBeforeRace: 「対象レースより前に確定していた過去走だけ」から作る能力値。
 * memberLevelScoreAtRace の算出に使う。未来情報リークと循環参照を防ぐための要。
 */

import { roundToOneDecimal } from "./raceScore";

export const MAX_PRIOR_RACES_FOR_ABILITY = 5;

/**
 * 確定済み（対象レースより前）のraceScore一覧から abilityBeforeRace を計算する。
 * 過去走が1走も無い場合は null（=集計対象から除外。安全側に倒す）。
 * 5走を超える分は直近5走のみを使う。
 */
export function calculateAbilityBeforeRace(priorRaceScoresNewestFirst: number[]): number | null {
  if (priorRaceScoresNewestFirst.length === 0) return null;
  const recent = priorRaceScoresNewestFirst.slice(0, MAX_PRIOR_RACES_FOR_ABILITY);
  return roundToOneDecimal(recent.reduce((sum, v) => sum + v, 0) / recent.length);
}

/**
 * STEP5（第23実装）: manualTrackBias / manualRaceReview のfuture leakage防止ガード。
 *
 * 予想時点より後の情報を絶対に使用しない。対象レース自身の結果・回顧・
 * レース終了後に判明したバイアスは事前予想には使えない。
 *   ①対象レース自身からの観測は禁止（自己参照禁止）
 *   ②対象レースより後の日付からの観測は禁止
 *   ③同日の場合は、対象レースより前のレース番号からの観測のみ許可
 *     （例: メイン11Rの予想には1R〜10Rの当日傾向のみ使用可）
 */

import type { ManualRaceReviewNote, RaceContextTargetInfo, TrackBiasObservation } from "./raceContextTypes";

export function isTrackBiasEligible(observation: TrackBiasObservation, target: RaceContextTargetInfo): boolean {
  if (observation.observedRaceId === target.raceId) return false;
  if (observation.observedRaceDate > target.raceDate) return false;

  if (observation.observedRaceDate === target.raceDate) {
    if (target.raceNumber === null || observation.observedRaceNumber === null) return false;
    return observation.observedRaceNumber < target.raceNumber;
  }

  // 前日以前の観測はOK（confidenceの扱いはdayRelationで別途区別する）
  return true;
}

/** 対象馬自身の過去レースについての回顧のみ使用可。対象レース自身の回顧は禁止 */
export function isRaceReviewEligible(note: ManualRaceReviewNote, target: RaceContextTargetInfo): boolean {
  if (note.raceId === target.raceId) return false;
  if (note.raceDate > target.raceDate) return false;
  return true;
}

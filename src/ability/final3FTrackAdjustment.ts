/**
 * 当日上がり馬場補正の計算。第3実装の当日馬場補正と同じ思想。
 *
 * 対象レースを除いた同日・同競馬場・同surfaceのレース群について、
 * 「そのレースの上がり中央値 - その条件の5年上がり基準」を求め、中央値を補正値とする。
 * 自己参照防止（対象レース自身は除外）・サンプル不足防止（勝手に大きな補正を作らない）は
 * 第3実装のtrackAdjustment.tsと同じ方針。
 */

import { findCourseFinal3FBaseline } from "./courseFinal3FBaseline";
import { median } from "../simulation/probability";
import type { CourseFinal3FBaseline, Surface, TrackBiasTimeAdjustment } from "./types";

/** これ未満のサンプル数では補正を信頼しない（V0暫定値） */
export const MIN_FINAL3F_ADJUSTMENT_SAMPLE_COUNT = 2;

export interface DayFinal3FRecord {
  raceId: string;
  raceDate: string;
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  /** そのレースの完走馬・上がり3F中央値（秒） */
  raceFinal3FMedianSeconds: number;
}

/**
 * target を除いた「同日・同競馬場・同surface」のレース群から当日上がり補正を計算する。
 * allRaces には target 自身が含まれていてもよい（ここで除外する）。
 */
export function calculateFinal3FTrackAdjustment(
  target: Pick<DayFinal3FRecord, "raceId" | "raceDate" | "racecourse" | "surface">,
  allRaces: DayFinal3FRecord[],
  baselines: CourseFinal3FBaseline[],
): TrackBiasTimeAdjustment {
  const pool = allRaces.filter(
    (r) =>
      r.raceId !== target.raceId &&
      r.raceDate === target.raceDate &&
      r.racecourse === target.racecourse &&
      r.surface === target.surface,
  );

  const diffs: number[] = [];
  for (const r of pool) {
    const baseline = findCourseFinal3FBaseline(baselines, r.racecourse, r.surface, r.distance, r.going);
    if (!baseline) continue;
    diffs.push(r.raceFinal3FMedianSeconds - baseline.medianFinal3FSeconds);
  }

  if (diffs.length < MIN_FINAL3F_ADJUSTMENT_SAMPLE_COUNT) {
    return { adjustmentSeconds: 0, sampleCount: diffs.length, isReliable: false };
  }

  return {
    adjustmentSeconds: median(diffs),
    sampleCount: diffs.length,
    isReliable: true,
  };
}

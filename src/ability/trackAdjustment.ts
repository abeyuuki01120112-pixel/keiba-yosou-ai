/**
 * 当日馬場補正の計算。
 *
 * 「絶対時計」と「馬場による時計の出やすさ」を分離するため、対象レースを除いた
 * 同日・同競馬場・同surfaceのレース群から、その日その馬場がどれだけ基準タイムより
 * 速い/遅いかを中央値で求める。
 *
 * 自己参照防止：対象レース自身は必ずプールから除外する。
 * サンプル不足防止：プールが少なすぎる場合は勝手に大きな補正を作らず、
 *   adjustmentSeconds=0・isReliable=false のまま返す（1箇所で閾値を調整できる）。
 */

import { lookupCourseTimeBaseline } from "./courseTimeBaseline";
import { median } from "../simulation/probability";
import type { CourseTimeBaseline, Surface, TrackBiasTimeAdjustment } from "./types";

/** これ未満のサンプル数では補正を信頼しない（V0暫定値） */
export const MIN_TRACK_ADJUSTMENT_SAMPLE_COUNT = 2;

export interface DayRaceRecord {
  raceId: string;
  raceDate: string;
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  /** そのレースの公式タイム（通常は勝ち馬の走破タイム）秒 */
  officialTimeSeconds: number;
}

/**
 * target を除いた「同日・同競馬場・同surface」のレース群から当日馬場補正を計算する。
 * allRaces には target 自身が含まれていてもよい（ここで除外する）。
 */
export function calculateTrackAdjustment(
  target: Pick<DayRaceRecord, "raceId" | "raceDate" | "racecourse" | "surface">,
  allRaces: DayRaceRecord[],
  baselines: CourseTimeBaseline[],
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
    const { baseline } = lookupCourseTimeBaseline(baselines, r.racecourse, r.surface, r.distance, r.going);
    if (!baseline) continue;
    diffs.push(r.officialTimeSeconds - baseline.medianTimeSeconds);
  }

  if (diffs.length < MIN_TRACK_ADJUSTMENT_SAMPLE_COUNT) {
    return { adjustmentSeconds: 0, sampleCount: diffs.length, isReliable: false };
  }

  return {
    adjustmentSeconds: median(diffs),
    sampleCount: diffs.length,
    isReliable: true,
  };
}

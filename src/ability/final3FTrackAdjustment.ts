/**
 * 当日上がり馬場補正の計算。第3実装の当日馬場補正と同じ思想。
 *
 * 対象レースを除いた同日・同競馬場・同surfaceのレース群について、
 * 「そのレースの上がり中央値 - その条件の5年上がり基準」を求め、中央値を補正値とする。
 * 自己参照防止（対象レース自身は除外）・サンプル不足防止（勝手に大きな補正を作らない）は
 * 第3実装のtrackAdjustment.tsと同じ方針。
 *
 * 第26実装で2点の安全策を追加：
 *   ①仮データ混入防止: 参照する他レースのbaselineがisReliable=false
 *     （sampleCount不足、またはV0仮データ由来でisPlaceholderSource）の場合は、
 *     その差分をdiffsに含めない（実データのみで補正を組み立てる）。
 *   ②同日future leakage防止: raceNumberが分かる場合、対象レースより後（同じ/後の番号）の
 *     レースはプールから除外する。raceNumberが不明（null/undefined）なレースは、
 *     事前予測用途では安全側に倒し、target・候補レースのどちらか一方でも不明なら使わない。
 */

import { lookupCourseFinal3FBaseline } from "./courseFinal3FBaseline";
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
  /** レース番号（1R,2R…）。同日future leakage判定に使う。不明ならnull（安全側扱い） */
  raceNumber?: number | null;
}

/**
 * target を除いた「同日・同競馬場・同surface・対象レースより前のレース番号」の
 * レース群から当日上がり補正を計算する。allRaces には target 自身が含まれていてもよい
 * （ここで除外する）。
 */
export function calculateFinal3FTrackAdjustment(
  target: Pick<DayFinal3FRecord, "raceId" | "raceDate" | "racecourse" | "surface" | "raceNumber">,
  allRaces: DayFinal3FRecord[],
  baselines: CourseFinal3FBaseline[],
): TrackBiasTimeAdjustment {
  const targetRaceNumber = target.raceNumber ?? null;

  const pool = allRaces.filter((r) => {
    if (r.raceId === target.raceId) return false;
    if (r.raceDate !== target.raceDate) return false;
    if (r.racecourse !== target.racecourse) return false;
    if (r.surface !== target.surface) return false;

    // future leakage防止: raceNumberが分かる場合のみ、対象より前のレースを許可する。
    // どちらか一方でも不明なら安全側に倒し、同日プールへは含めない。
    const candidateRaceNumber = r.raceNumber ?? null;
    if (targetRaceNumber === null || candidateRaceNumber === null) return false;
    return candidateRaceNumber < targetRaceNumber;
  });

  const diffs: number[] = [];
  for (const r of pool) {
    const { baseline, meta } = lookupCourseFinal3FBaseline(baselines, r.racecourse, r.surface, r.distance, r.going);
    if (!baseline) continue;
    // 仮データ・低サンプルのbaselineは実データのように扱わない
    if (!meta.isReliable) continue;
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

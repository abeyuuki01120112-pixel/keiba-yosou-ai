/**
 * horseIdごとに raceDate で並べ替え、指定日より前の直近N走を取得するユーティリティ。
 * 「対象レース時点より前」を厳密にstrictly-beforeで絞り込むことで、
 * 未来情報リークを起こさない（beforeDateと同日・それより後のレースは含めない）。
 *
 * ※ ability計算パイプライン（raceHistoryPipeline）は全レースを日付昇順に処理して
 * 同じ安全性を内部で担保しているが、これはインポートしたデータをその場で確認・検証する
 * ための独立したユーティリティとして提供する。
 */

import type { RacePerformanceInput } from "./types";

export interface RecentRacesOptions {
  /** これより前（strictly-before）のレースだけを対象にする。省略時は全レースが対象 */
  beforeDate?: string;
  /** 取得する最大件数（デフォルト5） */
  limit?: number;
}

export function getRecentRacePerformances(
  horseId: string,
  performances: RacePerformanceInput[],
  options: RecentRacesOptions = {},
): RacePerformanceInput[] {
  const { beforeDate, limit = 5 } = options;
  const beforeTime = beforeDate ? Date.parse(beforeDate) : Number.POSITIVE_INFINITY;

  return performances
    .filter((p) => p.horseId === horseId)
    .filter((p) => Date.parse(p.raceDate) < beforeTime)
    .sort((a, b) => Date.parse(b.raceDate) - Date.parse(a.raceDate))
    .slice(0, limit);
}

/**
 * CSVテキスト → normalize → 検証済みデータ の一括処理。
 * ability計算（raceHistoryPipeline.buildRaceHistory）にそのまま渡せる
 * horseId別のRaceHistoryRawInput[]を組み立てる。
 *
 * 欠損項目（finishPosition/carriedWeightKg/actualRaceTimeSeconds/final3FSeconds/
 * timeGapSecondsのいずれかがnull）がある行は、能力計算対象から安全に除外する
 * （0など勝手な値で埋めない）。
 */

import { parseCsv } from "./csvParser";
import { normalizeRacePerformance } from "./normalize";
import type { RaceHistoryRawInput } from "../raceHistoryPipeline";
import type { ImportError, RacePerformanceInput } from "./types";

export interface ImportResult {
  totalRows: number;
  normalizedCount: number;
  excludedFromScoringCount: number;
  errorCount: number;
  errors: ImportError[];
  /** horseId -> ability計算にそのまま使える形（欠損のある行は含まない） */
  byHorseId: Record<string, RaceHistoryRawInput[]>;
  /** normalizeには成功したが、欠損があり能力計算対象から除外された行 */
  excluded: RacePerformanceInput[];
  /** normalizeに成功し、能力計算にも使われた行 */
  usable: RacePerformanceInput[];
}

/**
 * 欠損の無い行だけを ability計算用の RaceHistoryRawInput に変換する。
 * 1項目でも欠損（null）があれば変換せずnullを返す（呼び出し側で除外扱いにする）。
 */
export function toRaceHistoryRawInput(input: RacePerformanceInput): RaceHistoryRawInput | null {
  const { finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds } = input;
  if (
    finishPosition === null ||
    carriedWeightKg === null ||
    actualRaceTimeSeconds === null ||
    final3FSeconds === null ||
    timeGapSeconds === null
  ) {
    return null;
  }

  return {
    raceId: input.raceId,
    raceName: input.raceName,
    raceDate: input.raceDate,
    racecourse: input.racecourse,
    surface: input.surface,
    distance: input.distance,
    going: input.going,
    finishPosition,
    timeGap: timeGapSeconds,
    raceTime: actualRaceTimeSeconds,
    final3F: final3FSeconds,
    carriedWeight: carriedWeightKg,
  };
}

export function buildImportResult(csvText: string): ImportResult {
  const rows = parseCsv(csvText);

  const errors: ImportError[] = [];
  const usable: RacePerformanceInput[] = [];
  const excluded: RacePerformanceInput[] = [];
  const byHorseId: Record<string, RaceHistoryRawInput[]> = {};

  rows.forEach((row, idx) => {
    const result = normalizeRacePerformance(row, idx + 1);
    if (!result.ok) {
      errors.push(result.error);
      return;
    }

    const engineInput = toRaceHistoryRawInput(result.data);
    if (engineInput === null) {
      excluded.push(result.data);
      return;
    }

    usable.push(result.data);
    const list = byHorseId[result.data.horseId] ?? [];
    list.push(engineInput);
    byHorseId[result.data.horseId] = list;
  });

  return {
    totalRows: rows.length,
    normalizedCount: usable.length + excluded.length,
    excludedFromScoringCount: excluded.length,
    errorCount: errors.length,
    errors,
    byHorseId,
    excluded,
    usable,
  };
}

/**
 * baseline CSVテキスト → normalize → 検証済みbaseline配列 の一括処理。
 * courseTimeBaselines.json / courseFinal3FBaselines.json にそのまま書き込める形を返す。
 */

import { parseCsv } from "./csvParser";
import {
  normalizeCourseFinal3FBaselineRow,
  normalizeCourseTimeBaselineRow,
  type CourseFinal3FBaselineInput,
  type CourseTimeBaselineInput,
} from "./normalizeBaseline";
import type { ImportError } from "./types";

/** CSVに含まれていても保存しない列（検索時に毎回計算しなおすため） */
const IGNORED_COLUMN_NAMES = ["baselineSource", "isReliable"];

export interface BaselineImportResult<T> {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: ImportError[];
  baselines: T[];
  /** CSVに存在したが読み捨てた列名（baselineSource/isReliableなど） */
  ignoredColumns: string[];
}

function detectIgnoredColumns(rows: Record<string, string>[]): string[] {
  if (rows.length === 0) return [];
  return IGNORED_COLUMN_NAMES.filter((c) => c in rows[0]);
}

function conditionKey(b: { racecourse: string; surface: string; distance: number; going: string }): string {
  return `${b.racecourse}|${b.surface}|${b.distance}|${b.going}`;
}

/** racecourse×surface×distance×goingの重複行をエラーとして検出する（後勝ちで上書きしない） */
function detectDuplicateConditionErrors<T extends { racecourse: string; surface: string; distance: number; going: string }>(
  baselines: T[],
  rowIndexes: number[],
): ImportError[] {
  const seenAtRow = new Map<string, number>();
  const errors: ImportError[] = [];
  baselines.forEach((b, i) => {
    const key = conditionKey(b);
    const firstRow = seenAtRow.get(key);
    if (firstRow !== undefined) {
      errors.push({
        rowIndex: rowIndexes[i],
        message: `条件 (${key}) は行${firstRow}と重複しています`,
      });
    } else {
      seenAtRow.set(key, rowIndexes[i]);
    }
  });
  return errors;
}

export function buildCourseTimeBaselineImportResult(csvText: string): BaselineImportResult<CourseTimeBaselineInput> {
  const rows = parseCsv(csvText);
  const errors: ImportError[] = [];
  const baselines: CourseTimeBaselineInput[] = [];
  const rowIndexes: number[] = [];

  rows.forEach((row, idx) => {
    const result = normalizeCourseTimeBaselineRow(row, idx + 1);
    if (!result.ok) {
      errors.push(result.error);
      return;
    }
    baselines.push(result.data);
    rowIndexes.push(idx + 1);
  });

  errors.push(...detectDuplicateConditionErrors(baselines, rowIndexes));

  return {
    totalRows: rows.length,
    validCount: baselines.length,
    errorCount: errors.length,
    errors,
    baselines,
    ignoredColumns: detectIgnoredColumns(rows),
  };
}

export function buildCourseFinal3FBaselineImportResult(
  csvText: string,
): BaselineImportResult<CourseFinal3FBaselineInput> {
  const rows = parseCsv(csvText);
  const errors: ImportError[] = [];
  const baselines: CourseFinal3FBaselineInput[] = [];
  const rowIndexes: number[] = [];

  rows.forEach((row, idx) => {
    const result = normalizeCourseFinal3FBaselineRow(row, idx + 1);
    if (!result.ok) {
      errors.push(result.error);
      return;
    }
    baselines.push(result.data);
    rowIndexes.push(idx + 1);
  });

  errors.push(...detectDuplicateConditionErrors(baselines, rowIndexes));

  return {
    totalRows: rows.length,
    validCount: baselines.length,
    errorCount: errors.length,
    errors,
    baselines,
    ignoredColumns: detectIgnoredColumns(rows),
  };
}

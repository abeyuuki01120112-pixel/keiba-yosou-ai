/**
 * raw CSV行 → 検証済み baseline（CourseTimeBaseline/CourseFinal3FBaseline用）への正規化。
 *
 * 第7実装の方針：
 *   「baselineの計算式を変えるのではなく、仮値を実データへ差し替える入口を作るだけ」
 * そのため、ここでは racecourse/surface/distance/going/sampleYears/sampleCount/
 * medianTimeSeconds（またはmedianFinal3FSeconds）/source の検証・変換のみを行う。
 *
 * CSVに baselineSource・isReliable 列が含まれていても、それらは検索時（lookupCourseTimeBaseline等）に
 * 毎回計算しなおす値であり、保存された値をそのまま信頼すると古い判定が残るため、
 * ここでは読み捨てる（buildBaselineImportResult側でその旨をCLI出力に表示する）。
 */

import type { ImportError } from "./types";
import type { Surface } from "../types";

const VALID_SURFACES = ["turf", "dirt"];

export interface CourseTimeBaselineInput {
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  sampleYears: number;
  sampleCount: number;
  medianTimeSeconds: number;
  source: string;
}

export interface CourseFinal3FBaselineInput {
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  sampleYears: number;
  sampleCount: number;
  medianFinal3FSeconds: number;
  source: string;
}

export type NormalizeBaselineResult<T> = { ok: true; data: T } | { ok: false; error: ImportError };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function requireNumber(value: string | undefined, fieldName: string, errors: string[]): number {
  if (isBlank(value)) {
    errors.push(`${fieldName} が空です`);
    return NaN;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`${fieldName} を数値として解釈できません（値: "${value}"）`);
    return NaN;
  }
  return n;
}

interface BaselineCommonFields {
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  sampleYears: number;
  sampleCount: number;
  source: string;
}

/** racecourse/surface/distance/going/sampleYears/sampleCount/source の共通検証。value項目（medianTimeSeconds等）は呼び出し側で追加検証する */
function normalizeBaselineCommon(
  row: Record<string, string>,
  errors: string[],
): BaselineCommonFields {
  const racecourse = row.racecourse?.trim() ?? "";
  const surfaceRaw = row.surface?.trim() ?? "";
  const going = row.going?.trim() ?? "";
  const source = row.source?.trim() ?? "";

  if (racecourse === "") errors.push("racecourse が空です");
  if (going === "") errors.push("going が空です");
  if (source === "") errors.push("source が空です（データの出典を記入してください）");
  if (!VALID_SURFACES.includes(surfaceRaw)) {
    errors.push(`surface は turf/dirt のいずれかである必要があります（実際: "${surfaceRaw}"）`);
  }

  const distance = requireNumber(row.distance, "distance", errors);
  if (Number.isFinite(distance) && distance <= 0) {
    errors.push(`distance は正の値である必要があります（実際: ${distance}）`);
  }

  const sampleYears = requireNumber(row.sampleYears, "sampleYears", errors);
  if (Number.isFinite(sampleYears) && sampleYears <= 0) {
    errors.push(`sampleYears は正の値である必要があります（実際: ${sampleYears}）`);
  }

  const sampleCount = requireNumber(row.sampleCount, "sampleCount", errors);
  if (Number.isFinite(sampleCount) && (!Number.isInteger(sampleCount) || sampleCount <= 0)) {
    errors.push(`sampleCount は正の整数である必要があります（実際: ${sampleCount}）`);
  }

  return {
    racecourse,
    surface: surfaceRaw as Surface,
    distance,
    going,
    sampleYears,
    sampleCount,
    source,
  };
}

export function normalizeCourseTimeBaselineRow(
  row: Record<string, string>,
  rowIndex: number,
): NormalizeBaselineResult<CourseTimeBaselineInput> {
  const errors: string[] = [];
  const common = normalizeBaselineCommon(row, errors);
  const medianTimeSeconds = requireNumber(row.medianTimeSeconds, "medianTimeSeconds", errors);
  if (Number.isFinite(medianTimeSeconds) && medianTimeSeconds <= 0) {
    errors.push(`medianTimeSeconds は正の値である必要があります（実際: ${medianTimeSeconds}）`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: { rowIndex, message: errors.join("; ") },
    };
  }

  return { ok: true, data: { ...common, medianTimeSeconds } };
}

export function normalizeCourseFinal3FBaselineRow(
  row: Record<string, string>,
  rowIndex: number,
): NormalizeBaselineResult<CourseFinal3FBaselineInput> {
  const errors: string[] = [];
  const common = normalizeBaselineCommon(row, errors);
  const medianFinal3FSeconds = requireNumber(row.medianFinal3FSeconds, "medianFinal3FSeconds", errors);
  if (Number.isFinite(medianFinal3FSeconds) && medianFinal3FSeconds <= 0) {
    errors.push(`medianFinal3FSeconds は正の値である必要があります（実際: ${medianFinal3FSeconds}）`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: { rowIndex, message: errors.join("; ") },
    };
  }

  return { ok: true, data: { ...common, medianFinal3FSeconds } };
}

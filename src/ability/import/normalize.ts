/**
 * raw CSV行 → 検証済み RacePerformanceInput への正規化。
 *
 * 方針：
 * - 異常データ1件でアプリ全体が落ちないよう、例外を投げずに { ok: false, error } を返す。
 * - 必須項目（raceId/horseId/horseName/raceDate/racecourse/raceName/surface/distance/going）が
 *   欠けている・不正な場合はエラーとして弾く。
 * - finishPosition/carriedWeightKg/actualRaceTimeSeconds/final3FSeconds/timeGapSecondsは
 *   欠損（空セル）を許容する。空セルはnullとして扱い、0など勝手な値で埋めない。
 *   ただし値がセルにある場合は数値として妥当か検証する（不正な文字列はエラー）。
 */

import type { ImportError, RacePerformanceInput } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SURFACES = ["turf", "dirt"];

/** JRAの実際の斤量帯に対する常識的な範囲（これを外れる値は入力ミスとして弾く） */
export const MIN_CARRIED_WEIGHT_KG = 40;
export const MAX_CARRIED_WEIGHT_KG = 70;

export type NormalizeResult =
  | { ok: true; data: RacePerformanceInput }
  | { ok: false; error: ImportError };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** 必須の数値セルをパースする。空・非数値ならエラーメッセージを返す */
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

/** 任意（欠損許容）の数値セルをパースする。空文字ならnull、非数値ならエラー */
function optionalNumber(value: string | undefined, fieldName: string, errors: string[]): number | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`${fieldName} を数値として解釈できません（値: "${value}"）`);
    return null;
  }
  return n;
}

export function normalizeRacePerformance(row: Record<string, string>, rowIndex: number): NormalizeResult {
  const errors: string[] = [];

  const raceId = row.raceId?.trim() ?? "";
  const horseId = row.horseId?.trim() ?? "";
  const horseName = row.horseName?.trim() ?? "";
  const raceDate = row.raceDate?.trim() ?? "";
  const racecourse = row.racecourse?.trim() ?? "";
  const raceName = row.raceName?.trim() ?? "";
  const going = row.going?.trim() ?? "";
  const surfaceRaw = row.surface?.trim() ?? "";

  if (raceId === "") errors.push("raceId が空です");
  if (horseId === "") errors.push("horseId が空です");
  if (horseName === "") errors.push("horseName が空です");
  if (racecourse === "") errors.push("racecourse が空です");
  if (raceName === "") errors.push("raceName が空です");
  if (going === "") errors.push("going が空です");

  if (raceDate === "") {
    errors.push("raceDate が空です");
  } else if (!DATE_PATTERN.test(raceDate) || Number.isNaN(Date.parse(raceDate))) {
    errors.push(`raceDate の形式が不正です（期待: YYYY-MM-DD, 実際: "${raceDate}"）`);
  }

  if (!VALID_SURFACES.includes(surfaceRaw)) {
    errors.push(`surface は turf/dirt のいずれかである必要があります（実際: "${surfaceRaw}"）`);
  }

  const distance = requireNumber(row.distance, "distance", errors);
  if (Number.isFinite(distance) && distance <= 0) {
    errors.push(`distance は正の値である必要があります（実際: ${distance}）`);
  }

  const raceNumber = optionalNumber(row.raceNumber, "raceNumber", errors);
  const gate = optionalNumber(row.gate, "gate", errors);
  const horseNumber = optionalNumber(row.horseNumber, "horseNumber", errors);
  const fieldSize = optionalNumber(row.fieldSize, "fieldSize", errors);

  const finishPosition = optionalNumber(row.finishPosition, "finishPosition", errors);
  if (finishPosition !== null && (!Number.isInteger(finishPosition) || finishPosition < 1)) {
    errors.push(`finishPosition は1以上の整数である必要があります（実際: ${finishPosition}）`);
  }

  const carriedWeightKg = optionalNumber(row.carriedWeightKg, "carriedWeightKg", errors);
  if (
    carriedWeightKg !== null &&
    (carriedWeightKg < MIN_CARRIED_WEIGHT_KG || carriedWeightKg > MAX_CARRIED_WEIGHT_KG)
  ) {
    errors.push(
      `carriedWeightKg が異常値です（実際: ${carriedWeightKg}kg, 許容範囲: ${MIN_CARRIED_WEIGHT_KG}〜${MAX_CARRIED_WEIGHT_KG}kg）`,
    );
  }

  const actualRaceTimeSeconds = optionalNumber(row.actualRaceTimeSeconds, "actualRaceTimeSeconds", errors);
  if (actualRaceTimeSeconds !== null && actualRaceTimeSeconds <= 0) {
    errors.push(`actualRaceTimeSeconds は正の値である必要があります（実際: ${actualRaceTimeSeconds}）`);
  }

  const final3FSeconds = optionalNumber(row.final3FSeconds, "final3FSeconds", errors);
  if (final3FSeconds !== null && final3FSeconds <= 0) {
    errors.push(`final3FSeconds は正の値である必要があります（実際: ${final3FSeconds}）`);
  }

  // timeGapSecondsは勝ち馬でマイナス値を取りうるため符号チェックはしない（有限数値かのみ検証済み）
  const timeGapSeconds = optionalNumber(row.timeGapSeconds, "timeGapSeconds", errors);

  if (errors.length > 0) {
    return {
      ok: false,
      error: {
        rowIndex,
        raceId: raceId || undefined,
        horseId: horseId || undefined,
        message: errors.join("; "),
      },
    };
  }

  return {
    ok: true,
    data: {
      raceId,
      horseId,
      horseName,
      raceDate,
      racecourse,
      raceName,
      raceNumber,
      surface: surfaceRaw as "turf" | "dirt",
      distance,
      going,
      finishPosition,
      carriedWeightKg,
      actualRaceTimeSeconds,
      final3FSeconds,
      timeGapSeconds,
      gate,
      horseNumber,
      fieldSize,
    },
  };
}

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

import type { PassingPositionData } from "../types";
import type { ImportError, RacePerformanceInput } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SURFACES = ["turf", "dirt"];
const PASSING_POSITION_SEPARATOR = "-";

/** JRAの実際の斤量帯に対する常識的な範囲（これを外れる値は入力ミスとして弾く） */
export const MIN_CARRIED_WEIGHT_KG = 40;
export const MAX_CARRIED_WEIGHT_KG = 70;

export type NormalizeResult =
  | { ok: true; data: RacePerformanceInput }
  | { ok: false; error: ImportError };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/** 任意（欠損許容）の文字列セル。空文字ならnull（CHECKPOINT13.2: source/sourceRaceId/sourceHorseId用） */
function optionalString(value: string | undefined): string | null {
  if (isBlank(value)) return null;
  return value!.trim();
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

/**
 * 通過順位CSVセル（例: "3-4-4-3"、2コーナーのみのコースなら"8-7"）を
 * cornerPositions（number[]）へパースする。存在しないコーナーを推測で補完しない
 * （記録されている値の個数がそのままcornerPositions.lengthになる、CHECKPOINT14A.2）。
 * 区切り文字は"-"固定。1以上の整数のみ許容し、空・非数値・0以下はmalformedとして弾く。
 */
function parsePassingPositionCorners(value: string): { ok: true; cornerPositions: number[] } | { ok: false; error: string } {
  const parts = value.split(PASSING_POSITION_SEPARATOR);
  const cornerPositions: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: `通過順位を解釈できません（値: "${value}"）。数値を"-"で区切った形式にしてください（例: "3-4-4-3"）` };
    }
    const n = Number(trimmed);
    if (n < 1) {
      return { ok: false, error: `通過順位は1以上の整数である必要があります（値: "${value}"）` };
    }
    cornerPositions.push(n);
  }
  if (cornerPositions.length === 0) {
    return { ok: false, error: `通過順位が空です（値: "${value}"）` };
  }
  return { ok: true, cornerPositions };
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

  // データ出所・監査用メタデータ（CHECKPOINT13.2）。任意項目、ability計算には使わない。
  const source = optionalString(row.source);
  const sourceRaceId = optionalString(row.sourceRaceId);
  const sourceHorseId = optionalString(row.sourceHorseId);

  // 通過順位（CHECKPOINT14A.2で追加）。空セルはnull（未提供）。値がある場合のみ検証する。
  // PassingPositionData.fieldSizeは必須項目のため、fieldSize列も同じ行に必要
  // （存在しないコーナーを推測で補完しない、同じくfieldSizeを推測で補完しない）。
  let passingPosition: PassingPositionData | null = null;
  const passingPositionRaw = row.passingPosition?.trim() ?? "";
  if (passingPositionRaw !== "") {
    const parsed = parsePassingPositionCorners(passingPositionRaw);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else if (fieldSize === null) {
      errors.push(
        `passingPosition（値: "${passingPositionRaw}"）を指定する場合、同じ行にfieldSizeも必須です（通過順位の相対化に使うため）`,
      );
    } else if (Math.max(...parsed.cornerPositions) > fieldSize) {
      errors.push(
        `passingPosition（値: "${passingPositionRaw}"）にfieldSize(${fieldSize})を超える順位が含まれています`,
      );
    } else {
      passingPosition = {
        cornerPositions: parsed.cornerPositions,
        fieldSize,
        source: source ?? "unknown",
        isReliable: true,
      };
    }
  }

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
      passingPosition,
      source,
      sourceRaceId,
      sourceHorseId,
    },
  };
}

import type { CollectedRunnerRow, CollectorValidationResult, RawRaceBundle } from "./types";

/** RAW → NORMALIZED（STEP3）。既存Gate Race CSV契約と同一の項目名へ変換する。 */
export function normalizeRaceBundle(raw: RawRaceBundle): CollectedRunnerRow[] {
  return raw.runners.map((r) => ({
    raceId: raw.raceId,
    raceDate: raw.raceDate,
    racecourse: raw.racecourse,
    raceNumber: raw.raceNumber,
    raceName: raw.raceName,
    surface: raw.surface,
    distance: raw.distance,
    going: raw.going,
    courseLayout: raw.courseLayout,
    courseVariant: raw.courseVariant,
    horseId: r.horseId,
    horseName: r.horseName,
    horseNumber: r.horseNumber,
    gate: r.gate,
    finishPosition: r.finishPosition,
    carriedWeightKg: r.carriedWeightKg,
    actualRaceTimeSeconds: r.actualRaceTimeSeconds,
    final3FSeconds: r.final3FSeconds,
    timeGapSeconds: r.timeGapSeconds,
    fieldSize: r.fieldSize,
    passingPosition: r.passingPosition,
    source: r.source,
    sourceRaceId: r.sourceRaceId,
    sourceHorseId: r.sourceHorseId,
  }));
}

/**
 * 正規化後の整合性検証。重複・必須欠損・異常値を機械的に検出する
 * （Phase 1監査（docs/gate30-phase1-basic-data-completion-audit.md）で
 * 既存10レースに対して手動実施した監査項目を、Collector内部の自動検証として
 * 再利用可能な形に一般化した）。
 */
export function validateNormalizedRunners(rows: CollectedRunnerRow[]): CollectorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push("runner行が0件です。");
    return { ok: false, errors, warnings };
  }

  const raceIds = new Set(rows.map((r) => r.raceId));
  if (raceIds.size > 1) {
    errors.push(`同一Collector呼び出し内に複数raceIdが混在しています: ${[...raceIds].join(",")}`);
  }

  const horseIds = rows.map((r) => r.horseId);
  const dupHorseIds = [...new Set(horseIds.filter((id, i) => horseIds.indexOf(id) !== i))];
  if (dupHorseIds.length > 0) {
    errors.push(`同一レース内でhorseIdが重複しています: ${dupHorseIds.join(",")}`);
  }

  const horseNumbers = rows.map((r) => r.horseNumber);
  const dupHorseNumbers = [...new Set(horseNumbers.filter((n, i) => horseNumbers.indexOf(n) !== i))];
  if (dupHorseNumbers.length > 0) {
    errors.push(`同一レース内でhorseNumberが重複しています: ${dupHorseNumbers.join(",")}`);
  }

  for (const r of rows) {
    if (r.finishPosition == null) warnings.push(`${r.horseName}(${r.horseId}): finishPositionが欠損しています`);
    if (r.carriedWeightKg == null) warnings.push(`${r.horseName}(${r.horseId}): carriedWeightKgが欠損しています`);
    if (r.horseNumber > r.fieldSize) {
      warnings.push(
        `${r.horseName}(${r.horseId}): horseNumber(${r.horseNumber}) > fieldSize(${r.fieldSize})（出走取消等の既知パターンの可能性、要確認）`,
      );
    }
  }

  const fieldSizes = new Set(rows.map((r) => r.fieldSize));
  if (fieldSizes.size > 1) {
    warnings.push(`fieldSizeがrunner間で不一致です: ${[...fieldSizes].join(",")}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

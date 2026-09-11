/** Prediction入力境界。数式・直近5走の選択はここでは扱わない。 */
export interface PredictionTarget {
  raceId: string;
  raceDate: string;
  postTimeIso?: string;
}

export function isRaceDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Date.parseの曖昧な日付・タイムゾーン省略・存在しない日付の繰上げを許可しない。 */
export function predictionTimestamp(value: unknown, field: string): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) ||
      !isRaceDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field}: 明示的なタイムゾーン付きISO日時が必要です（現在時刻で代用しません）`);
  }
  return Date.parse(value);
}

export function assertPredictionCutoff(cutoff: unknown, target: PredictionTarget): asserts cutoff is string {
  const cutoffMs = predictionTimestamp(cutoff, "predictionCutoffAt");
  if (!target.raceId || !isRaceDate(target.raceDate)) throw new Error("INVALID_RACE_IDENTITY");
  // 発走時刻のない過去fixtureは前日までのcutoffのみ許可。同日を安全と推測しない。
  const boundary = target.postTimeIso == null
    ? Date.parse(`${target.raceDate}T00:00:00+09:00`)
    : predictionTimestamp(target.postTimeIso, "scheduledStartTime");
  if (target.postTimeIso != null &&
      new Date(boundary + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) !== target.raceDate) {
    throw new Error("scheduledStartTime: raceDateと一致しません");
  }
  if (cutoffMs >= boundary) throw new Error("predictionCutoffAt: 発走前であることを確認できません");
}

/** availableAtは情報が利用可能になった時刻。importedAt/retrievedAt（取得時刻）とは別。 */
export function isKnownByCutoff(value: object, cutoff: string): boolean {
  if (!("availableAt" in value) || value.availableAt == null) return true;
  return predictionTimestamp(value.availableAt, "availableAt") <= predictionTimestamp(cutoff, "predictionCutoffAt");
}

export function isPriorPerformance(
  race: { raceId: string; raceDate: string; availableAt?: string | null },
  target: PredictionTarget,
  cutoff: string,
): boolean {
  if (!isRaceDate(race.raceDate)) throw new Error(`INVALID_HISTORY_DATE: ${race.raceId}`);
  // 日付しかない走は同日を採用しない。availableAtのない既存履歴もこの保守的な境界を使う。
  const cutoffMs = predictionTimestamp(cutoff, "predictionCutoffAt");
  const raceDayStart = Date.parse(`${race.raceDate}T00:00:00+09:00`);
  const knownAt = race.availableAt == null
    ? raceDayStart + 24 * 60 * 60 * 1000
    : predictionTimestamp(race.availableAt, "availableAt");
  return race.raceId !== target.raceId && race.raceDate < target.raceDate &&
    raceDayStart < cutoffMs && knownAt >= raceDayStart && knownAt <= cutoffMs;
}

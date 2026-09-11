/** 予測時点Odds Snapshot。能力・Suitability・Probability計算から分離して扱う。 */

import { predictionTimestamp } from "./predictionBoundary";

export type OddsMarket = "win" | "place";

export interface OddsSnapshotEntry {
  raceId: string;
  /** canonical horseId。馬名からの推測解決は行わない。 */
  horseId: string;
  observedAt: string;
  availableAt?: string | null;
  odds: number;
  market: OddsMarket;
  source: string;
  sourceIdentifier?: string | null;
  popularity?: number | null;
}

export type OddsSnapshotDiagnosticCode =
  | "ODDS_RACE_ID_MISMATCH"
  | "UNRESOLVED_ODDS_HORSE_ID"
  | "FUTURE_ODDS_REJECTED"
  | "INVALID_ODDS_SNAPSHOT"
  | "AMBIGUOUS_ODDS_SNAPSHOT"
  | "MISSING_WIN_ODDS_BEFORE_CUTOFF";

export interface OddsSnapshotDiagnostic {
  code: OddsSnapshotDiagnosticCode;
  horseId: string | null;
  raceId: string | null;
  message: string;
}

export interface SelectOddsSnapshotsResult {
  selected: OddsSnapshotEntry[];
  winByHorseId: Record<string, OddsSnapshotEntry>;
  missingWinOddsHorseIds: string[];
  winOddsComplete: boolean;
  diagnostics: OddsSnapshotDiagnostic[];
}

interface Candidate {
  entry: OddsSnapshotEntry;
  observedAtMs: number;
}

export function selectOddsSnapshotsAsOf(input: {
  raceId: string;
  predictionCutoffAt: string;
  canonicalHorseIds: ReadonlySet<string>;
  requiredWinHorseIds: readonly string[];
  snapshots: readonly OddsSnapshotEntry[];
}): SelectOddsSnapshotsResult {
  const cutoffMs = predictionTimestamp(input.predictionCutoffAt, "predictionCutoffAt");
  const diagnostics: OddsSnapshotDiagnostic[] = [];
  const latest = new Map<string, Candidate>();
  const ambiguousKeys = new Set<string>();

  for (const entry of input.snapshots) {
    if (entry.raceId !== input.raceId) {
      diagnostics.push({
        code: "ODDS_RACE_ID_MISMATCH",
        horseId: entry.horseId || null,
        raceId: entry.raceId || null,
        message: `対象raceId(${input.raceId})と一致しないため使用しません。`,
      });
      continue;
    }
    if (!entry.horseId || !input.canonicalHorseIds.has(entry.horseId)) {
      diagnostics.push({
        code: "UNRESOLVED_ODDS_HORSE_ID",
        horseId: entry.horseId || null,
        raceId: entry.raceId,
        message: "canonical horseIdへ厳密一致できないため使用しません。",
      });
      continue;
    }
    let observedAtMs: number;
    let availableAtMs: number;
    try {
      observedAtMs = predictionTimestamp(entry.observedAt, "odds.observedAt");
      availableAtMs = entry.availableAt == null
        ? observedAtMs
        : predictionTimestamp(entry.availableAt, "odds.availableAt");
    } catch {
      diagnostics.push({
        code: "INVALID_ODDS_SNAPSHOT",
        horseId: entry.horseId,
        raceId: entry.raceId,
        message: "observedAt/availableAtが有効なISO日時ではありません。",
      });
      continue;
    }
    if (!Number.isFinite(entry.odds) || entry.odds < 1 ||
        !["win", "place"].includes(entry.market) ||
        typeof entry.source !== "string" || !entry.source.trim()) {
      diagnostics.push({
        code: "INVALID_ODDS_SNAPSHOT",
        horseId: entry.horseId,
        raceId: entry.raceId,
        message: "odds・market・sourceのいずれかが不正です。",
      });
      continue;
    }
    if (observedAtMs > cutoffMs || availableAtMs > cutoffMs) {
      diagnostics.push({
        code: "FUTURE_ODDS_REJECTED",
        horseId: entry.horseId,
        raceId: entry.raceId,
        message: "cutoff後に観測・利用可能となったオッズのため使用しません。",
      });
      continue;
    }

    const key = `${entry.market}\u0000${entry.horseId}`;
    const current = latest.get(key);
    if (current == null || observedAtMs > current.observedAtMs) {
      latest.set(key, { entry, observedAtMs });
      ambiguousKeys.delete(key);
    } else if (observedAtMs === current.observedAtMs &&
        (entry.odds !== current.entry.odds || entry.source !== current.entry.source)) {
      ambiguousKeys.add(key);
    }
  }

  for (const key of ambiguousKeys) {
    const candidate = latest.get(key);
    latest.delete(key);
    diagnostics.push({
      code: "AMBIGUOUS_ODDS_SNAPSHOT",
      horseId: candidate?.entry.horseId ?? null,
      raceId: candidate?.entry.raceId ?? input.raceId,
      message: "同一観測時刻に異なるオッズがあり、安全に1件へ確定できません。",
    });
  }

  const selected = [...latest.values()]
    .map((candidate) => candidate.entry)
    .sort((a, b) => a.horseId.localeCompare(b.horseId) || a.market.localeCompare(b.market));
  const winByHorseId = Object.fromEntries(
    selected.filter((entry) => entry.market === "win").map((entry) => [entry.horseId, entry]),
  );
  const missingWinOddsHorseIds = [...new Set(input.requiredWinHorseIds)]
    .filter((horseId) => winByHorseId[horseId] == null);
  for (const horseId of missingWinOddsHorseIds) {
    diagnostics.push({
      code: "MISSING_WIN_ODDS_BEFORE_CUTOFF",
      horseId,
      raceId: input.raceId,
      message: "cutoff以前の単勝Odds Snapshotがありません。",
    });
  }

  return {
    selected,
    winByHorseId,
    missingWinOddsHorseIds,
    winOddsComplete: missingWinOddsHorseIds.length === 0,
    diagnostics,
  };
}

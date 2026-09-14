/**
 * Bet Proposal / Actual Betting Record共通の馬券語彙（Post-Race Pipeline V1・Phase 2）。
 *
 * selectionは常にcanonicalHorseIdをidentity keyとする（馬名・馬番はaudit/display専用）。
 * 同じ意味の型・validationをbetProposal.ts/actualBettingRecord.tsで重複定義しないよう、
 * ここへ集約する。
 */

export type BetType = "WIN" | "PLACE" | "QUINELLA" | "EXACTA" | "WIDE" | "TRIO" | "TRIFECTA";

export type BetSelectionRole = "ANY" | "FIRST" | "SECOND" | "THIRD";

export interface BetSelectionEntry {
  canonicalHorseId: string;
  role: BetSelectionRole;
  /** audit/display専用。identity keyには使わない。 */
  horseName?: string | null;
  horseNumber?: number | null;
}

export interface BetEntry {
  betType: BetType;
  selection: BetSelectionEntry[];
  /** 円。正の整数。 */
  stake: number;
}

/**
 * 券種ごとの必要頭数・role整合性。
 * orderedRoles === null: 順不同（全頭role=ANYを要求）。
 * orderedRoles !== null: 順序指定（列挙したroleをそれぞれ1つずつ要求。WIN/PLACE以外の
 * 単一頭数券種は現時点で存在しないため単純化のためANY固定にしている）。
 *
 * JRA実際の券種としてのWIN=単勝・PLACE=複勝・QUINELLA=馬連・EXACTA=馬単・WIDE=ワイド・
 * TRIO=三連複・TRIFECTA=三連単に対応する。
 */
const BET_TYPE_SELECTION_SHAPE: Readonly<Record<BetType, { count: number; orderedRoles: readonly BetSelectionRole[] | null }>> = {
  WIN: { count: 1, orderedRoles: null },
  PLACE: { count: 1, orderedRoles: null },
  QUINELLA: { count: 2, orderedRoles: null },
  EXACTA: { count: 2, orderedRoles: ["FIRST", "SECOND"] },
  WIDE: { count: 2, orderedRoles: null },
  TRIO: { count: 3, orderedRoles: null },
  TRIFECTA: { count: 3, orderedRoles: ["FIRST", "SECOND", "THIRD"] },
};

/** 1件のbet（betType+selection+stake）の構造的整合性を検証する。 */
export function validateBetEntry(bet: BetEntry, label: string): void {
  const shape = BET_TYPE_SELECTION_SHAPE[bet.betType];
  if (!shape) throw new Error(`${label}: 未知のbetTypeです: ${bet.betType}`);
  if (!Array.isArray(bet.selection) || bet.selection.length !== shape.count) {
    throw new Error(
      `${label}: betType=${bet.betType}はselectionが${shape.count}頭である必要があります` +
        `（実際: ${bet.selection?.length ?? 0}）`,
    );
  }

  const seen = new Set<string>();
  for (const entry of bet.selection) {
    if (!entry.canonicalHorseId) {
      throw new Error(`${label}: selectionにcanonicalHorseIdが必要です`);
    }
    if (seen.has(entry.canonicalHorseId)) {
      throw new Error(`${label}: 同一bet内でcanonicalHorseIdが重複しています: ${entry.canonicalHorseId}`);
    }
    seen.add(entry.canonicalHorseId);
  }

  if (shape.orderedRoles === null) {
    if (bet.selection.some((entry) => entry.role !== "ANY")) {
      throw new Error(`${label}: betType=${bet.betType}のselectionは全頭role=ANYである必要があります`);
    }
  } else {
    const expected = [...shape.orderedRoles].sort().join(",");
    const actual = bet.selection.map((entry) => entry.role).sort().join(",");
    if (expected !== actual) {
      throw new Error(
        `${label}: betType=${bet.betType}のselectionはrole=${shape.orderedRoles.join("/")}を` +
          "それぞれ1つずつ持つ必要があります",
      );
    }
  }

  if (!Number.isInteger(bet.stake) || bet.stake <= 0) {
    throw new Error(`${label}: stakeは正の整数（円）である必要があります（実際: ${bet.stake}）`);
  }
  // JRA馬券は100円単位でのみ購入できる（Phase 2.1、正式validation）。
  if (bet.stake % 100 !== 0) {
    throw new Error(`${label}: stakeは100円単位である必要があります（実際: ${bet.stake}）`);
  }
}

export function sumStake(bets: readonly BetEntry[]): number {
  return bets.reduce((sum, bet) => sum + bet.stake, 0);
}

/** raceResultArtifact.ts／racePredictionArtifact.tsと同じ決定的JSON直列化（既存パターン踏襲）。 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

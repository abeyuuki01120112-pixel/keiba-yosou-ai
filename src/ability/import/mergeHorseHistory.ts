/**
 * CSV Merge / Upsert（CHECKPOINT13.2）。
 *
 * CHECKPOINT13.1監査で「import:csvは対象馬のdata/horses/<horseId>.jsonを
 * まるごと置き換えるため、今週のレースだけのCSVをそのまま流すと既存の
 * 過去走履歴が消える」という重大リスクが指摘された。この層は、既存の
 * 1頭分の履歴（RaceHistoryRawInput[]）と、新しく取り込む履歴を
 * 「安全に」統合するための純粋関数を提供する。
 *
 * 重複判定キー: canonical horseId（呼び出し側が1頭単位で渡す前提のため、
 * このファイル自体はhorseIdを扱わない） + canonical raceId。
 * 1頭が同じraceIdで2回出走することは無いため、raceId単独で
 * その馬の中での一意性は十分に保証される。
 *
 * 方針（絶対に守る）:
 *   - 既存のraceエントリは削除しない。
 *   - 新しいraceId（既存に無いもの）は追加する。
 *   - 既存と完全に同じ内容のraceId（重複import）は無視する（無害・二重登録しない）。
 *   - 既存と異なる内容の同一raceId（値の食い違い）はconflictとして報告し、
 *     どちらを採用するか自動決定しない（既存の値をそのまま残す。silent overwrite禁止）。
 */

import type { RaceHistoryRawInput } from "../raceHistoryPipeline";

/** 比較対象から除外するフィールド。importedAtは取り込みの度に変わるのが正常なため、値の食い違いをconflict扱いしない */
const IGNORED_FIELDS_FOR_COMPARISON = new Set<string>(["importedAt"]);

export interface MergeFieldDifference {
  field: string;
  existingValue: unknown;
  incomingValue: unknown;
}

export interface MergeConflict {
  raceId: string;
  differences: MergeFieldDifference[];
}

export interface MergeHorseHistoryResult {
  /** 既存エントリ（無変更）＋新規追加分。conflictのraceIdは既存側の値のまま残る（上書きしない） */
  merged: RaceHistoryRawInput[];
  /** 新規に追加されたraceId */
  addedRaceIds: string[];
  /** 既存と完全一致していたため無視されたraceId（重複import、実害なし） */
  duplicateRaceIds: string[];
  /** 既存と内容が食い違っていたraceId（自動採用せず、既存値を維持したまま報告のみ） */
  conflicts: MergeConflict[];
}

function diffFields(existing: RaceHistoryRawInput, incoming: RaceHistoryRawInput): MergeFieldDifference[] {
  const keys = new Set<string>([...Object.keys(existing), ...Object.keys(incoming)]);
  const differences: MergeFieldDifference[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS_FOR_COMPARISON.has(key)) continue;
    const existingValue = (existing as unknown as Record<string, unknown>)[key];
    const incomingValue = (incoming as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(existingValue) !== JSON.stringify(incomingValue)) {
      differences.push({ field: key, existingValue, incomingValue });
    }
  }
  return differences;
}

/**
 * 1頭分の既存履歴と新規取り込み分をマージする。
 * 既存エントリの順序・内容は一切変更しない（新規分を末尾に追加するのみ）。
 */
export function mergeHorseRaceHistory(
  existing: RaceHistoryRawInput[],
  incoming: RaceHistoryRawInput[],
): MergeHorseHistoryResult {
  const existingByRaceId = new Map<string, RaceHistoryRawInput>();
  for (const race of existing) {
    existingByRaceId.set(race.raceId, race);
  }

  const addedRaceIds: string[] = [];
  const duplicateRaceIds: string[] = [];
  const conflicts: MergeConflict[] = [];
  const toAppend: RaceHistoryRawInput[] = [];

  const seenIncomingRaceIds = new Set<string>();
  for (const race of incoming) {
    if (seenIncomingRaceIds.has(race.raceId)) {
      // 同一バッチ内での重複行（同一馬×同一raceIdが取り込みデータ自体に複数ある）も
      // 二重登録しない。既に処理済みなのでスキップする（1件目の判定結果を優先）。
      continue;
    }
    seenIncomingRaceIds.add(race.raceId);

    const existingRace = existingByRaceId.get(race.raceId);
    if (!existingRace) {
      toAppend.push(race);
      addedRaceIds.push(race.raceId);
      continue;
    }

    const differences = diffFields(existingRace, race);
    if (differences.length === 0) {
      duplicateRaceIds.push(race.raceId);
    } else {
      conflicts.push({ raceId: race.raceId, differences });
    }
  }

  return {
    merged: [...existing, ...toAppend],
    addedRaceIds,
    duplicateRaceIds,
    conflicts,
  };
}

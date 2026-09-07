/**
 * CSV Merge / Upsert（CHECKPOINT13.2、CHECKPOINT14A.2でNon-destructive Enrichment Merge対応）。
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
 *
 * 【CHECKPOINT14A.2で追加】Non-destructive Enrichment Merge:
 *   ENRICHMENT_FIELDS（fieldSize・passingPosition）に限り、
 *   「既存null・新規値あり」の場合だけ安全に補完できる（Base Ability計算に使う
 *   core fieldとは異なる扱い）。CHECKPOINT14A.1監査で判明した「既存raceIdへの
 *   enrichment再投入がconflict扱いされ、豊富な情報がdiskへ反映されない」問題への対応。
 *   ENRICHMENT_FIELDS以外のfield（raceTime/finishPosition/carriedWeight等のcore field）は
 *   従来通り、1件でも値が食い違えばconflictとして扱い、record全体（そのraceId）の
 *   書き込みをblockする（安全機構は維持、緩めない）。
 */

import type { PassingPositionData } from "../types";
import type { RaceHistoryRawInput } from "../raceHistoryPipeline";

/** 比較対象から除外するフィールド。importedAtは取り込みの度に変わるのが正常なため、値の食い違いをconflict扱いしない */
const IGNORED_FIELDS_FOR_COMPARISON = new Set<string>(["importedAt"]);

/**
 * Non-destructive Enrichmentの対象field（CHECKPOINT14A.2 6節）。
 * 「既存null → 新規値あり」の場合だけ安全に補完できる、能力計算に使わない参考項目のみ。
 * raceTime/finishPosition/carriedWeight等のcore fieldをここへ緩く追加しないこと
 * （CHECKPOINT14A.2 6節で明示的に禁止されている）。
 */
const ENRICHMENT_FIELDS = ["fieldSize", "passingPosition"] as const satisfies readonly (keyof RaceHistoryRawInput)[];
type EnrichmentField = (typeof ENRICHMENT_FIELDS)[number];
const ENRICHMENT_FIELD_SET = new Set<string>(ENRICHMENT_FIELDS);

export interface MergeFieldDifference {
  field: string;
  existingValue: unknown;
  incomingValue: unknown;
}

export interface MergeConflict {
  raceId: string;
  differences: MergeFieldDifference[];
}

export interface EnrichmentDetail {
  raceId: string;
  /** このraceIdで実際に補完されたenrichment field名（CASE A該当分のみ） */
  enrichedFields: EnrichmentField[];
}

export interface MergeHorseHistoryResult {
  /**
   * 既存エントリ（enrichmentが無ければ無変更）＋新規追加分。
   * enrichmentが適用されたraceIdは、core fieldは既存のまま・enrichment fieldのみ
   * 新規値へ更新された状態でこの配列内の元の位置に反映される（順序は変えない）。
   * conflictのraceIdは既存側の値のまま残る（上書きしない）。
   */
  merged: RaceHistoryRawInput[];
  /** 新規に追加されたraceId */
  addedRaceIds: string[];
  /** 既存と完全一致していたため無視されたraceId（重複import、実害なし） */
  duplicateRaceIds: string[];
  /**
   * 既存recordのcore fieldは変えず、null→populatedのenrichment fieldだけ
   * 安全に補完されたraceId（CHECKPOINT14A.2で追加）。
   */
  enriched: EnrichmentDetail[];
  /**
   * 既存と内容が食い違っていたraceId（自動採用せず、既存値を維持したまま報告のみ）。
   * core fieldの食い違い、またはenrichment fieldが既存値と異なる値で新規に来た場合
   * （CASE D）の両方を含む。
   */
  conflicts: MergeConflict[];
}

/** enrichment field以外（importedAtも除く）の食い違いを検出する */
function diffCoreFields(existing: RaceHistoryRawInput, incoming: RaceHistoryRawInput): MergeFieldDifference[] {
  const keys = new Set<string>([...Object.keys(existing), ...Object.keys(incoming)]);
  const differences: MergeFieldDifference[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS_FOR_COMPARISON.has(key) || ENRICHMENT_FIELD_SET.has(key)) continue;
    const existingValue = (existing as unknown as Record<string, unknown>)[key];
    const incomingValue = (incoming as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(existingValue) !== JSON.stringify(incomingValue)) {
      differences.push({ field: key, existingValue, incomingValue });
    }
  }
  return differences;
}

type EnrichmentFieldOutcome = "bothNull" | "enrichable" | "duplicate" | "keepExisting" | "conflict";

/**
 * CHECKPOINT14A.2 5節のCASE A〜Dをそのまま判定する。
 *   CASE A: 既存null・新規値あり → "enrichable"（補完可能）
 *   CASE B: 既存値あり・新規が同じ値 → "duplicate"（no-op）
 *   CASE C: 既存値あり・新規null → "keepExisting"（既存を維持）
 *   CASE D: 既存値あり・新規が異なる値 → "conflict"
 */
function classifyEnrichmentField(existingValue: unknown, incomingValue: unknown): EnrichmentFieldOutcome {
  const existingIsNull = existingValue === null || existingValue === undefined;
  const incomingIsNull = incomingValue === null || incomingValue === undefined;
  if (existingIsNull && incomingIsNull) return "bothNull";
  if (existingIsNull && !incomingIsNull) return "enrichable";
  if (!existingIsNull && incomingIsNull) return "keepExisting";
  return JSON.stringify(existingValue) === JSON.stringify(incomingValue) ? "duplicate" : "conflict";
}

/**
 * 1頭分の既存履歴と新規取り込み分をマージする。
 *
 * core fieldは既存raceエントリに対して一切変更しない（enrichmentが適用された場合も、
 * core fieldの値・順序は既存のまま）。ENRICHMENT_FIELDS（fieldSize・passingPosition）
 * のみ、CASE Aに該当すれば既存recordへ安全に反映する。
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
  const enriched: EnrichmentDetail[] = [];
  const conflicts: MergeConflict[] = [];
  const toAppend: RaceHistoryRawInput[] = [];
  const enrichmentReplacements = new Map<string, RaceHistoryRawInput>();

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

    // 1. core fieldの食い違いは従来どおり無条件にconflict（record全体をblock）
    const coreDifferences = diffCoreFields(existingRace, race);
    if (coreDifferences.length > 0) {
      conflicts.push({ raceId: race.raceId, differences: coreDifferences });
      continue;
    }

    // 2. enrichment fieldごとにCASE A〜Dを判定する
    const enrichmentConflicts: MergeFieldDifference[] = [];
    const enrichedFields: EnrichmentField[] = [];
    for (const field of ENRICHMENT_FIELDS) {
      const existingValue = existingRace[field] as unknown;
      const incomingValue = race[field] as unknown;
      const outcome = classifyEnrichmentField(existingValue, incomingValue);
      if (outcome === "conflict") {
        enrichmentConflicts.push({ field, existingValue, incomingValue });
      } else if (outcome === "enrichable") {
        enrichedFields.push(field);
      }
      // "duplicate" / "keepExisting" / "bothNull" はそのfieldに関して何もしない
    }

    // 3. enrichment fieldにCASE Dが1件でもあれば、record全体をconflictとしてblockする
    //    （危険な部分適用をしない。既存値は一切変更しない）
    if (enrichmentConflicts.length > 0) {
      conflicts.push({ raceId: race.raceId, differences: enrichmentConflicts });
      continue;
    }

    // 4. 補完可能なenrichment fieldが1つも無ければ、純粋な重複import
    if (enrichedFields.length === 0) {
      duplicateRaceIds.push(race.raceId);
      continue;
    }

    // 5. CASE Aに該当したenrichment fieldだけを既存recordへ反映する。
    //    core fieldは一切変更しない。importedAtだけenrichment実行時刻へ更新し
    //    「最後にこのrecordへ触れたのがいつか」を追跡可能にする
    //    （source/sourceRaceId/sourceHorseId/dataKindは、core dataの出典を表す値の
    //    ままにする。enrichmentのsource自体はPassingPositionData.source等、
    //    各enrichment fieldの値の中に保持されているため、record全体のsourceを
    //    上書きしない。CHECKPOINT14A.2 8節: 既存Source設計に合わせた最小対応）。
    const enrichedRecord: RaceHistoryRawInput = { ...existingRace, importedAt: race.importedAt };
    for (const field of enrichedFields) {
      (enrichedRecord as Record<EnrichmentField, unknown>)[field] = race[field] as PassingPositionData | number | null;
    }
    enrichmentReplacements.set(race.raceId, enrichedRecord);
    enriched.push({ raceId: race.raceId, enrichedFields });
  }

  const mergedExisting = existing.map((race) => enrichmentReplacements.get(race.raceId) ?? race);

  return {
    merged: [...mergedExisting, ...toAppend],
    addedRaceIds,
    duplicateRaceIds,
    enriched,
    conflicts,
  };
}

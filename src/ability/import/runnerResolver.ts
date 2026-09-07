/**
 * Runner Resolver V1（CHECKPOINT13.2）。
 *
 * 実際のレースカードの出走馬（horseName・可能ならsourceHorseId）を、
 * data/horses/ の canonical horseId へ紐付ける層。CHECKPOINT13.1監査で
 * 「実際のレース→出走馬→data/horses/を繋ぐRunner Resolve層が存在しない」と
 * 指摘された箇所を埋める。
 *
 * 優先順位（CHECKPOINT13.2 STEP5、勝手な変更禁止）:
 *   Priority 1: canonical horseId一致（呼び出し側が既にhorseIdを知っている場合）
 *   Priority 2: sourceHorseId → canonical horseId 対応（対応表が利用可能な場合のみ）
 *   Priority 3: horseName完全一致（正規化後。全角半角・前後空白・連続空白のみ吸収する。
 *               類似度による曖昧一致（ファジーマッチ）は一切行わない＝「危険な推測resolve」禁止）
 *
 * 各runnerは必ず resolved / unresolved / ambiguous のいずれかに分類する。
 * ambiguous を勝手に1頭へ決定することはしない。
 *
 * このファイルはability計算（raceScore/baseAbility/Suitability V1等）を
 * 一切呼び出さない。あくまで「horseNameからhorseIdを引く」ためだけの層。
 */

export type ResolverStatus = "resolved" | "unresolved" | "ambiguous";

export interface RunnerResolveInput {
  horseName: string;
  /** 呼び出し側が既に把握しているcanonical horseId（Priority 1）。無ければnull/undefined */
  canonicalHorseIdHint?: string | null;
  /** 外部Source側の馬ID（Priority 2、sourceHorseIdRegistryが無ければ使われない） */
  sourceHorseId?: string | null;
}

export interface RunnerResolveResult {
  horseName: string;
  status: ResolverStatus;
  /** resolvedの場合のみ非null */
  horseId: string | null;
  /** ambiguousの場合の候補一覧 */
  candidates: string[];
  reason: string;
}

export interface CanonicalHorseNameEntry {
  horseId: string;
  horseName: string;
}

export interface RunnerResolverContext {
  /** data/horses/ 等に実在するcanonical horseIdの集合（Priority 1の照合先） */
  canonicalHorseIds: ReadonlySet<string>;
  /** horseName（正規化前）→horseId の対応候補一覧。同名馬がいれば2件以上登録してよい */
  canonicalHorseNames: CanonicalHorseNameEntry[];
  /**
   * sourceHorseId → canonical horseId の対応表（Priority 2）。
   * 今回はSource Adapterを作らないため、呼び出し側が既知の対応をそのまま渡す想定
   * （例: 既にcanonical化済みのRacePerformanceのsourceHorseIdフィールドから
   * 事前に構築したもの）。無ければ空オブジェクトのままでよい（Priority 2は常にスキップされる）。
   */
  sourceHorseIdRegistry?: Record<string, string>;
}

/**
 * 表記揺れ（全角/半角・前後空白・連続空白）を吸収する正規化。
 * 類似度によるあいまい一致は行わない（完全一致のための正規化のみ）。
 * NFKC正規化で全角英数字・半角カタカナ等を統一し、trim + 連続空白の圧縮を行う。
 */
export function normalizeHorseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

interface NameIndex {
  /** 正規化済みhorseName → candidate horseId[]（重複馬名があれば2件以上） */
  byNormalizedName: Map<string, string[]>;
}

export function buildNameIndex(entries: CanonicalHorseNameEntry[]): NameIndex {
  const byNormalizedName = new Map<string, string[]>();
  for (const entry of entries) {
    const key = normalizeHorseName(entry.horseName);
    const list = byNormalizedName.get(key) ?? [];
    if (!list.includes(entry.horseId)) list.push(entry.horseId);
    byNormalizedName.set(key, list);
  }
  return { byNormalizedName };
}

export function resolveRunner(input: RunnerResolveInput, context: RunnerResolverContext): RunnerResolveResult {
  const horseName = input.horseName;

  // Priority 1: canonical horseId一致
  if (input.canonicalHorseIdHint) {
    if (context.canonicalHorseIds.has(input.canonicalHorseIdHint)) {
      return {
        horseName,
        status: "resolved",
        horseId: input.canonicalHorseIdHint,
        candidates: [],
        reason: "canonical horseId一致（Priority 1）。",
      };
    }
  }

  // Priority 2: sourceHorseId → canonical horseId対応
  if (input.sourceHorseId && context.sourceHorseIdRegistry) {
    const mapped = context.sourceHorseIdRegistry[input.sourceHorseId];
    if (mapped && context.canonicalHorseIds.has(mapped)) {
      return {
        horseName,
        status: "resolved",
        horseId: mapped,
        candidates: [],
        reason: `sourceHorseId(${input.sourceHorseId}) → canonical horseId(${mapped}) 対応表による一致（Priority 2）。`,
      };
    }
  }

  // Priority 3: horseName完全一致（正規化後）
  const nameIndex = buildNameIndex(context.canonicalHorseNames);
  const normalized = normalizeHorseName(horseName);
  const candidates = (nameIndex.byNormalizedName.get(normalized) ?? []).filter((id) =>
    context.canonicalHorseIds.has(id),
  );

  if (candidates.length === 1) {
    return {
      horseName,
      status: "resolved",
      horseId: candidates[0],
      candidates: [],
      reason: "horseName完全一致（正規化後、Priority 3）。候補は1頭のみ。",
    };
  }

  if (candidates.length >= 2) {
    return {
      horseName,
      status: "ambiguous",
      horseId: null,
      candidates,
      reason: `horseName「${horseName}」に一致する候補が${candidates.length}頭あり、安全に1頭へ確定できません（同名馬の可能性）。`,
    };
  }

  const hintNote = input.canonicalHorseIdHint
    ? `canonicalHorseIdHint(${input.canonicalHorseIdHint})はcanonical horseIdとして見つかりませんでした。`
    : "";
  return {
    horseName,
    status: "unresolved",
    horseId: null,
    candidates: [],
    reason: `${hintNote}canonical horseIdが見つかりません（horseName完全一致・sourceHorseId対応のいずれも失敗）。`.trim(),
  };
}

export interface RunnerResolveSummary {
  total: number;
  resolved: number;
  unresolved: number;
  ambiguous: number;
}

export interface RunnerResolveBatchResult {
  results: RunnerResolveResult[];
  summary: RunnerResolveSummary;
}

export function resolveRunners(inputs: RunnerResolveInput[], context: RunnerResolverContext): RunnerResolveBatchResult {
  const results = inputs.map((input) => resolveRunner(input, context));
  const summary: RunnerResolveSummary = {
    total: results.length,
    resolved: results.filter((r) => r.status === "resolved").length,
    unresolved: results.filter((r) => r.status === "unresolved").length,
    ambiguous: results.filter((r) => r.status === "ambiguous").length,
  };
  return { results, summary };
}

/**
 * Race Card Input Bridge V1（CHECKPOINT13.2B）。
 *
 * 実際のレース出走表（Race Card Input）を、既存の
 *   Runner Resolver（runnerResolver.ts、CHECKPOINT13.2・無変更）
 *   → RaceEntryInput
 *   → buildGateConfirmedSnapshot()（predictionSnapshot.ts、CHECKPOINT13・無変更）
 *   → buildAbilityBoard()（同上）
 * へ安全に橋渡しする層。ability計算そのもの・Runner Resolverのpriority
 * ロジックは一切ここに複製しない（既存関数をそのまま呼び出すだけ）。
 *
 * 【絶対に守ること】
 *   - Race Cardを読み込んだだけでdata/horses/を書き換えない
 *     （このファイルはfs書き込みを一切行わない）。
 *   - resolverStatus（resolved/unresolved/ambiguous）と
 *     predictionEligible（正式予想に使ってよいか）は別概念として区別する
 *     （CHECKPOINT13.2B STEP9）。
 *   - 1件でも unresolved/ambiguous/predictionIneligible な出走馬がいる場合、
 *     生成したSnapshotは「診断用（diagnostic）」であり「正式（formal）」では
 *     ないことを`gate.formal`で明示する（黙って一部の馬だけでAbility Boardを
 *     完成させない、STEP11）。
 */

import { buildGateConfirmedSnapshot, GOING_UNKNOWN_SENTINEL } from "../predictionSnapshot";
import type { HorseSnapshotEntry, PredictionSnapshot, RaceEntryInput, SnapshotRaceTarget } from "../predictionSnapshot";
import { buildCanonicalHorseRegistry, toCanonicalHorseNameEntries, type CanonicalHorseRegistryEntry } from "./canonicalHorseRegistry";
import { resolveRunners, type ResolverStatus, type RunnerResolverContext } from "./runnerResolver";
import type { RaceCardInput } from "./raceCardTypes";

/** completenessFlags（predictionSnapshot.ts）→ Race Card Bridgeの人間向けreasonコードへの対応 */
const COMPLETENESS_FLAG_TO_REASON: Record<string, string> = {
  placeholderDataExcluded: "placeholder_data",
  insufficientRecentHistory: "insufficientRecentHistory",
  memberLevelUnavailable: "memberLevelUnavailable",
};

export interface RunnerBridgeResult {
  horseName: string;
  resolverStatus: ResolverStatus;
  horseId: string | null;
  /** ambiguousの場合の候補一覧 */
  candidates: string[];
  /**
   * 「正式予想に使ってよいか」。resolverStatus="resolved"は必要条件だが十分条件ではない
   * （CHECKPOINT13.2B STEP9: resolvedとpredictionEligibleは別概念）。
   */
  predictionEligible: boolean;
  /** predictionEligible=falseの理由コード一覧（複数ありうる）。resolved時はcompletenessFlags由来 */
  reasons: string[];
  /** 診断用: 実際にbuildGateConfirmedSnapshotで計算されたエントリ（resolvedの場合のみ非null） */
  snapshotEntry: HorseSnapshotEntry | null;
}

export interface RaceCardBridgeGate {
  /** true: 正式Snapshotとして扱ってよい。false: 診断用（diagnostic）に留める */
  formal: boolean;
  reasons: string[];
}

export interface RaceCardBridgeResult {
  raceCard: RaceCardInput;
  runners: RunnerBridgeResult[];
  summary: {
    totalRunners: number;
    resolved: number;
    unresolved: number;
    ambiguous: number;
    predictionEligible: number;
    predictionIneligible: number;
  };
  gate: RaceCardBridgeGate;
  /**
   * resolvedだった出走馬だけを使って実際に構築したSnapshot（診断用途）。
   * gate.formal=falseの場合、これは正式なStage A Snapshotとしては扱わないこと。
   */
  diagnosticSnapshot: PredictionSnapshot;
}

export interface RunRaceCardBridgeOptions {
  /**
   * source + sourceHorseId → canonical horseId の対応表（Priority 2）。
   * 正式Sourceが未決定の現状では通常{}のまま（架空のmappingを作らない、STEP8）。
   */
  sourceHorseIdRegistry?: Record<string, string>;
  /** Snapshot生成時刻（省略時は現在時刻）。テストで固定したい場合に指定する */
  generatedAt?: string;
  /**
   * テスト専用: canonical horse registryを差し替える。
   * 省略時は常にbuildCanonicalHorseRegistry()でdata/horses/から自動生成する
   * （本番の呼び出しはこのoptionを使わない）。
   */
  registryOverride?: CanonicalHorseRegistryEntry[];
}

function reasonsForUnresolved(): string[] {
  return ["canonical horse not found"];
}

function reasonsForAmbiguous(): string[] {
  return ["multiple name matches"];
}

function reasonsFromSnapshotEntry(entry: HorseSnapshotEntry, registryEntry: CanonicalHorseRegistryEntry | undefined): string[] {
  const reasons: string[] = [];

  // dataKindが馬単位で完全にplaceholder/fixtureの場合、Snapshot側のcompletenessFlagsに
  // 現れる"placeholderDataExcluded"経由で既に検知できるが、念のためレジストリからも確認する
  // （dataKindロールアップは走単位から機械的に導出しただけの派生値で、二重判定ではない）。
  if (registryEntry && (registryEntry.dataKind === "placeholder" || registryEntry.dataKind === "fixture")) {
    if (!reasons.includes("placeholder_data")) reasons.push("placeholder_data");
  }

  for (const flag of entry.completenessFlags) {
    const mapped = COMPLETENESS_FLAG_TO_REASON[flag] ?? flag;
    if (!reasons.includes(mapped)) reasons.push(mapped);
  }

  if (entry.baseAbility === null && reasons.length === 0) {
    reasons.push("noUsableHistory");
  }

  return reasons;
}

/**
 * Race Card Input を、既存のRunner Resolver → RaceEntryInput → Stage A Snapshotへ
 * 橋渡しする。data/horses/への書き込みは一切行わない（読み取り専用）。
 */
export function runRaceCardBridge(raceCard: RaceCardInput, options: RunRaceCardBridgeOptions = {}): RaceCardBridgeResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  // STEP6: 24頭分の手作業ハードコードではなく、data/horses/から自動生成する
  const registry = options.registryOverride ?? buildCanonicalHorseRegistry();
  const registryByHorseId = new Map(registry.map((e) => [e.horseId, e]));

  const resolverContext: RunnerResolverContext = {
    canonicalHorseIds: new Set(registry.map((e) => e.horseId)),
    canonicalHorseNames: toCanonicalHorseNameEntries(registry),
    sourceHorseIdRegistry: options.sourceHorseIdRegistry ?? {},
  };

  const { results: resolverResults } = resolveRunners(
    raceCard.runners.map((r) => ({
      horseName: r.horseName,
      canonicalHorseIdHint: r.horseId ?? null,
      sourceHorseId: r.sourceHorseId ?? null,
    })),
    resolverContext,
  );

  const resolvedEntries: RaceEntryInput[] = [];
  raceCard.runners.forEach((runner, i) => {
    const resolved = resolverResults[i];
    if (resolved.status === "resolved" && resolved.horseId) {
      resolvedEntries.push({
        horseId: resolved.horseId,
        horseName: runner.horseName,
        frame: runner.frame,
        horseNumber: runner.horseNumber,
        carriedWeight: runner.assignedWeight ?? null,
        scratched: runner.scratched,
      });
    }
  });

  const raceTarget: SnapshotRaceTarget = {
    raceId: raceCard.raceId,
    raceName: raceCard.raceId, // Race Card Input V1にraceName項目は無いためraceIdを流用（表示専用、計算には影響しない）
    raceDate: raceCard.raceDate,
    racecourse: raceCard.racecourse,
    surface: raceCard.surface,
    distance: raceCard.distance,
    raceNumber: raceCard.raceNumber,
    postTimeIso: raceCard.scheduledStartTime,
  };

  const going =
    raceCard.going !== null && raceCard.going !== GOING_UNKNOWN_SENTINEL
      ? ({ evaluated: true, going: raceCard.going } as const)
      : ({ evaluated: false } as const);

  const diagnosticSnapshot = buildGateConfirmedSnapshot({
    raceTarget,
    entries: resolvedEntries,
    going,
    generatedAt,
  });
  const snapshotByHorseId = new Map(diagnosticSnapshot.runners.map((r) => [r.horseId, r]));

  const runners: RunnerBridgeResult[] = raceCard.runners.map((runner, i) => {
    const resolved = resolverResults[i];

    if (resolved.status === "unresolved") {
      return {
        horseName: runner.horseName,
        resolverStatus: "unresolved",
        horseId: null,
        candidates: [],
        predictionEligible: false,
        reasons: reasonsForUnresolved(),
        snapshotEntry: null,
      };
    }
    if (resolved.status === "ambiguous") {
      return {
        horseName: runner.horseName,
        resolverStatus: "ambiguous",
        horseId: null,
        candidates: resolved.candidates,
        predictionEligible: false,
        reasons: reasonsForAmbiguous(),
        snapshotEntry: null,
      };
    }

    const snapshotEntry = resolved.horseId ? (snapshotByHorseId.get(resolved.horseId) ?? null) : null;
    const registryEntry = resolved.horseId ? registryByHorseId.get(resolved.horseId) : undefined;
    const reasons = snapshotEntry ? reasonsFromSnapshotEntry(snapshotEntry, registryEntry) : ["snapshotEntryMissing"];
    const predictionEligible =
      !!snapshotEntry && !snapshotEntry.scratched && snapshotEntry.baseAbility !== null && reasons.length === 0;

    return {
      horseName: runner.horseName,
      resolverStatus: "resolved",
      horseId: resolved.horseId,
      candidates: [],
      predictionEligible,
      reasons: snapshotEntry?.scratched ? ["scratched"] : reasons,
      snapshotEntry,
    };
  });

  const resolvedCount = runners.filter((r) => r.resolverStatus === "resolved").length;
  const unresolvedCount = runners.filter((r) => r.resolverStatus === "unresolved").length;
  const ambiguousCount = runners.filter((r) => r.resolverStatus === "ambiguous").length;
  const eligibleCount = runners.filter((r) => r.predictionEligible).length;
  const ineligibleCount = runners.length - eligibleCount;

  const gateReasons: string[] = [];
  if (unresolvedCount > 0) gateReasons.push(`${unresolvedCount}頭がunresolved`);
  if (ambiguousCount > 0) gateReasons.push(`${ambiguousCount}頭がambiguous`);
  if (ineligibleCount > 0) gateReasons.push(`${ineligibleCount}頭がpredictionIneligible`);

  return {
    raceCard,
    runners,
    summary: {
      totalRunners: runners.length,
      resolved: resolvedCount,
      unresolved: unresolvedCount,
      ambiguous: ambiguousCount,
      predictionEligible: eligibleCount,
      predictionIneligible: ineligibleCount,
    },
    gate: { formal: gateReasons.length === 0, reasons: gateReasons },
    diagnosticSnapshot,
  };
}

/** CHECKPOINT13.2B STEP10の書式に沿った、人間向けテキストレポートを生成する */
export function formatRaceCardBridgeReport(result: RaceCardBridgeResult): string {
  const lines: string[] = [];
  lines.push(`Race: ${result.raceCard.raceId}`);
  lines.push(`Race Number: ${result.raceCard.raceNumber}`);
  lines.push("");
  lines.push(`Total runners: ${result.summary.totalRunners}`);
  lines.push(`Resolved: ${result.summary.resolved}`);
  lines.push(`Unresolved: ${result.summary.unresolved}`);
  lines.push(`Ambiguous: ${result.summary.ambiguous}`);
  lines.push("");
  lines.push(`Prediction eligible: ${result.summary.predictionEligible}`);
  lines.push(`Prediction ineligible: ${result.summary.predictionIneligible}`);
  lines.push("");
  lines.push(`Gate: ${result.gate.formal ? "FORMAL（正式Snapshotとして扱えます）" : "DIAGNOSTIC ONLY（正式Snapshotとしては扱えません）"}`);
  if (!result.gate.formal) {
    for (const reason of result.gate.reasons) lines.push(`  - ${reason}`);
  }
  lines.push("");

  for (const runner of result.runners) {
    lines.push(runner.horseName);
    lines.push(`resolverStatus: ${runner.resolverStatus}`);
    if (runner.resolverStatus === "resolved") {
      lines.push(`predictionEligible: ${runner.predictionEligible}`);
    }
    if (runner.candidates.length > 0) {
      lines.push(`candidates: ${runner.candidates.join(", ")}`);
    }
    if (runner.reasons.length > 0) {
      lines.push("reason:");
      for (const reason of runner.reasons) lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

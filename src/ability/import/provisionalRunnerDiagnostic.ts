/**
 * Provisional Runner Resolve / Data Gap Audit（CHECKPOINT13.3）。
 *
 * 正式枠順・馬番・馬場・オッズが未確定な「登録段階（registered but not yet
 * drawn）」の出走予定馬を、Runner Resolver → Prediction Eligibility →
 * Missing Data Report / DATA REQUEST MANIFESTまで診断する。
 *
 * 【CHECKPOINT13.2Bのraceカード経路と意図的に別モジュールにした理由】
 *   raceCardTypes.ts / raceCardBridge.ts の`RaceCardRunnerInput`は
 *   frame/horseNumberを必須（number、null不可）としている（「正式枠順確定後」
 *   のStage A入力を想定した設計、CHECKPOINT13.2Bの明示的な仕様）。
 *   今回は逆に「枠順が絶対に無い」状態が前提のため、frame/horseNumberを
 *   要求しない、より軽量なProvisional Runner専用の型・関数をここに用意する。
 *   Runner Resolver（runnerResolver.ts）・Stage A計算（predictionSnapshot.ts）
 *   自体は一切変更せず、そのまま呼び出す。
 *
 * 【絶対に守ること】
 *   - frame/horseNumber/going/oddsを推測・仮値で埋めない。
 *   - sourceHorseIdからcanonicalHorseIdを勝手に推測しない
 *     （sourceHorseIdRegistryに実データが無い限りPriority 2は発火しない）。
 *   - 対象馬だけの部分データからraceScoreを計算しない
 *     （baseAbilityは必ずgetHorseRecentRaces()＝data/horses/全体を投入した
 *     buildRaceHistory()の結果を経由する。CHECKPOINT12.5/12.6/13で確認済みの
 *     正式経路と同一）。
 *   - ここで生成する結果は常に診断用（diagnostic・provisional）であり、
 *     正式なPrediction Snapshotとして保存しない（呼び出し側もfs書き込みを
 *     一切行わないこと）。
 */

import { buildHorseSnapshotEntry, GOING_UNKNOWN_SENTINEL } from "../predictionSnapshot";
import type { HorseSnapshotEntry, RaceEntryInput, SnapshotRaceTarget } from "../predictionSnapshot";
import { RECENT_RACE_COUNT } from "../baseAbility";
import {
  buildCanonicalHorseRegistry,
  toCanonicalHorseNameEntries,
  type CanonicalHorseRegistryEntry,
} from "./canonicalHorseRegistry";
import { reasonsFromSnapshotEntry } from "./raceCardBridge";
import { resolveRunners, type ResolverStatus, type RunnerResolverContext } from "./runnerResolver";

/** 登録段階の出走予定馬。frame/horseNumberは意図的に持たない（未確定のため） */
export interface ProvisionalRegisteredRunner {
  horseName: string;
  /** ユーザー提供の外部Source ID（例: netkeiba horse ID）。canonicalHorseIdとは別物 */
  sourceHorseId: string;
}

/** 対象レースの、現時点で確定している条件のみ（going等は未確定ならnull） */
export interface ProvisionalRaceTarget {
  raceLabel: string;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  /** 未確定ならnull（推測で埋めない） */
  going: string | null;
}

export interface ProvisionalHorseDiagnostic {
  horseName: string;
  sourceHorseId: string;
  canonicalHorseId: string | null;
  resolverStatus: ResolverStatus;
  candidates: string[];
  /** 馬単位のdataKindロールアップ。resolverStatusがresolved以外ならnull */
  dataKind: CanonicalHorseRegistryEntry["dataKind"] | null;
  predictionEligible: boolean;
  baseAbilityAvailable: boolean;
  baseAbility: number | null;
  /** distance/course/going/gateそれぞれのevaluated状態のみ（診断用、overallSuitabilityは正式値として出さない） */
  suitabilityPreview: { distance: boolean; course: boolean; going: boolean; gate: boolean } | null;
  warnings: string[];
  /** 何が不足しているか（reasonコード。raceCardBridge.tsと同じ語彙を再利用） */
  missing: string[];
}

export interface ProvisionalDiagnosticResult {
  status: "provisional";
  formal: false;
  raceTarget: ProvisionalRaceTarget;
  runners: ProvisionalHorseDiagnostic[];
  summary: {
    totalRunners: number;
    resolved: number;
    unresolved: number;
    ambiguous: number;
    predictionEligible: number;
  };
}

export interface RunProvisionalDiagnosticOptions {
  /** 今回はまだ実データが無い前提（STEP6/8）。架空mappingを作らないよう明示的に渡す */
  sourceHorseIdRegistry?: Record<string, string>;
  /** 診断基準時刻（省略時は現在時刻）。future leakage防止のcutoffとして使う */
  diagnosticAt?: string;
  /** テスト専用のregistry差し替え。省略時はdata/horses/から自動生成 */
  registryOverride?: CanonicalHorseRegistryEntry[];
}

/**
 * 登録段階の出走予定馬一覧を、Runner Resolver → Prediction Eligibility →
 * Base Ability診断まで通す。data/horses/への書き込みは一切行わない。
 */
export function runProvisionalDiagnostic(
  runners: ProvisionalRegisteredRunner[],
  raceTarget: ProvisionalRaceTarget,
  options: RunProvisionalDiagnosticOptions = {},
): ProvisionalDiagnosticResult {
  const diagnosticAt = options.diagnosticAt ?? new Date().toISOString();
  const registry = options.registryOverride ?? buildCanonicalHorseRegistry();
  const registryByHorseId = new Map(registry.map((e) => [e.horseId, e]));

  const resolverContext: RunnerResolverContext = {
    canonicalHorseIds: new Set(registry.map((e) => e.horseId)),
    canonicalHorseNames: toCanonicalHorseNameEntries(registry),
    // STEP6/8: sourceHorseIdからcanonicalHorseIdを勝手に推測しない。
    // 実データの対応表が無ければ常に空のまま（Priority 2は発火しない）。
    sourceHorseIdRegistry: options.sourceHorseIdRegistry ?? {},
  };

  const { results: resolverResults } = resolveRunners(
    runners.map((r) => ({ horseName: r.horseName, sourceHorseId: r.sourceHorseId })),
    resolverContext,
  );

  const snapshotTarget: SnapshotRaceTarget = {
    raceId: `PROVISIONAL-${raceTarget.raceLabel}`,
    raceName: raceTarget.raceLabel,
    raceDate: diagnosticAt.slice(0, 10),
    racecourse: raceTarget.racecourse,
    surface: raceTarget.surface,
    distance: raceTarget.distance,
    raceNumber: null,
    postTimeIso: diagnosticAt,
  };
  const going =
    raceTarget.going !== null && raceTarget.going !== GOING_UNKNOWN_SENTINEL
      ? ({ evaluated: true, going: raceTarget.going } as const)
      : ({ evaluated: false } as const);

  const diagnostics: ProvisionalHorseDiagnostic[] = runners.map((runner, i) => {
    const resolved = resolverResults[i];

    if (resolved.status !== "resolved" || !resolved.horseId) {
      return {
        horseName: runner.horseName,
        sourceHorseId: runner.sourceHorseId,
        canonicalHorseId: null,
        resolverStatus: resolved.status,
        candidates: resolved.candidates,
        dataKind: null,
        predictionEligible: false,
        baseAbilityAvailable: false,
        baseAbility: null,
        suitabilityPreview: null,
        warnings: [],
        missing:
          resolved.status === "ambiguous"
            ? ["multiple name matches"]
            : ["canonical horse not found"],
      };
    }

    const canonicalHorseId = resolved.horseId;
    const registryEntry = registryByHorseId.get(canonicalHorseId);

    // frame/horseNumber/carriedWeightは未確定のため一切埋めない（null）。
    // これはpredictionSnapshot.tsのbuildHorseSnapshotEntry()が既にnullを
    // 正しく扱える設計になっている（CHECKPOINT13で確認済み、無変更）。
    const entryInput: RaceEntryInput = {
      horseId: canonicalHorseId,
      horseName: runner.horseName,
      frame: null,
      horseNumber: null,
      carriedWeight: null,
      scratched: false,
    };

    // 【絶対に守ること】ここではbuildRaceHistory()を一切呼ばない。
    // buildHorseSnapshotEntry()自体がgetHorseRecentRaces()（data/horses/全体を
    // 投入して起動時に一度だけ計算済みのhistoryByHorseIdを参照するだけ）を
    // 経由するため、対象11頭だけの部分データからraceScoreを再計算することは
    // 構造的に起こらない（CHECKPOINT13.1/13.2で確認済みの安全性がそのまま適用される）。
    const snapshotEntry: HorseSnapshotEntry = buildHorseSnapshotEntry(
      entryInput,
      snapshotTarget,
      going,
      diagnosticAt,
      null,
    );

    const reasons = reasonsFromSnapshotEntry(snapshotEntry, registryEntry);
    const predictionEligible = snapshotEntry.baseAbility !== null && reasons.length === 0;

    return {
      horseName: runner.horseName,
      sourceHorseId: runner.sourceHorseId,
      canonicalHorseId,
      resolverStatus: "resolved",
      candidates: [],
      dataKind: registryEntry?.dataKind ?? null,
      predictionEligible,
      baseAbilityAvailable: snapshotEntry.baseAbility !== null,
      baseAbility: snapshotEntry.baseAbility,
      suitabilityPreview: snapshotEntry.suitability
        ? {
            distance: snapshotEntry.suitability.distance.evaluated,
            course: snapshotEntry.suitability.course.evaluated,
            going: snapshotEntry.suitability.going.evaluated,
            gate: snapshotEntry.suitability.gate.evaluated,
          }
        : null,
      warnings: snapshotEntry.warnings,
      missing: reasons,
    };
  });

  return {
    status: "provisional",
    formal: false,
    raceTarget,
    runners: diagnostics,
    summary: {
      totalRunners: diagnostics.length,
      resolved: diagnostics.filter((d) => d.resolverStatus === "resolved").length,
      unresolved: diagnostics.filter((d) => d.resolverStatus === "unresolved").length,
      ambiguous: diagnostics.filter((d) => d.resolverStatus === "ambiguous").length,
      predictionEligible: diagnostics.filter((d) => d.predictionEligible).length,
    },
  };
}

/** CHECKPOINT13.3 STEP7の書式に沿った、人間向けテキストレポートを生成する */
export function formatProvisionalDiagnosticReport(result: ProvisionalDiagnosticResult): string {
  const lines: string[] = [];
  lines.push(`${result.raceTarget.raceLabel}`);
  lines.push(`Status: ${result.status.toUpperCase()}${result.formal ? "" : " (NOT FORMAL PREDICTION)"}`);
  lines.push("");
  lines.push(`Registered runners: ${result.summary.totalRunners}`);
  lines.push("");
  lines.push(`Resolved:`);
  lines.push(`${result.summary.resolved} / ${result.summary.totalRunners}`);
  lines.push("");
  lines.push(`Unresolved:`);
  lines.push(`${result.summary.unresolved} / ${result.summary.totalRunners}`);
  lines.push("");
  lines.push(`Ambiguous:`);
  lines.push(`${result.summary.ambiguous} / ${result.summary.totalRunners}`);
  lines.push("");
  lines.push(`Prediction eligible:`);
  lines.push(`${result.summary.predictionEligible} / ${result.summary.totalRunners}`);
  lines.push("");

  for (const r of result.runners) {
    lines.push(r.horseName);
    lines.push(`sourceHorseId: ${r.sourceHorseId}`);
    lines.push(`canonicalHorseId: ${r.canonicalHorseId ?? "(none)"}`);
    lines.push(`resolverStatus: ${r.resolverStatus}`);
    lines.push(`predictionEligible: ${r.predictionEligible}`);
    lines.push(`dataKind: ${r.dataKind ?? "(unknown)"}`);
    if (r.baseAbilityAvailable) {
      lines.push(`baseAbility (diagnostic): ${r.baseAbility}`);
    }
    if (r.missing.length > 0) {
      lines.push("reason:");
      for (const m of r.missing) lines.push(`- ${m}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/** 1件分のDATA REQUEST MANIFESTエントリ */
export interface DataRequestManifestEntry {
  horseName: string;
  sourceHorseId: string;
  requiredRaces: string[];
  requiredFields: string[];
  note: string;
}

/**
 * predictionEligible=falseの馬について、DATA REQUEST MANIFESTを生成する。
 * 実際のraceId/raceDate等は捏造しない（STEP12: 「必要最小限だけ要求すること」）。
 * Base Ability V1の既存仕様（RECENT_RACE_COUNT=直近5走）をそのまま参照するだけで、
 * 新しいルールは作らない。
 */
export function buildDataRequestManifest(result: ProvisionalDiagnosticResult): DataRequestManifestEntry[] {
  return result.runners
    .filter((r) => !r.predictionEligible)
    .map((r) => ({
      horseName: r.horseName,
      sourceHorseId: r.sourceHorseId,
      requiredRaces: [
        `直近${RECENT_RACE_COUNT}走程度（Base Ability V1の既存仕様の窓。それ以上の大量データは不要）`,
        "raceDate（実際の出走日。推測不可）",
        "raceId（分かれば）",
        "racecourse",
        "raceName（分かれば）",
      ],
      requiredFields: [
        "finishPosition",
        "raceTime",
        "timeGap",
        "final3F",
        "carriedWeight",
        "passingPositions（可能なら）",
        "同レースの勝ち馬データ（raceTimeScoreの基準タイムに必要。勝ち馬欠落を防ぐため）",
        "同レースの実際の対戦馬データ（final3FScore/weightScore/memberLevelの比較母集団を成立させるため。対象馬の行だけでは自己参照的に中立化してしまう）",
      ],
      note:
        r.missing.includes("canonical horse not found")
          ? "現在canonicalデータが0件のため、上記を最小限の初期データとして必要とします。"
          : `現在の不足理由: ${r.missing.join(", ")}`,
    }));
}

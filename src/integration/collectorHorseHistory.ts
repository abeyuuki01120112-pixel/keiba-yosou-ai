/**
 * Collector priorHistoriesをcanonical horseId単位でproduction Horse Historyへ
 * 非破壊mergeし、既存raceScore pipelineで全履歴を再計算するP0-2境界。
 */

import {
  buildHorseHistoriesAsOf,
  getProductionRawHorseHistories,
  type HorseHistoryRawData,
} from "../ability/horseAbilityData";
import { mergeHorseRaceHistory, type MergeHorseHistoryResult } from "../ability/import/mergeHorseHistory";
import { isPriorPerformance, type PredictionTarget } from "../ability/predictionBoundary";
import type { RaceHistoryRawInput } from "../ability/raceHistoryPipeline";
import type { RacePerformance } from "../ability/types";
import type {
  CollectedRunnerRow,
  PriorHistoryEntry,
  UnsupportedPriorHistoryEvidence,
} from "../collector/types";
import {
  selectJvLinkCanonicalRuntimeHistory,
  type JvLinkHistoryConflictDiagnostic,
} from "./jvLinkHistoryConflict";
import { resolveCareerCompleteness, type CareerCompletenessContract } from "./careerCompleteness";

export interface CollectorHorseHistoryConnection {
  ok: boolean;
  errors: string[];
  issues: CollectorHorseHistoryIssue[];
  historiesByHorseId: Record<string, RacePerformance[]>;
  rawHistoriesByHorseId: HorseHistoryRawData;
  mergeByHorseId: Record<string, MergeHorseHistoryResult>;
  /** Repositoryとの差を残しつつruntimeでJV-Linkを採用した記録。 */
  jvLinkConflictDiagnostics: JvLinkHistoryConflictDiagnostic[];
  /** Selected-5と実際にRaceScoreへ渡せる履歴を分離した監査情報。 */
  abilityEvidenceByHorseId: Record<string, SelectedHistoryAbilityEvidence>;
  /** Career Completeness Contract（P0）。JRA-VAN/JV-Link出典で通算出走数の完全性を判定した監査情報。 */
  careerCompletenessByHorseId: Record<string, CareerCompletenessContract>;
}

export interface UnscorableSelectedHistoryEvidence {
  raceKey: string;
  stage: string;
  reason: string;
  source: UnsupportedPriorHistoryEvidence;
}

export interface SelectedHistoryAbilityEvidence {
  selectedHistoryCount: number;
  scorableHistoryCount: number;
  unscorableHistoryCount: number;
  /** scorable / selected。Ability値への係数としては使用しない。 */
  historyCompleteness: number;
  /** 既存Evidenceの段階名を再利用するが、Ability値へ係数は掛けない。 */
  historyConfidence: "high" | "medium" | "low" | "insufficient";
  formalAbilityReady: boolean;
  unscorableHistories: UnscorableSelectedHistoryEvidence[];
}

export type CollectorHorseHistoryIssueCode =
  | "UNRESOLVED_CANONICAL_HORSE_ID"
  | "DUPLICATE_HISTORY_ENTRY"
  | "HISTORY_TARGET_MISMATCH"
  | "INCOMPLETE_PRIOR_HISTORY"
  | "INVALID_HISTORY_RECORD"
  | "HISTORY_CONFLICT"
  | "UNSUPPORTED_STAGE_B_HISTORY"
  | "INSUFFICIENT_SCORABLE_HISTORY";

export interface CollectorHorseHistoryIssue {
  code: CollectorHorseHistoryIssueCode;
  horseId: string;
  raceId: string | null;
  message: string;
}

/** Collector側で計算済みのscore群を捨て、再計算に必要な実績値だけへ戻す。 */
export function toRaceHistoryRawInput(race: RacePerformance): RaceHistoryRawInput {
  return {
    raceId: race.raceId,
    raceName: race.raceName,
    raceDate: race.raceDate,
    racecourse: race.racecourse,
    surface: race.surface,
    distance: race.distance,
    going: race.going,
    passingPosition: race.passingPosition,
    raceNumber: race.raceNumber,
    gate: race.gate,
    horseNumber: race.horseNumber,
    fieldSize: race.fieldSize,
    source: race.source,
    sourceRaceId: race.sourceRaceId,
    sourceHorseId: race.sourceHorseId,
    importedAt: race.importedAt,
    availableAt: race.availableAt,
    dataKind: race.dataKind,
    finishPosition: race.finishPosition,
    timeGap: race.timeGap,
    raceTime: race.raceTime,
    final3F: race.final3F,
    carriedWeight: race.carriedWeight,
  };
}

function historyOrder(a: RaceHistoryRawInput, b: RaceHistoryRawInput): number {
  return b.raceDate.localeCompare(a.raceDate) || b.raceId.localeCompare(a.raceId);
}

function hasValidRawFacts(race: RacePerformance): boolean {
  // 平場等ではJV-Link RAの競走名が空欄になり得る。raceNameはAbility数値に
  // 使用しない監査表示項目なので、空欄を理由に実測値一式を捨てない。
  return Boolean(race.raceId && race.racecourse && race.going) &&
    (race.surface === "turf" || race.surface === "dirt") &&
    Number.isFinite(race.distance) && race.distance > 0 &&
    Number.isInteger(race.finishPosition) && race.finishPosition > 0 &&
    Number.isFinite(race.timeGap) && Number.isFinite(race.raceTime) && race.raceTime > 0 &&
    Number.isFinite(race.final3F) && race.final3F > 0 &&
    Number.isFinite(race.carriedWeight) && race.carriedWeight > 0;
}

function unscorableReason(race: UnsupportedPriorHistoryEvidence): string {
  if (race.reasonCodes.includes("FINAL3F_NOT_PROVIDED") ||
      race.reasonCodes.includes("FINAL3F_MISSING_OVERSEAS")) {
    return "FINAL3F_NOT_PROVIDED";
  }
  return race.reasonCodes[0] ?? "UNSCORABLE_REQUIRED_MEASUREMENT_NOT_PROVIDED";
}

/**
 * runner.horseIdとPriorHistoryEntry.horseIdの完全一致だけをcanonical対応として認める。
 * 馬名・sourceHorseId・配列順からの推測mergeは行わない。
 */
export function connectCollectorHorseHistories(
  runners: readonly CollectedRunnerRow[],
  priorHistories: readonly PriorHistoryEntry[],
  target: PredictionTarget,
  cutoff: string,
  baseRawHistories?: Readonly<Record<string, readonly RaceHistoryRawInput[]>>,
): CollectorHorseHistoryConnection {
  const errors: string[] = [];
  const issues: CollectorHorseHistoryIssue[] = [];
  const addIssue = (code: CollectorHorseHistoryIssueCode, horseId: string, raceId: string | null = null) => {
    const suffix = raceId === null ? horseId : `${horseId}/${raceId}`;
    const message = `${code}: ${suffix}`;
    issues.push({ code, horseId, raceId, message });
    errors.push(message);
  };
  const runnerIds = new Set(runners.map((runner) => runner.horseId));
  const activeRunnerIds = new Set(runners
    .filter((runner) => runner.entryStatus !== "scratched" && runner.entryStatus !== "excluded")
    .map((runner) => runner.horseId));
  const rawHistoriesByHorseId: HorseHistoryRawData = baseRawHistories == null
    ? getProductionRawHorseHistories()
    : Object.fromEntries(
        Object.entries(baseRawHistories).map(([horseId, races]) => [horseId, [...races]]),
      );
  const mergeByHorseId: Record<string, MergeHorseHistoryResult> = {};
  const jvLinkConflictDiagnostics: JvLinkHistoryConflictDiagnostic[] = [];
  const seenHistoryIds = new Set<string>();

  for (const history of priorHistories) {
    if (!runnerIds.has(history.horseId)) {
      addIssue("UNRESOLVED_CANONICAL_HORSE_ID", history.horseId);
      continue;
    }
    if (seenHistoryIds.has(history.horseId)) {
      addIssue("DUPLICATE_HISTORY_ENTRY", history.horseId);
      continue;
    }
    seenHistoryIds.add(history.horseId);
    if (history.provenance.targetRaceId !== target.raceId) {
      addIssue("HISTORY_TARGET_MISMATCH", history.horseId);
      continue;
    }
    if (history.status !== "available") {
      if (activeRunnerIds.has(history.horseId)) addIssue("INCOMPLETE_PRIOR_HISTORY", history.horseId);
      continue;
    }

    const hasUnsupportedHistory = (history.unsupportedHistories?.length ?? 0) > 0;

    const priorRaces = history.races.filter((race) => isPriorPerformance(race, target, cutoff));
    const invalid = priorRaces.find((race) => !hasValidRawFacts(race));
    if (invalid) {
      addIssue("INVALID_HISTORY_RECORD", history.horseId, invalid.raceId || "(empty raceId)");
      continue;
    }
    const incoming = priorRaces
      .filter((race) => race.dataKind == null || race.dataKind === "real")
      .map(toRaceHistoryRawInput);
    if (history.provenance.method === "jv_link") {
      const selectedHistoryCount = history.selectedRaceKeys?.length ??
        incoming.length + (history.unsupportedHistories?.length ?? 0);
      if (hasUnsupportedHistory && (selectedHistoryCount !== 5 || incoming.length < 4)) {
        addIssue(
          "INSUFFICIENT_SCORABLE_HISTORY",
          history.horseId,
          history.unsupportedHistories?.[0]?.raceKey ?? null,
        );
      }
      const selected = selectJvLinkCanonicalRuntimeHistory(
        history.horseId,
        rawHistoriesByHorseId[history.horseId] ?? [],
        incoming,
      );
      jvLinkConflictDiagnostics.push(...selected.diagnostics);
      mergeByHorseId[history.horseId] = {
        merged: selected.runtimeHistory,
        addedRaceIds: selected.addedRaceIds,
        duplicateRaceIds: selected.duplicateRaceIds,
        enriched: [],
        conflicts: [],
      };
      // manifest選択済み履歴だけをruntime正本とする。unscorable走はEvidenceに残し、
      // Repositoryの旧6走目へ置換せず、scorableな選択走だけをRaceScoreへ渡す。
      rawHistoriesByHorseId[history.horseId] = [...selected.runtimeHistory].sort(historyOrder);
      continue;
    }
    const merged = mergeHorseRaceHistory(rawHistoriesByHorseId[history.horseId] ?? [], incoming);
    mergeByHorseId[history.horseId] = merged;
    if (merged.conflicts.length > 0) {
      for (const conflict of merged.conflicts) {
        addIssue("HISTORY_CONFLICT", history.horseId, conflict.raceId);
      }
      continue;
    }
    rawHistoriesByHorseId[history.horseId] = [...merged.merged].sort(historyOrder);
  }

  for (const horseId of activeRunnerIds) {
    if (!seenHistoryIds.has(horseId)) addIssue("INCOMPLETE_PRIOR_HISTORY", horseId);
  }

  // 正式仕様（rescue正式化ラウンド）: canonical母集合は1つだけ。
  // Repository production histories + 対象馬のJV-Link canonical histories
  // （unscorable Stage B走は上のmerge時点で既に除外済み。UnscorableSelectedHistoryEvidence
  // として別途保持し、RaceHistoryRawInputへは混入させない）を統合したrawHistoriesByHorseIdを、
  // buildHorseHistoriesAsOf()（= buildRaceHistory()の全馬横断呼び出し）へ一度だけ投入する。
  // ある馬の追加によりraceFinal3FMedianSeconds・raceMedianWeightKg・memberLevelScoreAtRace等の
  // race-level shared contextを共有する他馬のAbilityが変動することは、Base Ability V1の
  // 母集合依存の仕様上正常な挙動であり、これを打ち消すための特別な二段計算は行わない。
  const historiesByHorseId = buildHorseHistoriesAsOf(rawHistoriesByHorseId, target, cutoff);
  const priorByHorseId = new Map(priorHistories.map((history) => [history.horseId, history]));
  const abilityEvidenceByHorseId: Record<string, SelectedHistoryAbilityEvidence> = {};
  const careerCompletenessByHorseId: Record<string, CareerCompletenessContract> = {};
  for (const runner of runners) {
    const history = priorByHorseId.get(runner.horseId);
    careerCompletenessByHorseId[runner.horseId] = resolveCareerCompleteness(runner.horseId, cutoff, history);
    const availableScorableCount = historiesByHorseId[runner.horseId]?.length ?? 0;
    const unscorableHistories = (history?.unsupportedHistories ?? []).map((race) => ({
      raceKey: race.raceKey,
      stage: race.raStage === race.seStage ? race.raStage : `${race.raStage}/${race.seStage}`,
      reason: unscorableReason(race),
      source: race,
    }));
    const selectedHistoryCount = history?.provenance.method === "jv_link"
      ? history.selectedRaceKeys?.length ?? availableScorableCount + unscorableHistories.length
      : Math.min(availableScorableCount, 5);
    const scorableHistoryCount = Math.min(availableScorableCount, selectedHistoryCount);
    const historyCompleteness = selectedHistoryCount === 0
      ? 0
      : scorableHistoryCount / selectedHistoryCount;
    const blockingIssue = issues.some((issue) => issue.horseId === runner.horseId);
    const formalAbilityReady = selectedHistoryCount === 5 && scorableHistoryCount >= 4 && !blockingIssue;
    abilityEvidenceByHorseId[runner.horseId] = {
      selectedHistoryCount,
      scorableHistoryCount,
      unscorableHistoryCount: unscorableHistories.length,
      historyCompleteness,
      historyConfidence: scorableHistoryCount >= 5
        ? "high"
        : scorableHistoryCount === 4
          ? "medium"
          : scorableHistoryCount === 3
            ? "low"
            : "insufficient",
      formalAbilityReady,
      unscorableHistories,
    };
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    issues,
    historiesByHorseId,
    rawHistoriesByHorseId,
    mergeByHorseId,
    jvLinkConflictDiagnostics,
    abilityEvidenceByHorseId,
    careerCompletenessByHorseId,
  };
}

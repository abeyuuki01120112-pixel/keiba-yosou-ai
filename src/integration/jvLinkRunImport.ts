import { calculateBaseAbility } from "../ability/baseAbility";
import type { CollectedRaceIdentity, CollectorValidationResult, FutureLeakageAuditResult } from "../collector/types";
import { writeNormalizedCache, type NormalizedCacheEntry } from "../collector/cache";
import { auditFutureLeakage } from "../collector/leakageGuard";
import { adaptJvLinkRunFolder, type AdaptedJvLinkRunFolder } from "../collector/jvlink/runFolderAdapter";
import { loadJvLinkRunFolder, type LoadedJvLinkRunFolder } from "../collector/jvlink/runFolderLoader";
import { normalizeRaceBundle, validateNormalizedRunners } from "../collector/normalize";
import {
  connectCollectorHorseHistories,
  type CollectorHorseHistoryConnection,
  type UnscorableSelectedHistoryEvidence,
} from "./collectorHorseHistory";

export interface JvLinkAbilityReadiness {
  horseId: string;
  horseName: string;
  ready: boolean;
  historyCount: number;
  baseAbility: number | null;
  reasons: string[];
  selectedHistoryCount: number;
  scorableHistoryCount: number;
  unscorableHistoryCount: number;
  historyCompleteness: number;
  historyConfidence: "high" | "medium" | "low" | "insufficient";
  unscorableHistories: UnscorableSelectedHistoryEvidence[];
}

export interface ImportJvLinkRunOptions {
  expectedRaceId?: string;
  normalizedDir?: string;
  skipCache?: boolean;
}

export interface ImportJvLinkRunResult {
  loaded: LoadedJvLinkRunFolder;
  adapted: AdaptedJvLinkRunFolder;
  race: CollectedRaceIdentity;
  normalized: NormalizedCacheEntry;
  validation: CollectorValidationResult;
  leakage: FutureLeakageAuditResult;
  historyConnection: CollectorHorseHistoryConnection;
  ability: JvLinkAbilityReadiness[];
  cache: { wasCached: boolean; writtenPath: string | null };
}

/** Windows raw artifactからNormalize・Integration・Base Abilityまでを一度に検証するMac entry point。 */
export function importJvLinkRunFolder(
  runDir: string,
  options: ImportJvLinkRunOptions = {},
): ImportJvLinkRunResult {
  const loaded = loadJvLinkRunFolder(runDir, options.expectedRaceId);
  const adapted = adaptJvLinkRunFolder(loaded);
  const runners = normalizeRaceBundle(adapted.targetBundle);
  const validation = validateNormalizedRunners(runners);
  const leakage = auditFutureLeakage(adapted.targetBundle.raceDate, adapted.priorHistories);
  if (!validation.ok) throw new Error(`JVLINK_NORMALIZE_VALIDATION_FAILED: ${validation.errors.join(";")}`);
  if (!leakage.ok) throw new Error(`JVLINK_FUTURE_LEAKAGE_DETECTED: ${JSON.stringify(leakage.violations)}`);

  const race: CollectedRaceIdentity = {
    raceId: adapted.targetBundle.raceId,
    raceDate: adapted.targetBundle.raceDate,
    racecourse: adapted.targetBundle.racecourse,
    raceNumber: adapted.targetBundle.raceNumber,
    raceName: adapted.targetBundle.raceName,
    surface: adapted.targetBundle.surface,
    distance: adapted.targetBundle.distance,
    going: adapted.targetBundle.going,
    courseLayout: adapted.targetBundle.courseLayout,
    courseVariant: adapted.targetBundle.courseVariant,
  };
  const historyConnection = connectCollectorHorseHistories(
    runners,
    adapted.priorHistories,
    { raceId: race.raceId, raceDate: race.raceDate, postTimeIso: adapted.scheduledStartTime },
    adapted.predictionCutoffAt,
  );
  const normalized: NormalizedCacheEntry = {
    raceId: adapted.targetBundle.raceId,
    collectedAt: loaded.manifest.collectedAt,
    runners,
    priorHistories: adapted.priorHistories,
    provenance: [adapted.targetBundle.provenance, ...adapted.priorHistories.map((entry) => entry.provenance)],
    diagnostics: {
      jvLinkHistoryConflicts: historyConnection.jvLinkConflictDiagnostics,
      unsupportedHistoryCount: adapted.unsupportedHistoryCount,
    },
  };
  const issuesByHorse = new Map<string, string[]>();
  for (const issue of historyConnection.issues) {
    const reasons = issuesByHorse.get(issue.horseId) ?? [];
    reasons.push(issue.code);
    issuesByHorse.set(issue.horseId, reasons);
  }
  const ability = runners.map((runner): JvLinkAbilityReadiness => {
    const histories = historyConnection.historiesByHorseId[runner.horseId] ?? [];
    const evidence = historyConnection.abilityEvidenceByHorseId[runner.horseId];
    const reasons = [...new Set(issuesByHorse.get(runner.horseId) ?? [])];
    const ready = evidence?.formalAbilityReady === true;
    return {
      horseId: runner.horseId,
      horseName: runner.horseName,
      ready,
      historyCount: histories.length,
      baseAbility: ready ? calculateBaseAbility(histories) : null,
      reasons,
      selectedHistoryCount: evidence?.selectedHistoryCount ?? 0,
      scorableHistoryCount: evidence?.scorableHistoryCount ?? 0,
      unscorableHistoryCount: evidence?.unscorableHistoryCount ?? 0,
      historyCompleteness: evidence?.historyCompleteness ?? 0,
      historyConfidence: evidence?.historyConfidence ?? "insufficient",
      unscorableHistories: evidence?.unscorableHistories ?? [],
    };
  });
  const cache = options.skipCache
    ? { wasCached: false, writtenPath: null }
    : writeNormalizedCache(normalized, options.normalizedDir);

  return { loaded, adapted, race, normalized, validation, leakage, historyConnection, ability, cache };
}

import { ManualRawFileProvider } from "./providers/manualRawFileProvider";
import { fetchPriorHistoryFromProduction } from "./providers/productionHistoryProvider";
import { normalizeRaceBundle, validateNormalizedRunners } from "./normalize";
import { auditFutureLeakage } from "./leakageGuard";
import { writeNormalizedCache, DEFAULT_NORMALIZED_DIR } from "./cache";
import { DEFAULT_RAW_DIR } from "./providers/manualRawFileProvider";
import type { CollectedRaceIdentity, CollectorRunResult, SourceProvenance } from "./types";

export const COLLECTOR_VERSION = "0.1.0-v0";

export interface CollectRaceOptions {
  /** テスト用。指定するとManualRawFileProviderがこのディレクトリを読む（既定: src/collector/data/raw/） */
  rawDir?: string;
  /** テスト用。指定するとnormalizedキャッシュの書き込み先を変更する（既定: src/collector/data/normalized/） */
  cacheDir?: string;
  /** trueの場合キャッシュへの書き込みを行わない（既定false） */
  skipCache?: boolean;
}

function toIdentity(raceId: string, raw: {
  raceDate: string; racecourse: string; raceNumber: number; raceName: string;
  surface: "turf" | "dirt"; distance: number; going: string; courseLayout: string | null; courseVariant: string | null;
}): CollectedRaceIdentity {
  return {
    raceId,
    raceDate: raw.raceDate,
    racecourse: raw.racecourse,
    raceNumber: raw.raceNumber,
    raceName: raw.raceName,
    surface: raw.surface,
    distance: raw.distance,
    going: raw.going,
    courseLayout: raw.courseLayout,
    courseVariant: raw.courseVariant,
  };
}

/**
 * Collector Architecture（STEP2）のオーケストレーター。
 *
 * targetRaceId → レース情報・出走馬（ManualRawFileProvider）→ 各馬のprior
 * history（productionHistoryProvider、既存データ再利用）→ normalize →
 * Future Leakage監査 → 保存、までを一気通貫で実行する。
 *
 * production Ability計算（`src/ability/`配下）へは一切書き込まない。
 * Future Leakageが1件でも検出された場合、または正規化検証がエラーの場合は
 * `status: "FAIL"`を返し、キャッシュへの保存を行わない（warningではなくFAIL、
 * STEP5の絶対要件）。
 */
export async function collectRace(targetRaceId: string, options: CollectRaceOptions = {}): Promise<CollectorRunResult> {
  const provider = new ManualRawFileProvider(options.rawDir ?? DEFAULT_RAW_DIR);
  const raw = await provider.fetchRace(targetRaceId);

  if (raw === null) {
    return {
      status: "FAIL",
      raceId: targetRaceId,
      race: null,
      runners: [],
      priorHistories: [],
      provenance: [],
      validation: {
        ok: false,
        errors: [`raw race data not found for raceId=${targetRaceId}（ManualRawFileProviderに該当ファイルが無い）`],
        warnings: [],
      },
      leakage: { ok: true, checkedRowCount: 0, violations: [] },
      cache: { wasCached: false, writtenPath: null },
      failureReason: "RAW_DATA_NOT_FOUND",
    };
  }

  const runners = normalizeRaceBundle(raw);
  const validation = validateNormalizedRunners(runners);

  const priorHistories = runners.map((r) => fetchPriorHistoryFromProduction(r.horseId, targetRaceId, raw.raceDate));
  const leakage = auditFutureLeakage(raw.raceDate, priorHistories);

  const provenance: SourceProvenance[] = [raw.provenance, ...priorHistories.map((p) => p.provenance)];
  const race = toIdentity(targetRaceId, raw);

  if (!validation.ok || !leakage.ok) {
    return {
      status: "FAIL",
      raceId: targetRaceId,
      race,
      runners,
      priorHistories,
      provenance,
      validation,
      leakage,
      cache: { wasCached: false, writtenPath: null },
      failureReason: !leakage.ok ? "FUTURE_LEAKAGE_DETECTED" : "VALIDATION_FAILED",
    };
  }

  const cache = options.skipCache
    ? { wasCached: false, writtenPath: null }
    : writeNormalizedCache(
        { raceId: targetRaceId, collectedAt: new Date().toISOString(), runners, priorHistories },
        options.cacheDir ?? DEFAULT_NORMALIZED_DIR,
      );

  return {
    status: "OK",
    raceId: targetRaceId,
    race,
    runners,
    priorHistories,
    provenance,
    validation,
    leakage,
    cache,
    failureReason: null,
  };
}

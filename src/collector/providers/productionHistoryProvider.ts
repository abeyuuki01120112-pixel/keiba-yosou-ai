import { getHorseRecentRaces } from "../../ability/horseAbilityData";
import type { PriorHistoryEntry, SourceProvenance } from "../types";

export const PRODUCTION_HISTORY_PROVIDER_VERSION = "0.1.0-v0";

/**
 * 既存の production `getHorseRecentRaces()`（`src/ability/horseAbilityData.ts`、
 * 既存・無変更）をREAD-ONLYで再利用する（STEP1監査の指示「既存で利用可能な
 * 取得経路がある場合は新しい方法を勝手に増やす前に再利用を検討する」に従う）。
 * `niigataGateHistoryV1.ts`（CHECKPOINT14D.1D）と同じ再利用パターン。
 *
 * production `data/horses/*.json`への書き込みは一切行わない。対象レースの
 * raceDateより厳密に前（`<`、以下ではない）の実データ（`dataKind`が
 * "real"またはundefined/nullのもの）のみを返す——Future Leakage Guard
 * （leakageGuard.ts）が別途この結果を機械的に再監査する。
 *
 * 該当馬がproduction側に一切実データを持たない場合は`status: "unavailable"`
 * とし、0件や平均値で埋めない（CLAUDE.md絶対原則5）。
 */
export function fetchPriorHistoryFromProduction(
  horseId: string,
  targetRaceId: string,
  targetRaceDateIso: string,
): PriorHistoryEntry {
  const cutoffMs = Date.parse(targetRaceDateIso);
  const priorRaces = getHorseRecentRaces(horseId).filter(
    (r) => (r.dataKind == null || r.dataKind === "real") && Date.parse(r.raceDate) < cutoffMs,
  );

  const provenance: SourceProvenance = {
    source: "production_data_horses",
    sourceIdentifier: horseId,
    targetRaceId,
    retrievedAt: new Date().toISOString(),
    targetAsOf: targetRaceDateIso,
    method: "production_history_reference",
    collectorVersion: PRODUCTION_HISTORY_PROVIDER_VERSION,
  };

  if (priorRaces.length === 0) {
    return { horseId, status: "unavailable", races: [], provenance };
  }
  return { horseId, status: "available", races: priorRaces, provenance };
}

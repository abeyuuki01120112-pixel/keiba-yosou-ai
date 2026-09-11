import type { RaceHistoryRawInput } from "../ability/raceHistoryPipeline";
import type { JvLinkHistoryConflictDiagnostic } from "../collector/types";

export type { JvLinkConflictClassification, JvLinkHistoryConflictDiagnostic } from "../collector/types";

export interface JvLinkCanonicalHistorySelection {
  runtimeHistory: RaceHistoryRawInput[];
  addedRaceIds: string[];
  duplicateRaceIds: string[];
  diagnostics: JvLinkHistoryConflictDiagnostic[];
}

const IGNORED_FIELDS = new Set<string>(["importedAt"]);
const NON_MATERIAL_FIELDS = new Set<string>([
  "raceName",
  "source",
  "sourceRaceId",
  "sourceHorseId",
  "dataKind",
]);

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Repositoryを比較対象として残し、runtimeではmanifest選択済みJV-Link履歴だけを採用する。
 * これにより、unsupportedな直近走をRepositoryの旧6走目へ置換しない。
 */
export function selectJvLinkCanonicalRuntimeHistory(
  horseId: string,
  repositoryHistory: readonly RaceHistoryRawInput[],
  jvLinkHistory: readonly RaceHistoryRawInput[],
): JvLinkCanonicalHistorySelection {
  const repositoryByRaceId = new Map(repositoryHistory.map((race) => [race.raceId, race]));
  const seen = new Set<string>();
  const runtimeHistory: RaceHistoryRawInput[] = [];
  const addedRaceIds: string[] = [];
  const duplicateRaceIds: string[] = [];
  const diagnostics: JvLinkHistoryConflictDiagnostic[] = [];

  for (const incoming of jvLinkHistory) {
    if (seen.has(incoming.raceId)) continue;
    seen.add(incoming.raceId);
    runtimeHistory.push(incoming);
    const existing = repositoryByRaceId.get(incoming.raceId);
    if (existing === undefined) {
      addedRaceIds.push(incoming.raceId);
      continue;
    }
    const fields = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
    let differenceCount = 0;
    for (const field of fields) {
      if (IGNORED_FIELDS.has(field)) continue;
      const repositoryValue = (existing as unknown as Record<string, unknown>)[field];
      const jvLinkValue = (incoming as unknown as Record<string, unknown>)[field];
      if (equal(repositoryValue, jvLinkValue)) continue;
      differenceCount++;
      diagnostics.push({
        horseId,
        raceId: incoming.raceId,
        raceKey: incoming.sourceRaceId ?? null,
        field,
        repositoryValue,
        jvLinkValue,
        classification: NON_MATERIAL_FIELDS.has(field) ? "NON_MATERIAL" : "MATERIAL",
        selectedSource: "jv_link",
      });
    }
    if (differenceCount === 0) duplicateRaceIds.push(incoming.raceId);
  }

  return { runtimeHistory, addedRaceIds, duplicateRaceIds, diagnostics };
}

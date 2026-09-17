/** C4 compares ALL official members. No Ability eligibility filter or update calls. */
import { resolveRunner } from "../ability/import/runnerResolver";
import { JvRecord, jvTimestampToIso } from "../collector/jvlink/records";
import { deserializeRaceResultArtifactV2 } from "./raceResultArtifact";
import { validatePostRaceResultRuntime } from "./postRaceUpdateInputValidation";
import { isVerifiedPopulation, sha256, type VerifiedPopulation } from "./officialPopulationEvidence";

export interface CanonicalPopulationMapping { officialHorseId: string; canonicalHorseId: string }
export interface AcquiredPopulationInput {
  runIdentifier: string;
  targetRecordBytes: Uint8Array;
  result: unknown;
  /** Collected-run registry, following formalSnapshotPipeline's dynamic ID registry.
   * Preserve rows, including duplicates, before constructing lookup tables.
   */
  registry: readonly CanonicalPopulationMapping[];
}
export interface PopulationCompletenessResult {
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  raceId: string | null; evidenceDigest: string | null;
  officialCount: number; resultCount: number;
  missingCanonicalHorseIds: string[]; unexpectedCanonicalHorseIds: string[];
  duplicateOfficialIds: string[]; duplicateResultIds: string[];
  unresolvedOfficialIds: string[]; unresolvedResultIds: string[];
  canonicalCollisions: string[]; ambiguousOfficialIds: string[];
  revisionMismatch: boolean; raceMismatch: boolean; validationErrors: string[];
  provenance: Record<string, unknown>;
}
const duplicates = (ids: readonly string[]) => {
  const counts = new Map<string, number>(); ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id).sort();
};
export function evaluateOfficialPopulationCompleteness(verified: VerifiedPopulation | null, input: AcquiredPopulationInput): PopulationCompletenessResult {
  const out: PopulationCompletenessResult = {
    status: "UNAVAILABLE", raceId: null, evidenceDigest: null, officialCount: 0, resultCount: 0,
    missingCanonicalHorseIds: [], unexpectedCanonicalHorseIds: [], duplicateOfficialIds: [], duplicateResultIds: [],
    unresolvedOfficialIds: [], unresolvedResultIds: [], canonicalCollisions: [], ambiguousOfficialIds: [],
    revisionMismatch: false, raceMismatch: false, validationErrors: [], provenance: {},
  };
  try {
    if (!verified || !isVerifiedPopulation(verified)) { out.validationErrors.push("UNVERIFIED_OR_MUTATED_EVIDENCE"); return out; }
    const e = verified.evidence;
    out.raceId = e.raceId; out.evidenceDigest = e.populationEvidenceDigest;
    const officialIds = e.effectivePopulation.map(m => m.officialHorseId);
    out.officialCount = officialIds.length; out.duplicateOfficialIds = duplicates(officialIds);
    const shapeErrors = validatePostRaceResultRuntime(input.result);
    // Collect duplicate diagnostics before Result validation rejects them.
    const unchecked = input.result as { runners?: { canonicalHorseId?: unknown }[] } | null;
    if (Array.isArray(unchecked?.runners)) {
      out.resultCount = unchecked.runners.length;
      out.duplicateResultIds = duplicates(unchecked.runners.flatMap(r => r && typeof r.canonicalHorseId === "string" ? [r.canonicalHorseId] : []));
    }
    if (shapeErrors.length) { out.validationErrors.push(...shapeErrors.map(x => x.code)); out.status = "FAIL"; return out; }
    const result = deserializeRaceResultArtifactV2(JSON.stringify(input.result));
    const acquiredIds = result.runners.map(r => r.canonicalHorseId);
    const rows = input.registry;
    if (!Array.isArray(rows) || rows.some(r => !r || !/^\d{10}$/.test(r.officialHorseId) || r.officialHorseId === "0000000000" || typeof r.canonicalHorseId !== "string" || !r.canonicalHorseId.trim())) throw new Error("INVALID_CANONICAL_REGISTRY");
    out.ambiguousOfficialIds = duplicates(rows.map(r => r.officialHorseId));
    out.canonicalCollisions = duplicates(rows.map(r => r.canonicalHorseId));
    // This JV-Link integration's established namespace uses exact blood-registration IDs.
    // Reject aliases instead of introducing a new identity policy or name fallback.
    if (rows.some(r => r.officialHorseId !== r.canonicalHorseId)) out.validationErrors.push("UNSUPPORTED_JVLINK_CANONICAL_ALIAS");
    const canonicalHorseIds = new Set(rows.map(r => r.canonicalHorseId));
    const registryIds = new Set(rows.map(r => r.officialHorseId));
    const context = { canonicalHorseIds, canonicalHorseNames: [] };
    const resolve = (id: string): string | null => {
      if (!registryIds.has(id)) return null;
      const match = resolveRunner({ horseName: "", canonicalHorseIdHint: id }, context);
      return match.status === "resolved" ? match.horseId : null;
    };
    const official = officialIds.flatMap(id => { const c = resolve(id); if (!c) out.unresolvedOfficialIds.push(id); return c ? [c] : []; });
    const actual = acquiredIds.flatMap(id => { const c = resolve(id); if (!c) out.unresolvedResultIds.push(id); return c ? [c] : []; });
    out.missingCanonicalHorseIds = official.filter(id => !actual.includes(id)).sort();
    out.unexpectedCanonicalHorseIds = actual.filter(id => !official.includes(id)).sort();
    out.raceMismatch = result.race.raceId !== e.raceId || result.race.raceDate !== e.raceDate;
    const run = e.finalRunComparisons.find(r => r.runIdentifier === input.runIdentifier);
    const raw = verified.targetRecords.map(r => new JvRecord(r));
    const sourceIdentifier = `jvlink-run;targetRaceKey=${e.raceKey};files=${[...new Set(raw.map(r => r.envelope.sourceFile))].join(",")}`;
    const availableAt = jvTimestampToIso(raw.map(r => r.envelope.providedAt).sort().at(-1)!);
    const retrievedAt = raw.map(r => r.envelope.retrievedAt).sort().at(-1)!;
    // This scope admits a newly built FINAL v1 from precisely these records only.
    // It does not grant compatibility to a pre-existing CORRECTED or other version.
    out.revisionMismatch = !run || run.reference.sha256 !== sha256(input.targetRecordBytes) ||
      result.source !== "JV_LINK" || result.resultStatus !== "FINAL" || result.resultVersion !== 1 || result.supersedesArtifactId !== null ||
      result.sourceIdentifier !== sourceIdentifier || result.resultAvailableAt !== availableAt || result.retrievedAt !== retrievedAt;
    const members = new Map(e.effectivePopulation.map(m => [m.officialHorseId, m]));
    for (const runner of result.runners) {
      const m = members.get(runner.canonicalHorseId); if (!m) continue;
      // Both approved populations contain only normal finishers and the known code-4 DNF.
      // Other statuses require a separately reviewed evidence edition, never a guess.
      const normal = m.abnormalStatus === "0";
      const dnf = m.abnormalStatus === "4";
      if ((!normal && !dnf) || !runner.started || runner.scratched || runner.excluded || runner.disqualified ||
          runner.didNotFinish !== dnf || runner.finishPosition !== (normal ? Number(m.officialPlacing) : null)) out.validationErrors.push(`RESULT_MEMBERSHIP_STATE_MISMATCH:${runner.canonicalHorseId}`);
    }
    if (result.race.officialStarterCount !== e.raEvidence.starts || result.race.resultEntryCount !== e.raEvidence.registered) out.validationErrors.push("RESULT_POPULATION_COUNT_MISMATCH");
    out.provenance = {
      scope: e.scope, sourceRun: e.requestProvenance.runIdentifier, acquiredRun: input.runIdentifier,
      acquiredRawDigest: sha256(input.targetRecordBytes), resultArtifactId: result.artifactId,
      resultContentFingerprint: result.resultContentFingerprint, resultVersion: result.resultVersion,
      sourceIdentifier, providedAt: availableAt, retrievedAt,
      identityPolicy: "EXISTING_JVLINK_CANONICAL_BLOOD_REGISTRATION_ID_AND_RESOLVER_PRIORITY_1",
      registryDigest: sha256(JSON.stringify(rows)), officialCanonicalHorseIds: official, resultCanonicalHorseIds: actual,
    };
    const differences = [out.missingCanonicalHorseIds, out.unexpectedCanonicalHorseIds, out.duplicateOfficialIds,
      out.duplicateResultIds, out.unresolvedOfficialIds, out.unresolvedResultIds, out.canonicalCollisions, out.ambiguousOfficialIds];
    out.status = out.officialCount === out.resultCount && differences.every(a => a.length === 0) &&
      !out.raceMismatch && !out.revisionMismatch && out.validationErrors.length === 0 ? "PASS" : "FAIL";
  } catch (error) { out.status = "FAIL"; out.validationErrors.push(error instanceof Error ? error.message : String(error)); }
  return out;
}

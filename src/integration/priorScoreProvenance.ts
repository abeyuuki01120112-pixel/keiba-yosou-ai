/** C2: read-only evidence verification. No calculation, I/O or current-time defaults.
 * Context is supplied by the caller's read-only evidence repository, never inferred
 * from the score being verified. Digests prove consistency, not source authenticity.
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "./betTypes";
import { MODEL_VERSION, fnv1a } from "../ability/datasetVersion";
import { assertPredictionCutoff, isPriorPerformance, predictionTimestamp } from "../ability/predictionBoundary";
import { deserializeRacePredictionArtifactV2, type ArtifactPredictionStage, type PredictionGenerationMode } from "./racePredictionArtifact";
import { resolveCareerCompleteness } from "./careerCompleteness";
import type { PriorHistoryEntry } from "../collector/types";

export type PriorClassification = "VERIFIED_AS_OF" | "RECONSTRUCTABLE_AS_OF" | "UNVERIFIABLE";
export interface PredictionAsOfReference {
  artifactId: string; contentFingerprint: string; stage: ArtifactPredictionStage;
  generationMode: PredictionGenerationMode; targetRaceId: string; targetRaceDate: string;
  predictionCutoffAt: string; scheduledStartTime: string | null;
}
export interface DependencyRef { id: string; digest: string }
export const PRIOR_DEPENDENCY_KINDS = ["OFFICIAL_RAW", "CANONICAL_DATASET", "MEMBER_LEVEL", "TIME_BASELINES", "FINAL3F_BASELINES", "FIELD_AGGREGATES", "TRACK_ADJUSTMENT", "IMPLEMENTATION", "CALCULATION"] as const;
export interface PriorDependency {
  id: string; kind: typeof PRIOR_DEPENDENCY_KINDS[number]; source: string; sourceIdentifier: string;
  availableAt: string; retrievedAt: string; availabilityEvidence: string;
  /** Immutable content, including empty search pools / fallback decisions. */
  payload: unknown; dependencyRefs: DependencyRef[];
}
export interface SelectedPriorHistory {
  canonicalHorseId: string; raceId: string; raceDate: string; rawRef: DependencyRef;
}
export interface PriorScoreProvenanceV1 {
  schemaVersion: "prior-score-provenance-v1"; validationRuleVersion: "1";
  targetRaceId: string; targetRaceDate: string; predictionCutoffAt: string;
  predictionReference: PredictionAsOfReference; canonicalHorseId: string;
  priorRaceId: string; priorRaceDate: string; score: number | null;
  calculatedAt: string | null; scoreAvailableAt: string | null;
  calculationVersion: typeof MODEL_VERSION; implementationRevision: string;
  selectedHistory: SelectedPriorHistory[]; canonicalDatasetRef: DependencyRef;
  dependencyRefs: DependencyRef[]; calculationRef: DependencyRef | null;
  classification: PriorClassification; reasonCodes: string[]; evidenceCreatedAt: string;
  contentIdentity: string;
}
export interface PriorVerificationContext {
  /** Full existing Artifact JSON. Its official reader is reused without alteration. */
  predictionArtifact: string;
  dependencies: PriorDependency[];
}
export interface PriorScoreProof { evidence: PriorScoreProvenanceV1; context: PriorVerificationContext }
export interface NoPriorProof { history: PriorHistoryEntry; context: PriorVerificationContext }
export interface PriorVerificationResult {
  classification: PriorClassification; available: boolean; reasonCodes: string[];
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const digest = (v: unknown): v is string => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const ref = (v: unknown): v is DependencyRef => record(v) && text(v.id) && digest(v.digest);
function jsonValue(v: unknown, seen = new Set<object>()): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "object" || seen.has(v)) return false;
  seen.add(v);
  const ok = Array.isArray(v) ? [...v].every(x => jsonValue(x, seen))
    : Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(x => jsonValue(x, seen));
  seen.delete(v); return ok;
}
/** Reject malformed/cyclic proof envelopes before the enclosing Contract is hashed. */
export function validPriorProofEnvelope(v: unknown): boolean {
  return record(v) && jsonValue(v) && record(v.evidence) && record(v.context) &&
    text(v.context.predictionArtifact) && Array.isArray(v.context.dependencies) && validatePriorScoreRuntime(v.evidence).length === 0;
}
export function validNoPriorProofEnvelope(v: unknown): boolean {
  return record(v) && jsonValue(v) && record(v.history) && record(v.context) &&
    text(v.context.predictionArtifact) && Array.isArray(v.context.dependencies);
}
export function priorSha256(value: unknown): string {
  if (!jsonValue(value)) throw new Error("INVALID_EVIDENCE_JSON");
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
export function priorContentIdentity(value: Omit<PriorScoreProvenanceV1, "contentIdentity"> | PriorScoreProvenanceV1): string {
  const { contentIdentity: _identity, ...content } = value as PriorScoreProvenanceV1;
  return priorSha256(content); // arrays preserve their calculation order
}
export function predictionAsOfReference(serialized: string): PredictionAsOfReference {
  const p = deserializeRacePredictionArtifactV2(serialized);
  if (p.modelMetadata.abilityModelVersion !== MODEL_VERSION || !["STAGE_A", "STAGE_B"].includes(p.predictionStage) || p.artifactStatus !== "FORMAL_PREDICTION" || !p.formalPredictionReady ||
      !["LIVE_PRE_RACE", "HISTORICAL_REPLAY"].includes(p.generationMode)) throw new Error("PREDICTION_NOT_FORMAL");
  assertPredictionCutoff(p.predictionCutoffAt, { raceId: p.race.raceId, raceDate: p.race.raceDate, postTimeIso: p.race.raceStartAt ?? undefined });
  return { artifactId: p.artifactId, contentFingerprint: p.predictionContentFingerprint,
    stage: p.predictionStage, generationMode: p.generationMode, targetRaceId: p.race.raceId,
    targetRaceDate: p.race.raceDate, predictionCutoffAt: p.predictionCutoffAt, scheduledStartTime: p.race.raceStartAt };
}
export function validatePriorScoreRuntime(v: unknown): string[] {
  if (!record(v) || !jsonValue(v)) return ["INVALID_SCHEMA"];
  const required = ["targetRaceId", "targetRaceDate", "predictionCutoffAt", "canonicalHorseId", "priorRaceId", "priorRaceDate", "implementationRevision", "evidenceCreatedAt"];
  if (v.schemaVersion !== "prior-score-provenance-v1" || v.validationRuleVersion !== "1" ||
      required.some(k => !text(v[k])) || v.calculationVersion !== MODEL_VERSION ||
      !["VERIFIED_AS_OF", "RECONSTRUCTABLE_AS_OF", "UNVERIFIABLE"].includes(v.classification as string) ||
      !record(v.predictionReference) || !ref(v.canonicalDatasetRef) || !digest(v.contentIdentity) ||
      !(v.calculationRef === null || ref(v.calculationRef)) ||
      !(v.score === null || (typeof v.score === "number" && Number.isFinite(v.score) && v.score >= 0 && v.score <= 100)) ||
      !(v.calculatedAt === null || text(v.calculatedAt)) || !(v.scoreAvailableAt === null || text(v.scoreAvailableAt)) ||
      !Array.isArray(v.reasonCodes) || !v.reasonCodes.every(text) ||
      !Array.isArray(v.dependencyRefs) || !v.dependencyRefs.every(ref) ||
      !Array.isArray(v.selectedHistory) || !v.selectedHistory.length ||
      !v.selectedHistory.every(h => record(h) && text(h.canonicalHorseId) && text(h.raceId) && text(h.raceDate) && ref(h.rawRef))) return ["INVALID_SCHEMA"];
  const p = v.predictionReference;
  if (!["artifactId", "contentFingerprint", "targetRaceId", "targetRaceDate", "predictionCutoffAt"].every(k => text(p[k])) ||
      !["STAGE_A", "STAGE_B"].includes(p.stage as string) || !["LIVE_PRE_RACE", "HISTORICAL_REPLAY"].includes(p.generationMode as string) ||
      !(p.scheduledStartTime === null || text(p.scheduledStartTime))) return ["INVALID_PREDICTION_REFERENCE"];
  try {
    predictionTimestamp(v.predictionCutoffAt, "predictionCutoffAt");
    predictionTimestamp(v.evidenceCreatedAt, "evidenceCreatedAt");
    if (v.calculatedAt !== null) predictionTimestamp(v.calculatedAt, "calculatedAt");
    if (v.scoreAvailableAt !== null) predictionTimestamp(v.scoreAvailableAt, "scoreAvailableAt");
  } catch { return ["INVALID_TIMESTAMP"]; }
  return [];
}
const denied = (...reasonCodes: string[]): PriorVerificationResult => ({ classification: "UNVERIFIABLE", available: false, reasonCodes });
/** The same function is the acceptance boundary for both consumers. */
export function verifyPriorScoreAsOf(value: unknown, context: PriorVerificationContext,
  expected: { targetRaceId: string; targetRaceDate: string; canonicalHorseId: string }): PriorVerificationResult {
  const schema = validatePriorScoreRuntime(value);
  if (schema.length) return denied(...schema);
  const e = value as PriorScoreProvenanceV1;
  try {
    const p = predictionAsOfReference(context.predictionArtifact);
    if (e.targetRaceId !== expected.targetRaceId || e.targetRaceDate !== expected.targetRaceDate || e.canonicalHorseId !== expected.canonicalHorseId ||
        p.targetRaceId !== e.targetRaceId || p.targetRaceDate !== e.targetRaceDate || p.predictionCutoffAt !== e.predictionCutoffAt ||
        canonicalJson(p) !== canonicalJson(e.predictionReference)) return denied("PREDICTION_REFERENCE_MISMATCH");
    if (e.contentIdentity !== priorContentIdentity(e)) return denied("CONTENT_IDENTITY_MISMATCH");
    const cutoff = predictionTimestamp(p.predictionCutoffAt, "cutoff");
    const created = predictionTimestamp(e.evidenceCreatedAt, "evidenceCreatedAt");
    const target = { raceId: p.targetRaceId, raceDate: p.targetRaceDate };
    if (!isPriorPerformance({ raceId: e.priorRaceId, raceDate: e.priorRaceDate }, target, p.predictionCutoffAt)) return denied("INVALID_PRIOR_DATE");
    if (!Array.isArray(context.dependencies)) return denied("MISSING_DEPENDENCIES");
    const map = new Map<string, PriorDependency>();
    for (const d of context.dependencies) {
      if (!record(d) || !jsonValue(d) || !text(d.id) || !PRIOR_DEPENDENCY_KINDS.includes(d.kind) ||
          !text(d.source) || !text(d.sourceIdentifier) || !text(d.availabilityEvidence) ||
          !Array.isArray(d.dependencyRefs) || !d.dependencyRefs.every(ref) || map.has(d.id)) return denied("INVALID_DEPENDENCY");
      map.set(d.id, d);
    }
    const visited = new Set<string>(), visiting = new Set<string>();
    const visit = (r: DependencyRef): void => {
      const d = map.get(r.id);
      if (!d) throw new Error("MISSING_DEPENDENCY");
      if (priorSha256(d) !== r.digest) throw new Error("DEPENDENCY_DIGEST_MISMATCH");
      if (visiting.has(d.id)) throw new Error("DEPENDENCY_CYCLE");
      if (visited.has(d.id)) return;
      const available = predictionTimestamp(d.availableAt, "dependency.availableAt");
      if (available > cutoff) throw new Error("FUTURE_DEPENDENCY");
      if (predictionTimestamp(d.retrievedAt, "dependency.retrievedAt") < available || created < available) throw new Error("INVALID_DEPENDENCY_TIME");
      visiting.add(d.id); d.dependencyRefs.forEach(visit); visiting.delete(d.id); visited.add(d.id);
    };
    e.dependencyRefs.forEach(visit);
    if (new Set(e.dependencyRefs.map(r => r.id)).size !== e.dependencyRefs.length) return denied("DUPLICATE_DEPENDENCY_REF");
    if (!visited.has(e.canonicalDatasetRef.id)) return denied("DATASET_NOT_IN_DEPENDENCIES");
    visit(e.canonicalDatasetRef);
    const ds = map.get(e.canonicalDatasetRef.id)!;
    if (e.classification === "VERIFIED_AS_OF") {
      const prediction = deserializeRacePredictionArtifactV2(context.predictionArtifact);
      if (!record(ds.payload) || !record(ds.payload.scoredHistories)) return denied("MISSING_CANONICAL_SCORED_HISTORY");
      const histories = ds.payload.scoredHistories;
      const normalized = Object.keys(histories).sort().map(horseId => {
        const races = histories[horseId];
        if (!Array.isArray(races) || !races.every(r => record(r) && text(r.raceId) && text(r.raceDate) && isPriorPerformance(r as { raceId: string; raceDate: string; availableAt?: string }, target, p.predictionCutoffAt))) throw new Error("INVALID_CANONICAL_SCORED_HISTORY");
        return { horseId, races: [...races].sort((a, b) => b.raceDate.localeCompare(a.raceDate) || a.raceId.localeCompare(b.raceId))
          .map(({ importedAt: _importedAt, ...race }) => race) };
      });
      // Same content normalization as existing Artifact fingerprintHistories; no score calculation.
      const count = normalized.reduce((sum, h) => sum + h.races.length, 0);
      if (`${normalized.length}h-${count}r-${fnv1a(canonicalJson(normalized))}` !== prediction.datasetFingerprint) return denied("PREDICTION_DATASET_MISMATCH");
      const recorded = normalized.find(h => h.horseId === e.canonicalHorseId)?.races.filter(r => r.raceId === e.priorRaceId);
      if (e.classification === "VERIFIED_AS_OF" && (recorded?.length !== 1 || recorded[0].raceDate !== e.priorRaceDate || recorded[0].raceScore !== e.score)) return denied("PREDICTION_SCORE_MISMATCH");
      const canonicalKeys = normalized.flatMap(h => h.races.map(r => `${h.horseId}/${r.raceId}`));
      if (new Set(canonicalKeys).size !== canonicalKeys.length || canonicalKeys.length !== e.selectedHistory.length ||
          canonicalKeys.some(key => !e.selectedHistory.some(h => `${h.canonicalHorseId}/${h.raceId}` === key))) return denied("CANONICAL_SELECTION_MISMATCH");
    }
    if (ds.kind !== "CANONICAL_DATASET" || !record(ds.payload) ||
        canonicalJson(ds.payload.selectedHistory) !== canonicalJson(e.selectedHistory)) return denied("SELECTED_HISTORY_MISMATCH");
    const identities = new Set<string>();
    for (const h of e.selectedHistory) {
      const key = `${h.canonicalHorseId}/${h.raceId}`;
      if (identities.has(key) || !isPriorPerformance(h, target, p.predictionCutoffAt) || !visited.has(h.rawRef.id)) return denied("INVALID_SELECTED_HISTORY");
      identities.add(key); visit(h.rawRef);
      const raw = map.get(h.rawRef.id)!;
      if (raw.kind !== "OFFICIAL_RAW" || !record(raw.payload) || raw.payload.raceId !== h.raceId || raw.payload.raceDate !== h.raceDate || raw.payload.canonicalHorseId !== h.canonicalHorseId) return denied("RAW_IDENTITY_MISMATCH");
      const facts = raw.payload as Record<string, unknown>;
      if (!text(facts.racecourse) || !["turf", "dirt"].includes(facts.surface as string) || !text(facts.going) ||
          !["raceTime", "final3F", "carriedWeight", "distance"].every(k => typeof facts[k] === "number" && Number.isFinite(facts[k]) && (facts[k] as number) > 0) ||
          typeof facts.timeGap !== "number" || !Number.isFinite(facts.timeGap) || !Number.isInteger(facts.finishPosition) || (facts.finishPosition as number) < 1) return denied("CANONICAL_RAW_INCOMPLETE");
    }
    if (!identities.has(`${e.canonicalHorseId}/${e.priorRaceId}`) || !e.selectedHistory.some(h => h.canonicalHorseId === e.canonicalHorseId && h.raceId === e.priorRaceId && h.raceDate === e.priorRaceDate)) return denied("PRIOR_NOT_SELECTED");
    const deps = [...visited].map(id => map.get(id)!);
    if (deps.some(d => !["OFFICIAL_RAW", "CANONICAL_DATASET", "IMPLEMENTATION", "CALCULATION"].includes(d.kind) &&
        (!record(d.payload) || !Array.isArray(d.payload.records) || (d.payload.records.length === 0 && !text(d.payload.fallbackReason))))) return denied("DEPENDENCY_MANIFEST_INCOMPLETE");
    if (PRIOR_DEPENDENCY_KINDS.filter(k => k !== "CALCULATION").some(k => !deps.some(d => d.kind === k))) return denied("INCOMPLETE_DEPENDENCY_KINDS");
    const implementation = deps.filter(d => d.kind === "IMPLEMENTATION");
    if (implementation.length !== 1 || !record(implementation[0].payload) || implementation[0].payload.revision !== e.implementationRevision ||
        implementation[0].payload.calculationVersion !== MODEL_VERSION || implementation[0].payload.entrypoint !== "buildHorseHistoriesAsOf") return denied("CALCULATION_SEMANTICS_MISMATCH");
    if (e.classification === "VERIFIED_AS_OF" && e.reasonCodes.length !== 0) return denied("CLASSIFICATION_REASON_MISMATCH");
    if (e.classification === "UNVERIFIABLE") return denied("DECLARED_UNVERIFIABLE");
    if (e.classification === "RECONSTRUCTABLE_AS_OF") {
      // Historical input closure only. Never promotes a later computation.
      return { classification: "RECONSTRUCTABLE_AS_OF", available: false, reasonCodes: ["RECONSTRUCTION_NOT_EXECUTED"] };
    }
    if (e.score === null || e.calculatedAt === null || e.scoreAvailableAt === null || e.calculationRef === null) return denied("MISSING_SCORE_EXECUTION_EVIDENCE");
    const calculated = predictionTimestamp(e.calculatedAt, "calculatedAt"), available = predictionTimestamp(e.scoreAvailableAt, "scoreAvailableAt");
    if (calculated > cutoff || available > cutoff || available < calculated || created < available) return denied("FUTURE_OR_INVALID_SCORE_TIME");
    if (!visited.has(e.calculationRef.id)) return denied("CALCULATION_NOT_IN_DEPENDENCIES");
    visit(e.calculationRef);
    const execution = map.get(e.calculationRef.id)!;
    const executionClosure = new Set<string>();
    const closure = (id: string) => { if (executionClosure.has(id)) return; executionClosure.add(id); map.get(id)!.dependencyRefs.forEach(r => closure(r.id)); };
    closure(execution.id);
    if ([...visited].some(id => !executionClosure.has(id))) return denied("UNBOUND_EXECUTION_DEPENDENCY");
    const binding = { targetRaceId: e.targetRaceId, targetRaceDate: e.targetRaceDate, predictionCutoffAt: e.predictionCutoffAt,
      canonicalHorseId: e.canonicalHorseId, priorRaceId: e.priorRaceId, priorRaceDate: e.priorRaceDate,
      score: e.score, calculatedAt: e.calculatedAt, scoreAvailableAt: e.scoreAvailableAt,
      calculationVersion: e.calculationVersion, implementationRevision: e.implementationRevision,
      selectedHistory: e.selectedHistory, canonicalDatasetRef: e.canonicalDatasetRef };
    if (execution.kind !== "CALCULATION" || canonicalJson(execution.payload) !== canonicalJson(binding) ||
        execution.availableAt !== e.scoreAvailableAt || deps.some(d => d.kind !== "CALCULATION" && predictionTimestamp(d.availableAt, "availableAt") > calculated)) return denied("EXECUTION_BINDING_MISMATCH");
    return { classification: "VERIFIED_AS_OF", available: true, reasonCodes: [] };
  } catch (error) { return denied(error instanceof Error ? error.message : "INVALID_PROVENANCE"); }
}
export function verifyNoPriorAsOf(proof: NoPriorProof | undefined, expected: { targetRaceId: string; targetRaceDate: string; canonicalHorseId: string }): boolean {
  try {
    if (!proof) return false;
    const p = predictionAsOfReference(proof.context.predictionArtifact), h = proof.history;
    if (!jsonValue(h) || h.horseId !== expected.canonicalHorseId || p.targetRaceId !== expected.targetRaceId || p.targetRaceDate !== expected.targetRaceDate ||
        h.provenance.targetRaceId !== p.targetRaceId || !text(h.provenance.collectorVersion) || !text(h.provenance.sourceIdentifier) || h.provenance.source !== "JRA-VAN/JV-Link" ||
        h.races.length !== 0 || !Array.isArray(h.selectedRaceKeys) || h.selectedRaceKeys.length !== 0 ||
        (h.unsupportedHistories !== undefined && (!Array.isArray(h.unsupportedHistories) || h.unsupportedHistories.length !== 0)) || h.careerStartCountAsOf !== 0 ||
        predictionTimestamp(h.provenance.retrievedAt, "retrievedAt") > predictionTimestamp(p.predictionCutoffAt, "cutoff")) return false;
    const c = resolveCareerCompleteness(h.horseId, p.predictionCutoffAt, h);
    return c.careerCompletenessStatus === "COMPLETE" && c.careerStartCount === 0;
  } catch { return false; }
}
export function serializePriorScoreProvenance(e: PriorScoreProvenanceV1): string {
  if (validatePriorScoreRuntime(e).length || priorContentIdentity(e) !== e.contentIdentity) throw new Error("INVALID_PRIOR_CONTRACT");
  return canonicalJson(e);
}
export function deserializePriorScoreProvenance(s: string): PriorScoreProvenanceV1 {
  let parsed: unknown;
  try { parsed = JSON.parse(s); } catch { throw new Error("INVALID_PRIOR_JSON"); }
  if (validatePriorScoreRuntime(parsed).length) throw new Error("INVALID_PRIOR_SCHEMA");
  const e = parsed as PriorScoreProvenanceV1;
  if (priorContentIdentity(e) !== e.contentIdentity) throw new Error("CONTENT_IDENTITY_MISMATCH");
  return e; // classification must still pass verifyPriorScoreAsOf with repository context
}

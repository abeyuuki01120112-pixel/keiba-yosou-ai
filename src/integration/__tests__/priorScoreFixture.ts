/** Synthetic evidence only. Literal score values; no Ability functions execute. */
import { fnv1a } from "../../ability/datasetVersion";
import { canonicalJson } from "../betTypes";
import { buildRacePredictionArtifactV2Id, buildRacePredictionArtifactModelConfigFingerprint } from "../racePredictionArtifact";
import { predictionAsOfReference, priorContentIdentity, priorSha256, PRIOR_DEPENDENCY_KINDS,
  type PriorDependency, type PriorScoreProof, type PriorScoreProvenanceV1, type NoPriorProof } from "../priorScoreProvenance";
import type { PriorAbilityContextV1 } from "../postRaceUpdateInput";
export const scoredHistoriesFixture = {
  "2022000001": [{ raceId: "JRA-20260801-NIIGATA-10", raceDate: "2026-08-01", raceScore: 72.4 }],
  "2023000001": [{ raceId: "JRA-20260801-NIIGATA-10", raceDate: "2026-08-01", raceScore: 72.4 }],
};
export const fixtureCutoff = "2026-09-13T15:00:00+09:00";
export function predictionFixture(raceId = "JRA-20260913-NAKAYAMA-11", raceDate = "2026-09-13"): string {
  const modelMetadata = { abilityModelVersion: "BA-V1", suitabilityModelVersion: "suitability-v1", raceContextModelVersion: "fixture", probabilityModelName: "Plackett-Luce", probabilityImplementation: "fixture", probabilityModelVersion: "plackett-luce-v1", temperature: 10, calibrationStatus: "UNCALIBRATED", probabilityScale: "PERCENT_0_100" };
  const p = {
    artifactId: buildRacePredictionArtifactV2Id({ raceId, predictionStage: "STAGE_A", predictionCutoffAt: fixtureCutoff, modelVersion: "ability-model-v1+suitability-v1", decisionPolicyVersion: "fixture", generationMode: "LIVE_PRE_RACE" }),
    artifactType: "RACE_PREDICTION", artifactStatus: "FORMAL_PREDICTION", schemaVersion: "race-prediction-artifact-v2",
    generationMode: "LIVE_PRE_RACE", artifactCreatedAt: fixtureCutoff, generatedAt: fixtureCutoff,
    race: { raceId, raceDate, raceName: "Fixture", venue: "中山", surface: "turf", distance: 2200, raceStartAt: `${raceDate}T15:45:00+09:00`, declaredFieldSize: 0, predictedRunnerCount: 0, raceCardAvailableAt: fixtureCutoff },
    predictionStage: "STAGE_A", predictionCutoffAt: fixtureCutoff, modelVersion: "ability-model-v1+suitability-v1", decisionPolicyId: "fixture", decisionPolicyVersion: "fixture", datasetFingerprint: `2h-2r-${fnv1a(canonicalJson(Object.entries(scoredHistoriesFixture).map(([horseId, races]) => ({ horseId, races }))))}`, modelMetadata,
    modelConfigFingerprint: buildRacePredictionArtifactModelConfigFingerprint(modelMetadata as Parameters<typeof buildRacePredictionArtifactModelConfigFingerprint>[0]),
    source: "COLLECTOR_PREDICTION_PIPELINE", provenance: { histories: [], odds: [] }, formalPredictionReady: true, globalDiagnostics: [], decisionContext: {}, horses: [],
  };
  return JSON.stringify({ ...p, predictionContentFingerprint: fnv1a(canonicalJson({ ...p, artifactCreatedAt: undefined, generatedAt: undefined })) });
}
export function scoreProofFixture(horseId = "2022000001", raceId = "JRA-20260801-NIIGATA-10", raceDate = "2026-08-01", score = 72.4): PriorScoreProof {
  const predictionArtifact = predictionFixture();
  const dependency = (kind: PriorDependency["kind"], payload: unknown): PriorDependency => ({ id: kind, kind, source: "FIXTURE_CANONICAL_REPOSITORY", sourceIdentifier: `fixture:${kind}`, availableAt: "2026-09-12T12:00:00+09:00", retrievedAt: "2026-09-12T13:00:00+09:00", availabilityEvidence: `fixture-observation:${kind}`, payload, dependencyRefs: [] });
  const raws = Object.entries(scoredHistoriesFixture).flatMap(([canonicalHorseId, races]) => races.map(r => {
    const raw = dependency("OFFICIAL_RAW", { canonicalHorseId, raceId: r.raceId, raceDate: r.raceDate, racecourse: "新潟", surface: "turf", distance: 2000, going: "良", raceTime: 120, final3F: 34, carriedWeight: 56, timeGap: 0, finishPosition: 1 });
    raw.id = `RAW:${canonicalHorseId}:${r.raceId}`;
    return raw;
  }));
  const selectedHistory = raws.map(raw => ({ canonicalHorseId: (raw.payload as { canonicalHorseId: string }).canonicalHorseId, raceId: (raw.payload as { raceId: string }).raceId, raceDate: (raw.payload as { raceDate: string }).raceDate, rawRef: { id: raw.id, digest: priorSha256(raw) } }));
  const dataset = dependency("CANONICAL_DATASET", { selectedHistory, scoredHistories: structuredClone(scoredHistoriesFixture) });
  const deps = [...raws, dataset, ...PRIOR_DEPENDENCY_KINDS.filter(k => !["OFFICIAL_RAW", "CANONICAL_DATASET", "CALCULATION"].includes(k)).map(k => dependency(k, k === "IMPLEMENTATION"
    ? { revision: "fixture-implementation-1", calculationVersion: "BA-V1", entrypoint: "buildHorseHistoriesAsOf" }
    : { fixture: true, records: [], fallbackReason: "fixture-empty-pool" }))];
  const binding = { targetRaceId: "JRA-20260913-NAKAYAMA-11", targetRaceDate: "2026-09-13", predictionCutoffAt: fixtureCutoff,
    canonicalHorseId: horseId, priorRaceId: raceId, priorRaceDate: raceDate, score, calculatedAt: "2026-09-13T14:00:00+09:00", scoreAvailableAt: "2026-09-13T14:01:00+09:00", calculationVersion: "BA-V1" as const, implementationRevision: "fixture-implementation-1", selectedHistory, canonicalDatasetRef: { id: dataset.id, digest: priorSha256(dataset) } };
  const execution = dependency("CALCULATION", binding);
  execution.availableAt = binding.scoreAvailableAt; execution.retrievedAt = binding.scoreAvailableAt;
  execution.dependencyRefs = deps.map(d => ({ id: d.id, digest: priorSha256(d) }));
  deps.push(execution);
  const content: Omit<PriorScoreProvenanceV1, "contentIdentity"> = { ...binding, schemaVersion: "prior-score-provenance-v1", validationRuleVersion: "1", predictionReference: predictionAsOfReference(predictionArtifact), dependencyRefs: deps.map(d => ({ id: d.id, digest: priorSha256(d) })), calculationRef: { id: execution.id, digest: priorSha256(execution) }, classification: "VERIFIED_AS_OF", reasonCodes: [], evidenceCreatedAt: "2026-09-13T17:00:00+09:00" };
  return JSON.parse(JSON.stringify({ evidence: { ...content, contentIdentity: priorContentIdentity(content) }, context: { predictionArtifact, dependencies: deps } }));
}
export function noPriorFixture(horseId: string): NoPriorProof {
  return { context: { predictionArtifact: predictionFixture(), dependencies: [] }, history: {
    horseId, status: "available", races: [], selectedRaceKeys: [], unsupportedHistories: [], careerStartCountAsOf: 0,
    provenance: { source: "JRA-VAN/JV-Link", sourceIdentifier: "fixture-zero-query", targetRaceId: "JRA-20260913-NAKAYAMA-11", targetAsOf: fixtureCutoff, retrievedAt: fixtureCutoff, method: "jv_link", collectorVersion: "fixture-v1" },
  } };
}
export function attachFixtureProof(prior: PriorAbilityContextV1, horseId: string): void {
  if (prior.status === "AVAILABLE") prior.scoreProofs = prior.priorRacesNewestFirst.map(r => scoreProofFixture(horseId, r.raceId, r.raceDate, r.raceScore));
  if (prior.status === "NO_PRIOR") prior.noPriorProof = noPriorFixture(horseId);
}

import { describe, it, expect } from "vitest";
import { scoreProofFixture, noPriorFixture, predictionFixture } from "./priorScoreFixture";
import { verifyPriorScoreAsOf, verifyNoPriorAsOf, priorContentIdentity, priorSha256,
  serializePriorScoreProvenance, deserializePriorScoreProvenance, type PriorScoreProof } from "../priorScoreProvenance";
import { resolveObjectiveRunnersV1 } from "../postRaceObjectiveResolvers";
import { buildRaceResultArtifactV2 } from "../raceResultArtifact";
const expected = { targetRaceId: "JRA-20260913-NAKAYAMA-11", targetRaceDate: "2026-09-13", canonicalHorseId: "2022000001" };
function verify(p: PriorScoreProof) { return verifyPriorScoreAsOf(p.evidence, p.context, expected); }
function seal(p: PriorScoreProof) { p.evidence.contentIdentity = priorContentIdentity(p.evidence); }
// Refresh a dependency chain to distinguish invalid time/meaning from simple stale hashes.
function resealDependencies(p: PriorScoreProof) {
  const map = new Map(p.context.dependencies.map(d => [d.id, d]));
  const hash = (id: string): string => {
    const d = map.get(id)!;
    d.dependencyRefs.forEach(r => { r.digest = hash(r.id); });
    return priorSha256(d);
  };
  p.evidence.dependencyRefs.forEach(r => { r.digest = hash(r.id); });
  p.evidence.canonicalDatasetRef.digest = hash(p.evidence.canonicalDatasetRef.id);
  if (p.evidence.calculationRef) p.evidence.calculationRef.digest = hash(p.evidence.calculationRef.id);
  seal(p);
}
const result = () => buildRaceResultArtifactV2({ resultStatus: "FINAL", resultVersion: 1, source: "JV_LINK", sourceIdentifier: "fixture-result",
  resultAvailableAt: "2026-09-13T16:00:00+09:00", retrievedAt: "2026-09-13T17:00:00+09:00",
  race: { raceId: expected.targetRaceId, raceDate: expected.targetRaceDate, raceName: "Fixture", going: "良", scheduledStartTime: null, officialStarterCount: 1, resultEntryCount: 1 },
  runners: [{ canonicalHorseId: expected.canonicalHorseId, horseName: "Fixture", horseNumber: 1, frameNumber: 1, resultStatus: "FINAL", finishPosition: 1, started: true, scratched: false, excluded: false, didNotFinish: false, disqualified: false, actualRaceTime: 132, timeGap: 0, final3F: 34, final3FRank: 1, passingPosition: null, carriedWeight: 56 }] });
const read = { source: "FIXTURE_REPOSITORY", sourceIdentifier: "fixture-read", availableAt: "2026-09-13T16:00:00+09:00", retrievedAt: "2026-10-01T17:00:00+09:00" };
function resolve(p?: PriorScoreProof, future = false) {
  const history = noPriorFixture(expected.canonicalHorseId).history;
  history.races = [{ raceId: "JRA-20260801-NIIGATA-10", raceDate: "2026-08-01", raceScore: 99, source: "JV_LINK", sourceRaceId: "fixture-raw", availableAt: future ? "2026-10-01T16:00:00+09:00" : "2026-08-01T16:00:00+09:00", importedAt: "2026-10-01T17:00:00+09:00" } as typeof history.races[number]];
  history.careerStartCountAsOf = 1; history.selectedRaceKeys = [history.races[0].raceId];
  return resolveObjectiveRunnersV1(result(), [history], read, p ? { context: p.context, proofs: [p] } : undefined);
}
describe("C2 prior provenance as-of", () => {
  it("VERIFIED proof is AVAILABLE; both consumers share the same decision and Collector score is ignored", () => {
    const p = scoreProofFixture();
    expect(verify(p)).toEqual({ classification: "VERIFIED_AS_OF", available: true, reasonCodes: [] });
    const outcome = resolve(p);
    expect(outcome.status).toBe("accepted");
    if (outcome.status === "accepted") expect(outcome.runners[0].priorAbility).toMatchObject({ status: "AVAILABLE", priorRacesNewestFirst: [{ raceScore: 72.4 }] });
  });
  it.each([
    ["calculated after cutoff", (p: PriorScoreProof) => { p.evidence.calculatedAt = "2026-10-01T12:00:00+09:00"; }],
    ["score available after cutoff", (p: PriorScoreProof) => { p.evidence.scoreAvailableAt = "2026-10-01T12:00:00+09:00"; }],
    ["target itself", (p: PriorScoreProof) => { p.evidence.priorRaceId = expected.targetRaceId; }],
    ["same-day prior", (p: PriorScoreProof) => { p.evidence.priorRaceDate = expected.targetRaceDate; }],
    ["missing implementation", (p: PriorScoreProof) => { p.evidence.implementationRevision = ""; }],
    ["different semantics", (p: PriorScoreProof) => { p.evidence.implementationRevision = "collector-partial-pool"; }],
    ["different cutoff", (p: PriorScoreProof) => { p.evidence.predictionCutoffAt = "2026-09-13T14:30:00+09:00"; }],
    ["different target", (p: PriorScoreProof) => { p.evidence.targetRaceId = "JRA-20260920-NAKAYAMA-11"; }],
    ["different horse", (p: PriorScoreProof) => { p.evidence.canonicalHorseId = "OTHER"; }],
    ["selected history mismatch", (p: PriorScoreProof) => { p.evidence.selectedHistory[0].raceId = "OTHER"; }],
    ["different score than Prediction canonical dataset", (p: PriorScoreProof) => { p.evidence.score = 99; }],
  ] as const)("rejects %s even with matching content identity", (_name, mutate) => {
    const p = scoreProofFixture(); mutate(p); seal(p); expect(verify(p).available).toBe(false);
  });
  it.each(["OFFICIAL_RAW", "TIME_BASELINES", "FINAL3F_BASELINES", "CANONICAL_DATASET", "MEMBER_LEVEL"])("rejects future dependency / corrected version: %s", kind => {
    const p = scoreProofFixture(); const d = p.context.dependencies.find(d => d.kind === kind)!;
    d.availableAt = "2026-10-01T12:00:00+09:00"; d.retrievedAt = "2026-10-01T13:00:00+09:00";
    resealDependencies(p);
    expect(verify(p)).toMatchObject({ available: false, reasonCodes: ["FUTURE_DEPENDENCY"] });
  });
  it("August race + October availableAt/importedAt cannot serve September target", () => {
    const outcome = resolve(scoreProofFixture(), true);
    expect(outcome.status).toBe("accepted");
    if (outcome.status === "accepted") expect(outcome.runners[0].priorAbility.status).toBe("UNAVAILABLE");
  });
  it("missing dependency is UNVERIFIABLE", () => {
    const p = scoreProofFixture(); p.context.dependencies.pop();
    expect(verify(p).classification).toBe("UNVERIFIABLE");
  });
  it("digest mismatch", () => {
    const p = scoreProofFixture(); p.context.dependencies[0].sourceIdentifier += "changed";
    expect(verify(p).reasonCodes).toContain("DEPENDENCY_DIGEST_MISMATCH");
  });
  it("provenance incomplete", () => {
    const p = scoreProofFixture(); p.context.dependencies[0].availabilityEvidence = "";
    expect(verify(p).available).toBe(false);
  });
  it("SHA-256 mismatch", () => {
    const p = scoreProofFixture(); p.evidence.score = 90;
    expect(verify(p).reasonCodes).toContain("CONTENT_IDENTITY_MISMATCH");
  });
  it("legacy numeric score has no authority", () => {
    const outcome = resolve();
    if (outcome.status !== "accepted") throw new Error("unexpected");
    expect(outcome.runners[0].priorAbility.status).toBe("UNAVAILABLE");
  });
  it.each(["RECONSTRUCTABLE_AS_OF", "UNVERIFIABLE"] as const)("%s is never AVAILABLE", classification => {
    const p = scoreProofFixture(); p.evidence.classification = classification; p.evidence.reasonCodes = ["LEGACY"];
    // No saved execution proof is needed for the reconstruction candidate.
    p.evidence.calculationRef = null; p.evidence.calculatedAt = null; p.evidence.scoreAvailableAt = null;
    p.context.dependencies = p.context.dependencies.filter(d => d.kind !== "CALCULATION");
    if (classification === "RECONSTRUCTABLE_AS_OF") delete (p.context.dependencies.find(d => d.kind === "CANONICAL_DATASET")!.payload as Record<string, unknown>).scoredHistories;
    p.evidence.dependencyRefs = p.evidence.dependencyRefs.filter(r => r.id !== "CALCULATION"); resealDependencies(p);
    expect(verify(p).classification).toBe(classification);
    const outcome = resolve(p);
    if (outcome.status !== "accepted") throw new Error("unexpected");
    expect(outcome.runners[0].priorAbility.status).toBe("UNAVAILABLE");
  });
  it("VERIFIED NO_PRIOR is separate from score evidence", () => {
    const proof = noPriorFixture(expected.canonicalHorseId);
    expect(verifyNoPriorAsOf(proof, expected)).toBe(true);
    const outcome = resolveObjectiveRunnersV1(result(), [proof.history], read, { context: proof.context, proofs: [] });
    if (outcome.status !== "accepted") throw new Error("unexpected");
    expect(outcome.runners[0].priorAbility.status).toBe("NO_PRIOR");
  });
  it.each(["empty-only", "cutoff", "unsupported", "source", "horse"])("unproved zero-history rejected: %s", kind => {
    const proof = noPriorFixture(expected.canonicalHorseId);
    if (kind === "empty-only") delete proof.history.careerStartCountAsOf;
    if (kind === "cutoff") proof.history.provenance.targetAsOf = "2026-09-13T14:00:00+09:00";
    if (kind === "unsupported") proof.history.unsupportedHistories = [{} as NonNullable<typeof proof.history.unsupportedHistories>[number]];
    if (kind === "source") proof.history.provenance.source = "UNKNOWN";
    if (kind === "horse") proof.history.horseId = "OTHER";
    expect(verifyNoPriorAsOf(proof, expected)).toBe(false);
  });
  it("normal round-trip, deterministic hash, no mutation", () => {
    const p = scoreProofFixture(), before = structuredClone(p);
    const restored = deserializePriorScoreProvenance(serializePriorScoreProvenance(p.evidence));
    expect(restored).toEqual(p.evidence); expect(verifyPriorScoreAsOf(restored, p.context, expected).available).toBe(true);
    expect(priorContentIdentity(p.evidence)).toBe(priorContentIdentity({ ...p.evidence })); expect(p).toEqual(before);
    expect(priorSha256([1, 2])).not.toBe(priorSha256([2, 1]));
  });
  it.each([null, {}, { schemaVersion: "bad" }, { score: NaN }])("runtime malformed values are structured UNVERIFIABLE", value => {
    expect(verifyPriorScoreAsOf(value, { predictionArtifact: predictionFixture(), dependencies: [] }, expected).classification).toBe("UNVERIFIABLE");
  });
});

describe("C2 evidence consistency beyond checksums", () => {
  it("selected-history order changes cannot be hidden by rehashing", () => {
    const p = scoreProofFixture(); p.evidence.selectedHistory.reverse(); seal(p);
    expect(verify(p).reasonCodes).toContain("SELECTED_HISTORY_MISMATCH");
  });
  it("a different canonical dataset is not the Prediction's dataset", () => {
    const p = scoreProofFixture();
    const d = p.context.dependencies.find(d => d.kind === "CANONICAL_DATASET")!;
    (d.payload as { scoredHistories: Record<string, { raceScore: number }[]> }).scoredHistories[expected.canonicalHorseId][0].raceScore = 90;
    resealDependencies(p);
    expect(verify(p).reasonCodes).toContain("PREDICTION_DATASET_MISMATCH");
  });
  it("reconstruction with a missing raw record remains UNVERIFIABLE", () => {
    const p = scoreProofFixture(); p.evidence.classification = "RECONSTRUCTABLE_AS_OF"; seal(p);
    p.context.dependencies = p.context.dependencies.filter(d => d.kind !== "OFFICIAL_RAW");
    expect(verify(p).classification).toBe("UNVERIFIABLE");
  });
  it("does not trust a modified formal Prediction", () => {
    const p = scoreProofFixture(); const prediction = JSON.parse(p.context.predictionArtifact);
    prediction.predictionCutoffAt = "2026-09-13T15:10:00+09:00";
    p.context.predictionArtifact = JSON.stringify(prediction);
    expect(verify(p).available).toBe(false);
  });
});

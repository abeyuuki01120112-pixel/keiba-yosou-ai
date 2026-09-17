import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { orpeCanonical, parseOrpeJson, sha256, verifyOfficialPopulationEvidence, type VerifiedPopulation } from "../officialPopulationEvidence";
import { evaluateOfficialPopulationCompleteness, type AcquiredPopulationInput } from "../officialPopulationCompleteness";
import { dryRunOfficialPopulation, populationSourceReader } from "../officialPopulationDryRun";
import { importJvLinkFinalResult } from "../jvLinkFinalResultImport";
import { buildRaceResultArtifactV2, type RaceResultArtifactV2 } from "../raceResultArtifact";

function sourceRoot(): string | null {
  if (process.env.KEIBA_POPULATION_SOURCE_ROOT) return process.env.KEIBA_POPULATION_SOURCE_ROOT;
  const cloud = path.join(process.env.HOME ?? "", "Library/CloudStorage/OneDrive-個人用");
  if (!fs.existsSync(cloud)) return null;
  for (const dir of fs.readdirSync(cloud)) {
    const parent = path.join(cloud, dir);
    if (!fs.statSync(parent).isDirectory()) continue;
    const candidate = fs.readdirSync(parent).find(name => name.startsWith("競馬予想AI_"));
    if (candidate) return path.join(parent, candidate);
  }
  return null;
}
const root = sourceRoot();
const ids = ["JRA-20260913-NAKAYAMA-11", "JRA-20260912-HANSHIN-11"];

describe("ORPE-CJSON-1 portable boundary", () => {
  it("matches Python non-ASCII and Unicode code point key ordering", () => {
    expect(orpeCanonical(parseOrpeJson('{"𐀀":1,"\ue000":2,"あ":"\n"}'.replace('"\n"', '"\\n"')))).toBe('{"あ":"\\n","":2,"𐀀":1}');
  });
  it.each(['{"x":1,"x":2}', '{"x":1.0}', '[1e2]', '[NaN]', '{"x":9007199254740993}', '[1,]', '{"a":{"x":1,"x":2}}'])("rejects invalid or ambiguous canonical JSON: %s", s => {
    expect(() => parseOrpeJson(s)).toThrow();
  });
  it("no verified evidence cannot pass", () => {
    expect(evaluateOfficialPopulationCompleteness(null, { runIdentifier: "", targetRecordBytes: Buffer.alloc(0), result: null, registry: [] }).status).toBe("UNAVAILABLE");
  });
});

// Read-only real-bundle tests. CI must provide KEIBA_POPULATION_SOURCE_ROOT to run them.
// No fake official PDFs/raw, production writes or scoring; all adversarial changes are in memory.
describe.skipIf(!root)("C4 approved real evidence / raw E2E and semantic regressions", () => {
  const cases = new Map<string, { verified: VerifiedPopulation; input: AcquiredPopulationInput; serialized: string }>();
  const bytes = new Map<string, Buffer>();
  const read = (p: string) => {
    if (!bytes.has(p)) bytes.set(p, populationSourceReader(root!)(p));
    return bytes.get(p)!;
  };
  beforeAll(() => {
    for (const id of ids) {
      const serialized = read(`data/KeibaData/evidence/official-race-population/v1/20260916-request/${id}.json`).toString("utf8");
      const valid = verifyOfficialPopulationEvidence(serialized, read);
      if (valid.status !== "PASS") throw new Error(JSON.stringify(valid));
      const runIdentifier = `2026-09-16-final-compatible-${id}`;
      const result = importJvLinkFinalResult(path.join(root!, "data/KeibaData/jvlink-runs", runIdentifier), {
        expectedRaceId: id, resultStatus: "FINAL", resultVersion: 1, persist: false,
        manualAbnormalRunnerClassifications: id === ids[1] ? [{ canonicalHorseId: "2020103522", didNotFinish: true }] : [],
      });
      if (result.status !== "built") throw new Error(result.status);
      cases.set(id, { verified: valid.verified, serialized, input: { runIdentifier,
        targetRecordBytes: read(`data/KeibaData/jvlink-runs/${runIdentifier}/raw/target-records.jsonl`), result: result.artifact,
        registry: result.artifact.runners.map(r => ({ officialHorseId: r.canonicalHorseId, canonicalHorseId: r.canonicalHorseId })),
      } });
    }
  }, 120000);
  const base = () => cases.get(ids[0])!;
  const evaluate = (patch: Partial<AcquiredPopulationInput> = {}) => evaluateOfficialPopulationCompleteness(base().verified, { ...base().input, ...patch });
  const result = () => base().input.result as RaceResultArtifactV2;
  const rebuild = (patch: Partial<RaceResultArtifactV2>) => {
    const runners = patch.runners ?? result().runners;
    return buildRaceResultArtifactV2({ ...result(), ...patch, race: { ...result().race, ...patch.race,
      resultEntryCount: runners.length, officialStarterCount: runners.filter(r => r.started).length } });
  };
  it.each(ids)("actual raw + Evidence + Mac Result identity PASS: %s", id => {
    const c = cases.get(id)!; const r = evaluateOfficialPopulationCompleteness(c.verified, c.input);
    expect(r).toMatchObject({ status: "PASS", officialCount: 16, resultCount: 16, missingCanonicalHorseIds: [], unexpectedCanonicalHorseIds: [], unresolvedOfficialIds: [], unresolvedResultIds: [], revisionMismatch: false });
    expect(c.verified.evidence.effectivePopulation.every(m => m.canonicalHorseId === null)).toBe(true);
  });
  it("missing one official member is identified", () => {
    const first = result().runners[0];
    const r = evaluate({ result: rebuild({ runners: result().runners.slice(1) }) });
    expect(r.status).toBe("FAIL"); expect(r.missingCanonicalHorseIds).toEqual([first.canonicalHorseId]);
  });
  it("unexpected member is identified", () => {
    const id = "2023999999";
    const r = evaluate({ result: rebuild({ runners: [...result().runners, { ...result().runners[0], canonicalHorseId: id }] }),
      registry: [...base().input.registry, { officialHorseId: id, canonicalHorseId: id }] });
    expect(r.status).toBe("FAIL"); expect(r.unexpectedCanonicalHorseIds).toEqual([id]);
  });
  it("equal counts and same horse name never hide one missing plus one unexpected ID", () => {
    const old = result().runners[0].canonicalHorseId; const id = "2023999999";
    const r = evaluate({ result: rebuild({ runners: result().runners.map((r, i) => i ? r : { ...r, canonicalHorseId: id }) }),
      registry: [...base().input.registry, { officialHorseId: id, canonicalHorseId: id }] });
    expect(r).toMatchObject({ status: "FAIL", officialCount: 16, resultCount: 16, missingCanonicalHorseIds: [old], unexpectedCanonicalHorseIds: [id] });
  });
  it("Result duplicate is reported before Set/checksum processing", () => {
    const r = evaluate({ result: { ...result(), runners: [...result().runners, result().runners[0]] } });
    expect(r.status).toBe("FAIL"); expect(r.duplicateResultIds).toEqual([result().runners[0].canonicalHorseId]);
  });
  it("unresolved official and result IDs fail", () => {
    const r = evaluate({ registry: base().input.registry.slice(1) });
    expect(r.status).toBe("FAIL"); expect(r.unresolvedOfficialIds).toHaveLength(1); expect(r.unresolvedResultIds).toHaveLength(1);
  });
  it("two officials colliding onto a canonical ID fail", () => {
    const registry = structuredClone(base().input.registry); registry[1].canonicalHorseId = registry[0].canonicalHorseId;
    const r = evaluate({ registry }); expect(r.status).toBe("FAIL"); expect(r.canonicalCollisions).toHaveLength(1);
  });
  it("one official resolving multiple ways is not overwritten", () => {
    const r = evaluate({ registry: [...base().input.registry, { ...base().input.registry[0], canonicalHorseId: "2023999999" }] });
    expect(r.status).toBe("FAIL"); expect(r.ambiguousOfficialIds).toHaveLength(1);
  });
  it("race mismatch fails", () => expect(evaluate({ result: rebuild({ race: { ...result().race, raceId: ids[1] } }) })).toMatchObject({ status: "FAIL", raceMismatch: true }));
  it("same bytes under a different run cannot claim revision compatibility", () => expect(evaluate({ runIdentifier: "other-run" })).toMatchObject({ status: "FAIL", revisionMismatch: true }));
  it("changed Result version fails even with a correct new fingerprint", () => expect(evaluate({ result: rebuild({ resultVersion: 2 }) })).toMatchObject({ status: "FAIL", revisionMismatch: true }));
  it("changed acquired raw fails", () => expect(evaluate({ targetRecordBytes: Buffer.from("changed") })).toMatchObject({ status: "FAIL", revisionMismatch: true }));
  it("changed Result source provenance fails", () => expect(evaluate({ result: rebuild({ sourceIdentifier: "another-source" }) })).toMatchObject({ status: "FAIL", revisionMismatch: true }));
  it("DNF stays on both sides; dropping it fails population, regardless of Ability eligibility", () => {
    const c = cases.get(ids[1])!; const a = c.input.result as RaceResultArtifactV2;
    expect(a.runners.find(r => r.canonicalHorseId === "2020103522")).toMatchObject({ started: true, didNotFinish: true, finishPosition: null });
    expect(evaluateOfficialPopulationCompleteness(c.verified, c.input).status).toBe("PASS");
    const r = evaluateOfficialPopulationCompleteness(c.verified, { ...c.input, result: buildRaceResultArtifactV2({ ...a, race: { ...a.race, resultEntryCount: 15, officialStarterCount: 15 }, runners: a.runners.filter(r => r.canonicalHorseId !== "2020103522") }) });
    expect(r.status).toBe("FAIL"); expect(r.missingCanonicalHorseIds).toEqual(["2020103522"]);
  });
  it.each(["duplicate", "missing", "schema", "status", "scope", "race", "RA", "reference", "comparison", "digest"])("reject altered Evidence %s, including self-rehashed content", kind => {
    const e = JSON.parse(base().serialized);
    if (kind === "duplicate") e.effectivePopulation[1] = e.effectivePopulation[0];
    if (kind === "missing") e.effectivePopulation.pop();
    if (kind === "schema") e.schemaVersion = "2.0.0";
    if (kind === "status") e.status = "INVALID";
    if (kind === "scope") e.scope.requestDate = "2026-09-17";
    if (kind === "race") e.raceId = ids[1];
    if (kind === "RA") e.raChecks.registered.status = "FAIL";
    if (kind === "reference") e.effectivePopulation[0].sourceLine = 1;
    if (kind === "comparison") e.finalRunComparisons[0].identityEquality = "FAIL";
    delete e.populationEvidenceDigest;
    e.populationEvidenceDigest = kind === "digest" ? "bad" : sha256(orpeCanonical(e));
    expect(verifyOfficialPopulationEvidence(JSON.stringify(e), read).status).toBe("UNAVAILABLE");
  });
  it.each(["records.jsonl", "report.json", "Export-JVLinkRecords.ps1", "JV-Data-4.9.0.1.pdf", "JV-Link-Interface-4.9.0.1.pdf", "population_evidence_v1.py", "official-race-population-evidence-v1.schema.json"])("reject source digest mutation: %s", suffix => {
    expect(verifyOfficialPopulationEvidence(base().serialized, p => p.endsWith(suffix) ? Buffer.from("mutated in memory") : read(p)).status).toBe("UNAVAILABLE");
  });
  it("a copied/forged verified handle cannot bypass validation", () => expect(evaluateOfficialPopulationCompleteness(structuredClone(base().verified), base().input).status).toBe("UNAVAILABLE"));
  it("read-only dry-run integrates both real races without persisting", () => {
    for (const id of ids) expect(dryRunOfficialPopulation(root!, id).completeness?.status).toBe("PASS");
  });
});

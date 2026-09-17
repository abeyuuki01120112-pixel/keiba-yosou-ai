/** Read-only integration. Never persists results, builds Post-Race inputs or runs Ability. */
import fs from "node:fs";
import path from "node:path";
import { JvRecord } from "../collector/jvlink/records";
import { importJvLinkFinalResult } from "./jvLinkFinalResultImport";
import { verifyOfficialPopulationEvidence, type EvidenceValidation } from "./officialPopulationEvidence";
import { evaluateOfficialPopulationCompleteness, type PopulationCompletenessResult } from "./officialPopulationCompleteness";

export function populationSourceReader(root: string): (relative: string) => Buffer {
  const base = fs.realpathSync(root);
  return relative => {
    if (path.isAbsolute(relative)) throw new Error("ABSOLUTE_SOURCE_REFERENCE");
    const file = fs.realpathSync(path.resolve(base, relative));
    if (!file.startsWith(base + path.sep)) throw new Error("SOURCE_OUTSIDE_ROOT");
    return fs.readFileSync(file);
  };
}
export function dryRunOfficialPopulation(root: string, raceId: string): {
  evidenceValidation: EvidenceValidation; completeness?: PopulationCompletenessResult;
} {
  const read = populationSourceReader(root);
  const validation = verifyOfficialPopulationEvidence(read(`data/KeibaData/evidence/official-race-population/v1/20260916-request/${raceId}.json`).toString("utf8"), read);
  if (validation.status !== "PASS") return { evidenceValidation: validation };
  const runIdentifier = `2026-09-16-final-compatible-${raceId}`;
  const runDir = path.join(root, "data/KeibaData/jvlink-runs", runIdentifier);
  const se = validation.verified.targetRecords.map(r => new JvRecord(r)).filter(r => r.type === "SE");
  // Code 4 and its identity are certified in this evidence, not inferred from null placing.
  const outcome = importJvLinkFinalResult(runDir, {
    expectedRaceId: raceId, resultStatus: "FINAL", resultVersion: 1, persist: false,
    manualAbnormalRunnerClassifications: se.filter(r => r.field(332, 1) === "4").map(r => ({ canonicalHorseId: r.horseId, didNotFinish: true })),
  });
  if (outcome.status !== "built") throw new Error(`FINAL_RESULT_NOT_BUILT:${outcome.status}`);
  // Existing Final Result Adapter uses raw blood-registration ID as canonical ID.
  // All members, including abnormal runners, participate in the dynamic run registry.
  const completeness = evaluateOfficialPopulationCompleteness(validation.verified, {
    runIdentifier, targetRecordBytes: read(`data/KeibaData/jvlink-runs/${runIdentifier}/raw/target-records.jsonl`),
    result: outcome.artifact,
    registry: outcome.artifact.runners.map(r => ({ officialHorseId: r.canonicalHorseId, canonicalHorseId: r.canonicalHorseId })),
  });
  return { evidenceValidation: validation, completeness };
}

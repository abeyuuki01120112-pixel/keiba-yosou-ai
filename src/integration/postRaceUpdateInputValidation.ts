import { validPriorProofEnvelope, validNoPriorProofEnvelope } from "./priorScoreProvenance";
/** Runtime shape checks precede hashing/access. No coercion, defaults or scoring. */
import type { PostRaceUpdateInputIssue } from "./postRaceUpdateInput";

type Check = (value: unknown, path: string, issues: PostRaceUpdateInputIssue[]) => void;
const rule = (test: (value: unknown) => boolean): Check => (value, field, issues) => {
  if (!test(value)) issues.push({ code: field.includes(".evidence[") ? "PROVENANCE_INCOMPLETE" : "INVALID_RUNTIME_SCHEMA", field, message: `${field}の型・値が不正です。` });
};
const string = rule(v => typeof v === "string" && v.trim().length > 0);
const number = rule(v => typeof v === "number" && Number.isFinite(v));
const positive = rule(v => typeof v === "number" && Number.isFinite(v) && v > 0);
const integer = rule(v => typeof v === "number" && Number.isInteger(v) && v > 0);
const nonnegative = rule(v => typeof v === "number" && Number.isFinite(v) && v >= 0);
const count = rule(v => typeof v === "number" && Number.isInteger(v) && v >= 0);
const boolean = rule(v => typeof v === "boolean");
const enumeration = (...values: string[]): Check => rule(v => typeof v === "string" && values.includes(v));
const nullable = (check: Check): Check => (v, p, i) => { if (v !== null) check(v, p, i); };
const optional = (check: Check): Check => (v, p, i) => { if (v !== undefined) check(v, p, i); };
const array = (check: Check): Check => (v, p, i) => {
  if (!Array.isArray(v)) { rule(() => false)(v, p, i); return; }
  for (const [index, item] of v.entries()) check(item, `${p}[${index}]`, i);
};
const object = (fields: Record<string, Check>): Check => (v, p, i) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) { rule(() => false)(v, p, i); return; }
  for (const [key, check] of Object.entries(fields)) check((v as Record<string, unknown>)[key], `${p}.${key}`, i);
};
const date = rule(v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const timestamp = rule(v => typeof v === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)));
const ids = array(string);
const surface = enumeration("turf", "dirt");
const conditions = { racecourse: string, surface, distance: positive, going: string };
const passing = object({ cornerPositions: array(integer), fieldSize: integer, source: string, isReliable: boolean });
const resultRunnerFields = {
  canonicalHorseId: string, horseName: string, horseNumber: nullable(integer), frameNumber: nullable(integer),
  finishPosition: nullable(integer), started: boolean, scratched: boolean, excluded: boolean,
  didNotFinish: boolean, disqualified: boolean, actualRaceTime: nullable(positive), timeGap: nullable(nonnegative),
  final3F: nullable(positive), final3FRank: nullable(integer), passingPosition: nullable(passing), carriedWeight: nullable(positive),
};
const observed = (value: Check): Check => {
  const shape = object({ status: enumeration("AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE"), value: nullable(value), reasonCode: nullable(string), evidenceIds: ids });
  return (v, p, i) => {
    const before = i.length;
    shape(v, p, i);
    if (i.length !== before) return;
    const row = v as { status: string; value: unknown; reasonCode: unknown };
    if (row.status === "AVAILABLE" ? row.value === null || row.reasonCode !== null : row.value !== null || row.reasonCode === null) {
      rule(() => false)(v, p, i);
    }
  };
};
const prior = object({ scoreProofs: optional(array(rule(validPriorProofEnvelope))), noPriorProof: optional(rule(validNoPriorProofEnvelope)), status: enumeration("AVAILABLE", "NO_PRIOR", "UNAVAILABLE", "NOT_APPLICABLE"),
  priorRacesNewestFirst: array(object({ raceId: string, raceDate: date, raceScore: number })),
  reasonCode: nullable(string), evidenceIds: ids });
const objectiveRunnerFields = { canonicalHorseId: string, priorAbility: prior, bodyWeight: observed(positive), bodyWeightChange: observed(number) };
const race = object({ raceId: string, raceDate: date, raceName: string, ...conditions, raceNumber: nullable(integer), evidenceIds: ids });
const baselineFields = { ...conditions, sampleYears: nonnegative, sampleCount: count, source: string, availableAt: optional(nullable(timestamp)) };
const dayFields = { raceId: string, raceDate: date, ...conditions };
const benchmarks = object({
  courseTimeBaseline: observed(object({ ...baselineFields, medianTimeSeconds: positive })),
  courseFinal3FBaseline: observed(object({ ...baselineFields, medianFinal3FSeconds: positive,
    maxRaceDate: optional(date), effectiveAsOf: optional(date), builtFromPeriod: optional(string) })),
  sameDayRaceTimes: observed(array(object({ ...dayFields, officialTimeSeconds: positive }))),
  sameDayFinal3F: observed(array(object({ ...dayFields, raceFinal3FMedianSeconds: positive, raceNumber: optional(nullable(integer)) }))),
});
const evidence = array(object({ evidenceId: string,
  kind: enumeration("OFFICIAL_RESULT", "RACE_METADATA", "PRIOR_RACE_PERFORMANCE", "BODY_WEIGHT", "COURSE_TIME_BASELINE", "COURSE_FINAL3F_BASELINE", "SAME_DAY_RESULT", "PREDICTION_ARTIFACT"),
  source: string, sourceIdentifier: string, targetRaceId: string, referenceRaceId: nullable(string), availableAt: timestamp, retrievedAt: timestamp,
}));
const contract = object({
  schemaVersion: enumeration("post-race-update-input-v1"), inputType: enumeration("POST_RACE_UPDATE_INPUT"),
  source: enumeration("OFFICIAL_RESULT_PLUS_OBJECTIVE_DATA"), transformVersion: enumeration("1.0.0"),
  builtAt: timestamp, resultArtifactId: string, resultContentFingerprint: string, inputContentFingerprint: string,
  race, benchmarks, evidence, runners: array(object({ ...resultRunnerFields, ...objectiveRunnerFields, raceId: string,
    abilityUpdateEligibility: enumeration("ELIGIBLE", "INELIGIBLE_NON_START", "INELIGIBLE_UNSETTLED_RESULT"), resultEvidenceId: string })),
});
const resultStatus = enumeration("FINAL", "CORRECTED", "PROVISIONAL");
const result = object({
  schemaVersion: enumeration("race-result-artifact-v2"), artifactType: enumeration("RACE_RESULT"), artifactId: string,
  resultContentFingerprint: string, resultStatus, resultVersion: integer, source: string, sourceIdentifier: string,
  resultAvailableAt: timestamp, retrievedAt: timestamp, supersedesArtifactId: nullable(string),
  race: object({ raceId: string, raceDate: date, raceName: string, scheduledStartTime: nullable(string),
    officialStarterCount: count, resultEntryCount: count, going: nullable(string) }),
  runners: array(object({ ...resultRunnerFields, resultStatus })),
});
function validate(check: Check, value: unknown, path: string): PostRaceUpdateInputIssue[] {
  const issues: PostRaceUpdateInputIssue[] = [];
  check(value, path, issues);
  return issues;
}
export const validatePostRaceInputRuntime = (value: unknown): PostRaceUpdateInputIssue[] => validate(contract, value, "input");
export const validatePostRaceResultRuntime = (value: unknown): PostRaceUpdateInputIssue[] => validate(result, value, "result");
export const validatePostRaceObjectiveRuntime = (value: unknown): PostRaceUpdateInputIssue[] =>
  validate(object({ race, benchmarks, evidence, runners: array(object(objectiveRunnerFields)) }), value, "objective");

import { canonicalJson } from "./betTypes";
import {
  gatePostRaceUpdateInputV1,
  POST_RACE_UPDATE_INPUT_SCHEMA_VERSION,
  type PostRaceUpdateInputV1,
} from "./postRaceUpdateInput";
import { calculatePostRaceUpdateInputFingerprint } from "./postRaceUpdateInputFingerprint";

export class PostRaceUpdateInputSerializationError extends Error {
  readonly code: "INVALID_JSON" | "INVALID_SCHEMA" | "FINGERPRINT_MISMATCH" | "GATE_REJECTED";

  constructor(code: "INVALID_JSON" | "INVALID_SCHEMA" | "FINGERPRINT_MISMATCH" | "GATE_REJECTED", message: string) {
    super(message);
    this.name = "PostRaceUpdateInputSerializationError";
    this.code = code;
  }
}

/** key順を固定したJSON。ファイル保存は行わない。 */
export function serializePostRaceUpdateInputV1(input: PostRaceUpdateInputV1): string {
  const expected = calculatePostRaceUpdateInputFingerprint(input);
  if (input.inputContentFingerprint !== expected) {
    throw new PostRaceUpdateInputSerializationError("FINGERPRINT_MISMATCH", "入力内容とfingerprintが一致しません。");
  }
  return `${canonicalJson(input)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasEvidenceIds(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.evidenceIds);
}

/** fingerprint計算とGateが安全に読める最低限のV1構造を先に検証する。 */
function hasPostRaceUpdateInputV1Shape(value: unknown): value is PostRaceUpdateInputV1 {
  if (!isRecord(value) || value.schemaVersion !== POST_RACE_UPDATE_INPUT_SCHEMA_VERSION ||
      value.inputType !== "POST_RACE_UPDATE_INPUT" || typeof value.inputContentFingerprint !== "string" ||
      !hasEvidenceIds(value.race) || !Array.isArray(value.runners) || !Array.isArray(value.evidence) ||
      !isRecord(value.benchmarks)) return false;
  const benchmarks = value.benchmarks;
  if (!hasEvidenceIds(benchmarks.courseTimeBaseline) || !hasEvidenceIds(benchmarks.courseFinal3FBaseline) ||
      !hasEvidenceIds(benchmarks.sameDayRaceTimes) || !hasEvidenceIds(benchmarks.sameDayFinal3F)) return false;
  return value.runners.every((runner) => isRecord(runner) && typeof runner.canonicalHorseId === "string" &&
    hasEvidenceIds(runner.bodyWeight) && hasEvidenceIds(runner.bodyWeightChange) &&
    isRecord(runner.priorAbility) && Array.isArray(runner.priorAbility.evidenceIds) &&
    Array.isArray(runner.priorAbility.priorRacesNewestFirst));
}

/** JSONを復元し、schema・fingerprint・Contract Gateをすべて再検証する。 */
export function deserializePostRaceUpdateInputV1(serialized: string): PostRaceUpdateInputV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PostRaceUpdateInputSerializationError("INVALID_JSON", "Post-Race Input JSONを解析できません。");
  }
  if (!hasPostRaceUpdateInputV1Shape(parsed)) {
    throw new PostRaceUpdateInputSerializationError("INVALID_SCHEMA", "Post-Race Update Input V1 schemaではありません。");
  }
  const input = parsed;
  if (typeof input.inputContentFingerprint !== "string" ||
      input.inputContentFingerprint !== calculatePostRaceUpdateInputFingerprint(input)) {
    throw new PostRaceUpdateInputSerializationError("FINGERPRINT_MISMATCH", "復元データのfingerprintが一致しません。");
  }
  const issues = gatePostRaceUpdateInputV1(input);
  if (issues.length > 0) {
    throw new PostRaceUpdateInputSerializationError(
      "GATE_REJECTED",
      `復元データがGateで拒否されました: ${issues.map((issue) => issue.code).join(",")}`,
    );
  }
  return input;
}

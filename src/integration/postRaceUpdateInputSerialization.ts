import { canonicalJson } from "./betTypes";
import {
  gatePostRaceUpdateInputV1,
  type PostRaceUpdateInputIssue,
  type PostRaceUpdateInputV1,
} from "./postRaceUpdateInput";
import { validatePostRaceInputRuntime } from "./postRaceUpdateInputValidation";
import { calculatePostRaceUpdateInputFingerprint } from "./postRaceUpdateInputFingerprint";

export class PostRaceUpdateInputSerializationError extends Error {
  readonly issues: PostRaceUpdateInputIssue[];
  readonly code: "INVALID_JSON" | "INVALID_SCHEMA" | "FINGERPRINT_MISMATCH" | "GATE_REJECTED";

  constructor(code: "INVALID_JSON" | "INVALID_SCHEMA" | "FINGERPRINT_MISMATCH" | "GATE_REJECTED", message: string, issues: PostRaceUpdateInputIssue[] = []) {
    super(message);
    this.name = "PostRaceUpdateInputSerializationError";
    this.code = code;
    this.issues = issues;
  }
}

/** key順を固定したJSON。ファイル保存は行わない。 */
export function serializePostRaceUpdateInputV1(input: PostRaceUpdateInputV1): string {
  const schemaIssues = validatePostRaceInputRuntime(input);
  if (schemaIssues.length > 0) {
    throw new PostRaceUpdateInputSerializationError("INVALID_SCHEMA", "入力schemaが不正です。", schemaIssues);
  }
  const expected = calculatePostRaceUpdateInputFingerprint(input);
  if (input.inputContentFingerprint !== expected) {
    throw new PostRaceUpdateInputSerializationError("FINGERPRINT_MISMATCH", "入力内容とfingerprintが一致しません。");
  }
  const issues = gatePostRaceUpdateInputV1(input);
  if (issues.length > 0) throw new PostRaceUpdateInputSerializationError("GATE_REJECTED", "入力がGateで拒否されました。", issues);
  return `${canonicalJson(input)}\n`;
}

/** JSONを復元し、schema・fingerprint・Contract Gateをすべて再検証する。 */
export function deserializePostRaceUpdateInputV1(serialized: string): PostRaceUpdateInputV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PostRaceUpdateInputSerializationError("INVALID_JSON", "Post-Race Input JSONを解析できません。");
  }
  const schemaIssues = validatePostRaceInputRuntime(parsed);
  if (schemaIssues.length > 0) {
    throw new PostRaceUpdateInputSerializationError("INVALID_SCHEMA", "Post-Race Update Input V1 schemaではありません。", schemaIssues);
  }
  const input = parsed as PostRaceUpdateInputV1;
  if (typeof input.inputContentFingerprint !== "string" ||
      input.inputContentFingerprint !== calculatePostRaceUpdateInputFingerprint(input)) {
    throw new PostRaceUpdateInputSerializationError("FINGERPRINT_MISMATCH", "復元データのfingerprintが一致しません。");
  }
  const issues = gatePostRaceUpdateInputV1(input);
  if (issues.length > 0) {
    throw new PostRaceUpdateInputSerializationError(
      "GATE_REJECTED",
      `復元データがGateで拒否されました: ${issues.map((issue) => issue.code).join(",")}`,
      issues,
    );
  }
  return input;
}

import fs from "node:fs";
import { diagnoseMany, type ReadinessInput, type ReadinessStage } from "../src/integration/preRaceReadiness";

// Explicit selection only; no discovery, latest, guessed runId, or writes.
const values = new Map<string, string>();
const allowed = new Set(["--selections", "--root", "--windows-root", "--race-id", "--stage", "--run-dir", "--run-id", "--plan-reference", "--receipt", "--expected-cutoff-at"]);
const args = process.argv.slice(2);
for (let n = 0; n < args.length; n++) {
  const key = args[n], value = args[++n];
  if (!allowed.has(key) || values.has(key) || !value || value.startsWith("--")) throw new Error(`Invalid or duplicate argument: ${key}`);
  values.set(key, value);
}
let inputs: ReadinessInput[];
if (values.has("--selections")) {
  if (values.size !== 1) throw new Error("--selections is exclusive; put root and every selection inside the JSON array");
  const parsed: unknown = JSON.parse(fs.readFileSync(values.get("--selections")!, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) throw new Error("Selections must be a JSON array");
  inputs = parsed;
} else {
  if (!["--race-id", "--stage", "--run-dir", "--run-id", "--root"].every(k => values.has(k))) {
    throw new Error("Required: --root <Mac root> --race-id <JRA-id> --stage <STAGE_A|STAGE_B> --run-dir <path> --run-id <project-relative run path>. For admission also supply --receipt, --plan-reference, --expected-cutoff-at and, for Windows paths, --windows-root.");
  }
  inputs = [{ root: values.get("--root"), windowsRoot: values.get("--windows-root"),
    raceId: values.get("--race-id")!, stage: values.get("--stage") as ReadinessStage,
    runDir: values.get("--run-dir")!, runId: values.get("--run-id")!,
    receiptPath: values.get("--receipt"), planReference: values.get("--plan-reference"), expectedCutoffAt: values.get("--expected-cutoff-at") }];
}
const report = diagnoseMany(inputs);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.summary.FAILED || report.summary.BLOCKED ? 1 : 0;

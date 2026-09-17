/** npx tsx scripts/checkOfficialPopulation.ts <read-only Windows handoff root>
 * Does not write to the repository, handoff, Result store or Ability history.
 */
import { dryRunOfficialPopulation } from "../src/integration/officialPopulationDryRun";
const root = process.argv[2];
if (!root) throw new Error("Windows handoff root is required");
let passed = true;
for (const raceId of ["JRA-20260913-NAKAYAMA-11", "JRA-20260912-HANSHIN-11"]) {
  try {
    const out = dryRunOfficialPopulation(root, raceId);
    if (out.evidenceValidation.status !== "PASS" || out.completeness?.status !== "PASS") passed = false;
    console.log(JSON.stringify({ raceId, evidenceValidation: out.evidenceValidation.status,
      ...(out.evidenceValidation.status === "UNAVAILABLE" ? { validationErrors: out.evidenceValidation.validationErrors } : {}),
      completeness: out.completeness }, null, 2));
  } catch (error) {
    passed = false;
    console.log(JSON.stringify({ raceId, status: "UNAVAILABLE", validationErrors: [error instanceof Error ? error.message : String(error)] }));
  }
}
if (!passed) process.exitCode = 1;

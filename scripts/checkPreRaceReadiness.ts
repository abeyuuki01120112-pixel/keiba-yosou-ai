import { diagnosePreRaceReadiness, type ReadinessStage } from "../src/integration/preRaceReadiness";

const values = new Map<string,string>();
for (let i=0;i<process.argv.slice(2).length;i++) { const a=process.argv.slice(2)[i]; if(!a.startsWith("--")) throw new Error(`unknown argument: ${a}`); const v=process.argv.slice(2)[++i]; if(!v) throw new Error(`${a} requires a value`); values.set(a,v); }
const raceId=values.get("--race-id"); const stage=values.get("--stage") as ReadinessStage|undefined; const runDir=values.get("--run-dir"); const runId=values.get("--run-id") ?? runDir?.split(/[\\/]/).at(-1);
if (!raceId || !runDir || !runId || (stage!=="STAGE_A" && stage!=="STAGE_B")) throw new Error("usage: --race-id <id> --stage <STAGE_A|STAGE_B> --run-dir <path> [--run-id <id>] [--expected-cutoff-at <ISO>]");
const result=diagnosePreRaceReadiness({raceId,stage,runDir,runId,expectedCutoffAt:values.get("--expected-cutoff-at")});
console.log(JSON.stringify(result,null,2));
process.exitCode=result.status === "READY" ? 0 : 1;

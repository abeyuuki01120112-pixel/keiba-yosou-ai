/** Read-only Windows→Mac Pre-Race input readiness boundary. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type ReadinessStage = "STAGE_A" | "STAGE_B";
export type ReadinessStatus = "READY" | "WAITING" | "FAILED" | "BLOCKED";
export interface ReadinessInput {
  raceId: string; stage: ReadinessStage; runId: string;
  runDir: string; receiptPath?: string; expectedCutoffAt?: string;
}
export interface ReadinessResult {
  raceId: string; stage: ReadinessStage; selectedRunId: string; status: ReadinessStatus;
  reasonCodes: string[]; sourceReferences: string[]; completionEvidence: Record<string, unknown> | null;
  digestValidation: { checked: boolean; status: "PASS" | "FAIL" | "NOT_CHECKED"; mismatches: string[] };
  horsePopulation: { total: number; canonicalHorseIds: string[]; status: "PASS" | "UNKNOWN" | "FAIL" };
  historySummary: { totalHorses: number; full: number; partial: number; shortCareer: number; verifiedNoPrior: number; unresolved: number };
  cutoffValidation: { status: "PASS" | "FAIL" | "NOT_CHECKED"; latestAvailableAt: string | null; expectedCutoffAt: string | null };
  predictionEligibilitySummary: { status: "PASS" | "BLOCKED" | "UNKNOWN"; reasonCodes: string[] };
  warnings: string[]; checkedAt: string;
}
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
function empty(i: ReadinessInput): ReadinessResult { return { raceId:i.raceId, stage:i.stage, selectedRunId:i.runId, status:"WAITING", reasonCodes:[], sourceReferences:[], completionEvidence:null, digestValidation:{checked:false,status:"NOT_CHECKED",mismatches:[]}, horsePopulation:{total:0,canonicalHorseIds:[],status:"UNKNOWN"}, historySummary:{totalHorses:0,full:0,partial:0,shortCareer:0,verifiedNoPrior:0,unresolved:0}, cutoffValidation:{status:"NOT_CHECKED",latestAvailableAt:null,expectedCutoffAt:i.expectedCutoffAt??null}, predictionEligibilitySummary:{status:"UNKNOWN",reasonCodes:[]},warnings:[],checkedAt:new Date().toISOString() }; }
function json(p:string): Record<string,unknown> { return JSON.parse(fs.readFileSync(p,"utf8")) as Record<string,unknown>; }
function fileFrom(run:string, p:string): string { return path.isAbsolute(p) ? p : path.join(run,p); }
export function diagnosePreRaceReadiness(input: ReadinessInput): ReadinessResult {
  const out = empty(input); const fail=(code:string,status:ReadinessStatus="FAILED")=>{out.status=status;out.reasonCodes.push(code);return out;};
  if (!text(input.raceId) || !text(input.runId) || !fs.existsSync(input.runDir)) return fail("RUN_NOT_FOUND");
  const receipt = input.receiptPath ? input.receiptPath : path.join(input.runDir,"result.json");
  if (!fs.existsSync(receipt)) return fail("COMPLETION_RECEIPT_MISSING","WAITING");
  let r: Record<string,unknown>; try { r=json(receipt); } catch { return fail("COMPLETION_RECEIPT_INVALID"); }
  out.completionEvidence=r; out.sourceReferences.push(receipt);
  const rs=String(r.status??"").toUpperCase();
  if (["WAITING_FOR_OFFICIAL_STAGE2","WAITING_FOR_CONFIRMED_PLAN","PENDING","BUSY_WAIT_NEXT_HOUR"].includes(rs)) return fail("UPSTREAM_NOT_COMPLETE","WAITING");
  if (["FAILED","ERROR","EXPIRED"].includes(rs) || r.exitCode !== undefined && Number(r.exitCode)!==0) return fail("UPSTREAM_FAILED");
  if (input.stage === "STAGE_A" && !["SUCCESS","COMPLETE","COMPLETED","ACQUIRED_SYNC_NOT_CHECKED","PARTIAL_HISTORY"].includes(rs) && r.valid !== true) return fail("COMPLETION_NOT_CONFIRMED","WAITING");
  if (input.stage === "STAGE_B" && !["SUCCESS","COMPLETE","COMPLETED"].includes(rs) && r.valid !== true) return fail("COMPLETION_NOT_CONFIRMED","WAITING");
  const recordedStage=String(r.stage??r.stageName??r.mode??"").toUpperCase();
  if (recordedStage && ((input.stage === "STAGE_A" && recordedStage.includes("B")) || (input.stage === "STAGE_B" && !recordedStage.includes("B") && !recordedStage.includes("STAGE_B")))) return fail("STAGE_MISMATCH");
  if (input.stage === "STAGE_B" && !recordedStage) return fail("STAGE_COMPLETION_MISSING","WAITING");
  const runRef = (r.runDir ?? r.runPath ?? r.rawDir) as string | undefined;
  const run = runRef ? fileFrom(input.runDir,runRef) : input.runDir;
  const manifestPath = (r.manifestPath as string|undefined) ? fileFrom(run,r.manifestPath as string) : path.join(run,"raw","manifest.json");
  if (!fs.existsSync(manifestPath)) return fail("MANIFEST_MISSING");
  let m: Record<string,unknown>; try { m=json(manifestPath); } catch { return fail("MANIFEST_INVALID"); }
  out.sourceReferences.push(manifestPath);
  const actualRace=(m.targetRaceId??m.raceId) as string|undefined;
  if (actualRace !== input.raceId) return fail("RACE_ID_MISMATCH");
  const hashes: {path:string;sha256:string}[] = Array.isArray(r.files) ? r.files.filter(obj).map(x=>({path:String(x.path),sha256:String(x.sha256)})) : [];
  const rawPaths = hashes.length ? hashes.map(x=>x.path) : ["raw/target-records.jsonl","raw/history-records.jsonl"];
  const missing=rawPaths.filter(p=>!fs.existsSync(fileFrom(run,p))); if (missing.length) { out.reasonCodes.push("RAW_MISSING"); return fail("RAW_MISSING"); }
  out.digestValidation.checked=hashes.length>0; out.digestValidation.status=hashes.length?"PASS":"NOT_CHECKED";
  for(const h of hashes){const p=fileFrom(run,h.path);out.sourceReferences.push(p);if(sha256(fs.readFileSync(p))!==h.sha256)out.digestValidation.mismatches.push(h.path);}
  if(out.digestValidation.mismatches.length)return fail("DIGEST_MISMATCH");
  const selections=Array.isArray(m.historySelections)?m.historySelections.filter(obj):[];
  out.historySummary.totalHorses=selections.length;
  for(const s of selections){const status=String(s.status??"").toLowerCase();const n=Number(s.availableHistoryCount??0);if(s.careerCompletenessStatus==="COMPLETE"&&n===0)out.historySummary.verifiedNoPrior++;else if(status.includes("partial")||s.historyComplete===false)out.historySummary.partial++;else if(n>=5)out.historySummary.full++;else if(n>0)out.historySummary.shortCareer++;else out.historySummary.unresolved++;}
  const ids=Array.isArray(m.runners)?m.runners.filter(obj).map(x=>String(x.canonicalHorseId??x.horseId??"")).filter(Boolean):[];out.horsePopulation={total:ids.length,canonicalHorseIds:ids,status:ids.length&&new Set(ids).size===ids.length?"PASS":"FAIL"};
  if (out.horsePopulation.status === "FAIL") return fail("HORSE_POPULATION_INVALID");
  const times=[m.targetAsOf,m.collectedAt,r.completedAt].filter(text) as string[];const latest=times.sort().at(-1)??null;out.cutoffValidation.latestAvailableAt=latest;if(input.expectedCutoffAt){out.cutoffValidation.status=latest&&Date.parse(latest)<=Date.parse(input.expectedCutoffAt)?"PASS":"FAIL";if(out.cutoffValidation.status==="FAIL")out.reasonCodes.push("CUTOFF_AFTER_EXPECTED");}else out.cutoffValidation.status="NOT_CHECKED";
  out.predictionEligibilitySummary=out.historySummary.unresolved||out.historySummary.partial?{status:"BLOCKED",reasonCodes:["HISTORY_INCOMPLETE"]}:{status:"UNKNOWN",reasonCodes:[]};
  if(out.reasonCodes.length)return fail(out.reasonCodes[0],out.reasonCodes.includes("CUTOFF_AFTER_EXPECTED")?"BLOCKED":"FAILED");
  out.status="READY";return out;
}
export function diagnoseMany(inputs: readonly ReadinessInput[]): {results:ReadinessResult[];summary:Record<ReadinessStatus,number>} { const results=inputs.map(diagnosePreRaceReadiness);const summary={READY:0,WAITING:0,FAILED:0,BLOCKED:0} as Record<ReadinessStatus,number>;results.forEach(r=>summary[r.status]++);return {results,summary}; }

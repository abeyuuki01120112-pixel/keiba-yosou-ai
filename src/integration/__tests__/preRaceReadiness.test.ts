import fs from "node:fs";import os from "node:os";import path from "node:path";import {afterEach,describe,expect,it} from "vitest";import {diagnoseMany,diagnosePreRaceReadiness} from "../preRaceReadiness";
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true})));
function fixture(patch:Record<string,unknown>={}, receipt:Record<string,unknown>={status:"COMPLETED"}){const d=fs.mkdtempSync(path.join(os.tmpdir(),"ready-"));dirs.push(d);fs.mkdirSync(path.join(d,"raw"));fs.writeFileSync(path.join(d,"raw","target-records.jsonl"),"target");fs.writeFileSync(path.join(d,"raw","history-records.jsonl"),"history");fs.writeFileSync(path.join(d,"raw","manifest.json"),JSON.stringify({targetRaceId:"JRA-20260919-NAKAYAMA-10",targetAsOf:"2026-09-19T10:00:00+09:00",runners:[{canonicalHorseId:"0000000001"}],historySelections:[{status:"available",availableHistoryCount:5}],...patch}));fs.writeFileSync(path.join(d,"result.json"),JSON.stringify(receipt));return d;}
const i=(d:string,stage:"STAGE_A"|"STAGE_B"="STAGE_A")=>({raceId:"JRA-20260919-NAKAYAMA-10",stage,runId:"run-1",runDir:d,expectedCutoffAt:"2026-09-19T11:00:00+09:00"});
describe("pre-race readiness",()=>{
 it("completed run is READY",()=>expect(diagnosePreRaceReadiness(i(fixture())).status).toBe("READY"));
 it("missing receipt waits",()=>expect(diagnosePreRaceReadiness(i(fs.mkdtempSync(path.join(os.tmpdir(),"ready-")))).status).toBe("WAITING"));
 it("failed receipt is FAILED",()=>expect(diagnosePreRaceReadiness(i(fixture({}, {status:"FAILED",exitCode:1}))).status).toBe("FAILED"));
 it("missing raw fails",()=>{const d=fixture();fs.rmSync(path.join(d,"raw","history-records.jsonl"));expect(diagnosePreRaceReadiness(i(d)).status).toBe("FAILED")});
 it("race mismatch fails",()=>expect(diagnosePreRaceReadiness(i(fixture({targetRaceId:"JRA-20260919-HANSHIN-10"}))).status).toBe("FAILED"));
 it("A and B are independent",()=>{const d=fixture();expect(diagnosePreRaceReadiness(i(d,"STAGE_A")).status).toBe("READY");expect(diagnosePreRaceReadiness(i(d,"STAGE_B")).status).toBe("WAITING")});
 it("partial history blocks eligibility but input remains READY",()=>{const r=diagnosePreRaceReadiness(i(fixture({historySelections:[{status:"partial",availableHistoryCount:2}]})));expect(r.status).toBe("READY");expect(r.predictionEligibilitySummary.status).toBe("BLOCKED")});
 it("cutoff violation blocks",()=>expect(diagnosePreRaceReadiness(i(fixture({targetAsOf:"2026-09-19T12:00:00+09:00"}))).status).toBe("BLOCKED"));
 it("invalid manifest fails",()=>{const d=fixture();fs.writeFileSync(path.join(d,"raw","manifest.json"),"{");expect(diagnosePreRaceReadiness(i(d)).status).toBe("FAILED")});
 it("one failed race does not affect others",()=>{const a=fixture(),b=fixture(),c=fixture({}, {status:"FAILED"});const x=diagnoseMany([i(a),i(b),i(c)]);expect(x.summary.READY).toBe(2);expect(x.summary.FAILED).toBe(1)});
 it("duplicate population fails",()=>expect(diagnosePreRaceReadiness(i(fixture({runners:[{canonicalHorseId:"1"},{canonicalHorseId:"1"}]}))).status).toBe("FAILED"));
 it("temporary raw path is not accepted",()=>{const d=fixture();fs.renameSync(path.join(d,"raw","history-records.jsonl"),path.join(d,"raw","history-records.jsonl.tmp"));expect(diagnosePreRaceReadiness(i(d)).status).toBe("FAILED")});
});

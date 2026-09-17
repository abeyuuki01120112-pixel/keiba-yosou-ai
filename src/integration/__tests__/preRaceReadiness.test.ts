import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseMany, diagnosePreRaceReadiness, type ReadinessInput } from "../preRaceReadiness";
import type { JvRecordEnvelope } from "../../collector/jvlink/records";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })));
const raceKey = "2026091906040510", raceId = "JRA-20260919-NAKAYAMA-10";
const cutoff = "2026-09-18T12:00:00+09:00";
const ids = ["2022000001", "2022000002"];
const sha = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function record(type: "RA" | "SE", key: string, horse = "", stage = "2", number = 1): JvRecordEnvelope {
  const b = Buffer.alloc(type === "RA" ? 1272 : 555, 32);
  const put = (p: number, s: string) => b.write(s, p - 1, "ascii");
  put(1, type); put(3, stage); put(4, "20260918"); put(12, key);
  if (type === "RA") { put(706, "17"); put(874, "1500"); put(882, "02"); }
  else { put(28, "1"); put(29, String(number).padStart(2, "0")); put(31, horse); }
  b[b.length - 2] = 13; b[b.length - 1] = 10;
  return { bytes: b.toString("base64"), sourceFile: "RACE20260918100000.jvd", providedAt: "20260918100000", retrievedAt: "2026-09-18T11:00:00+09:00" };
}
/** Actual watcher recovery receipt and full-length JV envelope layout. No invented runners. */
function fixture(count = 5, career?: number) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "readiness-"))); dirs.push(root);
  const runId = "data/jvlink-runs/2026-09-18T02-30-00.000Z";
  const p = (s: string) => path.join(root, s);
  const write = (s: string, value: unknown) => { fs.mkdirSync(path.dirname(p(s)), { recursive: true }); fs.writeFileSync(p(s), typeof value === "string" ? value : JSON.stringify(value)); };
  const raw = `${runId}/raw`, receiptPath = `daily/stage-a-receipts/${raceKey}.json`;
  const keys = Array.from({ length: count }, (_, n) => `202608${String(20 - n).padStart(2, "0")}06040510`);
  const target = [record("RA", raceKey), ...ids.map((id, n) => record("SE", raceKey, id, "2", n + 1))];
  const history = keys.flatMap(k => [record("RA", k, "", "7"), ...ids.map((id, n) => record("SE", k, id, "7", n + 1))]);
  const manifest = { schemaVersion: "jvlink-raw-v1", source: "JRA-VAN/JV-Link", targetRaceId: raceId, targetRaceKey: raceKey,
    raceDate: "2026-09-19", targetAsOf: cutoff, collectedAt: "2026-09-18T11:30:00+09:00",
    historySelections: ids.map(id => ({ horseId: id, horseName: "not-an-identity", status: "available", availableHistoryCount: count, selectedRaceKeys: keys, ...(career === undefined ? {} : { careerStartCountAsOf: career }) })),
    targetRecordCount: target.length, historyRecordCount: history.length, diagnostics: { status: "READY" },
    recordFiles: { target: "target-records.jsonl", history: "history-records.jsonl" },
    provenance: { sourceFiles: ["RACE20260918100000.jvd"], providedAt: ["20260918100000"], retrievedAt: ["2026-09-18T11:00:00+09:00"] },
  };
  write("prepared/preparation.json", { ready: true, targets: [{ canonicalRaceId: raceId, raceKey, startAt: "2026-09-19T15:00:00+09:00" }] });
  write("daily/plan-reference.json", { path: "prepared/preparation.json", sha256: sha(p("prepared/preparation.json")) });
  write(`${raw}/manifest.json`, manifest);
  const lines = (rows: JvRecordEnvelope[]) => rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  write(`${raw}/target-records.jsonl`, lines(target)); write(`${raw}/history-records.jsonl`, lines(history));
  const receipt = { recovered: true, manifest: `${raw}/manifest.json`, historyFetchAvailable: true, historyComplete: true,
    summary: { runDir: runId }, files: [] as { path: string; sha256: string; sizeBytes: number }[] };
  const sync = () => { receipt.files = ["manifest.json", "target-records.jsonl", "history-records.jsonl"].map(n => ({ path: `${raw}/${n}`, sha256: sha(p(`${raw}/${n}`)), sizeBytes: fs.statSync(p(`${raw}/${n}`)).size })); write(receiptPath, receipt); };
  sync();
  const input: ReadinessInput = { root, raceId, stage: "STAGE_A", runId, runDir: runId, receiptPath, planReference: "daily/plan-reference.json", expectedCutoffAt: cutoff };
  return { input, p, write, sync, receipt, manifest, target, history, raw, lines, receiptPath };
}
type F = ReturnType<typeof fixture>;
const manifestEdit = (f: F) => { f.write(`${f.raw}/manifest.json`, f.manifest); f.sync(); };
const targetEdit = (f: F) => { f.write(`${f.raw}/target-records.jsonl`, f.lines(f.target)); f.sync(); };
const check = (f: F, status: string, code?: string) => { const r = diagnosePreRaceReadiness(f.input); expect(r.status).toBe(status); if (code) expect(r.reasonCodes).toContain(code); return r; };

describe("Windows Pre-Race admission boundary", () => {
  it("admits verified recovery receipt, all raw and SHA, without claiming Formal Gate PASS", () => {
    const r = check(fixture(), "READY"); expect(r.digestValidation.status).toBe("PASS"); expect(r.cutoffValidation.status).toBe("PASS");
    expect(r.horsePopulation.canonicalHorseIds).toEqual(ids); expect(r.historySummary.full).toBe(2); expect(r.predictionEligibilitySummary.status).toBe("UNKNOWN"); expect(new Set(Object.values(r.runIdentity)).size).toBe(1);
  });
  it("admits normal sourceSummary receipt", () => {
    const f = fixture(); const summary = { runDir: f.input.runId, canonicalRaceId: raceId, raceKey, status: "ACQUIRED_SYNC_NOT_CHECKED", startedAt: "2026-09-18T11:00:00+09:00", finishedAt: "2026-09-18T11:40:00+09:00" };
    f.write("collection-summary.json", [summary]); f.write(f.receiptPath, { ...f.receipt, recovered: undefined, summary, sourceSummary: "collection-summary.json", sha256: sha(f.p("collection-summary.json")) }); check(f, "READY");
  });
  it("rejects caller-assigned runId", () => { const f = fixture(); f.input.runId = "other"; check(f, "FAILED", "RUN_ID_MISMATCH"); });
  it("rejects receipt runDir mismatch", () => { const f = fixture(); f.receipt.summary.runDir = "data/other"; f.sync(); check(f, "FAILED", "RECEIPT_RUN_MISMATCH"); });
  it("rejects manifest pointer mismatch", () => { const f = fixture(); f.receipt.manifest = "other/manifest.json"; f.sync(); check(f, "FAILED", "MANIFEST_REFERENCE_MISMATCH"); });
  it("rejects manifest race mismatch even after rehash", () => { const f = fixture(); f.manifest.targetRaceId = "JRA-20260919-HANSHIN-10"; manifestEdit(f); check(f, "FAILED", "MANIFEST_RACE_MISMATCH"); });
  it("rejects missing raw", () => { const f = fixture(); fs.unlinkSync(f.p(`${f.raw}/history-records.jsonl`)); check(f, "FAILED"); });
  it("rejects unparseable raw even with correct SHA", () => { const f = fixture(); f.write(`${f.raw}/target-records.jsonl`, "target"); f.sync(); check(f, "FAILED", "PARSE_FAILURE"); });
  it("rejects malformed envelope with correct SHA", () => { const f = fixture(); f.target[0].bytes = "RA"; targetEdit(f); check(f, "FAILED"); });
  it("blocks missing digest", () => { const f = fixture(); f.receipt.files[0].sha256 = ""; f.write(f.receiptPath, f.receipt); check(f, "BLOCKED", "DIGEST_MISSING"); });
  it("blocks missing raw digest entry", () => { const f = fixture(); f.receipt.files.pop(); f.write(f.receiptPath, f.receipt); check(f, "BLOCKED", "REQUIRED_DIGEST_MISSING"); });
  it("rejects stale SHA", () => { const f = fixture(); f.receipt.files[1].sha256 = "0".repeat(64); f.write(f.receiptPath, f.receipt); check(f, "FAILED", "DIGEST_MISMATCH"); });
  it("rejects file size disagreement", () => { const f = fixture(); f.receipt.files[1].sizeBytes++; f.write(f.receiptPath, f.receipt); check(f, "FAILED", "SIZE_MISMATCH"); });
  it("blocks absent Stage plan evidence", () => { const f = fixture(); delete f.input.planReference; check(f, "BLOCKED", "STAGE_EVIDENCE_MISSING"); });
  it("rejects Stage A receipt presented as B", () => { const f = fixture(); f.input.stage = "STAGE_B"; check(f, "FAILED", "STAGE_MISMATCH"); });
  it("never grants B READY without supported validator", () => { const f = fixture(); f.write("b/receipt.json", { status: "COMPLETED" }); f.input.stage = "STAGE_B"; f.input.receiptPath = "b/receipt.json"; check(f, "BLOCKED", "STAGE_B_EVIDENCE_VALIDATOR_NOT_IMPLEMENTED"); });
  it("rejects another venue with same race number", () => { const f = fixture(); f.target[0] = record("RA", "2026091909040510"); targetEdit(f); check(f, "FAILED", "RAW_RACE_MISMATCH"); });
  it("rejects non-stage-2 target", () => { const f = fixture(); f.target[0] = record("RA", raceKey, "", "7"); targetEdit(f); check(f, "FAILED", "RAW_STAGE_MISMATCH"); });
  it("blocks raw retrieved after cutoff", () => { const f = fixture(); f.target[0].retrievedAt = "2026-09-18T13:00:00+09:00"; targetEdit(f); check(f, "BLOCKED", "AFTER_CUTOFF"); });
  it("blocks history retrieved after cutoff", () => { const f = fixture(); f.history[0].retrievedAt = "2026-09-18T13:00:00+09:00"; f.write(`${f.raw}/history-records.jsonl`, f.lines(f.history)); f.sync(); check(f, "BLOCKED", "AFTER_CUTOFF"); });
  it("blocks unproven cutoff", () => { const f = fixture(); delete f.input.expectedCutoffAt; check(f, "BLOCKED", "TIME_UNPROVEN"); });
  it("blocks caller cutoff different from manifest", () => { const f = fixture(); f.input.expectedCutoffAt = "2026-09-18T12:01:00+09:00"; check(f, "BLOCKED", "MANIFEST_CUTOFF_MISMATCH"); });
  it("rejects missing target runner against RA count", () => { const f = fixture(); f.target.pop(); f.manifest.targetRecordCount--; f.write(`${f.raw}/manifest.json`, f.manifest); targetEdit(f); check(f, "FAILED", "RA_SE_POPULATION_MISMATCH"); });
  it("rejects duplicate runner", () => { const f = fixture(); f.target[2] = record("SE", raceKey, ids[0], "2", 2); targetEdit(f); check(f, "FAILED", "DUPLICATE_OR_INVALID_RUNNER"); });
  it("blocks missing history identity and eligibility", () => { const f = fixture(); f.manifest.historySelections.pop(); manifestEdit(f); const r = check(f, "FAILED", "HISTORY_POPULATION_MISMATCH"); expect(r.predictionEligibilitySummary.status).toBe("BLOCKED"); expect(r.horsePopulation.missing).toEqual([ids[1]]); });
  it("does not call partial input READY", () => { const f = fixture(2); f.manifest.historySelections[0].status = "unavailable"; f.manifest.diagnostics.status = "PARTIAL"; f.receipt.historyComplete = false; manifestEdit(f); const r = check(f, "BLOCKED", "HISTORY_INPUT_INCOMPLETE"); expect(r.historySummary.partial).toBe(1); });
  it("separates proven short career from eligibility", () => { const r = check(fixture(2, 2), "READY"); expect(r.historySummary.shortCareer).toBe(2); expect(r.predictionEligibilitySummary.status).toBe("BLOCKED"); });
  it("does not invent NO_PRIOR from empty histories", () => { check(fixture(0), "BLOCKED", "HISTORY_INPUT_INCOMPLETE"); const r = check(fixture(0, 0), "READY"); expect(r.historySummary.verifiedNoPrior).toBe(2); });
  it("rejects selected history not backed by raw", () => { const f = fixture(); f.manifest.historySelections[0].selectedRaceKeys = ["2026080106040510", ...f.manifest.historySelections[0].selectedRaceKeys.slice(1)]; manifestEdit(f); check(f, "FAILED", "HISTORY_REFERENCE_MISMATCH"); });
  it("rejects completed plus failed evidence in same run", () => { const f = fixture(); f.write(`${f.input.runId}/failed.json`, { status: "FAILED", exitCode: 1 }); check(f, "FAILED", "COMPLETION_FAILURE_CONFLICT"); });
  it("does not confuse older failed run with this one", () => { const f = fixture(); f.write("data/older/failed.json", { status: "FAILED" }); check(f, "READY"); });
  it("isolates READY, malformed raw FAILED, and WAITING", () => { const a = fixture(), b = fixture(), c = fixture(); b.write(`${b.raw}/history-records.jsonl`, "{"); b.sync(); c.input.receiptPath = "not-arrived.json"; expect(diagnoseMany([a.input, b.input, c.input]).summary).toEqual({ READY: 1, FAILED: 1, WAITING: 1, BLOCKED: 0 }); });
  it("blocks partial sync marker alongside complete files", () => { const f = fixture(); f.write(`${f.raw}/more.jsonl.tmp`, ""); check(f, "BLOCKED", "PARTIAL_RUN_FILE"); });
  it("keeps A READY and B not-arrived WAITING independent", () => { const f = fixture(); expect(diagnoseMany([f.input, { ...f.input, stage: "STAGE_B", receiptPath: "b/not-arrived.json" }]).summary).toEqual({ READY: 1, WAITING: 1, FAILED: 0, BLOCKED: 0 }); });
  it("maps Windows root explicitly", () => { const f = fixture(); f.input.windowsRoot = "C:\\Users\\abeyu\\Project"; f.receipt.summary.runDir = f.input.windowsRoot + "\\" + f.input.runId.replaceAll("/", "\\"); f.sync(); check(f, "READY"); delete f.input.windowsRoot; check(f, "BLOCKED", "WINDOWS_ROOT_MAPPING_REQUIRED"); });
  it("rejects escaping references", () => { const f = fixture(); f.receipt.files[0].path = "../outside"; f.write(f.receiptPath, f.receipt); check(f, "FAILED", "SOURCE_PATH_ESCAPE"); });
  it("waits for official RA and reports upstream failure separately", () => { const f = fixture(); f.write(f.receiptPath, { status: "WAITING_OFFICIAL_RA" }); check(f, "WAITING"); f.write(f.receiptPath, { status: "FAILED", exitCode: 1 }); check(f, "FAILED", "UPSTREAM_FAILED"); });
  it("does not abort a batch on null selection", () => { const f = fixture(); expect(diagnoseMany([null as unknown as ReadinessInput, f.input]).summary).toEqual({ READY: 1, FAILED: 1, WAITING: 0, BLOCKED: 0 }); });
  it("rejects unproven raw timestamp", () => { const f = fixture(); f.target[0].retrievedAt = ""; targetEdit(f); check(f, "FAILED"); });
  it("rejects availableAt after cutoff even if retrievedAt is earlier", () => { const f = fixture(); f.write(`${f.raw}/target-records.jsonl`, f.target.map(r => JSON.stringify({ ...r, availableAt: "2026-09-18T13:00:00+09:00" })).join("\n")); f.sync(); check(f, "BLOCKED", "AFTER_CUTOFF"); });
  it("rejects manifest runId contradiction", () => { const f = fixture(); f.write(`${f.raw}/manifest.json`, { ...f.manifest, runId: "another-run" }); f.sync(); check(f, "FAILED", "MANIFEST_RUN_MISMATCH"); });
  it("rejects changed preparation plan", () => { const f = fixture(); f.write("prepared/preparation.json", { ready: true, targets: [] }); check(f, "FAILED", "DIGEST_MISMATCH"); });
  it("rejects waiting receipt for a different day", () => { const f = fixture(); f.write(f.receiptPath, { status: "WAITING_FOR_OFFICIAL_STAGE2", raceDate: "20260920" }); check(f, "FAILED", "RECEIPT_RACE_MISMATCH"); });
  it("blocks future manifest provenance arrays", () => { const f = fixture(); f.manifest.provenance.retrievedAt.push("2026-09-18T13:00:00+09:00"); manifestEdit(f); check(f, "BLOCKED", "AFTER_CUTOFF"); });
  it("rejects contradictory recordFiles", () => { const f = fixture(); f.manifest.recordFiles.target = "another.jsonl"; manifestEdit(f); check(f, "FAILED", "MANIFEST_RAW_REFERENCE_MISMATCH"); });
  it("rejects recovered receipt when parent collection-summary marks same run failed", () => { const f = fixture(); f.write("data/collection-summary.json", { runDir: f.input.runId, status: "FAILED" }); check(f, "FAILED", "COMPLETION_FAILURE_CONFLICT"); });
});

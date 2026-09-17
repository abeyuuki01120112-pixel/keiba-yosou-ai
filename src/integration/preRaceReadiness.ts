/** Read-only admission. Never imports scoring, Prediction, stores, or Windows code. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { JvRecord, jvTimestamp, type JvRecordEnvelope } from "../collector/jvlink/records";

export type ReadinessStage = "STAGE_A" | "STAGE_B";
export type ReadinessStatus = "READY" | "WAITING" | "FAILED" | "BLOCKED";
export interface ReadinessInput {
  raceId: string; stage: ReadinessStage;
  /** Exact project-relative run path, not a basename or caller-assigned label. */
  runId: string; runDir: string;
  root?: string; windowsRoot?: string; planReference?: string;
  receiptPath?: string; expectedCutoffAt?: string;
}
interface HistoryRow {
  horseId: string; selectedCount: number; selectedRaceKeys: string[]; selectionStatus: string;
  category: "full" | "partial" | "shortCareer" | "verifiedNoPrior" | "unresolved";
  sourceReferences: string[];
}
export interface ReadinessResult {
  raceId: string; stage: ReadinessStage; selectedRunId: string; status: ReadinessStatus;
  reasonCodes: string[]; sourceReferences: string[]; completionEvidence: Record<string, unknown> | null;
  runIdentity: { requested: string; receipt: string | null; directory: string | null; manifest: string | null };
  digestValidation: { checked: boolean; status: "PASS" | "FAIL" | "NOT_CHECKED"; mismatches: string[] };
  horsePopulation: { total: number; canonicalHorseIds: string[]; status: "PASS" | "UNKNOWN" | "FAIL";
    source: string; missing: string[]; unexpected: string[]; duplicate: string[] };
  historySummary: { totalHorses: number; full: number; partial: number; shortCareer: number; verifiedNoPrior: number; unresolved: number; horses: HistoryRow[] };
  cutoffValidation: { status: "PASS" | "FAIL" | "NOT_CHECKED"; latestAvailableAt: string | null; expectedCutoffAt: string | null };
  predictionEligibilitySummary: { status: "BLOCKED" | "UNKNOWN"; reasonCodes: string[] };
  warnings: string[]; checkedAt: string;
}
type Row = Record<string, unknown>;
class Stop extends Error {
  readonly code: string;
  readonly status: ReadinessStatus;
  constructor(code: string, status: ReadinessStatus = "FAILED") { super(code); this.code = code; this.status = status; }
}
const stop = (code: string, status: ReadinessStatus = "FAILED"): never => { throw new Stop(code, status); };
const object = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const row = (v: unknown): Row => object(v) ? v : stop("INVALID_OBJECT");
const str = (v: unknown): string => typeof v === "string" && v.trim() ? v : stop("REQUIRED_STRING_MISSING", "BLOCKED");
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : stop("REQUIRED_ARRAY_MISSING", "BLOCKED");
const integer = (v: unknown): number => Number.isSafeInteger(v) && (v as number) >= 0 ? v as number : stop("INVALID_COUNT");
const time = (v: unknown): number => {
  if (typeof v !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return stop("TIME_UNPROVEN", "BLOCKED");
  return Date.parse(v);
};
const hash = (v: Uint8Array): string => createHash("sha256").update(v).digest("hex");
const dup = (a: string[]): string[] => [...new Set(a.filter((v, i) => a.indexOf(v) !== i))];
const partial = (p: string): boolean => /(?:^|[/.\\_-])(tmp|temp|partial|incomplete)(?:$|[/.\\_-])/i.test(p);
const failed = (r: Row): boolean => ["FAILED", "ERROR", "EXPIRED"].includes(String(r.status)) ||
  r.exitCode !== undefined && r.exitCode !== 0 || typeof r.error === "string" && r.error.length > 0;

/** Explicit root mapping only. All referenced bytes are cached for one coherent inspection. */
class Sources {
  readonly root: string;
  readonly bytes = new Map<string, Buffer>();
  readonly windowsRoot?: string;
  constructor(root: string, windowsRoot?: string) { this.root = fs.realpathSync(root); this.windowsRoot = windowsRoot; }
  resolve(value: unknown): string {
    let s = str(value);
    if (/^[A-Za-z]:[\\/]/.test(s)) {
      const base = this.windowsRoot?.replaceAll("\\", "/").replace(/\/$/, "");
      s = s.replaceAll("\\", "/");
      if (!base || !s.startsWith(base + "/")) return stop("WINDOWS_ROOT_MAPPING_REQUIRED", "BLOCKED");
      s = s.slice(base.length + 1);
    }
    if (s.split(/[\\/]/).includes("..")) return stop("SOURCE_PATH_ESCAPE");
    const p = path.resolve(this.root, s);
    if (!p.startsWith(this.root + path.sep)) return stop("SOURCE_PATH_ESCAPE");
    if (fs.existsSync(p)) {
      const real = fs.realpathSync(p);
      if (real !== p) return stop("SYMLINK_SOURCE_UNSUPPORTED", "BLOCKED");
    }
    return p;
  }
  id(p: string): string { return path.relative(this.root, p).split(path.sep).join("/"); }
  read(p: string): Buffer {
    if (partial(this.id(p))) return stop("PARTIAL_SOURCE", "BLOCKED");
    if (!this.bytes.has(p)) this.bytes.set(p, fs.readFileSync(this.resolve(p)));
    return this.bytes.get(p)!;
  }
  json(p: string): unknown { return JSON.parse(this.read(p).toString("utf8").replace(/^\uFEFF/, "")); }
  verify(p: string, digest: unknown, size?: unknown): void {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/i.test(digest)) return stop("DIGEST_MISSING", "BLOCKED");
    const b = this.read(p);
    if (size !== undefined && integer(size) !== b.length) return stop("SIZE_MISMATCH");
    if (hash(b) !== digest.toLowerCase()) return stop("DIGEST_MISMATCH");
  }
  unchanged(): void {
    for (const [p, b] of this.bytes) if (!b.equals(fs.readFileSync(this.resolve(p)))) stop("SOURCE_CHANGED_DURING_CHECK");
  }
}
function initial(i: ReadinessInput): ReadinessResult {
  return { raceId: i.raceId, stage: i.stage, selectedRunId: i.runId, status: "WAITING", reasonCodes: [], sourceReferences: [], completionEvidence: null,
    runIdentity: { requested: i.runId, receipt: null, directory: null, manifest: null },
    digestValidation: { checked: false, status: "NOT_CHECKED", mismatches: [] },
    horsePopulation: { total: 0, canonicalHorseIds: [], status: "UNKNOWN", source: "TARGET_RA_STAGE_2_AND_SE_OFFICIAL_IDS", missing: [], unexpected: [], duplicate: [] },
    historySummary: { totalHorses: 0, full: 0, partial: 0, shortCareer: 0, verifiedNoPrior: 0, unresolved: 0, horses: [] },
    cutoffValidation: { status: "NOT_CHECKED", latestAvailableAt: null, expectedCutoffAt: i.expectedCutoffAt ?? null },
    predictionEligibilitySummary: { status: "UNKNOWN", reasonCodes: [] }, warnings: [], checkedAt: new Date().toISOString() };
}

export function diagnosePreRaceReadiness(input: ReadinessInput): ReadinessResult {
  // A malformed selection in a deserialized batch must not abort its neighbours.
  input = object(input) ? input : {} as ReadinessInput;
  const out = initial(input);
  let sources: Sources | undefined;
  try {
    if (!/^JRA-\d{8}-[A-Z]+-\d{2}$/.test(input.raceId) || !["STAGE_A", "STAGE_B"].includes(input.stage)) stop("INVALID_SELECTION");
    if (!input.root) stop("SOURCE_ROOT_REQUIRED", "BLOCKED");
    sources = new Sources(input.root!, input.windowsRoot);
    const s = sources;
    if (!input.receiptPath) stop("COMPLETION_RECEIPT_MISSING", "WAITING");
    const receiptPath = s.resolve(input.receiptPath);
    if (partial(s.id(receiptPath))) stop("PARTIAL_RECEIPT", "WAITING");
    if (!fs.existsSync(receiptPath)) stop("COMPLETION_RECEIPT_MISSING", "WAITING");
    const receipt = row(s.json(receiptPath)); out.completionEvidence = receipt;
    if (receipt.raceDate !== undefined && String(receipt.raceDate).replaceAll("-", "") !== input.raceId.slice(4,12)) stop("RECEIPT_RACE_MISMATCH");
    if (failed(receipt)) stop("UPSTREAM_FAILED");
    if (String(receipt.status).startsWith("WAITING") || ["PENDING", "BUSY_WAIT_NEXT_HOUR", "ACQUIRED_SYNC_PENDING"].includes(String(receipt.status))) stop("UPSTREAM_NOT_COMPLETE", "WAITING");
    // B uses snapshot/condition receipts, never the Stage A collector manifest.
    if (input.stage === "STAGE_B") {
      if (path.basename(path.dirname(receiptPath)) === "stage-a-receipts") stop("STAGE_MISMATCH");
      stop("STAGE_B_EVIDENCE_VALIDATOR_NOT_IMPLEMENTED", "BLOCKED");
    }
    if (!input.planReference) stop("STAGE_EVIDENCE_MISSING", "BLOCKED");
    const planRefPath = s.resolve(input.planReference);
    if (!fs.existsSync(planRefPath)) stop("PLAN_NOT_ARRIVED", "WAITING");
    const planRef = row(s.json(planRefPath)); const planPath = s.resolve(planRef.path);
    s.verify(planPath, planRef.sha256);
    const plan = row(s.json(planPath));
    if (plan.ready === false) stop("OFFICIAL_PLAN_WAITING", "WAITING");
    if (plan.ready !== true) stop("PLAN_INVALID");
    const targets = array(plan.targets).map(row).filter(t => t.canonicalRaceId === input.raceId);
    if (targets.length !== 1) stop("PLAN_RACE_MISMATCH");
    const target = targets[0], raceKey = str(target.raceKey);
    const expectedReceipt = path.join(path.dirname(planRefPath), "stage-a-receipts", raceKey + ".json");
    if (receiptPath !== expectedReceipt) stop("STAGE_MISMATCH");
    const summary = row(receipt.summary);
    const run = s.resolve(input.runDir), receiptRun = s.resolve(summary.runDir);
    out.runIdentity.directory = s.id(run); out.runIdentity.receipt = s.id(receiptRun);
    if (input.runId !== s.id(run)) stop("RUN_ID_MISMATCH");
    if (run !== receiptRun) stop("RECEIPT_RUN_MISMATCH");
    const manifestPath = path.join(run, "raw/manifest.json");
    if (receipt.historyFetchAvailable !== true || typeof receipt.historyComplete !== "boolean") stop("COMPLETION_UNPROVEN", "BLOCKED");
    if (failed(summary)) stop("UPSTREAM_FAILED");
    if (receipt.recovered === true) {
      if (s.resolve(receipt.manifest) !== manifestPath) stop("MANIFEST_REFERENCE_MISMATCH");
    } else {
      if (!["ACQUIRED_SYNC_NOT_CHECKED", "PARTIAL_HISTORY"].includes(String(summary.status))) stop("COMPLETION_UNPROVEN", "BLOCKED");
      const summaryPath = s.resolve(receipt.sourceSummary); s.verify(summaryPath, receipt.sha256);
      const saved = s.json(summaryPath); const rows = Array.isArray(saved) ? saved.map(row) : [row(saved)];
      if (rows.length !== 1 || !isDeepStrictEqual(rows[0], summary)) stop("SUMMARY_MISMATCH");
      if (summary.canonicalRaceId !== input.raceId || summary.raceKey !== raceKey) stop("SUMMARY_RACE_MISMATCH");
    }
    const files = new Map<string, Row>();
    for (const f of array(receipt.files).map(row)) {
      const p = s.resolve(f.path);
      if (!p.startsWith(run + path.sep)) stop("RECEIPT_FILE_OUTSIDE_RUN");
      if (files.has(p)) stop("DUPLICATE_FILE_REFERENCE");
      files.set(p, f); s.verify(p, f.sha256, f.bytes ?? f.sizeBytes);
    }
    const targetPath = path.join(run, "raw/target-records.jsonl"), historyPath = path.join(run, "raw/history-records.jsonl");
    for (const p of [manifestPath, targetPath, historyPath]) if (!files.has(p)) stop("REQUIRED_DIGEST_MISSING", "BLOCKED");
    // Failed evidence or incomplete publication inside this selected immutable run only.
    const visit = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name); s.resolve(p);
        if (partial(entry.name)) stop("PARTIAL_RUN_FILE", "BLOCKED");
        if (entry.isDirectory()) visit(p);
        else if (entry.name.endsWith(".json")) {
          const v = s.json(p);
          if ((Array.isArray(v) ? v : [v]).some(x => object(x) && failed(x))) stop("COMPLETION_FAILURE_CONFLICT");
        }
      }
    };
    visit(run);
    // Windows collection summaries live above the timestamped run. Only rows
    // explicitly naming this run can contradict its recovery receipt.
    for (let parent = path.dirname(run); parent.startsWith(s.root + path.sep); parent = path.dirname(parent)) {
      const reportPath = path.join(parent, "collection-summary.json");
      if (!fs.existsSync(reportPath)) continue;
      const report = s.json(reportPath);
      for (const entry of Array.isArray(report) ? report : [report]) {
        if (object(entry) && entry.runDir !== undefined && s.resolve(entry.runDir) === run && failed(entry)) stop("COMPLETION_FAILURE_CONFLICT");
      }
    }
    out.digestValidation = { checked: true, status: "PASS", mismatches: [] };
    const m = row(s.json(manifestPath));
    if (m.schemaVersion !== "jvlink-raw-v1" || m.source !== "JRA-VAN/JV-Link") stop("MANIFEST_SCHEMA_OR_SOURCE_MISMATCH");
    const recordFiles = row(m.recordFiles);
    if (recordFiles.target !== "target-records.jsonl" || recordFiles.history !== "history-records.jsonl") stop("MANIFEST_RAW_REFERENCE_MISMATCH");
    if (m.targetRaceId !== input.raceId || m.targetRaceKey !== raceKey || m.raceDate !== `${raceKey.slice(0,4)}-${raceKey.slice(4,6)}-${raceKey.slice(6,8)}`) stop("MANIFEST_RACE_MISMATCH");
    out.runIdentity.manifest = s.id(path.dirname(path.dirname(manifestPath)));
    if (m.runId !== undefined && m.runId !== input.runId) stop("MANIFEST_RUN_MISMATCH");
    const diagnostics = row(m.diagnostics);
    if (!["READY", "PARTIAL"].includes(String(diagnostics.status))) stop("MANIFEST_COMPLETION_UNPROVEN", "BLOCKED");
    if (receipt.historyComplete !== (diagnostics.status === "READY")) stop("HISTORY_COMPLETION_CONFLICT");
    const cutoff = time(input.expectedCutoffAt), manifestCutoff = time(m.targetAsOf), collected = time(m.collectedAt);
    if (cutoff !== manifestCutoff) stop("MANIFEST_CUTOFF_MISMATCH", "BLOCKED");
    if (collected >= cutoff || cutoff >= time(target.startAt) - 40 * 60000) stop("STAGE_A_CUTOFF_INVALID", "BLOCKED");
    let latest = collected;
    const checkTime = (v: unknown): void => { const t = time(v); latest = Math.max(latest, t); if (t > cutoff) stop("AFTER_CUTOFF", "BLOCKED"); };
    // Receipt publication/detection is not an input availability timestamp. The
    // source summary's acquisition timestamps and every raw retrieval are checked.
    for (const k of ["startedAt", "finishedAt", "retrievedAt", "availableAt"]) if (summary[k] !== undefined) checkTime(summary[k]);
    const checkProvenance = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(checkProvenance);
      else if (object(v)) for (const [k, x] of Object.entries(v)) {
        if (["retrievedAt", "availableAt", "collectedAt", "providedAt"].includes(k)) {
          for (const value of Array.isArray(x) ? x : [x]) {
            if (k === "providedAt" && typeof value === "string" && /^\d{14}$/.test(value)) checkTime(new Date(jvTimestamp(value)).toISOString());
            else checkTime(value);
          }
        }
        else if (object(x) || Array.isArray(x)) checkProvenance(x);
      }
    };
    checkProvenance(m.provenance);
    const parse = (p: string): JvRecord[] => s.read(p).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim()).map(l => {
      const e = row(JSON.parse(l)); const record = new JvRecord(e as unknown as JvRecordEnvelope);
      checkTime(record.envelope.retrievedAt);
      latest = Math.max(latest, record.providedMs);
      if (record.providedMs > cutoff) stop("AFTER_CUTOFF", "BLOCKED");
      if (e.availableAt !== undefined) checkTime(e.availableAt);
      return record;
    });
    const records = parse(targetPath), histories = parse(historyPath);
    if (integer(m.targetRecordCount) !== records.length || integer(m.historyRecordCount) !== histories.length) stop("MANIFEST_RECORD_COUNT_MISMATCH");
    if (records.some(r => r.raceId !== input.raceId || r.key !== raceKey)) stop("RAW_RACE_MISMATCH");
    if (records.some(r => r.stage !== "2")) stop("RAW_STAGE_MISMATCH");
    const ras = records.filter(r => r.type === "RA"), ses = records.filter(r => r.type === "SE");
    const ids = ses.map(r => r.horseId);
    if (ras.length !== 1 || !ses.length) stop("TARGET_POPULATION_MISSING");
    out.horsePopulation.total = ses.length; out.horsePopulation.canonicalHorseIds = ids;
    out.horsePopulation.duplicate = dup(ids);
    if (out.horsePopulation.duplicate.length || ids.some(id => !/^\d{10}$/.test(id) || id === "0000000000")) stop("DUPLICATE_OR_INVALID_RUNNER");
    const ra = ras[0];
    if (!/^\d{2}$/.test(ra.field(882, 2)) || Number(ra.field(882, 2)) !== ses.length) stop("RA_SE_POPULATION_MISMATCH");
    if (!["17", "18", "24"].includes(ra.field(706, 2))) stop("UNSUPPORTED_COURSE", "BLOCKED");
    const start = `${m.raceDate}T${ra.field(874,4).slice(0,2)}:${ra.field(874,4).slice(2)}:00+09:00`;
    if (time(start) !== time(target.startAt)) stop("SCHEDULE_MISMATCH");
    const horseNumbers = ses.map(r => r.field(29,2));
    if (dup(horseNumbers).length || ses.some(r => !/^[1-8]$/.test(r.field(28,1)) || !/^\d{2}$/.test(r.field(29,2)) || Number(r.field(29,2)) < 1)) stop("UNCONFIRMED_CARD");
    const selections = array(m.historySelections).map(row), selectionIds = selections.map(h => str(h.horseId));
    if (summary.historySelections !== undefined && !isDeepStrictEqual(summary.historySelections, m.historySelections)) stop("SUMMARY_HISTORY_MISMATCH");
    out.horsePopulation.missing = ids.filter(id => !selectionIds.includes(id));
    out.horsePopulation.unexpected = selectionIds.filter(id => !ids.includes(id));
    out.horsePopulation.duplicate.push(...dup(selectionIds));
    if (out.horsePopulation.missing.length || out.horsePopulation.unexpected.length || out.horsePopulation.duplicate.length) stop("HISTORY_POPULATION_MISMATCH");
    out.horsePopulation.status = "PASS";
    const hras = histories.filter(r => r.type === "RA"), hses = histories.filter(r => r.type === "SE");
    if (dup(hras.map(r => r.key)).length || dup(hses.map(r => `${r.key}:${r.horseId}`)).length) stop("DUPLICATE_HISTORY_RECORD");
    if (histories.some(r => r.date >= String(m.raceDate) || r.key === raceKey)) stop("FUTURE_OR_TARGET_HISTORY", "BLOCKED");
    if (histories.some(r => !["6", "7", "B"].includes(r.stage))) stop("UNSUPPORTED_HISTORY_STAGE", "BLOCKED");
    const selectedKeys = new Set<string>();
    const blockEligibility = (code: string) => { out.predictionEligibilitySummary.status = "BLOCKED"; out.predictionEligibilitySummary.reasonCodes.push(code); };
    for (const h of selections) {
      const id = str(h.horseId), keys = array(h.selectedRaceKeys).map(str), status = str(h.status);
      if (!["available", "unavailable"].includes(status)) stop("UNSUPPORTED_HISTORY_STATUS", "BLOCKED");
      if (keys.length > 5 || dup(keys).length || integer(h.availableHistoryCount) !== keys.length) stop("INVALID_HISTORY_SELECTION");
      const actual = hses.filter(r => r.horseId === id);
      if (actual.length !== keys.length || keys.some((k, i) => actual[i]?.key !== k)) stop("HISTORY_REFERENCE_MISMATCH");
      if (keys.some(k => !hras.some(r => r.key === k))) stop("HISTORY_RA_MISSING");
      keys.forEach(k => selectedKeys.add(k));
      const career = h.careerStartCountAsOf === undefined ? null : integer(h.careerStartCountAsOf);
      if (career !== null && career < keys.length) stop("INVALID_CAREER_COUNT");
      const category: HistoryRow["category"] = status !== "available" ? "partial" :
        keys.length === 5 ? "full" : career === keys.length ? (career === 0 ? "verifiedNoPrior" : "shortCareer") : "unresolved";
      out.historySummary[category]++;
      out.historySummary.horses.push({ horseId: id, selectedCount: keys.length, selectedRaceKeys: keys, selectionStatus: status, category, sourceReferences: [s.id(historyPath), ...actual.map(r => r.envelope.sourceFile)] });
      if (category === "partial" || category === "unresolved") blockEligibility("HISTORY_INCOMPLETE_OR_UNPROVEN");
      if (keys.length <= 2) blockEligibility(keys.length === 0 ? "NO_SCORABLE_PRIOR" : "SHORT_CAREER_INSUFFICIENT_EVIDENCE");
      if (actual.some(r => r.stage === "B")) blockEligibility("UNSUPPORTED_HISTORY_REQUIRES_FORMAL_GATE");
    }
    out.historySummary.totalHorses = ids.length;
    if (hses.some(r => !ids.includes(r.horseId)) || hras.some(r => !selectedKeys.has(r.key))) stop("UNSELECTED_HISTORY_RECORD");
    out.cutoffValidation.status = "PASS"; out.cutoffValidation.latestAvailableAt = new Date(latest).toISOString();
    s.unchanged();
    if (diagnostics.status === "PARTIAL" || out.historySummary.partial || out.historySummary.unresolved) stop("HISTORY_INPUT_INCOMPLETE", "BLOCKED");
    out.warnings.push("FORMAL_GATE_NOT_EXECUTED", "READY_IS_INPUT_ADMISSION_NOT_PREDICTION_PERMISSION");
    out.status = "READY";
  } catch (error) {
    out.status = error instanceof Stop ? error.status : "FAILED";
    out.predictionEligibilitySummary.status = "BLOCKED";
    const code = error instanceof Stop ? error.code : error instanceof SyntaxError ? "PARSE_FAILURE" : "SOURCE_READ_OR_RAW_VALIDATION_FAILED";
    out.reasonCodes.push(code);
    if (code.includes("DIGEST") && out.status === "FAILED" || code === "SIZE_MISMATCH") out.digestValidation = { checked: true, status: "FAIL", mismatches: [code] };
    if (code.includes("CUTOFF") || code === "TIME_UNPROVEN") out.cutoffValidation.status = "FAIL";
    if (out.horsePopulation.duplicate.length || code.includes("POPULATION") || code.includes("RUNNER")) out.horsePopulation.status = "FAIL";
  }
  out.sourceReferences = sources ? [...sources.bytes.keys()] : [];
  out.predictionEligibilitySummary.reasonCodes = [...new Set(out.predictionEligibilitySummary.reasonCodes)];
  return out;
}
export function diagnoseMany(inputs: readonly ReadinessInput[]): { results: ReadinessResult[]; summary: Record<ReadinessStatus, number> } {
  const results = inputs.map(diagnosePreRaceReadiness);
  const summary = { READY: 0, WAITING: 0, FAILED: 0, BLOCKED: 0 };
  results.forEach(r => summary[r.status]++);
  return { results, summary };
}

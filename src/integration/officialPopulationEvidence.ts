/** C4 evidence acceptance is deliberately limited to the two approved request editions.
 * Pure read-only source provider. No generator execution, storage, or Ability imports.
 */
import { createHash } from "node:crypto";
import { JvRecord, type JvRecordEnvelope } from "../collector/jvlink/records";

export const POPULATION_PINS: Readonly<Record<string, string>> = {
  "JRA-20260913-NAKAYAMA-11": "b3ee00950c4ee89b1209d3d870eba29241b5d0d2c7b8d3eac5ef72711e6b1682",
  "JRA-20260912-HANSHIN-11": "61c579e0bc58b7cab1103504e93e09529693cf5a40c049286db54dab798359bb",
};
const RAW_PIN = "e4fe57daddf96cbd3ef0ca3ea4ad60009db64989bdf3ffbbaea28e10eda82c40";
export const sha256 = (v: string | Uint8Array): string => createHash("sha256").update(v).digest("hex");
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** ORPE rejects duplicate object keys before they could disappear in JSON.parse. */
export function parseOrpeJson(text: string): Json {
  const s = text.replace(/^\uFEFF/, ""); let pos = 0;
  const ws = () => { while (/\s/.test(s[pos] ?? "") && pos < s.length) pos++; };
  const string = (): string => {
    const start = pos++;
    while (pos < s.length) {
      if (s[pos] === "\\") { pos += 2; continue; }
      if (s[pos++] === '"') return JSON.parse(s.slice(start, pos)) as string;
    }
    throw new Error("UNTERMINATED_STRING");
  };
  const value = (): Json => {
    ws(); const c = s[pos];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      pos++; ws(); const end = c === "{" ? "}" : "]";
      const obj: Record<string, Json> = Object.create(null); const arr: Json[] = [];
      if (s[pos] === end) { pos++; return c === "{" ? obj : arr; }
      while (true) {
        ws();
        if (c === "{") {
          if (s[pos] !== '"') throw new Error("OBJECT_KEY_REQUIRED");
          const k = string(); ws(); if (s[pos++] !== ":") throw new Error("COLON_REQUIRED");
          if (Object.hasOwn(obj, k)) throw new Error("DUPLICATE_JSON_KEY");
          obj[k] = value();
        } else arr.push(value());
        ws(); if (s[pos] === end) { pos++; break; }
        if (s[pos++] !== ",") throw new Error("COMMA_REQUIRED");
      }
      return c === "{" ? obj : arr;
    }
    for (const [token, v] of [["null", null], ["true", true], ["false", false]] as const) {
      if (s.startsWith(token, pos)) { pos += token.length; return v; }
    }
    const m = /^-?(?:0|[1-9]\d*)/.exec(s.slice(pos));
    if (!m) throw new Error("INVALID_JSON_VALUE");
    pos += m[0].length;
    const n = Number(m[0]); if (!Number.isSafeInteger(n)) throw new Error("UNSUPPORTED_INTEGER");
    return n;
  };
  const result = value(); ws(); if (pos !== s.length) throw new Error("NON_INTEGER_OR_TRAILING_JSON"); return result;
}
const compareUnicode = (a: string, b: string): number => {
  const x = Array.from(a, c => c.codePointAt(0)!); const y = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
export function orpeCanonical(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(orpeCanonical).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.keys(v).sort(compareUnicode).map(k => `${JSON.stringify(k)}:${orpeCanonical(v[k])}`).join(",")}}`;
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw new Error("UNSUPPORTED_INTEGER");
  return JSON.stringify(v);
}
interface Reference { path: string; sha256: string; sizeBytes: number }
interface Member {
  officialHorseId: string; canonicalHorseId: null; canonicalResolutionStatus: string;
  sourceLine: number; occurrenceIndex: number; sourceRecordDigest: string;
  rawRecordReference: { path: string; line: number }; raceKey: string; dataCategory: string;
  recordCreatedDate: string; sourceFile: string; providedAt: string; retrievedAt: string;
  abnormalStatus: string; officialPlacing: string;
}
export interface OfficialPopulationEvidence {
  schemaVersion: string; evidenceType: string; status: string;
  raceId: string; raceKey: string; raceDate: string; raceName: string;
  scope: { requestDate: string; definition: string; selectionStatus: string };
  populationEvidenceDigest: string;
  canonicalSerialization: { name: string; algorithm: string };
  sourceRaw: Reference & { totalLines: number; targetRecordLines: number[] };
  sourceReferences: Reference[];
  requestProvenance: { runIdentifier: string; report: Reference };
  completionEvidence: { reportValues: Record<string, Json>; collectorReference: Reference; eofLogic: { sourceLine: number; exactStatement: string } };
  occurrences: Member[]; effectivePopulation: Member[];
  identityIntegrity: { occurrenceCount: number; uniqueOfficialHorseIdCount: number; effectivePopulationCount: number;
    duplicateOfficialHorseIds: string[]; conflictingOfficialHorseIds: string[]; deletionRecords: Json[]; correctionCandidates: Json[]; unresolvedSelections: Json[] };
  raEvidence: { sourceLine: number; sourceRecordDigest: string; registered: number; starts: number; finishers: number };
  raChecks: Record<string, { actual: number; expected: number; status: string }>;
  finalRunComparisons: { runIdentifier: string; reference: Reference; identityEquality: string; recordAndProvenanceMultisetEquality: string }[];
}
export interface VerifiedPopulation { readonly evidence: OfficialPopulationEvidence; readonly targetRecords: readonly JvRecordEnvelope[] }
// A caller cannot fabricate or edit a verified handle to bypass validation.
const verified = new WeakMap<VerifiedPopulation, string>();
export const isVerifiedPopulation = (v: VerifiedPopulation): boolean => {
  try { return verified.get(v) === sha256(JSON.stringify(v)); } catch { return false; }
};
const assert = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
export type EvidenceValidation = { status: "PASS"; verified: VerifiedPopulation } | { status: "UNAVAILABLE"; validationErrors: string[] };
const decodeLines = (bytes: Uint8Array): JvRecordEnvelope[] => Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/).map(l => parseOrpeJson(l) as unknown as JvRecordEnvelope);
const canonicalEnvelope = (v: JvRecordEnvelope) => orpeCanonical(v as unknown as Json);

export function verifyOfficialPopulationEvidence(serialized: string, read: (path: string) => Uint8Array): EvidenceValidation {
  try {
    const parsed = parseOrpeJson(serialized);
    assert(parsed && !Array.isArray(parsed) && typeof parsed === "object", "INVALID_SCHEMA");
    const e = parsed as unknown as OfficialPopulationEvidence;
    const { populationEvidenceDigest: digest, ...payload } = parsed as Record<string, Json>;
    assert(e.schemaVersion === "1.0.0" && e.evidenceType === "OfficialRacePopulationEvidenceV1" && e.status === "VALID", "INVALID_SCHEMA_OR_STATUS");
    assert(e.canonicalSerialization.name === "ORPE-CJSON-1" && e.canonicalSerialization.algorithm === "SHA-256", "INVALID_CANONICALIZATION");
    assert(sha256(orpeCanonical(payload)) === digest, "EVIDENCE_DIGEST_MISMATCH");
    // Pin the full approved schema/content/scope, not merely a self-supplied checksum.
    assert(POPULATION_PINS[e.raceId] === digest, "UNAPPROVED_EDITION_OR_SCOPE");
    const files = new Map<string, Uint8Array>();
    for (const ref of e.sourceReferences) {
      assert(!files.has(ref.path), "DUPLICATE_SOURCE_REFERENCE");
      const bytes = read(ref.path);
      assert(bytes.length === ref.sizeBytes && sha256(bytes) === ref.sha256, `SOURCE_DIGEST_MISMATCH:${ref.path}`);
      files.set(ref.path, bytes);
    }
    const raw = files.get(e.sourceRaw.path)!;
    assert(raw && sha256(raw) === RAW_PIN, "SOURCE_RAW_PIN_MISMATCH");
    const report = parseOrpeJson(Buffer.from(files.get(e.requestProvenance.report.path)!).toString("utf8"));
    assert(orpeCanonical(report) === orpeCanonical(e.completionEvidence.reportValues), "REPORT_MISMATCH");
    const collector = Buffer.from(files.get(e.completionEvidence.collectorReference.path)!).toString("utf8").replace(/^\uFEFF/, "");
    assert(collector.split(/\r?\n/)[e.completionEvidence.eofLogic.sourceLine - 1].trim() === e.completionEvidence.eofLogic.exactStatement, "EOF_CODE_MISMATCH");
    const envelopes = decodeLines(raw); const records = envelopes.map(r => new JvRecord(r));
    assert(records.length === e.sourceRaw.totalLines, "STREAM_COUNT_MISMATCH");
    const target = records.map((r, i) => ({ r, line: i + 1 })).filter(x => x.r.key === e.raceKey);
    assert(JSON.stringify(target.map(x => x.line)) === JSON.stringify(e.sourceRaw.targetRecordLines), "TARGET_REFERENCE_MISMATCH");
    assert(target.every(x => x.r.raceId === e.raceId && x.r.date === e.raceDate && x.r.stage === "7" && x.r.field(4, 8) === "20260914"), "RACE_OR_REVISION_MISMATCH");
    const ses = target.filter(x => x.r.type === "SE"); const ras = target.filter(x => x.r.type === "RA");
    assert(ras.length === 1 && ses.length === 16 && new Set(ses.map(x => x.r.horseId)).size === ses.length, "POPULATION_DUPLICATE_OR_INCOMPLETE");
    const integrity = e.identityIntegrity;
    assert([integrity.occurrenceCount, integrity.uniqueOfficialHorseIdCount, integrity.effectivePopulationCount].every(n => n === ses.length) &&
      [integrity.duplicateOfficialHorseIds, integrity.conflictingOfficialHorseIds, integrity.deletionRecords, integrity.correctionCandidates, integrity.unresolvedSelections].every(a => a.length === 0), "IDENTITY_INTEGRITY_FAILED");
    for (const list of [e.occurrences, e.effectivePopulation]) {
      assert(list.length === ses.length, "MEMBER_COUNT_MISMATCH");
      list.forEach((m, i) => {
        const { r, line } = ses[i];
        assert(/^\d{10}$/.test(r.horseId) && r.horseId !== "0000000000" && m.officialHorseId === r.horseId && m.canonicalHorseId === null && m.canonicalResolutionStatus === "UNRESOLVED_ON_WINDOWS", "INVALID_OFFICIAL_IDENTITY");
        assert(m.sourceLine === line && m.rawRecordReference.path === e.sourceRaw.path && m.rawRecordReference.line === line && m.occurrenceIndex === i + 1 && m.sourceRecordDigest === sha256(r.buffer), "RAW_RECORD_REFERENCE_MISMATCH");
        assert(m.raceKey === r.key && m.dataCategory === r.stage && m.recordCreatedDate === r.field(4, 8) && m.abnormalStatus === r.field(332, 1) && m.officialPlacing === r.field(335, 2) && m.sourceFile === r.envelope.sourceFile && m.providedAt === r.envelope.providedAt && m.retrievedAt === r.envelope.retrievedAt, "MEMBER_PROVENANCE_MISMATCH");
      });
    }
    const ra = ras[0];
    assert(e.raEvidence.sourceLine === ra.line && e.raEvidence.sourceRecordDigest === sha256(ra.r.buffer), "RA_REFERENCE_MISMATCH");
    const registered = ses.length;
    const starts = ses.filter(x => !["1", "2", "3"].includes(x.r.field(332, 1))).length;
    const finishers = starts - ses.filter(x => x.r.field(332, 1) === "4").length;
    for (const [key, count, position] of [["registered", registered, 882], ["starts", starts, 884], ["finishers", finishers, 886]] as const) {
      const check = e.raChecks[key];
      assert(check.status === "PASS" && check.actual === count && check.expected === count && e.raEvidence[key] === count && Number(ra.r.field(position, 2)) === count, "RA_CHECK_FAILED");
    }
    const targetEnvelopes = target.map(x => envelopes[x.line - 1]);
    const sourceMultiset = targetEnvelopes.map(canonicalEnvelope).sort();
    for (const run of e.finalRunComparisons) {
      const acquired = decodeLines(files.get(run.reference.path)!);
      assert(run.identityEquality === "PASS" && run.recordAndProvenanceMultisetEquality === "PASS" && JSON.stringify(acquired.map(canonicalEnvelope).sort()) === JSON.stringify(sourceMultiset), "FINAL_RUN_REVISION_MISMATCH");
    }
    const handle: VerifiedPopulation = { evidence: e, targetRecords: targetEnvelopes };
    verified.set(handle, sha256(JSON.stringify(handle)));
    return { status: "PASS", verified: handle };
  } catch (error) { return { status: "UNAVAILABLE", validationErrors: [error instanceof Error ? error.message : String(error)] }; }
}

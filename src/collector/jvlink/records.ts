/**
 * JV-Data RA/SE固定長recordの純粋parser。
 * Windows COM/JV-Link起動には依存せず、OneDriveへ保存済みのbase64 envelopeだけを扱う。
 * Positions: JV-Data 4.9.0.1 / RA 1272 bytes / SE 555 bytes.
 */

export interface JvRecordEnvelope {
  bytes: string;
  sourceFile: string;
  providedAt: string;
  retrievedAt: string;
}

export const JRA_COURSES: Readonly<Record<string, readonly [string, string]>> = {
  "01": ["SAPPORO", "札幌"],
  "02": ["HAKODATE", "函館"],
  "03": ["FUKUSHIMA", "福島"],
  "04": ["NIIGATA", "新潟"],
  "05": ["TOKYO", "東京"],
  "06": ["NAKAYAMA", "中山"],
  "07": ["CHUKYO", "中京"],
  "08": ["KYOTO", "京都"],
  "09": ["HANSHIN", "阪神"],
  "10": ["KOKURA", "小倉"],
};

const decoder = new TextDecoder("shift_jis", { fatal: true });

export function jvTimestamp(value: string): number {
  if (!/^\d{14}$/.test(value)) throw new Error(`INVALID_JV_TIMESTAMP: ${value}`);
  const iso = jvTimestampToIso(value);
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-T:]/g, "") !== value) {
    throw new Error(`INVALID_JV_TIMESTAMP_DATE: ${value}`);
  }
  return timestamp;
}

export function jvTimestampToIso(value: string): string {
  if (!/^\d{14}$/.test(value)) throw new Error(`INVALID_JV_TIMESTAMP: ${value}`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T` +
    `${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;
}

export class JvRecord {
  readonly buffer: Buffer;
  readonly type: "RA" | "SE";
  readonly providedMs: number;
  readonly envelope: JvRecordEnvelope;

  constructor(envelope: JvRecordEnvelope) {
    if (envelope === null || typeof envelope !== "object" || typeof envelope.bytes !== "string" ||
        typeof envelope.sourceFile !== "string" || envelope.sourceFile.length === 0 ||
        typeof envelope.providedAt !== "string" || typeof envelope.retrievedAt !== "string") {
      throw new Error("INVALID_JV_RECORD_ENVELOPE");
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.bytes)) {
      throw new Error("INVALID_JV_RECORD_BASE64");
    }
    this.envelope = envelope;
    this.buffer = Buffer.from(envelope.bytes, "base64");
    const type = this.field(1, 2);
    if (type !== "RA" && type !== "SE") throw new Error(`UNSUPPORTED_JV_RECORD_TYPE: ${type}`);
    this.type = type;
    const expectedLength = type === "RA" ? 1272 : 555;
    if (this.buffer.length !== expectedLength || !this.buffer.subarray(-2).equals(Buffer.from([13, 10]))) {
      throw new Error(`INVALID_JV_RECORD_LENGTH_OR_TERMINATOR: ${type}`);
    }

    this.providedMs = jvTimestamp(envelope.providedAt);
    const retrievedMs = Date.parse(envelope.retrievedAt);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(envelope.retrievedAt) ||
        !Number.isFinite(retrievedMs) || this.providedMs > retrievedMs) {
      throw new Error("INVALID_JV_RETRIEVAL_PROVENANCE");
    }
    const createdMs = jvTimestamp(`${this.field(4, 8)}000000`);
    if (createdMs > this.providedMs) throw new Error("JV_RECORD_CREATED_AFTER_PUBLICATION");
    jvTimestamp(`${this.field(12, 8)}000000`);
  }

  field(position: number, length: number): string {
    if (!Number.isInteger(position) || position < 1 || !Number.isInteger(length) || length < 1 ||
        position - 1 + length > this.buffer.length) {
      throw new Error(`INVALID_JV_FIELD_RANGE: ${position}/${length}`);
    }
    return decoder.decode(this.buffer.subarray(position - 1, position - 1 + length)).trim();
  }

  get stage(): string { return this.field(3, 1); }
  get key(): string { return this.field(12, 16); }
  get horseId(): string { return this.type === "SE" ? this.field(31, 10) : ""; }
  get course(): readonly [string, string] | undefined { return JRA_COURSES[this.field(20, 2)]; }
  get date(): string {
    const date = this.field(12, 8);
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  get raceId(): string {
    if (!this.course) throw new Error(`UNSUPPORTED_NON_JRA_COURSE: ${this.field(20, 2)}`);
    return `JRA-${this.field(12, 8)}-${this.course[0]}-${this.field(26, 2)}`;
  }
}

/** cutoff時点で公開済みの最新版だけを残す。 */
export function recordsAsOf(envelopes: readonly JvRecordEnvelope[], cutoff: string): JvRecord[] {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(cutoff)) throw new Error("INVALID_EXPLICIT_CUTOFF");
  const cutoffMs = Date.parse(cutoff);
  if (!Number.isFinite(cutoffMs)) throw new Error("INVALID_EXPLICIT_CUTOFF");
  const latest = new Map<string, JvRecord>();
  for (const envelope of envelopes) {
    const record = new JvRecord(envelope);
    if (record.providedMs > cutoffMs) continue;
    const key = `${record.type}:${record.key}:${record.horseId}`;
    const existing = latest.get(key);
    if (existing && existing.providedMs === record.providedMs && !existing.buffer.equals(record.buffer)) {
      throw new Error(`CONFLICTING_JV_REVISIONS: ${key}`);
    }
    if (!existing || existing.providedMs < record.providedMs) latest.set(key, record);
  }
  return [...latest.values()];
}

export function positiveJvNumber(value: string, label: string): number {
  if (!/^\d+$/.test(value) || Number(value) <= 0) throw new Error(`MISSING_OR_INVALID_JV_${label}: ${value}`);
  return Number(value);
}

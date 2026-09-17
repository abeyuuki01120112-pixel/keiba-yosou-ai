import type { JvRecord } from "./records";

/** JVData 4.9.0.1 SE(532,4). User-supplied Windows specification/raw verification,
 * 2026-09-17. Not the preceding-horse margin code at SE(343,3).
 * Keep raw text (including -000) because numeric zero does not identify a dead heat.
 */
export type JvTimeGap =
  | { status: "AVAILABLE"; raw: string; officialRawTimeGapSeconds: number }
  | { status: "UNAVAILABLE"; raw: string | null; reason: "SPECIAL_9999" | "BLANK_OR_MISSING" | "INITIAL_VALUE" | "INVALID" };

export function decodeJvTimeGap(raw: unknown): JvTimeGap {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return { status: "UNAVAILABLE", raw: typeof raw === "string" ? raw : null, reason: "BLANK_OR_MISSING" };
  }
  if (raw === "9999") return { status: "UNAVAILABLE", raw, reason: "SPECIAL_9999" };
  if (raw === "0000") return { status: "UNAVAILABLE", raw, reason: "INITIAL_VALUE" };
  if (typeof raw !== "string" || !/^[+-]\d{3}$/.test(raw)) {
    return { status: "UNAVAILABLE", raw: typeof raw === "string" ? raw : null, reason: "INVALID" };
  }
  return { status: "AVAILABLE", raw, officialRawTimeGapSeconds: Number(raw) / 10 };
}

/** Result v2 retains its nonnegative, behind-winner semantic. Raw evidence is separate.
 * Missing or contradictory measurements never become zero, even for a winner.
 */
export function resultTimeBehindWinnerSeconds(gap: JvTimeGap, finishPosition: number): number | null {
  if (gap.status !== "AVAILABLE") return null;
  if (finishPosition === 1 && gap.officialRawTimeGapSeconds <= 0) return 0;
  if (finishPosition > 1 && gap.raw.startsWith("+")) return gap.officialRawTimeGapSeconds;
  return null;
}

/** Preserve the four source bytes; JvRecord.field() trims spaces. */
export function readJvTimeGapRaw(record: JvRecord): string {
  return record.buffer.subarray(531, 535).toString("ascii");
}

/** C3 pure boundary. No scoring, storage, Prediction or rolling-history calls. */
import { createHash } from "node:crypto";
import type { RacePerformance } from "../ability/types";
import { JvRecord, jvTimestampToIso, type JvRecordEnvelope } from "../collector/jvlink/records";
import { decodeJvTimeGap, readJvTimeGapRaw, resultTimeBehindWinnerSeconds } from "../collector/jvlink/timeGap";
import { canonicalJson } from "./betTypes";
import { deserializeRaceResultArtifactV2, type RaceResultArtifactV2 } from "./raceResultArtifact";
import { validatePostRaceResultRuntime } from "./postRaceUpdateInputValidation";

export interface JvLinkTimeGapEvidence {
  schemaVersion: "jvlink-result-time-gap-evidence-v1";
  raceId: string;
  resultArtifactId: string;
  resultContentFingerprint: string;
  source: "JV_LINK";
  sourceIdentifier: string;
  /** Exact SE envelopes; immutable raw remains authoritative. No implicit companion store. */
  records: JvRecordEnvelope[];
  contentIdentity: string;
}

/** Supplied only after reviewing official finish/adjudication data, NOT derived from gap=0.
 * Unknown dead-heat/relegation fields are intentionally not guessed by this implementation.
 */
export interface NormalFinishOrderEvidence {
  raceId: string;
  resultArtifactId: string;
  resultContentFingerprint: string;
  source: "JV_LINK";
  sourceIdentifier: string;
  status: "VERIFIED_NORMAL_NO_DEAD_HEAT_OR_RELEGATION";
}
const hash = (v: unknown) => `sha256:${createHash("sha256").update(canonicalJson(v)).digest("hex")}`;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const timestamp = (v: unknown): v is string => text(v) && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

export function buildJvLinkTimeGapEvidence(result: RaceResultArtifactV2, records: readonly JvRecordEnvelope[]): JvLinkTimeGapEvidence {
  const content = {
    schemaVersion: "jvlink-result-time-gap-evidence-v1" as const,
    raceId: result.race.raceId, resultArtifactId: result.artifactId,
    resultContentFingerprint: result.resultContentFingerprint, source: "JV_LINK" as const,
    sourceIdentifier: result.sourceIdentifier,
    records: records.map(r => ({ ...r })).sort((a, b) => a.bytes.localeCompare(b.bytes)),
  };
  return { ...content, contentIdentity: hash(content) };
}

export interface AbilityTimeGapCandidate {
  canonicalHorseId: string;
  officialRawTimeGapSeconds: number;
  resultTimeBehindWinnerSeconds: number;
  abilityTimeGapSeconds: number;
  /** Only this explicitly typed projection is for the future RacePerformance boundary. */
  racePerformanceInput: Pick<RacePerformance, "timeGap">;
  raw: string;
  referenceHorseId: string;
  derivation: "JV_LINK_OFFICIAL_SIGNED_GAP_VALIDATED_AGAINST_RACE_TIMES";
}
export type AbilityTimeGapOutcome =
  | { status: "UNAVAILABLE"; issues: { code: string; message: string }[] }
  | { status: "AVAILABLE"; schemaVersion: "ability-time-gap-candidates-v1"; raceId: string;
      resultArtifactId: string; resultContentFingerprint: string; resultVersion: number;
      supersedesArtifactId: string | null; evidenceContentIdentity: string;
      finishOrderEvidence: NormalFinishOrderEvidence; ruleVersion: "jv-signed-gap-v1";
      calculatedAt: string; runners: AbilityTimeGapCandidate[]; contentIdentity: string };

/** Accept unknown runtime objects and reject with structured issues before any Ability use.
 * Raw official tenths are authoritative. Times are a consistency check, not a source of
 * guessed sub-tenth margins. Unsupported races fail as a whole, rather than partially updating.
 */
export function deriveAbilityTimeGaps(resultValue: unknown, evidenceValue: unknown,
  finishOrderValue: unknown, calculatedAt: string): AbilityTimeGapOutcome {
  const deny = (code: string, message = code): AbilityTimeGapOutcome => ({ status: "UNAVAILABLE", issues: [{ code, message }] });
  try {
    if (validatePostRaceResultRuntime(resultValue).length) return deny("INVALID_RESULT_SCHEMA");
    const result = deserializeRaceResultArtifactV2(JSON.stringify(resultValue));
    if (result.source !== "JV_LINK" || !["FINAL", "CORRECTED"].includes(result.resultStatus)) return deny("UNSUPPORTED_RESULT_SOURCE_OR_STATUS");
    if (!timestamp(calculatedAt) || Date.parse(calculatedAt) < Math.max(Date.parse(result.retrievedAt), Date.parse(result.resultAvailableAt))) return deny("INVALID_CALCULATED_AT");
    const e = evidenceValue;
    if (!object(e) || e.schemaVersion !== "jvlink-result-time-gap-evidence-v1" || e.source !== "JV_LINK" ||
        !text(e.contentIdentity) || !Array.isArray(e.records) || !text(e.sourceIdentifier)) return deny("INVALID_GAP_EVIDENCE");
    const { contentIdentity, ...content } = e;
    if (hash(content) !== contentIdentity) return deny("STALE_GAP_EVIDENCE");
    if (e.raceId !== result.race.raceId || e.resultArtifactId !== result.artifactId ||
        e.resultContentFingerprint !== result.resultContentFingerprint || e.sourceIdentifier !== result.sourceIdentifier) return deny("RESULT_EVIDENCE_MISMATCH");
    const review = finishOrderValue;
    if (!object(review) || review.status !== "VERIFIED_NORMAL_NO_DEAD_HEAT_OR_RELEGATION" ||
        review.source !== "JV_LINK" || !text(review.sourceIdentifier) || review.raceId !== result.race.raceId ||
        review.resultArtifactId !== result.artifactId || review.resultContentFingerprint !== result.resultContentFingerprint) return deny("NORMAL_FINISH_ORDER_UNVERIFIED");
    if (result.runners.length < 2 || result.runners.some(r => !r.started || r.scratched || r.excluded || r.didNotFinish || r.disqualified)) return deny("UNSUPPORTED_RUNNER_STATE");
    const runners = [...result.runners].sort((a, b) => a.finishPosition! - b.finishPosition!);
    // Duplicate official positions reject ties; no test of timeGap===0 here.
    if (runners.some((r, i) => r.finishPosition !== i + 1)) return deny("UNSUPPORTED_FINISH_ORDER");
    const [winner, second] = runners;
    if (!second || second.finishPosition !== 2) return deny("MISSING_SECOND_CONTEXT");
    const records = e.records.map(r => new JvRecord(r as JvRecordEnvelope));
    if (records.length !== runners.length || new Set(records.map(r => r.horseId)).size !== records.length) return deny("RAW_RUNNER_SET_MISMATCH");
    const byHorse = new Map(records.map(r => [r.horseId, r]));
    const times = new Map<string, number>();
    for (const r of runners) {
      const se = byHorse.get(r.canonicalHorseId);
      if (!se || se.type !== "SE" || se.raceId !== result.race.raceId || se.date !== result.race.raceDate ||
          !["6", "7"].includes(se.stage)) return deny("RAW_IDENTITY_OR_STAGE_MISMATCH");
      if (Date.parse(se.envelope.retrievedAt) > Date.parse(result.retrievedAt) ||
          Date.parse(jvTimestampToIso(se.envelope.providedAt)) > Date.parse(result.resultAvailableAt)) return deny("RAW_REVISION_AFTER_RESULT");
      if (se.field(332, 1) !== "0" || Number(se.field(335, 2)) !== r.finishPosition) return deny("RAW_FINISH_STATE_MISMATCH");
      const rawTime = se.field(339, 4);
      if (!/^[0-9][0-5][0-9][0-9]$/.test(rawTime) || rawTime === "0000") return deny("MISSING_RACE_TIME");
      const ticks = Number(rawTime[0]) * 600 + Number(rawTime.slice(1));
      if (r.actualRaceTime !== ticks / 10) return deny("RAW_RESULT_TIME_MISMATCH");
      times.set(r.canonicalHorseId, ticks);
    }
    const candidates: AbilityTimeGapCandidate[] = [];
    for (const r of runners) {
      const se = byHorse.get(r.canonicalHorseId)!;
      const gap = decodeJvTimeGap(readJvTimeGapRaw(se));
      if (gap.status !== "AVAILABLE") return deny("OFFICIAL_GAP_UNAVAILABLE");
      if (!gap.raw.startsWith(r.finishPosition === 1 ? "-" : "+")) return deny("OFFICIAL_GAP_SIGN_MISMATCH");
      const reference = r.finishPosition === 1 ? second : winner;
      const deltaTicks = times.get(r.canonicalHorseId)! - times.get(reference.canonicalHorseId)!;
      if ((r.finishPosition === 1 ? deltaTicks > 0 : deltaTicks < 0) || gap.officialRawTimeGapSeconds !== deltaTicks / 10) return deny("OFFICIAL_GAP_TIME_MISMATCH");
      const resultGap = resultTimeBehindWinnerSeconds(gap, r.finishPosition!);
      if (resultGap === null || r.timeGap !== resultGap) return deny("RESULT_GAP_SEMANTIC_MISMATCH");
      // Canonicalize numeric -0 only; the original -000 remains preserved as raw evidence.
      const abilityTimeGapSeconds = gap.officialRawTimeGapSeconds === 0 ? 0 : gap.officialRawTimeGapSeconds;
      candidates.push({ canonicalHorseId: r.canonicalHorseId, officialRawTimeGapSeconds: abilityTimeGapSeconds,
        resultTimeBehindWinnerSeconds: resultGap, abilityTimeGapSeconds,
        racePerformanceInput: { timeGap: abilityTimeGapSeconds }, raw: gap.raw,
        referenceHorseId: reference.canonicalHorseId, derivation: "JV_LINK_OFFICIAL_SIGNED_GAP_VALIDATED_AGAINST_RACE_TIMES" });
    }
    const output = {
      status: "AVAILABLE" as const, schemaVersion: "ability-time-gap-candidates-v1" as const,
      raceId: result.race.raceId, resultArtifactId: result.artifactId, resultContentFingerprint: result.resultContentFingerprint,
      resultVersion: result.resultVersion, supersedesArtifactId: result.supersedesArtifactId,
      evidenceContentIdentity: e.contentIdentity as string,
      finishOrderEvidence: { ...review } as unknown as NormalFinishOrderEvidence,
      ruleVersion: "jv-signed-gap-v1" as const, calculatedAt, runners: candidates,
    };
    return { ...output, contentIdentity: hash(output) };
  } catch (error) {
    return deny("INVALID_RESULT_OR_RAW_EVIDENCE", error instanceof Error ? error.message : String(error));
  }
}

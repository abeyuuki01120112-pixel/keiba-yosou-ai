/**
 * Post-Race Update Input Contract V1.
 *
 * 公式結果（Race Result Artifact v2）と、Ability V1の1走評価に必要な客観情報を
 * 結合する読み取り専用の入力境界。RacePerformanceの計算、rolling historyへの追加、
 * Base Ability更新、Prediction/Result Artifactの変更は行わない。
 */

import type {
  CourseFinal3FBaseline,
  CourseTimeBaseline,
  PassingPositionData,
  Surface,
} from "../ability/types";
import type { DayFinal3FRecord } from "../ability/final3FTrackAdjustment";
import type { DayRaceRecord } from "../ability/trackAdjustment";
import { APPROVED_FINAL_RESULT_SOURCES } from "./officialResultInput";
import type { RaceResultArtifactRunnerV2, RaceResultArtifactV2 } from "./raceResultArtifact";
import { isCalibrationFinalResult } from "./raceResultArtifact";
import { calculatePostRaceUpdateInputFingerprint } from "./postRaceUpdateInputFingerprint";

export const POST_RACE_UPDATE_INPUT_SCHEMA_VERSION = "post-race-update-input-v1";
export const POST_RACE_UPDATE_INPUT_TRANSFORM_VERSION = "1.0.0";

export type PostRaceEvidenceKind =
  | "OFFICIAL_RESULT"
  | "RACE_METADATA"
  | "PRIOR_RACE_PERFORMANCE"
  | "BODY_WEIGHT"
  | "COURSE_TIME_BASELINE"
  | "COURSE_FINAL3F_BASELINE"
  | "SAME_DAY_RESULT"
  | "PREDICTION_ARTIFACT";

export interface PostRaceEvidenceV1 {
  evidenceId: string;
  kind: PostRaceEvidenceKind;
  source: string;
  sourceIdentifier: string;
  /** このEvidenceが構築対象としているレース。常にContractのraceIdと一致する。 */
  targetRaceId: string;
  /** 過去走・同日他レース等を参照する場合の参照先。対象レース自身ならraceId。 */
  referenceRaceId: string | null;
  availableAt: string;
  retrievedAt: string;
}

export type OptionalObjectiveStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_APPLICABLE";

export interface OptionalObjectiveValueV1<T> {
  status: OptionalObjectiveStatus;
  value: T | null;
  reasonCode: string | null;
  evidenceIds: string[];
}

export interface PriorRaceScoreV1 {
  raceId: string;
  raceDate: string;
  raceScore: number;
}

export type PriorAbilityStatus = "AVAILABLE" | "NO_PRIOR" | "UNAVAILABLE" | "NOT_APPLICABLE";

export interface PriorAbilityContextV1 {
  status: PriorAbilityStatus;
  /** 新しい順。対象レースより厳密に前の確定済みraceScoreだけを保持する。 */
  priorRacesNewestFirst: PriorRaceScoreV1[];
  reasonCode: string | null;
  evidenceIds: string[];
}

export interface PostRaceObjectiveRunnerV1 {
  canonicalHorseId: string;
  priorAbility: PriorAbilityContextV1;
  /** Ability Model V1では未使用。Race Review用の客観値としてのみ保持する。 */
  bodyWeight: OptionalObjectiveValueV1<number>;
  /** Ability Model V1では未使用。Race Review用の客観値としてのみ保持する。 */
  bodyWeightChange: OptionalObjectiveValueV1<number>;
}

export interface PostRaceObjectiveRaceV1 {
  raceId: string;
  raceDate: string;
  raceName: string;
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  /** Ability V1の必須値ではない。同日上がり補正の安全な絞り込みに使う。 */
  raceNumber: number | null;
  evidenceIds: string[];
}

export interface PostRaceBenchmarkContextV1 {
  courseTimeBaseline: OptionalObjectiveValueV1<CourseTimeBaseline>;
  courseFinal3FBaseline: OptionalObjectiveValueV1<CourseFinal3FBaseline>;
  /** 対象レース自身を含めない、同日・同場・同surfaceの客観結果。 */
  sameDayRaceTimes: OptionalObjectiveValueV1<DayRaceRecord[]>;
  /** 対象レース自身を含めない、同日・同場・同surfaceの客観結果。 */
  sameDayFinal3F: OptionalObjectiveValueV1<DayFinal3FRecord[]>;
}

/** Result Artifact v2に含まれない客観情報。Result正本とは別責務で供給する。 */
export interface PostRaceObjectiveDataV1 {
  race: PostRaceObjectiveRaceV1;
  runners: PostRaceObjectiveRunnerV1[];
  benchmarks: PostRaceBenchmarkContextV1;
  evidence: PostRaceEvidenceV1[];
}

export type AbilityUpdateEligibility =
  | "ELIGIBLE"
  | "INELIGIBLE_NON_START"
  | "INELIGIBLE_UNSETTLED_RESULT";

export interface PostRaceUpdateRunnerInputV1 {
  raceId: string;
  canonicalHorseId: string;
  horseName: string;
  horseNumber: number | null;
  frameNumber: number | null;
  finishPosition: number | null;
  started: boolean;
  scratched: boolean;
  excluded: boolean;
  didNotFinish: boolean;
  disqualified: boolean;
  actualRaceTime: number | null;
  timeGap: number | null;
  final3F: number | null;
  final3FRank: number | null;
  passingPosition: PassingPositionData | null;
  carriedWeight: number | null;
  bodyWeight: OptionalObjectiveValueV1<number>;
  bodyWeightChange: OptionalObjectiveValueV1<number>;
  priorAbility: PriorAbilityContextV1;
  abilityUpdateEligibility: AbilityUpdateEligibility;
  resultEvidenceId: string;
}

export interface PostRaceUpdateInputV1 {
  schemaVersion: typeof POST_RACE_UPDATE_INPUT_SCHEMA_VERSION;
  inputType: "POST_RACE_UPDATE_INPUT";
  source: "OFFICIAL_RESULT_PLUS_OBJECTIVE_DATA";
  builtAt: string;
  transformVersion: typeof POST_RACE_UPDATE_INPUT_TRANSFORM_VERSION;
  resultArtifactId: string;
  resultContentFingerprint: string;
  /** builtAtと配列の入力順を除いたContract内容の決定的fingerprint。 */
  inputContentFingerprint: string;
  race: PostRaceObjectiveRaceV1;
  runners: PostRaceUpdateRunnerInputV1[];
  benchmarks: PostRaceBenchmarkContextV1;
  evidence: PostRaceEvidenceV1[];
}

export type PostRaceUpdateInputIssueCode =
  | "RESULT_NOT_FINAL"
  | "INVALID_SOURCE"
  | "RACE_ID_MISMATCH"
  | "RACE_IDENTITY_MISMATCH"
  | "CANONICAL_HORSE_ID_MISMATCH"
  | "REQUIRED_FIELD_MISSING"
  | "PROVENANCE_INCOMPLETE"
  | "PREDICTION_DATA_FORBIDDEN"
  | "CROSS_RACE_DATA"
  | "PRIOR_CONTEXT_UNAVAILABLE"
  | "INVALID_OBJECTIVE_VALUE";

export interface PostRaceUpdateInputIssue {
  code: PostRaceUpdateInputIssueCode;
  message: string;
  canonicalHorseId?: string;
  field?: string;
}

export type BuildPostRaceUpdateInputOutcome =
  | { status: "accepted"; input: PostRaceUpdateInputV1 }
  | { status: "rejected"; issues: PostRaceUpdateInputIssue[] };

function isIsoTimestamp(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (new Set(left).size !== left.length || new Set(right).size !== right.length) return false;
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function isAllowedEvidenceKind(kind: string): boolean {
  return [
    "OFFICIAL_RESULT",
    "RACE_METADATA",
    "PRIOR_RACE_PERFORMANCE",
    "BODY_WEIGHT",
    "COURSE_TIME_BASELINE",
    "COURSE_FINAL3F_BASELINE",
    "SAME_DAY_RESULT",
  ].includes(kind);
}

function validateEvidence(
  evidence: readonly PostRaceEvidenceV1[],
  targetRaceId: string,
): PostRaceUpdateInputIssue[] {
  const issues: PostRaceUpdateInputIssue[] = [];
  const duplicateIds = duplicateValues(evidence.map((item) => item.evidenceId));
  if (duplicateIds.length > 0) {
    issues.push({
      code: "PROVENANCE_INCOMPLETE",
      message: `evidenceIdが重複しています: ${duplicateIds.join(",")}`,
    });
  }
  for (const item of evidence) {
    if (!item.evidenceId || !item.source || !item.sourceIdentifier ||
        !isIsoTimestamp(item.availableAt) || !isIsoTimestamp(item.retrievedAt)) {
      issues.push({
        code: "PROVENANCE_INCOMPLETE",
        message: `Evidence(${item.evidenceId || "<empty>"})のsource/provenanceが不足しています。`,
      });
    }
    if (item.kind === "PREDICTION_ARTIFACT" || /prediction/i.test(item.source) ||
        /prediction/i.test(item.sourceIdentifier)) {
      issues.push({
        code: "PREDICTION_DATA_FORBIDDEN",
        message: `Evidence(${item.evidenceId})にPrediction由来データが含まれています。`,
      });
    } else if (!isAllowedEvidenceKind(item.kind)) {
      issues.push({ code: "INVALID_SOURCE", message: `Evidence(${item.evidenceId})のkindが許可されていません。` });
    } else if (item.kind === "OFFICIAL_RESULT" &&
        !(APPROVED_FINAL_RESULT_SOURCES as readonly string[]).includes(item.source)) {
      issues.push({
        code: "INVALID_SOURCE",
        message: `Official Result Evidence(${item.evidenceId})のsource=${item.source}は許可されていません。`,
      });
    }
    if (item.targetRaceId !== targetRaceId) {
      issues.push({
        code: "CROSS_RACE_DATA",
        message: `Evidence(${item.evidenceId})のtargetRaceId(${item.targetRaceId})が対象(${targetRaceId})と一致しません。`,
      });
    }
    if (Date.parse(item.availableAt) > Date.parse(item.retrievedAt)) {
      issues.push({
        code: "PROVENANCE_INCOMPLETE",
        message: `Evidence(${item.evidenceId})のavailableAtがretrievedAtより後です。`,
      });
    }
  }
  return issues;
}

function validateEvidenceRefs(
  field: string,
  evidenceIds: readonly string[],
  knownIds: ReadonlySet<string>,
  allowEmpty: boolean,
  canonicalHorseId?: string,
): PostRaceUpdateInputIssue[] {
  if ((!allowEmpty && evidenceIds.length === 0) || evidenceIds.some((id) => !knownIds.has(id))) {
    return [{
      code: "PROVENANCE_INCOMPLETE",
      message: `${field}のEvidence参照が不足または不正です。`,
      canonicalHorseId,
      field,
    }];
  }
  return [];
}

function validateOptionalValue<T>(
  field: string,
  observed: OptionalObjectiveValueV1<T>,
  knownIds: ReadonlySet<string>,
  canonicalHorseId?: string,
): PostRaceUpdateInputIssue[] {
  const issues: PostRaceUpdateInputIssue[] = [];
  if (observed.status === "AVAILABLE") {
    if (observed.value === null || observed.reasonCode !== null) {
      issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: `${field}=AVAILABLEの値が不正です。`, canonicalHorseId, field });
    }
    issues.push(...validateEvidenceRefs(field, observed.evidenceIds, knownIds, false, canonicalHorseId));
  } else if (observed.status === "UNAVAILABLE") {
    if (observed.value !== null || !observed.reasonCode) {
      issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: `${field}=UNAVAILABLEの理由が不足しています。`, canonicalHorseId, field });
    }
    issues.push(...validateEvidenceRefs(field, observed.evidenceIds, knownIds, false, canonicalHorseId));
  } else if (observed.value !== null || observed.reasonCode === null) {
    issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: `${field}=NOT_APPLICABLEの形式が不正です。`, canonicalHorseId, field });
  }
  return issues;
}

function resultEligibility(runner: RaceResultArtifactRunnerV2): AbilityUpdateEligibility {
  if (runner.scratched || runner.excluded || !runner.started) return "INELIGIBLE_NON_START";
  if (runner.didNotFinish || runner.disqualified || runner.finishPosition === null) {
    return "INELIGIBLE_UNSETTLED_RESULT";
  }
  return "ELIGIBLE";
}

/** 構築済みContractを、Ability更新前に必ず通すGate。 */
export function gatePostRaceUpdateInputV1(input: PostRaceUpdateInputV1): PostRaceUpdateInputIssue[] {
  const issues: PostRaceUpdateInputIssue[] = [];
  if (input.schemaVersion !== POST_RACE_UPDATE_INPUT_SCHEMA_VERSION ||
      input.inputType !== "POST_RACE_UPDATE_INPUT" ||
      input.source !== "OFFICIAL_RESULT_PLUS_OBJECTIVE_DATA") {
    issues.push({ code: "INVALID_SOURCE", message: "Post-Race Update Input V1の識別情報が不正です。" });
  }
  if (!isIsoTimestamp(input.builtAt)) {
    issues.push({ code: "PROVENANCE_INCOMPLETE", message: "builtAtが有効なISO8601ではありません。" });
  }
  if (!input.inputContentFingerprint ||
      input.inputContentFingerprint !== calculatePostRaceUpdateInputFingerprint(input)) {
    issues.push({ code: "PROVENANCE_INCOMPLETE", message: "Post-Race Inputのfingerprintが不足または不一致です。" });
  }

  issues.push(...validateEvidence(input.evidence, input.race.raceId));
  const evidenceIds = new Set(input.evidence.map((item) => item.evidenceId));
  const evidenceById = new Map(input.evidence.map((item) => [item.evidenceId, item]));
  issues.push(...validateEvidenceRefs("race", input.race.evidenceIds, evidenceIds, false));
  if (input.race.evidenceIds.some((id) => evidenceById.get(id)?.kind !== "RACE_METADATA")) {
    issues.push({ code: "INVALID_SOURCE", message: "race metadataがRACE_METADATA以外のEvidenceを参照しています。" });
  }

  if (!input.race.raceId || !input.race.raceDate || !input.race.raceName || !input.race.racecourse ||
      !["turf", "dirt"].includes(input.race.surface) || !Number.isFinite(input.race.distance) ||
      input.race.distance <= 0 || !input.race.going) {
    issues.push({ code: "REQUIRED_FIELD_MISSING", message: "raceのAbility V1必須条件が不足しています。", field: "race" });
  }

  const duplicateHorseIds = duplicateValues(input.runners.map((runner) => runner.canonicalHorseId));
  if (duplicateHorseIds.length > 0) {
    issues.push({
      code: "CANONICAL_HORSE_ID_MISMATCH",
      message: `canonicalHorseIdが重複しています: ${duplicateHorseIds.join(",")}`,
    });
  }

  for (const runner of input.runners) {
    if (runner.raceId !== input.race.raceId) {
      issues.push({
        code: "CROSS_RACE_DATA",
        message: `runner(${runner.canonicalHorseId})のraceIdが対象レースと一致しません。`,
        canonicalHorseId: runner.canonicalHorseId,
        field: "raceId",
      });
    }
    if (!runner.canonicalHorseId) {
      issues.push({ code: "REQUIRED_FIELD_MISSING", message: "canonicalHorseIdが不足しています。", field: "canonicalHorseId" });
    }
    if (!evidenceIds.has(runner.resultEvidenceId) ||
        evidenceById.get(runner.resultEvidenceId)?.kind !== "OFFICIAL_RESULT") {
      issues.push({
        code: "PROVENANCE_INCOMPLETE",
        message: `runner(${runner.canonicalHorseId})のResult Evidenceがありません。`,
        canonicalHorseId: runner.canonicalHorseId,
      });
    }
    if (runner.abilityUpdateEligibility === "ELIGIBLE") {
      const required: Array<[string, unknown]> = [
        ["finishPosition", runner.finishPosition],
        ["actualRaceTime", runner.actualRaceTime],
        ["timeGap", runner.timeGap],
        ["final3F", runner.final3F],
        ["carriedWeight", runner.carriedWeight],
      ];
      for (const [field, value] of required) {
        if (value === null || value === undefined) {
          issues.push({
            code: "REQUIRED_FIELD_MISSING",
            message: `Ability更新対象runner(${runner.canonicalHorseId})の${field}が不足しています。`,
            canonicalHorseId: runner.canonicalHorseId,
            field,
          });
        }
      }
    }

    const prior = runner.priorAbility;
    const priorRefsMayBeEmpty = prior.status === "NOT_APPLICABLE";
    issues.push(...validateEvidenceRefs("priorAbility", prior.evidenceIds, evidenceIds, priorRefsMayBeEmpty, runner.canonicalHorseId));
    if (prior.status === "AVAILABLE") {
      if (prior.priorRacesNewestFirst.length === 0 || prior.reasonCode !== null) {
        issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: "AVAILABLE priorAbilityの値が不正です。", canonicalHorseId: runner.canonicalHorseId });
      }
      const priorRaceIds = new Set(prior.priorRacesNewestFirst.map((race) => race.raceId));
      if (prior.evidenceIds.some((id) => {
        const item = evidenceById.get(id);
        return item?.kind !== "PRIOR_RACE_PERFORMANCE" ||
          item.referenceRaceId === null || !priorRaceIds.has(item.referenceRaceId);
      })) {
        issues.push({
          code: "PROVENANCE_INCOMPLETE",
          message: `runner(${runner.canonicalHorseId})のprior raceとEvidence参照が一致しません。`,
          canonicalHorseId: runner.canonicalHorseId,
        });
      }
    } else if (prior.status === "NO_PRIOR") {
      if (prior.priorRacesNewestFirst.length !== 0 || !prior.reasonCode) {
        issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: "NO_PRIOR priorAbilityの形式が不正です。", canonicalHorseId: runner.canonicalHorseId });
      }
    } else if (prior.status === "UNAVAILABLE") {
      issues.push({
        code: "PRIOR_CONTEXT_UNAVAILABLE",
        message: `runner(${runner.canonicalHorseId})の事前能力履歴が取得不能です。NO_PRIORとは区別して拒否します。`,
        canonicalHorseId: runner.canonicalHorseId,
      });
    } else if (runner.started) {
      issues.push({
        code: "INVALID_OBJECTIVE_VALUE",
        message: `出走馬(${runner.canonicalHorseId})のpriorAbilityをNOT_APPLICABLEにはできません。`,
        canonicalHorseId: runner.canonicalHorseId,
      });
    }

    for (const priorRace of prior.priorRacesNewestFirst) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(priorRace.raceDate) || !Number.isFinite(Date.parse(priorRace.raceDate))) {
        issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: "prior raceDateが不正です。", canonicalHorseId: runner.canonicalHorseId });
        continue;
      }
      if (priorRace.raceId === input.race.raceId || Date.parse(priorRace.raceDate) >= Date.parse(input.race.raceDate)) {
        issues.push({
          code: "CROSS_RACE_DATA",
          message: `runner(${runner.canonicalHorseId})のpriorAbilityに対象レース自身または未来のレースが含まれています。`,
          canonicalHorseId: runner.canonicalHorseId,
        });
      }
      if (!Number.isFinite(priorRace.raceScore) || priorRace.raceScore < 0 || priorRace.raceScore > 100) {
        issues.push({ code: "INVALID_OBJECTIVE_VALUE", message: "prior raceScoreが0〜100の範囲外です。", canonicalHorseId: runner.canonicalHorseId });
      }
    }

    issues.push(...validateOptionalValue("bodyWeight", runner.bodyWeight, evidenceIds, runner.canonicalHorseId));
    issues.push(...validateOptionalValue("bodyWeightChange", runner.bodyWeightChange, evidenceIds, runner.canonicalHorseId));
  }

  const benchmarks = input.benchmarks;
  issues.push(...validateOptionalValue("courseTimeBaseline", benchmarks.courseTimeBaseline, evidenceIds));
  issues.push(...validateOptionalValue("courseFinal3FBaseline", benchmarks.courseFinal3FBaseline, evidenceIds));
  issues.push(...validateOptionalValue("sameDayRaceTimes", benchmarks.sameDayRaceTimes, evidenceIds));
  issues.push(...validateOptionalValue("sameDayFinal3F", benchmarks.sameDayFinal3F, evidenceIds));

  if (benchmarks.courseTimeBaseline.status === "AVAILABLE") {
    const value = benchmarks.courseTimeBaseline.value!;
    if (value.racecourse !== input.race.racecourse || value.surface !== input.race.surface ||
        value.distance !== input.race.distance) {
      issues.push({ code: "CROSS_RACE_DATA", message: "courseTimeBaselineのレース条件が対象と一致しません。" });
    }
  }
  if (benchmarks.courseFinal3FBaseline.status === "AVAILABLE") {
    const value = benchmarks.courseFinal3FBaseline.value!;
    if (value.racecourse !== input.race.racecourse || value.surface !== input.race.surface ||
        value.distance !== input.race.distance) {
      issues.push({ code: "CROSS_RACE_DATA", message: "courseFinal3FBaselineのレース条件が対象と一致しません。" });
    }
  }
  for (const row of benchmarks.sameDayRaceTimes.value ?? []) {
    if (row.raceId === input.race.raceId || row.raceDate !== input.race.raceDate ||
        row.racecourse !== input.race.racecourse || row.surface !== input.race.surface) {
      issues.push({ code: "CROSS_RACE_DATA", message: `sameDayRaceTimesに別条件データ(${row.raceId})が混入しています。` });
    }
  }
  for (const row of benchmarks.sameDayFinal3F.value ?? []) {
    if (row.raceId === input.race.raceId || row.raceDate !== input.race.raceDate ||
        row.racecourse !== input.race.racecourse || row.surface !== input.race.surface) {
      issues.push({ code: "CROSS_RACE_DATA", message: `sameDayFinal3Fに別条件データ(${row.raceId})が混入しています。` });
    }
  }

  return issues;
}

/**
 * 正式Resultと独立Objective Dataから、安全なPost-Race入力候補を構築する純粋関数。
 * 引数を変更せず、永続化・スコア計算・Ability更新を一切行わない。
 */
export function buildPostRaceUpdateInputV1(
  result: RaceResultArtifactV2,
  objective: PostRaceObjectiveDataV1,
  builtAt: string,
): BuildPostRaceUpdateInputOutcome {
  const preflightIssues: PostRaceUpdateInputIssue[] = [];
  if (!isCalibrationFinalResult(result)) {
    preflightIssues.push({ code: "RESULT_NOT_FINAL", message: `resultStatus=${result.resultStatus}は正式確定結果ではありません。` });
  }
  if (!(APPROVED_FINAL_RESULT_SOURCES as readonly string[]).includes(result.source)) {
    preflightIssues.push({ code: "INVALID_SOURCE", message: `Result source=${result.source}は正式sourceとして許可されていません。` });
  }
  if (result.race.raceId !== objective.race.raceId) {
    preflightIssues.push({ code: "RACE_ID_MISMATCH", message: "ResultとObjective DataのraceIdが一致しません。" });
  }
  if (result.race.raceDate !== objective.race.raceDate || result.race.raceName !== objective.race.raceName ||
      (result.race.going !== null && result.race.going !== objective.race.going)) {
    preflightIssues.push({ code: "RACE_IDENTITY_MISMATCH", message: "ResultとObjective DataのraceDate/raceName/goingが一致しません。" });
  }
  const resultHorseIds = result.runners.map((runner) => runner.canonicalHorseId);
  const objectiveHorseIds = objective.runners.map((runner) => runner.canonicalHorseId);
  if (!sameStringSet(resultHorseIds, objectiveHorseIds)) {
    preflightIssues.push({ code: "CANONICAL_HORSE_ID_MISMATCH", message: "ResultとObjective DataのcanonicalHorseId集合が一致しません。" });
  }
  if (preflightIssues.length > 0) return { status: "rejected", issues: preflightIssues };

  const resultEvidenceId = `result:${result.artifactId}`;
  const resultEvidence: PostRaceEvidenceV1 = {
    evidenceId: resultEvidenceId,
    kind: "OFFICIAL_RESULT",
    source: result.source,
    sourceIdentifier: result.sourceIdentifier,
    targetRaceId: result.race.raceId,
    referenceRaceId: result.race.raceId,
    availableAt: result.resultAvailableAt,
    retrievedAt: result.retrievedAt,
  };
  const objectiveByHorseId = new Map(objective.runners.map((runner) => [runner.canonicalHorseId, runner]));
  const runners = result.runners.map((runner): PostRaceUpdateRunnerInputV1 => {
    const supplemental = objectiveByHorseId.get(runner.canonicalHorseId)!;
    return {
      raceId: result.race.raceId,
      canonicalHorseId: runner.canonicalHorseId,
      horseName: runner.horseName,
      horseNumber: runner.horseNumber,
      frameNumber: runner.frameNumber,
      finishPosition: runner.finishPosition,
      started: runner.started,
      scratched: runner.scratched,
      excluded: runner.excluded,
      didNotFinish: runner.didNotFinish,
      disqualified: runner.disqualified,
      actualRaceTime: runner.actualRaceTime,
      timeGap: runner.timeGap,
      final3F: runner.final3F,
      final3FRank: runner.final3FRank,
      passingPosition: runner.passingPosition === null
        ? null
        : { ...runner.passingPosition, cornerPositions: [...runner.passingPosition.cornerPositions] },
      carriedWeight: runner.carriedWeight,
      bodyWeight: { ...supplemental.bodyWeight, evidenceIds: [...supplemental.bodyWeight.evidenceIds] },
      bodyWeightChange: { ...supplemental.bodyWeightChange, evidenceIds: [...supplemental.bodyWeightChange.evidenceIds] },
      priorAbility: {
        ...supplemental.priorAbility,
        priorRacesNewestFirst: supplemental.priorAbility.priorRacesNewestFirst.map((race) => ({ ...race })),
        evidenceIds: [...supplemental.priorAbility.evidenceIds],
      },
      abilityUpdateEligibility: resultEligibility(runner),
      resultEvidenceId,
    };
  });

  const content: Omit<PostRaceUpdateInputV1, "inputContentFingerprint"> = {
    schemaVersion: POST_RACE_UPDATE_INPUT_SCHEMA_VERSION,
    inputType: "POST_RACE_UPDATE_INPUT",
    source: "OFFICIAL_RESULT_PLUS_OBJECTIVE_DATA",
    builtAt,
    transformVersion: POST_RACE_UPDATE_INPUT_TRANSFORM_VERSION,
    resultArtifactId: result.artifactId,
    resultContentFingerprint: result.resultContentFingerprint,
    race: { ...objective.race, evidenceIds: [...objective.race.evidenceIds] },
    runners,
    benchmarks: structuredClone(objective.benchmarks),
    evidence: [resultEvidence, ...objective.evidence.map((item) => ({ ...item }))],
  };
  const input: PostRaceUpdateInputV1 = {
    ...content,
    inputContentFingerprint: calculatePostRaceUpdateInputFingerprint(content),
  };
  const issues = gatePostRaceUpdateInputV1(input);
  return issues.length > 0 ? { status: "rejected", issues } : { status: "accepted", input };
}

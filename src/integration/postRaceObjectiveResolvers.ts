import { validPriorProofEnvelope, verifyPriorScoreAsOf, verifyNoPriorAsOf, predictionAsOfReference, type PriorScoreProof, type PriorVerificationContext } from "./priorScoreProvenance";
import { isPriorPerformance } from "../ability/predictionBoundary";
/**
 * Final Result / 既存履歴 / baseline repositoryをPost-Race Contract用の
 * 客観データへ写す純粋resolver。Ability計算・履歴更新・永続化は行わない。
 */
import { findCourseFinal3FBaseline } from "../ability/courseFinal3FBaseline";
import { findCourseTimeBaseline } from "../ability/courseTimeBaseline";
import type { CourseFinal3FBaseline, CourseTimeBaseline, RacePerformance } from "../ability/types";
import type { AdaptedJvLinkFinalResultRunFolder } from "../collector/jvlink/runFolderFinalResultAdapter";
import type { PriorHistoryEntry } from "../collector/types";
import type { RaceResultArtifactV2 } from "./raceResultArtifact";
import type {
  PostRaceBenchmarkContextV1,
  PostRaceEvidenceV1,
  PostRaceObjectiveRaceV1,
  PostRaceObjectiveRunnerV1,
  PriorAbilityContextV1,
} from "./postRaceUpdateInput";

export interface ResolverReadProvenance {
  source: string;
  sourceIdentifier: string;
  availableAt: string;
  retrievedAt: string;
}

export interface ObjectiveResolverIssue {
  code: "REQUIRED_FIELD_MISSING" | "DUPLICATE_HORSE_ID" | "FUTURE_PRIOR" | "PROVENANCE_INCOMPLETE";
  message: string;
  canonicalHorseId?: string;
}

export type ObjectiveRaceMappingOutcome =
  | { status: "accepted"; race: PostRaceObjectiveRaceV1; evidence: PostRaceEvidenceV1[] }
  | { status: "rejected"; issues: ObjectiveResolverIssue[] };

export type ObjectiveRunnerResolutionOutcome =
  | { status: "accepted"; runners: PostRaceObjectiveRunnerV1[]; evidence: PostRaceEvidenceV1[] }
  | { status: "rejected"; issues: ObjectiveResolverIssue[] };

export interface BenchmarkResolutionResult {
  benchmarks: PostRaceBenchmarkContextV1;
  evidence: PostRaceEvidenceV1[];
}

function evidenceIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function queryEvidence(
  evidenceId: string,
  kind: PostRaceEvidenceV1["kind"],
  raceId: string,
  provenance: ResolverReadProvenance,
): PostRaceEvidenceV1 {
  return {
    evidenceId,
    kind,
    source: provenance.source,
    sourceIdentifier: provenance.sourceIdentifier,
    targetRaceId: raceId,
    referenceRaceId: null,
    availableAt: provenance.availableAt,
    retrievedAt: provenance.retrievedAt,
  };
}

/** Adapterのレース条件だけを写す。going欠損や不正値は補完せず拒否する。 */
export function mapFinalResultAdapterToObjectiveRaceV1(
  adapted: AdaptedJvLinkFinalResultRunFolder,
): ObjectiveRaceMappingOutcome {
  if (!adapted.race.raceId || !adapted.race.raceDate || !adapted.race.raceName ||
      !adapted.race.racecourse || adapted.race.distance <= 0 || adapted.race.going === null) {
    return {
      status: "rejected",
      issues: [{ code: "REQUIRED_FIELD_MISSING", message: "Final Result Adapterの必須レース条件が不足しています。" }],
    };
  }
  const evidenceId = `race-meta:${evidenceIdPart(adapted.race.raceId)}`;
  const evidence: PostRaceEvidenceV1 = {
    evidenceId,
    kind: "RACE_METADATA",
    source: "JRA-VAN/JV-Link",
    sourceIdentifier: adapted.sourceIdentifier,
    targetRaceId: adapted.race.raceId,
    referenceRaceId: adapted.race.raceId,
    availableAt: adapted.resultAvailableAt,
    retrievedAt: adapted.retrievedAt,
  };
  return {
    status: "accepted",
    race: {
      ...adapted.race,
      going: adapted.race.going,
      raceNumber: null,
      evidenceIds: [evidenceId],
    },
    evidence: [evidence],
  };
}

function unavailablePrior(reasonCode: string, evidenceId: string): PriorAbilityContextV1 {
  return { status: "UNAVAILABLE", priorRacesNewestFirst: [], reasonCode, evidenceIds: [evidenceId] };
}

function validPriorEvidenceFields(race: RacePerformance): race is RacePerformance & {
  source: string;
  sourceRaceId: string;
  availableAt: string;
} {
  return Boolean(race.source && race.sourceRaceId && race.availableAt && Number.isFinite(Date.parse(race.availableAt)));
}

/** Resultに登録された全馬を保持し、既存履歴をread-onlyで解決する。 */
export function resolveObjectiveRunnersV1(
  result: RaceResultArtifactV2,
  priorHistories: readonly PriorHistoryEntry[],
  readProvenance: ResolverReadProvenance,
  verification?: { context: PriorVerificationContext; proofs: PriorScoreProof[] },
): ObjectiveRunnerResolutionOutcome {
  if (verification && (!Array.isArray(verification.proofs) || !verification.proofs.every(validPriorProofEnvelope))) {
    return { status: "rejected", issues: [{ code: "PROVENANCE_INCOMPLETE", message: "prior証拠のruntime構造が不正です。" }] };
  }
  if (verification && new Set(verification.proofs.map(p => `${p.evidence.canonicalHorseId}/${p.evidence.priorRaceId}`)).size !== verification.proofs.length) {
    return { status: "rejected", issues: [{ code: "PROVENANCE_INCOMPLETE", message: "prior score証拠が重複しています。" }] };
  }
  const duplicateIds = priorHistories.map((entry) => entry.horseId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    return {
      status: "rejected",
      issues: [...new Set(duplicateIds)].map((canonicalHorseId) => ({
        code: "DUPLICATE_HORSE_ID",
        message: `PriorHistoryEntryが重複しています: ${canonicalHorseId}`,
        canonicalHorseId,
      })),
    };
  }
  const priorByHorseId = new Map(priorHistories.map((entry) => [entry.horseId, entry]));
  const evidence: PostRaceEvidenceV1[] = [];
  const runners: PostRaceObjectiveRunnerV1[] = [];

  for (const resultRunner of result.runners) {
    if (!resultRunner.started || resultRunner.scratched || resultRunner.excluded) {
      runners.push({
        canonicalHorseId: resultRunner.canonicalHorseId,
        priorAbility: {
          status: "NOT_APPLICABLE",
          priorRacesNewestFirst: [],
          reasonCode: "RUNNER_DID_NOT_START",
          evidenceIds: [],
        },
        bodyWeight: { status: "NOT_APPLICABLE", value: null, reasonCode: "RUNNER_DID_NOT_START", evidenceIds: [] },
        bodyWeightChange: { status: "NOT_APPLICABLE", value: null, reasonCode: "RUNNER_DID_NOT_START", evidenceIds: [] },
      });
      continue;
    }

    const horseId = resultRunner.canonicalHorseId;
    const queryId = `prior-query:${evidenceIdPart(result.race.raceId)}:${evidenceIdPart(horseId)}`;
    evidence.push(queryEvidence(queryId, "PRIOR_RACE_PERFORMANCE", result.race.raceId, readProvenance));
    const bodyId = `body-query:${evidenceIdPart(result.race.raceId)}:${evidenceIdPart(horseId)}`;
    evidence.push(queryEvidence(bodyId, "BODY_WEIGHT", result.race.raceId, readProvenance));
    const entry = priorByHorseId.get(horseId);
    let priorAbility: PriorAbilityContextV1;

    if (entry === undefined) {
      priorAbility = unavailablePrior("PRIOR_HISTORY_NOT_FOUND", queryId);
    } else if (entry.status !== "available") {
      priorAbility = unavailablePrior(`PRIOR_HISTORY_${entry.status.toUpperCase()}`, queryId);
    } else {
      const invalidRace = entry.races.find((race) =>
        race.raceId === result.race.raceId || race.raceDate >= result.race.raceDate);
      if (invalidRace !== undefined) {
        return {
          status: "rejected",
          issues: [{
            code: "FUTURE_PRIOR",
            message: `対象レース自身・同日・未来の履歴はpriorに使用できません: ${invalidRace.raceId}`,
            canonicalHorseId: horseId,
          }],
        };
      }
      if (entry.races.length === 0) {
        priorAbility = verification && verifyNoPriorAsOf({ history: entry, context: verification.context }, { targetRaceId: result.race.raceId, targetRaceDate: result.race.raceDate, canonicalHorseId: horseId })
          ? { status: "NO_PRIOR", priorRacesNewestFirst: [], reasonCode: "NO_PRIOR_CONFIRMED", evidenceIds: [queryId], noPriorProof: { history: structuredClone(entry), context: structuredClone(verification!.context) } }
          : unavailablePrior("EMPTY_HISTORY_WITHOUT_ZERO_CAREER_COUNT", queryId);
      } else if (entry.races.some((race) => !validPriorEvidenceFields(race))) {
        priorAbility = unavailablePrior("PRIOR_RACE_PROVENANCE_INCOMPLETE", queryId);
      } else {
        const races = [...entry.races].sort(
          (left, right) => right.raceDate.localeCompare(left.raceDate) || left.raceId.localeCompare(right.raceId),
        );
        const proofs = races.map(race => verification?.proofs.find(p => p.evidence.canonicalHorseId === horseId && p.evidence.priorRaceId === race.raceId));
        let valid = false;
        try {
          const p = predictionAsOfReference(verification!.context.predictionArtifact);
          valid = entry.provenance.targetRaceId === result.race.raceId && entry.provenance.targetAsOf === p.predictionCutoffAt &&
            races.every((race, index) => isPriorPerformance(race, { raceId: result.race.raceId, raceDate: result.race.raceDate }, p.predictionCutoffAt) &&
              proofs[index] && proofs[index]!.evidence.priorRaceDate === race.raceDate && proofs[index]!.context.predictionArtifact === verification!.context.predictionArtifact &&
              verifyPriorScoreAsOf(proofs[index]!.evidence, proofs[index]!.context,
                { targetRaceId: result.race.raceId, targetRaceDate: result.race.raceDate, canonicalHorseId: horseId }).available);
        } catch { valid = false; }
        if (!valid) {
          priorAbility = unavailablePrior("PRIOR_AS_OF_UNVERIFIED", queryId);
        } else {
          const priorEvidence = races.map((race) => {
            const evidenceId = `prior:${evidenceIdPart(horseId)}:${evidenceIdPart(race.raceId)}`;
            evidence.push({
              evidenceId,
              kind: "PRIOR_RACE_PERFORMANCE",
              source: race.source as string,
              sourceIdentifier: race.sourceRaceId as string,
              targetRaceId: result.race.raceId,
              referenceRaceId: race.raceId,
              availableAt: race.availableAt as string,
              retrievedAt: race.importedAt && Number.isFinite(Date.parse(race.importedAt))
                ? race.importedAt
                : entry.provenance.retrievedAt,
            });
            return evidenceId;
          });
          priorAbility = {
            status: "AVAILABLE",
            priorRacesNewestFirst: races.map((race, index) => ({
              raceId: race.raceId,
              raceDate: race.raceDate,
              raceScore: proofs[index]!.evidence.score!,
            })),
            reasonCode: null,
            scoreProofs: structuredClone(proofs as PriorScoreProof[]),
            evidenceIds: priorEvidence,
          };
        }
      }
    }

    runners.push({
      canonicalHorseId: horseId,
      priorAbility,
      bodyWeight: { status: "UNAVAILABLE", value: null, reasonCode: "NOT_PRESENT_IN_FINAL_RESULT_ADAPTER", evidenceIds: [bodyId] },
      bodyWeightChange: { status: "UNAVAILABLE", value: null, reasonCode: "NOT_PRESENT_IN_FINAL_RESULT_ADAPTER", evidenceIds: [bodyId] },
    });
  }
  return { status: "accepted", runners, evidence };
}

/** 既存baseline recordの有無だけを解決する。中立値等のfallback値は生成しない。 */
export function resolveBenchmarkContextV1(
  race: PostRaceObjectiveRaceV1,
  courseTimeBaselines: readonly CourseTimeBaseline[],
  courseFinal3FBaselines: readonly CourseFinal3FBaseline[],
  readProvenance: ResolverReadProvenance,
): BenchmarkResolutionResult {
  const timeId = `time-baseline:${evidenceIdPart(race.raceId)}`;
  const final3FId = `final3f-baseline:${evidenceIdPart(race.raceId)}`;
  const sameDayId = `same-day-query:${evidenceIdPart(race.raceId)}`;
  const timeBaseline = findCourseTimeBaseline(
    [...courseTimeBaselines], race.racecourse, race.surface, race.distance, race.going,
  );
  const final3FBaseline = findCourseFinal3FBaseline(
    [...courseFinal3FBaselines], race.racecourse, race.surface, race.distance, race.going,
  );
  const timeProvenance = timeBaseline === undefined ? readProvenance : {
    ...readProvenance,
    source: timeBaseline.source,
    sourceIdentifier: `${readProvenance.sourceIdentifier};kind=course-time;match=exact`,
    availableAt: timeBaseline.availableAt ?? readProvenance.availableAt,
  };
  const final3FProvenance = final3FBaseline === undefined ? readProvenance : {
    ...readProvenance,
    source: final3FBaseline.source,
    sourceIdentifier: `${readProvenance.sourceIdentifier};kind=course-final3f;match=exact`,
    availableAt: final3FBaseline.availableAt ?? readProvenance.availableAt,
  };
  return {
    benchmarks: {
      courseTimeBaseline: timeBaseline === undefined
        ? { status: "UNAVAILABLE", value: null, reasonCode: "NO_MATCHING_BASELINE", evidenceIds: [timeId] }
        : { status: "AVAILABLE", value: { ...timeBaseline }, reasonCode: null, evidenceIds: [timeId] },
      courseFinal3FBaseline: final3FBaseline === undefined
        ? { status: "UNAVAILABLE", value: null, reasonCode: "NO_MATCHING_BASELINE", evidenceIds: [final3FId] }
        : { status: "AVAILABLE", value: { ...final3FBaseline }, reasonCode: null, evidenceIds: [final3FId] },
      sameDayRaceTimes: {
        status: "UNAVAILABLE", value: null, reasonCode: "SAME_DAY_RESULTS_NOT_SUPPLIED", evidenceIds: [sameDayId],
      },
      sameDayFinal3F: {
        status: "UNAVAILABLE", value: null, reasonCode: "SAME_DAY_RESULTS_NOT_SUPPLIED", evidenceIds: [sameDayId],
      },
    },
    evidence: [
      queryEvidence(timeId, "COURSE_TIME_BASELINE", race.raceId, timeProvenance),
      queryEvidence(final3FId, "COURSE_FINAL3F_BASELINE", race.raceId, final3FProvenance),
      queryEvidence(sameDayId, "SAME_DAY_RESULT", race.raceId, readProvenance),
    ],
  };
}

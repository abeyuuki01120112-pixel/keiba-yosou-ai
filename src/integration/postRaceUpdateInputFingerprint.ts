import { fnv1a } from "../ability/datasetVersion";
import { canonicalJson } from "./betTypes";
import type { PostRaceUpdateInputV1 } from "./postRaceUpdateInput";

type FingerprintableInput = Omit<PostRaceUpdateInputV1, "inputContentFingerprint"> |
  PostRaceUpdateInputV1;

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * builtAtは処理時刻であって入力内容ではないためfingerprint対象外とする。
 * 集合として扱うrunner/evidenceとEvidence参照は順序を正規化する。
 */
export function postRaceUpdateInputFingerprintPayload(input: FingerprintableInput): unknown {
  const { builtAt: _builtAt, ...withPossibleFingerprint } = input;
  const { inputContentFingerprint: _fingerprint, ...content } = withPossibleFingerprint as
    typeof withPossibleFingerprint & { inputContentFingerprint?: string };
  return {
    ...content,
    race: { ...content.race, evidenceIds: sortedStrings(content.race.evidenceIds) },
    runners: [...content.runners]
      .map((runner) => ({
        ...runner,
        bodyWeight: { ...runner.bodyWeight, evidenceIds: sortedStrings(runner.bodyWeight.evidenceIds) },
        bodyWeightChange: {
          ...runner.bodyWeightChange,
          evidenceIds: sortedStrings(runner.bodyWeightChange.evidenceIds),
        },
        priorAbility: {
          ...runner.priorAbility,
          evidenceIds: sortedStrings(runner.priorAbility.evidenceIds),
          priorRacesNewestFirst: [...runner.priorAbility.priorRacesNewestFirst].sort(
            (left, right) => right.raceDate.localeCompare(left.raceDate) || left.raceId.localeCompare(right.raceId),
          ),
        },
      }))
      .sort((left, right) => left.canonicalHorseId.localeCompare(right.canonicalHorseId)),
    benchmarks: {
      courseTimeBaseline: {
        ...content.benchmarks.courseTimeBaseline,
        evidenceIds: sortedStrings(content.benchmarks.courseTimeBaseline.evidenceIds),
      },
      courseFinal3FBaseline: {
        ...content.benchmarks.courseFinal3FBaseline,
        evidenceIds: sortedStrings(content.benchmarks.courseFinal3FBaseline.evidenceIds),
      },
      sameDayRaceTimes: {
        ...content.benchmarks.sameDayRaceTimes,
        evidenceIds: sortedStrings(content.benchmarks.sameDayRaceTimes.evidenceIds),
        value: content.benchmarks.sameDayRaceTimes.value === null
          ? null
          : [...content.benchmarks.sameDayRaceTimes.value].sort((a, b) => a.raceId.localeCompare(b.raceId)),
      },
      sameDayFinal3F: {
        ...content.benchmarks.sameDayFinal3F,
        evidenceIds: sortedStrings(content.benchmarks.sameDayFinal3F.evidenceIds),
        value: content.benchmarks.sameDayFinal3F.value === null
          ? null
          : [...content.benchmarks.sameDayFinal3F.value].sort((a, b) => a.raceId.localeCompare(b.raceId)),
      },
    },
    evidence: [...content.evidence].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
  };
}

export function calculatePostRaceUpdateInputFingerprint(input: FingerprintableInput): string {
  return `pruiv1-${fnv1a(canonicalJson(postRaceUpdateInputFingerprintPayload(input)))}`;
}

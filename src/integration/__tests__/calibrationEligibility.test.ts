import { describe, expect, it } from "vitest";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import { runPredictionPipelineFromFormalSnapshot } from "../formalSnapshotPipeline";
import { buildRacePredictionArtifactV2 } from "../racePredictionArtifact";
import { buildRaceResultArtifact, type RaceResultArtifactRunner } from "../raceResultArtifact";
import { evaluateCalibrationEligibility } from "../calibrationEligibility";

const frozen = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];

function winOdds(): OddsSnapshotEntry[] {
  return frozen.runners.map((runner, index) => ({
    raceId: frozen.raceId, horseId: runner.horseId, observedAt: "2026-08-28T03:00:00Z",
    availableAt: "2026-08-28T03:00:00Z", odds: 1 + index / 10, market: "win",
    source: "eligibility test odds", sourceIdentifier: `win-${runner.horseId}`,
  }));
}

function predictionArtifact() {
  const prediction = runPredictionPipelineFromFormalSnapshot(frozen, { odds: winOdds() });
  return buildRacePredictionArtifactV2(prediction, {
    generationMode: "HISTORICAL_REPLAY",
    artifactCreatedAt: "2026-09-08T00:00:00Z",
  });
}

/** 予測11頭と同じcanonicalHorseId集合を持つ、テスト専用の合成Result Artifact。 */
function matchingResultArtifact(overrides: {
  runners?: RaceResultArtifactRunner[];
  resultStatus?: "PROVISIONAL" | "FINAL" | "CORRECTED";
} = {}) {
  const resultStatus = overrides.resultStatus ?? "FINAL";
  const runners: RaceResultArtifactRunner[] = overrides.runners ?? frozen.runners.map((r, index) => ({
    canonicalHorseId: r.horseId,
    horseName: r.horseName,
    horseNumber: r.horseNumber,
    frameNumber: r.frame,
    resultStatus,
    finishPosition: index + 1,
    started: true,
    scratched: false,
    excluded: false,
    didNotFinish: false,
    disqualified: false,
  }));
  return buildRaceResultArtifact({
    resultStatus,
    resultVersion: 1,
    resultAvailableAt: "2026-08-30T15:30:00+09:00",
    retrievedAt: "2026-08-30T16:00:00+09:00",
    source: "eligibility-test-fixture（実在の公式結果ではない、eligibility判定テスト専用の合成データ）",
    sourceIdentifier: "eligibility-test-fixture-001",
    race: {
      raceId: frozen.raceId,
      raceDate: frozen.raceDate,
      raceName: "テスト用合成レース結果",
      scheduledStartTime: frozen.scheduledStartTime,
      officialStarterCount: runners.length,
      resultEntryCount: runners.length,
    },
    runners,
  });
}

describe("Calibration Eligibility V1", () => {
  it("有効なPrediction+Resultの組はeligible:trueになる", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const evaluated = evaluateCalibrationEligibility(prediction, result);

    expect(evaluated.eligible).toBe(true);
    expect(evaluated.hardFailures).toEqual([]);
    expect(evaluated.join.ok).toBe(true);
  });

  it("PROVISIONAL resultはRESULT_STATUS_NOT_FINALでeligible:falseになる", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact({ resultStatus: "PROVISIONAL" });
    const evaluated = evaluateCalibrationEligibility(prediction, result);

    expect(evaluated.eligible).toBe(false);
    expect(evaluated.hardFailures.some((f) => f.code === "RESULT_STATUS_NOT_FINAL")).toBe(true);
  });

  it("cutoff後取消によるpopulation不一致はPREDICTION_POPULATION_VS_STARTER_MISMATCHでeligible:falseになる", () => {
    const prediction = predictionArtifact();
    const runners: RaceResultArtifactRunner[] = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId, horseName: r.horseName, horseNumber: r.horseNumber, frameNumber: r.frame,
      resultStatus: "FINAL" as const,
      finishPosition: index === 0 ? null : index + 1,
      started: index !== 0, scratched: index === 0, excluded: false,
      didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const evaluated = evaluateCalibrationEligibility(prediction, result);

    expect(evaluated.eligible).toBe(false);
    expect(evaluated.hardFailures.some((f) => f.code === "PREDICTION_POPULATION_VS_STARTER_MISMATCH")).toBe(true);
  });

  it("同着（dead heat）はWIN_LABEL_NOT_UNIQUEでeligible:falseになる（V1はCalibration対象外）", () => {
    const prediction = predictionArtifact();
    const runners: RaceResultArtifactRunner[] = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId, horseName: r.horseName, horseNumber: r.horseNumber, frameNumber: r.frame,
      resultStatus: "FINAL" as const,
      finishPosition: index < 2 ? 1 : index + 1,
      started: true, scratched: false, excluded: false, didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const evaluated = evaluateCalibrationEligibility(prediction, result);

    expect(evaluated.eligible).toBe(false);
    expect(evaluated.hardFailures.some((f) => f.code === "WIN_LABEL_NOT_UNIQUE")).toBe(true);
  });

  it("raceId不一致はRACE_ID_MISMATCHでeligible:falseになる", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const mismatched = { ...result, race: { ...result.race, raceId: "JRA-DIFFERENT-RACE" } };
    const evaluated = evaluateCalibrationEligibility(prediction, mismatched);

    expect(evaluated.eligible).toBe(false);
    expect(evaluated.hardFailures.some((f) => f.code === "RACE_ID_MISMATCH")).toBe(true);
  });

  it("horseWarningsで渡した警告はwarningsへそのまま転記され、eligibleには影響しない", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const horseId = frozen.runners[0].horseId;
    const evaluated = evaluateCalibrationEligibility(prediction, result, {
      horseWarnings: {
        [horseId]: ["memberLevel fallback（Selected-5/Scorable-4）", "historyConfidence: medium"],
      },
    });

    expect(evaluated.eligible).toBe(true);
    expect(evaluated.hardFailures).toEqual([]);
    expect(evaluated.warnings).toHaveLength(2);
    expect(evaluated.warnings.every((w) => w.canonicalHorseId === horseId)).toBe(true);
  });

  it("Prediction/ResultのartifactIdが同一（別Artifactでない）場合はNOT_SEPARATE_ARTIFACTSを検知する", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const contaminated = { ...result, artifactId: prediction.artifactId };
    const evaluated = evaluateCalibrationEligibility(prediction, contaminated);

    expect(evaluated.eligible).toBe(false);
    expect(evaluated.hardFailures.some((f) => f.code === "NOT_SEPARATE_ARTIFACTS")).toBe(true);
  });
});

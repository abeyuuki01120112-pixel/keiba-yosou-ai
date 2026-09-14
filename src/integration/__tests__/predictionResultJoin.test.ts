import { describe, expect, it } from "vitest";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import { runPredictionPipelineFromFormalSnapshot } from "../formalSnapshotPipeline";
import { buildRacePredictionArtifactV2 } from "../racePredictionArtifact";
import {
  buildRaceResultArtifact,
  buildRaceResultArtifactV2,
  type RaceResultArtifactRunner,
} from "../raceResultArtifact";
import { joinPredictionAndResult } from "../predictionResultJoin";

const frozen = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];

function winOdds(): OddsSnapshotEntry[] {
  return frozen.runners.map((runner, index) => ({
    raceId: frozen.raceId, horseId: runner.horseId, observedAt: "2026-08-28T03:00:00Z",
    availableAt: "2026-08-28T03:00:00Z", odds: 1 + index / 10, market: "win",
    source: "join test odds", sourceIdentifier: `win-${runner.horseId}`,
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
function matchingResultArtifact(overrides: { runners?: RaceResultArtifactRunner[] } = {}) {
  const runners: RaceResultArtifactRunner[] = overrides.runners ?? frozen.runners.map((r, index) => ({
    canonicalHorseId: r.horseId,
    horseName: r.horseName,
    horseNumber: r.horseNumber,
    frameNumber: r.frame,
    resultStatus: "FINAL" as const,
    finishPosition: index + 1,
    started: true,
    scratched: false,
    excluded: false,
    didNotFinish: false,
    disqualified: false,
  }));
  return buildRaceResultArtifact({
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-08-30T15:30:00+09:00",
    retrievedAt: "2026-08-30T16:00:00+09:00",
    source: "join-test-fixture（実在の公式結果ではない、join機構のテスト専用の合成データ）",
    sourceIdentifier: "join-test-fixture-001",
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

describe("Prediction/Result Join", () => {
  it("raceId・canonicalHorseId集合が一致するペアは正常にjoinできる", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const joined = joinPredictionAndResult(prediction, result);

    expect(joined.ok).toBe(true);
    expect(joined.issues).toEqual([]);
    expect(joined.runners).toHaveLength(11);
    expect(joined.runners.filter((r) => r.isWinner)).toHaveLength(1);
  });

  it("raceId不一致を検知する", () => {
    const prediction = predictionArtifact();
    const result = matchingResultArtifact();
    const mismatched = { ...result, race: { ...result.race, raceId: "JRA-DIFFERENT-RACE" } };
    const joined = joinPredictionAndResult(prediction, mismatched);

    expect(joined.ok).toBe(false);
    expect(joined.issues.some((i) => i.code === "RACE_ID_MISMATCH")).toBe(true);
  });

  it("canonicalHorseId集合の不一致を検知する（horseNameが一致していてもjoin失敗）", () => {
    const prediction = predictionArtifact();
    const runners = frozen.runners.map((r, index) => ({
      canonicalHorseId: index === 0 ? "different-horse-id" : r.horseId,
      // horseNameはあえて元のまま一致させる（horseNameだけではjoinしないことの検証）。
      horseName: r.horseName,
      horseNumber: r.horseNumber,
      frameNumber: r.frame,
      resultStatus: "FINAL" as const,
      finishPosition: index + 1,
      started: true, scratched: false, excluded: false, didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const joined = joinPredictionAndResult(prediction, result);

    expect(joined.ok).toBe(false);
    expect(joined.issues.some((i) => i.code === "CANONICAL_HORSE_ID_SET_MISMATCH")).toBe(true);
    // horseNameが一致していても、canonicalHorseIdが違えば実際にjoinされたrunnerには含まれない。
    expect(joined.runners.some((r) => r.canonicalHorseId === "different-horse-id")).toBe(false);
  });

  it("runner集合（population）不一致（cutoff後取消の疑い）を検知する", () => {
    const prediction = predictionArtifact();
    // Result側で1頭をscratchedにし、predictionでは有効のままにする（population不一致）。
    const runners = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId, horseName: r.horseName, horseNumber: r.horseNumber, frameNumber: r.frame,
      resultStatus: "FINAL" as const,
      finishPosition: index === 0 ? null : index + 1,
      started: index !== 0, scratched: index === 0, excluded: false,
      didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const joined = joinPredictionAndResult(prediction, result);

    expect(joined.ok).toBe(false);
    expect(joined.issues.some((i) => i.code === "PREDICTION_POPULATION_VS_STARTER_MISMATCH")).toBe(true);
  });

  it("horseNameが不一致でも、canonicalHorseIdが一致していればjoinは成立し、監査フラグにのみ反映する", () => {
    const prediction = predictionArtifact();
    const runners = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId,
      horseName: index === 0 ? "表記違いの馬名" : r.horseName,
      horseNumber: r.horseNumber, frameNumber: r.frame, resultStatus: "FINAL" as const,
      finishPosition: index + 1, started: true, scratched: false, excluded: false,
      didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const joined = joinPredictionAndResult(prediction, result);

    expect(joined.ok).toBe(true);
    const mismatchedNameRunner = joined.runners.find((r) => r.resultHorseName === "表記違いの馬名")!;
    expect(mismatchedNameRunner.horseNameMatchesForAudit).toBe(false);
  });

  it("finishPosition=1が複数（同着）ならwinner一意性違反を検知する", () => {
    const prediction = predictionArtifact();
    const runners = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId, horseName: r.horseName, horseNumber: r.horseNumber, frameNumber: r.frame,
      resultStatus: "FINAL" as const,
      finishPosition: index < 2 ? 1 : index + 1,
      started: true, scratched: false, excluded: false, didNotFinish: false, disqualified: false,
    }));
    const result = matchingResultArtifact({ runners });
    const joined = joinPredictionAndResult(prediction, result);

    expect(joined.ok).toBe(false);
    expect(joined.issues.some((i) => i.code === "WINNER_NOT_UNIQUE")).toBe(true);
    expect(joined.runners.every((r) => !r.isWinner)).toBe(true);
  });

  it("PROVISIONAL resultはRESULT_NOT_FINALとして検知する", () => {
    const prediction = predictionArtifact();
    const runners = frozen.runners.map((r, index) => ({
      canonicalHorseId: r.horseId, horseName: r.horseName, horseNumber: r.horseNumber, frameNumber: r.frame,
      resultStatus: "PROVISIONAL" as const, finishPosition: index + 1, started: true,
      scratched: false, excluded: false, didNotFinish: false, disqualified: false,
    }));
    // matchingResultArtifact()は既定でFINAL runnersを検証するため、race/source等のベース値取得にのみ使う。
    const base = matchingResultArtifact();
    const provisionalResult = buildRaceResultArtifact({
      resultStatus: "PROVISIONAL", resultVersion: 1,
      resultAvailableAt: base.resultAvailableAt, retrievedAt: base.retrievedAt,
      source: base.source, sourceIdentifier: base.sourceIdentifier,
      race: base.race, runners,
    });
    const joined = joinPredictionAndResult(prediction, provisionalResult);

    expect(joined.ok).toBe(false);
    expect(joined.issues.some((i) => i.code === "RESULT_NOT_FINAL")).toBe(true);
  });

  it("K. Result Artifact v2（Post-Race Pipeline V1・Phase 1）も既存joinPredictionAndResult()をそのまま再利用できる", () => {
    const prediction = predictionArtifact();
    const base = matchingResultArtifact();
    const v2Result = buildRaceResultArtifactV2({
      resultStatus: "FINAL",
      resultVersion: 1,
      resultAvailableAt: base.resultAvailableAt,
      retrievedAt: base.retrievedAt,
      source: base.source,
      sourceIdentifier: base.sourceIdentifier,
      race: { ...base.race, going: "良" },
      runners: base.runners.map((r) => ({
        ...r,
        actualRaceTime: null, timeGap: null, final3F: null, final3FRank: null,
        passingPosition: null, carriedWeight: null,
      })),
    });

    const joined = joinPredictionAndResult(prediction, v2Result);
    expect(joined.ok).toBe(true);
    expect(joined.runners).toHaveLength(11);
    expect(joined.runners.filter((r) => r.isWinner)).toHaveLength(1);
  });
});

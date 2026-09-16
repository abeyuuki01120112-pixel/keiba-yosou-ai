import { describe, expect, it } from "vitest";
import {
  buildPostRaceUpdateInputV1,
  type PostRaceEvidenceV1,
  type PostRaceObjectiveDataV1,
} from "../postRaceUpdateInput";
import { buildRaceResultArtifactV2, type BuildRaceResultArtifactV2Input } from "../raceResultArtifact";

const raceId = "JRA-20260913-NAKAYAMA-11";
const builtAt = "2026-09-13T17:00:00+09:00";

function resultInput(): BuildRaceResultArtifactV2Input {
  return {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: "2026-09-13T16:05:00+09:00",
    source: "JV_LINK",
    sourceIdentifier: "jvlink-run:fixture",
    supersedesArtifactId: null,
    race: {
      raceId,
      raceDate: "2026-09-13",
      raceName: "セントライト記念",
      scheduledStartTime: null,
      officialStarterCount: 2,
      resultEntryCount: 2,
      going: "良",
    },
    runners: [1, 2].map((number) => ({
      canonicalHorseId: `202300000${number}`,
      horseName: `HORSE-${number}`,
      horseNumber: number,
      frameNumber: number,
      resultStatus: "FINAL" as const,
      finishPosition: number,
      started: true,
      scratched: false,
      excluded: false,
      didNotFinish: false,
      disqualified: false,
      actualRaceTime: 132 + number / 10,
      timeGap: number === 1 ? 0 : 0.1,
      final3F: 34 + number / 10,
      final3FRank: number,
      passingPosition: { cornerPositions: [3, 3, number], fieldSize: 2, source: "JV_LINK", isReliable: true },
      carriedWeight: 56 + number,
    })),
  };
}

function evidence(
  evidenceId: string,
  kind: PostRaceEvidenceV1["kind"],
  referenceRaceId: string | null = raceId,
): PostRaceEvidenceV1 {
  return {
    evidenceId,
    kind,
    source: kind === "PREDICTION_ARTIFACT" ? "PREDICTION_ARTIFACT" : "JV_LINK_OR_ABILITY_REPOSITORY",
    sourceIdentifier: `${kind}:${evidenceId}`,
    targetRaceId: raceId,
    referenceRaceId,
    availableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: "2026-09-13T16:10:00+09:00",
  };
}

function unavailable(reasonCode: string, evidenceId: string) {
  return { status: "UNAVAILABLE" as const, value: null, reasonCode, evidenceIds: [evidenceId] };
}

function objective(): PostRaceObjectiveDataV1 {
  return {
    race: {
      raceId,
      raceDate: "2026-09-13",
      raceName: "セントライト記念",
      racecourse: "中山",
      surface: "turf",
      distance: 2200,
      going: "良",
      raceNumber: 11,
      evidenceIds: ["race-meta"],
    },
    runners: [
      {
        canonicalHorseId: "2023000001",
        priorAbility: {
          status: "AVAILABLE",
          priorRacesNewestFirst: [{ raceId: "JRA-20260801-NIIGATA-10", raceDate: "2026-08-01", raceScore: 72.4 }],
          reasonCode: null,
          evidenceIds: ["prior-1"],
        },
        bodyWeight: unavailable("NOT_COLLECTED", "body-query"),
        bodyWeightChange: unavailable("NOT_COLLECTED", "body-query"),
      },
      {
        canonicalHorseId: "2023000002",
        priorAbility: {
          status: "NO_PRIOR",
          priorRacesNewestFirst: [],
          reasonCode: "NO_PRIOR_CONFIRMED",
          evidenceIds: ["prior-2"],
        },
        bodyWeight: unavailable("NOT_COLLECTED", "body-query"),
        bodyWeightChange: unavailable("NOT_COLLECTED", "body-query"),
      },
    ],
    benchmarks: {
      courseTimeBaseline: unavailable("NO_MATCHING_BASELINE", "time-baseline-query"),
      courseFinal3FBaseline: unavailable("NO_MATCHING_BASELINE", "final3f-baseline-query"),
      sameDayRaceTimes: unavailable("NOT_COLLECTED", "same-day-query"),
      sameDayFinal3F: unavailable("NOT_COLLECTED", "same-day-query"),
    },
    evidence: [
      evidence("race-meta", "RACE_METADATA"),
      evidence("prior-1", "PRIOR_RACE_PERFORMANCE", "JRA-20260801-NIIGATA-10"),
      evidence("prior-2", "PRIOR_RACE_PERFORMANCE", null),
      evidence("body-query", "BODY_WEIGHT"),
      evidence("time-baseline-query", "COURSE_TIME_BASELINE"),
      evidence("final3f-baseline-query", "COURSE_FINAL3F_BASELINE"),
      evidence("same-day-query", "SAME_DAY_RESULT"),
    ],
  };
}

function build(resultOverrides?: (input: BuildRaceResultArtifactV2Input) => void,
  objectiveOverrides?: (input: PostRaceObjectiveDataV1) => void) {
  const rawResult = resultInput();
  resultOverrides?.(rawResult);
  const supplemental = objective();
  objectiveOverrides?.(supplemental);
  return buildPostRaceUpdateInputV1(buildRaceResultArtifactV2(rawResult), supplemental, builtAt);
}

describe("Post-Race Update Input Contract V1", () => {
  it("純粋変換としてResult/Objectve引数を変更しない", () => {
    const rawResult = resultInput();
    const result = buildRaceResultArtifactV2(rawResult);
    const supplemental = objective();
    const resultBefore = structuredClone(result);
    const supplementalBefore = structuredClone(supplemental);
    const outcome = buildPostRaceUpdateInputV1(result, supplemental, builtAt);
    expect(outcome.status).toBe("accepted");
    expect(result).toEqual(resultBefore);
    expect(supplemental).toEqual(supplementalBefore);
  });

  it("正式Resultから入力候補を構築しraceId/canonicalHorseId/provenanceを維持する", () => {
    const outcome = build();
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    expect(outcome.input.race.raceId).toBe(raceId);
    expect(outcome.input.runners.map((runner) => runner.canonicalHorseId)).toEqual(["2023000001", "2023000002"]);
    expect(outcome.input.runners.every((runner) => runner.resultEvidenceId.startsWith("result:"))).toBe(true);
    expect(outcome.input.evidence.some((item) => item.kind === "OFFICIAL_RESULT")).toBe(true);
    expect(outcome.input.resultContentFingerprint).toBeTruthy();
  });

  it("passingPosition等のoptional欠損、bodyWeight・benchmarkのUNAVAILABLE、NO_PRIORを許容する", () => {
    const outcome = build(
      (data) => {
        data.runners[0].passingPosition = null;
        data.runners[0].final3FRank = null;
      },
      (data) => { data.race.raceNumber = null; },
    );
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") throw new Error("unreachable");
    expect(outcome.input.runners[1].priorAbility.status).toBe("NO_PRIOR");
    expect(outcome.input.runners[0].passingPosition).toBeNull();
    expect(outcome.input.runners[0].bodyWeight.status).toBe("UNAVAILABLE");
    expect(outcome.input.benchmarks.courseTimeBaseline.status).toBe("UNAVAILABLE");
  });

  it("raceId不一致を拒否する", () => {
    const outcome = build(undefined, (data) => { data.race.raceId = "JRA-20260913-HANSHIN-11"; });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "RACE_ID_MISMATCH")).toBe(true);
  });

  it("canonicalHorseId集合不一致を拒否する", () => {
    const outcome = build(undefined, (data) => { data.runners[1].canonicalHorseId = "DIFFERENT"; });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "CANONICAL_HORSE_ID_MISMATCH")).toBe(true);
  });

  it("Ability更新対象の必須実測値欠損を拒否する", () => {
    const outcome = build((data) => { data.runners[0].actualRaceTime = null; });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues).toContainEqual(expect.objectContaining({ code: "REQUIRED_FIELD_MISSING", field: "actualRaceTime" }));
  });

  it("正式でないResult sourceを拒否する", () => {
    const outcome = build((data) => { data.source = "MANUAL_GUESS"; });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "INVALID_SOURCE")).toBe(true);
  });

  it("provenance不足を拒否する", () => {
    const outcome = build(undefined, (data) => { data.evidence[0].sourceIdentifier = ""; });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "PROVENANCE_INCOMPLETE")).toBe(true);
  });

  it("別レース・未来レースのprior data混入を拒否する", () => {
    const outcome = build(undefined, (data) => {
      data.runners[0].priorAbility.priorRacesNewestFirst[0] = {
        raceId,
        raceDate: "2026-09-13",
        raceScore: 99,
      };
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "CROSS_RACE_DATA")).toBe(true);
  });

  it("Prediction Artifact由来Evidenceの誤投入を拒否する", () => {
    const outcome = build(undefined, (data) => {
      data.evidence[0] = evidence("race-meta", "PREDICTION_ARTIFACT");
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "PREDICTION_DATA_FORBIDDEN")).toBe(true);
  });

  it("取得不能と確認済みNO_PRIORを区別し、UNAVAILABLE prior contextを拒否する", () => {
    const outcome = build(undefined, (data) => {
      data.runners[1].priorAbility = {
        status: "UNAVAILABLE",
        priorRacesNewestFirst: [],
        reasonCode: "COLLECTION_FAILED",
        evidenceIds: ["prior-2"],
      };
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("unreachable");
    expect(outcome.issues.some((issue) => issue.code === "PRIOR_CONTEXT_UNAVAILABLE")).toBe(true);
  });
});

import { scoreProofFixture, predictionFixture } from "./priorScoreFixture";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CourseFinal3FBaseline, CourseTimeBaseline, RacePerformance } from "../../ability/types";
import { adaptJvLinkFinalResultRunFolder, type AdaptedJvLinkFinalResultRunFolder } from "../../collector/jvlink/runFolderFinalResultAdapter";
import { loadJvLinkRunFolder } from "../../collector/jvlink/runFolderLoader";
import type { PriorHistoryEntry, SourceProvenance } from "../../collector/types";
import { importJvLinkFinalResult } from "../jvLinkFinalResultImport";
import {
  mapFinalResultAdapterToObjectiveRaceV1,
  resolveBenchmarkContextV1,
  resolveObjectiveRunnersV1,
  type ResolverReadProvenance,
} from "../postRaceObjectiveResolvers";
import { buildPostRaceUpdateInputV1, type PostRaceObjectiveDataV1 } from "../postRaceUpdateInput";
import { calculatePostRaceUpdateInputFingerprint } from "../postRaceUpdateInputFingerprint";
import {
  deserializePostRaceUpdateInputV1,
  PostRaceUpdateInputSerializationError,
  serializePostRaceUpdateInputV1,
} from "../postRaceUpdateInputSerialization";
import { buildRaceResultArtifactV2, type BuildRaceResultArtifactV2Input, type RaceResultArtifactV2 } from "../raceResultArtifact";

const raceId = "JRA-20260913-NAKAYAMA-11";
const horseIds = ["2022000001", "2022000002", "2022000003"];
const verification = { context: { predictionArtifact: predictionFixture(), dependencies: [] }, proofs: [scoreProofFixture()] };
const resolvedAt = "2026-09-13T16:30:00+09:00";
const resolverProvenance: ResolverReadProvenance = {
  source: "MAC_OBJECTIVE_REPOSITORY",
  sourceIdentifier: "fixture-objective-repository-v1",
  availableAt: "2026-09-13T16:00:00+09:00",
  retrievedAt: resolvedAt,
};

function adaptedFixture(going: string | null = "良"): AdaptedJvLinkFinalResultRunFolder {
  return {
    race: {
      raceId, raceDate: "2026-09-13", raceName: "セントライト記念",
      racecourse: "中山", distance: 2200, surface: "turf", going,
    },
    runners: [],
    unclassifiedAbnormalRunners: [],
    resultAvailableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: resolvedAt,
    sourceIdentifier: "targetRaceKey=2026091306090911;files=RA_TARGET.jvd,SE_TARGET.jvd",
    targetRaCount: 1,
    targetSeCount: 3,
  };
}

function resultArtifact(): RaceResultArtifactV2 {
  const input: BuildRaceResultArtifactV2Input = {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-09-13T16:00:00+09:00",
    retrievedAt: resolvedAt,
    source: "JV_LINK",
    sourceIdentifier: "jvlink-run:fixture",
    supersedesArtifactId: null,
    race: {
      raceId, raceDate: "2026-09-13", raceName: "セントライト記念",
      scheduledStartTime: null, officialStarterCount: 2, resultEntryCount: 3, going: "良",
    },
    runners: horseIds.map((canonicalHorseId, index) => index === 1 ? {
      canonicalHorseId, horseName: `HORSE-${index + 1}`, horseNumber: index + 1, frameNumber: null,
      resultStatus: "FINAL", finishPosition: null, started: false, scratched: true, excluded: false,
      didNotFinish: false, disqualified: false, actualRaceTime: null, timeGap: null, final3F: null,
      final3FRank: null, passingPosition: null, carriedWeight: null,
    } : {
      canonicalHorseId, horseName: `HORSE-${index + 1}`, horseNumber: index + 1, frameNumber: index + 1,
      resultStatus: "FINAL", finishPosition: index === 0 ? 1 : 2, started: true, scratched: false, excluded: false,
      didNotFinish: false, disqualified: false, actualRaceTime: 141.3 + index / 10,
      timeGap: index === 0 ? 0 : 0.2, final3F: 34.5 + index / 10, final3FRank: index === 0 ? 1 : 2,
      passingPosition: { cornerPositions: [3, 3, index + 1], fieldSize: 2, source: "JV_LINK", isReliable: true },
      carriedWeight: 56,
    }),
  };
  return buildRaceResultArtifactV2(input);
}

function sourceProvenance(horseId: string): SourceProvenance {
  return {
    source: "JRA-VAN/JV-Link",
    sourceIdentifier: `history:${horseId}`,
    targetRaceId: raceId,
    retrievedAt: "2026-09-13T15:00:00+09:00",
    targetAsOf: "2026-09-13T15:00:00+09:00",
    method: "jv_link",
    collectorVersion: "fixture-v1",
  };
}

function priorRace(raceDate = "2026-08-01", priorRaceId = "JRA-20260801-NIIGATA-10"): RacePerformance {
  return {
    raceId: priorRaceId,
    raceName: "過去走",
    raceDate,
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    source: "JRA-VAN/JV-Link",
    sourceRaceId: `source:${priorRaceId}`,
    sourceHorseId: horseIds[0],
    importedAt: "2026-09-13T15:00:00+09:00",
    availableAt: "2026-08-01T16:00:00+09:00",
    finishPosition: 1,
    timeGap: -0.1,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 70,
    retrospectiveMemberLevelScore: null,
    memberLevelBreakdown: null,
    timeGapScore: 75,
    raceTimeScore: 70,
    raceTimeBreakdown: null,
    final3FScore: 72,
    final3FBreakdown: {} as RacePerformance["final3FBreakdown"],
    weightScore: 70,
    weightBreakdown: {} as RacePerformance["weightBreakdown"],
    raceScore: 72.4,
  };
}

function priorEntry(horseId: string, races: RacePerformance[], careerStartCountAsOf?: number): PriorHistoryEntry {
  return {
    horseId,
    status: "available",
    races,
    careerStartCountAsOf,
    selectedRaceKeys: races.map(r => r.raceId),
    provenance: sourceProvenance(horseId),
  };
}

const timeBaseline: CourseTimeBaseline = {
  racecourse: "中山", surface: "turf", distance: 2200, going: "良",
  sampleYears: 5, sampleCount: 30, medianTimeSeconds: 133.2, source: "OFFICIAL_BASELINE_FIXTURE",
};
const final3FBaseline: CourseFinal3FBaseline = {
  racecourse: "中山", surface: "turf", distance: 2200, going: "良",
  sampleYears: 5, sampleCount: 30, medianFinal3FSeconds: 35.1, source: "OFFICIAL_BASELINE_FIXTURE",
};

function buildAcceptedInput(builtAt = "2026-09-13T17:00:00+09:00") {
  const mapped = mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture());
  if (mapped.status !== "accepted") throw new Error("fixture mapper rejected");
  const resolved = resolveObjectiveRunnersV1(resultArtifact(), [
    priorEntry(horseIds[0], [priorRace()], 1),
    priorEntry(horseIds[2], [], 0),
  ], resolverProvenance, verification);
  if (resolved.status !== "accepted") throw new Error("fixture prior rejected");
  const baseline = resolveBenchmarkContextV1(mapped.race, [timeBaseline], [final3FBaseline], resolverProvenance);
  const objective: PostRaceObjectiveDataV1 = {
    race: mapped.race,
    runners: resolved.runners,
    benchmarks: baseline.benchmarks,
    evidence: [...mapped.evidence, ...resolved.evidence, ...baseline.evidence],
  };
  const built = buildPostRaceUpdateInputV1(resultArtifact(), objective, builtAt);
  if (built.status !== "accepted") throw new Error(`fixture build rejected: ${JSON.stringify(built.issues)}`);
  return built.input;
}

describe("Post-Race Objective resolver / serialization", () => {
  it("1. Final Result AdapterからObjective Raceを推測なしでmappingする", () => {
    const outcome = mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture());
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.race).toMatchObject({ raceId, racecourse: "中山", surface: "turf", distance: 2200, going: "良", raceNumber: null });
    expect(outcome.evidence[0]).toMatchObject({ kind: "RACE_METADATA", targetRaceId: raceId });
  });

  it("2. Adapterのgoing欠損を補完せず拒否する", () => {
    expect(mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture(null)).status).toBe("rejected");
  });

  it("3. 取消馬を削除せずNOT_APPLICABLEとして保持する", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [], resolverProvenance, verification);
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.runners).toHaveLength(3);
    expect(outcome.runners[1]).toMatchObject({
      canonicalHorseId: horseIds[1], priorAbility: { status: "NOT_APPLICABLE" }, bodyWeight: { status: "NOT_APPLICABLE" },
    });
  });

  it("4. VERIFIED_AS_OF証拠を照合した履歴をAVAILABLEにする", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [priorEntry(horseIds[0], [priorRace()], 1)], resolverProvenance, verification);
    if (outcome.status !== "accepted") throw new Error("unexpected rejection");
    expect(outcome.runners[0].priorAbility).toMatchObject({ status: "AVAILABLE", priorRacesNewestFirst: [{ raceScore: 72.4 }] });
  });

  it("5. 正式cutoffの0走証拠をNO_PRIORにする", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [priorEntry(horseIds[0], [], 0)], resolverProvenance, verification);
    if (outcome.status !== "accepted") throw new Error("unexpected rejection");
    expect(outcome.runners[0].priorAbility.status).toBe("NO_PRIOR");
  });

  it("6. 空履歴でもゼロ件確認がなければUNAVAILABLEにする", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [priorEntry(horseIds[0], [])], resolverProvenance, verification);
    if (outcome.status !== "accepted") throw new Error("unexpected rejection");
    expect(outcome.runners[0].priorAbility).toMatchObject({ status: "UNAVAILABLE", reasonCode: "EMPTY_HISTORY_WITHOUT_ZERO_CAREER_COUNT" });
  });

  it("7. 未来のpriorをresolverで拒否する", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [priorEntry(horseIds[0], [priorRace("2026-09-14")])], resolverProvenance, verification);
    expect(outcome).toMatchObject({ status: "rejected", issues: [{ code: "FUTURE_PRIOR" }] });
  });

  it("8. 同日priorをresolverで拒否する", () => {
    const outcome = resolveObjectiveRunnersV1(resultArtifact(), [priorEntry(horseIds[0], [priorRace("2026-09-13")])], resolverProvenance, verification);
    expect(outcome).toMatchObject({ status: "rejected", issues: [{ code: "FUTURE_PRIOR" }] });
  });

  it("9. 実在baselineをAVAILABLEで保持する", () => {
    const mapped = mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture());
    if (mapped.status !== "accepted") throw new Error("unexpected rejection");
    const resolved = resolveBenchmarkContextV1(mapped.race, [timeBaseline], [final3FBaseline], resolverProvenance);
    expect(resolved.benchmarks.courseTimeBaseline).toMatchObject({ status: "AVAILABLE", value: timeBaseline });
    expect(resolved.benchmarks.courseFinal3FBaseline.status).toBe("AVAILABLE");
  });

  it("10. baseline不在時は値を注入せずUNAVAILABLEにする", () => {
    const mapped = mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture());
    if (mapped.status !== "accepted") throw new Error("unexpected rejection");
    const resolved = resolveBenchmarkContextV1(mapped.race, [], [], resolverProvenance);
    expect(resolved.benchmarks.courseTimeBaseline).toEqual(expect.objectContaining({ status: "UNAVAILABLE", value: null }));
    expect(resolved.benchmarks.courseFinal3FBaseline).toEqual(expect.objectContaining({ status: "UNAVAILABLE", value: null }));
  });

  it("10b. going不一致のdistance fallbackを暗黙採用しない", () => {
    const mapped = mapFinalResultAdapterToObjectiveRaceV1(adaptedFixture("重"));
    if (mapped.status !== "accepted") throw new Error("unexpected rejection");
    const resolved = resolveBenchmarkContextV1(mapped.race, [timeBaseline], [final3FBaseline], resolverProvenance);
    expect(resolved.benchmarks.courseTimeBaseline.status).toBe("UNAVAILABLE");
    expect(resolved.benchmarks.courseFinal3FBaseline.status).toBe("UNAVAILABLE");
  });

  it("11. builtAtや集合の入力順に依存しないdeterministic fingerprintを作る", () => {
    const first = buildAcceptedInput("2026-09-13T17:00:00+09:00");
    const second = buildAcceptedInput("2026-09-13T18:00:00+09:00");
    second.runners.reverse();
    second.evidence.reverse();
    expect(calculatePostRaceUpdateInputFingerprint(second)).toBe(first.inputContentFingerprint);
    expect(second.inputContentFingerprint).toBe(first.inputContentFingerprint);
  });

  it("12. serialize/deserialize round-trip後もGate済み内容とfingerprintを維持する", () => {
    const input = buildAcceptedInput();
    const restored = deserializePostRaceUpdateInputV1(serializePostRaceUpdateInputV1(input));
    expect(restored).toEqual(input);
    expect(restored.inputContentFingerprint).toBe(input.inputContentFingerprint);
  });

  it("13. serialize後の改変をfingerprint不一致として検出する", () => {
    const input = buildAcceptedInput();
    const tampered = JSON.parse(serializePostRaceUpdateInputV1(input)) as Record<string, unknown>;
    (tampered.race as Record<string, unknown>).distance = 2400;
    expect(() => deserializePostRaceUpdateInputV1(JSON.stringify(tampered))).toThrowError(PostRaceUpdateInputSerializationError);
    try {
      deserializePostRaceUpdateInputV1(JSON.stringify(tampered));
    } catch (error) {
      expect((error as PostRaceUpdateInputSerializationError).code).toBe("FINGERPRINT_MISMATCH");
    }
  });

  it("13b. 不正schemaをdeserialize時に拒否する", () => {
    expect(() => deserializePostRaceUpdateInputV1('{"schemaVersion":"other","inputType":"POST_RACE_UPDATE_INPUT"}'))
      .toThrowError(expect.objectContaining({ code: "INVALID_SCHEMA" }));
  });

  it("13c. schema名だけ正しい構造欠損データもINVALID_SCHEMAで拒否する", () => {
    expect(() => deserializePostRaceUpdateInputV1(JSON.stringify({
      schemaVersion: "post-race-update-input-v1",
      inputType: "POST_RACE_UPDATE_INPUT",
      inputContentFingerprint: "pruiv1-00000000",
    }))).toThrowError(expect.objectContaining({ code: "INVALID_SCHEMA" }));
  });
});

interface Envelope { bytes: string; sourceFile: string; providedAt: string; retrievedAt: string }
function put(buffer: Buffer, position: number, length: number, value: string): void {
  const encoded = Buffer.from(value, "ascii");
  buffer.fill(0x20, position - 1, position - 1 + length);
  encoded.copy(buffer, position - 1);
}
function record(type: "RA" | "SE", key: string): Buffer {
  const buffer = Buffer.alloc(type === "RA" ? 1272 : 555, 0x20);
  put(buffer, 1, 2, type); put(buffer, 3, 1, "7"); put(buffer, 4, 8, "20260913"); put(buffer, 12, 16, key);
  buffer[buffer.length - 2] = 13; buffer[buffer.length - 1] = 10;
  return buffer;
}
function createFullFieldRunFolder(): string {
  const key = "2026091306090911";
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-race-objective-e2e-"));
  fs.mkdirSync(path.join(runDir, "raw"));
  const ra = record("RA", key);
  put(ra, 20, 2, "06"); put(ra, 26, 2, "11"); put(ra, 33, 60, "SENTO ISHI KINEN");
  put(ra, 698, 4, "2200"); put(ra, 706, 2, "17"); put(ra, 710, 2, "A"); put(ra, 884, 2, "03"); put(ra, 889, 1, "1");
  const rows: Envelope[] = [{ bytes: ra.toString("base64"), sourceFile: "RA_TARGET.jvd", providedAt: "20260913160000", retrievedAt: resolvedAt }];
  horseIds.forEach((horseId, index) => {
    const se = record("SE", key);
    put(se, 28, 1, index === 1 ? "0" : String(index + 1)); put(se, 29, 2, String(index + 1).padStart(2, "0"));
    put(se, 31, 10, horseId); put(se, 41, 36, `HORSE${index + 1}`); put(se, 289, 3, "560");
    put(se, 332, 1, index === 1 ? "1" : "0"); put(se, 335, 2, index === 1 ? "00" : (index === 0 ? "01" : "02"));
    put(se, 339, 4, index === 0 ? "2213" : "2215"); [352, 354, 356, 358].forEach((p) => put(se, p, 2, "03"));
    put(se, 391, 3, index === 0 ? "345" : "347"); put(se, 532, 4, index === 0 ? "+000" : "+002");
    rows.push({ bytes: se.toString("base64"), sourceFile: "SE_TARGET.jvd", providedAt: "20260913160000", retrievedAt: resolvedAt });
  });
  fs.writeFileSync(path.join(runDir, "raw/manifest.json"), JSON.stringify({
    schemaVersion: "jvlink-raw-v1", source: "JRA-VAN/JV-Link", targetRaceId: raceId, targetRaceKey: key,
    raceDate: "2026-09-13", targetAsOf: "2026-09-13T17:00:00+09:00", collectedAt: resolvedAt,
    historySelections: horseIds.map((horseId, index) => ({ horseId, horseName: `HORSE${index + 1}`, status: "available", availableHistoryCount: 0, selectedRaceKeys: [] })),
    targetRecordCount: rows.length, historyRecordCount: 0,
  }, null, 2));
  fs.writeFileSync(path.join(runDir, "raw/target-records.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  fs.writeFileSync(path.join(runDir, "raw/history-records.jsonl"), "");
  return runDir;
}

describe("fixture全頭E2E", () => {
  it("14. Final Result fixtureからdeserialize/fingerprint再確認まで全登録馬を保持する", () => {
    const runDir = createFullFieldRunFolder();
    try {
      const adapted = adaptJvLinkFinalResultRunFolder(loadJvLinkRunFolder(runDir, raceId));
      const mapped = mapFinalResultAdapterToObjectiveRaceV1(adapted);
      if (mapped.status !== "accepted") throw new Error("mapper rejected");
      const imported = importJvLinkFinalResult(runDir, {
        expectedRaceId: raceId, resultStatus: "FINAL", resultVersion: 1,
        manualAbnormalRunnerClassifications: [{ canonicalHorseId: horseIds[1], scratched: true }],
      });
      if (imported.status !== "built") throw new Error(`result import failed: ${imported.status}`);
      const prior = resolveObjectiveRunnersV1(imported.artifact, [
        priorEntry(horseIds[0], [priorRace()], 1), priorEntry(horseIds[2], [], 0),
      ], resolverProvenance, verification);
      if (prior.status !== "accepted") throw new Error("prior rejected");
      const baselines = resolveBenchmarkContextV1(mapped.race, [timeBaseline], [final3FBaseline], resolverProvenance);
      const built = buildPostRaceUpdateInputV1(imported.artifact, {
        race: mapped.race,
        runners: prior.runners,
        benchmarks: baselines.benchmarks,
        evidence: [...mapped.evidence, ...prior.evidence, ...baselines.evidence],
      }, "2026-09-13T17:00:00+09:00");
      expect(built.status).toBe("accepted");
      if (built.status !== "accepted") return;
      const restored = deserializePostRaceUpdateInputV1(serializePostRaceUpdateInputV1(built.input));
      expect(restored.runners).toHaveLength(3);
      expect(restored.runners.filter((runner) => runner.abilityUpdateEligibility === "ELIGIBLE")).toHaveLength(2);
      expect(restored.runners.find((runner) => runner.canonicalHorseId === horseIds[1])).toMatchObject({
        scratched: true, abilityUpdateEligibility: "INELIGIBLE_NON_START", priorAbility: { status: "NOT_APPLICABLE" },
      });
      expect(restored.runners.find((runner) => runner.canonicalHorseId === horseIds[2])?.priorAbility.status).toBe("NO_PRIOR");
      expect(restored.evidence.some((item) => item.kind === "PREDICTION_ARTIFACT")).toBe(false);
      expect(calculatePostRaceUpdateInputFingerprint(restored)).toBe(restored.inputContentFingerprint);
    } finally {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  });
});

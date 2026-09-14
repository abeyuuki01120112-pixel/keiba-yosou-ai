import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRaceResultArtifact,
  buildRaceResultArtifactV2,
  type BuildRaceResultArtifactInput,
  type BuildRaceResultArtifactV2Input,
} from "../raceResultArtifact";
import {
  findLatestCalibrationResult,
  findLatestCalibrationResultV2,
  listRaceResultArtifactsForRace,
  listRaceResultArtifactsForRaceV2,
  persistRaceResultArtifact,
  persistRaceResultArtifactV2,
  readRaceResultArtifact,
  readRaceResultArtifactV2,
} from "../raceResultArtifactStore";

function baseInput(overrides: Partial<BuildRaceResultArtifactInput> = {}): BuildRaceResultArtifactInput {
  return {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-08-30T15:30:00+09:00",
    retrievedAt: "2026-08-30T16:00:00+09:00",
    source: "test-fixture",
    sourceIdentifier: "test-fixture-001",
    race: {
      raceId: "JRA-TEST-RACE-STORE",
      raceDate: "2026-08-30",
      raceName: "テストレース",
      scheduledStartTime: "2026-08-30T15:00:00+09:00",
      officialStarterCount: 2,
      resultEntryCount: 2,
    },
    runners: [
      {
        canonicalHorseId: "h1", horseName: "テスト馬1", horseNumber: 1, frameNumber: 1,
        resultStatus: "FINAL", finishPosition: 1, started: true, scratched: false,
        excluded: false, didNotFinish: false, disqualified: false,
      },
      {
        canonicalHorseId: "h2", horseName: "テスト馬2", horseNumber: 2, frameNumber: 2,
        resultStatus: "FINAL", finishPosition: 2, started: true, scratched: false,
        excluded: false, didNotFinish: false, disqualified: false,
      },
    ],
    ...overrides,
  };
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "race-result-artifact-store-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("RaceResultArtifactStore", () => {
  it("JSON round-tripで保存・再読込した内容が一致する", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    const result = persistRaceResultArtifact(artifact, { dir: tempDir });
    expect(result.status).toBe("created");
    expect(readRaceResultArtifact(artifact.artifactId, { dir: tempDir })).toEqual(artifact);
  });

  it("append-only: 同一artifactId・同一内容ならidempotentにduplicate扱いする", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    expect(persistRaceResultArtifact(artifact, { dir: tempDir }).status).toBe("created");
    expect(persistRaceResultArtifact(artifact, { dir: tempDir }).status).toBe("duplicate");
    // ファイルは1つのまま（重複保存されない）。
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("append-only: 同一artifactId・異なる内容は拒否する（上書きしない）", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    expect(persistRaceResultArtifact(artifact, { dir: tempDir }).status).toBe("created");
    // 同じresultStatus/resultVersion/retrievedAt（=同じartifactId）だが、
    // 中身（着順）が異なる正当なArtifactを別途構築する（fingerprintは正しく再計算される）。
    const differentContentSameId = buildRaceResultArtifact(baseInput({
      runners: [
        { ...baseInput().runners[0], finishPosition: 2 },
        { ...baseInput().runners[1], finishPosition: 1 },
      ],
    }));
    expect(differentContentSameId.artifactId).toBe(artifact.artifactId);
    expect(differentContentSameId.resultContentFingerprint).not.toBe(artifact.resultContentFingerprint);
    const result = persistRaceResultArtifact(differentContentSameId, { dir: tempDir });
    expect(result.status).toBe("rejected");
    // 元の内容がそのまま残っている（上書きされていない）。
    expect(readRaceResultArtifact(artifact.artifactId, { dir: tempDir })?.runners[0].finishPosition).toBe(1);
  });

  it("CORRECTEDは旧artifactIdのファイルを上書きせず、別ファイルとして追加される", () => {
    const original = buildRaceResultArtifact(baseInput());
    expect(persistRaceResultArtifact(original, { dir: tempDir }).status).toBe("created");

    const corrected = buildRaceResultArtifact(baseInput({
      resultStatus: "CORRECTED",
      resultVersion: 2,
      retrievedAt: "2026-08-31T09:00:00+09:00",
      supersedesArtifactId: original.artifactId,
      runners: [
        { ...baseInput().runners[0], resultStatus: "CORRECTED", finishPosition: 2 },
        { ...baseInput().runners[1], resultStatus: "CORRECTED", finishPosition: 1 },
      ],
    }));
    expect(persistRaceResultArtifact(corrected, { dir: tempDir }).status).toBe("created");

    // 旧版はそのまま存在し続ける（削除・更新されていない）。
    const originalReloaded = readRaceResultArtifact(original.artifactId, { dir: tempDir });
    expect(originalReloaded?.runners[0].finishPosition).toBe(1);
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(2);

    const all = listRaceResultArtifactsForRace(baseInput().race.raceId, { dir: tempDir });
    expect(all).toHaveLength(2);

    const latest = findLatestCalibrationResult(baseInput().race.raceId, { dir: tempDir });
    expect(latest?.artifactId).toBe(corrected.artifactId);
    expect(latest?.runners[0].finishPosition).toBe(2);
  });

  it("PROVISIONALのみの場合、findLatestCalibrationResultはnullを返す（Calibration FINALとして扱わない）", () => {
    const provisional = buildRaceResultArtifact(baseInput({
      resultStatus: "PROVISIONAL",
      runners: [
        { ...baseInput().runners[0], resultStatus: "PROVISIONAL" },
        { ...baseInput().runners[1], resultStatus: "PROVISIONAL" },
      ],
    }));
    persistRaceResultArtifact(provisional, { dir: tempDir });
    expect(findLatestCalibrationResult(baseInput().race.raceId, { dir: tempDir })).toBeNull();
  });

  it("存在しないartifactIdの読み込みはnullを返す", () => {
    expect(readRaceResultArtifact("nonexistent-id", { dir: tempDir })).toBeNull();
  });
});

function baseInputV2(overrides: Partial<BuildRaceResultArtifactV2Input> = {}): BuildRaceResultArtifactV2Input {
  const base = baseInput();
  return {
    ...base,
    race: { ...base.race, going: "良" },
    runners: base.runners.map((r) => ({
      ...r,
      actualRaceTime: 118.7, timeGap: 0, final3F: 34.5, final3FRank: 1,
      passingPosition: null, carriedWeight: 57,
    })),
    ...overrides,
  };
}

describe("RaceResultArtifactStore v2（Post-Race Pipeline V1・Phase 1）", () => {
  it("G. v2をappend-only保存し、JSON round-tripで内容が一致する", () => {
    const artifact = buildRaceResultArtifactV2(baseInputV2());
    const result = persistRaceResultArtifactV2(artifact, { dir: tempDir });
    expect(result.status).toBe("created");
    expect(readRaceResultArtifactV2(artifact.artifactId, { dir: tempDir })).toEqual(artifact);
  });

  it("H. append-only: 同一artifactId・同一内容ならidempotentにduplicate扱いする", () => {
    const artifact = buildRaceResultArtifactV2(baseInputV2());
    expect(persistRaceResultArtifactV2(artifact, { dir: tempDir }).status).toBe("created");
    expect(persistRaceResultArtifactV2(artifact, { dir: tempDir }).status).toBe("duplicate");
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("I. append-only: 同一artifactId・異なる内容は拒否する（上書きしない）", () => {
    const artifact = buildRaceResultArtifactV2(baseInputV2());
    expect(persistRaceResultArtifactV2(artifact, { dir: tempDir }).status).toBe("created");
    const differentContentSameId = buildRaceResultArtifactV2(baseInputV2({
      runners: baseInputV2().runners.map((r, i) => ({ ...r, finishPosition: i === 0 ? 2 : 1 })),
    }));
    expect(differentContentSameId.artifactId).toBe(artifact.artifactId);
    expect(differentContentSameId.resultContentFingerprint).not.toBe(artifact.resultContentFingerprint);
    const result = persistRaceResultArtifactV2(differentContentSameId, { dir: tempDir });
    expect(result.status).toBe("rejected");
    expect(readRaceResultArtifactV2(artifact.artifactId, { dir: tempDir })?.runners[0].finishPosition).toBe(1);
  });

  it("J. CORRECTEDは旧v2 Artifactを上書きせず、別ファイルとして追加される", () => {
    const original = buildRaceResultArtifactV2(baseInputV2());
    expect(persistRaceResultArtifactV2(original, { dir: tempDir }).status).toBe("created");

    const corrected = buildRaceResultArtifactV2(baseInputV2({
      resultStatus: "CORRECTED",
      resultVersion: 2,
      retrievedAt: "2026-08-31T09:00:00+09:00",
      supersedesArtifactId: original.artifactId,
      runners: baseInputV2().runners.map((r, i) => ({
        ...r, resultStatus: "CORRECTED" as const, finishPosition: i === 0 ? 2 : 1,
      })),
    }));
    expect(persistRaceResultArtifactV2(corrected, { dir: tempDir }).status).toBe("created");

    const originalReloaded = readRaceResultArtifactV2(original.artifactId, { dir: tempDir });
    expect(originalReloaded?.runners[0].finishPosition).toBe(1);
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(2);

    const all = listRaceResultArtifactsForRaceV2(baseInputV2().race.raceId, { dir: tempDir });
    expect(all).toHaveLength(2);

    const latest = findLatestCalibrationResultV2(baseInputV2().race.raceId, { dir: tempDir });
    expect(latest?.artifactId).toBe(corrected.artifactId);
    expect(latest?.runners[0].finishPosition).toBe(2);
  });

  it("v1とv2は同じresults/配下でも互いに干渉しない（v2はv2専用サブディレクトリに保存される）", () => {
    const v1Artifact = buildRaceResultArtifact(baseInput());
    const v2Artifact = buildRaceResultArtifactV2(baseInputV2());
    expect(persistRaceResultArtifact(v1Artifact, { dir: tempDir }).status).toBe("created");
    const v2Dir = path.join(tempDir, "v2");
    expect(persistRaceResultArtifactV2(v2Artifact, { dir: v2Dir }).status).toBe("created");

    // v1側の一覧・最新FINAL取得は、v2ファイルの存在に一切影響されない
    // （v2はv1のdir直下に平置きされないため、v1のlistRaceResultArtifactsForRaceが
    // v2ファイルをv1形式としてdeserializeしようとして壊れることはない）。
    expect(listRaceResultArtifactsForRace(baseInput().race.raceId, { dir: tempDir })).toHaveLength(1);
    expect(findLatestCalibrationResult(baseInput().race.raceId, { dir: tempDir })?.artifactId)
      .toBe(v1Artifact.artifactId);

    expect(listRaceResultArtifactsForRaceV2(baseInputV2().race.raceId, { dir: v2Dir })).toHaveLength(1);
  });
});

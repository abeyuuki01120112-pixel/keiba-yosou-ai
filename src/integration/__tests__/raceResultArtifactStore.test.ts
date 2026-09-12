import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRaceResultArtifact, type BuildRaceResultArtifactInput } from "../raceResultArtifact";
import {
  findLatestCalibrationResult,
  listRaceResultArtifactsForRace,
  persistRaceResultArtifact,
  readRaceResultArtifact,
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

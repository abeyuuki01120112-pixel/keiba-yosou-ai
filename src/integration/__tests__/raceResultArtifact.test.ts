import { describe, expect, it } from "vitest";
import {
  buildRaceResultArtifact,
  deserializeRaceResultArtifact,
  isCalibrationFinalResult,
  serializeRaceResultArtifact,
  validateRaceResultArtifact,
  type BuildRaceResultArtifactInput,
  type RaceResultArtifactRunner,
} from "../raceResultArtifact";

function runner(overrides: Partial<RaceResultArtifactRunner> = {}): RaceResultArtifactRunner {
  return {
    canonicalHorseId: "h1",
    horseName: "テスト馬1",
    horseNumber: 1,
    frameNumber: 1,
    resultStatus: "FINAL",
    finishPosition: 1,
    started: true,
    scratched: false,
    excluded: false,
    didNotFinish: false,
    disqualified: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<BuildRaceResultArtifactInput> = {}): BuildRaceResultArtifactInput {
  const runners = overrides.runners ?? [
    runner({ canonicalHorseId: "h1", horseNumber: 1, finishPosition: 1 }),
    runner({ canonicalHorseId: "h2", horseNumber: 2, finishPosition: 2 }),
  ];
  return {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-08-30T15:30:00+09:00",
    retrievedAt: "2026-08-30T16:00:00+09:00",
    source: "test-fixture",
    sourceIdentifier: "test-fixture-001",
    race: {
      raceId: "JRA-TEST-RACE-01",
      raceDate: "2026-08-30",
      raceName: "テストレース",
      scheduledStartTime: "2026-08-30T15:00:00+09:00",
      officialStarterCount: 2,
      resultEntryCount: 2,
    },
    runners,
    ...overrides,
  };
}

describe("RaceResultArtifact", () => {
  it("valid FINALを構築できる", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    expect(artifact.artifactType).toBe("RACE_RESULT");
    expect(artifact.resultStatus).toBe("FINAL");
    expect(artifact.supersedesArtifactId).toBeNull();
    expect(isCalibrationFinalResult(artifact)).toBe(true);
  });

  it("valid PROVISIONALを構築でき、Calibration FINALとしては扱われない", () => {
    const artifact = buildRaceResultArtifact(baseInput({
      resultStatus: "PROVISIONAL",
      runners: [
        runner({ canonicalHorseId: "h1", resultStatus: "PROVISIONAL", finishPosition: 1 }),
        runner({ canonicalHorseId: "h2", resultStatus: "PROVISIONAL", finishPosition: 2 }),
      ],
    }));
    expect(artifact.resultStatus).toBe("PROVISIONAL");
    expect(isCalibrationFinalResult(artifact)).toBe(false);
  });

  it("valid CORRECTEDはsupersedesArtifactIdを保持し、旧versionを上書きしない意味で別Artifactになる", () => {
    const original = buildRaceResultArtifact(baseInput());
    const corrected = buildRaceResultArtifact(baseInput({
      resultStatus: "CORRECTED",
      resultVersion: 2,
      retrievedAt: "2026-08-31T09:00:00+09:00",
      supersedesArtifactId: original.artifactId,
      runners: [
        runner({ canonicalHorseId: "h1", resultStatus: "CORRECTED", finishPosition: 2 }),
        runner({ canonicalHorseId: "h2", resultStatus: "CORRECTED", finishPosition: 1 }),
      ],
    }));
    expect(corrected.supersedesArtifactId).toBe(original.artifactId);
    expect(corrected.artifactId).not.toBe(original.artifactId);
    expect(isCalibrationFinalResult(corrected)).toBe(true);
  });

  it("CORRECTEDでsupersedesArtifactIdが無ければ拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({ resultStatus: "CORRECTED", resultVersion: 2 })))
      .toThrow(/supersedesArtifactId/);
  });

  it("FINAL/PROVISIONALでsupersedesArtifactIdがあれば拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({ supersedesArtifactId: "someId" })))
      .toThrow(/supersedesArtifactId/);
  });

  it("canonicalHorseIdの重複を拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: 1 }),
        runner({ canonicalHorseId: "h1", finishPosition: 2 }),
      ],
      race: { ...baseInput().race, resultEntryCount: 2 },
    }))).toThrow(/重複/);
  });

  it("resultEntryCountがrunners件数と一致しない場合は拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      race: { ...baseInput().race, resultEntryCount: 5 },
    }))).toThrow(/resultEntryCount/);
  });

  it("officialStarterCountが負なら拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      race: { ...baseInput().race, officialStarterCount: -1 },
    }))).toThrow(/officialStarterCount/);
  });

  it("scratched=trueかつstarted=trueの矛盾を拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", scratched: true, started: true, finishPosition: null }),
        runner({ canonicalHorseId: "h2", finishPosition: 1 }),
      ],
    }))).toThrow(/scratched.*started/);
  });

  it("scratched=trueなのにfinishPositionがある場合を拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", scratched: true, started: false, finishPosition: 1 }),
        runner({ canonicalHorseId: "h2", finishPosition: 2 }),
      ],
    }))).toThrow(/finishPosition/);
  });

  it("finishPositionが0以下・非整数なら拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: 0 }),
        runner({ canonicalHorseId: "h2", finishPosition: 2 }),
      ],
    }))).toThrow(/finishPosition/);
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: 1.5 }),
        runner({ canonicalHorseId: "h2", finishPosition: 2 }),
      ],
    }))).toThrow(/finishPosition/);
  });

  it("didNotFinish=trueかつfinishPosition=nullを許容する", () => {
    const artifact = buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: null, didNotFinish: true }),
        runner({ canonicalHorseId: "h2", finishPosition: 1 }),
      ],
    }));
    expect(artifact.runners[0].didNotFinish).toBe(true);
    expect(artifact.runners[0].finishPosition).toBeNull();
  });

  it("didNotFinish=trueなのにfinishPositionがあれば拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: 3, didNotFinish: true }),
        runner({ canonicalHorseId: "h2", finishPosition: 1 }),
      ],
    }))).toThrow(/finishPosition/);
  });

  it("FINALで決着が確認できない馬（finishPosition/didNotFinish/disqualifiedすべて無し）を拒否する", () => {
    expect(() => buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: null, started: true }),
        runner({ canonicalHorseId: "h2", finishPosition: 1 }),
      ],
    }))).toThrow(/決着/);
  });

  it("PROVISIONALでは決着未確認を許容する（FINAL/CORRECTEDのみ厳格化）", () => {
    const artifact = buildRaceResultArtifact(baseInput({
      resultStatus: "PROVISIONAL",
      runners: [
        runner({ canonicalHorseId: "h1", resultStatus: "PROVISIONAL", finishPosition: null, started: true }),
        runner({ canonicalHorseId: "h2", resultStatus: "PROVISIONAL", finishPosition: 1 }),
      ],
    }));
    expect(artifact.resultStatus).toBe("PROVISIONAL");
  });

  it("失格馬はfinishPosition=nullのままdisqualified=trueを許容する", () => {
    const artifact = buildRaceResultArtifact(baseInput({
      runners: [
        runner({ canonicalHorseId: "h1", finishPosition: null, disqualified: true }),
        runner({ canonicalHorseId: "h2", finishPosition: 1 }),
      ],
    }));
    expect(artifact.runners[0].disqualified).toBe(true);
  });

  it("JSON serialize/deserializeで内容が一致し、fingerprint/artifactIdの整合も検証する", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    const serialized = serializeRaceResultArtifact(artifact);
    expect(deserializeRaceResultArtifact(serialized)).toEqual(artifact);
  });

  it("改変されたJSON（fingerprint不一致）はdeserializeで拒否する", () => {
    const artifact = buildRaceResultArtifact(baseInput());
    const tampered = { ...artifact, runners: [{ ...artifact.runners[0], finishPosition: 99 }, artifact.runners[1]] };
    expect(() => deserializeRaceResultArtifact(JSON.stringify(tampered))).toThrow(/fingerprint/);
  });

  it("validateRaceResultArtifactは単体でも呼び出せる（構築前の事前検証用途）", () => {
    expect(() => validateRaceResultArtifact(baseInput())).not.toThrow();
  });
});

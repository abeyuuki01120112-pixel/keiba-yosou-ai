/**
 * 2026新潟記念（JRA-20260830-NIIGATA-08）を題材にした、RaceResultArtifact schemaへの
 * 「構造変換可能性」テスト。
 *
 * 【重要】このテストは「本レースの公式結果を確定させる」ものではない。
 * 既存のlegacy derivedデータ（src/integration/data/derived/JRA-20260830-NIIGATA-08.json、
 * actualFinishPositionをPredictionへ後付けする旧方式・Calibration正本として使用禁止）に
 * 記録されているcanonicalHorseId/horseName/finishPositionが、新しいRaceResultArtifact
 * schemaへ構造的に変換可能であることだけを確認する。
 *
 * resultAvailableAt・source・sourceIdentifierは公式provenanceを確認できていないため、
 * 明示的にtest-onlyであると分かる値を使う。FINALとしてProduction Artifact Storeへ
 * 保存することはしない（tempDirのみ、production KEIBA_DATA_DIR/resultsには一切触れない）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRaceResultArtifact,
  deserializeRaceResultArtifact,
  serializeRaceResultArtifact,
  validateRaceResultArtifact,
  type RaceResultArtifactRunner,
} from "../raceResultArtifact";
import { persistRaceResultArtifact, readRaceResultArtifact } from "../raceResultArtifactStore";

const derivedPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "derived",
  "JRA-20260830-NIIGATA-08.json",
);

interface LegacyDerivedHorse {
  horseId: string;
  horseName: string;
  horseNumber: number;
  gate: number;
  scratched: boolean;
  actualFinishPosition: number | null;
}

interface LegacyDerivedRace {
  race: { raceId: string; raceDate: string; raceName: string };
  horses: LegacyDerivedHorse[];
}

function loadLegacyDerivedRace(): LegacyDerivedRace {
  return JSON.parse(fs.readFileSync(derivedPath, "utf-8")) as LegacyDerivedRace;
}

/** legacy derivedのhorses[]（actualFinishPosition付き）を、Result Artifact runner shapeへ構造変換する。 */
function toResultArtifactRunners(horses: LegacyDerivedHorse[]): RaceResultArtifactRunner[] {
  return horses.map((horse) => ({
    canonicalHorseId: horse.horseId,
    horseName: horse.horseName,
    horseNumber: horse.horseNumber,
    frameNumber: horse.gate,
    resultStatus: "FINAL",
    finishPosition: horse.actualFinishPosition,
    started: !horse.scratched,
    scratched: horse.scratched,
    excluded: false,
    didNotFinish: false,
    disqualified: false,
  }));
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "niigata-result-structural-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("2026新潟記念: 既存finishPositionデータのRaceResultArtifact構造変換可能性", () => {
  it("legacy derivedのactualFinishPositionを、RaceResultArtifactのfinishPositionへ構造変換できる", () => {
    const legacy = loadLegacyDerivedRace();
    expect(legacy.race.raceId).toBe("JRA-20260830-NIIGATA-08");
    expect(legacy.horses).toHaveLength(11);

    const runners = toResultArtifactRunners(legacy.horses);
    // 元データの対応関係がそのまま保たれていることを確認する（捏造していないことの検証）。
    for (const horse of legacy.horses) {
      const runner = runners.find((r) => r.canonicalHorseId === horse.horseId)!;
      expect(runner.horseName).toBe(horse.horseName);
      expect(runner.finishPosition).toBe(horse.actualFinishPosition);
    }

    // finishPositionが1〜11の一意な値であること（フルフィールド・完走）を確認する。
    const positions = runners.map((r) => r.finishPosition).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    expect(() => validateRaceResultArtifact({
      resultStatus: "FINAL",
      resultVersion: 1,
      resultAvailableAt: "1970-01-01T00:00:00Z",
      retrievedAt: "1970-01-01T00:00:00Z",
      source: "structural-conversion-test-only（公式source identifier未確認・Production保存禁止）",
      sourceIdentifier: "structural-conversion-test-only",
      race: {
        raceId: legacy.race.raceId,
        raceDate: legacy.race.raceDate,
        raceName: legacy.race.raceName,
        scheduledStartTime: null,
        officialStarterCount: runners.length,
        resultEntryCount: runners.length,
      },
      runners,
    })).not.toThrow();
  });

  it("構造変換したRunnersからRaceResultArtifactを構築し、serialize/deserializeで内容が一致する（実運用への保存はしない）", () => {
    const legacy = loadLegacyDerivedRace();
    const runners = toResultArtifactRunners(legacy.horses);

    const artifact = buildRaceResultArtifact({
      resultStatus: "FINAL",
      resultVersion: 1,
      // NOTE: 公式のresultAvailableAt/source/sourceIdentifierは未確認。
      // 実在するかのような値を捏造せず、test-onlyであることが分かる値のみを使う。
      resultAvailableAt: "1970-01-01T00:00:00Z",
      retrievedAt: "1970-01-01T00:00:00Z",
      source: "structural-conversion-test-only（公式source identifier未確認・Production保存禁止）",
      sourceIdentifier: "structural-conversion-test-only",
      race: {
        raceId: legacy.race.raceId,
        raceDate: legacy.race.raceDate,
        raceName: legacy.race.raceName,
        scheduledStartTime: null,
        officialStarterCount: runners.length,
        resultEntryCount: runners.length,
      },
      runners,
    });

    const serialized = serializeRaceResultArtifact(artifact);
    expect(deserializeRaceResultArtifact(serialized)).toEqual(artifact);

    // append-only storeへの保存自体は「schema互換性の技術検証」としてtempDirのみで行う。
    // production KEIBA_DATA_DIR/resultsには一切書き込まない。
    const persisted = persistRaceResultArtifact(artifact, { dir: tempDir });
    expect(persisted.status).toBe("created");
    expect(readRaceResultArtifact(artifact.artifactId, { dir: tempDir })?.runners).toHaveLength(11);
  });
});

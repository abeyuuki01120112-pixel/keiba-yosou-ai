/**
 * Historical Lap Data Intake V1（CHECKPOINT14C.2B）の単体テスト。
 * 全て合成データ（テスト用フィクスチャ）であり、実Lapデータではない
 * （実Lap Data Packageは本ラウンド時点で未着手・未着信）。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planLapDataImport, runLapDataDryRun, writeRaceLapDataStoreIfClean, loadRaceLapDataStore } from "../racePaceValidationIntake";
import type { RaceLapSequenceRecord } from "../racePaceValidationTypes";

function lapRecord(overrides: Partial<RaceLapSequenceRecord> = {}): RaceLapSequenceRecord {
  return {
    raceId: "JRA-TEST-01",
    raceDate: "2026-01-01",
    raceName: "テストレース",
    raceNumber: 11,
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    fieldSize: 14,
    courseLayout: null,
    raceClass: null,
    segmentMeters: 200,
    lapSequence: [12.5, 11.2, 11.8, 11.9, 12.0, 12.1, 12.0, 11.7, 11.5, 11.9],
    source: "test",
    sourceRaceId: null,
    importedAt: null,
    ...overrides,
  };
}

describe("runLapDataDryRun", () => {
  it("正常なレコードのみならblocked=false、validRecordsが件数と一致する", () => {
    const result = runLapDataDryRun([lapRecord({ raceId: "R1" }), lapRecord({ raceId: "R2" })], []);
    expect(result.records).toBe(2);
    expect(result.validRecords).toBe(2);
    expect(result.blocked).toBe(false);
    expect(result.metadataConflicts).toEqual([]);
    expect(result.lapLengthErrors).toEqual([]);
  });

  it("segmentMeters<=0はlapLengthErrorsに入りblockedになる", () => {
    const result = runLapDataDryRun([lapRecord({ raceId: "R1", segmentMeters: 0 })], []);
    expect(result.lapLengthErrors).toContain("R1");
    expect(result.blocked).toBe(true);
  });

  it("lapSequenceが空、または非正の値を含む場合はlapLengthErrors", () => {
    const empty = runLapDataDryRun([lapRecord({ raceId: "R1", lapSequence: [] })], []);
    expect(empty.lapLengthErrors).toContain("R1");
    const negative = runLapDataDryRun([lapRecord({ raceId: "R2", lapSequence: [12.5, -1, 11.8] })], []);
    expect(negative.lapLengthErrors).toContain("R2");
  });

  it("必須メタデータ欠落（raceName空等）はlapLengthErrors扱いでblockedになる", () => {
    const result = runLapDataDryRun([lapRecord({ raceId: "R1", raceName: "" })], []);
    expect(result.lapLengthErrors).toContain("R1");
    expect(result.blocked).toBe(true);
  });

  it("distanceとlapSequence×segmentMetersが大きく食い違う場合はdistanceMismatch", () => {
    const result = runLapDataDryRun([lapRecord({ raceId: "R1", distance: 3200, lapSequence: [12.5, 11.2, 11.8] })], []);
    expect(result.distanceMismatch).toContain("R1");
    expect(result.blocked).toBe(true);
  });

  it("既存storeと同一内容の再送信はduplicateでblockしない", () => {
    const existing = [lapRecord({ raceId: "R1" })];
    const result = runLapDataDryRun([lapRecord({ raceId: "R1" })], existing);
    expect(result.duplicates).toContain("R1");
    expect(result.blocked).toBe(false);
  });

  it("既存storeと異なる内容の同一raceIdはexistingRaceConflictsでblockする（silent overwrite防止）", () => {
    const existing = [lapRecord({ raceId: "R1", going: "良" })];
    const result = runLapDataDryRun([lapRecord({ raceId: "R1", going: "稍重" })], existing);
    expect(result.existingRaceConflicts).toContain("R1");
    expect(result.blocked).toBe(true);
  });

  it("バッチ内で同一raceIdの内容が矛盾していればmetadataConflictsでblockする", () => {
    const result = runLapDataDryRun(
      [lapRecord({ raceId: "R1", going: "良" }), lapRecord({ raceId: "R1", going: "重" })],
      [],
    );
    expect(result.metadataConflicts).toContain("R1");
    expect(result.blocked).toBe(true);
  });
});

describe("planLapDataImport", () => {
  it("blockedなら常にmerged=null（自動importしない）", () => {
    const plan = planLapDataImport([lapRecord({ raceId: "R1", segmentMeters: 0 })], []);
    expect(plan.dryRun.blocked).toBe(true);
    expect(plan.merged).toBeNull();
  });

  it("クリーンなら既存+新規（重複除く）のマージ結果を返す", () => {
    const existing = [lapRecord({ raceId: "R1" })];
    const plan = planLapDataImport([lapRecord({ raceId: "R1" }), lapRecord({ raceId: "R2" })], existing);
    expect(plan.dryRun.blocked).toBe(false);
    expect(plan.merged).toHaveLength(2);
    expect(plan.merged!.map((r) => r.raceId).sort()).toEqual(["R1", "R2"]);
  });
});

describe("writeRaceLapDataStoreIfClean（一時ディレクトリ、本番data/raceLapData.jsonには一切触れない）", () => {
  it("クリーンなレコードは書き込まれ、addedCountが正しい", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "racepace-lapdata-test-"));
    const filePath = path.join(dir, "raceLapData.json");
    try {
      const result = writeRaceLapDataStoreIfClean([lapRecord({ raceId: "R1" })], filePath, "test note");
      expect(result.status).toBe("written");
      if (result.status === "written") expect(result.addedCount).toBe(1);
      const store = loadRaceLapDataStore(filePath);
      expect(store.laps).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blockedなレコードは書き込まれない（ファイル自体が作られない）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "racepace-lapdata-test-"));
    const filePath = path.join(dir, "raceLapData.json");
    try {
      const result = writeRaceLapDataStoreIfClean([lapRecord({ raceId: "R1", segmentMeters: 0 })], filePath);
      expect(result.status).toBe("blocked");
      expect(fs.existsSync(filePath)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("全件duplicateならnoopでファイルを書き換えない", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "racepace-lapdata-test-"));
    const filePath = path.join(dir, "raceLapData.json");
    try {
      writeRaceLapDataStoreIfClean([lapRecord({ raceId: "R1" })], filePath);
      const before = fs.readFileSync(filePath, "utf-8");
      const result = writeRaceLapDataStoreIfClean([lapRecord({ raceId: "R1" })], filePath);
      expect(result.status).toBe("noop");
      expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

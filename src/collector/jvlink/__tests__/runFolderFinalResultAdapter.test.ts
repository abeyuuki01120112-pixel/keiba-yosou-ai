import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adaptJvLinkFinalResultRunFolder } from "../runFolderFinalResultAdapter";
import { loadJvLinkRunFolder } from "../runFolderLoader";
import { adaptJvLinkRunFolder } from "../runFolderAdapter";

const targetRaceId = "JRA-20260913-NAKAYAMA-11";
const targetKey = "2026091306090911";
const targetProvidedAt = "20260913160000";
const retrievedAt = "2026-09-13T16:30:00+09:00";

interface Envelope {
  bytes: string;
  sourceFile: string;
  providedAt: string;
  retrievedAt: string;
}

function put(buffer: Buffer, position: number, length: number, value: string): void {
  const encoded = Buffer.from(value, "ascii");
  if (encoded.length > length) throw new Error(`fixture field too long: ${value}`);
  buffer.fill(0x20, position - 1, position - 1 + length);
  encoded.copy(buffer, position - 1);
}

function record(type: "RA" | "SE", stage: string, key: string, date = "20260913"): Buffer {
  const buffer = Buffer.alloc(type === "RA" ? 1272 : 555, 0x20);
  put(buffer, 1, 2, type);
  put(buffer, 3, 1, stage);
  put(buffer, 4, 8, date);
  put(buffer, 12, 16, key);
  buffer[buffer.length - 2] = 13;
  buffer[buffer.length - 1] = 10;
  return buffer;
}

interface RaOptions {
  stage?: string;
  raceName?: string;
  goingCode?: string;
  fieldSize?: number;
}

function ra(key: string, options: RaOptions = {}): Buffer {
  const stage = options.stage ?? "7";
  const buffer = record("RA", stage, key);
  put(buffer, 20, 2, "06"); // NAKAYAMA
  put(buffer, 26, 2, "11");
  put(buffer, 33, 60, options.raceName ?? "SENTO ISHI KINEN");
  put(buffer, 698, 4, "2200");
  put(buffer, 706, 2, "17"); // turf trackCode
  put(buffer, 710, 2, "A");
  put(buffer, 882, 2, "12");
  put(buffer, 884, 2, String(options.fieldSize ?? 4).padStart(2, "0"));
  put(buffer, 889, 1, options.goingCode ?? "1"); // 良
  return buffer;
}

interface SeOptions {
  stage?: string;
  nonStartFlag?: string;
  finishPosition?: string;
  raceTime?: string;
  final3F?: string;
  timeGap?: string;
  carriedWeight?: string;
  passing?: [string, string, string, string];
  gate?: string;
}

function se(key: string, horseId: string, horseNumber: number, options: SeOptions = {}): Buffer {
  const stage = options.stage ?? "7";
  const buffer = record("SE", stage, key);
  put(buffer, 28, 1, options.gate ?? String(horseNumber));
  put(buffer, 29, 2, String(horseNumber).padStart(2, "0"));
  put(buffer, 31, 10, horseId);
  put(buffer, 41, 36, `HORSE${String(horseNumber).padStart(2, "0")}`);
  put(buffer, 289, 3, options.carriedWeight ?? "560");
  put(buffer, 332, 1, options.nonStartFlag ?? "0");
  put(buffer, 335, 2, options.finishPosition ?? String(horseNumber).padStart(2, "0"));
  put(buffer, 339, 4, options.raceTime ?? "2213");
  const passing = options.passing ?? ["03", "03", "02", String(horseNumber).padStart(2, "0") as string];
  [352, 354, 356, 358].forEach((position, index) => put(buffer, position, 2, passing[index]));
  put(buffer, 391, 3, options.final3F ?? "345");
  put(buffer, 532, 4, options.timeGap ?? (horseNumber === 1 ? "+000" : `+00${horseNumber - 1}`));
  return buffer;
}

function envelope(buffer: Buffer, sourceFile: string, providedAt: string): Envelope {
  return { bytes: buffer.toString("base64"), sourceFile, providedAt, retrievedAt };
}

function writeJsonLines(filePath: string, rows: Envelope[]): void {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

interface RunFolderSpec {
  raOptions?: RaOptions;
  seOptions?: SeOptions[];
  horseIds?: string[];
}

function createFinalResultRunFolder(spec: RunFolderSpec = {}): string {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "keiba-jvlink-final-result-"));
  fs.mkdirSync(path.join(runDir, "raw"));
  const horseIds = spec.horseIds ?? ["2022000001", "2022000002", "2022000003", "2022000004"];
  const seOptionsList = spec.seOptions ?? horseIds.map(() => ({}));

  const targetRows: Envelope[] = [envelope(ra(targetKey, spec.raOptions), "RA_TARGET.jvd", targetProvidedAt)];
  horseIds.forEach((horseId, index) => {
    targetRows.push(envelope(
      se(targetKey, horseId, index + 1, seOptionsList[index]),
      "SE_TARGET.jvd",
      targetProvidedAt,
    ));
  });

  const historySelections = horseIds.map((horseId, index) => ({
    horseId,
    horseName: `HORSE${String(index + 1).padStart(2, "0")}`,
    status: "available",
    availableHistoryCount: 0,
    selectedRaceKeys: [] as string[],
  }));

  fs.writeFileSync(path.join(runDir, "raw/manifest.json"), JSON.stringify({
    schemaVersion: "jvlink-raw-v1",
    source: "JRA-VAN/JV-Link",
    targetRaceId,
    targetRaceKey: targetKey,
    raceDate: "2026-09-13",
    targetAsOf: "2026-09-13T17:00:00+09:00",
    collectedAt: "2026-09-13T16:31:00+09:00",
    historySelections,
    targetRecordCount: targetRows.length,
    historyRecordCount: 0,
  }, null, 2));
  writeJsonLines(path.join(runDir, "raw/target-records.jsonl"), targetRows);
  writeJsonLines(path.join(runDir, "raw/history-records.jsonl"), []);
  return runDir;
}

describe("adaptJvLinkFinalResultRunFolder（Post-Race Pipeline V1・JV-Link Final Result Adapter）", () => {
  it("A. Stage 6/7の対象確定成績run folderを正常にloadできる", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder(), targetRaceId);
    expect(loaded.targetRa.stage).toBe("7");
    expect(loaded.targetEntries).toHaveLength(4);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    expect(adapted.runners).toHaveLength(4);
    expect(adapted.unclassifiedAbnormalRunners).toHaveLength(0);
  });

  it("B. 責務分離: Stage 6/7の対象run folderは既存Stage 2 Prediction Adapterに拒否される（future leakage防止）", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder(), targetRaceId);
    expect(() => adaptJvLinkRunFolder(loaded)).toThrow("TARGET_REQUIRES_STAGE_2_RACE_CARD");
  });

  it("拒否: 対象レースがStage 2の場合、Final Result Adapterはエラーを投げる", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({ raOptions: { stage: "2" } }), targetRaceId);
    expect(() => adaptJvLinkFinalResultRunFolder(loaded)).toThrow("TARGET_IS_PRE_RACE_STAGE_2");
  });

  it("拒否: 対象レースがStage Bの場合は未対応としてエラーを投げる", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({ raOptions: { stage: "B" } }), targetRaceId);
    expect(() => adaptJvLinkFinalResultRunFolder(loaded)).toThrow("UNSUPPORTED_TARGET_STAGE_B");
  });

  it("C/D/E/F/G. RA/SEからBuildRaceResultArtifactV2Input相当へmappingする（finishPosition/actualRaceTime/timeGap/final3F/carriedWeight）", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder(), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    expect(adapted.race).toMatchObject({
      raceId: targetRaceId,
      raceDate: "2026-09-13",
      racecourse: "中山",
      distance: 2200,
      surface: "turf",
      going: "良",
    });
    const winner = adapted.runners.find((r) => r.horseNumber === 1)!;
    expect(winner.finishPosition).toBe(1);
    expect(winner.actualRaceTime).toBeCloseTo(2 * 60 + 21.3, 5);
    expect(winner.resultTimeBehindWinnerSeconds).toBe(0);
    expect(winner.final3F).toBeCloseTo(34.5, 5);
    expect(winner.carriedWeight).toBeCloseTo(56, 5);
  });

  it("H/I. passingPositionとcarriedWeightが正しくmappingされる", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder(), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    const winner = adapted.runners.find((r) => r.horseNumber === 1)!;
    expect(winner.passingPosition).toMatchObject({
      cornerPositions: [3, 3, 2, 1],
      fieldSize: 4,
      source: "JRA-VAN/JV-Link",
      isReliable: true,
    });
  });

  it("final3FRankを競技順位（同着は同順位、次は繰り下げ）で計算する", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({
      seOptions: [
        { final3F: "345" }, { final3F: "345" }, { final3F: "340" }, { final3F: "350" },
      ],
    }), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    const rankByNumber = new Map(adapted.runners.map((r) => [r.horseNumber, r.final3FRank]));
    expect(rankByNumber.get(3)).toBe(1);
    expect(rankByNumber.get(1)).toBe(2);
    expect(rankByNumber.get(2)).toBe(2);
    expect(rankByNumber.get(4)).toBe(4);
  });

  it("J. goingが「未発表」の場合、race.goingはnullへ正規化される（0やダミーで埋めない）", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({ raOptions: { goingCode: "0" } }), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    expect(adapted.race.going).toBeNull();
  });

  it("K. 欠損値（raceTime=0000/final3F=000/timeGap無し等）はnullへ正規化され、0として扱われない", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({
      seOptions: [
        { raceTime: "0000", final3F: "000", timeGap: "+000", passing: ["00", "00", "00", "00"], carriedWeight: "000" },
        {}, {}, {},
      ],
    }), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    const runner = adapted.runners.find((r) => r.horseNumber === 1)!;
    expect(runner.actualRaceTime).toBeNull();
    expect(runner.final3F).toBeNull();
    expect(runner.final3FRank).toBeNull();
    expect(runner.carriedWeight).toBeNull();
    expect(runner.passingPosition).toBeNull();
    // timeGap="+000"は正規表現上有効な値（0秒差）であり欠損ではない。
    expect(runner.resultTimeBehindWinnerSeconds).toBe(0);
  });

  it("異常区分: field(332,1)!==\"0\"の走者はunclassifiedAbnormalRunnersへ分離され、finishPosition等を推測しない", () => {
    const loaded = loadJvLinkRunFolder(createFinalResultRunFolder({
      seOptions: [
        { nonStartFlag: "1", finishPosition: "00", gate: "0" },
        {}, {}, {},
      ],
    }), targetRaceId);
    const adapted = adaptJvLinkFinalResultRunFolder(loaded);
    expect(adapted.runners).toHaveLength(3);
    expect(adapted.unclassifiedAbnormalRunners).toHaveLength(1);
    expect(adapted.unclassifiedAbnormalRunners[0]).toMatchObject({
      canonicalHorseId: "2022000001",
      nonStartFlagRaw: "1",
      frameNumber: null,
    });
  });

  it("N. 対象raceIdの不整合はloadJvLinkRunFolder側で拒否される", () => {
    expect(() => loadJvLinkRunFolder(createFinalResultRunFolder(), "JRA-20260913-HANSHIN-11"))
      .toThrow("JVLINK_TARGET_RACE_ID_MISMATCH");
  });

  it("重複canonicalHorseId（同一key・同一horseId・異内容のSE）はloadJvLinkRunFolder側で拒否される", () => {
    // recordsAsOf()の同一性キーはtype:key:horseIdであるため、同一horseIdの２枚を
    // 同一providedAtで与えると（内容が異なる限り）CONFLICTING_JV_REVISIONSとして
    // 既にloader側で拒否される。DUPLICATE_JVLINK_TARGET_HORSE_ID到達前の、
    // より手前の安全側チェックであることを確認する。
    expect(() => loadJvLinkRunFolder(
      createFinalResultRunFolder({ horseIds: ["2022000001", "2022000001", "2022000003", "2022000004"] }),
      targetRaceId,
    )).toThrow("CONFLICTING_JV_REVISIONS");
  });
});

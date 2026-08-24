import { describe, expect, it } from "vitest";
import { mergeHorseRaceHistory } from "../mergeHorseHistory";
import type { RaceHistoryRawInput } from "../../raceHistoryPipeline";

function race(overrides: Partial<RaceHistoryRawInput> = {}): RaceHistoryRawInput {
  return {
    raceId: "JRA-20260101-TOKYO-11",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "東京",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    ...overrides,
  };
}

describe("CHECKPOINT13.2 Test1: 既存historyが存在する状態で新規raceをimportしても既存履歴が消えない", () => {
  it("既存2走＋新規1走 → 3走になり、既存2走は無変更のまま残る", () => {
    const existing = [race({ raceId: "R1" }), race({ raceId: "R2" })];
    const incoming = [race({ raceId: "R3" })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.merged).toHaveLength(3);
    expect(result.merged[0]).toEqual(existing[0]);
    expect(result.merged[1]).toEqual(existing[1]);
    expect(result.addedRaceIds).toEqual(["R3"]);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("CHECKPOINT13.2 Test2: 同一raceを2回importしても二重登録されない", () => {
  it("既存と完全一致するraceIdはduplicateRaceIdsに入り、merged件数は増えない", () => {
    const existing = [race({ raceId: "R1" })];
    const incoming = [race({ raceId: "R1" })]; // 完全に同じ内容
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.merged).toHaveLength(1);
    expect(result.duplicateRaceIds).toEqual(["R1"]);
    expect(result.addedRaceIds).toEqual([]);
    expect(result.conflicts).toHaveLength(0);
  });

  it("同一バッチ内（incoming自体）に同じraceIdが複数あっても二重登録しない", () => {
    const existing: RaceHistoryRawInput[] = [];
    const incoming = [race({ raceId: "R1", final3F: 34 }), race({ raceId: "R1", final3F: 34 })];
    const result = mergeHorseRaceHistory(existing, incoming);
    expect(result.merged).toHaveLength(1);
    expect(result.addedRaceIds).toEqual(["R1"]);
  });

  it("importedAtの違いはconflict扱いしない（取り込みの度に変わるのが正常なため）", () => {
    const existing = [race({ raceId: "R1", importedAt: "2026-01-01T00:00:00.000Z" })];
    const incoming = [race({ raceId: "R1", importedAt: "2026-02-01T00:00:00.000Z" })];
    const result = mergeHorseRaceHistory(existing, incoming);
    expect(result.duplicateRaceIds).toEqual(["R1"]);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("CHECKPOINT13.2 Test3: 同一horseId/raceIdで値が競合した場合、silent overwriteしない", () => {
  it("final3Fが既存と異なる同一raceIdはconflictとして検出され、mergedは既存値を維持する", () => {
    const existing = [race({ raceId: "R1", final3F: 34.2 })];
    const incoming = [race({ raceId: "R1", final3F: 34.5 })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].raceId).toBe("R1");
    expect(result.conflicts[0].differences).toEqual(
      expect.arrayContaining([{ field: "final3F", existingValue: 34.2, incomingValue: 34.5 }]),
    );
    // 既存値がそのままmergedに残る（新規値で上書きされていない）
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].final3F).toBe(34.2);
    expect(result.addedRaceIds).toEqual([]);
    expect(result.duplicateRaceIds).toEqual([]);
  });

  it("複数フィールドが食い違う場合、全ての差分がdifferencesに列挙される", () => {
    const existing = [race({ raceId: "R1", final3F: 34.2, raceTime: 120 })];
    const incoming = [race({ raceId: "R1", final3F: 34.5, raceTime: 121 })];
    const result = mergeHorseRaceHistory(existing, incoming);
    const fields = result.conflicts[0].differences.map((d) => d.field).sort();
    expect(fields).toEqual(["final3F", "raceTime"]);
  });
});

describe("CHECKPOINT14A.2 Non-destructive Enrichment Merge", () => {
  it("Test A: 既存passingPosition=null・fieldSize=null、新規に値がある → 両方とも安全に補完される", () => {
    const existing = [race({ raceId: "R1", fieldSize: null, passingPosition: null })];
    const incoming = [
      race({
        raceId: "R1",
        fieldSize: 16,
        passingPosition: { cornerPositions: [7, 6], fieldSize: 16, source: "test", isReliable: true },
        importedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.conflicts).toHaveLength(0);
    expect(result.duplicateRaceIds).toEqual([]);
    expect(result.addedRaceIds).toEqual([]);
    expect(result.enriched).toEqual([{ raceId: "R1", enrichedFields: ["fieldSize", "passingPosition"] }]);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].fieldSize).toBe(16);
    expect(result.merged[0].passingPosition).toEqual({
      cornerPositions: [7, 6],
      fieldSize: 16,
      source: "test",
      isReliable: true,
    });
    // core fieldは既存のまま変化しない
    expect(result.merged[0].raceTime).toBe(existing[0].raceTime);
    expect(result.merged[0].finishPosition).toBe(existing[0].finishPosition);
    // importedAtだけenrichment実行時刻へ更新される（8節: provenance追跡）
    expect(result.merged[0].importedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("Test B: 既存・新規が完全に同じenrichment値 → no-op（duplicate）", () => {
    const pp = { cornerPositions: [7, 6], fieldSize: 16, source: "test", isReliable: true };
    const existing = [race({ raceId: "R1", fieldSize: 16, passingPosition: pp })];
    const incoming = [race({ raceId: "R1", fieldSize: 16, passingPosition: { ...pp } })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.duplicateRaceIds).toEqual(["R1"]);
    expect(result.enriched).toEqual([]);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged[0]).toEqual(existing[0]);
  });

  it("Test C: 既存passingPositionと新規passingPositionが異なる値 → conflict（自動採用しない、既存を維持）", () => {
    const existingPP = { cornerPositions: [7, 6], fieldSize: 16, source: "test", isReliable: true };
    const incomingPP = { cornerPositions: [3, 2], fieldSize: 16, source: "test", isReliable: true };
    const existing = [race({ raceId: "R1", fieldSize: 16, passingPosition: existingPP })];
    const incoming = [race({ raceId: "R1", fieldSize: 16, passingPosition: incomingPP })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].raceId).toBe("R1");
    expect(result.conflicts[0].differences).toEqual([
      { field: "passingPosition", existingValue: existingPP, incomingValue: incomingPP },
    ]);
    expect(result.merged[0].passingPosition).toEqual(existingPP); // 既存維持、上書きしない
    expect(result.enriched).toEqual([]);
  });

  it("Test D: core field（raceTime）が食い違う場合、passingPosition/fieldSizeが正しくてもrecord全体がconflict扱いになる", () => {
    const pp = { cornerPositions: [7, 6], fieldSize: 16, source: "test", isReliable: true };
    const existing = [race({ raceId: "R1", raceTime: 120.1, fieldSize: null, passingPosition: null })];
    const incoming = [race({ raceId: "R1", raceTime: 121.5, fieldSize: 16, passingPosition: pp })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].differences).toEqual([
      { field: "raceTime", existingValue: 120.1, incomingValue: 121.5 },
    ]);
    // enrichment対象になり得たfieldSize/passingPositionも、core conflictのため一切適用されない
    expect(result.enriched).toEqual([]);
    expect(result.merged[0].fieldSize).toBeNull();
    expect(result.merged[0].passingPosition).toBeNull();
  });

  it("既存populated・新規null（CASE C）はそのfieldに関して既存を維持し、enrichedにもconflictにも入らない", () => {
    const existing = [race({ raceId: "R1", fieldSize: 16, passingPosition: null })];
    const incoming = [race({ raceId: "R1", fieldSize: null, passingPosition: null })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.duplicateRaceIds).toEqual(["R1"]);
    expect(result.enriched).toEqual([]);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged[0].fieldSize).toBe(16);
  });

  it("Test F: 2コーナーのみのコース分のpassingPosition（要素数2）もそのまま補完される（存在しないコーナーを補完しない）", () => {
    const existing = [race({ raceId: "R1", fieldSize: null, passingPosition: null })];
    const incoming = [
      race({
        raceId: "R1",
        fieldSize: 8,
        passingPosition: { cornerPositions: [8, 7], fieldSize: 8, source: "test", isReliable: true },
      }),
    ];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.enriched).toEqual([{ raceId: "R1", enrichedFields: ["fieldSize", "passingPosition"] }]);
    expect(result.merged[0].passingPosition?.cornerPositions).toEqual([8, 7]);
  });

  it("片方のenrichment fieldのみ補完可能な場合、enrichedFieldsにはそのfieldのみ含まれる", () => {
    const existing = [race({ raceId: "R1", fieldSize: null, passingPosition: null })];
    const incoming = [race({ raceId: "R1", fieldSize: 16, passingPosition: null })];
    const result = mergeHorseRaceHistory(existing, incoming);

    expect(result.enriched).toEqual([{ raceId: "R1", enrichedFields: ["fieldSize"] }]);
    expect(result.merged[0].fieldSize).toBe(16);
    expect(result.merged[0].passingPosition).toBeNull();
  });
});

describe("merge結果の一般的な健全性", () => {
  it("既存が空でも正しく新規追加できる", () => {
    const result = mergeHorseRaceHistory([], [race({ raceId: "R1" })]);
    expect(result.merged).toHaveLength(1);
    expect(result.addedRaceIds).toEqual(["R1"]);
  });

  it("新規取り込みが空なら既存はそのまま返る", () => {
    const existing = [race({ raceId: "R1" })];
    const result = mergeHorseRaceHistory(existing, []);
    expect(result.merged).toEqual(existing);
    expect(result.addedRaceIds).toEqual([]);
    expect(result.duplicateRaceIds).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});

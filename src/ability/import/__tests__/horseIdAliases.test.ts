import { describe, expect, it } from "vitest";
import { buildImportResult } from "../buildImportResult";
import { buildHorseIdAliasesByName } from "../horseIdAliases";

const HEADER =
  "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize";

describe("buildHorseIdAliasesByName", () => {
  it("馬名 -> horseId のマップを作る", () => {
    const map = buildHorseIdAliasesByName([
      { horseId: "shakeyourheart", horseName: "シェイクユアハート" },
      { horseId: "roshampark", horseName: "ローシャムパーク" },
    ]);
    expect(map["シェイクユアハート"]).toBe("shakeyourheart");
    expect(map["ローシャムパーク"]).toBe("roshampark");
  });
});

describe("buildImportResult の horseIdAliasesByName オプション", () => {
  it("外部ID（JRA公式IDなど）を、馬名が一致すれば内部horseIdへ差し替える", () => {
    const csv = [
      HEADER,
      [
        "JRA-20260614-HANSHIN-11",
        "2026-06-14",
        "阪神",
        "11",
        "宝塚記念",
        "turf",
        "2200",
        "重",
        "2020103101", // JRA公式ID（外部）
        "シェイクユアハート",
        "13",
        "7",
        "14",
        "58.0",
        "134.9",
        "36.9",
        "2.8",
        "18",
      ].join(","),
    ].join("\n");

    const result = buildImportResult(csv, {
      horseIdAliasesByName: { シェイクユアハート: "shakeyourheart" },
    });

    expect(result.errorCount).toBe(0);
    expect(result.byHorseId.shakeyourheart).toBeDefined();
    expect(result.byHorseId["2020103101"]).toBeUndefined();
    expect(result.usable[0].horseId).toBe("shakeyourheart");
  });

  it("馬名が一致しない場合はCSV由来のhorseIdをそのまま使う", () => {
    const csv = [
      HEADER,
      [
        "JRA-20260614-HANSHIN-11",
        "2026-06-14",
        "阪神",
        "11",
        "宝塚記念",
        "turf",
        "2200",
        "重",
        "2021103272",
        "メイショウタバル",
        "16",
        "8",
        "1",
        "58.0",
        "132.1",
        "35.3",
        "0.0",
        "18",
      ].join(","),
    ].join("\n");

    const result = buildImportResult(csv, {
      horseIdAliasesByName: { シェイクユアハート: "shakeyourheart" },
    });

    expect(result.byHorseId["2021103272"]).toBeDefined();
  });

  it("オプション省略時は従来どおりCSVのhorseIdをそのまま使う（既存の挙動を壊さない）", () => {
    const csv = [
      HEADER,
      [
        "r1",
        "2026-01-01",
        "東京",
        "",
        "テスト",
        "turf",
        "2000",
        "良",
        "h1",
        "馬1",
        "",
        "",
        "1",
        "56",
        "119.0",
        "34.0",
        "-0.2",
        "",
      ].join(","),
    ].join("\n");
    const result = buildImportResult(csv);
    expect(result.byHorseId.h1).toBeDefined();
  });
});

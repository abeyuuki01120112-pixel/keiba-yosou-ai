import { describe, expect, it } from "vitest";
import { buildImportResult, toRaceHistoryRawInput } from "../buildImportResult";
import { buildRaceHistory } from "../../raceHistoryPipeline";
import { calculateBaseAbility } from "../../baseAbility";
import { buildHorseAbilityProfile } from "../../buildHorseAbilityProfile";
import type { RacePerformanceInput } from "../types";

const HEADER =
  "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize";

function row(fields: Record<string, string | number>): string {
  const order = HEADER.split(",");
  return order.map((key) => String(fields[key] ?? "")).join(",");
}

describe("buildImportResult", () => {
  it("CSVを読み込み、行数・正常データ件数・エラー件数を正しく集計する", () => {
    const csv = [
      HEADER,
      row({
        raceId: "r1",
        raceDate: "2026-01-01",
        racecourse: "東京",
        raceName: "A",
        surface: "turf",
        distance: 2000,
        going: "良",
        horseId: "h1",
        horseName: "馬1",
        finishPosition: 1,
        carriedWeightKg: 56,
        actualRaceTimeSeconds: 119.5,
        final3FSeconds: 34.5,
        timeGapSeconds: -0.3,
      }),
      // distanceが不正 -> エラー
      row({
        raceId: "r1",
        raceDate: "2026-01-01",
        racecourse: "東京",
        raceName: "A",
        surface: "turf",
        distance: -1,
        going: "良",
        horseId: "h2",
        horseName: "馬2",
        finishPosition: 2,
        carriedWeightKg: 55,
        actualRaceTimeSeconds: 120.0,
        final3FSeconds: 35.0,
        timeGapSeconds: 0.5,
      }),
    ].join("\n");

    const result = buildImportResult(csv);
    expect(result.totalRows).toBe(2);
    expect(result.normalizedCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].horseId).toBe("h2");
  });

  it("異常データ1件があっても他の正常な行の処理は続行される（アプリ全体が落ちない）", () => {
    const csv = [
      HEADER,
      row({ raceId: "", raceDate: "2026-01-01", racecourse: "東京", raceName: "A", surface: "turf", distance: 2000, going: "良", horseId: "h-bad" }),
      row({
        raceId: "r1",
        raceDate: "2026-01-01",
        racecourse: "東京",
        raceName: "A",
        surface: "turf",
        distance: 2000,
        going: "良",
        horseId: "h-good",
        horseName: "馬good",
        finishPosition: 1,
        carriedWeightKg: 56,
        actualRaceTimeSeconds: 119.5,
        final3FSeconds: 34.5,
        timeGapSeconds: -0.3,
      }),
    ].join("\n");

    expect(() => buildImportResult(csv)).not.toThrow();
    const result = buildImportResult(csv);
    expect(result.errorCount).toBe(1);
    expect(result.byHorseId["h-good"]).toBeDefined();
    expect(result.byHorseId["h-good"]).toHaveLength(1);
  });

  it("欠損項目のある行は能力計算対象から除外される（0で埋めない）", () => {
    const csv = [
      HEADER,
      row({
        raceId: "r1",
        raceDate: "2026-01-01",
        racecourse: "東京",
        raceName: "A",
        surface: "turf",
        distance: 2000,
        going: "良",
        horseId: "h1",
        horseName: "馬1",
        finishPosition: "", // 欠損（競走中止等）
        carriedWeightKg: 56,
        actualRaceTimeSeconds: "",
        final3FSeconds: 34.5,
        timeGapSeconds: 0.5,
      }),
    ].join("\n");

    const result = buildImportResult(csv);
    expect(result.normalizedCount).toBe(1);
    expect(result.excludedFromScoringCount).toBe(1);
    expect(result.byHorseId.h1).toBeUndefined();
    expect(result.excluded[0].finishPosition).toBeNull();
  });

  it("raceId・horseIdで識別する（同名馬・同名レースでも取り違えない）", () => {
    const csv = [
      HEADER,
      row({
        raceId: "r1",
        raceDate: "2026-01-01",
        racecourse: "東京",
        raceName: "同名レース",
        surface: "turf",
        distance: 2000,
        going: "良",
        horseId: "horse-a",
        horseName: "同名馬",
        finishPosition: 1,
        carriedWeightKg: 56,
        actualRaceTimeSeconds: 119.0,
        final3FSeconds: 34.0,
        timeGapSeconds: -0.2,
      }),
      row({
        raceId: "r2",
        raceDate: "2026-02-01",
        racecourse: "東京",
        raceName: "同名レース",
        surface: "turf",
        distance: 2000,
        going: "良",
        horseId: "horse-b",
        horseName: "同名馬",
        finishPosition: 3,
        carriedWeightKg: 55,
        actualRaceTimeSeconds: 121.0,
        final3FSeconds: 36.0,
        timeGapSeconds: 0.9,
      }),
    ].join("\n");

    const result = buildImportResult(csv);
    // horseNameが同じでもhorseIdが違えば別馬として扱われる
    expect(Object.keys(result.byHorseId).sort()).toEqual(["horse-a", "horse-b"]);
    expect(result.byHorseId["horse-a"][0].raceId).toBe("r1");
    expect(result.byHorseId["horse-b"][0].raceId).toBe("r2");
  });

  it("ability計算（baseAbility）へ接続できる", () => {
    const rows: string[] = [HEADER];
    const dates = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];
    for (const [i, date] of dates.entries()) {
      rows.push(
        row({
          raceId: `race-${i}`,
          raceDate: date,
          racecourse: "東京",
          raceName: `レース${i}`,
          surface: "turf",
          distance: 2000,
          going: "良",
          horseId: "h1",
          horseName: "馬1",
          finishPosition: 1,
          carriedWeightKg: 56,
          actualRaceTimeSeconds: 119.0,
          final3FSeconds: 34.0,
          timeGapSeconds: -0.2,
        }),
      );
    }
    const result = buildImportResult(rows.join("\n"));
    expect(result.byHorseId.h1).toHaveLength(5);

    const history = buildRaceHistory(result.byHorseId);
    const profile = buildHorseAbilityProfile("h1", "馬1", history.h1);
    expect(profile.baseAbility).toBeCloseTo(calculateBaseAbility(history.h1), 5);
    expect(profile.baseAbility).toBeGreaterThan(0);
  });
});

describe("toRaceHistoryRawInput", () => {
  const complete: RacePerformanceInput = {
    raceId: "r1",
    horseId: "h1",
    horseName: "馬1",
    raceDate: "2026-01-01",
    racecourse: "東京",
    raceName: "テスト",
    raceNumber: null,
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    carriedWeightKg: 56,
    actualRaceTimeSeconds: 119.0,
    final3FSeconds: 34.0,
    timeGapSeconds: -0.2,
    gate: null,
    horseNumber: null,
    fieldSize: null,
    passingPosition: null,
  };

  it("欠損が無ければRaceHistoryRawInputへ変換できる", () => {
    const result = toRaceHistoryRawInput(complete);
    expect(result).not.toBeNull();
    expect(result?.raceTime).toBe(119.0);
    expect(result?.final3F).toBe(34.0);
    expect(result?.carriedWeight).toBe(56);
    expect(result?.timeGap).toBe(-0.2);
  });

  it("いずれか1項目でも欠損していればnullを返す", () => {
    expect(toRaceHistoryRawInput({ ...complete, finishPosition: null })).toBeNull();
    expect(toRaceHistoryRawInput({ ...complete, carriedWeightKg: null })).toBeNull();
    expect(toRaceHistoryRawInput({ ...complete, actualRaceTimeSeconds: null })).toBeNull();
    expect(toRaceHistoryRawInput({ ...complete, final3FSeconds: null })).toBeNull();
    expect(toRaceHistoryRawInput({ ...complete, timeGapSeconds: null })).toBeNull();
  });
});

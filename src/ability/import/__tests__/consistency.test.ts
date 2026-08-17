/**
 * 「仮データ（data/horses/*.json）を経由した計算結果」と
 * 「同じデータをCSV化してimport層を経由した計算結果」が一致することを確認する。
 * CSVインポート機構が既存の能力計算と矛盾しないことの回帰テスト。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildImportResult } from "../buildImportResult";
import { buildRaceHistory } from "../../raceHistoryPipeline";
import { buildHorseAbilityProfile } from "../../buildHorseAbilityProfile";
import { loadAllHorseAbilityProfiles } from "../../horseAbilityData";
import rawCourseTimeBaselines from "../../data/courseTimeBaselines.json";
import rawCourseFinal3FBaselines from "../../data/courseFinal3FBaselines.json";
import rawRaceFieldAggregates from "../../data/raceFieldAggregates.json";
import rawSimHorses from "../../../simulation/data/sapporoKinen.json";
import type { CourseFinal3FBaseline, CourseTimeBaseline, RaceFieldAggregate } from "../../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HORSES_DIR = path.resolve(__dirname, "../../data/horses");

const CSV_HEADER =
  "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize";

interface RawRace {
  raceId: string;
  raceName: string;
  raceDate: string;
  racecourse: string;
  surface: string;
  distance: number;
  going: string;
  finishPosition: number;
  timeGap: number;
  raceTime: number;
  final3F: number;
  carriedWeight: number;
}

function buildCombinedCsv(): string {
  const nameById = new Map(rawSimHorses.horses.map((h) => [h.horseId, h.horseName]));
  const lines = [CSV_HEADER];

  for (const file of fs.readdirSync(HORSES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const horseId = file.replace(/\.json$/, "");
    const races: RawRace[] = JSON.parse(fs.readFileSync(path.join(HORSES_DIR, file), "utf-8"));
    for (const r of races) {
      lines.push(
        [
          r.raceId,
          r.raceDate,
          r.racecourse,
          "",
          r.raceName,
          r.surface,
          r.distance,
          r.going,
          horseId,
          nameById.get(horseId) ?? horseId,
          "",
          "",
          r.finishPosition,
          r.carriedWeight,
          r.raceTime,
          r.final3F,
          r.timeGap,
          "",
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}

describe("CSVインポート経由の計算結果が既存データと一致する", () => {
  it("全馬をCSV化してimport→ability計算しても、既存のraceScore/baseAbilityと一致する", () => {
    const csv = buildCombinedCsv();
    const importResult = buildImportResult(csv);

    // 仮データはすべて完全なデータなので、エラー・除外は発生しないはず
    expect(importResult.errorCount).toBe(0);
    expect(importResult.excludedFromScoringCount).toBe(0);

    const timeBaselines = rawCourseTimeBaselines.baselines as unknown as CourseTimeBaseline[];
    const final3FBaselines = rawCourseFinal3FBaselines.baselines as unknown as CourseFinal3FBaseline[];
    const fieldAggregates = rawRaceFieldAggregates.aggregates as unknown as RaceFieldAggregate[];
    const fieldAggregatesByRaceId = Object.fromEntries(fieldAggregates.map((a) => [a.raceId, a]));
    const historyFromCsv = buildRaceHistory(
      importResult.byHorseId,
      timeBaselines,
      final3FBaselines,
      fieldAggregatesByRaceId,
    );

    const existingProfiles = loadAllHorseAbilityProfiles();
    expect(existingProfiles.length).toBeGreaterThan(0);

    for (const existingProfile of existingProfiles) {
      const csvRaces = historyFromCsv[existingProfile.horseId];
      expect(csvRaces, `${existingProfile.horseId}のCSV変換結果が無い`).toBeDefined();

      const csvProfile = buildHorseAbilityProfile(existingProfile.horseId, existingProfile.horseName, csvRaces);

      // baseAbilityが一致する
      expect(csvProfile.baseAbility, `${existingProfile.horseId}のbaseAbilityが不一致`).toBeCloseTo(
        existingProfile.baseAbility,
        5,
      );

      // 各レースのraceScoreも一致する（raceId単位で突き合わせ）
      expect(csvProfile.recentRaces).toHaveLength(existingProfile.recentRaces.length);
      for (const existingRace of existingProfile.recentRaces) {
        const csvRace = csvProfile.recentRaces.find((r) => r.raceId === existingRace.raceId);
        expect(csvRace, `${existingProfile.horseId}のraceId=${existingRace.raceId}が見つからない`).toBeDefined();
        expect(csvRace!.raceScore).toBeCloseTo(existingRace.raceScore, 5);
        expect(csvRace!.memberLevelScoreAtRace).toBeCloseTo(existingRace.memberLevelScoreAtRace, 5);
        expect(csvRace!.raceTimeScore).toBeCloseTo(existingRace.raceTimeScore, 5);
        expect(csvRace!.final3FScore).toBeCloseTo(existingRace.final3FScore, 5);
        expect(csvRace!.weightScore).toBeCloseTo(existingRace.weightScore, 5);
      }
    }
  });

  it("サンプルCSV（data/ability/import/race-performances.csv）は1レースぶんの実データを正しく取り込める", () => {
    const samplePath = path.resolve(__dirname, "../../data/import/race-performances.csv");
    const csv = fs.readFileSync(samplePath, "utf-8");
    const result = buildImportResult(csv);

    expect(result.errorCount).toBe(0);
    expect(result.excludedFromScoringCount).toBe(0);
    expect(result.totalRows).toBe(5);
    expect(Object.keys(result.byHorseId).sort()).toEqual(
      ["admireterra", "meinermount", "roshampark", "sakurafarrell", "shohei"].sort(),
    );

    const roshamparkRace = result.byHorseId.roshampark[0];
    expect(roshamparkRace).toEqual({
      raceId: "r0-g1",
      raceName: "東京特別戦",
      raceDate: "2026-06-20",
      racecourse: "東京",
      surface: "turf",
      distance: 1900,
      going: "良",
      finishPosition: 2,
      timeGap: 0.6,
      raceTime: 116.9,
      final3F: 36.3,
      carriedWeight: 56,
    });
  });
});

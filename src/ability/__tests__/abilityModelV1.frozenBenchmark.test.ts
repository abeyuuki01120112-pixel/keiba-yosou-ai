/**
 * Ability Model V1 Frozen Benchmark（CHECKPOINT13.4Dで正式導入）。
 *
 * CHECKPOINT13.4Cで判明した通り、`src/ability/data/horses/`（本番canonical dataset）は
 * 実データImportのたびに内容が増減し、それに伴いBase Abilityの値も
 * （数式が完全に無変更でも）変動しうる。これは「Model Freeze」と「Dataset Freeze」が
 * 別概念であることを意味する。
 *
 * このテストは「Dataset Freeze」専用：CHECKPOINT12.6/CP13.4A時点（commit 2f3c9a4）の
 * data/horses全体・courseTimeBaselines・courseFinal3FBaselines・raceFieldAggregatesを
 * まるごと凍結した `fixtures/benchmark-dataset-cp12_6.json` から直接buildRaceHistory()を
 * 実行する。本番data/horsesを一切読まないため、本番データがどれだけ増えても
 * このテストの期待値（70.3）は変化しない。
 *
 * 「Model Freeze」（formula/weights自体の回帰）は、本番データを使う
 * `abilityModelV1.regression.test.ts`の決定性テスト、および本ファイルの
 * 両方でカバーする。式そのものを変更する場合はV1を黙って書き換えず、
 * Ability Model V2として切り出すこと（docs/ability-model-v1.md「凍結ルール」）。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildRaceHistory, type RaceHistoryRawInput } from "../raceHistoryPipeline";
import { buildHorseAbilityProfile } from "../buildHorseAbilityProfile";
import type { CourseFinal3FBaseline, CourseTimeBaseline, RaceFieldAggregate } from "../types";

interface FrozenBenchmarkFixture {
  _meta: { description: string; sourceCommit: string; horseFileCount: number };
  horses: Record<string, RaceHistoryRawInput[]>;
  courseTimeBaselines: CourseTimeBaseline[];
  courseFinal3FBaselines: CourseFinal3FBaseline[];
  raceFieldAggregates: RaceFieldAggregate[];
}

const FIXTURE_PATH = path.resolve(__dirname, "fixtures/benchmark-dataset-cp12_6.json");

function loadFixture(): FrozenBenchmarkFixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8"));
}

describe("CHECKPOINT13.4D Frozen Benchmark: CP12.6 fixture（本番データに一切依存しない）", () => {
  it("fixtureはcommit 2f3c9a4由来の40頭分を保持している（fixture自体の破損検知）", () => {
    const fixture = loadFixture();
    expect(fixture._meta.sourceCommit).toBe("2f3c9a4");
    expect(Object.keys(fixture.horses)).toHaveLength(fixture._meta.horseFileCount);
    expect(fixture.horses).toHaveProperty("shakeyourheart");
  });

  it("シェイクユアハートのbaseAbilityは永久に70.3（本番data/horsesの増減による影響を受けない）", () => {
    const fixture = loadFixture();
    const raceFieldAggregatesByRaceId: Record<string, RaceFieldAggregate> = {};
    for (const agg of fixture.raceFieldAggregates) raceFieldAggregatesByRaceId[agg.raceId] = agg;

    const historyByHorseId = buildRaceHistory(
      fixture.horses,
      fixture.courseTimeBaselines,
      fixture.courseFinal3FBaselines,
      raceFieldAggregatesByRaceId,
    );

    const profile = buildHorseAbilityProfile("shakeyourheart", "シェイクユアハート", historyByHorseId.shakeyourheart ?? []);
    expect(profile.baseAbility).toBeCloseTo(70.3, 1);
  });

  it("直近5走それぞれのraceScore/memberLevelScoreAtRaceも固定fixtureからは変化しない", () => {
    const fixture = loadFixture();
    const raceFieldAggregatesByRaceId: Record<string, RaceFieldAggregate> = {};
    for (const agg of fixture.raceFieldAggregates) raceFieldAggregatesByRaceId[agg.raceId] = agg;

    const historyByHorseId = buildRaceHistory(
      fixture.horses,
      fixture.courseTimeBaselines,
      fixture.courseFinal3FBaselines,
      raceFieldAggregatesByRaceId,
    );
    const races = historyByHorseId.shakeyourheart ?? [];
    const byRaceId = new Map(races.map((r) => [r.raceId, r]));

    const expected: Record<string, { raceName: string; raceScore: number; memberLevelScoreAtRace: number }> = {
      "JRA-20260614-HANSHIN-11": { raceName: "宝塚記念", raceScore: 62.6, memberLevelScoreAtRace: 74.4 },
      "JRA-20260315-CHUKYO-11": { raceName: "金鯱賞", raceScore: 74.6, memberLevelScoreAtRace: 69.5 },
      "JRA-20260215-KYOTO-11": { raceName: "京都記念", raceScore: 67.8, memberLevelScoreAtRace: 66.7 },
      "JRA-20251213-CHUKYO-11": { raceName: "中日新聞杯", raceScore: 75.8, memberLevelScoreAtRace: 65.3 },
      "JRA-20251115-KYOTO-10": { raceName: "アンドロメダステークス", raceScore: 70.6, memberLevelScoreAtRace: 66.6 },
    };

    for (const [raceId, exp] of Object.entries(expected)) {
      const race = byRaceId.get(raceId);
      expect(race, `raceId=${raceId}(${exp.raceName})が見つかりません`).toBeDefined();
      expect(race!.raceScore, `${exp.raceName}のraceScore`).toBeCloseTo(exp.raceScore, 1);
      expect(race!.memberLevelScoreAtRace, `${exp.raceName}のmemberLevelScoreAtRace`).toBeCloseTo(
        exp.memberLevelScoreAtRace,
        1,
      );
    }
  });
});

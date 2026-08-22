/**
 * Ability Model V1 回帰検知テスト（CHECKPOINT 5・2026-08-22で正式追加）。
 * 仕様は docs/ability-model-v1.md 参照。
 *
 * 目的: baseAbility V1の計算式・入力データが意図せず変更された場合に検知すること。
 * 以下の期待値（70.3等）は「正しい能力値」を保証するためのものではなく、現在確定している
 * V1仕様＋現在のrepoデータ（src/ability/data/horses/*.json）から実際に算出された値を
 * ゴールデンマスターとして固定したものである。
 *
 * このテストが失敗した場合、まず「Ability Model V1の式（raceScore.ts・baseAbility.ts・
 * abilityBeforeRace.ts・memberLevelCandidates.ts等）を変更していないか」
 * 「対象馬・関連馬のdata/horses/*.jsonを変更していないか」を確認すること。
 * 意図した変更であれば、期待値とdocs/ability-model-v1.mdのバージョン情報を明示的に更新してよい。
 * 式そのものを変更する場合はV1を黙って書き換えず、Ability Model V2として切り出すこと
 * （docs/ability-model-v1.md「凍結ルール」参照）。
 */
import { describe, expect, it } from "vitest";
import { loadHorseAbilityProfile } from "../horseAbilityData";
import { buildRaceHistory, type RaceHistoryRawInput } from "../raceHistoryPipeline";

describe("Ability Model V1 回帰検知: シェイクユアハート基準馬", () => {
  it("baseAbility V1が現在確定している値から変化しない", () => {
    const profile = loadHorseAbilityProfile("shakeyourheart");
    expect(profile).toBeDefined();
    expect(profile!.baseAbility).toBeCloseTo(70.3, 1);
  });

  it("直近5走それぞれのraceScore/memberLevelScoreAtRaceが現在確定している値から変化しない", () => {
    const profile = loadHorseAbilityProfile("shakeyourheart");
    expect(profile).toBeDefined();
    const byRaceId = new Map(profile!.recentRaces.map((r) => [r.raceId, r]));

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

describe("Ability Model V1 決定性: 同一入力なら常に同一出力を返す", () => {
  it("buildRaceHistoryは同一の入力データに対して決定的（非乱数・非時刻依存）である", () => {
    const raw: Record<string, RaceHistoryRawInput[]> = {
      A: [
        {
          raceId: "r1",
          raceName: "テストA",
          raceDate: "2025-01-01",
          racecourse: "札幌",
          surface: "turf",
          distance: 2000,
          going: "良",
          finishPosition: 1,
          timeGap: 0,
          raceTime: 120,
          final3F: 34,
          carriedWeight: 56,
        },
        {
          raceId: "r2",
          raceName: "テストB",
          raceDate: "2025-06-01",
          racecourse: "札幌",
          surface: "turf",
          distance: 2000,
          going: "良",
          finishPosition: 2,
          timeGap: 0.5,
          raceTime: 121,
          final3F: 35,
          carriedWeight: 56,
        },
      ],
      B: [
        {
          raceId: "r1",
          raceName: "テストA",
          raceDate: "2025-01-01",
          racecourse: "札幌",
          surface: "turf",
          distance: 2000,
          going: "良",
          finishPosition: 2,
          timeGap: 0.3,
          raceTime: 120.3,
          final3F: 34.2,
          carriedWeight: 55,
        },
      ],
    };

    const result1 = buildRaceHistory(raw);
    const result2 = buildRaceHistory(raw);
    expect(result1).toEqual(result2);
  });
});

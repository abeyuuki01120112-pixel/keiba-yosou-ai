/**
 * Ability Model V1 回帰検知テスト（CHECKPOINT 5・2026-08-22で正式追加。
 * CHECKPOINT13.4Dで Model Freeze / Dataset Freeze を分離）。
 * 仕様は docs/ability-model-v1.md 参照。
 *
 * 目的: baseAbility V1の計算式が意図せず変更された場合に検知すること。
 *
 * 「70.3」という特定の値に対する固定assertion（Dataset Freeze）は
 * `abilityModelV1.frozenBenchmark.test.ts`（CP12.6時点のdata/horses全体を凍結した
 * 専用fixtureを使用、本番data/horsesに一切依存しない）へ分離した。
 *
 * 本ファイルは「Production Dataset」（本番data/horses、実データImportのたびに
 * 増減する）を対象とする。CHECKPOINT13.4Cで判明した通り、Base Ability V1の数式が
 * 完全に無変更でも、本番datasetの内容が変わればbaseAbilityの値は変わりうる
 * （memberLevel V1の候補プールがdata/horses全体から動的に構築されるため）。
 * したがって本ファイルは特定の数値に対する固定assertionを行わない。
 * 数式そのものの回帰検知は下部の決定性テスト、および frozenBenchmark.test.ts で行う。
 */
import { describe, expect, it } from "vitest";
import { getProductionDatasetVersionInfo, loadHorseAbilityProfile } from "../horseAbilityData";
import { buildRaceHistory, type RaceHistoryRawInput } from "../raceHistoryPipeline";
import { MODEL_VERSION } from "../datasetVersion";

describe("Ability Model V1 Production Dataset: シェイクユアハート基準馬（非固定値・情報提供のみ）", () => {
  it("baseAbilityは算出可能であり、modelVersion/datasetFingerprintと共に追跡できる（70.3固定assertionはしない）", () => {
    const profile = loadHorseAbilityProfile("shakeyourheart");
    expect(profile).toBeDefined();
    expect(typeof profile!.baseAbility).toBe("number");

    const versionInfo = getProductionDatasetVersionInfo();
    expect(versionInfo.modelVersion).toBe(MODEL_VERSION);
    expect(versionInfo.datasetFingerprint.length).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log(
      `[Production Base Ability] shakeyourheart=${profile!.baseAbility} ` +
        `modelVersion=${versionInfo.modelVersion} datasetFingerprint=${versionInfo.datasetFingerprint} ` +
        `horseCount=${versionInfo.horseCount} totalRaceCount=${versionInfo.totalRaceCount} maxRaceDate=${versionInfo.maxRaceDate}`,
    );
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

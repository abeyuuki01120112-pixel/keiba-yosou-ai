import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectRace } from "../../collector/collectRace";
import { runPredictionPipeline } from "../predictionPipeline";

const RACE_ID = "JRA-20240505-NIIGATA-11"; // production側にAbility Controlled馬を5頭含む既存fixture

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("runPredictionPipeline — Collector → Base Ability V1 → Suitability V1 → Stage A → finalRaceAbility → 勝率", () => {
  it("実データfixtureから、Ability Controlled馬についてbaseAbility〜winProbabilityまで一気通貫で算出する", async () => {
    const cacheDir = makeTmpDir();
    const collected = await collectRace(RACE_ID, { cacheDir });
    expect(collected.status).toBe("OK");
    expect(collected.race).not.toBeNull();

    const result = runPredictionPipeline(collected.race!, collected.runners, collected.priorHistories);

    expect(result.race.raceId).toBe(RACE_ID);
    expect(result.horses).toHaveLength(16);

    // 注: この「production側にbaseAbilityが算出できる頭数」は、niigataGateHistoryV1.ts
    // （Isolated Gate History Datasetのみを対象にした狭い定義）とは別の集計軸である。
    // ここでは実際のpredictionSnapshot.ts（buildGateConfirmedSnapshot経由、getHorseRecentRaces()
    // が参照するproduction data/horses/全体）を使うため、値も別になりうる——固定値ではなく、
    // 実行結果から動的に取得して以降の検証に使う。
    const withAbility = result.horses.filter((h) => h.baseAbility !== null);
    expect(withAbility.length).toBeGreaterThan(0);
    expect(withAbility.length).toBeLessThanOrEqual(16);

    for (const h of withAbility) {
      expect(h.effectiveAbility).not.toBeNull();
      expect(h.finalRaceAbility).not.toBeNull();
      expect(h.rankByEffectiveAbility).not.toBeNull();
      expect(h.rankByFinalRaceAbility).not.toBeNull();
      expect(h.winProbability).not.toBeNull();
      expect(h.winProbability!).toBeGreaterThan(0);
    }
  });

  it("Ability Controlledな馬のwinProbability合計は100%になる（Plackett-Luce、Σwin=100%制約）", async () => {
    const cacheDir = makeTmpDir();
    const collected = await collectRace(RACE_ID, { cacheDir });
    const result = runPredictionPipeline(collected.race!, collected.runners, collected.priorHistories);

    const total = result.horses.reduce((sum, h) => sum + (h.winProbability ?? 0), 0);
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
  });

  it("production側にデータが無い馬はbaseAbility=null等、0や推測値で埋めずnullのまま返す", async () => {
    const cacheDir = makeTmpDir();
    const collected = await collectRace(RACE_ID, { cacheDir });
    const result = runPredictionPipeline(collected.race!, collected.runners, collected.priorHistories);

    const withAbility = result.horses.filter((h) => h.baseAbility !== null);
    const withoutAbility = result.horses.filter((h) => h.baseAbility === null);
    expect(withAbility.length + withoutAbility.length).toBe(16);
    for (const h of withoutAbility) {
      expect(h.effectiveAbility).toBeNull();
      expect(h.finalRaceAbility).toBeNull();
      expect(h.winProbability).toBeNull();
      expect(h.rankByFinalRaceAbility).toBeNull();
    }
  });

  it("modelVersionが既存predictionSnapshot.tsのPREDICTION_SNAPSHOT_MODEL_VERSIONと一致する", async () => {
    const cacheDir = makeTmpDir();
    const collected = await collectRace(RACE_ID, { cacheDir });
    const result = runPredictionPipeline(collected.race!, collected.runners, collected.priorHistories);
    expect(result.modelVersion).toBe("ability-model-v1+suitability-v1");
  });
});

import { describe, it, expect } from "vitest";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import { runPredictionPipelineFromFormalSnapshot } from "../formalSnapshotPipeline";

describe("runPredictionPipelineFromFormalSnapshot — 実在する2026新潟記念Formal Snapshotを使用", () => {
  it("既存の永続化済みFormal Prediction Snapshotからfinal RaceAbility・勝率まで一気通貫で算出する", () => {
    const snapshots = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" });
    expect(snapshots.length).toBeGreaterThan(0);

    const result = runPredictionPipelineFromFormalSnapshot(snapshots[0]);
    expect(result.race.raceId).toBe("JRA-20260830-NIIGATA-08");
    expect(result.horses).toHaveLength(11);

    for (const h of result.horses) {
      expect(h.baseAbility).not.toBeNull();
      expect(h.finalRaceAbility).not.toBeNull();
      expect(h.winProbability).not.toBeNull();
    }
  });

  it("勝率合計はPlackett-Luceの制約どおり100%近傍になる", () => {
    const snapshots = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" });
    const result = runPredictionPipelineFromFormalSnapshot(snapshots[0]);
    const total = result.horses.reduce((sum, h) => sum + (h.winProbability ?? 0), 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it("ダノンシーマ・ロデオドライブ・ゾロアストロの順にfinalRaceAbilityが並ぶ（過去に確認済みの値と整合）", () => {
    const snapshots = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" });
    const result = runPredictionPipelineFromFormalSnapshot(snapshots[0]);
    const byName = new Map(result.horses.map((h) => [h.horseName, h]));
    expect(byName.get("ダノンシーマ")?.baseAbility).toBe(78.3);
    expect(byName.get("ロデオドライブ")?.baseAbility).toBe(76.7);
    expect(byName.get("ゾロアストロ")?.baseAbility).toBe(74.8);
    expect(byName.get("ダノンシーマ")?.rankByFinalRaceAbility).toBe(1);
  });
});

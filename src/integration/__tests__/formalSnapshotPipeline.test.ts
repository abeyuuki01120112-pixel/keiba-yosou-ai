import { describe, it, expect } from "vitest";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
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

describe("Formal snapshotの入口にも全頭gateを適用", () => {
  it("行欠落・評価不能・異なるデータ版から部分集合確率を生成しない", () => {
    const original = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];
    const missing = structuredClone(original); missing.runners.pop();
    const ineligible = structuredClone(original); ineligible.runners[0].predictionEligible = false;
    const changed = structuredClone(original); changed.datasetVersion.datasetFingerprint = "different";
    for (const record of [missing, ineligible, changed]) {
      const result = runPredictionPipelineFromFormalSnapshot(record);
      expect(result.predicted).toBe(false);
      expect(result.gate?.formal).toBe(false);
      expect(result.gate?.reasons.length).toBeGreaterThan(0);
      expect(result.horses.every((h) => h.winProbability === null && h.top2Probability === null && h.top3Probability === null)).toBe(true);
    }
  });
});

describe("Formal snapshot replayのOdds cutoff", () => {
  it("保存cutoff以前の単勝だけを接続し、既存Probabilityを維持する", () => {
    const record = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];
    const baseline = runPredictionPipelineFromFormalSnapshot(record);
    const odds: OddsSnapshotEntry[] = record.runners.flatMap((runner, index) => [
      {
        raceId: record.raceId,
        horseId: runner.horseId,
        observedAt: "2026-08-28T03:00:00Z",
        availableAt: "2026-08-28T03:00:30Z",
        odds: 2 + index / 10,
        market: "win" as const,
        source: "saved replay odds",
      },
      {
        raceId: record.raceId,
        horseId: runner.horseId,
        observedAt: "2026-08-28T04:00:00Z",
        odds: 1.1,
        market: "win" as const,
        source: "future final odds",
      },
    ]);
    const replay = runPredictionPipelineFromFormalSnapshot(record, { odds });

    expect(replay.oddsStatus).toMatchObject({
      winOddsComplete: true,
      missingHorseIds: [],
      readyForEv: true,
    });
    expect(replay.horses.map((horse) => horse.winOdds)).toEqual(
      odds.filter((_, index) => index % 2 === 0).map((entry) => entry.odds),
    );
    expect(replay.oddsStatus?.diagnostics.filter((d) => d.code === "FUTURE_ODDS_REJECTED")).toHaveLength(11);
    expect(replay.horses.every((horse) => horse.readyForEv && horse.expectedValue !== null)).toBe(true);
    expect(replay.horses.every((horse) => horse.evDecision.finalDecision === null)).toBe(true);
    expect(replay.evDecisionContext).toMatchObject({
      policy: { calibrationStatus: "UNCALIBRATED", highEvCandidateMin: null },
      capitalAllocation: { basis: "RACE_BUDGET_RATIO", configuredRatios: null },
      historicalReplayCompatible: true,
    });
    for (const horse of replay.horses) {
      expect(horse.expectedValue).toBeCloseTo((horse.winProbabilityRaw! / 100) * horse.winOdds!, 12);
    }
    expect(replay.horses.map((horse) => horse.winProbability)).toEqual(
      baseline.horses.map((horse) => horse.winProbability),
    );
  });
});

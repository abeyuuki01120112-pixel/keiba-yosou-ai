import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHorseRecentRacesAsOf } from "../../ability/horseAbilityData";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import type { NormalizedCacheEntry } from "../../collector/cache";
import type { CollectedRunnerRow, PriorHistoryEntry } from "../../collector/types";
import {
  runProductionPrediction,
  type ProductionPredictionRunnerInput,
  type ProductionWinOddsInput,
} from "../productionPredictionRunner";

const frozen = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];
const target = { raceId: frozen.raceId, raceDate: frozen.raceDate, postTimeIso: frozen.scheduledStartTime };
const baseInput = {
  raceId: frozen.raceId,
  stage: "STAGE_A" as const,
  predictionCutoffAt: frozen.predictionCutoffAt,
  raceCardAvailableAt: frozen.predictionCutoffAt,
  scheduledStartTime: frozen.scheduledStartTime,
};

function runners(): CollectedRunnerRow[] {
  return frozen.runners.map((runner) => ({
    entryStatus: "declared",
    raceId: frozen.raceId,
    raceDate: frozen.raceDate,
    racecourse: frozen.racecourse,
    raceNumber: frozen.raceNumber!,
    raceName: "新潟記念",
    surface: frozen.surface,
    distance: frozen.distance,
    going: "unknown",
    courseLayout: null,
    courseVariant: null,
    horseId: runner.horseId,
    horseName: runner.horseName,
    horseNumber: runner.horseNumber!,
    gate: runner.frame!,
    finishPosition: null,
    carriedWeightKg: runner.assignedWeight,
    actualRaceTimeSeconds: null,
    final3FSeconds: null,
    timeGapSeconds: null,
    fieldSize: frozen.totalRunners,
    passingPosition: null,
    source: "saved formal Stage A snapshot",
    sourceRaceId: null,
    sourceHorseId: runner.sourceHorseId,
  }));
}

function histories(): PriorHistoryEntry[] {
  return frozen.runners.map((runner) => ({
    horseId: runner.horseId,
    status: "available",
    races: structuredClone(getHorseRecentRacesAsOf(runner.horseId, target, frozen.predictionCutoffAt)),
    provenance: {
      source: "production_data_horses",
      sourceIdentifier: runner.horseId,
      targetRaceId: frozen.raceId,
      targetAsOf: frozen.predictionCutoffAt,
      retrievedAt: "2026-09-08T00:00:00Z",
      method: "production_history_reference",
      collectorVersion: "p0-8-test",
    },
  }));
}

function odds(observedAt = "2026-08-28T03:00:00Z"): ProductionWinOddsInput[] {
  return frozen.runners.map((runner, index) => ({
    raceId: frozen.raceId,
    canonicalHorseId: runner.horseId,
    winOdds: 2 + index / 10,
    observedAt,
    availableAt: observedAt,
    source: "P0-8 test odds",
    sourceIdentifier: `win-${runner.horseId}`,
  }));
}

let tempRoot: string;
let normalizedDir: string;
let predictionsDir: string;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "production-prediction-runner-"));
  normalizedDir = path.join(tempRoot, "normalized");
  predictionsDir = path.join(tempRoot, "predictions");
  writeNormalized({ raceId: frozen.raceId, collectedAt: "2026-09-08T00:00:00Z", runners: runners(), priorHistories: histories() });
});

afterEach(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

function writeNormalized(entry: NormalizedCacheEntry): void {
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.writeFileSync(path.join(normalizedDir, `${frozen.raceId}.json`), JSON.stringify(entry), "utf8");
}

function writeOdds(entries: ProductionWinOddsInput[], name = "odds.json"): string {
  const file = path.join(tempRoot, name);
  fs.writeFileSync(file, JSON.stringify(entries), "utf8");
  return file;
}

function run(overrides: Partial<ProductionPredictionRunnerInput> = {}) {
  return runProductionPrediction({ ...baseInput, ...overrides }, { normalizedDir, predictionsDir });
}

describe("P0-8 Production Prediction Runner CLI V1", () => {
  it("raceIdをパスとして解釈せず危険な値を拒否する", () => {
    expect(() => run({ raceId: "../outside" })).toThrow(/unsafe/);
  });

  it("Oddsなしでも正式PredictionとPrediction-only Artifactを保存する", () => {
    const result = run();
    expect(result.prediction.formalPredictionReady).toBe(true);
    expect(result.artifact.artifactStatus).toBe("FORMAL_PREDICTION");
    expect(result.persistence.status).toBe("created");
    expect(result.artifact.horses.every((horse) =>
      horse.winProbability !== null && horse.expectedValue === null && !horse.readyForEv,
    )).toBe(true);
  });

  it("cutoff以前のcanonical単勝OddsでEVを計算する", () => {
    const result = run({ oddsFile: writeOdds(odds()) });
    expect(result.prediction.oddsStatus.readyForEv).toBe(true);
    expect(result.artifact.horses.every((horse) =>
      horse.winOdds !== null && horse.expectedValue !== null && horse.readyForEv,
    )).toBe(true);
  });

  it("cutoff後Oddsだけなら使用せずEV不可を診断する", () => {
    const result = run({ oddsFile: writeOdds(odds("2026-08-28T04:00:00Z")) });
    expect(result.artifact.provenance.odds).toEqual([]);
    expect(result.artifact.horses.every((horse) => horse.expectedValue === null)).toBe(true);
    expect(result.prediction.oddsStatus.diagnostics.some((diagnostic) => diagnostic.code === "FUTURE_ODDS_REJECTED")).toBe(true);
  });

  it("canonicalHorseId不一致を推測mergeせず該当馬のEVを不可にする", () => {
    const input = odds();
    const expectedMissingHorseId = input[0].canonicalHorseId;
    input[0] = { ...input[0], canonicalHorseId: "unresolved-horse-id" };
    const result = run({ oddsFile: writeOdds(input) });
    expect(result.prediction.oddsStatus.diagnostics.some((diagnostic) =>
      diagnostic.code === "UNRESOLVED_ODDS_HORSE_ID" && diagnostic.horseId === "unresolved-horse-id",
    )).toBe(true);
    expect(result.artifact.horses.find((horse) => horse.canonicalHorseId === expectedMissingHorseId)?.expectedValue).toBeNull();
  });

  it("Formal Gate失敗時はProbabilityを生成せず診断Artifactを保存する", () => {
    const incomplete = histories();
    incomplete[0] = { ...incomplete[0], status: "unavailable", races: [] };
    writeNormalized({ raceId: frozen.raceId, collectedAt: "2026-09-08T00:00:00Z", runners: runners(), priorHistories: incomplete });
    const result = run();
    expect(result.prediction.formalPredictionReady).toBe(false);
    expect(result.artifact.artifactStatus).toBe("DIAGNOSTIC_ONLY");
    expect(result.persistence.status).toBe("created");
    expect(result.artifact.horses.every((horse) =>
      horse.winProbability === null && horse.expectedValue === null && horse.finalDecision === null,
    )).toBe(true);
    expect(result.artifact.horses[0].diagnostics.some((diagnostic) => diagnostic.code === "MISSING_HORSE_HISTORY")).toBe(true);
  });

  it("同raceIdのStage AとStage Bを別Artifactとして保存する", () => {
    const stageA = run({ stage: "STAGE_A" });
    const stageB = run({ stage: "STAGE_B" });
    expect(stageA.persistence.status).toBe("created");
    expect(stageB.persistence.status).toBe("created");
    expect(stageA.artifact.artifactId).not.toBe(stageB.artifact.artifactId);
    expect(fs.readdirSync(predictionsDir).filter((file) => file.endsWith(".json"))).toHaveLength(2);
  });

  it("同一入力の再実行はdeterministicなduplicateになる", () => {
    const first = run();
    const repeated = run();
    expect(repeated.persistence.status).toBe("duplicate");
    expect(repeated.artifact).toEqual(first.artifact);
    expect(repeated.artifact.predictionContentFingerprint).toBe(first.artifact.predictionContentFingerprint);
  });

  it("同一Artifact IDでOdds内容が変わればcollisionとして拒否する", () => {
    const firstOdds = odds();
    expect(run({ oddsFile: writeOdds(firstOdds, "first.json") }).persistence.status).toBe("created");
    firstOdds[0] = { ...firstOdds[0], winOdds: firstOdds[0].winOdds + 0.1 };
    const changed = run({ oddsFile: writeOdds(firstOdds, "changed.json") });
    expect(changed.persistence.status).toBe("rejected");
  });

  it("新潟記念11頭のAbility・Suitability・Probabilityを変更しない", () => {
    const stored = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), "src/integration/data/derived/JRA-20260830-NIIGATA-08.json"),
      "utf8",
    )) as { horses: Array<Record<string, unknown>> };
    const expectedByHorseId = new Map(stored.horses.map((horse) => [horse.horseId, horse]));
    const result = run();
    expect(result.artifact.horses).toHaveLength(11);
    for (const horse of result.artifact.horses) {
      const savedStageA = frozen.runners.find((runner) => runner.horseId === horse.canonicalHorseId)!;
      const savedDerived = expectedByHorseId.get(horse.canonicalHorseId)!;
      expect(horse.baseAbility).toBe(savedStageA.baseAbility);
      expect(horse.suitability.overallPercent).toBe(savedStageA.overallSuitabilityPercent);
      expect(horse.effectiveAbility).toBe(savedStageA.effectiveAbility);
      expect(horse.finalRaceAbility).toBe(savedDerived.finalRaceAbility);
      expect(horse.winProbability).toBe(savedDerived.winProbability);
      expect(horse.place2Probability).toBe(savedDerived.top2Probability);
      expect(horse.place3Probability).toBe(savedDerived.top3Probability);
    }
  });
});

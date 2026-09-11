import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
import { runPredictionPipelineFromFormalSnapshot } from "../formalSnapshotPipeline";
import {
  buildRacePredictionArtifact,
  deserializeRacePredictionArtifact,
  serializeRacePredictionArtifact,
} from "../racePredictionArtifact";
import {
  persistRacePredictionArtifact,
  readRacePredictionArtifact,
} from "../racePredictionArtifactStore";

const frozen = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];

function winOdds(observedAt = "2026-08-28T03:00:00Z"): OddsSnapshotEntry[] {
  return frozen.runners.map((runner, index) => ({
    raceId: frozen.raceId,
    horseId: runner.horseId,
    observedAt,
    availableAt: observedAt,
    odds: 1 + index / 10,
    market: "win",
    source: "artifact test odds",
    sourceIdentifier: `win-${runner.horseId}`,
  }));
}

function formalPrediction(odds: readonly OddsSnapshotEntry[] | null = winOdds()) {
  return runPredictionPipelineFromFormalSnapshot(frozen, { odds });
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "race-prediction-artifact-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("P0-7 Race Prediction Artifact", () => {
  it("正常な新潟記念11頭を正式Artifactへ統合する", () => {
    const prediction = formalPrediction();
    const artifact = buildRacePredictionArtifact(prediction);

    expect(artifact).toMatchObject({
      artifactType: "RACE_PREDICTION",
      artifactStatus: "FORMAL_PREDICTION",
      predictionStage: "STAGE_A",
      predictionCutoffAt: frozen.predictionCutoffAt,
      modelVersion: frozen.modelVersion,
      decisionPolicyId: prediction.evDecisionContext?.policy.policyId,
      decisionPolicyVersion: prediction.evDecisionContext?.policy.policyVersion,
      formalPredictionReady: true,
      source: "FORMAL_SNAPSHOT_PIPELINE",
    });
    expect(artifact.datasetFingerprint).toMatch(/^11h-\d+r-[0-9a-f]{8}$/);
    expect(artifact.horses).toHaveLength(11);
    expect(artifact.horses.every((horse) =>
      horse.canonicalHorseId && horse.predictionEligible && horse.winProbability !== null &&
      horse.winOdds !== null && horse.expectedValue !== null,
    )).toBe(true);
  });

  it("JSON serialize・deserialize・保存・再読込で内容が一致する", () => {
    const artifact = buildRacePredictionArtifact(formalPrediction());
    const serialized = serializeRacePredictionArtifact(artifact);
    expect(deserializeRacePredictionArtifact(serialized)).toEqual(artifact);

    expect(persistRacePredictionArtifact(artifact, { dir: tempDir }).status).toBe("created");
    expect(readRacePredictionArtifact(artifact.artifactId, { dir: tempDir })).toEqual(artifact);
    expect(persistRacePredictionArtifact(artifact, { dir: tempDir }).status).toBe("duplicate");
  });

  it("同raceIdのStage A/Bを別artifactId・別ファイルとして保存する", () => {
    const prediction = formalPrediction();
    const stageA = buildRacePredictionArtifact(prediction);
    const stageB = buildRacePredictionArtifact({ ...prediction, predictionStage: "STAGE_B" });

    expect(stageA.artifactId).not.toBe(stageB.artifactId);
    expect(persistRacePredictionArtifact(stageA, { dir: tempDir }).status).toBe("created");
    expect(persistRacePredictionArtifact(stageB, { dir: tempDir }).status).toBe("created");
    expect(fs.readdirSync(tempDir).filter((file) => file.endsWith(".json"))).toHaveLength(2);
  });

  it("同じ入力・cutoff・model・policyならgeneratedAtが違っても予測内容が一致する", () => {
    const prediction = formalPrediction();
    const first = buildRacePredictionArtifact(prediction);
    const later = buildRacePredictionArtifact({ ...prediction, generatedAt: "2030-01-01T00:00:00Z" });

    expect(later.artifactId).toBe(first.artifactId);
    expect(later.predictionContentFingerprint).toBe(first.predictionContentFingerprint);
    expect({ ...later, generatedAt: null }).toEqual({ ...first, generatedAt: null });
    expect(persistRacePredictionArtifact(first, { dir: tempDir }).status).toBe("created");
    expect(persistRacePredictionArtifact(later, { dir: tempDir }).status).toBe("duplicate");
    expect(readRacePredictionArtifact(first.artifactId, { dir: tempDir })).toEqual(first);
  });

  it("同一artifactIdに異なるOdds・Prediction内容を上書きしない", () => {
    const first = buildRacePredictionArtifact(formalPrediction());
    const changedOdds = winOdds();
    changedOdds[0] = { ...changedOdds[0], odds: changedOdds[0].odds + 0.1 };
    const changed = buildRacePredictionArtifact(formalPrediction(changedOdds));

    expect(changed.artifactId).toBe(first.artifactId);
    expect(changed.predictionContentFingerprint).not.toBe(first.predictionContentFingerprint);
    expect(persistRacePredictionArtifact(first, { dir: tempDir }).status).toBe("created");
    expect(persistRacePredictionArtifact(changed, { dir: tempDir }).status).toBe("rejected");
    expect(readRacePredictionArtifact(first.artifactId, { dir: tempDir })).toEqual(first);
  });

  it("Formal Gate失敗をDIAGNOSTIC_ONLYとして保存し正式Probabilityを持たせない", () => {
    const incomplete = structuredClone(frozen);
    incomplete.runners.pop();
    const prediction = runPredictionPipelineFromFormalSnapshot(incomplete, { odds: winOdds() });
    const artifact = buildRacePredictionArtifact(prediction);

    expect(artifact.formalPredictionReady).toBe(false);
    expect(artifact.artifactStatus).toBe("DIAGNOSTIC_ONLY");
    expect(artifact.globalDiagnostics.some((diagnostic) => diagnostic.code === "INCOMPLETE_RUNNER_SET")).toBe(true);
    expect(artifact.horses.every((horse) =>
      horse.winProbability === null && horse.place2Probability === null && horse.place3Probability === null &&
      horse.expectedValue === null && horse.assessmentStatus === "NOT_EVALUABLE",
    )).toBe(true);
  });

  it("Prediction成立とKEN候補を別状態として保持する", () => {
    const artifact = buildRacePredictionArtifact(formalPrediction(winOdds()));

    expect(artifact.formalPredictionReady).toBe(true);
    expect(artifact.horses.every((horse) => horse.decisionState === "KEN_CANDIDATE")).toBe(true);
    expect(artifact.horses.every((horse) => horse.finalDecision === null)).toBe(true);
  });

  it("Odds欠損でもPredictionを保持しEV不可理由を保存する", () => {
    const artifact = buildRacePredictionArtifact(formalPrediction(null));

    expect(artifact.formalPredictionReady).toBe(true);
    expect(artifact.horses.every((horse) => horse.winProbability !== null)).toBe(true);
    expect(artifact.horses.every((horse) =>
      horse.expectedValue === null && !horse.readyForEv &&
      horse.expectedValueUnavailableReason === "WIN_ODDS_UNAVAILABLE" &&
      horse.assessmentStatus === "NOT_EVALUABLE",
    )).toBe(true);
  });

  it("cutoff後OddsをArtifactへ混入させず診断だけ保持する", () => {
    const artifact = buildRacePredictionArtifact(formalPrediction(winOdds("2026-08-28T04:00:00Z")));

    expect(artifact.provenance.odds).toEqual([]);
    expect(artifact.horses.every((horse) => horse.winOdds === null && horse.expectedValue === null)).toBe(true);
    expect(artifact.globalDiagnostics.filter((diagnostic) => diagnostic.code === "FUTURE_ODDS_REJECTED")).toHaveLength(11);
  });

  it("actual resultをPrediction Artifactへコピーせずtarget history混入は拒否する", () => {
    const prediction = formalPrediction();
    const before = buildRacePredictionArtifact(prediction);
    for (const horse of prediction.horses) horse.actualFinishPosition = 1;
    prediction.hasResult = true;
    const after = buildRacePredictionArtifact(prediction);

    expect(after).toEqual(before);
    expect(after.horses.every((horse) => !("actualFinishPosition" in horse))).toBe(true);
    const contaminated = structuredClone(prediction);
    const horseId = contaminated.horses[0].horseId;
    contaminated.priorHistoriesByHorseId[horseId].unshift({
      ...contaminated.priorHistoriesByHorseId[horseId][0],
      raceId: frozen.raceId,
      raceDate: frozen.raceDate,
    });
    expect(() => buildRacePredictionArtifact(contaminated)).toThrow(/future\/target history/);
  });

  it("新潟記念11頭のFrozen Predictionを値変更せず転記する", () => {
    const prediction = formalPrediction();
    const artifact = buildRacePredictionArtifact(prediction);

    for (const horse of artifact.horses) {
      const sourcePrediction = prediction.horses.find((entry) => entry.horseId === horse.canonicalHorseId)!;
      const saved = frozen.runners.find((entry) => entry.horseId === horse.canonicalHorseId)!;
      expect(horse.baseAbility).toBe(saved.baseAbility);
      expect(horse.suitability.overallPercent).toBe(saved.overallSuitabilityPercent);
      expect(horse.effectiveAbility).toBe(saved.effectiveAbility);
      expect(horse.finalRaceAbility).toBe(sourcePrediction.finalRaceAbility);
      expect(horse.winProbability).toBe(sourcePrediction.winProbability);
      expect(horse.place2Probability).toBe(sourcePrediction.top2Probability);
      expect(horse.place3Probability).toBe(sourcePrediction.top3Probability);
    }
  });
});

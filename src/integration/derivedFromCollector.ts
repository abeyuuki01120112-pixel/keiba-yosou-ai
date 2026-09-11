import { runPredictionPipeline, type RunPredictionPipelineOptions } from "./predictionPipeline";
import type { CollectedRaceIdentity, CollectedRunnerRow, PriorHistoryEntry } from "../collector/types";
import type { DerivedRacePrediction } from "./uiTypes";

/**
 * Collector V0の出力（PHASE C）から、UI V0（PHASE D）が読み込む
 * `DerivedRacePrediction`形式へ変換する。既存のCollected runnerの
 * `finishPosition`（実データ、実際の着順）をそのまま`actualFinishPosition`
 * として引き継ぐ——過去に実施済みのレースをCollector経由で取り込む場合のみ
 * 使う経路。cutoff選別済みのオッズがあれば後続出力にも保持する。
 */
export function buildDerivedFromCollector(
  raceIdentity: CollectedRaceIdentity,
  runners: CollectedRunnerRow[],
  priorHistories: PriorHistoryEntry[],
  options: RunPredictionPipelineOptions,
): DerivedRacePrediction {
  const pipelineResult = runPredictionPipeline(raceIdentity, runners, priorHistories, options);
  const finishPositionByHorseId = new Map(runners.map((r) => [r.horseId, r.finishPosition]));

  const horses = pipelineResult.horses.map((h) => ({
    ...h,
    actualFinishPosition: finishPositionByHorseId.get(h.horseId) ?? null,
    ev: null,
  }));

  return {
    race: pipelineResult.race,
    generatedAt: pipelineResult.generatedAt,
    modelVersion: pipelineResult.modelVersion,
    predictionStage: pipelineResult.predictionStage,
    predictionSource: pipelineResult.predictionSource,
    raceStartAt: pipelineResult.raceStartAt,
    predictionCutoffAt: pipelineResult.predictionCutoffAt,
    formalPredictionReady: pipelineResult.formalPredictionReady,
    gate: pipelineResult.gate,
    odds: pipelineResult.odds,
    oddsStatus: pipelineResult.oddsStatus,
    evDecisionContext: pipelineResult.evDecisionContext,
    predicted: pipelineResult.gate.formal,
    hasResult: horses.some((h) => h.actualFinishPosition !== null),
    horses,
    priorHistoriesByHorseId: pipelineResult.horseHistoriesByHorseId,
  };
}

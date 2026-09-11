/**
 * KEIBA_DATA_DIR/normalized から既存Prediction Pipelineを安全に起動する実戦境界。
 * 予想ロジックは持たず、明示cutoff・Stage・任意の単勝Oddsを既存機構へ渡す。
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_NORMALIZED_DIR, readNormalizedCache } from "../collector/cache";
import type { CollectedRaceIdentity } from "../collector/types";
import type { OddsSnapshotEntry } from "../ability/oddsSnapshot";
import { runPredictionPipeline, type PredictionPipelineResult } from "./predictionPipeline";
import { buildRacePredictionArtifact, type ArtifactPredictionStage, type RacePredictionArtifact } from "./racePredictionArtifact";
import {
  DEFAULT_RACE_PREDICTION_ARTIFACT_DIR,
  persistRacePredictionArtifact,
  type PersistRacePredictionArtifactResult,
} from "./racePredictionArtifactStore";

export interface ProductionWinOddsInput {
  raceId: string;
  canonicalHorseId: string;
  winOdds: number;
  observedAt: string;
  availableAt?: string | null;
  source: string;
  sourceIdentifier?: string | null;
  popularity?: number | null;
}

export interface ProductionPredictionRunnerInput {
  raceId: string;
  stage: ArtifactPredictionStage;
  predictionCutoffAt: string;
  raceCardAvailableAt: string;
  scheduledStartTime: string;
  oddsFile?: string;
}

export interface ProductionPredictionRunnerOptions {
  normalizedDir?: string;
  predictionsDir?: string;
}

export interface ProductionPredictionRunnerResult {
  prediction: PredictionPipelineResult;
  artifact: RacePredictionArtifact;
  persistence: PersistRacePredictionArtifactResult;
}

export function runProductionPrediction(
  input: ProductionPredictionRunnerInput,
  options: ProductionPredictionRunnerOptions = {},
): ProductionPredictionRunnerResult {
  validateRunnerInput(input);
  const normalizedDir = options.normalizedDir ?? DEFAULT_NORMALIZED_DIR;
  const normalized = readNormalizedCache(input.raceId, normalizedDir);
  if (normalized === null) {
    throw new Error(`NORMALIZED_DATA_NOT_FOUND: ${path.join(normalizedDir, `${input.raceId}.json`)}`);
  }
  if (normalized.raceId !== input.raceId) {
    throw new Error(`NORMALIZED_RACE_ID_MISMATCH: expected=${input.raceId} actual=${normalized.raceId}`);
  }
  const firstRunner = normalized.runners[0];
  if (firstRunner == null) {
    throw new Error(`EMPTY_RUNNER_SET: ${input.raceId}`);
  }

  const raceIdentity: CollectedRaceIdentity = {
    raceId: input.raceId,
    raceDate: firstRunner.raceDate,
    racecourse: firstRunner.racecourse,
    raceNumber: firstRunner.raceNumber,
    raceName: firstRunner.raceName,
    surface: firstRunner.surface,
    distance: firstRunner.distance,
    going: firstRunner.going,
    courseLayout: firstRunner.courseLayout,
    courseVariant: firstRunner.courseVariant,
  };
  const odds = input.oddsFile === undefined ? null : loadProductionWinOddsFile(input.oddsFile);
  const pipelinePrediction = runPredictionPipeline(
    raceIdentity,
    normalized.runners,
    normalized.priorHistories,
    {
      predictionCutoffAt: input.predictionCutoffAt,
      raceCardAvailableAt: input.raceCardAvailableAt,
      scheduledStartTime: input.scheduledStartTime,
      odds,
    },
  );
  const prediction: PredictionPipelineResult = {
    ...pipelinePrediction,
    predictionStage: input.stage,
  };
  const artifact = buildRacePredictionArtifact(prediction);
  const persistence = persistRacePredictionArtifact(artifact, {
    dir: options.predictionsDir ?? DEFAULT_RACE_PREDICTION_ARTIFACT_DIR,
  });
  return { prediction, artifact, persistence };
}

export function loadProductionWinOddsFile(filePath: string): OddsSnapshotEntry[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`ODDS_FILE_NOT_FOUND: ${resolved}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`INVALID_ODDS_FILE_JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("INVALID_ODDS_FILE: JSON root must be an array");
  return parsed.map((entry, index) => toOddsSnapshotEntry(entry, index));
}

function toOddsSnapshotEntry(value: unknown, index: number): OddsSnapshotEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_ODDS_FILE_ENTRY: index=${index}`);
  }
  const entry = value as Record<string, unknown>;
  const raceId = requiredString(entry.raceId, `odds[${index}].raceId`);
  const canonicalHorseId = requiredString(entry.canonicalHorseId, `odds[${index}].canonicalHorseId`);
  const observedAt = requiredString(entry.observedAt, `odds[${index}].observedAt`);
  const source = requiredString(entry.source, `odds[${index}].source`);
  if (typeof entry.winOdds !== "number") throw new Error(`odds[${index}].winOdds must be a number`);
  if (entry.availableAt !== undefined && entry.availableAt !== null && typeof entry.availableAt !== "string") {
    throw new Error(`odds[${index}].availableAt must be a string or null`);
  }
  if (entry.sourceIdentifier !== undefined && entry.sourceIdentifier !== null && typeof entry.sourceIdentifier !== "string") {
    throw new Error(`odds[${index}].sourceIdentifier must be a string or null`);
  }
  if (entry.popularity !== undefined && entry.popularity !== null && typeof entry.popularity !== "number") {
    throw new Error(`odds[${index}].popularity must be a number or null`);
  }
  return {
    raceId,
    horseId: canonicalHorseId,
    observedAt,
    ...(entry.availableAt !== undefined ? { availableAt: entry.availableAt as string | null } : {}),
    odds: entry.winOdds,
    market: "win",
    source,
    ...(entry.sourceIdentifier !== undefined ? { sourceIdentifier: entry.sourceIdentifier as string | null } : {}),
    ...(entry.popularity !== undefined ? { popularity: entry.popularity as number | null } : {}),
  };
}

function validateRunnerInput(input: ProductionPredictionRunnerInput): void {
  const raceId = requiredString(input.raceId, "raceId");
  if (!/^[A-Za-z0-9_.-]+$/.test(raceId) || raceId === "." || raceId === "..") {
    throw new Error("raceId contains unsafe characters");
  }
  if (input.stage !== "STAGE_A" && input.stage !== "STAGE_B") {
    throw new Error("stage must be STAGE_A or STAGE_B");
  }
  requiredString(input.predictionCutoffAt, "predictionCutoffAt");
  requiredString(input.raceCardAvailableAt, "raceCardAvailableAt");
  requiredString(input.scheduledStartTime, "scheduledStartTime");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value;
}

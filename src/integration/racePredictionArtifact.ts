/** Probability・Odds・EV・Decisionを1レースの変更不能な予測記録へ統合する。 */

import { fnv1a } from "../ability/datasetVersion";
import { isPriorPerformance, predictionTimestamp } from "../ability/predictionBoundary";
import type { OddsSnapshotEntry } from "../ability/oddsSnapshot";
import type { RacePerformance } from "../ability/types";
import type { StrategyKind } from "../strategy/evDecision";
import type { PredictionPipelineHorseResult, PredictionPipelineResult } from "./predictionPipeline";
import type { DerivedRacePrediction } from "./uiTypes";

export const RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION = "race-prediction-artifact-v1";

export type ArtifactPredictionStage = "STAGE_A" | "STAGE_B";
export type RacePredictionArtifactStatus = "FORMAL_PREDICTION" | "DIAGNOSTIC_ONLY";

export interface ArtifactDiagnostic {
  code: string;
  message: string;
  source: "FORMAL_GATE" | "ODDS" | "EXPECTED_VALUE" | "EV_DECISION" | "ARTIFACT";
}

export interface RacePredictionArtifactHorse {
  canonicalHorseId: string;
  horseName: string;
  horseNumber: number | null;
  frameNumber: number | null;
  scratched: boolean;
  predictionEligible: boolean;
  baseAbility: number | null;
  suitability: {
    overallPercent: number | null;
    distance: number | null;
    course: number | null;
    going: number | null;
    gate: number | null;
    confidence: PredictionPipelineHorseResult["confidence"];
  };
  effectiveAbility: number | null;
  finalRaceAbility: number | null;
  winProbability: number | null;
  place2Probability: number | null;
  place3Probability: number | null;
  winProbabilityRaw: number | null;
  winOdds: number | null;
  oddsObservedAt: string | null;
  expectedValue: number | null;
  readyForEv: boolean;
  expectedValueUnavailableReason: PredictionPipelineHorseResult["expectedValueUnavailableReason"];
  assessmentStatus: PredictionPipelineHorseResult["evDecision"]["assessmentStatus"];
  investmentDecisionPossible: boolean;
  decisionState: PredictionPipelineHorseResult["evDecision"]["decisionState"];
  finalDecision: PredictionPipelineHorseResult["evDecision"]["finalDecision"];
  strategyCandidates: StrategyKind[];
  diagnostics: ArtifactDiagnostic[];
}

export interface RacePredictionArtifact {
  artifactId: string;
  artifactType: "RACE_PREDICTION";
  artifactStatus: RacePredictionArtifactStatus;
  schemaVersion: string;
  race: {
    raceId: string;
    raceDate: string;
    raceName: string;
    venue: string;
    surface: "turf" | "dirt";
    distance: number;
    raceStartAt: string | null;
  };
  predictionStage: ArtifactPredictionStage;
  predictionCutoffAt: string;
  generatedAt: string;
  modelVersion: string;
  decisionPolicyId: string;
  decisionPolicyVersion: string;
  datasetFingerprint: string;
  source: "COLLECTOR_PREDICTION_PIPELINE" | "FORMAL_SNAPSHOT_PIPELINE";
  provenance: {
    histories: Array<{
      canonicalHorseId: string;
      raceId: string;
      source: string | null;
      sourceRaceId: string | null;
      sourceHorseId: string | null;
      availableAt: string | null;
    }>;
    odds: Array<Pick<OddsSnapshotEntry,
      "raceId" | "horseId" | "observedAt" | "availableAt" | "market" | "source" | "sourceIdentifier">>;
  };
  formalPredictionReady: boolean;
  globalDiagnostics: ArtifactDiagnostic[];
  decisionContext: PredictionPipelineResult["evDecisionContext"];
  horses: RacePredictionArtifactHorse[];
  /** generatedAtを除く予測内容の決定的fingerprint。 */
  predictionContentFingerprint: string;
}

export function buildRacePredictionArtifact(
  prediction: PredictionPipelineResult | DerivedRacePrediction,
): RacePredictionArtifact {
  const predictionCutoffAt = requiredString(prediction.predictionCutoffAt, "predictionCutoffAt");
  predictionTimestamp(predictionCutoffAt, "predictionCutoffAt");
  const predictionStage = prediction.predictionStage;
  if (predictionStage !== "STAGE_A" && predictionStage !== "STAGE_B") {
    throw new Error("predictionStageはSTAGE_AまたはSTAGE_Bである必要があります");
  }
  const formalPredictionReady = prediction.formalPredictionReady;
  if (typeof formalPredictionReady !== "boolean" || prediction.gate == null || prediction.evDecisionContext == null) {
    throw new Error("Formal GateまたはEV Decision Contextがない旧出力はArtifact化できません");
  }
  const histories = historiesFrom(prediction);
  validateArtifactBoundaries(prediction.race.raceId, prediction.race.raceDate,
    prediction.raceStartAt ?? null, predictionCutoffAt, histories, prediction.odds ?? []);
  if (!formalPredictionReady && prediction.horses.some((horse) =>
    horse.winProbability !== null || horse.top2Probability !== null || horse.top3Probability !== null ||
    horse.expectedValue !== null || horse.evDecision.finalDecision !== null,
  )) {
    throw new Error("Formal Gate失敗出力に正式Probability/EV/Decisionが含まれています");
  }

  const source = prediction.predictionSource;
  if (source !== "COLLECTOR_PREDICTION_PIPELINE" && source !== "FORMAL_SNAPSHOT_PIPELINE") {
    throw new Error("predictionSourceがない旧出力はArtifact化できません");
  }
  const globalDiagnostics: ArtifactDiagnostic[] = [
    ...prediction.gate.globalErrors.map((diagnostic) => ({
      ...diagnostic,
      source: "FORMAL_GATE" as const,
    })),
    ...(prediction.raceStartAt == null
      ? [{ code: "MISSING_RACE_START_AT", message: "発走予定時刻が記録されていません。", source: "ARTIFACT" as const }]
      : []),
    ...(prediction.oddsStatus?.diagnostics ?? []).map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      source: "ODDS" as const,
    })),
  ];
  const gateByHorseId = new Map(
    prediction.gate.horseDiagnostics
      .filter((diagnostic) => diagnostic.horseId !== null)
      .map((diagnostic) => [diagnostic.horseId as string, diagnostic]),
  );
  const oddsDiagnostics = prediction.oddsStatus?.diagnostics ?? [];
  const strategies = prediction.evDecisionContext.strategies.map((strategy) => strategy.strategy);
  const horses = prediction.horses.map((horse): RacePredictionArtifactHorse => {
    const gateDiagnostic = gateByHorseId.get(horse.horseId);
    const candidateStatus = horse.evDecision.assessmentStatus === "POSITIVE_EV_CANDIDATE" ||
      horse.evDecision.assessmentStatus === "HIGH_EV_CANDIDATE";
    return {
      canonicalHorseId: horse.horseId,
      horseName: horse.horseName,
      horseNumber: horse.horseNumber,
      frameNumber: horse.gate,
      scratched: horse.scratched,
      predictionEligible: gateDiagnostic?.predictionEligible ?? false,
      baseAbility: horse.baseAbility,
      suitability: {
        overallPercent: horse.overallSuitabilityPercent,
        distance: horse.distanceSuitability,
        course: horse.courseSuitability,
        going: horse.goingSuitability,
        gate: horse.gateSuitability,
        confidence: horse.confidence,
      },
      effectiveAbility: horse.effectiveAbility,
      finalRaceAbility: horse.finalRaceAbility,
      winProbability: horse.winProbability,
      place2Probability: horse.top2Probability,
      place3Probability: horse.top3Probability,
      winProbabilityRaw: horse.winProbabilityRaw,
      winOdds: horse.winOdds,
      oddsObservedAt: horse.oddsObservedAt,
      expectedValue: horse.expectedValue,
      readyForEv: horse.readyForEv,
      expectedValueUnavailableReason: horse.expectedValueUnavailableReason,
      assessmentStatus: horse.evDecision.assessmentStatus,
      investmentDecisionPossible: horse.evDecision.investmentDecisionPossible,
      decisionState: horse.evDecision.decisionState,
      finalDecision: horse.evDecision.finalDecision,
      strategyCandidates: candidateStatus ? [...strategies] : [],
      diagnostics: [
        ...(gateDiagnostic?.errors ?? []).map((diagnostic) => ({
          ...diagnostic,
          source: "FORMAL_GATE" as const,
        })),
        ...oddsDiagnostics.filter((diagnostic) => diagnostic.horseId === horse.horseId).map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          source: "ODDS" as const,
        })),
        ...(horse.expectedValueUnavailableReason === null ? [] : [{
          code: horse.expectedValueUnavailableReason,
          message: "Expected Valueを正式計算できませんでした。",
          source: "EXPECTED_VALUE" as const,
        }]),
        ...horse.evDecision.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          source: "EV_DECISION" as const,
        })),
      ],
    };
  });
  const datasetFingerprint = fingerprintHistories(histories);
  const artifactId = buildRacePredictionArtifactId({
    raceId: prediction.race.raceId,
    predictionStage,
    predictionCutoffAt,
    modelVersion: prediction.modelVersion,
    decisionPolicyVersion: prediction.evDecisionContext.policy.policyVersion,
  });
  const withoutFingerprint: Omit<RacePredictionArtifact, "predictionContentFingerprint"> = {
    artifactId,
    artifactType: "RACE_PREDICTION",
    artifactStatus: formalPredictionReady ? "FORMAL_PREDICTION" : "DIAGNOSTIC_ONLY",
    schemaVersion: RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION,
    race: {
      raceId: prediction.race.raceId,
      raceDate: prediction.race.raceDate,
      raceName: prediction.race.raceName,
      venue: prediction.race.racecourse,
      surface: prediction.race.surface,
      distance: prediction.race.distance,
      raceStartAt: prediction.raceStartAt ?? null,
    },
    predictionStage,
    predictionCutoffAt,
    generatedAt: prediction.generatedAt,
    modelVersion: prediction.modelVersion,
    decisionPolicyId: prediction.evDecisionContext.policy.policyId,
    decisionPolicyVersion: prediction.evDecisionContext.policy.policyVersion,
    datasetFingerprint,
    source,
    provenance: buildProvenance(histories, prediction.odds ?? []),
    formalPredictionReady,
    globalDiagnostics,
    decisionContext: structuredClone(prediction.evDecisionContext),
    horses,
  };
  const contentForFingerprint = { ...withoutFingerprint, generatedAt: undefined };
  return {
    ...withoutFingerprint,
    predictionContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function buildRacePredictionArtifactId(input: {
  raceId: string;
  predictionStage: ArtifactPredictionStage;
  predictionCutoffAt: string;
  modelVersion: string;
  decisionPolicyVersion: string;
}): string {
  return [input.raceId, input.predictionStage, input.predictionCutoffAt,
    input.modelVersion, input.decisionPolicyVersion].map(sanitizeId).join("__");
}

export function serializeRacePredictionArtifact(artifact: RacePredictionArtifact): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeRacePredictionArtifact(serialized: string): RacePredictionArtifact {
  const parsed = JSON.parse(serialized) as RacePredictionArtifact;
  if (parsed.schemaVersion !== RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION ||
      parsed.artifactType !== "RACE_PREDICTION" || !parsed.artifactId) {
    throw new Error("Race Prediction Artifactの形式が不正です");
  }
  predictionTimestamp(parsed.predictionCutoffAt, "predictionCutoffAt");
  const expectedArtifactId = buildRacePredictionArtifactId({
    raceId: parsed.race.raceId,
    predictionStage: parsed.predictionStage,
    predictionCutoffAt: parsed.predictionCutoffAt,
    modelVersion: parsed.modelVersion,
    decisionPolicyVersion: parsed.decisionPolicyVersion,
  });
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Race Prediction Artifactの識別子が内容と一致しません");
  }
  if ((parsed.formalPredictionReady && parsed.artifactStatus !== "FORMAL_PREDICTION") ||
      (!parsed.formalPredictionReady && parsed.artifactStatus !== "DIAGNOSTIC_ONLY")) {
    throw new Error("Race Prediction ArtifactのFormal状態が矛盾しています");
  }
  if (!parsed.formalPredictionReady && parsed.horses.some((horse) =>
    horse.winProbability !== null || horse.place2Probability !== null || horse.place3Probability !== null ||
    horse.expectedValue !== null || horse.finalDecision !== null,
  )) {
    throw new Error("診断Artifactに正式Probability/EV/Decisionを保存できません");
  }
  if (parsed.horses.some((horse) => "actualFinishPosition" in horse) ||
      "hasResult" in parsed || "result" in parsed) {
    throw new Error("Prediction ArtifactへRace Resultを保存できません");
  }
  validateSerializedOdds(parsed.race.raceId, parsed.predictionCutoffAt, parsed.provenance.odds);
  const expectedFingerprint = fnv1a(canonicalJson({ ...parsed, generatedAt: undefined, predictionContentFingerprint: undefined }));
  if (parsed.predictionContentFingerprint !== expectedFingerprint) {
    throw new Error("Race Prediction Artifactの内容fingerprintが一致しません");
  }
  return parsed;
}

function validateSerializedOdds(
  raceId: string,
  cutoff: string,
  odds: RacePredictionArtifact["provenance"]["odds"],
): void {
  const cutoffMs = predictionTimestamp(cutoff, "predictionCutoffAt");
  for (const entry of odds) {
    const observedAtMs = predictionTimestamp(entry.observedAt, "odds.observedAt");
    const availableAtMs = entry.availableAt == null
      ? observedAtMs
      : predictionTimestamp(entry.availableAt, "odds.availableAt");
    if (entry.raceId !== raceId || observedAtMs > cutoffMs || availableAtMs > cutoffMs) {
      throw new Error("Prediction ArtifactのOddsがcutoff/raceId境界を満たしません");
    }
  }
}

function historiesFrom(
  prediction: PredictionPipelineResult | DerivedRacePrediction,
): Record<string, RacePerformance[]> {
  return "horseHistoriesByHorseId" in prediction
    ? prediction.horseHistoriesByHorseId
    : prediction.priorHistoriesByHorseId;
}

function validateArtifactBoundaries(
  raceId: string,
  raceDate: string,
  raceStartAt: string | null,
  cutoff: string,
  histories: Record<string, RacePerformance[]>,
  odds: readonly OddsSnapshotEntry[],
): void {
  for (const races of Object.values(histories)) {
    for (const race of races) {
      if (!isPriorPerformance(race, { raceId, raceDate, postTimeIso: raceStartAt ?? undefined }, cutoff)) {
        throw new Error(`Prediction Artifactへfuture/target historyを保存できません: ${race.raceId}`);
      }
    }
  }
  const cutoffMs = predictionTimestamp(cutoff, "predictionCutoffAt");
  for (const entry of odds) {
    const observedAtMs = predictionTimestamp(entry.observedAt, "odds.observedAt");
    const availableAtMs = entry.availableAt == null
      ? observedAtMs
      : predictionTimestamp(entry.availableAt, "odds.availableAt");
    if (entry.raceId !== raceId || observedAtMs > cutoffMs || availableAtMs > cutoffMs) {
      throw new Error("Prediction Artifactへ別レースまたはcutoff後のOddsを保存できません");
    }
  }
}

function fingerprintHistories(histories: Record<string, RacePerformance[]>): string {
  const normalized = Object.keys(histories).sort().map((horseId) => ({
    horseId,
    races: [...histories[horseId]]
      .sort((a, b) => b.raceDate.localeCompare(a.raceDate) || a.raceId.localeCompare(b.raceId))
      .map(({ importedAt: _importedAt, ...race }) => race),
  }));
  const raceCount = normalized.reduce((sum, horse) => sum + horse.races.length, 0);
  return `${normalized.length}h-${raceCount}r-${fnv1a(canonicalJson(normalized))}`;
}

function buildProvenance(
  histories: Record<string, RacePerformance[]>,
  odds: readonly OddsSnapshotEntry[],
): RacePredictionArtifact["provenance"] {
  return {
    histories: Object.keys(histories).sort().flatMap((horseId) => histories[horseId].map((race) => ({
      canonicalHorseId: horseId,
      raceId: race.raceId,
      source: race.source ?? null,
      sourceRaceId: race.sourceRaceId ?? null,
      sourceHorseId: race.sourceHorseId ?? null,
      availableAt: race.availableAt ?? null,
    }))),
    odds: odds.map((entry) => ({
      raceId: entry.raceId,
      horseId: entry.horseId,
      observedAt: entry.observedAt,
      ...(entry.availableAt !== undefined ? { availableAt: entry.availableAt } : {}),
      market: entry.market,
      source: entry.source,
      ...(entry.sourceIdentifier !== undefined ? { sourceIdentifier: entry.sourceIdentifier } : {}),
    })),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field}が必要です`);
  return value;
}

/** Probability・Odds・EV・Decisionを1レースの変更不能な予測記録へ統合する。 */

import { fnv1a, MODEL_VERSION } from "../ability/datasetVersion";
import { isPriorPerformance, predictionTimestamp } from "../ability/predictionBoundary";
import { PLACKETT_LUCE_TEMPERATURE } from "../ability/outcomeProbability";
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

/* ============================================================================
 * Race Prediction Artifact schema v2（Probability Calibration V1・P0基盤）。
 *
 * v1（RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION）は無変更のまま既存reader/既存保存分の
 * 互換性を維持する。v2はv1のbuildRacePredictionArtifact()をそのまま呼び出して
 * 既存の境界チェック・fingerprint計算を再利用し、Calibration用の追加メタデータ
 * （generationMode・artifactCreatedAtとpredictionCutoffAtの分離・モデルバージョン・
 * probability raw値・modelConfigFingerprint）を追加した上位互換schemaとして提供する。
 *
 * artifactCreatedAt（Artifactを実際に生成した時刻）とpredictionCutoffAt（予測に使って
 * よい情報の締切）は、Historical Replayで大きく乖離しうるため明確に分離する
 * （generatedAtをpredictionCutoffAtの代替として曖昧に使わない）。
 * ============================================================================ */

export const RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION_V2 = "race-prediction-artifact-v2";

export type PredictionGenerationMode = "LIVE_PRE_RACE" | "HISTORICAL_REPLAY";

/** Base Ability V1の凍結formulaバージョン（datasetVersion.tsのMODEL_VERSIONをそのまま再利用、重複定義しない） */
export const ABILITY_MODEL_VERSION = MODEL_VERSION;
/** Suitability V1（CHECKPOINT11.3以降、distance/course/going/gateの4component）のバージョン識別子 */
export const SUITABILITY_MODEL_VERSION = "suitability-v1";
/** Race Context Stage A（paceScenarioFactor/trackBiasFactor、STEP5）のバージョン識別子 */
export const RACE_CONTEXT_MODEL_VERSION = "race-context-stage-a-v1";
export const PROBABILITY_MODEL_NAME = "PLACKETT_LUCE" as const;
export const PROBABILITY_IMPLEMENTATION = "ANALYTIC" as const;
/** outcomeProbability.tsのPlackett-Luce実装（STEP6・第27実装）のバージョン識別子 */
export const PROBABILITY_MODEL_VERSION = "plackett-luce-v1";
export const CALIBRATION_STATUS_UNCALIBRATED = "UNCALIBRATED" as const;
export const PROBABILITY_SCALE_PERCENT_0_100 = "PERCENT_0_100" as const;

export interface RacePredictionArtifactHorseV2 extends RacePredictionArtifactHorse {
  top2ProbabilityRaw: number | null;
  top3ProbabilityRaw: number | null;
}

export interface RacePredictionModelMetadata {
  abilityModelVersion: string;
  suitabilityModelVersion: string;
  raceContextModelVersion: string;
  probabilityModelName: typeof PROBABILITY_MODEL_NAME;
  probabilityImplementation: typeof PROBABILITY_IMPLEMENTATION;
  probabilityModelVersion: string;
  /** Plackett-Luce温度パラメータ。outcomeProbability.tsのPLACKETT_LUCE_TEMPERATUREをそのまま転記する（変更禁止・V1固定値=10）。 */
  temperature: number;
  calibrationStatus: typeof CALIBRATION_STATUS_UNCALIBRATED;
  probabilityScale: typeof PROBABILITY_SCALE_PERCENT_0_100;
}

export interface RacePredictionArtifactV2 {
  artifactId: string;
  artifactType: "RACE_PREDICTION";
  artifactStatus: RacePredictionArtifactStatus;
  schemaVersion: typeof RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION_V2;
  generationMode: PredictionGenerationMode;
  /** Artifactを実際に生成した時刻（Historical Replayでは現在時刻。predictionCutoffAtの代替に使わない）。 */
  artifactCreatedAt: string;
  race: {
    raceId: string;
    raceDate: string;
    raceName: string;
    venue: string;
    surface: "turf" | "dirt";
    distance: number;
    raceStartAt: string | null;
    /** 公式発表頭数。不明ならnull（推測しない）。 */
    declaredFieldSize: number | null;
    /** このArtifactが実際に予測対象とした頭数（horses.length）。 */
    predictedRunnerCount: number;
    /** 出走表が利用可能になった時刻。不明ならnull。 */
    raceCardAvailableAt: string | null;
  };
  predictionStage: ArtifactPredictionStage;
  /** 予測に使ってよい情報の締切（artifactCreatedAtとは別概念）。 */
  predictionCutoffAt: string;
  /** v1互換フィールド。v2ではartifactCreatedAtと同義（旧readerのため保持）。 */
  generatedAt: string;
  modelVersion: string;
  decisionPolicyId: string;
  decisionPolicyVersion: string;
  datasetFingerprint: string;
  modelMetadata: RacePredictionModelMetadata;
  /** probabilityモデル構成（実装・temperature・各種modelVersion）だけのfingerprint。 */
  modelConfigFingerprint: string;
  source: "COLLECTOR_PREDICTION_PIPELINE" | "FORMAL_SNAPSHOT_PIPELINE";
  provenance: RacePredictionArtifact["provenance"];
  formalPredictionReady: boolean;
  globalDiagnostics: ArtifactDiagnostic[];
  decisionContext: PredictionPipelineResult["evDecisionContext"];
  horses: RacePredictionArtifactHorseV2[];
  predictionContentFingerprint: string;
}

export interface BuildRacePredictionArtifactV2Options {
  generationMode: PredictionGenerationMode;
  /** Artifactを実際に生成した時刻。省略時はpredictionCutoffAt/generatedAtの代替を使わず必須とする。 */
  artifactCreatedAt: string;
  declaredFieldSize?: number | null;
  raceCardAvailableAt?: string | null;
}

function buildModelMetadata(): RacePredictionModelMetadata {
  return {
    abilityModelVersion: ABILITY_MODEL_VERSION,
    suitabilityModelVersion: SUITABILITY_MODEL_VERSION,
    raceContextModelVersion: RACE_CONTEXT_MODEL_VERSION,
    probabilityModelName: PROBABILITY_MODEL_NAME,
    probabilityImplementation: PROBABILITY_IMPLEMENTATION,
    probabilityModelVersion: PROBABILITY_MODEL_VERSION,
    temperature: PLACKETT_LUCE_TEMPERATURE,
    calibrationStatus: CALIBRATION_STATUS_UNCALIBRATED,
    probabilityScale: PROBABILITY_SCALE_PERCENT_0_100,
  };
}

export function buildRacePredictionArtifactModelConfigFingerprint(modelMetadata: RacePredictionModelMetadata): string {
  return fnv1a(canonicalJson(modelMetadata));
}

export function buildRacePredictionArtifactV2Id(input: {
  raceId: string;
  predictionStage: ArtifactPredictionStage;
  predictionCutoffAt: string;
  modelVersion: string;
  decisionPolicyVersion: string;
  generationMode: PredictionGenerationMode;
}): string {
  return [
    input.raceId, input.predictionStage, input.predictionCutoffAt,
    input.modelVersion, input.decisionPolicyVersion, "v2", input.generationMode,
  ].map(sanitizeId).join("__");
}

/**
 * v1のbuildRacePredictionArtifact()をそのまま呼び出し（既存の境界チェック・
 * Formal Gate整合性チェックを再利用・重複させない）、Calibration用メタデータを
 * 追加したv2 Artifactを構築する。probability計算式・T=10は一切変更しない
 * （PLACKETT_LUCE_TEMPERATUREを転記するだけで、独自に再計算しない）。
 */
export function buildRacePredictionArtifactV2(
  prediction: PredictionPipelineResult | DerivedRacePrediction,
  options: BuildRacePredictionArtifactV2Options,
): RacePredictionArtifactV2 {
  const artifactCreatedAt = requiredString(options.artifactCreatedAt, "artifactCreatedAt");
  predictionTimestamp(artifactCreatedAt, "artifactCreatedAt");
  const v1 = buildRacePredictionArtifact(prediction);
  const modelMetadata = buildModelMetadata();
  const modelConfigFingerprint = buildRacePredictionArtifactModelConfigFingerprint(modelMetadata);

  const rawByHorseId = new Map(prediction.horses.map((h) => [h.horseId, h]));
  const horses: RacePredictionArtifactHorseV2[] = v1.horses.map((horse) => {
    const raw = rawByHorseId.get(horse.canonicalHorseId);
    return {
      ...horse,
      top2ProbabilityRaw: raw?.top2ProbabilityRaw ?? null,
      top3ProbabilityRaw: raw?.top3ProbabilityRaw ?? null,
    };
  });

  const artifactId = buildRacePredictionArtifactV2Id({
    raceId: v1.race.raceId,
    predictionStage: v1.predictionStage,
    predictionCutoffAt: v1.predictionCutoffAt,
    modelVersion: v1.modelVersion,
    decisionPolicyVersion: v1.decisionPolicyVersion,
    generationMode: options.generationMode,
  });

  const withoutFingerprint: Omit<RacePredictionArtifactV2, "predictionContentFingerprint"> = {
    artifactId,
    artifactType: "RACE_PREDICTION",
    artifactStatus: v1.artifactStatus,
    schemaVersion: RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION_V2,
    generationMode: options.generationMode,
    artifactCreatedAt,
    race: {
      ...v1.race,
      declaredFieldSize: options.declaredFieldSize ?? null,
      predictedRunnerCount: horses.length,
      raceCardAvailableAt: options.raceCardAvailableAt ?? null,
    },
    predictionStage: v1.predictionStage,
    predictionCutoffAt: v1.predictionCutoffAt,
    generatedAt: artifactCreatedAt,
    modelVersion: v1.modelVersion,
    decisionPolicyId: v1.decisionPolicyId,
    decisionPolicyVersion: v1.decisionPolicyVersion,
    datasetFingerprint: v1.datasetFingerprint,
    modelMetadata,
    modelConfigFingerprint,
    source: v1.source,
    provenance: v1.provenance,
    formalPredictionReady: v1.formalPredictionReady,
    globalDiagnostics: v1.globalDiagnostics,
    decisionContext: v1.decisionContext,
    horses,
  };
  const contentForFingerprint = { ...withoutFingerprint, artifactCreatedAt: undefined, generatedAt: undefined };
  return {
    ...withoutFingerprint,
    predictionContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeRacePredictionArtifactV2(artifact: RacePredictionArtifactV2): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeRacePredictionArtifactV2(serialized: string): RacePredictionArtifactV2 {
  const parsed = JSON.parse(serialized) as RacePredictionArtifactV2;
  if (parsed.schemaVersion !== RACE_PREDICTION_ARTIFACT_SCHEMA_VERSION_V2 ||
      parsed.artifactType !== "RACE_PREDICTION" || !parsed.artifactId) {
    throw new Error("Race Prediction Artifact v2の形式が不正です");
  }
  predictionTimestamp(parsed.predictionCutoffAt, "predictionCutoffAt");
  predictionTimestamp(parsed.artifactCreatedAt, "artifactCreatedAt");
  const expectedArtifactId = buildRacePredictionArtifactV2Id({
    raceId: parsed.race.raceId,
    predictionStage: parsed.predictionStage,
    predictionCutoffAt: parsed.predictionCutoffAt,
    modelVersion: parsed.modelVersion,
    decisionPolicyVersion: parsed.decisionPolicyVersion,
    generationMode: parsed.generationMode,
  });
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Race Prediction Artifact v2の識別子が内容と一致しません");
  }
  if ((parsed.formalPredictionReady && parsed.artifactStatus !== "FORMAL_PREDICTION") ||
      (!parsed.formalPredictionReady && parsed.artifactStatus !== "DIAGNOSTIC_ONLY")) {
    throw new Error("Race Prediction Artifact v2のFormal状態が矛盾しています");
  }
  if (!parsed.formalPredictionReady && parsed.horses.some((horse) =>
    horse.winProbability !== null || horse.place2Probability !== null || horse.place3Probability !== null ||
    horse.winProbabilityRaw !== null || horse.top2ProbabilityRaw !== null || horse.top3ProbabilityRaw !== null ||
    horse.expectedValue !== null || horse.finalDecision !== null,
  )) {
    throw new Error("診断Artifactに正式Probability/EV/Decisionを保存できません");
  }
  if (parsed.horses.some((horse) => "actualFinishPosition" in horse) ||
      "hasResult" in parsed || "result" in parsed) {
    throw new Error("Prediction ArtifactへRace Resultを保存できません");
  }
  validateSerializedOdds(parsed.race.raceId, parsed.predictionCutoffAt, parsed.provenance.odds);
  const expectedModelConfigFingerprint = buildRacePredictionArtifactModelConfigFingerprint(parsed.modelMetadata);
  if (parsed.modelConfigFingerprint !== expectedModelConfigFingerprint) {
    throw new Error("Race Prediction Artifact v2のmodelConfigFingerprintが一致しません");
  }
  if (parsed.modelMetadata.temperature !== PLACKETT_LUCE_TEMPERATURE) {
    throw new Error("Race Prediction Artifact v2のtemperatureがV1固定値(10)と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, artifactCreatedAt: undefined, generatedAt: undefined, predictionContentFingerprint: undefined }),
  );
  if (parsed.predictionContentFingerprint !== expectedFingerprint) {
    throw new Error("Race Prediction Artifact v2の内容fingerprintが一致しません");
  }
  return parsed;
}

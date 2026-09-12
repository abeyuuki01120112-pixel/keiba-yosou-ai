/**
 * Calibration Eligibility V1（Probability Calibration V1・P0基盤）。
 *
 * 【最重要】これはCalibrationを実行するコードではない。「このPrediction + Resultの組を、
 * 将来Calibration Datasetへ採用可能か」だけを判定する（Hard Requirementの合否判定のみ）。
 * Temperature・Probability数式には一切触れない。
 *
 * Warning（going UNKNOWN・Track Bias neutral・memberLevel fallback・Selected-5/Scorable-4・
 * historyConfidence medium・Suitability一部未評価等）はeligibilityを自動FAILにしない。
 * 呼び出し側が任意で渡すhorseWarningsは、そのままwarningsへ転記するだけで
 * 分類・重み付けは行わない（P0スコープ外）。
 */

import { PLACKETT_LUCE_TEMPERATURE } from "../ability/outcomeProbability";
import { joinPredictionAndResult, type PredictionResultJoinResult } from "./predictionResultJoin";
import type { RacePredictionArtifactV2 } from "./racePredictionArtifact";
import { isCalibrationFinalResult, type RaceResultArtifact } from "./raceResultArtifact";

export type CalibrationHardFailureCode =
  | "NOT_SEPARATE_ARTIFACTS"
  | "CUTOFF_NOT_BEFORE_START"
  | "DUPLICATE_CANONICAL_HORSE_ID"
  | "FORMAL_GATE_NOT_PASSED"
  | "PROBABILITY_POPULATION_INCOMPLETE"
  | "RAW_PROBABILITY_MISSING"
  | "RAW_PROBABILITY_TOTAL_MISMATCH"
  | "PROBABILITY_MONOTONICITY_VIOLATION"
  | "MODEL_METADATA_MISSING"
  | "TEMPERATURE_MISSING_OR_MISMATCHED"
  | "CALIBRATION_STATUS_MISSING"
  | "FINGERPRINT_MISSING"
  | "RESULT_STATUS_NOT_FINAL"
  | "PREDICTION_POPULATION_VS_STARTER_MISMATCH"
  | "WIN_LABEL_NOT_UNIQUE"
  | "RESULT_DUPLICATE_HORSE_ID"
  | "RACE_ID_MISMATCH";

export interface CalibrationHardFailure {
  code: CalibrationHardFailureCode;
  message: string;
}

export interface CalibrationEligibilityWarning {
  canonicalHorseId: string | null;
  message: string;
}

export interface CalibrationEligibilityResult {
  predictionArtifactId: string;
  resultArtifactId: string;
  eligible: boolean;
  hardFailures: CalibrationHardFailure[];
  warnings: CalibrationEligibilityWarning[];
  join: PredictionResultJoinResult;
}

export interface EvaluateCalibrationEligibilityOptions {
  /** 呼び出し側が用意する、馬ごとの参考Warning（例: Stage AのHorseSnapshotEntry.warnings）。分類はしない。 */
  horseWarnings?: Record<string, string[]>;
  /** 許容する丸め誤差（percent）。デフォルト0.5。 */
  totalTolerance?: number;
}

const DEFAULT_TOTAL_TOLERANCE = 0.5;

export function evaluateCalibrationEligibility(
  prediction: RacePredictionArtifactV2,
  result: RaceResultArtifact,
  options: EvaluateCalibrationEligibilityOptions = {},
): CalibrationEligibilityResult {
  const tolerance = options.totalTolerance ?? DEFAULT_TOTAL_TOLERANCE;
  const hardFailures: CalibrationHardFailure[] = [];
  const warnings: CalibrationEligibilityWarning[] = [];

  // 1. Prediction / Resultが別Artifact。
  if (prediction.artifactType !== "RACE_PREDICTION" || result.artifactType !== "RACE_RESULT" ||
      prediction.artifactId === result.artifactId) {
    hardFailures.push({
      code: "NOT_SEPARATE_ARTIFACTS",
      message: "PredictionとResultは別種類・別artifactIdのArtifactである必要があります。",
    });
  }

  // 2. predictionCutoffAt < scheduledStartTime。
  const scheduledStartTime = prediction.race.raceStartAt ?? result.race.scheduledStartTime;
  if (!scheduledStartTime || Date.parse(prediction.predictionCutoffAt) >= Date.parse(scheduledStartTime)) {
    hardFailures.push({
      code: "CUTOFF_NOT_BEFORE_START",
      message: "predictionCutoffAtがscheduledStartTimeより前であることを確認できません。",
    });
  }

  // 3. canonicalHorseIdが全対象馬で一意（Prediction側）。
  const predictionIdCounts = new Map<string, number>();
  for (const horse of prediction.horses) {
    predictionIdCounts.set(horse.canonicalHorseId, (predictionIdCounts.get(horse.canonicalHorseId) ?? 0) + 1);
  }
  if ([...predictionIdCounts.values()].some((count) => count > 1)) {
    hardFailures.push({
      code: "DUPLICATE_CANONICAL_HORSE_ID",
      message: "Prediction Artifact内でcanonicalHorseIdが重複しています。",
    });
  }

  // 4. Formal Gate PASS。
  if (!prediction.formalPredictionReady) {
    hardFailures.push({ code: "FORMAL_GATE_NOT_PASSED", message: "Formal Gateを通過していません。" });
  }

  // 5/6/7/8. Probability population complete・raw Win/Top2/Top3あり・raw totals整合・Win<=Top2<=Top3。
  const activeHorses = prediction.horses.filter((h) => !h.scratched);
  const incompleteProbability = activeHorses.some((h) =>
    h.winProbabilityRaw === null || h.top2ProbabilityRaw === null || h.top3ProbabilityRaw === null,
  );
  if (incompleteProbability) {
    hardFailures.push({
      code: "PROBABILITY_POPULATION_INCOMPLETE",
      message: "有効な出走馬のうち、raw Win/Top2/Top3のいずれかが欠けている馬がいます。",
    });
    hardFailures.push({
      code: "RAW_PROBABILITY_MISSING",
      message: "raw Probability（丸め前）が一部の馬で保存されていません。",
    });
  } else {
    const winTotal = activeHorses.reduce((sum, h) => sum + (h.winProbabilityRaw ?? 0), 0);
    const top2Total = activeHorses.reduce((sum, h) => sum + (h.top2ProbabilityRaw ?? 0), 0);
    const top3Total = activeHorses.reduce((sum, h) => sum + (h.top3ProbabilityRaw ?? 0), 0);
    if (Math.abs(winTotal - 100) > tolerance || Math.abs(top2Total - 200) > tolerance ||
        Math.abs(top3Total - 300) > tolerance) {
      hardFailures.push({
        code: "RAW_PROBABILITY_TOTAL_MISMATCH",
        message: `raw Probability合計がWin≒100/Top2≒200/Top3≒300から外れています` +
          `（win=${winTotal.toFixed(2)}, top2=${top2Total.toFixed(2)}, top3=${top3Total.toFixed(2)}）。`,
      });
    }
    const violatesMonotonicity = activeHorses.some((h) =>
      (h.winProbabilityRaw ?? 0) < 0 || (h.winProbabilityRaw ?? 0) > (h.top2ProbabilityRaw ?? 0) ||
      (h.top2ProbabilityRaw ?? 0) > (h.top3ProbabilityRaw ?? 0) || (h.top3ProbabilityRaw ?? 0) > 100,
    );
    if (violatesMonotonicity) {
      hardFailures.push({
        code: "PROBABILITY_MONOTONICITY_VIOLATION",
        message: "0 <= Win <= Top2 <= Top3 <= 100 を満たさない馬があります。",
      });
    }
  }

  // 9/10/11. Probability model metadata・T・calibrationStatus。
  const metadata = prediction.modelMetadata;
  if (!metadata) {
    hardFailures.push({ code: "MODEL_METADATA_MISSING", message: "Probability model metadataがありません。" });
  } else {
    if (typeof metadata.temperature !== "number" || metadata.temperature !== PLACKETT_LUCE_TEMPERATURE) {
      hardFailures.push({
        code: "TEMPERATURE_MISSING_OR_MISMATCHED",
        message: `temperatureが未保存、またはV1固定値(${PLACKETT_LUCE_TEMPERATURE})と一致しません。`,
      });
    }
    if (!metadata.calibrationStatus) {
      hardFailures.push({ code: "CALIBRATION_STATUS_MISSING", message: "calibrationStatusが保存されていません。" });
    }
  }

  // 12. dataset / model fingerprintあり。
  if (!prediction.datasetFingerprint || !prediction.modelConfigFingerprint || !prediction.predictionContentFingerprint) {
    hardFailures.push({
      code: "FINGERPRINT_MISSING",
      message: "datasetFingerprint/modelConfigFingerprint/predictionContentFingerprintのいずれかがありません。",
    });
  }

  // 13. Result status FINALまたは有効なCORRECTED。
  if (!isCalibrationFinalResult(result)) {
    hardFailures.push({
      code: "RESULT_STATUS_NOT_FINAL",
      message: `resultStatus=${result.resultStatus}はCalibration対象外です（FINAL/CORRECTEDのみ許容）。`,
    });
  }

  // Join（raceId一致・canonicalHorseId集合・population一致・winner一意性・重複拒否を集約して確認）。
  const join = joinPredictionAndResult(prediction, result);
  for (const issue of join.issues) {
    switch (issue.code) {
      case "RACE_ID_MISMATCH":
        hardFailures.push({ code: "RACE_ID_MISMATCH", message: issue.message });
        break;
      case "CANONICAL_HORSE_ID_SET_MISMATCH":
      case "PREDICTION_POPULATION_VS_STARTER_MISMATCH":
        hardFailures.push({ code: "PREDICTION_POPULATION_VS_STARTER_MISMATCH", message: issue.message });
        break;
      case "WINNER_NOT_UNIQUE":
        hardFailures.push({ code: "WIN_LABEL_NOT_UNIQUE", message: issue.message });
        break;
      case "DUPLICATE_RESULT_HORSE_ID":
        hardFailures.push({ code: "RESULT_DUPLICATE_HORSE_ID", message: issue.message });
        break;
      case "RESULT_NOT_FINAL":
        // isCalibrationFinalResult()で既に検知済み（二重計上しない）。
        break;
    }
  }
  // 15. Win labelを一意に生成可能（同着はV1 Calibration対象外、section13）。
  const winnerCount = result.runners.filter((r) => r.finishPosition === 1).length;
  if (winnerCount === 0 && !hardFailures.some((f) => f.code === "WIN_LABEL_NOT_UNIQUE")) {
    hardFailures.push({
      code: "WIN_LABEL_NOT_UNIQUE",
      message: "finishPosition=1の馬が存在せず、Win labelを一意に生成できません。",
    });
  }

  // Warning（分類しない。呼び出し側提供分のみそのまま転記）。
  if (options.horseWarnings) {
    for (const [horseId, messages] of Object.entries(options.horseWarnings)) {
      for (const message of messages) {
        warnings.push({ canonicalHorseId: horseId, message });
      }
    }
  }

  return {
    predictionArtifactId: prediction.artifactId,
    resultArtifactId: result.artifactId,
    eligible: hardFailures.length === 0,
    hardFailures: dedupe(hardFailures),
    warnings,
    join,
  };
}

function dedupe(failures: CalibrationHardFailure[]): CalibrationHardFailure[] {
  const seen = new Set<string>();
  return failures.filter((f) => {
    const key = `${f.code} ${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

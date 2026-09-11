/**
 * Formal Prediction Gate（P0-3）。
 * 予測数式には触れず、全出走予定馬の入力・履歴・既存eligibility判定を集約する。
 */

export type FormalPredictionGateErrorCode =
  | "MISSING_HORSE_HISTORY"
  | "UNRESOLVED_CANONICAL_HORSE_ID"
  | "BASE_ABILITY_UNAVAILABLE"
  | "MISSING_RUNNER_INPUT"
  | "FUTURE_DATA_REJECTED"
  | "PREDICTION_INELIGIBLE"
  | "INVALID_HORSE_HISTORY"
  | "DUPLICATE_HORSE_ID"
  | "DUPLICATE_HORSE_NUMBER"
  | "INCOMPLETE_RUNNER_SET"
  | "RACE_IDENTITY_MISMATCH"
  | "MISSING_RACE_INPUT"
  | "EMPTY_RUNNER_SET"
  | "NO_ACTIVE_RUNNERS"
  | "NOT_A_FORMAL_SNAPSHOT"
  | "SNAPSHOT_DATASET_MISMATCH"
  | "UNSUPPORTED_STAGE_B_HISTORY"
  | "INSUFFICIENT_SCORABLE_HISTORY";

export interface FormalPredictionGateError {
  code: FormalPredictionGateErrorCode;
  message: string;
}

export interface FormalPredictionRunnerFacts {
  horseId: string | null;
  horseName: string;
  horseNumber: number | null;
  explicitlyExcluded: boolean;
  canonicalHorseIdResolved: boolean;
  runnerInputComplete: boolean;
  cutoffSatisfied: boolean;
  hasHorseHistory: boolean;
  baseAbilityAvailable: boolean;
  existingPredictionEligible: boolean;
  existingEligibilityReasons: string[];
  historyErrors: FormalPredictionGateError[];
}

export interface FormalPredictionHorseDiagnostic {
  horseId: string | null;
  horseName: string;
  horseNumber: number | null;
  explicitlyExcluded: boolean;
  predictionEligible: boolean;
  errors: FormalPredictionGateError[];
}

export interface FormalPredictionGateResult {
  /** 後方互換用。formalPredictionReadyと常に同じ値。 */
  formal: boolean;
  formalPredictionReady: boolean;
  reasons: string[];
  globalErrors: FormalPredictionGateError[];
  horseDiagnostics: FormalPredictionHorseDiagnostic[];
  ineligibleHorses: FormalPredictionHorseDiagnostic[];
}

function uniqueErrors(errors: readonly FormalPredictionGateError[]): FormalPredictionGateError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}\u0000${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function evaluateFormalPredictionGate(
  runners: readonly FormalPredictionRunnerFacts[],
  globalErrors: readonly FormalPredictionGateError[],
): FormalPredictionGateResult {
  const horseDiagnostics = runners.map((runner): FormalPredictionHorseDiagnostic => {
    if (runner.explicitlyExcluded) {
      return {
        horseId: runner.horseId,
        horseName: runner.horseName,
        horseNumber: runner.horseNumber,
        explicitlyExcluded: true,
        predictionEligible: false,
        errors: [],
      };
    }

    const errors = [...runner.historyErrors];
    if (!runner.canonicalHorseIdResolved) {
      errors.push({
        code: "UNRESOLVED_CANONICAL_HORSE_ID",
        message: "canonical horseIdを安全に解決できません。",
      });
    }
    if (!runner.runnerInputComplete) {
      errors.push({ code: "MISSING_RUNNER_INPUT", message: "正式予測に必要なRunner情報が不足しています。" });
    }
    if (!runner.cutoffSatisfied) {
      errors.push({ code: "FUTURE_DATA_REJECTED", message: "cutoff後に利用可能になったRunner情報です。" });
    }
    if (!runner.hasHorseHistory) {
      errors.push({ code: "MISSING_HORSE_HISTORY", message: "cutoff以前の利用可能なHorse Historyがありません。" });
    }
    if (!runner.baseAbilityAvailable) {
      errors.push({ code: "BASE_ABILITY_UNAVAILABLE", message: "Base Abilityを計算できません。" });
    }
    if (!runner.existingPredictionEligible) {
      errors.push({
        code: "PREDICTION_INELIGIBLE",
        message: runner.existingEligibilityReasons.length > 0
          ? `既存eligibility判定: ${runner.existingEligibilityReasons.join(",")}`
          : "既存eligibility判定を通過していません。",
      });
    }
    const deduplicated = uniqueErrors(errors);
    return {
      horseId: runner.horseId,
      horseName: runner.horseName,
      horseNumber: runner.horseNumber,
      explicitlyExcluded: false,
      predictionEligible: deduplicated.length === 0,
      errors: deduplicated,
    };
  });

  const active = horseDiagnostics.filter((runner) => !runner.explicitlyExcluded);
  const normalizedGlobalErrors = uniqueErrors(globalErrors);
  if (runners.length === 0 && !normalizedGlobalErrors.some((error) => error.code === "EMPTY_RUNNER_SET")) {
    normalizedGlobalErrors.push({ code: "EMPTY_RUNNER_SET", message: "出走予定馬が0頭です。" });
  }
  if (runners.length > 0 && active.length === 0 &&
      !normalizedGlobalErrors.some((error) => error.code === "NO_ACTIVE_RUNNERS")) {
    normalizedGlobalErrors.push({ code: "NO_ACTIVE_RUNNERS", message: "明示取消・除外を除く出走予定馬が0頭です。" });
  }

  const ineligibleHorses = active.filter((runner) => !runner.predictionEligible);
  const formalPredictionReady = normalizedGlobalErrors.length === 0 && ineligibleHorses.length === 0 && active.length > 0;
  const reasons = uniqueErrors([
    ...normalizedGlobalErrors,
    ...ineligibleHorses.flatMap((runner) => runner.errors.map((error) => ({
      code: error.code,
      message: `${runner.horseId ?? "(unresolved)"}: ${error.message}`,
    }))),
  ]).map((error) => `${error.code}: ${error.message}`);

  return {
    formal: formalPredictionReady,
    formalPredictionReady,
    reasons,
    globalErrors: normalizedGlobalErrors,
    horseDiagnostics,
    ineligibleHorses,
  };
}

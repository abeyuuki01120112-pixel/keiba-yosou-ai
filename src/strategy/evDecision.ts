/**
 * EV Decision Structure V1。
 * Prediction/Probability/Odds/EVの計算後にだけ動作し、購入命令や資金額は生成しない。
 */

export const EV_DECISION_MODEL_VERSION = "ev-decision-foundation-v1";

export type EvAssessmentStatus =
  | "NOT_EVALUABLE"
  | "NEGATIVE_EV"
  | "BREAK_EVEN"
  | "POSITIVE_EV_CANDIDATE"
  | "HIGH_EV_CANDIDATE";

export type InvestmentDecisionState =
  | "NOT_EVALUABLE"
  | "KEN_CANDIDATE"
  | "STRATEGY_REVIEW_REQUIRED";

/** P0-6では常にnull。Historical Replayで校正済みPolicyを導入した後の拡張点。 */
export type FinalBetDecision = "KEN" | "BET";

export type EvDecisionDiagnosticCode =
  | "EV_INPUT_NOT_READY"
  | "INVALID_EXPECTED_VALUE"
  | "NEGATIVE_EXPECTED_VALUE"
  | "BREAK_EVEN_EXPECTED_VALUE"
  | "UNCERTAINTY_NOT_MODELED"
  | "STRATEGY_POLICY_REQUIRED"
  | "HIGH_EV_POLICY_NOT_CONFIGURED";

export interface EvDecisionDiagnostic {
  code: EvDecisionDiagnosticCode;
  message: string;
}

/**
 * Historical Replayで差し替える校正Policy。
 * highEvCandidateMin=nullは「高EV境界をまだ決めていない」を意味する。
 */
export interface EvDecisionPolicy {
  policyId: string;
  policyVersion: string;
  calibrationStatus: "UNCALIBRATED" | "HISTORICAL_REPLAY_CALIBRATED";
  highEvCandidateMin: number | null;
}

export const UNCALIBRATED_EV_DECISION_POLICY: Readonly<EvDecisionPolicy> = Object.freeze({
  policyId: "uncalibrated-ev-foundation",
  policyVersion: "v1",
  calibrationStatus: "UNCALIBRATED",
  highEvCandidateMin: null,
});

export interface EvUncertaintyExtension {
  status: "NOT_MODELED";
  predictionConfidence: number | null;
  probabilityCalibration: number | null;
  sampleSize: number | null;
  modelUncertainty: number | null;
  marketUncertainty: number | null;
}

export interface EvDecisionAssessment {
  assessmentStatus: EvAssessmentStatus;
  investmentDecisionPossible: boolean;
  decisionState: InvestmentDecisionState;
  /** P0-6では自動設定しない。POSITIVE/HIGHもBETを意味しない。 */
  finalDecision: FinalBetDecision | null;
  uncertainty: EvUncertaintyExtension;
  diagnostics: EvDecisionDiagnostic[];
}

export type StrategyKind =
  | "SINGLE_WIN_EV"
  | "HIGH_UPSIDE_ROI"
  | "BET_PORTFOLIO";

export interface StrategyFoundation {
  strategy: StrategyKind;
  status: "FOUNDATION_ONLY";
  additionalRequirements: string[];
}

export interface EvDecisionContext {
  decisionModelVersion: string;
  policy: EvDecisionPolicy;
  strategies: StrategyFoundation[];
  capitalAllocation: {
    basis: "RACE_BUDGET_RATIO";
    buckets: ["CORE", "SECONDARY", "UPSIDE"];
    configuredRatios: null;
  };
  historicalReplayCompatible: true;
}

const EMPTY_UNCERTAINTY: EvUncertaintyExtension = {
  status: "NOT_MODELED",
  predictionConfidence: null,
  probabilityCalibration: null,
  sampleSize: null,
  modelUncertainty: null,
  marketUncertainty: null,
};

export function resolveEvDecisionPolicy(policy?: EvDecisionPolicy): EvDecisionPolicy {
  const resolved = policy ?? UNCALIBRATED_EV_DECISION_POLICY;
  if (!resolved.policyId.trim() || !resolved.policyVersion.trim()) {
    throw new Error("EV Decision PolicyにはpolicyId/policyVersionが必要です");
  }
  if (resolved.highEvCandidateMin !== null &&
      (!Number.isFinite(resolved.highEvCandidateMin) || resolved.highEvCandidateMin <= 1)) {
    throw new Error("highEvCandidateMinは1より大きい有限値、またはnullである必要があります");
  }
  return { ...resolved };
}

export function buildEvDecisionContext(policy?: EvDecisionPolicy): EvDecisionContext {
  return {
    decisionModelVersion: EV_DECISION_MODEL_VERSION,
    policy: resolveEvDecisionPolicy(policy),
    strategies: [
      {
        strategy: "SINGLE_WIN_EV",
        status: "FOUNDATION_ONLY",
        additionalRequirements: ["historical replay calibrated decision policy"],
      },
      {
        strategy: "HIGH_UPSIDE_ROI",
        status: "FOUNDATION_ONLY",
        additionalRequirements: ["return distribution", "drawdown constraints", "replay calibrated policy"],
      },
      {
        strategy: "BET_PORTFOLIO",
        status: "FOUNDATION_ONLY",
        additionalRequirements: ["multi-market probability", "scenario correlation", "allocation policy"],
      },
    ],
    capitalAllocation: {
      basis: "RACE_BUDGET_RATIO",
      buckets: ["CORE", "SECONDARY", "UPSIDE"],
      configuredRatios: null,
    },
    historicalReplayCompatible: true,
  };
}

export function assessEvDecision(input: {
  expectedValue: number | null;
  readyForEv: boolean;
  policy?: EvDecisionPolicy;
}): EvDecisionAssessment {
  const policy = resolveEvDecisionPolicy(input.policy);
  if (!input.readyForEv || input.expectedValue === null) {
    return assessment("NOT_EVALUABLE", false, "NOT_EVALUABLE", [
      { code: "EV_INPUT_NOT_READY", message: "正式EV入力が揃っていないため投資判断を評価できません。" },
    ]);
  }
  if (!Number.isFinite(input.expectedValue) || input.expectedValue < 0) {
    return assessment("NOT_EVALUABLE", false, "NOT_EVALUABLE", [
      { code: "INVALID_EXPECTED_VALUE", message: "expectedValueが0以上の有限値ではありません。" },
    ]);
  }
  if (input.expectedValue < 1) {
    return assessment("NEGATIVE_EV", true, "KEN_CANDIDATE", [
      { code: "NEGATIVE_EXPECTED_VALUE", message: "理論上の損益分岐1.00を下回るためKEN候補です。" },
    ]);
  }
  if (input.expectedValue === 1) {
    return assessment("BREAK_EVEN", true, "KEN_CANDIDATE", [
      { code: "BREAK_EVEN_EXPECTED_VALUE", message: "理論上の損益分岐1.00と同値のためKEN候補です。" },
    ]);
  }

  const commonDiagnostics: EvDecisionDiagnostic[] = [
    { code: "UNCERTAINTY_NOT_MODELED", message: "Probability・市場の推定誤差はまだ投資判断へ接続されていません。" },
    { code: "STRATEGY_POLICY_REQUIRED", message: "候補分類は購入命令ではなく、校正済みStrategy Policyによる判断が必要です。" },
  ];
  if (policy.highEvCandidateMin !== null && input.expectedValue >= policy.highEvCandidateMin) {
    return assessment("HIGH_EV_CANDIDATE", true, "STRATEGY_REVIEW_REQUIRED", commonDiagnostics);
  }
  if (policy.highEvCandidateMin === null) {
    commonDiagnostics.push({
      code: "HIGH_EV_POLICY_NOT_CONFIGURED",
      message: "高EV候補の境界は未校正のため設定されていません。",
    });
  }
  return assessment("POSITIVE_EV_CANDIDATE", true, "STRATEGY_REVIEW_REQUIRED", commonDiagnostics);
}

function assessment(
  assessmentStatus: EvAssessmentStatus,
  investmentDecisionPossible: boolean,
  decisionState: InvestmentDecisionState,
  diagnostics: EvDecisionDiagnostic[],
): EvDecisionAssessment {
  return {
    assessmentStatus,
    investmentDecisionPossible,
    decisionState,
    finalDecision: null,
    uncertainty: { ...EMPTY_UNCERTAINTY },
    diagnostics,
  };
}

import { describe, expect, it } from "vitest";
import {
  assessEvDecision,
  buildEvDecisionContext,
  type EvDecisionPolicy,
} from "./evDecision";

const calibratedHighPolicy: EvDecisionPolicy = {
  policyId: "test-replay-policy",
  policyVersion: "test-v1",
  calibrationStatus: "HISTORICAL_REPLAY_CALIBRATED",
  highEvCandidateMin: 1.5,
};

describe("EV Decision Structure V1", () => {
  it("EV<1.0をNEGATIVE_EVかつKEN候補にするが最終KEN命令は出さない", () => {
    expect(assessEvDecision({ expectedValue: 0.92, readyForEv: true })).toMatchObject({
      assessmentStatus: "NEGATIVE_EV",
      investmentDecisionPossible: true,
      decisionState: "KEN_CANDIDATE",
      finalDecision: null,
    });
  });

  it("EV=1.02を候補に留め、自動BETにしない", () => {
    const result = assessEvDecision({ expectedValue: 1.02, readyForEv: true });
    expect(result).toMatchObject({
      assessmentStatus: "POSITIVE_EV_CANDIDATE",
      decisionState: "STRATEGY_REVIEW_REQUIRED",
      finalDecision: null,
      uncertainty: { status: "NOT_MODELED" },
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "UNCERTAINTY_NOT_MODELED",
      "STRATEGY_POLICY_REQUIRED",
      "HIGH_EV_POLICY_NOT_CONFIGURED",
    ]));
  });

  it("明確に高いEVは外部の校正済みPolicyがある場合だけHIGH候補に分類する", () => {
    const result = assessEvDecision({
      expectedValue: 1.8,
      readyForEv: true,
      policy: calibratedHighPolicy,
    });
    expect(result).toMatchObject({
      assessmentStatus: "HIGH_EV_CANDIDATE",
      decisionState: "STRATEGY_REVIEW_REQUIRED",
      finalDecision: null,
    });
  });

  it("Odds/Probability/Gate等によりEV入力が未準備なら評価不能にする", () => {
    expect(assessEvDecision({ expectedValue: null, readyForEv: false })).toMatchObject({
      assessmentStatus: "NOT_EVALUABLE",
      investmentDecisionPossible: false,
      decisionState: "NOT_EVALUABLE",
      finalDecision: null,
      diagnostics: [expect.objectContaining({ code: "EV_INPUT_NOT_READY" })],
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正EV=%sを評価不能として診断する", (expectedValue) => {
      expect(assessEvDecision({ expectedValue, readyForEv: true })).toMatchObject({
        assessmentStatus: "NOT_EVALUABLE",
        investmentDecisionPossible: false,
        finalDecision: null,
        diagnostics: [expect.objectContaining({ code: "INVALID_EXPECTED_VALUE" })],
      });
    },
  );

  it("Strategy A/B/C・資金配分率境界を固定値なしで明示する", () => {
    const context = buildEvDecisionContext();
    expect(context.policy).toMatchObject({
      calibrationStatus: "UNCALIBRATED",
      highEvCandidateMin: null,
    });
    expect(context.strategies.map((strategy) => strategy.strategy)).toEqual([
      "SINGLE_WIN_EV",
      "HIGH_UPSIDE_ROI",
      "BET_PORTFOLIO",
    ]);
    expect(context.capitalAllocation).toEqual({
      basis: "RACE_BUDGET_RATIO",
      buckets: ["CORE", "SECONDARY", "UPSIDE"],
      configuredRatios: null,
    });
    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });

  it("不正な未校正閾値Policyを拒否する", () => {
    expect(() => assessEvDecision({
      expectedValue: 1.2,
      readyForEv: true,
      policy: { ...calibratedHighPolicy, highEvCandidateMin: 1 },
    })).toThrow(/highEvCandidateMin/);
  });
});

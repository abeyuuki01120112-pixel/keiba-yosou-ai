/**
 * Suitability Core V1 の最小ビルダー（CHECKPOINT 9）。
 *
 * 【重要】ここではSuitability Scoreの最終計算式を一切決定しない。
 * 各componentのscoreは常にnull。effectiveAbility/overallSuitabilityへの接続もまだ行わない。
 * baseAbility/raceScore/memberLevel V1のいずれも参照しない。
 */

import { evaluateTokyoDirt1600GateContext, type RaceGateInput } from "./courseContextPrior";
import type { RunningStyleProfile } from "./raceContextTypes";
import type {
  SuitabilityComponentKey,
  SuitabilityComponentV1,
  SuitabilityConfidenceV1,
  SuitabilityCoreV1,
} from "./suitabilityCoreV1Types";

/** データ・根拠のどちらも無い、安全な既定状態（notEvaluated）のcomponentを作る */
export function buildNotEvaluatedComponent(key: SuitabilityComponentKey): SuitabilityComponentV1 {
  return {
    key,
    evaluated: false,
    score: null,
    confidence: "unknown",
    reason: `${key}: 現時点で評価根拠（本人実績・コース事前分布のいずれも）が無いため未評価。`,
    source: "none",
    horseEvidence: null,
    coursePrior: null,
  };
}

/** 7要素すべてが未評価（notEvaluated）のSuitabilityCoreV1を返す、安全な既定値 */
export function buildNotEvaluatedSuitabilityCoreV1(): SuitabilityCoreV1 {
  return {
    distance: buildNotEvaluatedComponent("distance"),
    course: buildNotEvaluatedComponent("course"),
    surface: buildNotEvaluatedComponent("surface"),
    turn: buildNotEvaluatedComponent("turn"),
    going: buildNotEvaluatedComponent("going"),
    gate: buildNotEvaluatedComponent("gate"),
    runningStyle: buildNotEvaluatedComponent("runningStyle"),
  };
}

/**
 * 東京ダート1600m限定：既存のCourseContextPrior（CHECKPOINT8）評価結果を
 * SuitabilityComponentV1（gate）の形へマッピングする。
 *
 * これはCHECKPOINT9 STEP3の例（「gate: score=未確定, confidence=high, reason=..., source=CourseContextPrior」）
 * を実コードで示す最小デモであり、scoreは常にnullのまま（percent変換はまだ行わない）。
 * horseEvidence（本人実績）は現状RacePerformanceに枠別実績を集計する仕組みが無いため
 * 常にnull（CHECKPOINT9報告の既知の制約と同じ）。
 */
export function buildTokyoDirt1600GateComponent(input: {
  gate: RaceGateInput;
  runningStyle: RunningStyleProfile;
}): SuitabilityComponentV1 {
  const result = evaluateTokyoDirt1600GateContext({
    gate: input.gate,
    runningStyle: input.runningStyle,
    // 枠別の本人実績を集計する仕組みが現状無いため、常に"low"（データ無し扱い）を渡す
    horseEvidenceConfidence: "low",
  });

  if (result.courseContextPrior === null) {
    return {
      key: "gate",
      evaluated: false,
      score: null,
      confidence: "unknown",
      reason: "枠番・馬番・頭数のいずれかが不明のため、gate適性は評価不能（推測で埋めない）。",
      source: "none",
      horseEvidence: null,
      coursePrior: null,
    };
  }

  const coursePriorConfidence: SuitabilityConfidenceV1 = result.courseContextPrior.sourceConfidence;

  return {
    key: "gate",
    evaluated: true,
    score: null,
    confidence: result.overallConfidence,
    reason:
      "東京ダート1600mは芝スタートで外枠ほど芝部分を長く走れる構造が複数ソースで一致している" +
      "（gateBiasLevel=" +
      result.courseContextPrior.gateBiasLevel +
      "）。ただし2026-08-22のCHECKPOINT10.1〜10.2実データ検証（30レース・451頭）では" +
      "frame-finishPosition相関がほぼゼロ・方向不安定であり（empiricalValidationStatus=" +
      result.courseContextPrior.empiricalValidationStatus +
      "）、CHECKPOINT10.3で強い数値補正には使わない方針とした（reasonCodes: " +
      result.reasonCodes.join(", ") +
      "）。scoreはpercent未変換のまま。",
    source: "coursePrior",
    // 本人実績の集計手段が無いため常にnull（Course Priorのみのcomponentになる）
    horseEvidence: null,
    coursePrior: {
      confidence: coursePriorConfidence,
      reason: `gateCoefficient=${result.rawCoursePrior}（unitless, -1〜+1）、gateBiasLevel=${result.courseContextPrior.gateBiasLevel}`,
      referenceSource: "courseContextPrior.ts (TOKYO_DIRT_1600)",
    },
  };
}

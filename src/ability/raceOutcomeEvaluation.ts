/**
 * raceOutcomeEvaluation（STEP6・第27実装）の統合オーケストレーター。
 *
 *   finalRaceAbility（STEP5.1の最終出力）
 *     → stabilityFactor（downside semi-deviation）
 *     → winScore / top2Score / top3Score（ハイブリッド方式、outcomeScore.ts）
 *     → winProbability / top2Probability / top3Probability（Plackett-Luce、outcomeProbability.ts）
 *
 * STEP1〜5.1の計算式は一切変更しない。除外馬（scratched）は、確率計算のプール・
 * スコア側のfieldAverage・margin比較対象のすべてから取り除いたうえで、確定した
 * 最終メンバーだけを使って再計算する（除外前の頭数に依存する値を一切残さない）。
 *
 * 【confidence分離の原則・2026-08-19正式決定（docs/step6-decisions.md 1-2、Design A）】
 * confidenceは「その予測・能力評価をどれだけ信用してよいか」を表す独立した表示用情報で
 * あり、予測値そのものではない。同じfinalRaceAbilityであれば、evaluationConfidenceが
 * 異なってもwinProbability/winScore等を直接変更してはいけない（confidenceに応じた
 * 縮小・重み付けをscore/probability側に混入させない）。この関数はconfidenceを表示用の
 * 独立フィールドとしてのみ計算し、score/probabilityの計算パス（outcomeScore.ts/
 * outcomeProbability.ts）には一切渡していない。この分離はSTEP6に限らず本プロジェクト
 * 全体の原則（docs/prediction-philosophy.md）である。
 */

import { computeStabilityFactor } from "./stabilityFactor";
import { computeOutcomeScores } from "./outcomeScore";
import { computeOutcomeProbabilities } from "./outcomeProbability";
import type { SuitabilityConfidenceV1 } from "./suitabilityCoreV1Types";
import type { FinalRaceAbilityResult } from "./raceContextTypes";
import type { HorseOutcomeInput, HorseOutcomeResult } from "./raceOutcomeTypes";

/**
 * unknown/low/medium/highの4段階ランク（CHECKPOINT11.14）。suitability.distance/course/going
 * （Suitability V1、evaluated=falseの場合はconfidence="unknown"になりうる）と、runningStyle/
 * paceScenarioFactor/trackBiasFactor（旧3段階、high/medium/lowのみ）を同じ配列で比較するために、
 * 旧CONFIDENCE_RANK（low/medium/highのみ）を4段階へ拡張する。新しい判定ロジックの追加ではなく、
 * "unknown"を「既存3段階よりさらに弱い」ものとして順位表へ加えるだけの最小限の型対応。
 */
const CONFIDENCE_RANK: Record<SuitabilityConfidenceV1, number> = { unknown: 0, low: 1, medium: 2, high: 3 };

/**
 * finalRaceAbility算出に寄与した各種confidenceのうち、最も弱いもの（weakest-link）を
 * evaluationConfidenceとして採用する。1つでも低信頼な要素があれば、全体としても
 * 低信頼として表示する、という保守的な考え方。V1として正式採用（docs/step6-decisions.md 1-2）。
 *
 * 【CHECKPOINT11.14】suitabilityの参照先をSuitability V1（distance/course/going）へ更新した
 * フィールド参照修正のみ。gateのconfidenceは今回の対象に含めない（既存3項目からの単純な
 * フィールド名対応に留め、新しい評価対象の追加は行わないため）。
 */
export function resolveEvaluationConfidence(result: FinalRaceAbilityResult): SuitabilityConfidenceV1 {
  const confidences: SuitabilityConfidenceV1[] = [
    result.suitability.distance.confidence,
    result.suitability.going.confidence,
    result.suitability.course.confidence,
    result.runningStyle.confidence,
    result.raceContext.paceScenarioFactor.confidence,
    result.raceContext.trackBiasFactor.confidence,
  ];
  return confidences.reduce((weakest, current) =>
    CONFIDENCE_RANK[current] < CONFIDENCE_RANK[weakest] ? current : weakest,
  );
}

/**
 * 出走予定馬全体（除外フラグ込み）からSTEP6の最終結果を算出する。
 * scratched=trueの馬は戻り値に含まれない。
 */
export function evaluateRaceOutcomes(horses: HorseOutcomeInput[]): HorseOutcomeResult[] {
  const activeHorses = horses.filter((h) => !h.scratched);
  if (activeHorses.length === 0) return [];

  const stabilityByHorseId = new Map(
    activeHorses.map((h) => [h.horseId, computeStabilityFactor(h.recentRaces)] as const),
  );

  const scores = computeOutcomeScores(
    activeHorses.map((h) => ({
      id: h.horseId,
      finalRaceAbility: h.finalRaceAbilityResult.finalRaceAbility,
      stabilityFactor: stabilityByHorseId.get(h.horseId)!.stabilityFactor,
    })),
  );
  const scoreByHorseId = new Map(scores.map((s) => [s.id, s] as const));

  const probabilities = computeOutcomeProbabilities(
    activeHorses.map((h) => ({ id: h.horseId, finalRaceAbility: h.finalRaceAbilityResult.finalRaceAbility })),
  );
  const probabilityByHorseId = new Map(probabilities.map((p) => [p.id, p] as const));

  return activeHorses.map((h) => {
    const stability = stabilityByHorseId.get(h.horseId)!;
    const score = scoreByHorseId.get(h.horseId)!;
    const probability = probabilityByHorseId.get(h.horseId)!;

    return {
      horseId: h.horseId,
      horseName: h.horseName,
      baseAbility: h.finalRaceAbilityResult.baseAbility,
      suitability: h.finalRaceAbilityResult.suitability.overallSuitabilityPercent,
      finalRaceAbility: h.finalRaceAbilityResult.finalRaceAbility,
      winScore: score.winScore,
      top2Score: score.top2Score,
      top3Score: score.top3Score,
      winProbability: probability.winProbability,
      top2Probability: probability.top2Probability,
      top3Probability: probability.top3Probability,
      evaluationConfidence: resolveEvaluationConfidence(h.finalRaceAbilityResult),
      stabilityFactor: stability.stabilityFactor,
      stabilityConfidence: stability.stabilityConfidence,
    };
  });
}

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
 */

import { computeStabilityFactor } from "./stabilityFactor";
import { computeOutcomeScores } from "./outcomeScore";
import { computeOutcomeProbabilities } from "./outcomeProbability";
import type { SuitabilityConfidence } from "./suitabilityTypes";
import type { FinalRaceAbilityResult } from "./raceContextTypes";
import type { HorseOutcomeInput, HorseOutcomeResult } from "./raceOutcomeTypes";

const CONFIDENCE_RANK: Record<SuitabilityConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * finalRaceAbility算出に寄与した各種confidenceのうち、最も弱いもの（weakest-link）を
 * evaluationConfidenceとして採用する。1つでも低信頼な要素があれば、全体としても
 * 低信頼として表示する、という保守的な考え方。
 */
export function resolveEvaluationConfidence(result: FinalRaceAbilityResult): SuitabilityConfidence {
  const confidences: SuitabilityConfidence[] = [
    result.suitability.distanceSuitability.confidence,
    result.suitability.goingSuitability.confidence,
    result.suitability.courseSuitability.confidence,
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
      suitability: h.finalRaceAbilityResult.suitability.overallSuitability,
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

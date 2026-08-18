/**
 * suitability（第22実装・STEP4）のconfidence判定とDesign-2縮小処理。
 * scoreとconfidenceは分離しつつ、V1ではDesign-2（小サンプルのrawをconfidenceに応じて
 * 100%側へ縮小したadjusted値をoverall統合に使う）を採用する。
 */

import { isPlaceholderSource } from "./baselineLookup";
import type { RacePerformance } from "./types";
import type { SuitabilityConfidence } from "./suitabilityTypes";

export const SUITABILITY_CENTER = 100;
export const SUITABILITY_CLAMP_MIN = 90;
export const SUITABILITY_CLAMP_MAX = 110;

/** confidence → shrink係数。adjustedSuitability = 100 + (raw - 100) × weight */
export const CONFIDENCE_SHRINK_WEIGHTS: Record<SuitabilityConfidence, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

/** sampleCountからの基本confidence判定。高:4走以上 / 中:2〜3走 / 低:0〜1走 */
export function baseConfidenceFromSampleCount(sampleCount: number): SuitabilityConfidence {
  if (sampleCount >= 4) return "high";
  if (sampleCount >= 2) return "medium";
  return "low";
}

function downgradeConfidence(confidence: SuitabilityConfidence): SuitabilityConfidence {
  if (confidence === "high") return "medium";
  return "low";
}

/**
 * その過去走がV0仮データ由来のbaseline（distanceFallback等でisPlaceholderSourceに一致するもの）や
 * memberLevelScoreAtRaceのfallback（初出走等でmemberLevelBreakdownがnull）に依存しているかを判定する。
 * 該当する場合、その過去走が使われたsuitabilityコンポーネントのconfidenceを1段階下げる対象とする。
 */
export function hasDataQualityIssue(race: RacePerformance): boolean {
  const memberLevelFallback = race.memberLevelBreakdown === null;
  const raceTimeSource = race.raceTimeBreakdown?.baselineMeta.dataSource ?? null;
  const final3FSource = race.final3FBreakdown.baselineMeta.dataSource;
  const raceTimePlaceholder = raceTimeSource !== null && isPlaceholderSource(raceTimeSource);
  const final3FPlaceholder = final3FSource !== null && isPlaceholderSource(final3FSource);
  return memberLevelFallback || raceTimePlaceholder || final3FPlaceholder;
}

/**
 * sampleCountからの基本confidenceに、使用した過去走のデータ品質問題を反映して
 * 必要なら1段階下げる。
 */
export function resolveConfidence(sampleCount: number, matchedRaces: RacePerformance[]): SuitabilityConfidence {
  const base = baseConfidenceFromSampleCount(sampleCount);
  const hasIssue = matchedRaces.some(hasDataQualityIssue);
  return hasIssue ? downgradeConfidence(base) : base;
}

/** Design-2: confidenceに応じてrawを100%側へ縮小する */
export function shrinkTowardCenter(raw: number, confidence: SuitabilityConfidence): number {
  const weight = CONFIDENCE_SHRINK_WEIGHTS[confidence];
  return SUITABILITY_CENTER + (raw - SUITABILITY_CENTER) * weight;
}

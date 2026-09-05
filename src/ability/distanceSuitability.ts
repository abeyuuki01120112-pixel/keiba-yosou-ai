/**
 * distanceSuitability（第22実装・STEP4）。
 * 対象馬自身の直近5走（baseAbilityと同じ母集団）のうち、対象距離との近さに応じて
 * 重み付けしたraceScoreの平均を、直近5走全体のraceScore平均と比較して算出する。
 *
 * 重み: 同距離=1.0 / 同距離帯=0.6 / 隣接距離帯=0.3 / それ以外=0（対象外）。
 * 展開予測は持ち込まないため、距離延長/短縮の方向・幅（distanceChangeMeters）は
 * 記録のみでraw算出には使わない。
 */

import { mean } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { distanceBandGap, getDistanceBand } from "./distanceBands";
import { resolveConfidence, shrinkTowardCenter } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { DistanceSuitabilityComponent, SuitabilityEvidenceEntry, SuitabilityTargetRaceContext } from "./suitabilityTypes";

export const DISTANCE_MATCH_WEIGHTS = {
  sameDistance: 1.0,
  sameBand: 0.6,
  adjacentBand: 0.3,
  other: 0,
} as const;

function getDistanceMatchWeight(raceDistance: number, targetDistance: number): number {
  if (raceDistance === targetDistance) return DISTANCE_MATCH_WEIGHTS.sameDistance;

  const gap = distanceBandGap(getDistanceBand(raceDistance), getDistanceBand(targetDistance));
  if (gap === 0) return DISTANCE_MATCH_WEIGHTS.sameBand;
  if (gap === 1) return DISTANCE_MATCH_WEIGHTS.adjacentBand;
  return DISTANCE_MATCH_WEIGHTS.other;
}

export function computeDistanceSuitability(
  recentRaces: RacePerformance[],
  target: SuitabilityTargetRaceContext,
): DistanceSuitabilityComponent {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);
  const overallRaceScoreAverage = roundToOneDecimal(mean(pool.map((r) => r.raceScore)));
  const targetBand = getDistanceBand(target.distance);

  const weighted = pool
    .filter((r) => r.surface === target.surface)
    .map((r) => ({ race: r, weight: getDistanceMatchWeight(r.distance, target.distance) }))
    .filter((w) => w.weight > 0);

  const weightSum = weighted.reduce((sum, w) => sum + w.weight, 0);
  const sampleCount = weighted.length;

  const weightedRaceScoreAverage =
    weightSum > 0
      ? roundToOneDecimal(weighted.reduce((sum, w) => sum + w.race.raceScore * w.weight, 0) / weightSum)
      : null;

  const raw =
    weightedRaceScoreAverage === null || overallRaceScoreAverage === 0
      ? 100
      : roundToOneDecimal((weightedRaceScoreAverage / overallRaceScoreAverage) * 100);

  const confidence = resolveConfidence(
    sampleCount,
    weighted.map((w) => w.race),
  );
  const adjusted = roundToOneDecimal(shrinkTowardCenter(raw, confidence));

  const evidence: SuitabilityEvidenceEntry[] = weighted.map((w) => ({
    raceId: w.race.raceId,
    raceName: w.race.raceName,
    raceDate: w.race.raceDate,
    racecourse: w.race.racecourse,
    surface: w.race.surface,
    distance: w.race.distance,
    going: w.race.going,
    raceScore: w.race.raceScore,
    weight: w.weight,
  }));

  const poolDistances = pool.filter((r) => r.surface === target.surface).map((r) => r.distance);
  const distanceChangeMeters = poolDistances.length > 0 ? roundToOneDecimal(target.distance - mean(poolDistances)) : null;

  const reason =
    sampleCount === 0
      ? `直近${pool.length}走に距離${target.distance}m（${targetBand}帯）へ重みを持たせられる実績が無いため、中立100%（confidence=低）とした。`
      : `直近${pool.length}走のうち、距離${target.distance}m（${targetBand}帯）との近さに応じて重み付けした${sampleCount}走（重み付き平均raceScore=${weightedRaceScoreAverage}）を、全体平均raceScore=${overallRaceScoreAverage}と比較。raw=${raw}% → confidence(${confidence})で縮小しadjusted=${adjusted}%。`;

  return {
    raw,
    adjusted,
    sampleCount,
    confidence,
    evidence,
    basis: { weightedRaceScoreAverage, overallRaceScoreAverage },
    reason,
    targetDistance: target.distance,
    targetDistanceBand: targetBand,
    distanceChangeMeters,
  };
}

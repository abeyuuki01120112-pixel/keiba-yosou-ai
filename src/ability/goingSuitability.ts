/**
 * goingSuitability（第22実装・STEP4）。
 * 芝の馬場状態 良→稍重→重→不良 を順序のある条件として扱い、対象馬場状態に近いほど
 * 重みを持たせた過去raceScoreの平均を、直近5走全体のraceScore平均と比較して算出する。
 *
 * weightは検証・変更しやすいよう定数化する（GOING_ADJACENCY_WEIGHTS）。
 */

import { mean } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { resolveConfidence, shrinkTowardCenter } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { SuitabilityComponent, SuitabilityEvidenceEntry, SuitabilityTargetRaceContext } from "./suitabilityTypes";

/** 良→稍重→重→不良 の順（index 0〜3） */
export const GOING_ORDER = ["良", "稍重", "重", "不良"] as const;

/** abs(going差)でindexし、重みを引く。0段階差=1.0 / 1段階差=0.5 / 2段階差=0.2 / 3段階差=0 */
export const GOING_ADJACENCY_WEIGHTS = [1.0, 0.5, 0.2, 0.0] as const;

function goingIndex(going: string): number {
  return GOING_ORDER.indexOf(going as (typeof GOING_ORDER)[number]);
}

function getGoingMatchWeight(raceGoing: string, targetGoing: string): number {
  const raceIdx = goingIndex(raceGoing);
  const targetIdx = goingIndex(targetGoing);
  if (raceIdx === -1 || targetIdx === -1) return 0;
  return GOING_ADJACENCY_WEIGHTS[Math.abs(raceIdx - targetIdx)];
}

export function computeGoingSuitability(
  recentRaces: RacePerformance[],
  target: SuitabilityTargetRaceContext,
): SuitabilityComponent {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);
  const overallRaceScoreAverage = roundToOneDecimal(mean(pool.map((r) => r.raceScore)));

  const weighted = pool
    .filter((r) => r.surface === target.surface)
    .map((r) => ({ race: r, weight: getGoingMatchWeight(r.going, target.going) }))
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

  const reason =
    sampleCount === 0
      ? `直近${pool.length}走に馬場状態「${target.going}」へ重みを持たせられる実績が無いため、中立100%（confidence=低）とした。`
      : `直近${pool.length}走のうち、馬場状態「${target.going}」との近さに応じて重み付けした${sampleCount}走（重み付き平均raceScore=${weightedRaceScoreAverage}）を、全体平均raceScore=${overallRaceScoreAverage}と比較。raw=${raw}% → confidence(${confidence})で縮小しadjusted=${adjusted}%。`;

  return {
    raw,
    adjusted,
    sampleCount,
    confidence,
    evidence,
    basis: { weightedRaceScoreAverage, overallRaceScoreAverage },
    reason,
  };
}

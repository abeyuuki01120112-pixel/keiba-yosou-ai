/**
 * courseSuitability（第22実装・STEP4）。
 * 対象馬自身の直近5走（baseAbilityと同じ母集団）のうち、対象競馬場と一致する実績の
 * raceScore平均を、直近5走全体のraceScore平均と比較して算出する。
 *
 * 連対率・複勝率のような結果ベースの指標は使わない
 * （「阪神2戦2勝だから110%」のような結果依存の極端な補正を避けるため）。
 * raceScoreは既にmemberLevel/timeGap等で相手・タイムを補正済みの値であり、
 * それをsampleCount込みで見ることで小サンプルの影響もconfidence側で吸収する。
 */

import { mean } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { resolveConfidence, shrinkTowardCenter } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { SuitabilityComponent, SuitabilityEvidenceEntry, SuitabilityTargetRaceContext } from "./suitabilityTypes";

export function computeCourseSuitability(
  recentRaces: RacePerformance[],
  target: SuitabilityTargetRaceContext,
): SuitabilityComponent {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);
  const overallRaceScoreAverage = roundToOneDecimal(mean(pool.map((r) => r.raceScore)));

  const matched = pool.filter((r) => r.racecourse === target.racecourse && r.surface === target.surface);
  const sampleCount = matched.length;

  const weightedRaceScoreAverage = sampleCount > 0 ? roundToOneDecimal(mean(matched.map((r) => r.raceScore))) : null;

  const raw =
    weightedRaceScoreAverage === null || overallRaceScoreAverage === 0
      ? 100
      : roundToOneDecimal((weightedRaceScoreAverage / overallRaceScoreAverage) * 100);

  const confidence = resolveConfidence(sampleCount, matched);
  const adjusted = roundToOneDecimal(shrinkTowardCenter(raw, confidence));

  const evidence: SuitabilityEvidenceEntry[] = matched.map((r) => ({
    raceId: r.raceId,
    raceName: r.raceName,
    raceDate: r.raceDate,
    racecourse: r.racecourse,
    surface: r.surface,
    distance: r.distance,
    going: r.going,
    raceScore: r.raceScore,
    weight: 1,
  }));

  const reason =
    sampleCount === 0
      ? `直近${pool.length}走に競馬場「${target.racecourse}」での実績が無いため、中立100%（confidence=低）とした。`
      : `直近${pool.length}走のうち競馬場「${target.racecourse}」での${sampleCount}走（平均raceScore=${weightedRaceScoreAverage}）を、全体平均raceScore=${overallRaceScoreAverage}と比較。raw=${raw}% → confidence(${confidence})で縮小しadjusted=${adjusted}%。`;

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

/**
 * STEP5.1（第24実装）: 通過順位データからの脚質推定。
 *
 * 過去走に通過順位（コーナー通過順）データが存在し、かつisReliable=trueの場合、
 * final3F相対値による低confidence推定（既存のfallbackAuto）より優先して使う。
 * データが無い/信頼できない過去走はそのまま無視し、無理に0等で埋めない。
 *
 * 分類ルール（V1・説明可能なルールベース。閾値は将来実戦検証で見直せるよう定数化）：
 *   逃げ   … 最初の有効な通過順位が絶対順位でNIGE_LEAD_POSITION_THRESHOLD以内
 *            （「単なる上位%」ではなく、実際に先頭/先頭争いをしていたかを優先する）
 *   先行   … 前半〜中盤（最終コーナーを除く）の平均位置比率が35%以内
 *   差し   … 同35〜70%
 *   追込   … 同70%超（≒後方30%程度）
 */

import { mean } from "../simulation/probability";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { baseConfidenceFromSampleCount } from "./suitabilityConfidence";
import type { RacePerformance } from "./types";
import type { PassingPositionUsedRaceRecord, RunningStyle, RunningStyleDistribution, RunningStyleProfile } from "./raceContextTypes";
import { dominantRunningStyle } from "./runningStyle";

/** 最初の有効な通過順位がこの絶対順位以内なら「先頭または先頭争い」＝逃げとみなす */
export const NIGE_LEAD_POSITION_THRESHOLD = 2;

/** 前半〜中盤position比率のしきい値（将来の実戦検証で見直し可能な定数） */
export const RUNNING_STYLE_POSITION_THRESHOLDS = {
  senkoMaxRatio: 0.35,
  sashiMaxRatio: 0.7,
} as const;

export function computePositionRatio(position: number, fieldSize: number): number {
  return position / fieldSize;
}

/** 1走分の有効な通過順位から、その走の脚質を分類する */
export function classifyRunningStyleFromPositions(cornerPositions: number[], fieldSize: number): RunningStyle {
  const first = cornerPositions[0];
  if (first <= NIGE_LEAD_POSITION_THRESHOLD) return "nige";

  // 前半〜中盤の位置取りを中心に見るため、記録が3件以上ある場合は最終コーナー（終盤）を除く
  const representative = cornerPositions.length <= 2 ? cornerPositions : cornerPositions.slice(0, -1);
  const avgRatio = mean(representative.map((p) => computePositionRatio(p, fieldSize)));

  if (avgRatio <= RUNNING_STYLE_POSITION_THRESHOLDS.senkoMaxRatio) return "senko";
  if (avgRatio <= RUNNING_STYLE_POSITION_THRESHOLDS.sashiMaxRatio) return "sashi";
  return "oikomi";
}

/**
 * 対象馬自身の直近5走（baseAbility等と同じ母集団）のうち、有効な通過順位データ
 * （isReliable=trueかつcornerPositionsが1件以上）を持つものだけを使って脚質分布を作る。
 * 有効な過去走が1件も無い場合はnullを返す（呼び出し側でfallbackAutoにフォールバックする）。
 */
export function computePassingPositionRunningStyle(recentRaces: RacePerformance[]): RunningStyleProfile | null {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);
  const usedPastRaces: PassingPositionUsedRaceRecord[] = [];

  for (const race of pool) {
    const pp = race.passingPosition;
    if (!pp || !pp.isReliable || pp.cornerPositions.length === 0) continue;
    usedPastRaces.push({
      raceId: race.raceId,
      raceDate: race.raceDate,
      cornerPositions: pp.cornerPositions,
      fieldSize: pp.fieldSize,
      classifiedStyle: classifyRunningStyleFromPositions(pp.cornerPositions, pp.fieldSize),
    });
  }

  if (usedPastRaces.length === 0) return null;

  const counts: Record<RunningStyle, number> = { nige: 0, senko: 0, sashi: 0, oikomi: 0 };
  for (const r of usedPastRaces) counts[r.classifiedStyle]++;

  const total = usedPastRaces.length;
  const distribution: RunningStyleDistribution = {
    nige: Math.round((counts.nige / total) * 1000) / 10,
    senko: Math.round((counts.senko / total) * 1000) / 10,
    sashi: Math.round((counts.sashi / total) * 1000) / 10,
    oikomi: Math.round((counts.oikomi / total) * 1000) / 10,
  };

  return {
    distribution,
    sampleCount: total,
    // 高:4走以上 / 中:2〜3走 / 低:0〜1走（STEP4のconfidence判定と同じ基準を再利用）
    confidence: baseConfidenceFromSampleCount(total),
    source: "passingPosition",
    reason: `直近${pool.length}走のうち、通過順位データが有効な${total}走から脚質を分類（${usedPastRaces
      .map((r) => `${r.raceId}=${r.classifiedStyle}`)
      .join(", ")}）。`,
    dominantStyle: dominantRunningStyle(distribution),
    usedPastRaces,
  };
}

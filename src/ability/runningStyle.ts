/**
 * runningStyle（脚質、STEP5・第23実装）の自動推定と手動入力の優先解決。
 *
 * 現状のプロジェクトには通過順位（コーナー通過順）データが一切無いため、
 * 正確な脚質分類はできない。ここでは上がり3Fのレース内相対値
 * （final3FBreakdown.relativeDiffSeconds。正の値＝レース中央値より速い上がり＝
 * 差し/追込寄りの傾向、負の値＝先行/逃げ寄りの傾向）を手がかりにした
 * 暫定的な間接推定にとどめ、confidenceは常に"low"とする
 * （通過順位データが将来追加されればconfidenceを引き上げられる設計にしてある）。
 *
 * 優先順位: manualRunningStyle > autoRunningStyle。
 * autoは削除せず、どちらが実際に使われたかをusedSourceで追跡する。
 */

import { mean } from "../simulation/probability";
import { RECENT_RACE_COUNT } from "./baseAbility";
import { FINAL3F_SCORE_SCALE } from "./final3FScore";
import { roundToOneDecimal } from "./raceScore";
import type { RacePerformance } from "./types";
import type { RunningStyle, RunningStyleDistribution, RunningStyleProfile } from "./raceContextTypes";

const NEUTRAL_DISTRIBUTION: RunningStyleDistribution = { nige: 25, senko: 25, sashi: 25, oikomi: 25 };

/** distribution内で最も比率が高いスタイルを返す（predictedPace.tsと共有） */
export function dominantRunningStyle(distribution: RunningStyleDistribution): RunningStyle {
  const entries = Object.entries(distribution) as [RunningStyle, number][];
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

/** 脚質の並び順（nige=-1 〜 oikomi=+1）。closerness→distribution変換の分割点として使う */
const RUNNING_STYLE_ANCHORS: { style: keyof RunningStyleDistribution; pos: number }[] = [
  { style: "nige", pos: -1 },
  { style: "senko", pos: -1 / 3 },
  { style: "sashi", pos: 1 / 3 },
  { style: "oikomi", pos: 1 },
];

/**
 * closerness(-1〜+1、+側ほど差し/追込傾向)を、隣接する2つのanchor間の線形補間で
 * distributionへ変換する（他2項目は0）。
 */
export function closernessToDistribution(closeness: number): RunningStyleDistribution {
  const c = Math.max(-1, Math.min(1, closeness));
  const dist: RunningStyleDistribution = { nige: 0, senko: 0, sashi: 0, oikomi: 0 };

  for (let i = 0; i < RUNNING_STYLE_ANCHORS.length - 1; i++) {
    const a = RUNNING_STYLE_ANCHORS[i];
    const b = RUNNING_STYLE_ANCHORS[i + 1];
    if (c >= a.pos && c <= b.pos) {
      const t = (c - a.pos) / (b.pos - a.pos);
      dist[a.style] = roundToOneDecimal((1 - t) * 100);
      dist[b.style] = roundToOneDecimal(t * 100);
      return dist;
    }
  }
  return dist;
}

/**
 * 対象馬自身の直近5走（baseAbility/suitabilityと同じ母集団）から、
 * 上がり3Fのレース内相対値の平均をtanhで-1〜+1へ変換し、脚質分布を推定する。
 */
export function computeAutoRunningStyle(recentRaces: RacePerformance[]): RunningStyleProfile {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);

  if (pool.length === 0) {
    return {
      distribution: NEUTRAL_DISTRIBUTION,
      sampleCount: 0,
      confidence: "low",
      source: "insufficientData",
      reason: "直近走のデータが無いため、中立分布（25/25/25/25）とした。",
      dominantStyle: dominantRunningStyle(NEUTRAL_DISTRIBUTION),
    };
  }

  const avgRelativeDiff = mean(pool.map((r) => r.final3FBreakdown.relativeDiffSeconds));
  const closeness = Math.tanh(avgRelativeDiff / FINAL3F_SCORE_SCALE);
  const distribution = closernessToDistribution(closeness);

  return {
    distribution,
    sampleCount: pool.length,
    // 通過順位データが無い暫定推定のため、サンプル数に関わらず常にlow
    confidence: "low",
    source: "final3FProxy",
    reason: `直近${pool.length}走の上がり3Fレース内相対値の平均（${roundToOneDecimal(avgRelativeDiff)}秒）から脚質傾向を暫定推定。通過順位データが無いためconfidenceは常にlow。`,
    dominantStyle: dominantRunningStyle(distribution),
  };
}

/**
 * STEP5.1: AI自動側のrunningStyleを解決する。
 * 通過順位ベースの推定（passingPositionAuto）が有効ならそれを優先し、
 * 無ければ既存のfinal3F相対値ベースの推定（fallbackAuto）をそのまま使う。
 * 通過順位データが無い馬については常にfallbackAutoが選ばれるため、
 * STEP5 V1時点の挙動は変わらない。
 */
export function resolveAutoRunningStyle(
  passingPositionAuto: RunningStyleProfile | null,
  fallbackAuto: RunningStyleProfile,
): RunningStyleProfile {
  return passingPositionAuto ?? fallbackAuto;
}

export function resolveRunningStyle(
  auto: RunningStyleProfile,
  manual: RunningStyleProfile | null,
): { actuallyUsed: RunningStyleProfile; usedSource: "manual" | "auto" } {
  if (manual !== null) {
    return { actuallyUsed: manual, usedSource: "manual" };
  }
  return { actuallyUsed: auto, usedSource: "auto" };
}

/** distributionを-1(nige)〜+1(oikomi)の連続スコアへ戻す（paceScenarioFactor/trackBiasFactorで使う） */
export function runningStyleLeanScore(distribution: RunningStyleDistribution): number {
  const weighted =
    distribution.nige * -1 + distribution.senko * (-1 / 3) + distribution.sashi * (1 / 3) + distribution.oikomi * 1;
  return weighted / 100;
}

/**
 * 実質メンバーレベル（memberLevelScoreAtRace）の旧算出方式（V0）。
 *
 * 【重要】本番のraceHistoryPipeline.tsはmemberLevel V1（confidence考慮Top5重み付き平均。
 * docs/memberlevel-v1-decision.md）へ移行済みで、この関数はもう呼ばれていない。
 * 旧方式との比較・監査用にファイルとして残しており、FALLBACK_MEMBER_LEVEL_SCORE
 * （評価不能時のフォールバック値=50）だけは新方式でも同じ意味で再利用している。
 *
 *   memberLevelScore（旧方式） =
 *     top3Average * 0.40
 *     + top5Average * 0.30
 *     + fieldAverage * 0.20
 *     + depthScore * 0.10
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";

/** 旧方式（top3/top5/field/depth）の算出内訳。新方式のMemberLevelBreakdown（types.ts）とは別物 */
export interface LegacyMemberLevelBreakdown {
  top3Average: number;
  top5Average: number;
  fieldAverage: number;
  depthScore: number;
  participantCount: number;
}

export const MEMBER_LEVEL_WEIGHTS = {
  top3: 0.4,
  top5: 0.3,
  field: 0.2,
  depth: 0.1,
} as const;

/**
 * depthScore = 100 - spread * DEPTH_SPREAD_PENALTY （spread = top5Average - fieldAverage）
 * V0の暫定定数。実データを見ながらここだけ調整すればよい構造にしている。
 */
export const DEPTH_SPREAD_PENALTY = 5;

/**
 * 出走馬全頭の abilityBeforeRace が参照できない（=1頭も過去走データが無い）場合の
 * 暫定フォールバック値。勝手に高得点・低得点にしないよう中立の50を採用する。
 * TODO: 実データ投入後に妥当性を再検討する。
 */
export const FALLBACK_MEMBER_LEVEL_SCORE = 50;

export interface MemberLevelResult {
  memberLevelScore: number;
  /** 算出不能（参照可能な能力値が1頭も無い）だった場合はnull */
  breakdown: LegacyMemberLevelBreakdown | null;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 出走馬の abilityBeforeRace 一覧（未参照の馬はnullとして渡してよい。ここで除外する）
 * から実質メンバーレベルを算出する。
 */
export function calculateMemberLevel(
  abilitiesBeforeRace: (number | null)[],
): MemberLevelResult {
  const known = abilitiesBeforeRace.filter((a): a is number => a !== null);

  if (known.length === 0) {
    return { memberLevelScore: FALLBACK_MEMBER_LEVEL_SCORE, breakdown: null };
  }

  const sortedDesc = [...known].sort((a, b) => b - a);
  const top3 = sortedDesc.slice(0, Math.min(3, sortedDesc.length));
  const top5 = sortedDesc.slice(0, Math.min(5, sortedDesc.length));

  const top3Average = average(top3);
  const top5Average = average(top5);
  const fieldAverage = average(sortedDesc);

  const spread = top5Average - fieldAverage;
  const depthScore = clamp(100 - spread * DEPTH_SPREAD_PENALTY, 0, 100);

  const raw =
    top3Average * MEMBER_LEVEL_WEIGHTS.top3 +
    top5Average * MEMBER_LEVEL_WEIGHTS.top5 +
    fieldAverage * MEMBER_LEVEL_WEIGHTS.field +
    depthScore * MEMBER_LEVEL_WEIGHTS.depth;

  return {
    memberLevelScore: roundToOneDecimal(clamp(raw, 0, 100)),
    breakdown: {
      top3Average: roundToOneDecimal(top3Average),
      top5Average: roundToOneDecimal(top5Average),
      fieldAverage: roundToOneDecimal(fieldAverage),
      depthScore: roundToOneDecimal(depthScore),
      participantCount: known.length,
    },
  };
}

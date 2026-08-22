/**
 * CourseContextPrior（CHECKPOINT 8・東京ダート1600m限定の最小実装検証）。
 *
 * 【重要】このファイルはbaseAbility/raceScore/memberLevel V1/trackBiasのいずれも
 * 変更・参照しない、完全に独立した新規モジュールである。ここで算出する値は
 * 現時点でeffectiveAbility・finalRaceAbility・raceContextFactorのどこにも接続されていない
 * （CHECKPOINT 8のSTOP条件「gateCoefficientを実percentへ確定する必要がある」を踏まないための
 * 意図的な設計）。
 *
 * 思想（CHECKPOINT 7〜8で決定）:
 *   1. 枠バイアスをコースごとに一律の固定%へ変換しない。
 *   2. gateBias.level（コースカルテ）は「事前分布の強さ」を表すメタ情報として保持するのみで、
 *      直接percentへは変換しない。
 *   3. gateCoefficient（-1〜+1、unitless）は実測された枠別複勝率の平均との差を正規化した
 *      相対値であり、そのままeffectiveAbilityへ掛けてはならない。
 *   4. horseNumber/fieldSizeが無い場合、推測で埋めず「算出不能」として扱う。
 *   5. overall confidence = min(horse evidence confidence, courseKarte confidence)。
 *      データ不足を0点扱いにはしない。
 *
 * 対象は東京ダート1600m（TOKYO_DIRT_1600）のみ。他コースへの拡張は今回のスコープ外。
 */

import rawCourseKarte from "./data/courseKarte/tokyoDirt1600.json";
import rawGateStats from "./data/courseContextPriors/tokyoDirt1600GateStats.json";
import type { RunningStyle, RunningStyleProfile } from "./raceContextTypes";
import type { SuitabilityConfidence } from "./suitabilityTypes";

interface TokyoDirt1600CourseKarte {
  courseId: string;
  gateBias: { level: "low" | "medium" | "high"; direction: string; reason: string; useAsPercent: boolean };
  styleBias: { favored: string[]; disfavored: string[] };
  confidence: SuitabilityConfidence;
}

interface GateStatsFrameRow {
  frame: number;
  gatePriorCoefficient: number;
}

const courseKarte = rawCourseKarte as unknown as TokyoDirt1600CourseKarte;
const gateStatsFrames = (rawGateStats as unknown as { frames: GateStatsFrameRow[] }).frames;

/** レース単位の枠情報入力。すべて「対象レースより前に確定していた」情報のみを渡すこと */
export interface RaceGateInput {
  /** 実際の馬番（1〜）。不明ならnull */
  horseNumber: number | null;
  /** 頭数。不明ならnull */
  fieldSize: number | null;
  /** 枠番（1〜8）。不明ならnull。gateCoefficientのCSV参照キーとして使う */
  frame: number | null;
}

export type GateBiasLevel = "low" | "medium" | "high";

/** courseKarte由来の枠構造事前分布。frameが不明/範囲外の場合はnull */
export interface CourseContextPrior {
  /** -1〜+1のunitless相対係数。suitability percentへは未変換（CHECKPOINT8の意図的な仕様） */
  gateCoefficient: number;
  gateBiasLevel: GateBiasLevel;
  sourceConfidence: SuitabilityConfidence;
  reasonCodes: string[];
}

export type StyleReasonCode = "STYLE_FAVORED" | "STYLE_DISFAVORED" | "STYLE_NEUTRAL";

const RUNNING_STYLE_LABEL: Record<RunningStyle, string> = {
  nige: "逃げ",
  senko: "先行",
  sashi: "差し",
  oikomi: "追込",
};

/**
 * horseNumber/fieldSizeがともに揃っている場合のみ計算する。
 * どちらか一方でも欠けている場合は推測せずnullを返す（CHECKPOINT8 STEP2）。
 */
export function calculateRelativeGatePosition(horseNumber: number | null, fieldSize: number | null): number | null {
  if (horseNumber === null || fieldSize === null) return null;
  if (fieldSize <= 1) return null;
  if (horseNumber < 1 || horseNumber > fieldSize) return null;
  return (horseNumber - 1) / (fieldSize - 1);
}

/**
 * 東京ダート1600m限定：frameからgateCoefficientをCSV実測データで引く。
 * frameが不明/1〜8の範囲外の場合は null（GATE_INFO_UNAVAILABLE）。
 */
export function computeTokyoDirt1600CourseContextPrior(frame: number | null): CourseContextPrior | null {
  if (frame === null) return null;
  const row = gateStatsFrames.find((f) => f.frame === frame);
  if (!row) return null;

  return {
    gateCoefficient: row.gatePriorCoefficient,
    gateBiasLevel: courseKarte.gateBias.level,
    sourceConfidence: courseKarte.confidence,
    reasonCodes: [
      "STRUCTURE_TURF_START_OUTER_ADVANTAGE",
      "MULTI_SOURCE_AGREEMENT",
      "EMPIRICAL_PLACE_RATE_DELTA",
    ],
  };
}

/** courseKarte.styleBiasの日本語自由記述に、対象スタイルの呼称（例:"先行"）が含まれるか */
function styleListIncludes(list: string[], style: RunningStyle): boolean {
  const label = RUNNING_STYLE_LABEL[style];
  return list.some((entry) => entry.includes(label));
}

/**
 * 東京ダート1600mのstyleBias（favored/disfavored）と対象馬のdominantStyleを照合する。
 * 数値補正幅はまだ確定しない（CHECKPOINT8 STEP6）。reasonCodeのみ返す。
 */
export function resolveTokyoDirt1600StyleReasonCode(dominantStyle: RunningStyle): StyleReasonCode {
  if (styleListIncludes(courseKarte.styleBias.favored, dominantStyle)) return "STYLE_FAVORED";
  if (styleListIncludes(courseKarte.styleBias.disfavored, dominantStyle)) return "STYLE_DISFAVORED";
  return "STYLE_NEUTRAL";
}

const CONFIDENCE_RANK: Record<SuitabilityConfidence, number> = { low: 0, medium: 1, high: 2 };

/** overall confidence = min(horse evidence confidence, courseKarte confidence)（CHECKPOINT7/8で確定） */
export function combineConfidence(
  horseEvidenceConfidence: SuitabilityConfidence,
  courseKarteConfidence: SuitabilityConfidence,
): SuitabilityConfidence {
  return CONFIDENCE_RANK[horseEvidenceConfidence] <= CONFIDENCE_RANK[courseKarteConfidence]
    ? horseEvidenceConfidence
    : courseKarteConfidence;
}

export interface TokyoDirt1600GateContextResult {
  relativeGatePosition: number | null;
  courseContextPrior: CourseContextPrior | null;
  styleReasonCode: StyleReasonCode;
  /** courseContextPriorがnullの場合、常に"low"（構造事前分布が使えないため） */
  overallConfidence: SuitabilityConfidence;
  /** 現時点ではcourseContextPrior.gateCoefficientをそのまま保持するのみ。percent変換は未実施 */
  rawCoursePrior: number | null;
  reasonCodes: string[];
}

/**
 * 東京ダート1600m限定のCourseContextPrior評価をまとめて行う。
 *
 * horseEvidenceConfidence: 対象馬自身の「この枠条件」での実績confidence。
 * 現状RacePerformanceに枠番データが無く、馬ごとの枠別実績を算出する手段が無いため、
 * 呼び出し側で常に"low"を渡す想定（CHECKPOINT8時点の既知の制約。§不足データ参照）。
 */
export function evaluateTokyoDirt1600GateContext(input: {
  gate: RaceGateInput;
  runningStyle: RunningStyleProfile;
  horseEvidenceConfidence: SuitabilityConfidence;
}): TokyoDirt1600GateContextResult {
  const relativeGatePosition = calculateRelativeGatePosition(input.gate.horseNumber, input.gate.fieldSize);
  const courseContextPrior = computeTokyoDirt1600CourseContextPrior(input.gate.frame);
  // dominantStyleが無い（未算出）場合は特定のスタイルを推測せず中立として扱う
  const styleReasonCode: StyleReasonCode =
    input.runningStyle.dominantStyle === undefined
      ? "STYLE_NEUTRAL"
      : resolveTokyoDirt1600StyleReasonCode(input.runningStyle.dominantStyle);

  const reasonCodes: string[] = [];
  if (courseContextPrior === null) {
    reasonCodes.push("GATE_INFO_UNAVAILABLE");
  } else {
    reasonCodes.push(...courseContextPrior.reasonCodes);
  }
  reasonCodes.push(styleReasonCode);

  const overallConfidence =
    courseContextPrior === null
      ? "low"
      : combineConfidence(input.horseEvidenceConfidence, courseContextPrior.sourceConfidence);

  return {
    relativeGatePosition,
    courseContextPrior,
    styleReasonCode,
    overallConfidence,
    rawCoursePrior: courseContextPrior?.gateCoefficient ?? null,
    reasonCodes,
  };
}

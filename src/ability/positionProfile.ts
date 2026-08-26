/**
 * Historical Position Profile V1（CHECKPOINT14B）。
 *
 * 「各馬が過去レースで通常どの位置を取っている馬なのか」を、通過順位（passingPosition）+
 * 出走頭数（fieldSize）の実データだけから数値化する。今回レースのPace/Position
 * Predictionはここでは行わない（CHECKPOINT14C以降のスコープ）。
 *
 * 【絶対に守ること】
 *   - Base Ability V1・raceScore・memberLevel・Suitability V1・Effective Ability・
 *     Short Career V1・Formal Snapshotのいずれも、この処理からは一切参照・変更しない。
 *     Position Profileの値をBase Abilityへ加減することは無い。
 *   - future leakage: この関数はrecentRacesを自前でpredictionCutoffAt基準に絞り込まない。
 *     呼び出し側（getHorseRecentRaces()経由でpredictionCutoffAtより前の走だけに
 *     絞り込み済みのRacePerformance[]）が既に安全な範囲に絞っている前提とする
 *     （runningStyle.ts・passingPositionRunningStyle.ts・baseAbility.tsと同じ既存の規約）。
 *   - passingPositionが無い/信頼できない走は無視する（存在しないコーナーを推測で
 *     補完しない、既存のclassifyRunningStyleFromPositions()の規約をそのまま踏襲）。
 *
 * 既存のpassingPositionRunningStyle.ts（CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み）を
 * そのまま呼び出し、脚質distribution・classifiedStyle・使用した走の一覧を再利用する。
 * 独自に脚質分類ロジックを複製しない。
 */

import { RECENT_RACE_COUNT } from "./baseAbility";
import { roundToOneDecimal } from "./raceScore";
import { mean } from "../simulation/probability";
import { baseConfidenceFromSampleCount } from "./suitabilityConfidence";
import { computePassingPositionRunningStyle } from "./passingPositionRunningStyle";
import type { RacePerformance } from "./types";
import type {
  HistoricalPositionProfile,
  PositionBand,
  PositionConfidence,
  PositionProfileRaceRecord,
  PositionStability,
} from "./positionProfileTypes";
import type { RunningStyle } from "./raceContextTypes";

/** 代表脚質→Position Bandの対応。既存classifyRunningStyleFromPositions()の分類をそのまま流用する（新規閾値を増やさない） */
const STYLE_TO_BAND: Record<RunningStyle, PositionBand> = {
  nige: "front",
  senko: "front",
  sashi: "mid",
  oikomi: "rear",
};

/**
 * 0〜1スケールの値を小数第3位に丸める（normalizedPositionはgate suitability等より
 * 精度が必要なため、roundToOneDecimal（%用）とは別に定義する）。
 */
function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * 通過順位を0（最前方）〜1（最後方）へ正規化する。
 * courseContextPrior.tsのcalculateRelativeGatePosition()と同じ式
 * （(position-1)/(fieldSize-1)）を採用し、gate適性で既に監査済みの正規化パターンを
 * 再利用する。
 *
 * 境界値:
 *   fieldSize<=1（相対化できない） → null
 *   position<1 または position>fieldSize（矛盾したデータ） → null（推測で補正しない）
 *   position=1（先頭） → 0
 *   position=fieldSize（最後尾） → 1
 */
export function normalizePosition(position: number, fieldSize: number): number | null {
  if (fieldSize <= 1) return null;
  if (position < 1 || position > fieldSize) return null;
  return (position - 1) / (fieldSize - 1);
}

/** 標本分散（母集団分散。1件のみの場合は0） */
function populationVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

/**
 * position varianceのstability区分。V1の暫定閾値（未バックテスト、docs/step6-decisions.md
 * と同じ「将来のバックテストでのみ校正する」方針を踏襲。特定レースの結果に合わせて
 * 調整しない）。
 *   stdDev<=0.15   … stable（頭数によらず概ね2〜3番手以内の変動）
 *   stdDev<=0.30   … moderate
 *   それ以外        … variable
 */
export const POSITION_STABILITY_STABLE_MAX_STD_DEV = 0.15;
export const POSITION_STABILITY_MODERATE_MAX_STD_DEV = 0.3;

/**
 * 浮動小数点演算の表現誤差（例: 数学的にはちょうど0.15のstdDevが、平方根計算の丸め誤差で
 * 0.15000000000000002になる等）だけで境界判定が変わらないための微小許容値。
 * CHECKPOINT14B.1のboundaryテストで実際に発生を確認したため導入（意味のある閾値変更ではない）。
 */
const STABILITY_BOUNDARY_EPSILON = 1e-9;

function classifyStability(stdDev: number): PositionStability {
  if (stdDev <= POSITION_STABILITY_STABLE_MAX_STD_DEV + STABILITY_BOUNDARY_EPSILON) return "stable";
  if (stdDev <= POSITION_STABILITY_MODERATE_MAX_STD_DEV + STABILITY_BOUNDARY_EPSILON) return "moderate";
  return "variable";
}

/** high→medium→lowの1段階downgradeのみ（suitabilityConfidence.tsの同名の考え方をPosition Profile専用に再実装） */
function downgradePositionConfidence(confidence: PositionConfidence): PositionConfidence {
  if (confidence === "high") return "medium";
  return "low";
}

function emptyProfile(horseId: string, horseName: string, warnings: string[]): HistoricalPositionProfile {
  return {
    horseId,
    horseName,
    positionEvidenceCount: 0,
    earlyNormalizedPositionMean: null,
    lateNormalizedPositionMean: null,
    frontRate: null,
    midRate: null,
    rearRate: null,
    positionVariance: null,
    positionStability: null,
    runningStyleDistribution: null,
    representativeRunningStyle: null,
    positionConfidence: "low",
    usedRaces: [],
    warnings,
  };
}

/**
 * 1頭分のHistorical Position Profile V1を算出する。
 * recentRacesは呼び出し側がpredictionCutoffAtより前に既に絞り込み済みである前提
 * （baseAbility.ts等と同じ既存の規約、future leakage対策はこの関数の外側で担保する）。
 */
export function computeHistoricalPositionProfile(
  horseId: string,
  horseName: string,
  recentRaces: RacePerformance[],
): HistoricalPositionProfile {
  const pool = recentRaces.slice(0, RECENT_RACE_COUNT);
  const runningStyle = computePassingPositionRunningStyle(pool);

  if (runningStyle === null || !runningStyle.usedPastRaces || runningStyle.usedPastRaces.length === 0) {
    return emptyProfile(horseId, horseName, [
      "通過順位（passingPosition）の実データが無いため、Historical Position Profileを算出できません（final3F等での代替推定は行いません）。",
    ]);
  }

  const usedRaces: PositionProfileRaceRecord[] = [];
  for (const r of runningStyle.usedPastRaces) {
    const first = r.cornerPositions[0];
    const last = r.cornerPositions[r.cornerPositions.length - 1];
    const earlyNorm = normalizePosition(first, r.fieldSize);
    const lateNorm = normalizePosition(last, r.fieldSize);
    if (earlyNorm === null || lateNorm === null) continue; // 正規化不能なデータは安全側で除外（推測しない）

    // classifyRunningStyleFromPositions()と同じ「代表区間」（3件以上なら最終コーナーを除く）
    const representative = r.cornerPositions.length <= 2 ? r.cornerPositions : r.cornerPositions.slice(0, -1);
    const repNormValues = representative
      .map((p) => normalizePosition(p, r.fieldSize))
      .filter((v): v is number => v !== null);
    const representativeNorm = repNormValues.length > 0 ? mean(repNormValues) : (earlyNorm + lateNorm) / 2;

    usedRaces.push({
      raceId: r.raceId,
      raceDate: r.raceDate,
      firstObservedPosition: first,
      lastObservedPosition: last,
      fieldSize: r.fieldSize,
      earlyNormalizedPosition: roundToThreeDecimals(earlyNorm),
      lateNormalizedPosition: roundToThreeDecimals(lateNorm),
      representativeNormalizedPosition: roundToThreeDecimals(representativeNorm),
      band: STYLE_TO_BAND[r.classifiedStyle],
      classifiedStyle: r.classifiedStyle,
    });
  }

  if (usedRaces.length === 0) {
    return emptyProfile(horseId, horseName, [
      "通過順位データはあるものの、頭数との整合性が取れず正規化できなかったため、Historical Position Profileを算出できません。",
    ]);
  }

  const positionEvidenceCount = usedRaces.length;
  const warnings: string[] = [];
  if (positionEvidenceCount < RECENT_RACE_COUNT) {
    warnings.push(
      `直近${pool.length}走のうち、通過順位データが利用可能な${positionEvidenceCount}走のみでHistorical Position Profileを算出しました（キャリア短縮馬の場合はこれが全キャリアに相当することがあります）。`,
    );
  }

  const earlyNormalizedPositionMean = roundToThreeDecimals(mean(usedRaces.map((r) => r.earlyNormalizedPosition)));
  const lateNormalizedPositionMean = roundToThreeDecimals(mean(usedRaces.map((r) => r.lateNormalizedPosition)));

  const frontCount = usedRaces.filter((r) => r.band === "front").length;
  const midCount = usedRaces.filter((r) => r.band === "mid").length;
  const rearCount = usedRaces.filter((r) => r.band === "rear").length;
  const frontRate = roundToOneDecimal((frontCount / positionEvidenceCount) * 100);
  const midRate = roundToOneDecimal((midCount / positionEvidenceCount) * 100);
  const rearRate = roundToOneDecimal((rearCount / positionEvidenceCount) * 100);

  const representativeValues = usedRaces.map((r) => r.representativeNormalizedPosition);
  // stability判定は丸め前の生varianceのstdDevで行う（表示用にpositionVarianceを丸めた後の
  // 値でstdDevを計算すると、境界ちょうど（例: stdDev=0.15）が丸め誤差で意図しない側へ
  // 分類されてしまうため。CHECKPOINT14B.1のboundaryテストで実際に検出・修正）。
  const rawVariance = populationVariance(representativeValues);
  const positionVariance = roundToThreeDecimals(rawVariance);
  const stdDev = Math.sqrt(rawVariance);
  const positionStability = classifyStability(stdDev);

  let positionConfidence: PositionConfidence = baseConfidenceFromSampleCount(positionEvidenceCount);
  if (positionStability === "variable") {
    positionConfidence = downgradePositionConfidence(positionConfidence);
    warnings.push(
      "過去走間で位置取りの変動が大きい（positionStability=variable）ため、positionConfidenceを1段階引き下げました。",
    );
  }

  return {
    horseId,
    horseName,
    positionEvidenceCount,
    earlyNormalizedPositionMean,
    lateNormalizedPositionMean,
    frontRate,
    midRate,
    rearRate,
    positionVariance,
    positionStability,
    runningStyleDistribution: runningStyle.distribution,
    representativeRunningStyle: runningStyle.dominantStyle ?? null,
    positionConfidence,
    usedRaces,
    warnings,
  };
}

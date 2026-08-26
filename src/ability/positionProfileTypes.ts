/**
 * Historical Position Profile V1（CHECKPOINT14B、CHECKPOINT14B.1/14B.2で改訂）の型定義。
 *
 * 「今回レースでどこを取るか」（Current Race Position Prediction、未実装）とは別物。
 * ここで扱うのは「この馬が過去レースで普段どの位置を取ってきたか」という、
 * 馬固有の履歴プロファイルのみ。Base Ability/Suitability V1/Formal Snapshotとは
 * 完全に独立しており、これらの値には一切影響しない。
 *
 * 【CHECKPOINT14B.2 Contract整理】
 *   - Contract A（Historical Position Profile、正式値・CHECKPOINT14Cの主要Feature候補）:
 *     earlyNormalizedPositionMean・lateNormalizedPositionMean・positionStdDev・
 *     positionVariance・positionEvidenceCount・positionDataCoverage・positionConfidence。
 *   - Contract B（Running Style Distribution、Contract Aとは独立）:
 *     runningStyleDistribution・representativeRunningStyle。
 *   - PositionBand（front/mid/rear）・positionStabilityは、上記いずれのContractにも
 *     属さない **diagnostic/表示専用** のフィールドである。Running Style分類には
 *     依存せず、Contract Aと同じnormalizedPositionスケール上の独立した閾値
 *     （`positionProfile.ts`のPOSITION_BAND_*定数）から算出する。Prediction入力としては
 *     使用しないこと。
 */

import type { RunningStyle, RunningStyleDistribution } from "./raceContextTypes";

/** 正規化位置（0=最前方、1=最後方）に基づく3分割の位置帯。diagnostic/表示専用（Contract外） */
export type PositionBand = "front" | "mid" | "rear";

/**
 * Position Profile専用のconfidence。Suitability Confidence・Short Career Evidenceとは
 * 別概念。evidence件数（データ品質）のみに基づき、positionVariance/positionStability
 * には依存しない（Position StabilityとPosition Confidenceを混同しない、CHECKPOINT14B.2）。
 */
export type PositionConfidence = "high" | "medium" | "low";

/**
 * 過去レース間での位置取りの変動の大小を表す区分。**diagnostic専用**（表示・人間向け説明用）。
 * positionConfidenceの算出には使用しない。連続値の正式なsource of truthは
 * `HistoricalPositionProfile.positionStdDev`である。
 */
export type PositionStability = "stable" | "moderate" | "variable";

/** Historical Position Profile算出に実際に使用した1走分の内訳（監査用） */
export interface PositionProfileRaceRecord {
  raceId: string;
  raceDate: string;
  /**
   * passingPosition.cornerPositions上で最初に記録されている通過順位。
   * 「スタート直後の位置」であると断定しない（あくまで記録上の最初の観測値）。
   */
  firstObservedPosition: number;
  /**
   * passingPosition.cornerPositions上で最後に記録されている通過順位
   * （多くの場合は最終コーナー）。finishPosition（着順）とは別物。
   */
  lastObservedPosition: number;
  fieldSize: number;
  /** normalizePosition(firstObservedPosition, fieldSize) */
  earlyNormalizedPosition: number;
  /** normalizePosition(lastObservedPosition, fieldSize) */
  lateNormalizedPosition: number;
  /**
   * classifyRunningStyleFromPositions()と同じ「代表区間」
   * （記録が3件以上ある場合は最終コーナーを除く）の正規化位置平均。
   * Position Band・Position Varianceの算出に使う（Contract A）。
   */
  representativeNormalizedPosition: number;
  /** diagnostic/表示専用（Contract外）。Running Style分類には依存しない独立した閾値で算出 */
  band: PositionBand;
  /**
   * Contract B（Running Style Distribution）側の、この走単体の脚質分類
   * （passingPositionRunningStyle.tsが独自に算出）。監査用に併記するのみで、
   * 上記bandはこの値から算出していない（両者は独立）。
   */
  classifiedStyle: RunningStyle;
}

export interface HistoricalPositionProfile {
  horseId: string;
  horseName: string;

  /** Position Profile算出に実際に使われた過去走数（最大RECENT_RACE_COUNT）。Contract A */
  positionEvidenceCount: number;
  /**
   * プール（直近最大RECENT_RACE_COUNT走）に対するpositionEvidenceCountの充足率（0〜1）。
   * Short Careerによる母数減少（例: 4走しか存在しない）と、母数はあるがpassingPosition
   * データが一部欠けているケースを区別して監査できるようにするdiagnosticフィールド。
   * evidenceが無ければnull。
   */
  positionDataCoverage: number | null;

  /** 各走のearlyNormalizedPositionの単純平均。evidenceが無ければnull。Contract A */
  earlyNormalizedPositionMean: number | null;
  /** 各走のlateNormalizedPositionの単純平均。evidenceが無ければnull。Contract A（補助情報） */
  lateNormalizedPositionMean: number | null;

  /** 代表位置がfrontだった走の割合（0〜100%）。diagnostic専用（Position Band集計） */
  frontRate: number | null;
  /** 同mid */
  midRate: number | null;
  /** 同rear */
  rearRate: number | null;

  /**
   * 代表正規化位置のstdDev（標準偏差、0〜1スケール上の値）。Contract Aの正式な
   * 連続stability値（=positionStabilityのcontinuous source）。
   */
  positionStdDev: number | null;
  /** 同varianceの値（stdDev^2）。参考値として併記 */
  positionVariance: number | null;
  /** diagnostic専用の区分（positionStdDevから算出）。positionConfidenceには使わない */
  positionStability: PositionStability | null;

  /** nige/senko/sashi/oikomiの分布（合計100）。evidenceが無ければnull。Contract B */
  runningStyleDistribution: RunningStyleDistribution | null;
  /** distributionの中で最多のスタイル。固定ラベルではなく、evidenceが変われば再計算される。Contract B */
  representativeRunningStyle: RunningStyle | null;

  /** evidence件数のみに基づく。positionVariance/positionStabilityには依存しない。Contract A */
  positionConfidence: PositionConfidence;

  /** 算出に使った走の監査用内訳 */
  usedRaces: PositionProfileRaceRecord[];
  warnings: string[];
}

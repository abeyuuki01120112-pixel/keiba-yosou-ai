/**
 * Historical Position Profile V1（CHECKPOINT14B）の型定義。
 *
 * 「今回レースでどこを取るか」（Current Race Position Prediction、未実装）とは別物。
 * ここで扱うのは「この馬が過去レースで普段どの位置を取ってきたか」という、
 * 馬固有の履歴プロファイルのみ。Base Ability/Suitability V1/Formal Snapshotとは
 * 完全に独立しており、これらの値には一切影響しない。
 */

import type { RunningStyle, RunningStyleDistribution } from "./raceContextTypes";

/** 正規化位置（0=最前方、1=最後方）に基づく3分割の位置帯 */
export type PositionBand = "front" | "mid" | "rear";

/** Position Profile専用のconfidence。Suitability Confidence・Short Career Evidenceとは別概念 */
export type PositionConfidence = "high" | "medium" | "low";

/** 過去レース間での位置取りの変動の大小を表す区分 */
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
   * Position Band・Position Varianceの算出に使う。
   */
  representativeNormalizedPosition: number;
  band: PositionBand;
  classifiedStyle: RunningStyle;
}

export interface HistoricalPositionProfile {
  horseId: string;
  horseName: string;

  /** Position Profile算出に実際に使われた過去走数（最大RECENT_RACE_COUNT） */
  positionEvidenceCount: number;

  /** 各走のearlyNormalizedPositionの単純平均。evidenceが無ければnull */
  earlyNormalizedPositionMean: number | null;
  /** 各走のlateNormalizedPositionの単純平均。evidenceが無ければnull */
  lateNormalizedPositionMean: number | null;

  /** 代表位置がfrontだった走の割合（0〜100%） */
  frontRate: number | null;
  /** 同midの割合 */
  midRate: number | null;
  /** 同rearの割合 */
  rearRate: number | null;

  /** 代表正規化位置の分散（0〜1スケール上の値、標本分散） */
  positionVariance: number | null;
  positionStability: PositionStability | null;

  /** nige/senko/sashi/oikomiの分布（合計100）。evidenceが無ければnull */
  runningStyleDistribution: RunningStyleDistribution | null;
  /** distributionの中で最多のスタイル。固定ラベルではなく、evidenceが変われば再計算される */
  representativeRunningStyle: RunningStyle | null;

  positionConfidence: PositionConfidence;

  /** 算出に使った走の監査用内訳 */
  usedRaces: PositionProfileRaceRecord[];
  warnings: string[];
}

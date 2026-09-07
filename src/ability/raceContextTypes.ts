/**
 * STEP5（第23実装）: raceContext（展開・トラックバイアス）の型定義。
 *
 * baseAbility（絶対能力）・suitability（馬固有の条件適性）とは完全に別レイヤー。
 * ここで定義する値は既存のbaseAbility.ts/raceScore.ts/suitability.ts等の計算には一切影響しない。
 *
 *   effectiveAbility  = baseAbility × suitability.overallSuitabilityPercent / 100
 *     （Suitability V1、CHECKPOINT11.14で本番接続。overallSuitabilityPercent自体はclampせず、
 *      Suitability V1内部の異常値防止safety boundary(60-120)のみ適用される。90-110のclampは戻さない）
 *   raceContextFactor = clamp(paceScenarioFactor × trackBiasFactor / 100, 90, 110)
 *   finalRaceAbility  = effectiveAbility × raceContextFactor / 100
 *
 * AI自動評価（auto〜）と人間入力（manual〜）は別フィールドとして常に両方保持し、
 * 人間入力がAIの元データを上書き・削除することはない。実際に採用された方は
 * usedSource（"manual" / "auto" / "neutral"）で追跡できる。
 */

import type { SuitabilityConfidence } from "./suitabilityTypes";
import type { SuitabilityV1Result } from "./suitabilityV1Types";

export type RunningStyle = "nige" | "senko" | "sashi" | "oikomi";

/** 逃げ/先行/差し/追込の傾向を確率的に保持する。4項目の合計は100 */
export interface RunningStyleDistribution {
  nige: number;
  senko: number;
  sashi: number;
  oikomi: number;
}

export type RunningStyleSource = "passingPosition" | "final3FProxy" | "insufficientData" | "manualInput";

/** STEP5.1: 通過順位から脚質分類した1走分の内訳（人間が判断根拠を追える形） */
export interface PassingPositionUsedRaceRecord {
  raceId: string;
  raceDate: string;
  cornerPositions: number[];
  fieldSize: number;
  classifiedStyle: RunningStyle;
}

export interface RunningStyleProfile {
  distribution: RunningStyleDistribution;
  /** 推定に使った過去走数（manualInputの場合は0） */
  sampleCount: number;
  confidence: SuitabilityConfidence;
  source: RunningStyleSource;
  reason: string;
  /** 分布の中で最多のスタイル（STEP5.1で追加。省略時は未計算） */
  dominantStyle?: RunningStyle;
  /** source="passingPosition"の場合、判定根拠になった各走の内訳（STEP5.1で追加） */
  usedPastRaces?: PassingPositionUsedRaceRecord[];
}

export type PredictedPaceLevel = "slow" | "average" | "high";

export interface PredictedPace {
  level: PredictedPaceLevel;
  nigeCandidateCount: number;
  senkoCandidateCount: number;
  fieldSize: number;
  reason: string;
}

export interface PaceScenarioFactor {
  /** 95〜105の範囲になるよう算出式自体で構成されている */
  raw: number;
  /** confidenceに応じてDesign-2（STEP4と同じ方式）で100%側へ縮小した後の値 */
  adjusted: number;
  confidence: SuitabilityConfidence;
  usedRunningStyleSource: "manual" | "auto";
  predictedPace: PredictedPaceLevel;
  reason: string;
}

export type FrontBackBias = "front" | "neutral" | "closer";
export type InsideOutsideBias = "inside" | "neutral" | "outside";
export type TrackBiasDayRelation = "sameDay" | "previousDay";

/**
 * トラックバイアスの観測値。manual（人間/ウマプロ入力）・auto（将来実装、V1は常にnull）
 * のどちらも同じ形で持つ。insideOutsideBiasは型として保持するが、
 * 枠番データが現状のRacePerformanceに無いため、V1のtrackBiasFactor算出には使わない
 * （将来、枠番データを取り込んだ時点で拡張する）。
 */
export interface TrackBiasObservation {
  frontBackBias: FrontBackBias;
  insideOutsideBias: InsideOutsideBias;
  confidence: SuitabilityConfidence;
  /** 出典（自由記述。例: "ウマプロ 2026-06-14 1R-10R回顧"） */
  source: string;
  observedAt: string;
  /** この観測の元になったレースのid（自己参照禁止のfuture leakage判定に使う） */
  observedRaceId: string;
  observedRaceDate: string;
  /** 同日の場合のレース番号（1R,2R…）。同日leakage判定に使う。不明ならnull */
  observedRaceNumber: number | null;
  dayRelation: TrackBiasDayRelation;
}

export interface TrackBiasFactor {
  /** 95〜105の範囲になるよう算出式自体で構成されている */
  raw: number;
  adjusted: number;
  confidence: SuitabilityConfidence;
  usedSource: "manual" | "auto" | "neutral";
  reason: string;
}

/** 対象馬自身の過去レースについての人間回顧。対象レース自身の回顧は事前予想に使用禁止 */
export interface ManualRaceReviewNote {
  /** レビュー対象になった過去レースのid */
  raceId: string;
  raceDate: string;
  horseId: string;
  note: string;
  source: string;
  observedAt: string;
}

export interface RaceContextFactor {
  paceScenarioFactor: PaceScenarioFactor;
  trackBiasFactor: TrackBiasFactor;
  /**
   * clamp前のpaceScenarioFactor.adjusted × trackBiasFactor.adjusted / 100。
   * evaluatedの真偽に関わらず、実際の計算結果を常に保持する監査用の値（未評価時もvalueとは別に隠さず残す）
   */
  raw: number;
  /**
   * evaluated=trueならclamp(raw, 90, 110)。evaluated=falseの場合は中立100に上書きされ、
   * finalRaceAbilityへ実質的な補正を及ぼさない（CHECKPOINT11.17: 評価できていない要素は
   * 能力を動かさない、という原則をRaceContextへも適用したガード）
   */
  value: number;
  /**
   * predictedPace.fieldSize>0（対戦馬の脚質データが1頭以上ある）、または
   * trackBiasFactor.usedSourceが"neutral"でない（人間入力/自動いずれかの実観測が使われた）
   * のいずれかを満たせばtrue。両方とも実データが無い場合のみfalse（CHECKPOINT11.17で追加）。
   */
  evaluated: boolean;
}

export interface FinalRaceAbilityBreakdown {
  raceContext: RaceContextFactor;
  effectiveAbility: number;
  /** effectiveAbility × raceContext.value / 100 */
  finalRaceAbility: number;
}

/**
 * STEP1〜5の全中間値を保持する最終結果。
 *   baseAbility → × suitability → effectiveAbility → × raceContextFactor → finalRaceAbility
 *
 * runningStyleの解決優先順位（STEP5.1で3段階化）:
 *   manualRunningStyle > autoRunningStyle(=passingPositionRunningStyleがあればそれ、
 *   無ければfallbackAutoRunningStyle) > （fallbackAutoRunningStyle自体が実質のneutral）
 */
export interface FinalRaceAbilityResult {
  baseAbility: number;
  /** Suitability V1（distance/course/going/gateの4component）の出力そのもの。CHECKPOINT11.14で本番接続 */
  suitability: SuitabilityV1Result;
  effectiveAbility: number;
  /** 呼び出し側から渡された人間入力の脚質（無ければnull） */
  manualRunningStyle: RunningStyleProfile | null;
  /** 通過順位データからの脚質推定（STEP5.1）。有効な過去走が無ければnull */
  passingPositionRunningStyle: RunningStyleProfile | null;
  /** 既存のfinal3F相対値による低confidence推定（STEP5 V1から不変。常に算出される） */
  fallbackAutoRunningStyle: RunningStyleProfile;
  /** passingPositionRunningStyle ?? fallbackAutoRunningStyle（AI自動側で実際に採用された方） */
  autoRunningStyle: RunningStyleProfile;
  autoRunningStyleSource: RunningStyleSource;
  /** manualRunningStyle ?? autoRunningStyle（最終的に採用された脚質） */
  runningStyle: RunningStyleProfile;
  runningStyleUsedSource: "manual" | "auto";
  /** 通過順位が有効だった過去走数（0なら通過順位による判定不能） */
  validPassingPositionSampleCount: number;
  predictedPace: PredictedPace;
  raceContext: RaceContextFactor;
  finalRaceAbility: number;
}

/** future leakage判定に使う、予想対象レースの識別情報 */
export interface RaceContextTargetInfo {
  raceId: string;
  raceDate: string;
  /** 同日leakage判定に使う。不明ならnull（同日データは一律不許可として扱われる） */
  raceNumber: number | null;
}

/**
 * Race Pace Prediction V1（CHECKPOINT14C）の型定義。
 *
 * 「そのレースの前半ペースがどの程度速くなりそうか」（Race Pace Prediction）と、
 * 「そのペースが各馬に有利/不利か」（Pace Scenario Factor、未実装・CHECKPOINT14D以降）は
 * 完全に別レイヤー。本モジュールはPace Predictionのみを扱い、Final Race Ability等の
 * 能力値には一切接続しない。
 *
 * 正式枠順が未確定な段階（Pre-Frame）向けのV1であり、`paceStage="pre_frame"`のみを
 * 生成する。将来枠順確定後の`paceStage="post_frame"`はCHECKPOINT14D以降のスコープ
 * （本ファイルの型はpost_frameを既に許容する形にしておくが、算出ロジックは未実装）。
 */

import type { PositionConfidence } from "./positionProfileTypes";
import type { RunningStyle, RunningStyleDistribution } from "./raceContextTypes";

export type PaceStage = "pre_frame" | "post_frame";

/**
 * continuousPacePressureから導出される表示用の3分類。Position Bandと同じ位置付けで、
 * 「境界に近い値でクラスが反転しても、continuousPacePressure自体（source of truth）は
 * 変化しない」設計とする。CHECKPOINT14D以降のPrediction入力としては、このクラスではなく
 * continuousPacePressure/frontPressureを優先して参照すること。
 */
export type ExpectedPaceClass = "slow" | "average" | "high";

/**
 * Race Pace専用のconfidence。Suitability Confidence・Position Confidenceとは別概念
 * （CHECKPOINT14C 16節）。Pace Classそのものの強弱（速い/遅い）とは独立した「どれだけ
 * このPredictionを信用できるか」を表す。
 */
export type PaceConfidence = "high" | "medium" | "low";

/**
 * Race Pace Predictionが1頭分の入力として要求するHistorical Position Profileの
 * 最小集合（CHECKPOINT14B.2で確定したContract Aの一部+Contract B）。
 * frame/horseNumberはPre-Frame V1では受け取らない（Post-Frame時に別途拡張）。
 */
export interface RacePaceRunnerInput {
  horseId: string;
  horseName: string;
  earlyNormalizedPositionMean: number | null;
  positionStdDev: number | null;
  runningStyleDistribution: RunningStyleDistribution | null;
  representativeRunningStyle: RunningStyle | null;
  positionEvidenceCount: number;
  positionConfidence: PositionConfidence;
}

/** 1頭分の、レース全体pacePressureへの寄与内訳（監査・説明用） */
export interface HorsePaceContribution {
  horseId: string;
  horseName: string;
  earlyNormalizedPositionMean: number | null;
  positionStdDev: number | null;
  runningStyleDistribution: RunningStyleDistribution | null;
  positionEvidenceCount: number;
  positionConfidence: PositionConfidence;
  /** runningStyleDistribution.nige / 100（evidenceが無ければ0） */
  nigeProbability: number;
  /**
   * (nige + senko) / 100（evidenceが無ければ0）。continuousPacePressureへの、
   * この馬単体の加算寄与分（=contributionToPacePressure）。
   */
  contributionToPacePressure: number;
}

export interface RacePacePrediction {
  /** Pre-Frame V1では常に"pre_frame"。Post-Frameは将来別途生成し、これを上書きしない */
  paceStage: PaceStage;
  /** 正式Predictionではないことの明示（CHECKPOINT14C 19節） */
  status: "DIAGNOSTIC_PRE_FRAME";
  runnerCount: number;

  /**
   * source of truthとなる連続値。各馬のcontributionToPacePressure（nige+senko確率）の
   * 単純合計（フィールド内の「前方を取りに行く」ことが期待される頭数の期待値）。
   */
  continuousPacePressure: number;
  /** nigeProbabilityのみの合計（「先頭を主張する」ことが期待される頭数の期待値） */
  frontPressure: number;
  /**
   * continuousPacePressure/frontPressureから導出される表示用分類。
   * legacy predictedPace.ts（CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み）の
   * ルール（逃げ候補2頭以上→high、逃げ・先行候補ともに0→slow）を、頭数の実数から
   * 連続期待値へそのまま転用した（新規閾値ではなく、既存監査済み定数2・0の連続値化）。
   */
  expectedPaceClass: ExpectedPaceClass;
  paceConfidence: PaceConfidence;

  /** representativeRunningStyle==="nige"の頭数（diagnostic専用の単純カウント、legacy互換） */
  frontRunnerCandidateCount: number;
  /** contributionToPacePressure>0の馬のhorseNameを、寄与度降順で並べたもの（diagnostic/説明用） */
  likelyFrontGroup: string[];

  horses: HorsePaceContribution[];
  warnings: string[];
}

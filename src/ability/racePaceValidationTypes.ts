/**
 * Historical Pace Validation Data Contract（CHECKPOINT14C.1）の型定義。
 *
 * Race Pace Prediction V1（CHECKPOINT14C、`racePacePrediction.ts`）を過去レースの
 * 実際のペースと比較検証するための型のみを定義する。CHECKPOINT14C.1の時点では
 * 実Lap実データが1件も存在しないため（3節参照）、baseline依存の連続値・分類
 * （continuousActualPace・actualPaceClass）は常にnullを許容する形にしている。
 *
 * 【絶対に守ること】
 *   - 着順・「差し馬が勝った」等の結果論からActual Paceを推測しない。Lap/sectional dataの
 *     みを根拠とする（CHECKPOINT14C.1 2節）。
 *   - CHECKPOINT14CのRace Pace Prediction Engine（racePacePrediction.ts・
 *     racePacePredictionTypes.ts）は一切変更しない。
 *   - future leakage: PredictionRecord側（predicted*フィールド）は対象レースより前の
 *     馬履歴のみから算出したものを渡す前提。Actual側（lapSequence等）は答え合わせ専用
 *     であり、Predictionの入力に混入させてはならない。
 */

import type { ExpectedPaceClass, PaceConfidence } from "./racePacePredictionTypes";

/**
 * 1レース分のラップ列（race-level enrichment）。馬ごとに重複保存しない
 * （既存の`RaceFieldAggregate`＝`data/raceFieldAggregates.json`と同じ、
 * raceIdをキーにした race-level 別ファイル方式を踏襲する。10節参照）。
 */
export interface RaceLapSequenceRecord {
  raceId: string;
  raceDate: string;
  raceName: string;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  fieldSize: number;
  /**
   * lapSequenceの1区間あたりの距離（メートル）。JRAの公表ラップは通常200m区間だが、
   * 推測せず必ず明示する（4節）。
   */
  segmentMeters: number;
  /** スタートから順に並んだ区間タイム（秒）。区間数 × segmentMeters ≈ distance を期待するが、厳密一致は求めない（コーナーの実測誤差等を許容） */
  lapSequence: number[];
  source: string;
}

export type ActualPaceClass = "slow" | "average" | "high";

export interface ActualPaceMetrics {
  raceId: string;
  /** lapSequenceから機械的に導出。600mがsegmentMeatersで割り切れない、またはlapSequenceが不足していればnull（推測しない） */
  first600mSeconds: number | null;
  /** 同upto1000m。加えてdistance<1000mの場合もnull（5節、距離別対応） */
  first1000mSeconds: number | null;
  /**
   * course/surface/distance（+going）baselineに対する相対値。V1.1でbaseline実データが
   * 揃うまでは常にnull（CHECKPOINT14C.1では未実装、6〜7節で設計のみ提示）。
   */
  continuousActualPace: number | null;
  /** continuousActualPaceから導出される表示用分類。continuousActualPaceがnullならnull */
  actualPaceClass: ActualPaceClass | null;
  warnings: string[];
}

/**
 * 1レース分の、Prediction（CHECKPOINT14C時点のRace Pace Prediction出力）と
 * Actual（本ファイルのActualPaceMetrics）を並べた検証レコード。永続化可能な
 * プレーンデータのみで構成する（関数を含まない）。
 */
export interface PaceValidationRecord {
  raceId: string;
  raceDate: string;
  /** 予想時点でracePacePrediction.tsが返したcontinuousPacePressureをそのまま記録 */
  predictedContinuousPacePressure: number;
  predictedExpectedPaceClass: ExpectedPaceClass;
  predictedPaceConfidence: PaceConfidence;
  actual: ActualPaceMetrics;
}

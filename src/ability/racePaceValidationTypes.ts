/**
 * Historical Pace Validation Data Contract（CHECKPOINT14C.1、CHECKPOINT14C.2Aで
 * provenance/courseLayout/raceClassフィールドを追加）の型定義。
 *
 * Race Pace Prediction V1（CHECKPOINT14C、`racePacePrediction.ts`）を過去レースの
 * 実際のペースと比較検証するための型のみを定義する。CHECKPOINT14C.2Aの時点でも
 * 実Lap実データが1件も存在しないため、baseline依存の連続値・分類
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
  /** レース番号（1R,2R…）。同日同course複数レースの識別補助。不明ならnull */
  raceNumber: number | null;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  /**
   * 出走頭数。既存RacePerformance.fieldSizeと同じく、実データで無記載のことが多いため
   * nullを許容する（推測しない。CHECKPOINT14C.2Aで新潟大賞典の実例がfieldSize:null
   * だったことを踏まえ、number必須からnullable化した）。
   */
  fieldSize: number | null;
  /**
   * 内回り/外回り等のコース形状バリアント。CHECKPOINT14C.2Aで監査した結果、
   * RacePerformance/types.tsにも既存courseKarte/にも構造化されたlayout区別フィールドは
   * 存在しないことを確認した。判定不能な場合は推測せずnull（=unknown）のままにする
   * （既存コードベースの「不明ならnull」という規約と同じ）。
   */
  courseLayout: string | null;
  /**
   * レースクラス（G1/G3/OP/条件戦等）。Actual Pace baselineのprimary keyには含めない
   * （CHECKPOINT14C.1 3節）が、metadataとして保持し将来のTrack Bias等の検証に使えるようにする。
   */
  raceClass: string | null;
  /**
   * lapSequenceの1区間あたりの距離（メートル）。JRAの公表ラップは通常200m区間だが、
   * 推測せず必ず明示する（CHECKPOINT14C.1 4節）。
   */
  segmentMeters: number;
  /** スタートから順に並んだ区間タイム（秒）。区間数 × segmentMeters ≈ distance を期待するが、厳密一致は求めない（コーナーの実測誤差等を許容） */
  lapSequence: number[];
  source: string;
  /** 提供元データセット側の元raceId（既存RacePerformance.sourceRaceIdと同じ位置付け）。不明ならnull */
  sourceRaceId?: string | null;
  /** このレコードが取り込まれた日時（ISO8601）。既存RacePerformance.importedAtと同じ位置付け */
  importedAt?: string | null;
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

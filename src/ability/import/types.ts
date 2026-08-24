/**
 * 実データ取り込み層（CSV等の外部形式 → normalize → 検証済み内部データ）の型定義。
 *
 * 固定思想：
 *   raw data → normalize → validated internal data → ability calculation
 * 能力計算コード（raceHistoryPipeline等）に外部データを直接渡さない。
 *
 * 馬名・レース名ではなく raceId / horseId をキーにする（同名馬・同名レースでも壊れない）。
 */

import type { Surface } from "../types";

/**
 * CSV等から正規化された、1走ぶんの検証済み中間データ。
 * 競走中止・タイム不明などを表現するため、finishPosition以下の5項目はnullを許容する。
 * nullは「0秒として扱う」のではなく「その走は能力計算の対象から除外する」ことを意味する。
 */
export interface RacePerformanceInput {
  raceId: string;
  horseId: string;
  horseName: string;

  raceDate: string;
  racecourse: string;
  raceName: string;
  /** レース番号（第何レースか）。無ければnull */
  raceNumber: number | null;

  surface: Surface;
  /** メートル */
  distance: number;
  going: string;

  /** 着順。競走中止・除外などはnull */
  finishPosition: number | null;
  /** 斤量(kg)。不明ならnull */
  carriedWeightKg: number | null;
  /** 走破タイム(秒)。計測不能ならnull */
  actualRaceTimeSeconds: number | null;
  /** 上がり3F(秒)。計測不能ならnull */
  final3FSeconds: number | null;
  /** 勝ち馬とのタイム差(秒)。勝ち馬は2着とのマイナス値。不明ならnull */
  timeGapSeconds: number | null;

  /** 枠番。無ければnull */
  gate: number | null;
  /** 馬番。無ければnull */
  horseNumber: number | null;
  /** 出走頭数。無ければnull */
  fieldSize: number | null;

  /**
   * データ出所・監査用メタデータ（CHECKPOINT13.2で追加）。ability計算には使わない。
   * canonical raceId/horseIdとは別物（同一視しない）。CSVに列が無ければnull。
   * optional：既存テスト・既存呼び出し元のオブジェクトリテラルとの後方互換性のため
   * （省略時はnormalize.ts側でnullとして正規化される）。
   */
  source?: string | null;
  sourceRaceId?: string | null;
  sourceHorseId?: string | null;
}

/** normalize時に発生したエラー（行単位）。アプリを落とさず内容を確認できるようにする */
export interface ImportError {
  /** CSVの何行目のデータか（1始まり、ヘッダー行を除く） */
  rowIndex: number;
  raceId?: string;
  horseId?: string;
  message: string;
}

/** 取り込み結果の集計。UIの「読み込み件数・正常データ件数・除外データ件数・エラー件数」に対応 */
export interface ImportSummary {
  /** CSVから読み込んだ総行数 */
  totalRows: number;
  /** normalizeに成功した件数（能力計算から除外された件数を含む） */
  normalizedCount: number;
  /** normalizeには成功したが、欠損項目があり能力計算対象から除外された件数 */
  excludedFromScoringCount: number;
  /** normalizeに失敗した件数（型不正・必須項目欠落・異常値など） */
  errorCount: number;
  errors: ImportError[];
}

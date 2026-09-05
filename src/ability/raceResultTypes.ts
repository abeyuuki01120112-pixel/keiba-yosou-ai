/**
 * レース後データ・PRPS（Post-Race Performance Score）の保存用構造
 * （CHECKPOINT13 STEP10/STEP11）。
 *
 * 【今回のスコープ】型・構造の準備のみ。採点ロジック・自動集計ロジックは実装しない。
 * PredictionSnapshot（predictionSnapshot.ts）とは完全に別レコードとして保存する。
 * レース後にこれらのレコードが作られても、既存のPredictionSnapshot（Stage A/B）を
 * 書き換えたり参照し直したりしない（Snapshotのimmutability・CHECKPOINT13 STEP6）。
 *
 * PRPS（STEP11）は「馬そのものの能力」ではなく「その1レースで実際に示した
 * パフォーマンス内容」を0〜100スケールで評価する将来機能。運用上は主に40〜90付近を
 * 使用し、90点以上は歴史的・極めて強い内容を想定する。
 * 以下は今回まだ点数化しない（採点ロジック未実装、フィールドの準備のみ）：
 *   Start Loss / Pace Exposure / Ground Loss / Momentum Loss / 接触 / 前詰まり /
 *   進路ロス / 映像回顧
 */

export interface PassingPositionRecord {
  /** 有効な通過順位のみ、記録された順（例: [4, 4, 3, 2]） */
  cornerPositions: number[];
  fieldSize: number;
}

export interface RaceLapRecord {
  /** ラップ秒（区間の粒度はデータ入手時に決める。例: 200m毎） */
  lapSeconds: number[];
  source: string;
}

/** 1頭・1レース分のレース後データ */
export interface HorseRaceResultRecord {
  raceId: string;
  horseId: string;
  /** 出走取消・中止等はnull */
  finishPosition: number | null;
  raceTime: number | null;
  timeGapSec: number | null;
  final3F: number | null;
  final3FRank: number | null;
  passingPositions: PassingPositionRecord | null;
  recordedAt: string;
}

/** レース単位（全頭共通）のレース後データ */
export interface RaceLevelResultRecord {
  raceId: string;
  raceLaps: RaceLapRecord | null;
  recordedAt: string;
}

/**
 * Post-Race Performance Score（PRPS）。
 * 【今回のスコープ】score・componentBreakdownは常にnull（採点ロジック未実装）。
 * フィールド・データ構造の準備のみ行う。
 */
export interface PostRacePerformanceScoreRecord {
  raceId: string;
  horseId: string;
  /** 0〜100（主に40〜90を想定、90以上は歴史的な内容）。今回は常にnull（未実装） */
  score: number | null;
  /**
   * 将来のcomponent別内訳の置き場所（Start Loss/Pace Exposure/Ground Loss/
   * Momentum Loss/接触/前詰まり/進路ロス等）。今回は常にnull（未実装、点数化しない）。
   */
  componentBreakdown: Record<string, number> | null;
  notes: string | null;
  /** scoreがnullの間は常にnull */
  computedAt: string | null;
}

export function buildEmptyPostRacePerformanceScoreRecord(raceId: string, horseId: string): PostRacePerformanceScoreRecord {
  return {
    raceId,
    horseId,
    score: null,
    componentBreakdown: null,
    notes: null,
    computedAt: null,
  };
}

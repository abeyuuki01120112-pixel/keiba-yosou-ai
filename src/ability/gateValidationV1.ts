/**
 * 東京ダート1600m gate suitability 実データ検証（CHECKPOINT 10.1）。
 *
 * 【重要】このファイルはbaseAbility/raceScore/memberLevel V1/timeGapScore/raceTimeScore/
 * final3FScore/weightScoreのいずれも変更・参照しない。data/gateValidation/配下の検証専用
 * データセットのみを扱い、data/horses/*.json（Ability Model V1の入力）へは一切書き込まない。
 * ここで算出するpercent系の値は「比較用のシミュレーション」であり、正式採用・
 * effectiveAbilityへの本接続は行わない（CHECKPOINT10.1のSTOP条件6）。
 */

import rawRows from "./data/gateValidation/tokyoDirt1600RealRaces10.json";
import rawAdd20Rows from "./data/gateValidation/tokyoDirt1600Add20.json";
import { computeTokyoDirt1600CourseContextPrior, calculateRelativeGatePosition } from "./courseContextPrior";
import { CONFIDENCE_SHRINK_WEIGHTS } from "./suitabilityConfidence";
import type { SuitabilityConfidence } from "./suitabilityTypes";

export interface GateValidationRow {
  raceId: string;
  date: string;
  venue: string;
  surface: string;
  distance: number;
  going: string;
  raceName: string;
  horseName: string;
  frame: number;
  horseNumber: number;
  fieldSize: number;
  finishPosition: number;
  source: string;
  sourceUrl: string;
}

/** CHECKPOINT10.1の10レース分（後方互換のため個別にも公開） */
export const GATE_VALIDATION_ROWS = rawRows as unknown as GateValidationRow[];

/** CHECKPOINT10.2で追加した20レース分（fieldSize定義修正版） */
export const GATE_VALIDATION_ADD20_ROWS = rawAdd20Rows as unknown as GateValidationRow[];

/** 10レース＋追加20レース＝約30レースの統合データセット（CHECKPOINT10.2） */
export const ALL_GATE_VALIDATION_ROWS: GateValidationRow[] = [
  ...GATE_VALIDATION_ROWS,
  ...GATE_VALIDATION_ADD20_ROWS,
];

export interface FrameStats {
  frame: number;
  starts: number;
  wins: number;
  /** 着順2以内の頭数（連対数） */
  quinellaCount: number;
  /** 着順3以内の頭数（複勝数） */
  placeCount: number;
  winRate: number;
  quinellaRate: number;
  placeRate: number;
  averageFinish: number;
  medianFinish: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 枠(1〜8)ごとの出走数・着度数・勝率/連対率/複勝率・平均/中央値着順を集計する（観測事実のみ、%固定変換はしない） */
export function computeFrameStats(rows: GateValidationRow[]): FrameStats[] {
  const stats: FrameStats[] = [];
  for (let frame = 1; frame <= 8; frame++) {
    const frameRows = rows.filter((r) => r.frame === frame);
    const finishes = frameRows.map((r) => r.finishPosition);
    const starts = frameRows.length;
    const wins = frameRows.filter((r) => r.finishPosition === 1).length;
    const quinellaCount = frameRows.filter((r) => r.finishPosition <= 2).length;
    const placeCount = frameRows.filter((r) => r.finishPosition <= 3).length;
    stats.push({
      frame,
      starts,
      wins,
      quinellaCount,
      placeCount,
      winRate: starts > 0 ? (wins / starts) * 100 : 0,
      quinellaRate: starts > 0 ? (quinellaCount / starts) * 100 : 0,
      placeRate: starts > 0 ? (placeCount / starts) * 100 : 0,
      averageFinish: starts > 0 ? finishes.reduce((a, b) => a + b, 0) / starts : 0,
      medianFinish: starts > 0 ? median(finishes) : 0,
    });
  }
  return stats;
}

/** frame（またはrelativeGatePosition）とfinishPositionのPearson相関係数。方向性の確認用（-1〜+1） */
export function computeCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const cov = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0) / n;
  const sdX = Math.sqrt(xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) / n);
  const sdY = Math.sqrt(ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / n);
  if (sdX === 0 || sdY === 0) return 0;
  return cov / (sdX * sdY);
}

export function computeFrameFinishCorrelation(rows: GateValidationRow[]): number {
  return computeCorrelation(
    rows.map((r) => r.frame),
    rows.map((r) => r.finishPosition),
  );
}

export function computeRelativeGatePositionFinishCorrelation(rows: GateValidationRow[]): number {
  const pairs = rows
    .map((r) => ({ rel: calculateRelativeGatePosition(r.horseNumber, r.fieldSize), finish: r.finishPosition }))
    .filter((p): p is { rel: number; finish: number } => p.rel !== null);
  return computeCorrelation(
    pairs.map((p) => p.rel),
    pairs.map((p) => p.finish),
  );
}

/** 同一horseNameが2回以上出現するレコードだけを機械的に抽出する（結果を見た選定はしない） */
export function findRepeatedHorses(rows: GateValidationRow[]): Map<string, GateValidationRow[]> {
  const byName = new Map<string, GateValidationRow[]>();
  for (const row of rows) {
    const list = byName.get(row.horseName) ?? [];
    list.push(row);
    byName.set(row.horseName, list);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) byName.delete(name);
  }
  return byName;
}

/** 案A: 固定最大幅方式。percent = 100 + gateCoefficient × MAX_WIDTH */
export function simulatePercentFixedWidth(gateCoefficient: number, maxWidthPercent: number): number {
  return 100 + gateCoefficient * maxWidthPercent;
}

/** 案B: confidence連動最大幅方式。percent = 100 + gateCoefficient × MAX_WIDTH × confidenceWeight */
export function simulatePercentConfidenceWeighted(
  gateCoefficient: number,
  maxWidthPercent: number,
  confidence: SuitabilityConfidence,
): number {
  return 100 + gateCoefficient * maxWidthPercent * CONFIDENCE_SHRINK_WEIGHTS[confidence];
}

/**
 * 仮想馬でのeffectiveAbilityシミュレーション（比較専用。本番のcomputeEffectiveAbilityとは無関係）。
 * baseAbility × percent / 100 の掛け算構造だけを再現し、正式採用はしない。
 */
export function simulateHypotheticalEffectiveAbility(baseAbility: number, percent: number): number {
  return Math.round(((baseAbility * percent) / 100) * 10) / 10;
}

export const MAX_WIDTH_CANDIDATES = [1, 2, 3, 5, 8] as const;

/** frame(1〜8)からgateCoefficientを引く。範囲外/データ無しならnull（推測しない） */
export function lookupGateCoefficient(frame: number): number | null {
  return computeTokyoDirt1600CourseContextPrior(frame)?.gateCoefficient ?? null;
}

/**
 * suitability（適性＝能力発揮率、STEP4/第22実装）の型定義。
 *
 * baseAbility（馬そのものの絶対能力）とは完全に別レイヤーとして扱う。
 * ここで定義する値はbaseAbility.ts/raceScore.ts等の既存計算には一切影響しない。
 *
 *   effectiveAbility = baseAbility × overallSuitability / 100
 *
 * 100% = 通常通りの自分の実力を発揮できる条件。100%超＝得意条件、100%未満＝苦手条件。
 * 他馬との比較ではなく、その馬自身の過去raceScore（直近5走、baseAbilityと同じ母集団）の
 * 条件別ばらつきから算出する。
 */

import type { DistanceBand } from "./distanceBands";
import type { Surface } from "./types";

export type SuitabilityConfidence = "high" | "medium" | "low";

/** raw算出に使われた過去走1件分の内訳（人間が追える根拠） */
export interface SuitabilityEvidenceEntry {
  raceId: string;
  raceName: string;
  raceDate: string;
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
  raceScore: number;
  /** この過去走がraw算出でどれだけの重みを持ったか（0なら不使用） */
  weight: number;
}

/** distance/going/course に共通する適性コンポーネントの基本形 */
export interface SuitabilityComponent {
  /** 生の発揮率(%)。該当する過去走が1件も無い場合は中立の100 */
  raw: number;
  /** confidenceに応じてrawを100%側へ縮小した後の発揮率(%)。overall統合にはこちらを使う */
  adjusted: number;
  /** raw算出に使われた過去走数（重み0のものは含まない） */
  sampleCount: number;
  confidence: SuitabilityConfidence;
  /** raw算出に使った過去走の内訳 */
  evidence: SuitabilityEvidenceEntry[];
  basis: {
    /** 重み付き平均raceScore。該当走が無ければnull */
    weightedRaceScoreAverage: number | null;
    /** 直近5走（baseAbilityと同じ母集団）全体のraceScore平均 */
    overallRaceScoreAverage: number;
  };
  /** 人間向けの簡潔な算出理由 */
  reason: string;
}

/** distanceSuitability は将来のSTEP5（展開）向けメタデータを追加で持つ */
export interface DistanceSuitabilityComponent extends SuitabilityComponent {
  targetDistance: number;
  targetDistanceBand: DistanceBand;
  /**
   * 対象距離 − 直近5走の平均距離。正なら延長、負なら短縮。
   * STEP4のV1では発揮率の数値には使わず、記録のみ（展開予測を持ち込まないため）。
   * 該当走が無い場合はnull。
   */
  distanceChangeMeters: number | null;
}

export interface SuitabilityBreakdown {
  distanceSuitability: DistanceSuitabilityComponent;
  goingSuitability: SuitabilityComponent;
  courseSuitability: SuitabilityComponent;
  /** 3項目のadjusted値の単純平均を90〜110へclampした最終値 */
  overallSuitability: number;
}

export interface EffectiveAbilityResult {
  baseAbility: number;
  suitability: SuitabilityBreakdown;
  /** baseAbility × overallSuitability / 100 */
  effectiveAbility: number;
}

/** suitabilityを算出する対象レースの条件 */
export interface SuitabilityTargetRaceContext {
  racecourse: string;
  surface: Surface;
  distance: number;
  going: string;
}

/**
 * Suitability Core V1（CHECKPOINT 9・方針修正ラウンドで正式追加）。
 *
 * 【重要】このファイルはbaseAbility/raceScore/memberLevel V1のいずれも変更・参照しない、
 * 完全に独立した「器（スキーマ）」の定義である。ここで定義する`score`は現時点で
 * 常にnull（最終計算式はまだ確定しない）。effectiveAbility・suitability.tsの既存の
 * overallSuitability計算にはまだ一切接続されていない。
 *
 * 思想（CHECKPOINT 9で確定）:
 *   Base Ability   = 馬そのものの絶対能力（Ability Model V1、凍結済み）
 *   Suitability    = 今回の条件でBase Abilityを何%発揮できるか
 *   RaceContext    = 今回のレース固有の状況（当日展開・トラックバイアス。raceContextTypes.ts）
 *   CourseContextPrior = コース構造・統計から得た事前情報（馬に依存しない一般傾向。courseContextPrior.ts）
 *
 * Suitability V1はdistance/course/surface/turn/going/gate/runningStyleの7要素を
 * 独立したcomponentとして保持する。各componentは「本人実績（horseEvidence）」と
 * 「コース構造事前分布（coursePrior）」を明示的に分離して保持し、両者を混ぜて
 * 1つの数値に還元する式はV1ではまだ確定しない。
 */

import type { SuitabilityConfidence } from "./suitabilityTypes";

export type SuitabilityComponentKey =
  | "distance"
  | "course"
  | "surface"
  | "turn"
  | "going"
  | "gate"
  | "runningStyle";

/** 既存のhigh/medium/lowに加え、そもそも評価を試みていない場合の"unknown"を持つ */
export type SuitabilityConfidenceV1 = SuitabilityConfidence | "unknown";

/** このcomponentの結論が主にどちらの情報源から得られたか */
export type SuitabilitySourceV1 = "horseEvidence" | "coursePrior" | "both" | "none";

/** 本人実績（自己参照型。courseSuitability.ts等の既存パターンに相当）からの1情報源 */
export interface HorseEvidenceDetail {
  /** 判断根拠になった過去走数。0なら本人実績なし */
  sampleCount: number;
  confidence: SuitabilityConfidenceV1;
  reason: string;
}

/** コース構造・統計事前分布（CourseContextPrior等）からの1情報源 */
export interface CoursePriorDetail {
  confidence: SuitabilityConfidenceV1;
  reason: string;
  /** 参照元の自由記述（監査用）。例: "courseContextPrior.ts (TOKYO_DIRT_1600)" */
  referenceSource: string;
}

/**
 * Suitability V1の1要素分。
 * scoreはV1では常にnull（「reasonがあるからといって+3%等を固定しない」という
 * CHECKPOINT9の明示的な制約）。confidence/reason/sourceは監査・将来の式設計のために
 * 今のうちから保持する。
 */
export interface SuitabilityComponentV1 {
  key: SuitabilityComponentKey;
  /** データ・根拠のどちらも無く評価そのものを試みていない場合はfalse（notEvaluated相当） */
  evaluated: boolean;
  /** V1では常にnull。最終的な%変換式は未確定（docs/ability-model-v1.mdの凍結ルールと同じ精神） */
  score: number | null;
  confidence: SuitabilityConfidenceV1;
  reason: string;
  source: SuitabilitySourceV1;
  /** 本人実績。無ければnull（推測で埋めない） */
  horseEvidence: HorseEvidenceDetail | null;
  /** コース構造事前分布。無ければnull */
  coursePrior: CoursePriorDetail | null;
}

/** distance/course/surface/turn/going/gate/runningStyleの7要素をまとめて保持する */
export interface SuitabilityCoreV1 {
  distance: SuitabilityComponentV1;
  course: SuitabilityComponentV1;
  surface: SuitabilityComponentV1;
  turn: SuitabilityComponentV1;
  going: SuitabilityComponentV1;
  gate: SuitabilityComponentV1;
  runningStyle: SuitabilityComponentV1;
}

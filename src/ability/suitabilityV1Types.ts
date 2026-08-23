/**
 * Suitability V1（CHECKPOINT11.3・最小実装）の出力型。
 *
 * 【重要】これは`suitabilityCoreV1Types.ts`の`SuitabilityComponentV1`（`score`が
 * CHECKPOINT9の凍結ルールにより常にnull）を書き換えるものではない。あちらは
 * 「器（スキーマ）」として無変更のまま残し、こちらは実際にpercentを算出する
 * 新しい薄い統合層（`suitabilityV1.ts`）専用の出力型として追加する
 * （CHECKPOINT11.1 STEP2で決定した案C: 既存A/Bを内部部品として利用する統合層）。
 *
 * `SuitabilityComponentKey`・`SuitabilityConfidenceV1`・`HorseEvidenceDetail`・
 * `CoursePriorDetail`は`suitabilityCoreV1Types.ts`のものをそのまま再利用する
 * （型の重複定義はしない）。
 */
import type {
  CoursePriorDetail,
  HorseEvidenceDetail,
  SuitabilityComponentKey,
  SuitabilityConfidenceV1,
} from "./suitabilityCoreV1Types";

/** V1で実装するcomponentは distance / course / going / gate の4つのみ */
export type SuitabilityV1ComponentKey = Extract<SuitabilityComponentKey, "distance" | "course" | "going" | "gate">;

export interface SuitabilityComponentResultV1 {
  key: SuitabilityV1ComponentKey;
  /** データ・根拠のどちらも無く評価そのものを試みていない場合はfalse（推測で埋めない） */
  evaluated: boolean;
  /** 100=中立、100未満=能力を出し切りにくい、100超=能力を出しやすい（confidence縮小前） */
  rawPercent: number;
  /** confidenceに応じてrawPercentを100側へ縮小した値。overallSuitability統合に使う値 */
  adjustedPercent: number;
  confidence: SuitabilityConfidenceV1;
  reason: string;
  /** 本人実績（優先度1）。無ければnull（推測で埋めない） */
  horseEvidence: HorseEvidenceDetail | null;
  /** コース構造事前分布（優先度2・弱い補助情報）。無ければnull */
  coursePrior: CoursePriorDetail | null;
}

export interface SuitabilityV1Result {
  distance: SuitabilityComponentResultV1;
  course: SuitabilityComponentResultV1;
  going: SuitabilityComponentResultV1;
  gate: SuitabilityComponentResultV1;
  /** Suitability V1の唯一の正式出力（CHECKPOINT11.1 STEP8）。100=中立 */
  overallSuitabilityPercent: number;
  /** evaluated=trueだったcomponent数（0〜4）。0の場合overallSuitabilityPercentは中立100固定 */
  evaluatedComponentCount: number;
}

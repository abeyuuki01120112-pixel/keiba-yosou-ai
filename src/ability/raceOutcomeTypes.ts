/**
 * STEP6（第27実装）: score/probability統合結果の型定義。
 *
 * baseAbility → suitability → effectiveAbility → raceContext → finalRaceAbility（STEP1〜5.1）に
 * 一切手を加えず、finalRaceAbilityResult（STEP5.1の最終出力）だけを入力として使う。
 * オッズ・人気はSTEP7まで扱わない。
 */

import type { SuitabilityConfidence } from "./suitabilityTypes";
import type { SuitabilityConfidenceV1 } from "./suitabilityCoreV1Types";
import type { FinalRaceAbilityResult } from "./raceContextTypes";
import type { RacePerformance } from "./types";

export interface HorseOutcomeInput {
  horseId: string;
  horseName: string;
  /** 出走取消・除外。trueなら確率・スコアいずれの計算対象からも外し、結果にも含めない */
  scratched: boolean;
  /** STEP5.1（computeFinalRaceAbility）の出力そのもの。baseAbility/suitability/finalRaceAbilityを含む */
  finalRaceAbilityResult: FinalRaceAbilityResult;
  /** stabilityFactor算出用。baseAbility/suitabilityと同じ母集団（直近最大5走、新しい順） */
  recentRaces: RacePerformance[];
}

export interface HorseOutcomeResult {
  horseId: string;
  horseName: string;
  /**
   * 過去走データが0件の場合、baseAbility.tsの都合上0が入る。この0は「能力0点」ではなく
   * 「評価不能／データ不足」の意味（docs/step6-decisions.md 1-4）。呼び出し側でこの値のみから
   * 両者を区別することはまだできない（TODO・既知の課題）。UI表示時は「能力0の馬」と
   * 誤認させない表現（「—」「データ不足」等）にすること。
   */
  baseAbility: number;
  suitability: number;
  finalRaceAbility: number;

  winScore: number;
  top2Score: number;
  top3Score: number;

  /** %。同一レース内の全馬合計=100 */
  winProbability: number;
  /** %。同一レース内の全馬合計=200 */
  top2Probability: number;
  /** %。同一レース内の全馬合計=300 */
  top3Probability: number;

  /**
   * finalRaceAbility算出過程の信頼度（weakest-link）。score/probability自体は変化させない表示用の値。
   * CHECKPOINT11.14でSuitability V1接続に伴い4段階（unknown/low/medium/high）へ拡張。
   */
  evaluationConfidence: SuitabilityConfidenceV1;

  stabilityFactor: number;
  stabilityConfidence: SuitabilityConfidence;
}

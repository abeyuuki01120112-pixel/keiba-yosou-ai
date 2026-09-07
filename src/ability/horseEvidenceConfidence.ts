/**
 * HorseEvidence Confidence V1（CHECKPOINT 10.6・正式実装）。
 *
 * CHECKPOINT10.5で比較したA〜D案のうち、B案が正式採用された
 * （docs/horse-evidence-confidence-v1-design.md）。
 *
 * 【重要】この confidence は「本人実績（HorseEvidence）のサンプル量をどれだけ信用できるか」
 * を示すだけであり、その実績が「得意」か「苦手」か、好走傾向か凡走傾向かという方向性
 * （評価の質・符号）を一切表さない。
 *
 *   例1: 5走すべて好走 → confidence=high（データ量として信用できる）・方向性はプラス
 *   例2: 5走すべて凡走 → confidence=high（データ量として信用できる）・方向性はマイナス
 *   例3: 5走あるが内容がバラバラ → confidence=highのまま（一貫性の評価は別軸・将来課題）
 *
 * つまり confidence=high と evidenceDirection/score=マイナス は矛盾なく両立する設計である
 * （STEP3）。evidenceDirection/scoreの正式計算は今回実装しない。
 *
 * sampleCount=0は"unknown"（データ不足で評価不能）であり、neutral・50点・50%・0点等の
 * 「中立/平均的」を意味する値には一切変換しない（STEP4）。「データが無い」ことと
 * 「適性が平均的である」ことは全く別の概念であり、混同しない。
 *
 * このファイルはHorseEvidence collector（horseGateEvidence.ts）の出力にのみ依存する。
 * gateBiasLevel/gateCoefficient等のCourseContextPrior、Suitability Score、
 * baseAbility/raceScore/memberLevel V1のいずれにも接続・参照しない。
 */

import type { HorseEvidence } from "./horseGateEvidence";

/**
 * HorseEvidence専用のconfidence型。既存の`SuitabilityConfidence`（high/medium/low、
 * suitabilityTypes.ts）や`SuitabilityConfidenceV1`（suitabilityCoreV1Types.ts）とは
 * 意図的に別の型として定義する（名前衝突回避、および用途の取り違え防止のため）。
 */
export type HorseEvidenceConfidence = "unknown" | "low" | "medium" | "high";

/**
 * CHECKPOINT10.5で承認されたB案の境界値をそのまま正式採用する。
 *
 *   0走      → unknown
 *   1〜2走   → low
 *   3〜4走   → medium
 *   5走以上  → high
 *
 * sampleCountが負の値になることは本来無い（HorseEvidence.sampleCountは常に0以上）が、
 * 万一の場合も推測せず安全側（unknown）に倒す。
 */
export function resolveHorseEvidenceConfidence(sampleCount: number): HorseEvidenceConfidence {
  if (sampleCount <= 0) return "unknown";
  if (sampleCount <= 2) return "low";
  if (sampleCount <= 4) return "medium";
  return "high";
}

/**
 * HorseEvidence collector（CHECKPOINT10.4・horseGateEvidence.ts）の出力から、
 * そのままconfidenceを求める接続用ヘルパー（STEP7）。
 * Suitability Score・effectiveAbilityへはまだ一切接続しない。
 */
export function getHorseEvidenceConfidence(evidence: HorseEvidence): HorseEvidenceConfidence {
  return resolveHorseEvidenceConfidence(evidence.sampleCount);
}

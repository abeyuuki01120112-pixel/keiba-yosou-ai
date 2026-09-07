/**
 * predictedPace（想定ペース、STEP5・第23実装）。
 *
 * 出走メンバー構成（各馬のrunningStyle分布）から、逃げ/先行候補の頭数を数え、
 * ルールベースでスロー/平均/ハイを判定する。ラップタイムやコース形状データが
 * 現状無いため、機械学習等へは広げず単純な説明可能ロジックに留める。
 *
 *   逃げ候補が2頭以上 → ハイペース想定
 *   逃げ候補・先行候補がともに0頭 → スローペース想定
 *   それ以外 → 平均ペース想定
 */

import { dominantRunningStyle } from "./runningStyle";
import type { PredictedPace, RunningStyleDistribution } from "./raceContextTypes";

export function classifyPredictedPace(fieldRunningStyleDistributions: RunningStyleDistribution[]): PredictedPace {
  const dominants = fieldRunningStyleDistributions.map(dominantRunningStyle);
  const nigeCandidateCount = dominants.filter((s) => s === "nige").length;
  const senkoCandidateCount = dominants.filter((s) => s === "senko").length;
  const fieldSize = fieldRunningStyleDistributions.length;

  let level: PredictedPace["level"];
  let reason: string;
  if (nigeCandidateCount >= 2) {
    level = "high";
    reason = `逃げ候補が${nigeCandidateCount}頭（2頭以上）のためハイペース想定。`;
  } else if (nigeCandidateCount === 0 && senkoCandidateCount === 0) {
    level = "slow";
    reason = "逃げ候補・先行候補がともに0頭のためスローペース想定。";
  } else {
    level = "average";
    reason = `逃げ候補${nigeCandidateCount}頭・先行候補${senkoCandidateCount}頭のため平均ペース想定。`;
  }

  return { level, nigeCandidateCount, senkoCandidateCount, fieldSize, reason };
}

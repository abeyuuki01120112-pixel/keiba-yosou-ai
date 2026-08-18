/**
 * outcomeScore（STEP6・第27実装）: winScore / top2Score / top3Score（各0〜100点）の算出。
 *
 * probability（Plackett-Luce、outcomeProbability.ts）とは完全に別の変換であり、
 * 一方から他方を直接導出しない（例: winScore×αでtop2Scoreを作る、winProbabilityを
 * そのままwinScoreに使う、といったことはしない）。
 *
 * 「ハイブリッド方式」: finalRaceAbility（絶対水準）を主とし、当該着順の「ボーダー」となる
 * ライバルとの差（margin）とstabilityFactorは、あくまで小さな補正としてのみ加える。
 * 今回のメンバー構成だけで評価が大きく振れないよう、margin/stabilityの重みは小さく保つ。
 *
 *   winScore  : finalRaceAbility中心。ボーダーは「最有力ライバル」。安定性の影響は0。
 *   top2Score : finalRaceAbility中心。ボーダーは「連対を脅かす3番手ライバル」。安定性を少し反映。
 *   top3Score : finalRaceAbility中心。ボーダーは「3着以内を脅かす4番手ライバル」。
 *               安定性をtop2Scoreより強く反映する（STABILITY_WEIGHT_3 > STABILITY_WEIGHT_2 > 0）。
 *               これにより「上限は低いが安定して走る馬」がwinScoreよりtop3Scoreで
 *               高く評価されるケースが生まれる（意図した設計）。
 *
 * 変換はfinal3FScore.ts等と同じ CENTER + AMPLITUDE × tanh(value / SCALE) パターンに従う。
 * value（rawDelta）は「finalRaceAbilityのCENTERからの差 + margin補正 + stability補正」。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { STABILITY_FACTOR_NEUTRAL } from "./stabilityFactor";

/** finalRaceAbilityがこの値のとき、margin/stability補正が無ければスコアはCENTERになる */
export const OUTCOME_SCORE_CENTER = 70;
/** 飽和時にCENTERへ加算/減算される最大幅 */
export const OUTCOME_SCORE_AMPLITUDE = 28;
/** カーブの伸び方を決めるスケール（finalRaceAbilityの点差換算） */
export const OUTCOME_SCORE_SCALE = 15;

/** ライバルとの差（margin）に掛ける重み。finalRaceAbility本体より必ず小さく保つ */
export const WIN_MARGIN_WEIGHT = 0.3;
export const TOP2_MARGIN_WEIGHT = 0.3;
export const TOP3_MARGIN_WEIGHT = 0.3;

/** stabilityFactor（CENTERからの差分）に掛ける重み。winScoreは0=影響なし */
export const STABILITY_WEIGHT_WIN = 0;
export const STABILITY_WEIGHT_2 = 0.2;
export const STABILITY_WEIGHT_3 = 0.35;

if (!(STABILITY_WEIGHT_3 > STABILITY_WEIGHT_2 && STABILITY_WEIGHT_2 > 0)) {
  throw new Error("STABILITY_WEIGHT_3 > STABILITY_WEIGHT_2 > 0 の制約が破られています");
}

export interface OutcomeScoreEntry {
  id: string;
  finalRaceAbility: number;
  stabilityFactor: number;
}

export interface OutcomeScoreResult {
  id: string;
  winScore: number;
  top2Score: number;
  top3Score: number;
}

/**
 * idを除いた他馬のfinalRaceAbilityを降順に並べたリストを返す（マージン計算用）。
 */
function rivalAbilitiesDescending(entries: OutcomeScoreEntry[], selfId: string): number[] {
  return entries
    .filter((e) => e.id !== selfId)
    .map((e) => e.finalRaceAbility)
    .sort((a, b) => b - a);
}

/** rivals[index]が存在しなければ、存在する中で最も低いライバルにフォールバックする（無ければ0補正） */
function rivalAt(rivals: number[], index: number, selfAbility: number): number {
  if (rivals.length === 0) return selfAbility; // ライバル不在 → margin=0
  const clampedIndex = Math.min(index, rivals.length - 1);
  return rivals[clampedIndex];
}

function transformToScore(rawDelta: number): number {
  const raw = OUTCOME_SCORE_CENTER + OUTCOME_SCORE_AMPLITUDE * Math.tanh(rawDelta / OUTCOME_SCORE_SCALE);
  return roundToOneDecimal(clamp(raw, 0, 100));
}

/**
 * 出走馬全体（除外馬は事前に取り除いた最終メンバー）からwinScore/top2Score/top3Scoreを算出する。
 * 各スコアはそれぞれ独立に生の入力から計算し、最後に単調性（win<=top2<=top3）を
 * 崩す組み合わせが出た場合のみ、最終的な整合性ガードとしてmaxで補正する
 * （top2=win+固定値のような構成方法は使わない）。
 */
export function computeOutcomeScores(entries: OutcomeScoreEntry[]): OutcomeScoreResult[] {
  return entries.map((entry) => {
    const rivals = rivalAbilitiesDescending(entries, entry.id);
    const stabilityDelta = entry.stabilityFactor - STABILITY_FACTOR_NEUTRAL;

    const winMargin = entry.finalRaceAbility - rivalAt(rivals, 0, entry.finalRaceAbility);
    const top2Margin = entry.finalRaceAbility - rivalAt(rivals, 1, entry.finalRaceAbility);
    const top3Margin = entry.finalRaceAbility - rivalAt(rivals, 2, entry.finalRaceAbility);

    const abilityDelta = entry.finalRaceAbility - OUTCOME_SCORE_CENTER;

    const winRawDelta = abilityDelta + WIN_MARGIN_WEIGHT * winMargin + STABILITY_WEIGHT_WIN * stabilityDelta;
    const top2RawDelta = abilityDelta + TOP2_MARGIN_WEIGHT * top2Margin + STABILITY_WEIGHT_2 * stabilityDelta;
    const top3RawDelta = abilityDelta + TOP3_MARGIN_WEIGHT * top3Margin + STABILITY_WEIGHT_3 * stabilityDelta;

    const winScore = transformToScore(winRawDelta);
    let top2Score = transformToScore(top2RawDelta);
    let top3Score = transformToScore(top3RawDelta);

    // 最終的な整合性ガード（構成方法としてではなく、崩れた場合のみの補正）
    top2Score = Math.max(top2Score, winScore);
    top3Score = Math.max(top3Score, top2Score);

    return { id: entry.id, winScore, top2Score, top3Score };
  });
}

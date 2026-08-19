/**
 * outcomeProbability（STEP6・第27実装）: Plackett-Luceモデルによる着順確率の算出。
 *
 * finalRaceAbility（STEP5.1までの最終出力）だけを入力とし、オッズ・人気は一切使わない
 * （オッズ・人気はSTEP7で扱う）。
 *
 *   strength_i = exp(finalRaceAbility_i / PLACKETT_LUCE_TEMPERATURE)
 *
 * 「1着→2着→3着」を逐次除外モデル（sequential removal）で評価する閉形式の総和で、
 * 順列を全列挙せずに厳密なP(1着)/P(2着以内)/P(3着以内)を求める。
 * 全馬について合計すると必ずΣwin=100%・Σtop2=200%・Σtop3=300%になる
 * （分母に常に自分自身の強さが残るため、ゼロ除算は構造上発生しない）。
 *
 * winProbability×2 / ×3 のような簡易近似は使わない。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";

/**
 * Plackett-Luceモデルの温度パラメータ。値が大きいほど、能力差が確率差に反映されにくくなる
 * （= 保守的な確率になる）。特定のレース結果に合わせて調整したことはなく、将来バックテストで
 * 校正する前提の初期値としてT=10を採用する。
 *
 * 【V1固定方針・2026-08-19正式決定（docs/step6-decisions.md 1-1）】
 * T=10はoutcomeScore.tsの各種重み・スケールとは異なり、V1の「正式確定値」として採用する
 * （仮パラメータではない）。ただし将来バックテストの対象になり得る点は他の係数と同じ。
 * 特定レースの結果に合わせた調整は引き続き禁止する。
 */
export const PLACKETT_LUCE_TEMPERATURE = 10;

export interface OutcomeStrengthEntry {
  id: string;
  finalRaceAbility: number;
}

export interface OutcomeProbabilityResult {
  id: string;
  /** 0〜100(%)。全馬合計=100 */
  winProbability: number;
  /** 0〜100(%)。全馬合計=200 */
  top2Probability: number;
  /** 0〜100(%)。全馬合計=300 */
  top3Probability: number;
}

/** strength_i = exp(finalRaceAbility_i / T) */
export function computeStrength(finalRaceAbility: number, temperature: number = PLACKETT_LUCE_TEMPERATURE): number {
  return Math.exp(finalRaceAbility / temperature);
}

/**
 * Plackett-Luceモデルでwin/top2/top3の確率(%)を算出する。丸め処理はここでは行わない
 * （呼び出し側の表示直前でroundToOneDecimalする）。
 */
export function computeOutcomeProbabilitiesRaw(
  entries: OutcomeStrengthEntry[],
  temperature: number = PLACKETT_LUCE_TEMPERATURE,
): OutcomeProbabilityResult[] {
  const n = entries.length;
  if (n === 0) return [];

  const strengths = entries.map((e) => computeStrength(e.finalRaceAbility, temperature));
  const total = strengths.reduce((sum, s) => sum + s, 0);

  const win = strengths.map((s) => s / total);

  // P(2着_i) = Σ_{j≠i} P(jが1着) × P(iが2着 | jが1着)
  const secondTerm = new Array(n).fill(0) as number[];
  for (let j = 0; j < n; j++) {
    const remainingAfterJ = total - strengths[j];
    if (remainingAfterJ <= 0) continue;
    const pJFirst = strengths[j] / total;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      secondTerm[i] += pJFirst * (strengths[i] / remainingAfterJ);
    }
  }
  const top2 = win.map((w, i) => w + secondTerm[i]);

  // P(3着_i) = Σ_{j≠i} Σ_{k≠i,j} P(jが1着) × P(kが2着|jが1着) × P(iが3着|j,kが1・2着)
  const thirdTerm = new Array(n).fill(0) as number[];
  for (let j = 0; j < n; j++) {
    const remainingAfterJ = total - strengths[j];
    if (remainingAfterJ <= 0) continue;
    const pJFirst = strengths[j] / total;
    for (let k = 0; k < n; k++) {
      if (k === j) continue;
      const remainingAfterJK = remainingAfterJ - strengths[k];
      if (remainingAfterJK <= 0) continue;
      const pJThenK = pJFirst * (strengths[k] / remainingAfterJ);
      for (let i = 0; i < n; i++) {
        if (i === j || i === k) continue;
        thirdTerm[i] += pJThenK * (strengths[i] / remainingAfterJK);
      }
    }
  }
  const top3 = top2.map((t, i) => t + thirdTerm[i]);

  return entries.map((e, i) => ({
    id: e.id,
    winProbability: clamp(win[i] * 100, 0, 100),
    top2Probability: clamp(top2[i] * 100, 0, 100),
    top3Probability: clamp(top3[i] * 100, 0, 100),
  }));
}

/** 表示用に小数第1位へ丸めたバージョン */
export function computeOutcomeProbabilities(
  entries: OutcomeStrengthEntry[],
  temperature: number = PLACKETT_LUCE_TEMPERATURE,
): OutcomeProbabilityResult[] {
  return computeOutcomeProbabilitiesRaw(entries, temperature).map((r) => ({
    id: r.id,
    winProbability: roundToOneDecimal(r.winProbability),
    top2Probability: roundToOneDecimal(r.top2Probability),
    top3Probability: roundToOneDecimal(r.top3Probability),
  }));
}

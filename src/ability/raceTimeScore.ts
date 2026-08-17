/**
 * 補正後タイム価値（trackAdjustedDiffSeconds）を0〜100のraceTimeScoreへ変換する。
 *
 * V0の目安（暫定値。実データを見ながらこのファイルの定数だけ調整すればよい）：
 *   +1.5秒以上 → 92点前後
 *   +1.0秒     → 85点
 *   +0.5秒     → 78点
 *    0.0秒     → 70点
 *   -0.5秒     → 62点
 *   -1.0秒     → 55点
 *   -1.5秒     → 45点前後
 *
 * tanh（双曲線正接）による連続関数にすることで、if地獄を避けつつ、
 * 差が開くほど点数の伸びが鈍化する（=90点台が簡単には出ない）飽和カーブにしている。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";

/** trackAdjustedDiff=0秒のときのスコア */
export const RACE_TIME_SCORE_CENTER = 70;
/** 飽和時にCENTERへ加算/減算される最大幅（理論上限はCENTER+AMPLITUDE、実際には漸近するのみで到達しない） */
export const RACE_TIME_SCORE_AMPLITUDE = 25;
/** カーブの伸び方を決めるスケール（秒）。小さいほど同じ秒差でスコア差が急になる */
export const RACE_TIME_SCORE_SCALE = 1.2;

export function calculateRaceTimeScore(trackAdjustedDiffSeconds: number): number {
  const raw =
    RACE_TIME_SCORE_CENTER +
    RACE_TIME_SCORE_AMPLITUDE * Math.tanh(trackAdjustedDiffSeconds / RACE_TIME_SCORE_SCALE);
  return roundToOneDecimal(clamp(raw, 0, 100));
}

/** 秒数を競馬の慣例表記（例: 119.8秒 → "1:59.8"）にフォーマットする */
export function formatRaceTimeSeconds(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = (abs % 60).toFixed(1).padStart(4, "0");
  return `${sign}${minutes}:${seconds}`;
}

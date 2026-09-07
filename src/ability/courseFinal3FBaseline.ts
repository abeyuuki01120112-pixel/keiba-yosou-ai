/**
 * 過去5年上がり3F基準のルックアップ。
 * 実データが確定したら data/courseFinal3FBaselines.json を差し替えるだけでよい構造にしている。
 */

import { resolveBaselineLookup } from "./baselineLookup";
import type { BaselineMeta, CourseFinal3FBaseline, Surface } from "./types";

/** 競馬場×surface×距離×馬場状態の完全一致検索（①段階のみ）。従来どおりの挙動を維持する */
export function findCourseFinal3FBaseline(
  baselines: CourseFinal3FBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
  going: string,
): CourseFinal3FBaseline | undefined {
  return baselines.find(
    (b) =>
      b.racecourse === racecourse &&
      b.surface === surface &&
      b.distance === distance &&
      b.going === going,
  );
}

/** 競馬場×surface×距離が一致すれば馬場状態を問わない検索（②段階） */
function findCourseFinal3FBaselineIgnoringGoing(
  baselines: CourseFinal3FBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
): CourseFinal3FBaseline | undefined {
  return baselines.find(
    (b) => b.racecourse === racecourse && b.surface === surface && b.distance === distance,
  );
}

/**
 * ①exact → ②distanceFallback（馬場状態を問わない） → ③defaultFallback（一致なし）
 * の順で上がり3F基準を検索する。どの段階で見つかったか・信頼度をBaselineMetaとして返す。
 */
export function lookupCourseFinal3FBaseline(
  baselines: CourseFinal3FBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
  going: string,
): { baseline: CourseFinal3FBaseline | null; meta: BaselineMeta } {
  const exact = findCourseFinal3FBaseline(baselines, racecourse, surface, distance, going);
  const distanceFallback = exact
    ? undefined
    : findCourseFinal3FBaselineIgnoringGoing(baselines, racecourse, surface, distance);
  return resolveBaselineLookup(exact, distanceFallback);
}

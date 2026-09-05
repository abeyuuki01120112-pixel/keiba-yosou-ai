/**
 * 過去5年基準タイムのルックアップ。
 * 実データが確定したら data/courseTimeBaselines.json を差し替えるだけでよい構造にしている。
 */

import { resolveBaselineLookup } from "./baselineLookup";
import type { BaselineMeta, CourseTimeBaseline, Surface } from "./types";

/** 競馬場×surface×距離×馬場状態の完全一致検索（①段階のみ）。従来どおりの挙動を維持する */
export function findCourseTimeBaseline(
  baselines: CourseTimeBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
  going: string,
): CourseTimeBaseline | undefined {
  return baselines.find(
    (b) =>
      b.racecourse === racecourse &&
      b.surface === surface &&
      b.distance === distance &&
      b.going === going,
  );
}

/** 競馬場×surface×距離が一致すれば馬場状態を問わない検索（②段階） */
function findCourseTimeBaselineIgnoringGoing(
  baselines: CourseTimeBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
): CourseTimeBaseline | undefined {
  return baselines.find(
    (b) => b.racecourse === racecourse && b.surface === surface && b.distance === distance,
  );
}

/**
 * ①exact → ②distanceFallback（馬場状態を問わない） → ③defaultFallback（一致なし）
 * の順で基準タイムを検索する。どの段階で見つかったか・信頼度をBaselineMetaとして返す。
 */
export function lookupCourseTimeBaseline(
  baselines: CourseTimeBaseline[],
  racecourse: string,
  surface: Surface,
  distance: number,
  going: string,
): { baseline: CourseTimeBaseline | null; meta: BaselineMeta } {
  const exact = findCourseTimeBaseline(baselines, racecourse, surface, distance, going);
  const distanceFallback = exact
    ? undefined
    : findCourseTimeBaselineIgnoringGoing(baselines, racecourse, surface, distance);
  return resolveBaselineLookup(exact, distanceFallback);
}

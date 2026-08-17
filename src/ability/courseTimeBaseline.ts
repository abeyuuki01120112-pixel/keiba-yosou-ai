/**
 * 過去5年基準タイムのルックアップ。
 * 実データが確定したら data/courseTimeBaselines.json を差し替えるだけでよい構造にしている。
 */

import type { CourseTimeBaseline, Surface } from "./types";

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

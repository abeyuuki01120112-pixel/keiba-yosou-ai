/**
 * 過去5年上がり3F基準のルックアップ。
 * 実データが確定したら data/courseFinal3FBaselines.json を差し替えるだけでよい構造にしている。
 */

import type { CourseFinal3FBaseline, Surface } from "./types";

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

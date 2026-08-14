/**
 * 大量試走用のランナー。
 * 画面アニメーションと計算処理を分離するため、ここでは統計集計のみを行う
 * （毎レースのtraceは保持しない。代表レースが欲しい場合は raceEngine.simulateRace を
 *  trace:true で個別に呼ぶ）。
 */

import { simulateRace } from "./raceEngine";
import { SeededRandom } from "./probability";
import type { HorseAbility, RaceConfig, SimulationHorseStats } from "./types";

export interface SimulationRunResult {
  trialCount: number;
  stats: SimulationHorseStats[];
  /** 実行にかかった時間（ミリ秒） */
  elapsedMs: number;
}

/**
 * horses を trialCount 回シミュレーションし、馬ごとの成績を集計する。
 * seedを指定すると同じ結果が再現できる。指定しなければ毎回異なる結果になる。
 */
export function runSimulation(
  horses: HorseAbility[],
  config: RaceConfig,
  trialCount: number,
): SimulationRunResult {
  const startTime = performance.now();

  const wins = new Map<string, number>();
  const seconds = new Map<string, number>();
  const thirds = new Map<string, number>();
  for (const h of horses) {
    wins.set(h.horseId, 0);
    seconds.set(h.horseId, 0);
    thirds.set(h.horseId, 0);
  }

  // seed指定時は決定的な子seedを連番で生成し、各レースを再現可能にする
  const baseRng = new SeededRandom(config.seed);

  for (let i = 0; i < trialCount; i++) {
    const raceSeed = config.seed !== undefined ? baseRng.next() * 4294967296 : undefined;
    const raceRng = new SeededRandom(raceSeed);
    const result = simulateRace(horses, config, raceRng);

    const first = result.order[0];
    const second = result.order[1];
    const third = result.order[2];
    if (first !== undefined) wins.set(first, (wins.get(first) ?? 0) + 1);
    if (second !== undefined) seconds.set(second, (seconds.get(second) ?? 0) + 1);
    if (third !== undefined) thirds.set(third, (thirds.get(third) ?? 0) + 1);
  }

  const stats: SimulationHorseStats[] = horses.map((h) => {
    const w = wins.get(h.horseId) ?? 0;
    const s = seconds.get(h.horseId) ?? 0;
    const t = thirds.get(h.horseId) ?? 0;
    return {
      horseId: h.horseId,
      horseName: h.horseName,
      number: h.number,
      simulations: trialCount,
      wins: w,
      seconds: s,
      thirds: t,
      winRate: (w / trialCount) * 100,
      top2Rate: ((w + s) / trialCount) * 100,
      top3Rate: ((w + s + t) / trialCount) * 100,
    };
  });

  const elapsedMs = performance.now() - startTime;

  return { trialCount, stats, elapsedMs };
}

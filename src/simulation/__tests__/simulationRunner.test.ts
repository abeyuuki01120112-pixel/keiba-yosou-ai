import { describe, expect, it } from "vitest";
import { runSimulation } from "../simulationRunner";
import { loadDefaultHorses } from "../horseData";
import type { RaceConfig } from "../types";

const config: RaceConfig = { pace: "medium", seed: 999 };

describe("runSimulation", () => {
  it("100,000回後の全馬win数合計が100,000になる", () => {
    const horses = loadDefaultHorses();
    const { stats } = runSimulation(horses, config, 100000);
    const totalWins = stats.reduce((sum, s) => sum + s.wins, 0);
    expect(totalWins).toBe(100000);
  });

  it("winRate合計がほぼ100%になる", () => {
    const horses = loadDefaultHorses();
    const { stats } = runSimulation(horses, config, 10000);
    const totalWinRate = stats.reduce((sum, s) => sum + s.winRate, 0);
    expect(totalWinRate).toBeCloseTo(100, 1);
  });

  it("top2Rate・top3Rateの計算が正常（各馬でtop3 >= top2 >= win）", () => {
    const horses = loadDefaultHorses();
    const { stats } = runSimulation(horses, config, 5000);
    for (const s of stats) {
      expect(s.top2Rate).toBeGreaterThanOrEqual(s.winRate);
      expect(s.top3Rate).toBeGreaterThanOrEqual(s.top2Rate);
    }
    // top3合計は3着分なので約300%に近づくはず
    const totalTop3 = stats.reduce((sum, s) => sum + s.top3Rate, 0);
    expect(totalTop3).toBeCloseTo(300, 0);
  });

  it("再現性：同じseedなら同じ集計結果になる", () => {
    const horses = loadDefaultHorses();
    const runA = runSimulation(horses, config, 1000);
    const runB = runSimulation(horses, config, 1000);
    expect(runA.stats.map((s) => s.wins)).toEqual(runB.stats.map((s) => s.wins));
  });

  it("試走回数を1/10/100/1000/10000で連続実行できる", () => {
    const horses = loadDefaultHorses();
    const counts = [1, 10, 100, 1000, 10000];
    for (const count of counts) {
      const { stats } = runSimulation(horses, { pace: "high", seed: 1 }, count);
      const totalWins = stats.reduce((sum, s) => sum + s.wins, 0);
      expect(totalWins).toBe(count);
    }
  });
});

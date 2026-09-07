import { describe, expect, it } from "vitest";
import { simulateRace } from "../raceEngine";
import { SeededRandom } from "../probability";
import { loadDefaultHorses } from "../horseData";
import type { RaceConfig } from "../types";

const config: RaceConfig = { pace: "medium", seed: 12345 };

describe("simulateRace", () => {
  it("16頭全馬が参加する", () => {
    const horses = loadDefaultHorses();
    expect(horses).toHaveLength(16);
    const result = simulateRace(horses, config, new SeededRandom(1));
    expect(result.order).toHaveLength(16);
    expect(new Set(result.order).size).toBe(16);
  });

  it("1レースで1〜16着が重複なく出る", () => {
    const horses = loadDefaultHorses();
    const result = simulateRace(horses, config, new SeededRandom(42));
    const ranks = Object.values(result.positions).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("同じseedでは同じ結果になる", () => {
    const horses = loadDefaultHorses();
    const resultA = simulateRace(horses, config, new SeededRandom(777));
    const resultB = simulateRace(horses, config, new SeededRandom(777));
    expect(resultA.order).toEqual(resultB.order);
  });

  it("seedを変えれば結果が変わる", () => {
    const horses = loadDefaultHorses();
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const orders = seeds.map(
      (seed) => simulateRace(horses, config, new SeededRandom(seed)).order,
    );
    const uniqueOrders = new Set(orders.map((o) => o.join(",")));
    // 8回試して全て同じ結果になることは通常あり得ない
    expect(uniqueOrders.size).toBeGreaterThan(1);
  });

  it("能力を大幅に上げた馬は統計的に勝率が上がる", () => {
    const horses = loadDefaultHorses();
    const boosted = horses.map((h, idx) =>
      idx === 0
        ? {
            ...h,
            baseAbility: 99,
            start: 95,
            earlySpeed: 95,
            stamina: 95,
            sustainedSpeed: 99,
            acceleration: 99,
            finishing: 99,
          }
        : h,
    );

    let wins = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const result = simulateRace(boosted, config, new SeededRandom(i + 1));
      if (result.order[0] === boosted[0].horseId) wins++;
    }
    // 16頭均等なら期待勝率は約6.25%。大幅強化すればそれを大きく上回るはず
    expect(wins / trials).toBeGreaterThan(0.25);
  });

  it("consistencyを変えた際に結果分布が変わる（着順のばらつき）", () => {
    const horses = loadDefaultHorses();
    const stable = horses.map((h, idx) =>
      idx === 0 ? { ...h, consistency: 100 } : h,
    );
    const unstable = horses.map((h, idx) =>
      idx === 0 ? { ...h, consistency: 5 } : h,
    );

    const collectPositions = (list: typeof horses) => {
      const positions: number[] = [];
      for (let i = 0; i < 300; i++) {
        const result = simulateRace(list, config, new SeededRandom(i + 1000));
        positions.push(result.positions[list[0].horseId]);
      }
      return positions;
    };

    const stablePositions = collectPositions(stable);
    const unstablePositions = collectPositions(unstable);

    const variance = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };

    expect(variance(unstablePositions)).toBeGreaterThan(variance(stablePositions));
  });
});

import { describe, it, expect } from "vitest";
import { loadAllRaces, fmt } from "../predictionDashboardData";

describe("loadAllRaces — UI用API（derived JSON読み込み）", () => {
  it("src/integration/data/derived/配下の全JSONを読み込み、日付降順で返す", () => {
    const races = loadAllRaces();
    expect(races.length).toBeGreaterThan(0);
    for (let i = 1; i < races.length; i++) {
      expect(races[i - 1].race.raceDate >= races[i].race.raceDate).toBe(true);
    }
  });

  it("2026新潟記念が読み込まれ、実際の着順（実データ）を保持している", () => {
    const races = loadAllRaces();
    const niigataKinen = races.find((r) => r.race.raceId === "JRA-20260830-NIIGATA-08");
    expect(niigataKinen).toBeDefined();
    expect(niigataKinen!.hasResult).toBe(true);
    const zoroastro = niigataKinen!.horses.find((h) => h.horseName === "ゾロアストロ");
    expect(zoroastro?.actualFinishPosition).toBe(1);
  });

  it("各レースのhorsesはbaseAbility等が欠損している場合nullを保持し、0で埋めない", () => {
    const races = loadAllRaces();
    for (const race of races) {
      for (const h of race.horses) {
        if (h.baseAbility === null) {
          expect(h.effectiveAbility).toBeNull();
          expect(h.finalRaceAbility).toBeNull();
        }
      }
    }
  });
});

describe("fmt — 未取得データの表示", () => {
  it("nullは'--'として表示する（0で埋めない）", () => {
    expect(fmt(null)).toBe("--");
    expect(fmt(null, "%")).toBe("--");
  });

  it("値がある場合はsuffix付きで返す", () => {
    expect(fmt(74.8)).toBe("74.8");
    expect(fmt(99.4, "%")).toBe("99.4%");
    expect(fmt(0, "%")).toBe("0%"); // 0は正当な値であり'--'にしない
  });
});

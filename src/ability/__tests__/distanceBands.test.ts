import { describe, expect, it } from "vitest";
import { distanceBandGap, getDistanceBand } from "../distanceBands";

describe("getDistanceBand", () => {
  it("初期区分の境界値を正しく判定する", () => {
    expect(getDistanceBand(1400)).toBe("short");
    expect(getDistanceBand(1500)).toBe("mile");
    expect(getDistanceBand(1700)).toBe("mile");
    expect(getDistanceBand(1800)).toBe("middle");
    expect(getDistanceBand(2200)).toBe("middle");
    expect(getDistanceBand(2300)).toBe("long");
    expect(getDistanceBand(2600)).toBe("long");
    expect(getDistanceBand(2700)).toBe("superLong");
    expect(getDistanceBand(3200)).toBe("superLong");
  });

  it("区分の隙間に該当する距離は最も近い帯へfallbackする（同点の場合は距離の短い側の帯を優先）", () => {
    expect(getDistanceBand(1450)).toBe("short"); // short(上限1400)とmile(下限1500)への差はともに50、同点でshortを優先
    expect(getDistanceBand(2250)).toBe("middle"); // middle(上限2200)とlong(下限2300)への差はともに50、同点でmiddleを優先
    expect(getDistanceBand(2650)).toBe("long"); // long(上限2600)とsuperLong(下限2700)への差はともに50、同点でlongを優先
  });

  it("0未満や極端な距離でも例外を投げない", () => {
    expect(() => getDistanceBand(0)).not.toThrow();
    expect(getDistanceBand(0)).toBe("short");
  });
});

describe("distanceBandGap", () => {
  it("同じ帯なら0", () => {
    expect(distanceBandGap("middle", "middle")).toBe(0);
  });

  it("隣接する帯なら1", () => {
    expect(distanceBandGap("middle", "long")).toBe(1);
    expect(distanceBandGap("mile", "middle")).toBe(1);
  });

  it("2つ以上離れた帯なら2以上", () => {
    expect(distanceBandGap("short", "middle")).toBe(2);
    expect(distanceBandGap("short", "superLong")).toBe(4);
  });
});

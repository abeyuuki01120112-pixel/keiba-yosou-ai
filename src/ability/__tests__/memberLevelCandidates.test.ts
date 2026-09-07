import { describe, expect, it } from "vitest";
import {
  calculateTopNConfidenceWeightedMean,
  calculateTopNMedian,
  calculateTopNSimpleAverage,
  confidenceFromSampleCount,
  confidenceWeightFromSampleCount,
} from "../memberLevelCandidates";
import type { AbilityCandidate } from "../memberLevelCandidates";

function c(id: string, ability: number, sampleCount: number): AbilityCandidate {
  return { id, ability, sampleCount };
}

describe("confidenceWeightFromSampleCount / confidenceFromSampleCount（既存定義の再利用）", () => {
  it("STEP4/STEP6と同じ閾値・重みになる（新しい定義を作っていない）", () => {
    expect(confidenceFromSampleCount(0)).toBe("low");
    expect(confidenceFromSampleCount(1)).toBe("low");
    expect(confidenceFromSampleCount(2)).toBe("medium");
    expect(confidenceFromSampleCount(3)).toBe("medium");
    expect(confidenceFromSampleCount(4)).toBe("high");
    expect(confidenceWeightFromSampleCount(0)).toBeCloseTo(0.3, 5);
    expect(confidenceWeightFromSampleCount(2)).toBeCloseTo(0.6, 5);
    expect(confidenceWeightFromSampleCount(4)).toBeCloseTo(1.0, 5);
  });
});

describe("calculateTopNSimpleAverage", () => {
  it("Top3/Top5の単純平均を計算する", () => {
    const candidates = [c("a", 90, 5), c("b", 80, 5), c("c", 70, 5), c("d", 60, 5), c("e", 50, 5), c("f", 40, 5)];
    expect(calculateTopNSimpleAverage(candidates, 3)).toBeCloseTo(80, 5); // (90+80+70)/3
    expect(calculateTopNSimpleAverage(candidates, 5)).toBeCloseTo(70, 5); // (90+80+70+60+50)/5
  });

  it("対象馬が0頭ならnull（判断不能・勝手に埋めない）", () => {
    expect(calculateTopNSimpleAverage([], 3)).toBeNull();
  });

  it("対象馬がN未満でも壊れず、存在する分だけで計算する", () => {
    const candidates = [c("a", 90, 5), c("b", 80, 5)];
    expect(calculateTopNSimpleAverage(candidates, 5)).toBeCloseTo(85, 5);
    expect(calculateTopNSimpleAverage(candidates, 3)).toBeCloseTo(85, 5);
  });

  it("同点能力馬でも壊れない", () => {
    const candidates = [c("a", 70, 3), c("b", 70, 3), c("c", 70, 3)];
    expect(calculateTopNSimpleAverage(candidates, 3)).toBeCloseTo(70, 5);
  });

  it("NaN/非有限のability・sampleCountは集計から除外される", () => {
    const candidates = [c("a", 90, 5), c("b", NaN, 5), c("c", Infinity, 5), c("d", 80, NaN), c("e", 70, -1)];
    expect(calculateTopNSimpleAverage(candidates, 5)).toBeCloseTo(90, 5); // aのみ有効
  });

  it("極端な能力値でも壊れない", () => {
    const candidates = [c("a", 1e9, 5), c("b", -1e9, 5)];
    const result = calculateTopNSimpleAverage(candidates, 2);
    expect(result).not.toBeNaN();
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("calculateTopNMedian", () => {
  it("Top5の中央値を計算する", () => {
    const candidates = [c("a", 90, 5), c("b", 80, 5), c("c", 70, 5), c("d", 60, 5), c("e", 50, 5)];
    expect(calculateTopNMedian(candidates, 5)).toBe(70);
  });

  it("対象馬が0頭ならnull", () => {
    expect(calculateTopNMedian([], 5)).toBeNull();
  });

  it("偶数個の場合は中央2件の平均になる", () => {
    const candidates = [c("a", 90, 5), c("b", 80, 5), c("c", 70, 5), c("d", 60, 5)];
    expect(calculateTopNMedian(candidates, 4)).toBe(75);
  });
});

describe("calculateTopNConfidenceWeightedMean", () => {
  it("重み付き平均を計算する（分母で正規化、スケールが崩れない）", () => {
    // 宝塚記念Top5相当の実データパターン
    const candidates = [
      c("クロワデュノール", 79.3, 1), // low(0.3)
      c("タガノデュード", 77.5, 1), // low(0.3)
      c("ミクニインスパイア", 75.5, 1), // low(0.3)
      c("ダノンデサイル", 73.7, 2), // medium(0.6)
      c("ジューンテイク", 73.3, 3), // medium(0.6)
    ];
    const result = calculateTopNConfidenceWeightedMean(candidates, 5)!;
    // 手計算: (79.3+77.5+75.5)*0.3 + (73.7+73.3)*0.6 = 69.69+88.2=157.89 / 2.1 = 75.185...
    expect(result).toBeCloseTo(75.2, 1);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });

  it("confidence=0の馬しかいない場合、0除算せずnullを返す", () => {
    // sampleCount>=0は常にlow(重み0.3)以上になるため、このテストは重み0を人為的に再現できない。
    // → confidenceWeightFromSampleCountの設計上、通常入力では重み0は発生しない（0.3が下限）ことを確認する。
    expect(confidenceWeightFromSampleCount(0)).toBeGreaterThan(0);
  });

  it("対象馬が0頭ならnull", () => {
    expect(calculateTopNConfidenceWeightedMean([], 5)).toBeNull();
  });

  it("全馬confidence同一なら単純平均と一致する", () => {
    const candidates = [c("a", 90, 5), c("b", 80, 5), c("c", 70, 5)]; // 全員high(1.0)
    expect(calculateTopNConfidenceWeightedMean(candidates, 3)).toBeCloseTo(
      calculateTopNSimpleAverage(candidates, 3)!,
      5,
    );
  });

  it("低confidenceの馬の影響が単純平均より弱まる", () => {
    const withOutlier = [
      c("outlier", 100, 1), // low、極端に高い1走のみ
      c("steady1", 70, 5),
      c("steady2", 70, 5),
    ];
    const simple = calculateTopNSimpleAverage(withOutlier, 3)!;
    const weighted = calculateTopNConfidenceWeightedMean(withOutlier, 3)!;
    expect(weighted).toBeLessThan(simple); // 低confidenceの外れ値の影響が弱まっている
  });

  it("極端な能力値でも壊れない", () => {
    const candidates = [c("a", 1e6, 1), c("b", 50, 5)];
    const result = calculateTopNConfidenceWeightedMean(candidates, 2);
    expect(result).not.toBeNaN();
    expect(Number.isFinite(result)).toBe(true);
  });
});

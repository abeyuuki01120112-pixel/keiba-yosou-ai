import { describe, expect, it } from "vitest";
import {
  calculateMemberLevel,
  DEPTH_SPREAD_PENALTY,
  FALLBACK_MEMBER_LEVEL_SCORE,
  MEMBER_LEVEL_WEIGHTS,
} from "../memberLevel";

describe("MEMBER_LEVEL_WEIGHTS", () => {
  it("40/30/20/10比率で合計1.0になる", () => {
    expect(MEMBER_LEVEL_WEIGHTS.top3).toBeCloseTo(0.4, 5);
    expect(MEMBER_LEVEL_WEIGHTS.top5).toBeCloseTo(0.3, 5);
    expect(MEMBER_LEVEL_WEIGHTS.field).toBeCloseTo(0.2, 5);
    expect(MEMBER_LEVEL_WEIGHTS.depth).toBeCloseTo(0.1, 5);
    const total =
      MEMBER_LEVEL_WEIGHTS.top3 +
      MEMBER_LEVEL_WEIGHTS.top5 +
      MEMBER_LEVEL_WEIGHTS.field +
      MEMBER_LEVEL_WEIGHTS.depth;
    expect(total).toBeCloseTo(1.0, 5);
  });
});

describe("calculateMemberLevel", () => {
  it("上位3頭平均が正しい", () => {
    const abilities = [86, 84, 82, 80, 78, 74, 71];
    const { breakdown } = calculateMemberLevel(abilities);
    expect(breakdown!.top3Average).toBeCloseTo((86 + 84 + 82) / 3, 5);
  });

  it("上位5頭平均が正しい", () => {
    const abilities = [86, 84, 82, 80, 78, 74, 71];
    const { breakdown } = calculateMemberLevel(abilities);
    expect(breakdown!.top5Average).toBeCloseTo((86 + 84 + 82 + 80 + 78) / 5, 5);
  });

  it("全体平均が正しい", () => {
    const abilities = [86, 84, 82, 80, 78, 74, 71];
    const { breakdown } = calculateMemberLevel(abilities);
    const expectedField = abilities.reduce((a, b) => a + b, 0) / abilities.length;
    expect(breakdown!.fieldAverage).toBeCloseTo(expectedField, 1);
  });

  it("depthScoreが spread=top5Average-fieldAverage から正しく計算される", () => {
    // top5Average=82, fieldAverage=76 -> spread=6 -> depthScore=100-6*5=70
    const abilities = [90, 84, 82, 80, 74, 60, 60, 60]; // top5=(90+84+82+80+74)/5=82, field=(90+84+82+80+74+60+60+60)/8=76.25
    const { breakdown } = calculateMemberLevel(abilities);
    const expectedSpread = breakdown!.top5Average - breakdown!.fieldAverage;
    const expectedDepth = Math.min(100, Math.max(0, 100 - expectedSpread * DEPTH_SPREAD_PENALTY));
    // top5Average/fieldAverageは表示用に丸められた値のため、丸め誤差の範囲で一致すればよい
    expect(breakdown!.depthScore).toBeCloseTo(expectedDepth, 0);
  });

  it("layer(層)が薄い(spreadが大きい)レースほどdepthScoreが低い", () => {
    const thinField = calculateMemberLevel([95, 90, 85, 40, 40, 40, 40]); // 上位が突出、全体は低い
    const thickField = calculateMemberLevel([80, 79, 78, 77, 76, 75, 74]); // 均質
    expect(thinField.breakdown!.depthScore).toBeLessThan(thickField.breakdown!.depthScore);
  });

  it("memberLevelScoreが40/30/20/10の加重平均で計算される", () => {
    const abilities = [86, 84, 82, 80, 78, 74, 71];
    const { memberLevelScore, breakdown } = calculateMemberLevel(abilities);
    const expected =
      breakdown!.top3Average * MEMBER_LEVEL_WEIGHTS.top3 +
      breakdown!.top5Average * MEMBER_LEVEL_WEIGHTS.top5 +
      breakdown!.fieldAverage * MEMBER_LEVEL_WEIGHTS.field +
      breakdown!.depthScore * MEMBER_LEVEL_WEIGHTS.depth;
    expect(memberLevelScore).toBeCloseTo(Math.round(expected * 10) / 10, 1);
  });

  it("0〜100にclampされる", () => {
    const allMax = calculateMemberLevel([100, 100, 100, 100, 100]);
    expect(allMax.memberLevelScore).toBeLessThanOrEqual(100);
    const allMin = calculateMemberLevel([0, 0, 0, 0, 0]);
    expect(allMin.memberLevelScore).toBeGreaterThanOrEqual(0);
  });

  it("出走頭数が5頭未満でも壊れない（3頭）", () => {
    const { memberLevelScore, breakdown } = calculateMemberLevel([80, 75, 70]);
    expect(Number.isFinite(memberLevelScore)).toBe(true);
    expect(breakdown!.top3Average).toBeCloseTo((80 + 75 + 70) / 3, 5);
    expect(breakdown!.top5Average).toBeCloseTo((80 + 75 + 70) / 3, 5);
    expect(breakdown!.participantCount).toBe(3);
  });

  it("出走頭数が1頭でも壊れない", () => {
    const { memberLevelScore, breakdown } = calculateMemberLevel([77]);
    expect(Number.isFinite(memberLevelScore)).toBe(true);
    expect(breakdown!.top3Average).toBe(77);
    expect(breakdown!.top5Average).toBe(77);
    expect(breakdown!.fieldAverage).toBe(77);
  });

  it("null（能力不明）は集計から除外される", () => {
    const withNulls = calculateMemberLevel([80, null, 70, null, 60]);
    const withoutNulls = calculateMemberLevel([80, 70, 60]);
    expect(withNulls.memberLevelScore).toBeCloseTo(withoutNulls.memberLevelScore, 5);
    expect(withNulls.breakdown!.participantCount).toBe(3);
  });

  it("参照可能な能力値が1頭も無い場合はフォールバック値になり、breakdownはnull", () => {
    const result = calculateMemberLevel([null, null, null]);
    expect(result.memberLevelScore).toBe(FALLBACK_MEMBER_LEVEL_SCORE);
    expect(result.breakdown).toBeNull();
  });
});

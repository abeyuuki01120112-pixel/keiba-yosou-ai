import { describe, expect, it } from "vitest";
import {
  buildCanonicalHorseRegistry,
  buildHorseDataKindRollup,
  toCanonicalHorseNameEntries,
} from "../canonicalHorseRegistry";

describe("CHECKPOINT13.2B STEP6: canonicalHorseRegistryはdata/horses/から自動生成される（手作業ハードコードではない）", () => {
  it("data/horses/に実在する全horseIdを含む（40頭）", () => {
    const registry = buildCanonicalHorseRegistry();
    expect(registry.length).toBeGreaterThanOrEqual(40);
    expect(registry.some((e) => e.horseId === "shakeyourheart")).toBe(true);
    expect(registry.some((e) => e.horseId === "2021102224")).toBe(true);
  });

  it("ロースター登録済みの馬はhorseNameが既知、未登録の馬はnull（推測しない）", () => {
    const registry = buildCanonicalHorseRegistry();
    const shake = registry.find((e) => e.horseId === "shakeyourheart");
    expect(shake?.horseName).toBe("シェイクユアハート");

    // ロースター外の実データ馬（数値ID）はhorseNameが記録されていないため null
    const unregistered = registry.find((e) => e.horseId === "2021102224");
    expect(unregistered?.horseName).toBeNull();
  });

  it("実データ馬（シェイクユアハート）はdataKind='real'", () => {
    const registry = buildCanonicalHorseRegistry();
    const shake = registry.find((e) => e.horseId === "shakeyourheart");
    expect(shake?.dataKind).toBe("real");
  });

  it("CHECKPOINT13.1で確認済みのV0プレースホルダー馬（grandia）はdataKind='placeholder'", () => {
    const registry = buildCanonicalHorseRegistry();
    const grandia = registry.find((e) => e.horseId === "grandia");
    expect(grandia?.horseName).toBe("グランディア"); // ロースターには登録されている
    expect(grandia?.dataKind).toBe("placeholder");
  });
});

describe("buildHorseDataKindRollup", () => {
  it("過去走0件はunknown", () => {
    expect(buildHorseDataKindRollup([])).toBe("unknown");
  });
  it("全走dataKind未設定（旧データ）はreal扱い", () => {
    expect(buildHorseDataKindRollup([{}, {}])).toBe("real");
  });
  it("全走placeholderはplaceholder", () => {
    expect(buildHorseDataKindRollup([{ dataKind: "placeholder" }, { dataKind: "placeholder" }])).toBe("placeholder");
  });
  it("real/placeholder混在はmixed", () => {
    expect(buildHorseDataKindRollup([{ dataKind: "real" }, { dataKind: "placeholder" }])).toBe("mixed");
  });
});

describe("toCanonicalHorseNameEntries", () => {
  it("horseNameがnullのエントリは除外される（Runner Resolverの名前一致対象にしない）", () => {
    const entries = toCanonicalHorseNameEntries([
      { horseId: "a", horseName: "馬A", dataKind: "real" },
      { horseId: "b", horseName: null, dataKind: "real" },
    ]);
    expect(entries).toEqual([{ horseId: "a", horseName: "馬A" }]);
  });
});

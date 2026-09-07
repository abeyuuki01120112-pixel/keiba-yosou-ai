import { describe, expect, it } from "vitest";
import { isPlaceholderSource, MIN_RELIABLE_SAMPLE_COUNT, resolveBaselineLookup } from "../baselineLookup";

interface Dummy {
  sampleCount: number;
  source: string;
  label: string;
}

function record(sampleCount: number, label: string): Dummy {
  return { sampleCount, source: `出典:${label}`, label };
}

describe("resolveBaselineLookup", () => {
  it("exactMatchがあればbaselineSource=exactとなり、そのレコードが使われる", () => {
    const exact = record(20, "exact");
    const fallback = record(20, "fallback");
    const { baseline, meta } = resolveBaselineLookup(exact, fallback);
    expect(baseline).toBe(exact);
    expect(meta.baselineSource).toBe("exact");
  });

  it("exactMatchが無くdistanceFallbackMatchがあればbaselineSource=distanceFallbackとなる", () => {
    const fallback = record(20, "fallback");
    const { baseline, meta } = resolveBaselineLookup<Dummy>(undefined, fallback);
    expect(baseline).toBe(fallback);
    expect(meta.baselineSource).toBe("distanceFallback");
  });

  it("どちらも無ければbaselineSource=defaultFallbackとなり、baselineはnull", () => {
    const { baseline, meta } = resolveBaselineLookup<Dummy>(undefined, undefined);
    expect(baseline).toBeNull();
    expect(meta.baselineSource).toBe("defaultFallback");
    expect(meta.sampleCount).toBeNull();
    expect(meta.isReliable).toBe(false);
    expect(meta.dataSource).toBeNull();
  });

  it("sampleCountをmetaにそのまま反映する", () => {
    const exact = record(42, "exact");
    const { meta } = resolveBaselineLookup<Dummy>(exact, undefined);
    expect(meta.sampleCount).toBe(42);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT以上ならisReliable=true", () => {
    const exact = record(MIN_RELIABLE_SAMPLE_COUNT, "exact");
    const { meta } = resolveBaselineLookup<Dummy>(exact, undefined);
    expect(meta.isReliable).toBe(true);
  });

  it("sampleCountがMIN_RELIABLE_SAMPLE_COUNT未満ならisReliable=false", () => {
    const exact = record(MIN_RELIABLE_SAMPLE_COUNT - 1, "exact");
    const { meta } = resolveBaselineLookup<Dummy>(exact, undefined);
    expect(meta.isReliable).toBe(false);
  });

  it("dataSourceは一致したレコードのsourceを反映する", () => {
    const exact = record(20, "exact");
    const { meta } = resolveBaselineLookup<Dummy>(exact, undefined);
    expect(meta.dataSource).toBe("出典:exact");
  });

  it("sourceがV0仮データ由来の場合、sampleCountがMIN_RELIABLE_SAMPLE_COUNT以上でもisReliable=false", () => {
    const placeholder: Dummy = {
      sampleCount: 30,
      source: "V0テスト用仮データ（実データ未投入）",
      label: "placeholder",
    };
    const { meta } = resolveBaselineLookup<Dummy>(placeholder, undefined);
    expect(meta.sampleCount).toBe(30);
    expect(meta.isReliable).toBe(false);
  });

  it("sourceが仮データ由来でもdistanceFallback経由で一致した場合はisReliable=false", () => {
    const placeholder: Dummy = {
      sampleCount: 100,
      source: "V0テスト用仮データ（実データ未投入）",
      label: "placeholder",
    };
    const { meta } = resolveBaselineLookup<Dummy>(undefined, placeholder);
    expect(meta.baselineSource).toBe("distanceFallback");
    expect(meta.isReliable).toBe(false);
  });

  it("sourceが実データ(JRA確認済みサンプル等)であれば、sampleCountがMIN_RELIABLE_SAMPLE_COUNT以上のときisReliable=true", () => {
    const real = record(MIN_RELIABLE_SAMPLE_COUNT, "JRA確認済みサンプル(n=15;対象年:2021-2025) verified");
    const { meta } = resolveBaselineLookup<Dummy>(real, undefined);
    expect(meta.isReliable).toBe(true);
  });
});

describe("isPlaceholderSource", () => {
  it("V0仮データの文言を仮データ由来と判定する", () => {
    expect(isPlaceholderSource("V0テスト用仮データ（実データ未投入）")).toBe(true);
  });

  it("placeholder/syntheticの英語表記も仮データ由来と判定する", () => {
    expect(isPlaceholderSource("placeholder data, not yet verified")).toBe(true);
    expect(isPlaceholderSource("synthetic sample for testing")).toBe(true);
  });

  it("実データバッチのsource文言は仮データ由来と判定しない", () => {
    expect(
      isPlaceholderSource(
        "JRA確認済みサンプル(n=15;対象年:2021;2022;2023;2024;2025) verified_sample_pool_only NOT_final_5y_baseline 暫定candidate",
      ),
    ).toBe(false);
  });
});

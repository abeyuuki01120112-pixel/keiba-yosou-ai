import { describe, expect, it } from "vitest";
import { MIN_RELIABLE_SAMPLE_COUNT, resolveBaselineLookup } from "../baselineLookup";

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
});

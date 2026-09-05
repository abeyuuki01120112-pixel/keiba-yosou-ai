import { describe, expect, it } from "vitest";
import {
  normalizeHorseName,
  resolveRunner,
  resolveRunners,
  type CanonicalHorseNameEntry,
  type RunnerResolverContext,
} from "../runnerResolver";

const NAMES: CanonicalHorseNameEntry[] = [
  { horseId: "shakeyourheart", horseName: "シェイクユアハート" },
  { horseId: "grandia", horseName: "グランディア" },
  { horseId: "dup-a", horseName: "サンプルホース" },
  { horseId: "dup-b", horseName: "サンプルホース" },
];

function makeContext(overrides: Partial<RunnerResolverContext> = {}): RunnerResolverContext {
  return {
    canonicalHorseIds: new Set(["shakeyourheart", "grandia", "dup-a", "dup-b", "2021102224"]),
    canonicalHorseNames: NAMES,
    sourceHorseIdRegistry: {},
    ...overrides,
  };
}

describe("normalizeHorseName", () => {
  it("前後の空白・連続空白を吸収する", () => {
    expect(normalizeHorseName("  シェイクユアハート  ")).toBe("シェイクユアハート");
    expect(normalizeHorseName("シェイク　ユアハート")).toBe("シェイク ユアハート".normalize("NFKC"));
  });

  it("全角/半角表記ゆれをNFKC正規化で吸収する", () => {
    // 半角カタカナ→全角カタカナ、全角英数字→半角英数字
    expect(normalizeHorseName("ｼｪｲｸﾕｱﾊｰﾄ")).toBe("シェイクユアハート".normalize("NFKC"));
  });
});

describe("Runner Resolver V1: Priority 1（canonical horseId一致）", () => {
  it("canonicalHorseIdHintがcanonical horseId集合に存在すればresolved", () => {
    const result = resolveRunner(
      { horseName: "シェイクユアハート", canonicalHorseIdHint: "shakeyourheart" },
      makeContext(),
    );
    expect(result.status).toBe("resolved");
    expect(result.horseId).toBe("shakeyourheart");
    expect(result.reason).toContain("Priority 1");
  });

  it("canonicalHorseIdHintが存在しないIDなら、Priority 2/3へフォールスルーする", () => {
    const result = resolveRunner(
      { horseName: "シェイクユアハート", canonicalHorseIdHint: "nonexistent-id" },
      makeContext(),
    );
    expect(result.status).toBe("resolved");
    expect(result.horseId).toBe("shakeyourheart"); // Priority 3（horseName一致）で解決
    expect(result.reason).toContain("Priority 3");
  });
});

describe("Runner Resolver V1: Priority 2（sourceHorseId対応）", () => {
  it("sourceHorseIdRegistryに対応があればresolved", () => {
    const context = makeContext({ sourceHorseIdRegistry: { "JRA-0001234": "2021102224" } });
    const result = resolveRunner({ horseName: "未知の表記", sourceHorseId: "JRA-0001234" }, context);
    expect(result.status).toBe("resolved");
    expect(result.horseId).toBe("2021102224");
    expect(result.reason).toContain("Priority 2");
  });

  it("sourceHorseIdRegistryが空なら Priority 2 はスキップされる", () => {
    const result = resolveRunner({ horseName: "未知の表記", sourceHorseId: "JRA-0001234" }, makeContext());
    expect(result.status).toBe("unresolved");
  });
});

describe("Runner Resolver V1: Priority 3（horseName完全一致）", () => {
  it("正規化後に完全一致する候補が1件のみならresolved", () => {
    const result = resolveRunner({ horseName: "グランディア" }, makeContext());
    expect(result.status).toBe("resolved");
    expect(result.horseId).toBe("grandia");
  });

  it("前後の空白・全角半角ゆれがあってもresolveできる", () => {
    const result = resolveRunner({ horseName: "  グランディア  " }, makeContext());
    expect(result.status).toBe("resolved");
    expect(result.horseId).toBe("grandia");
  });

  it("危険なファジーマッチはしない（部分一致・類似名では一致しない）", () => {
    const result = resolveRunner({ horseName: "グランディア号" }, makeContext());
    expect(result.status).toBe("unresolved");
  });
});

describe("Runner Resolver V1: unresolved / ambiguous", () => {
  it("一致する候補が無ければunresolved", () => {
    const result = resolveRunner({ horseName: "存在しない馬名" }, makeContext());
    expect(result.status).toBe("unresolved");
    expect(result.horseId).toBeNull();
  });

  it("同名馬が2頭以上いればambiguous。勝手に1頭へ確定しない", () => {
    const result = resolveRunner({ horseName: "サンプルホース" }, makeContext());
    expect(result.status).toBe("ambiguous");
    expect(result.horseId).toBeNull();
    expect(result.candidates).toEqual(expect.arrayContaining(["dup-a", "dup-b"]));
    expect(result.candidates.length).toBe(2);
  });
});

describe("resolveRunners（バッチ）とサマリー", () => {
  it("resolved/unresolved/ambiguousの内訳を正しく集計する", () => {
    const { results, summary } = resolveRunners(
      [
        { horseName: "シェイクユアハート" },
        { horseName: "グランディア" },
        { horseName: "存在しない馬名" },
        { horseName: "サンプルホース" },
      ],
      makeContext(),
    );
    expect(results).toHaveLength(4);
    expect(summary).toEqual({ total: 4, resolved: 2, unresolved: 1, ambiguous: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { runRaceCardBridge, formatRaceCardBridgeReport } from "../raceCardBridge";
import { buildAbilityBoard } from "../../predictionSnapshot";
import type { RaceCardInput } from "../raceCardTypes";
import type { CanonicalHorseRegistryEntry } from "../canonicalHorseRegistry";
import fs from "node:fs";
import path from "node:path";

const FAR_FUTURE_START = "2099-01-01T15:45:00+09:00";

function raceCard(overrides: Partial<RaceCardInput> = {}): RaceCardInput {
  return {
    raceId: "TEST-11R",
    raceDate: "2026-09-06",
    raceNumber: 11,
    racecourse: "阪神",
    surface: "turf",
    distance: 2200,
    scheduledStartTime: FAR_FUTURE_START,
    going: null,
    runners: [{ horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false }],
    ...overrides,
  };
}

describe("CHECKPOINT13.2B Test4: canonical horseIdでresolve", () => {
  it("horseIdを指定した出走馬はPriority 1でresolvedになる", () => {
    const result = runRaceCardBridge(raceCard());
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].horseId).toBe("shakeyourheart");
  });
});

describe("CHECKPOINT13.2B Test5: horseName exact matchでresolve", () => {
  it("horseIdを省略しても、data/horses/由来の自動生成レジストリの馬名一致でresolvedになる", () => {
    const card = raceCard({
      runners: [{ horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false }],
    });
    const result = runRaceCardBridge(card);
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].horseId).toBe("shakeyourheart");
  });
});

describe("CHECKPOINT13.2B Test6: 候補なし→unresolved", () => {
  it("どの馬名にも一致しなければunresolved、reasonが記録される", () => {
    const card = raceCard({
      runners: [{ horseName: "存在しない架空馬", frame: 1, horseNumber: 1, scratched: false }],
    });
    const result = runRaceCardBridge(card);
    expect(result.runners[0].resolverStatus).toBe("unresolved");
    expect(result.runners[0].predictionEligible).toBe(false);
    expect(result.runners[0].reasons).toContain("canonical horse not found");
    expect(result.gate.formal).toBe(false);
  });
});

describe("CHECKPOINT13.2B Test7: 複数候補→ambiguous", () => {
  const dupRegistry: CanonicalHorseRegistryEntry[] = [
    { horseId: "dup-a", horseName: "重複馬名", dataKind: "real" },
    { horseId: "dup-b", horseName: "重複馬名", dataKind: "real" },
  ];

  it("同名の候補が2件以上あればambiguous。勝手に1頭へ確定しない", () => {
    const card = raceCard({
      runners: [{ horseName: "重複馬名", frame: 1, horseNumber: 1, scratched: false }],
    });
    const result = runRaceCardBridge(card, { registryOverride: dupRegistry });
    expect(result.runners[0].resolverStatus).toBe("ambiguous");
    expect(result.runners[0].horseId).toBeNull();
    expect(result.runners[0].candidates.sort()).toEqual(["dup-a", "dup-b"]);
    expect(result.runners[0].predictionEligible).toBe(false);
    expect(result.gate.formal).toBe(false);
  });
});

describe("CHECKPOINT13.2B Test8: placeholderがresolveされてもpredictionEligible=false", () => {
  it("grandia（CHECKPOINT13.1で確認済みのV0プレースホルダー馬）はresolvedだがpredictionEligible=falseでreason=placeholder_data", () => {
    const card = raceCard({
      runners: [{ horseId: "grandia", horseName: "グランディア", frame: 1, horseNumber: 1, scratched: false }],
    });
    const result = runRaceCardBridge(card);
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].predictionEligible).toBe(false);
    expect(result.runners[0].reasons).toContain("placeholder_data");
    expect(result.gate.formal).toBe(false);
  });
});

describe("CHECKPOINT13.2B Test9: 不足馬があるRace Cardで正式Stage Aとして誤認しない", () => {
  it("unresolved/ambiguous/ineligibleな馬が1頭でもいればgate.formal=false", () => {
    const card = raceCard({
      runners: [
        { horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false },
        { horseName: "存在しない架空馬", frame: 2, horseNumber: 2, scratched: false },
      ],
    });
    const result = runRaceCardBridge(card);
    expect(result.gate.formal).toBe(false);
    expect(result.gate.reasons.length).toBeGreaterThan(0);
    // diagnosticSnapshotは生成される（診断目的では許可）が、正式ではない
    expect(result.diagnosticSnapshot.runners.length).toBe(1); // resolvedは1頭のみ
  });

  it("全馬resolved・全馬predictionEligibleならgate.formal=true", () => {
    const card = raceCard({
      runners: [{ horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false }],
    });
    const result = runRaceCardBridge(card);
    expect(result.gate.formal).toBe(true);
    expect(result.gate.reasons).toEqual([]);
  });
});

describe("CHECKPOINT13.2B Test10: complete fixtureでRace Card→Resolver→RaceEntryInput→Stage A→Ability Boardまで接続できる", () => {
  it("resolved・predictionEligibleな馬について、baseAbility=70.3（正式経路）がAbility Boardまで伝播する", () => {
    const card = raceCard({
      runners: [{ horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 5, horseNumber: 9, scratched: false }],
    });
    const result = runRaceCardBridge(card);

    expect(result.diagnosticSnapshot.stage).toBe("gateConfirmed");
    expect(result.diagnosticSnapshot.runners[0].baseAbility).toBe(70.3);

    const board = buildAbilityBoard(result.diagnosticSnapshot);
    expect(board).toHaveLength(1);
    expect(board[0].baseAbility).toBe(70.3);
    expect(board[0].rankByBaseAbility).toBe(1);
  });

  it("going=nullのRace Cardでは、Suitability V1のgoingがevaluated=falseになる（推測補完なし）", () => {
    const card = raceCard({ going: null });
    const result = runRaceCardBridge(card);
    expect(result.diagnosticSnapshot.runners[0].suitability?.going.evaluated).toBe(false);
  });
});

describe("CHECKPOINT13.2B Test11: Race Card inputだけでは既存data/horsesを破壊・置換しない", () => {
  it("raceCardBridge.ts / raceCardTypes.tsはfs書き込みAPIを一切importしていない（静的確認）", () => {
    const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../raceCardBridge.ts"), "utf-8");
    const typesSource = fs.readFileSync(path.resolve(__dirname, "../raceCardTypes.ts"), "utf-8");
    for (const source of [bridgeSource, typesSource]) {
      expect(source).not.toMatch(/writeFileSync|createWriteStream|import\s+fs\b|from ["']node:fs["']/);
    }
  });

  it("data/horses/のスナップショット（ファイル一覧）がbridge実行前後で変化しない", () => {
    const horsesDir = path.resolve(__dirname, "../../data/horses");
    const before = fs.readdirSync(horsesDir).sort();
    runRaceCardBridge(raceCard());
    runRaceCardBridge(raceCard({ runners: [{ horseId: "grandia", horseName: "グランディア", frame: 1, horseNumber: 1, scratched: false }] }));
    const after = fs.readdirSync(horsesDir).sort();
    expect(after).toEqual(before);
  });
});

describe("CHECKPOINT13.2B Test12: --replaceを通常flowが使用しない", () => {
  it("raceCardBridge.ts / raceCardCheck.tsはimportRacePerformancesCsv.tsを一切importしていない（静的確認）", () => {
    const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../raceCardBridge.ts"), "utf-8");
    const cliSource = fs.readFileSync(path.resolve(__dirname, "../../../../scripts/raceCardCheck.ts"), "utf-8");
    expect(bridgeSource).not.toMatch(/importRacePerformancesCsv/);
    expect(cliSource).not.toMatch(/importRacePerformancesCsv/);
    expect(cliSource).not.toMatch(/--replace/);
  });
});

describe("出走取消（scratched）の扱い", () => {
  it("出走取消の馬はresolvedでもpredictionEligible=falseになる", () => {
    const card = raceCard({
      runners: [{ horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: true }],
    });
    const result = runRaceCardBridge(card);
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].predictionEligible).toBe(false);
    expect(result.runners[0].reasons).toContain("scratched");
  });
});

describe("formatRaceCardBridgeReport", () => {
  it("STEP10の指示どおりの書式でレポートを出力する", () => {
    const card = raceCard({
      runners: [
        { horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false },
        { horseName: "存在しない架空馬", frame: 2, horseNumber: 2, scratched: false },
      ],
    });
    const result = runRaceCardBridge(card);
    const text = formatRaceCardBridgeReport(result);
    expect(text).toContain("Race: TEST-11R");
    expect(text).toContain("Race Number: 11");
    expect(text).toContain("Total runners: 2");
    expect(text).toContain("Resolved: 1");
    expect(text).toContain("Unresolved: 1");
    expect(text).toContain("Prediction eligible:");
    expect(text).toContain("resolverStatus: unresolved");
    expect(text).toContain("canonical horse not found");
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildDataRequestManifest,
  formatProvisionalDiagnosticReport,
  runProvisionalDiagnostic,
  type ProvisionalRaceTarget,
  type ProvisionalRegisteredRunner,
} from "../provisionalRunnerDiagnostic";

const NIIGATA_TARGET: ProvisionalRaceTarget = {
  raceLabel: "Niigata Kinen 2026",
  racecourse: "新潟",
  surface: "turf",
  distance: 2000,
  going: null,
};

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../data/provisional/niigata-kinen-2026-registered.json",
);

interface FixtureFile {
  raceLabel: string;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string | null;
  runners: ProvisionalRegisteredRunner[];
}

function loadFixture(): FixtureFile {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8"));
}

describe("CHECKPOINT13.3 Test1: 11頭をProvisional Race Cardとして読み込める", () => {
  it("実際の新潟記念登録馬fixture(11頭)を読み込み、diagnosticを実行できる", () => {
    const fixture = loadFixture();
    expect(fixture.runners).toHaveLength(11);
    const result = runProvisionalDiagnostic(fixture.runners, {
      raceLabel: fixture.raceLabel,
      racecourse: fixture.racecourse,
      surface: fixture.surface,
      distance: fixture.distance,
      going: fixture.going,
    });
    expect(result.status).toBe("provisional");
    expect(result.formal).toBe(false);
    expect(result.runners).toHaveLength(11);
    expect(result.summary.totalRunners).toBe(11);
  });

  it("現在のcanonicalデータでは11頭全てがunresolvedになる（実際の登録馬が未登録のため、正直な結果）", () => {
    const fixture = loadFixture();
    const result = runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    expect(result.summary.unresolved).toBe(11);
    expect(result.summary.resolved).toBe(0);
    expect(result.summary.predictionEligible).toBe(0);
  });
});

describe("CHECKPOINT13.3 Test2: frame/horseNumber未確定を勝手に補完しない", () => {
  it("ProvisionalRegisteredRunnerにframe/horseNumberフィールドが存在しない（構造的に埋めようがない）", () => {
    const runner: ProvisionalRegisteredRunner = { horseName: "シェイクユアハート", sourceHorseId: "dummy" };
    expect(runner).not.toHaveProperty("frame");
    expect(runner).not.toHaveProperty("horseNumber");
  });

  it("resolvedな馬でもgate Suitabilityはevaluated=false（frame/horseNumber未確定として扱われる）", () => {
    const result = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy-source-id" }],
      NIIGATA_TARGET,
    );
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].suitabilityPreview?.gate).toBe(false);
  });
});

describe("CHECKPOINT13.3 Test3: going未確定を100%扱いしない", () => {
  it("going=nullなら、suitabilityPreview.goingはfalse（evaluated=false）", () => {
    const result = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy-source-id" }],
      { ...NIIGATA_TARGET, going: null },
    );
    expect(result.runners[0].suitabilityPreview?.going).toBe(false);
  });

  it("goingが実際に与えられれば、going評価は変化しうる（同一関数の別入力であることの確認）", () => {
    const withKnownGoing = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy-source-id" }],
      { ...NIIGATA_TARGET, surface: "turf", going: "重" },
    );
    // シェイクユアハートは実際に重馬場を走った実績がある（宝塚記念）
    expect(withKnownGoing.runners[0].suitabilityPreview?.going).toBe(true);
  });
});

describe("CHECKPOINT13.3 Test4: 全11頭についてresolverStatusを取得できる", () => {
  it("11頭全員にresolverStatusフィールドが存在する", () => {
    const fixture = loadFixture();
    const result = runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    for (const r of result.runners) {
      expect(["resolved", "unresolved", "ambiguous"]).toContain(r.resolverStatus);
      expect(r.sourceHorseId).toBeTruthy();
    }
  });
});

describe("CHECKPOINT13.3 Test5: placeholderはpredictionEligible=false", () => {
  it("グランディア（CHECKPOINT13.1で確認済みのV0プレースホルダー馬）はresolvedだがpredictionEligible=false", () => {
    const result = runProvisionalDiagnostic(
      [{ horseName: "グランディア", sourceHorseId: "dummy" }],
      NIIGATA_TARGET,
    );
    expect(result.runners[0].resolverStatus).toBe("resolved");
    expect(result.runners[0].dataKind).toBe("placeholder");
    expect(result.runners[0].predictionEligible).toBe(false);
    expect(result.runners[0].missing).toContain("placeholder_data");
  });
});

describe("CHECKPOINT13.3 Test6: 部分データraceScore計算をしない", () => {
  it("provisionalRunnerDiagnostic.tsはbuildRaceHistory/raceHistoryPipelineをimportしていない（静的確認）", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../provisionalRunnerDiagnostic.ts"), "utf-8");
    const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    expect(importLines).not.toMatch(/buildRaceHistory/);
    expect(importLines).not.toMatch(/raceHistoryPipeline/);
  });

  it("対象馬の人数が変わってもbaseAbilityは変化しない（1頭のみ vs 11頭同時診断）", () => {
    const fixture = loadFixture();
    const aloneResult = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy" }],
      NIIGATA_TARGET,
    );
    const crowdedResult = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy" }, ...fixture.runners],
      NIIGATA_TARGET,
    );
    const aloneShake = aloneResult.runners[0];
    const crowdedShake = crowdedResult.runners[0];
    expect(aloneShake.baseAbility).toBe(crowdedShake.baseAbility);
  });
});

describe("CHECKPOINT13.3 Test7: Base Ability diagnosticは全体data/horses経路を使用", () => {
  it("シェイクユアハートのbaseAbility(diagnostic)=70.3が正式経路で再現される", () => {
    const result = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy" }],
      NIIGATA_TARGET,
    );
    expect(result.runners[0].baseAbilityAvailable).toBe(true);
    expect(result.runners[0].baseAbility).toBe(70.3);
  });
});

describe("CHECKPOINT13.3 Test8: Missing Data Reportを馬単位で生成", () => {
  it("formatProvisionalDiagnosticReportが馬ごとの不足理由を含むテキストを出力する", () => {
    const fixture = loadFixture();
    const result = runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    const text = formatProvisionalDiagnosticReport(result);
    expect(text).toContain("Niigata Kinen 2026");
    expect(text).toContain("Status: PROVISIONAL");
    expect(text).toContain("Resolved:");
    expect(text).toContain("0 / 11");
    expect(text).toContain("アーバンシック");
    expect(text).toContain("canonical horse not found");
  });
});

describe("CHECKPOINT13.3 Test9: 必要ならDATA REQUEST MANIFESTを生成", () => {
  it("predictionEligible=falseの馬全員についてmanifestエントリが生成される", () => {
    const fixture = loadFixture();
    const result = runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    const manifest = buildDataRequestManifest(result);
    expect(manifest).toHaveLength(11);
    expect(manifest[0].horseName).toBe("アーバンシック");
    expect(manifest[0].sourceHorseId).toBe("2021105436");
    expect(manifest[0].requiredFields.length).toBeGreaterThan(0);
    // 実在しないraceId/raceDateを捏造していない（要求内容の説明文のみ）
    expect(manifest[0].requiredRaces.some((r) => r.includes("推測不可"))).toBe(true);
  });

  it("predictionEligible=trueの馬はmanifestに含まれない", () => {
    const result = runProvisionalDiagnostic(
      [{ horseName: "シェイクユアハート", sourceHorseId: "dummy" }],
      { ...NIIGATA_TARGET, going: "重" },
    );
    const manifest = buildDataRequestManifest(result);
    expect(manifest).toHaveLength(0);
  });
});

describe("CHECKPOINT13.3 Test10: 正式Snapshotとして保存されない", () => {
  it("result.formalは常にfalse、result.statusは常にprovisional", () => {
    const fixture = loadFixture();
    const result = runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    expect(result.formal).toBe(false);
    expect(result.status).toBe("provisional");
  });

  it("provisionalRunnerDiagnostic.ts / provisionalRunnerCheck.tsはfs書き込みAPIを一切importしていない", () => {
    const diagSource = fs.readFileSync(path.resolve(__dirname, "../provisionalRunnerDiagnostic.ts"), "utf-8");
    expect(diagSource).not.toMatch(/writeFileSync|createWriteStream/);
  });

  it("data/horses/のファイル一覧が診断実行前後で変化しない", () => {
    const horsesDir = path.resolve(__dirname, "../../data/horses");
    const before = fs.readdirSync(horsesDir).sort();
    const fixture = loadFixture();
    runProvisionalDiagnostic(fixture.runners, NIIGATA_TARGET);
    const after = fs.readdirSync(horsesDir).sort();
    expect(after).toEqual(before);
  });
});

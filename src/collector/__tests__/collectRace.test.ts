import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectRace } from "../collectRace";
import { auditFutureLeakage } from "../leakageGuard";
import { normalizeRaceBundle, validateNormalizedRunners } from "../normalize";
import { DEFAULT_RAW_DIR } from "../providers/manualRawFileProvider";
import type { PriorHistoryEntry, RawRaceBundle } from "../types";
import type { RacePerformance } from "../../ability/types";

const REAL_FIXTURE_RACE_ID = "JRA-20230507-NIIGATA-11";

/** テスト専用の最小RacePerformance fixture（実データではない、Future Leakage Guard単体テスト用） */
function makeFixtureRace(raceId: string, raceDate: string, raceScore: number): RacePerformance {
  return {
    raceId,
    raceName: "テストレース",
    raceDate,
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 70,
    retrospectiveMemberLevelScore: null,
    memberLevelBreakdown: null,
    timeGapScore: 90,
    raceTimeScore: 70,
    raceTimeBreakdown: null,
    final3FScore: 70,
    final3FBreakdown: { relativeScore: 70, absoluteScore: null, blendedScore: 70, reason: "test fixture" } as unknown as RacePerformance["final3FBreakdown"],
    weightScore: 70,
    weightBreakdown: { reason: "test fixture" } as unknown as RacePerformance["weightBreakdown"],
    raceScore,
    dataKind: "real",
  };
}

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("collectRace — 正常取得", () => {
  it("実データfixture（2023新潟大賞典・16頭）を取得し、既存の凍結済みデータと一致する", async () => {
    const cacheDir = makeTmpDir("collector-cache-");
    const result = await collectRace(REAL_FIXTURE_RACE_ID, { cacheDir });

    expect(result.status).toBe("OK");
    expect(result.race?.raceId).toBe(REAL_FIXTURE_RACE_ID);
    expect(result.race?.racecourse).toBe("新潟");
    expect(result.race?.surface).toBe("turf");
    expect(result.race?.distance).toBe(2000);
    expect(result.runners).toHaveLength(16);

    // 既存の凍結済みデータ（src/ability/data/gateValidation/）と突合
    const frozenRows = (
      await import("../../ability/data/gateValidation/niigataTurf2000GateHistoryV1.json")
    ).default.filter((r: { raceId: string }) => r.raceId === REAL_FIXTURE_RACE_ID);

    expect(result.runners.length).toBe(frozenRows.length);
    const frozenByHorseId = new Map(frozenRows.map((r: { horseId: string }) => [r.horseId, r]));
    for (const runner of result.runners) {
      const frozen = frozenByHorseId.get(runner.horseId) as
        | { finishPosition: number; carriedWeightKg: number; actualRaceTimeSeconds: number }
        | undefined;
      expect(frozen).toBeDefined();
      expect(runner.finishPosition).toBe(frozen!.finishPosition);
      expect(runner.carriedWeightKg).toBe(frozen!.carriedWeightKg);
      expect(runner.actualRaceTimeSeconds).toBe(frozen!.actualRaceTimeSeconds);
    }
  });

  it("raw fileが存在しないraceIdはFAILし、data source not foundを報告する（推測で埋めない）", async () => {
    const cacheDir = makeTmpDir("collector-cache-");
    const result = await collectRace("JRA-NONEXISTENT-RACE-99", { cacheDir });
    expect(result.status).toBe("FAIL");
    expect(result.failureReason).toBe("RAW_DATA_NOT_FOUND");
    expect(result.runners).toHaveLength(0);
  });
});

describe("Future Leakage Guard — FAIL（warningではない）", () => {
  it("対象レースの日付以降のprior historyが1件でもあればok:falseを返す", () => {
    const priorHistories: PriorHistoryEntry[] = [
      {
        horseId: "TESTHORSE1",
        status: "available",
        races: [
          makeFixtureRace("PAST-RACE", "2023-01-01", 70),
          makeFixtureRace("FUTURE-RACE", "2023-06-01", 80), // targetより後
        ],
        provenance: {
          source: "test",
          sourceIdentifier: "TESTHORSE1",
          targetRaceId: "TARGET",
          retrievedAt: new Date().toISOString(),
          targetAsOf: "2023-05-07",
          method: "production_history_reference",
          collectorVersion: "test",
        },
      },
    ];

    const result = auditFutureLeakage("2023-05-07", priorHistories);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].raceId).toBe("FUTURE-RACE");
  });

  it("対象レースと同日のprior historyも未来として扱いFAILする（>=判定）", () => {
    const priorHistories: PriorHistoryEntry[] = [
      {
        horseId: "TESTHORSE2",
        status: "available",
        races: [makeFixtureRace("SAME-DAY-RACE", "2023-05-07", 75)],
        provenance: {
          source: "test",
          sourceIdentifier: "TESTHORSE2",
          targetRaceId: "TARGET",
          retrievedAt: new Date().toISOString(),
          targetAsOf: "2023-05-07",
          method: "production_history_reference",
          collectorVersion: "test",
        },
      },
    ];
    const result = auditFutureLeakage("2023-05-07", priorHistories);
    expect(result.ok).toBe(false);
  });

  it("すべて対象レースより前ならok:trueを返す", () => {
    const priorHistories: PriorHistoryEntry[] = [
      {
        horseId: "TESTHORSE3",
        status: "available",
        races: [makeFixtureRace("PAST-RACE", "2023-01-01", 70)],
        provenance: {
          source: "test",
          sourceIdentifier: "TESTHORSE3",
          targetRaceId: "TARGET",
          retrievedAt: new Date().toISOString(),
          targetAsOf: "2023-05-07",
          method: "production_history_reference",
          collectorVersion: "test",
        },
      },
    ];
    const result = auditFutureLeakage("2023-05-07", priorHistories);
    expect(result.ok).toBe(true);
    expect(result.checkedRowCount).toBe(1);
  });
});

describe("collectRace — Missing Data（推測で埋めない）", () => {
  it("production側に実データが無い馬はstatus:unavailableとして明示され、0や平均で埋められない", async () => {
    const cacheDir = makeTmpDir("collector-cache-");
    const result = await collectRace(REAL_FIXTURE_RACE_ID, { cacheDir });
    expect(result.status).toBe("OK");

    // このfixtureの出走馬は、production data/horses/側にほぼ実データが無いことを
    // Phase 1監査（docs/gate30-phase1-basic-data-completion-audit.md）で確認済み
    // （Ability Controlled 10/153, 6.5%）。unavailableのraces配列は空でなければならない。
    const unavailableEntries = result.priorHistories.filter((p) => p.status === "unavailable");
    for (const entry of unavailableEntries) {
      expect(entry.races).toHaveLength(0);
    }
    // status全体がavailable/unavailableのいずれかのみで、nullや推測値の混入が無いこと
    for (const entry of result.priorHistories) {
      expect(["available", "unavailable"]).toContain(entry.status);
    }
  });
});

describe("collectRace — Idempotency / 重複防止", () => {
  it("同じraceIdを2回実行しても、キャッシュファイルが1つのままで内容も変わらない", async () => {
    const cacheDir = makeTmpDir("collector-cache-");
    const first = await collectRace(REAL_FIXTURE_RACE_ID, { cacheDir });
    expect(first.status).toBe("OK");
    expect(first.cache.wasCached).toBe(false);

    const filesAfterFirst = fs.readdirSync(cacheDir);
    expect(filesAfterFirst).toHaveLength(1);

    const second = await collectRace(REAL_FIXTURE_RACE_ID, { cacheDir });
    expect(second.status).toBe("OK");
    expect(second.cache.wasCached).toBe(true); // 内容が同一なので書き込みスキップ

    const filesAfterSecond = fs.readdirSync(cacheDir);
    expect(filesAfterSecond).toHaveLength(1); // 重複ファイルが増えていない

    // normalized結果は決定的（同じ入力から同じ出力）
    expect(second.runners).toEqual(first.runners);
  });
});

describe("normalizeRaceBundle / validateNormalizedRunners — 正規化とバリデーション", () => {
  const baseBundle: RawRaceBundle = {
    raceId: "TEST-NORMALIZE-01",
    raceDate: "2026-01-01",
    racecourse: "新潟",
    raceNumber: 11,
    raceName: "テストレース",
    surface: "turf",
    distance: 2000,
    going: "良",
    courseLayout: "outer",
    courseVariant: null,
    runners: [
      {
        horseId: "H1",
        horseName: "馬A",
        horseNumber: 1,
        gate: 1,
        finishPosition: 1,
        carriedWeightKg: 56,
        actualRaceTimeSeconds: 120,
        final3FSeconds: 34,
        timeGapSeconds: 0,
        fieldSize: 2,
        passingPosition: "1-1",
        source: "test",
        sourceRaceId: "src1",
        sourceHorseId: "H1",
      },
      {
        horseId: "H2",
        horseName: "馬B",
        horseNumber: 2,
        gate: 2,
        finishPosition: 2,
        carriedWeightKg: 57,
        actualRaceTimeSeconds: 120.5,
        final3FSeconds: 34.5,
        timeGapSeconds: 0.5,
        fieldSize: 2,
        passingPosition: "2-2",
        source: "test",
        sourceRaceId: "src1",
        sourceHorseId: "H2",
      },
    ],
    provenance: {
      source: "test",
      sourceIdentifier: "test",
      targetRaceId: "TEST-NORMALIZE-01",
      retrievedAt: new Date().toISOString(),
      targetAsOf: "2026-01-01",
      method: "manual_raw_file",
      collectorVersion: "test",
    },
  };

  it("正常なbundleは全項目を既存Gate Race CSV契約と同一の項目名で正規化する", () => {
    const rows = normalizeRaceBundle(baseBundle);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      raceId: "TEST-NORMALIZE-01",
      racecourse: "新潟",
      surface: "turf",
      distance: 2000,
      horseId: "H1",
      finishPosition: 1,
    });
    const validation = validateNormalizedRunners(rows);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("horseId重複はエラーとして検出される", () => {
    const dupBundle: RawRaceBundle = {
      ...baseBundle,
      runners: [baseBundle.runners[0], { ...baseBundle.runners[1], horseId: "H1" }],
    };
    const rows = normalizeRaceBundle(dupBundle);
    const validation = validateNormalizedRunners(rows);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes("horseId"))).toBe(true);
  });

  it("horseNumber重複はエラーとして検出される", () => {
    const dupBundle: RawRaceBundle = {
      ...baseBundle,
      runners: [baseBundle.runners[0], { ...baseBundle.runners[1], horseId: "H3", horseNumber: 1 }],
    };
    const rows = normalizeRaceBundle(dupBundle);
    const validation = validateNormalizedRunners(rows);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.includes("horseNumber"))).toBe(true);
  });

  it("finishPosition欠損はwarningとして検出される（エラーではない）", () => {
    const missingBundle: RawRaceBundle = {
      ...baseBundle,
      runners: [{ ...baseBundle.runners[0], finishPosition: null }, baseBundle.runners[1]],
    };
    const rows = normalizeRaceBundle(missingBundle);
    const validation = validateNormalizedRunners(rows);
    expect(validation.ok).toBe(true);
    expect(validation.warnings.some((w) => w.includes("finishPosition"))).toBe(true);
  });
});

describe("Source Provenance", () => {
  it("収集結果の各データにsource/sourceIdentifier/targetRaceId/retrievedAt/method/collectorVersionが揃っている", async () => {
    const cacheDir = makeTmpDir("collector-cache-");
    const result = await collectRace(REAL_FIXTURE_RACE_ID, { cacheDir });
    expect(result.status).toBe("OK");
    expect(result.provenance.length).toBeGreaterThan(0);
    for (const p of result.provenance) {
      expect(p.source).toBeTruthy();
      expect(p.targetRaceId).toBe(REAL_FIXTURE_RACE_ID);
      expect(p.retrievedAt).toBeTruthy();
      expect(p.method).toMatch(/manual_raw_file|production_history_reference/);
      expect(p.collectorVersion).toBeTruthy();
    }
  });
});

describe("ManualRawFileProvider default path", () => {
  it("DEFAULT_RAW_DIRにfixtureファイルが実在する", () => {
    expect(fs.existsSync(path.join(DEFAULT_RAW_DIR, `${REAL_FIXTURE_RACE_ID}.json`))).toBe(true);
  });
});

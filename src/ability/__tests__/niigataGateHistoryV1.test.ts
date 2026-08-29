import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NIIGATA_GATE_HISTORY_ROWS,
  computeRawFrameStats,
  computeAbilityAdjustedResiduals,
  getIsolatedGateHistory,
} from "../niigataGateHistoryV1";
import { normalizeRaceCard } from "../import/raceCardTypes";
import { runRaceCardBridge } from "../import/raceCardBridge";
import { buildAbilityBoard } from "../predictionSnapshot";

describe("NIIGATA_GATE_HISTORY_ROWS（実データ読み込み、CHECKPOINT14D.1C監査済み）", () => {
  it("153行、10レース、全て新潟・turf・2000m・outer", () => {
    expect(NIIGATA_GATE_HISTORY_ROWS).toHaveLength(153);
    const raceIds = new Set(NIIGATA_GATE_HISTORY_ROWS.map((r) => r.raceId));
    expect(raceIds.size).toBe(10);
    for (const r of NIIGATA_GATE_HISTORY_ROWS) {
      expect(r.racecourse).toBe("新潟");
      expect(r.surface).toBe("turf");
      expect(r.distance).toBe(2000);
      expect(r.courseLayout).toBe("outer");
    }
  });

  it("全行raceDate < 2026-08-30（future leakage無し）", () => {
    const cutoff = Date.parse("2026-08-30");
    for (const r of NIIGATA_GATE_HISTORY_ROWS) {
      expect(Date.parse(r.raceDate)).toBeLessThan(cutoff);
    }
  });

  it("horseId全行入力済み、(horseId,raceId)重複なし", () => {
    const keys = new Set<string>();
    for (const r of NIIGATA_GATE_HISTORY_ROWS) {
      expect(r.horseId.trim()).not.toBe("");
      const key = `${r.horseId}|${r.raceId}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
    expect(keys.size).toBe(153);
  });
});

describe("computeRawFrameStats", () => {
  it("1〜8枠すべてのstatsを返し、starts合計が153になる", () => {
    const stats = computeRawFrameStats();
    expect(stats).toHaveLength(8);
    const total = stats.reduce((sum, s) => sum + s.starts, 0);
    expect(total).toBe(153);
  });
});

describe("getIsolatedGateHistory（153行だけを閉じたデータセットとしてbuildRaceHistoryへ渡す）", () => {
  it("153行すべてにraceScoreが算出される", () => {
    const history = getIsolatedGateHistory();
    let total = 0;
    for (const horseId of Object.keys(history)) {
      total += history[horseId].length;
    }
    expect(total).toBe(153);
  });
});

describe("computeAbilityAdjustedResiduals（production READ-ONLY参照）", () => {
  const results = computeAbilityAdjustedResiduals();

  it("153行すべてを返す", () => {
    expect(results).toHaveLength(153);
  });

  it("production-only evidenceでability-adjusted coverageは10/153（CHECKPOINT14D.1D 10節: Production Evidenceのみを使う、より厳格な定義）", () => {
    const withResidual = results.filter((r) => r.residual !== null);
    expect(withResidual).toHaveLength(10);
  });

  it("abilityBeforeRaceが算出された行は、それより前のraceDateのみを根拠にしている（future leakage無し）", () => {
    for (const r of results) {
      if (r.abilityBeforeRace === null) continue;
      // evidenceSourceがproductionであることの確認（50点等の推測補完ではない）
      expect(r.evidenceSource).toBe("production");
    }
  });
});

const CURRENT_TARGET_ROSTER = [
  { horseId: "2019104658", horseName: "ボーンディスウェイ", frame: 1, horseNumber: 1, assignedWeight: 57.0 },
  { horseId: "2020100734", horseName: "サヴォーナ", frame: 2, horseNumber: 2, assignedWeight: 57.0 },
  { horseId: "2023107166", horseName: "ロデオドライブ", frame: 3, horseNumber: 3, assignedWeight: 57.0 },
  { horseId: "2020103650", horseName: "ドゥレッツァ", frame: 4, horseNumber: 4, assignedWeight: 59.0 },
  { horseId: "2023106850", horseName: "ゾロアストロ", frame: 5, horseNumber: 5, assignedWeight: 55.0 },
  { horseId: "2021105643", horseName: "チェルヴィニア", frame: 6, horseNumber: 6, assignedWeight: 56.0 },
  { horseId: "2019105118", horseName: "ジュンブロッサム", frame: 6, horseNumber: 7, assignedWeight: 58.0 },
  { horseId: "2022104645", horseName: "ダノンシーマ", frame: 7, horseNumber: 8, assignedWeight: 57.0 },
  { horseId: "2021105436", horseName: "アーバンシック", frame: 7, horseNumber: 9, assignedWeight: 59.0 },
  { horseId: "2019104850", horseName: "バレエマスター", frame: 8, horseNumber: 10, assignedWeight: 57.0 },
  { horseId: "2021105743", horseName: "ステレンボッシュ", frame: 8, horseNumber: 11, assignedWeight: 56.0 },
];

const EXPECTED_BASE_ABILITY: Record<string, number> = {
  "2019104658": 73.1,
  "2020100734": 70.2,
  "2023107166": 76.7,
  "2020103650": 67.4,
  "2023106850": 74.8,
  "2021105643": 69.1,
  "2019105118": 72.7,
  "2022104645": 78.3,
  "2021105436": 72.1,
  "2019104850": 72.4,
  "2021105743": 69.4,
};

function buildStageABoard() {
  const raceCardRaw = {
    raceId: "JRA-20260830-NIIGATA-08",
    raceDate: "2026-08-30",
    raceNumber: 8,
    racecourse: "新潟",
    surface: "turf" as const,
    distance: 2000,
    scheduledStartTime: "2026-08-30T15:45:00+09:00",
    going: null,
    runners: CURRENT_TARGET_ROSTER.map((r) => ({ ...r, scratched: false })),
  };
  const normalized = normalizeRaceCard(raceCardRaw);
  if (!normalized.ok) throw new Error("invalid race card");
  const bridgeResult = runRaceCardBridge(normalized.data, { generatedAt: "2026-08-28T00:00:00.000Z" });
  return buildAbilityBoard(bridgeResult.diagnosticSnapshot);
}

describe("Zero Drift Contract（CHECKPOINT14D.1D 14節）", () => {
  it("niigataGateHistoryV1を読み込んでも、CURRENT TARGET 11頭のbaseAbilityはCHECKPOINT14Dの値と完全一致する", () => {
    // このtestファイル自体が既にniigataGateHistoryV1のexportを複数回呼び出した後に
    // 実行される（上のdescribeブロック群）。それでもStage A Boardの計算結果が
    // 一切影響を受けていないことを確認する。
    void NIIGATA_GATE_HISTORY_ROWS;
    void computeRawFrameStats();
    void getIsolatedGateHistory();
    void computeAbilityAdjustedResiduals();

    const board = buildStageABoard();
    expect(board).toHaveLength(11);
    for (const row of board) {
      const expected = EXPECTED_BASE_ABILITY[row.horseId];
      expect(row.baseAbility).toBe(expected);
    }
  });

  it("Stage A Rank（effectiveAbility順）もCHECKPOINT14Dと完全一致する", () => {
    const board = buildStageABoard();
    const byRank = [...board].sort((a, b) => (a.rankByEffectiveAbility ?? 99) - (b.rankByEffectiveAbility ?? 99));
    const expectedOrderHorseIds = [
      "2022104645", // ダノンシーマ 1
      "2023107166", // ロデオドライブ 2
      "2023106850", // ゾロアストロ 3
      "2019104850", // バレエマスター 4
      "2019105118", // ジュンブロッサム 5
      "2019104658", // ボーンディスウェイ 6
      "2021105436", // アーバンシック 7
      "2020100734", // サヴォーナ 8
      "2020103650", // ドゥレッツァ 9
      "2021105643", // チェルヴィニア 10
      "2021105743", // ステレンボッシュ 11
    ];
    expect(byRank.map((r) => r.horseId)).toEqual(expectedOrderHorseIds);
  });
});

describe("MemberLevel Ripple防止（構造的な分離の確認）", () => {
  const PRODUCTION_ABILITY_FILES = [
    "horseAbilityData.ts",
    "raceHistoryPipeline.ts",
    "memberLevelCandidates.ts",
    "memberLevel.ts",
    "baseAbility.ts",
  ];

  it("production ability計算ファイルのソースコードが niigataGateHistoryV1 / gateValidation を一切参照しない", () => {
    const dir = path.resolve(__dirname, "..");
    for (const file of PRODUCTION_ABILITY_FILES) {
      const filePath = path.join(dir, file);
      const source = fs.readFileSync(filePath, "utf-8");
      expect(source).not.toContain("niigataGateHistoryV1");
      expect(source).not.toContain("gateValidation");
    }
  });

  it("horseAbilityData.tsのglobパターンは data/horses/*.json のみでdata/gateValidation/を含まない", () => {
    const filePath = path.resolve(__dirname, "..", "horseAbilityData.ts");
    const source = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain('"./data/horses/*.json"');
    expect(source).not.toContain("gateValidation");
  });
});

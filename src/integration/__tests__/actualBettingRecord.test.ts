import { describe, expect, it } from "vitest";
import {
  buildActualBettingRecord,
  deserializeActualBettingRecord,
  serializeActualBettingRecord,
  validateActualBettingRecord,
  type BuildActualBettingRecordInput,
} from "../actualBettingRecord";
import type { BetEntry } from "../betTypes";

function baseInput(overrides: Partial<BuildActualBettingRecordInput> = {}): BuildActualBettingRecordInput {
  const bets: BetEntry[] = overrides.bets ?? [
    { betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 1200 },
    {
      betType: "QUINELLA",
      selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }],
      stake: 400,
    },
  ];
  return {
    raceId: "JRA-TEST-RACE-01",
    predictionArtifactId: "prediction-artifact-001",
    betProposalArtifactId: "bet-proposal-001",
    strategyVersion: "KOHEI_V1",
    purchasedAt: "2026-09-13T10:50:00+09:00",
    recordedAt: "2026-09-13T11:30:00+09:00",
    bets,
    totalStake: overrides.totalStake ?? bets.reduce((sum, b) => sum + b.stake, 0),
    sourceType: "USER_CONFIRMED",
    sourceProvenance: "ユーザーが購入直後に自己申告",
    ...overrides,
  };
}

describe("ActualBettingRecord（Post-Race Pipeline V1・Phase 2）", () => {
  it("B. 正常にActual Betting Recordを構築できる", () => {
    const artifact = buildActualBettingRecord(baseInput());
    expect(artifact.artifactType).toBe("ACTUAL_BET");
    expect(artifact.recordType).toBe("ACTUAL");
    expect(artifact.bets).toHaveLength(2);
  });

  it("C. purchasedAt=nullでも正常に構築できる（ユーザーが購入時刻を正確に覚えていない場合）", () => {
    const artifact = buildActualBettingRecord(baseInput({ purchasedAt: null }));
    expect(artifact.purchasedAt).toBeNull();
    expect(artifact.recordedAt).toBe("2026-09-13T11:30:00+09:00");
  });

  it("D. recordedAtは必須（欠損/不正フォーマットは拒否）", () => {
    expect(() => buildActualBettingRecord(baseInput({ recordedAt: "" }))).toThrow();
    expect(() => buildActualBettingRecord(baseInput({ recordedAt: "2026-09-13" }))).toThrow();
  });

  it("recordedAtとpurchasedAtを混同しない（別々の値として保存される）", () => {
    const artifact = buildActualBettingRecord(baseInput({
      purchasedAt: "2026-09-13T10:50:00+09:00",
      recordedAt: "2026-09-14T09:00:00+09:00",
    }));
    expect(artifact.purchasedAt).not.toBe(artifact.recordedAt);
  });

  it("E. sourceTypeが未知の値なら拒否する", () => {
    expect(() => buildActualBettingRecord(baseInput({
      // @ts-expect-error 意図的に不正な値を渡す
      sourceType: "AI_PROPOSAL_ONLY",
    }))).toThrow(/sourceType/);
  });

  it("E. sourceProvenanceが空なら拒否する（単なるAI提案を実購入と認定しない）", () => {
    expect(() => buildActualBettingRecord(baseInput({ sourceProvenance: "" }))).toThrow(/sourceProvenance/);
  });

  it("F. canonicalHorseId欠損は拒否する", () => {
    expect(() => buildActualBettingRecord(baseInput({
      bets: [{ betType: "WIN", selection: [{ canonicalHorseId: "", role: "ANY" }], stake: 100 }],
      totalStake: 100,
    }))).toThrow(/canonicalHorseId/);
  });

  it("G. 同一bet内canonicalHorseId重複は拒否する", () => {
    expect(() => buildActualBettingRecord(baseInput({
      bets: [{
        betType: "QUINELLA",
        selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h6", role: "ANY" }],
        stake: 500,
      }],
      totalStake: 500,
    }))).toThrow(/重複/);
  });

  it("J. stake<=0は拒否する", () => {
    expect(() => buildActualBettingRecord(baseInput({
      bets: [{ betType: "WIN", selection: [{ canonicalHorseId: "h6", role: "ANY" }], stake: 0 }],
      totalStake: 0,
    }))).toThrow();
  });

  it("K. totalStakeがbetsの合計と不一致なら拒否する", () => {
    expect(() => buildActualBettingRecord(baseInput({ totalStake: 9999 }))).toThrow(/totalStake/);
  });

  it("M. betProposalArtifactId=nullでも正常に構築できる（独自判断購入・提案保存前の購入等）", () => {
    const artifact = buildActualBettingRecord(baseInput({
      betProposalArtifactId: null, predictionArtifactId: null,
    }));
    expect(artifact.betProposalArtifactId).toBeNull();
    expect(artifact.predictionArtifactId).toBeNull();
  });

  it("L. Bet Proposalと内容が異なっていても正常に構築できる（提案と実購入の差を保持する）", () => {
    // 提案: 馬連6-9 500円 / 馬連6-10 400円。実購入: 馬連6-9 400円 / 馬連6-10 500円（今回のケース）。
    const proposalShape: BetEntry[] = [
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 500 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h10", role: "ANY" }], stake: 400 },
    ];
    const actualShape: BetEntry[] = [
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 400 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h10", role: "ANY" }], stake: 500 },
    ];
    expect(proposalShape).not.toEqual(actualShape);
    const artifact = buildActualBettingRecord(baseInput({ bets: actualShape, totalStake: 900 }));
    expect(artifact.bets[0].stake).toBe(400);
    expect(artifact.bets[1].stake).toBe(500);
  });

  it("JSON serialize/deserializeで内容が一致し、fingerprint/artifactIdの整合も検証する", () => {
    const artifact = buildActualBettingRecord(baseInput());
    const serialized = serializeActualBettingRecord(artifact);
    expect(deserializeActualBettingRecord(serialized)).toEqual(artifact);
  });

  it("改変されたJSON（fingerprint不一致）はdeserializeで拒否する", () => {
    const artifact = buildActualBettingRecord(baseInput());
    // 構造的validation（totalStake/bets合計一致等）を通過しつつ、内容だけが改変された
    // ケースを再現する（sourceProvenanceの書き換えは構造validationの対象外）。
    const tampered = { ...artifact, sourceProvenance: "改ざんされた記述" };
    expect(() => deserializeActualBettingRecord(JSON.stringify(tampered))).toThrow(/fingerprint/);
  });

  it("validateActualBettingRecordは単体でも呼び出せる", () => {
    expect(() => validateActualBettingRecord(baseInput())).not.toThrow();
  });

  it("払戻・的中フィールドは一切保存しない（型に存在しないことの確認）", () => {
    const artifact = buildActualBettingRecord(baseInput());
    expect(artifact).not.toHaveProperty("payout");
    expect(artifact).not.toHaveProperty("hit");
    expect(artifact).not.toHaveProperty("returnRate");
  });
});

describe("Q. セントライト記念2026 実購入fixture（テスト専用・Production保存はしない）", () => {
  it("3,000円・単勝1点＋馬連4点の実購入記録を正常に構築できる", () => {
    // 実際のsavoiaFaireのcanonicalHorseIdは未確認のため、テスト専用の仮ID（実名はaudit用途のみ）を使う。
    const bets: BetEntry[] = [
      { betType: "WIN", selection: [{ canonicalHorseId: "h6-savoiafaire", role: "ANY", horseNumber: 6, horseName: "サヴォアフェール" }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h2", role: "ANY", horseNumber: 2 }, { canonicalHorseId: "h6-savoiafaire", role: "ANY", horseNumber: 6 }], stake: 500 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6-savoiafaire", role: "ANY", horseNumber: 6 }, { canonicalHorseId: "h8", role: "ANY", horseNumber: 8 }], stake: 400 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6-savoiafaire", role: "ANY", horseNumber: 6 }, { canonicalHorseId: "h9", role: "ANY", horseNumber: 9 }], stake: 400 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6-savoiafaire", role: "ANY", horseNumber: 6 }, { canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }], stake: 500 },
    ];
    const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
    expect(totalStake).toBe(3000);

    const artifact = buildActualBettingRecord({
      raceId: "JRA-20260913-NAKAYAMA-11",
      predictionArtifactId: null,
      betProposalArtifactId: null,
      strategyVersion: "KOHEI_V1",
      purchasedAt: null,
      recordedAt: "2026-09-14T00:00:00+09:00",
      bets,
      totalStake,
      sourceType: "USER_CONFIRMED",
      sourceProvenance:
        "test-fixture（実在の購入証跡未添付・PROVISIONAL_NOT_FROZENプランとは異なる実購入内容としてユーザーが申告）",
    });

    expect(artifact.raceId).toBe("JRA-20260913-NAKAYAMA-11");
    expect(artifact.totalStake).toBe(3000);
    expect(artifact.bets).toHaveLength(5);
    // 既存PROVISIONAL_NOT_FROZENプラン（馬連6-9 500円/馬連6-10 400円）とは異なることを明示的に確認する。
    const q69 = artifact.bets.find((b) =>
      b.betType === "QUINELLA" && b.selection.some((s) => s.canonicalHorseId === "h9"));
    const q610 = artifact.bets.find((b) =>
      b.betType === "QUINELLA" && b.selection.some((s) => s.canonicalHorseId === "h10"));
    expect(q69?.stake).toBe(400);
    expect(q610?.stake).toBe(500);
  });
});

describe("R. チャレンジカップ2026 実購入fixture（schema表現可能性のみ確認・Production保存はしない）", () => {
  it("3,000円・単勝1点＋馬連4点をschema上で表現できる", () => {
    const bets: BetEntry[] = [
      { betType: "WIN", selection: [{ canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }], stake: 1200 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h1", role: "ANY", horseNumber: 1 }, { canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }], stake: 300 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h4", role: "ANY", horseNumber: 4 }, { canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }], stake: 500 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }, { canonicalHorseId: "h11", role: "ANY", horseNumber: 11 }], stake: 600 },
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h10", role: "ANY", horseNumber: 10 }, { canonicalHorseId: "h15", role: "ANY", horseNumber: 15 }], stake: 400 },
    ];
    const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
    expect(totalStake).toBe(3000);

    const artifact = buildActualBettingRecord({
      raceId: "JRA-20260912-HANSHIN-11",
      predictionArtifactId: null,
      betProposalArtifactId: null,
      strategyVersion: "KOHEI_V1",
      purchasedAt: null,
      recordedAt: "2026-09-14T00:00:00+09:00",
      bets,
      totalStake,
      sourceType: "USER_CONFIRMED",
      sourceProvenance: "test-fixture（schema表現可能性の確認のみ。Production Artifactとしては保存しない）",
    });

    expect(artifact.raceId).toBe("JRA-20260912-HANSHIN-11");
    expect(artifact.totalStake).toBe(3000);
    expect(artifact.bets).toHaveLength(5);
  });
});

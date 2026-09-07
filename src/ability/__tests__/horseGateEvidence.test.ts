import { describe, expect, it } from "vitest";
import { ALL_GATE_VALIDATION_ROWS, findRepeatedHorses } from "../gateValidationV1";
import { collectHorseGateEvidence, type HorseEvidenceSourceRace } from "../horseGateEvidence";

/** テスト用の最小フィクスチャ。collectHorseGateEvidenceが読まないフィールドは持たせない */
function race(overrides: Partial<HorseEvidenceSourceRace> & Pick<HorseEvidenceSourceRace, "raceId">): HorseEvidenceSourceRace {
  return {
    raceId: overrides.raceId,
    raceDate: overrides.raceDate ?? "2025-01-01",
    racecourse: overrides.racecourse ?? "東京",
    surface: overrides.surface ?? "dirt",
    distance: overrides.distance ?? 1600,
    gate: overrides.gate ?? null,
    horseNumber: overrides.horseNumber ?? null,
    fieldSize: overrides.fieldSize ?? null,
    finishPosition: overrides.finishPosition ?? 5,
  };
}

const TOKYO_DIRT_1600 = { racecourse: "東京", surface: "dirt" as const, distance: 1600 };

describe("collectHorseGateEvidence（STEP8: 8シナリオ回帰テスト）", () => {
  it("(1) frame/horseNumber/fieldSizeが揃っている場合、relativeGatePositionを計算する", () => {
    const history = [race({ raceId: "r1", gate: 3, horseNumber: 5, fieldSize: 16, finishPosition: 2 })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(1);
    expect(evidence.runs[0]).toEqual({
      raceId: "r1",
      raceDate: "2025-01-01",
      frame: 3,
      horseNumber: 5,
      fieldSize: 16,
      relativeGatePosition: (5 - 1) / (16 - 1),
      finishPosition: 2,
    });
  });

  it("(2) frame/horseNumber/fieldSizeが全てnullの場合、推測せず全てnullのまま返す", () => {
    const history = [race({ raceId: "r1", gate: null, horseNumber: null, fieldSize: null })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(1);
    expect(evidence.runs[0].frame).toBeNull();
    expect(evidence.runs[0].horseNumber).toBeNull();
    expect(evidence.runs[0].fieldSize).toBeNull();
    expect(evidence.runs[0].relativeGatePosition).toBeNull();
  });

  it("(3) 一部のみnullの場合（horseNumberのみ不明）、relativeGatePositionは推測せずnull", () => {
    const history = [race({ raceId: "r1", gate: 4, horseNumber: null, fieldSize: 16 })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.runs[0].frame).toBe(4);
    expect(evidence.runs[0].horseNumber).toBeNull();
    expect(evidence.runs[0].fieldSize).toBe(16);
    expect(evidence.runs[0].relativeGatePosition).toBeNull();
  });

  it("(4) horseNumber > fieldSize（除外馬がいたレース等）の場合、relativeGatePositionはnull", () => {
    const history = [race({ raceId: "r1", gate: 8, horseNumber: 18, fieldSize: 16 })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.runs[0].horseNumber).toBe(18);
    expect(evidence.runs[0].fieldSize).toBe(16);
    expect(evidence.runs[0].relativeGatePosition).toBeNull();
  });

  it("(5) fieldSize=1の場合、relativeGatePositionはnull（0除算を避ける）", () => {
    const history = [race({ raceId: "r1", gate: 1, horseNumber: 1, fieldSize: 1 })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.runs[0].relativeGatePosition).toBeNull();
  });

  it("(6) 同一馬の複数走を正しくsampleCount/runsへ集計する（日付昇順に並ぶ）", () => {
    const history = [
      race({ raceId: "r3", raceDate: "2025-03-01", horseNumber: 3, fieldSize: 14 }),
      race({ raceId: "r1", raceDate: "2025-01-01", horseNumber: 1, fieldSize: 14 }),
      race({ raceId: "r2", raceDate: "2025-02-01", horseNumber: 2, fieldSize: 14 }),
    ];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(3);
    expect(evidence.runs.map((r) => r.raceId)).toEqual(["r1", "r2", "r3"]);
  });

  it("(7) 異なるコース条件が混在する場合、targetConditionに一致する走だけを抽出する", () => {
    const history = [
      race({ raceId: "tokyo1600", racecourse: "東京", surface: "dirt", distance: 1600 }),
      race({ raceId: "tokyo1400", racecourse: "東京", surface: "dirt", distance: 1400 }),
      race({ raceId: "hanshin1600", racecourse: "阪神", surface: "dirt", distance: 1600 }),
      race({ raceId: "tokyoTurf1600", racecourse: "東京", surface: "turf", distance: 1600 }),
    ];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(1);
    expect(evidence.runs[0].raceId).toBe("tokyo1600");
    // STEP7の素材カウントは条件ごとに正しく部分一致する
    expect(evidence.factCounts.sameCourseCount).toBe(3); // 東京: tokyo1600/tokyo1400/tokyoTurf1600
    expect(evidence.factCounts.sameDistanceCount).toBe(3); // 1600m: tokyo1600/hanshin1600/tokyoTurf1600
    expect(evidence.factCounts.sameSurfaceCount).toBe(3); // dirt: tokyo1600/tokyo1400/hanshin1600
    expect(evidence.factCounts.sameCourseDistanceCount).toBe(2); // 東京×1600m: tokyo1600/tokyoTurf1600
  });

  it("(8) 旧形式JSON相当（gate/horseNumber/fieldSizeフィールドが存在しないundefined）でも安全に動作する", () => {
    const legacyRace: HorseEvidenceSourceRace = {
      raceId: "legacy1",
      raceDate: "2020-01-01",
      racecourse: "東京",
      surface: "dirt",
      distance: 1600,
      finishPosition: 4,
      // gate/horseNumber/fieldSizeを意図的に省略（旧形式JSONではundefined相当）
    } as HorseEvidenceSourceRace;
    const evidence = collectHorseGateEvidence("h1", [legacyRace], TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(1);
    expect(evidence.runs[0].frame).toBeNull();
    expect(evidence.runs[0].horseNumber).toBeNull();
    expect(evidence.runs[0].fieldSize).toBeNull();
    expect(evidence.runs[0].relativeGatePosition).toBeNull();
  });

  it("該当走が0件の場合、sampleCount=0・runs=[]を返す（推測で埋めない）", () => {
    const evidence = collectHorseGateEvidence("h1", [], TOKYO_DIRT_1600);
    expect(evidence.sampleCount).toBe(0);
    expect(evidence.runs).toEqual([]);
    expect(evidence.factCounts).toEqual({
      sameCourseCount: 0,
      sameDistanceCount: 0,
      sameSurfaceCount: 0,
      sameCourseDistanceCount: 0,
    });
  });

  it("CoursePrior（gateBiasLevel/gateCoefficient）を一切参照・混入しない", () => {
    const history = [race({ raceId: "r1", gate: 8, horseNumber: 15, fieldSize: 16 })];
    const evidence = collectHorseGateEvidence("h1", history, TOKYO_DIRT_1600);
    expect(evidence).not.toHaveProperty("gateBiasLevel");
    expect(evidence).not.toHaveProperty("gateCoefficient");
    expect(evidence.runs[0]).not.toHaveProperty("gateBiasLevel");
    expect(evidence.runs[0]).not.toHaveProperty("gateCoefficient");
  });
});

describe("collectHorseGateEvidence（STEP6: 実データ検証データセットでの動作確認・テスト専用）", () => {
  // ALL_GATE_VALIDATION_ROWSはdata/horses/へは一切混入させない、独立した検証専用データセット
  // （gateValidationV1.ts, CHECKPOINT10.1〜10.2）。ここではその実データを
  // HorseEvidenceSourceRace形状へ変換し、collectHorseGateEvidenceの動作を実データで確認するのみ。

  it("n>=3の実在馬（findRepeatedHorsesで機械抽出）についてsampleCountが一致する", () => {
    const repeated = findRepeatedHorses(ALL_GATE_VALIDATION_ROWS);
    const nAtLeast3 = [...repeated.entries()].filter(([, rows]) => rows.length >= 3);
    expect(nAtLeast3.length).toBeGreaterThan(0);

    const [horseName, rows] = nAtLeast3[0];
    const history: HorseEvidenceSourceRace[] = rows.map((row) => ({
      raceId: row.raceId,
      raceDate: row.date,
      racecourse: row.venue,
      surface: row.surface as HorseEvidenceSourceRace["surface"],
      distance: row.distance,
      gate: row.frame,
      horseNumber: row.horseNumber,
      fieldSize: row.fieldSize,
      finishPosition: row.finishPosition,
    }));

    const condition = { racecourse: rows[0].venue, surface: rows[0].surface as "turf" | "dirt", distance: rows[0].distance };
    const evidence = collectHorseGateEvidence(horseName, history, condition);

    expect(evidence.sampleCount).toBe(rows.length);
    expect(evidence.sampleCount).toBeGreaterThanOrEqual(3);
    for (const run of evidence.runs) {
      const sourceRow = rows.find((r) => r.raceId === run.raceId);
      expect(sourceRow).toBeDefined();
      expect(run.frame).toBe(sourceRow!.frame);
      expect(run.horseNumber).toBe(sourceRow!.horseNumber);
      expect(run.fieldSize).toBe(sourceRow!.fieldSize);
      expect(run.finishPosition).toBe(sourceRow!.finishPosition);
      // 東京ダート1600mの検証データはhorseNumber<=fieldSizeが正常なケースなのでnullにならない
      expect(run.relativeGatePosition).not.toBeNull();
    }
  });

  it("n=2の実在馬についてもsampleCountが一致する", () => {
    const repeated = findRepeatedHorses(ALL_GATE_VALIDATION_ROWS);
    const nExactly2 = [...repeated.entries()].filter(([, rows]) => rows.length === 2);
    expect(nExactly2.length).toBeGreaterThan(0);

    const [horseName, rows] = nExactly2[0];
    const history: HorseEvidenceSourceRace[] = rows.map((row) => ({
      raceId: row.raceId,
      raceDate: row.date,
      racecourse: row.venue,
      surface: row.surface as HorseEvidenceSourceRace["surface"],
      distance: row.distance,
      gate: row.frame,
      horseNumber: row.horseNumber,
      fieldSize: row.fieldSize,
      finishPosition: row.finishPosition,
    }));

    const condition = { racecourse: rows[0].venue, surface: rows[0].surface as "turf" | "dirt", distance: rows[0].distance };
    const evidence = collectHorseGateEvidence(horseName, history, condition);

    expect(evidence.sampleCount).toBe(2);
    expect(evidence.runs).toHaveLength(2);
  });
});

/**
 * Historical Pace Validation Execution V1（CHECKPOINT14C.2B）の単体テスト。
 * 全て合成データ（テスト用フィクスチャ）。実Lapデータ・実horse historyではない。
 * Race Pace Prediction Engine（racePacePrediction.ts）・Historical Position Profile
 * （positionProfile.ts）自体は一切変更していない（このテストも呼び出すのみ）。
 */
import { describe, expect, it } from "vitest";
import { computeLeaveOneRaceOutActualPace, generateHistoricalRacePacePrediction, summarizePilotValidation } from "../racePaceValidationExecution";
import { buildRacePerformance } from "../buildRacePerformance";
import { calculateBaseAbility } from "../baseAbility";
import type { RacePerformance, PassingPositionData } from "../types";
import type { RaceLapSequenceRecord, PaceValidationRecord } from "../racePaceValidationTypes";

function lapRecord(overrides: Partial<RaceLapSequenceRecord> = {}): RaceLapSequenceRecord {
  return {
    raceId: "JRA-TEST-01",
    raceDate: "2026-01-01",
    raceName: "テストレース",
    raceNumber: 11,
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    fieldSize: 14,
    courseLayout: null,
    raceClass: null,
    segmentMeters: 200,
    lapSequence: [12.5, 11.2, 11.8, 11.9, 12.0, 12.1, 12.0, 11.7, 11.5, 11.9],
    source: "test",
    sourceRaceId: null,
    importedAt: null,
    ...overrides,
  };
}

function pp(cornerPositions: number[], fieldSize: number): PassingPositionData {
  return { cornerPositions, fieldSize, source: "test", isReliable: true };
}

function race(overrides: Partial<Parameters<typeof buildRacePerformance>[0]> = {}) {
  return buildRacePerformance({
    raceId: "R1",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "東京",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 50,
    raceTimeScore: 50,
    final3FScore: 50,
    weightScore: 50,
    ...overrides,
  } as Parameters<typeof buildRacePerformance>[0]);
}

describe("computeLeaveOneRaceOutActualPace", () => {
  it("自身を除いた他レースのfirst600m平均との差分でcontinuousActualPaceを算出する（自己参照禁止）", () => {
    // R1が最も速い（first600m合計が小さい）、R2/R3/R4/R5は横並びに遅い
    const fast = lapRecord({ raceId: "R1", lapSequence: [10.0, 10.0, 10.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0] });
    const slow = (id: string) =>
      lapRecord({ raceId: id, lapSequence: [13.0, 13.0, 13.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0] });
    const records = [fast, slow("R2"), slow("R3"), slow("R4"), slow("R5")];
    const results = computeLeaveOneRaceOutActualPace(records);

    const r1 = results.find((r) => r.raceId === "R1")!;
    const r2 = results.find((r) => r.raceId === "R2")!;
    // R1（速い）はLOO平均（他の遅いレース）より速いので continuousActualPace が正の大きい値
    expect(r1.continuousActualPace).not.toBeNull();
    expect(r1.continuousActualPace!).toBeGreaterThan(0);
    // R2（遅い側、横並び）はLOO平均に近いので0に近い値になるはず
    expect(Math.abs(r2.continuousActualPace!)).toBeLessThan(Math.abs(r1.continuousActualPace!));
  });

  it("5件中3件以上でcontinuousActualPaceが算出できればactualPaceClassを三分位で分類する", () => {
    const records = [
      lapRecord({ raceId: "R1", lapSequence: [10, 10, 10, 12, 12, 12, 12, 12, 12, 12] }), // 最速
      lapRecord({ raceId: "R2", lapSequence: [11, 11, 11, 12, 12, 12, 12, 12, 12, 12] }),
      lapRecord({ raceId: "R3", lapSequence: [12, 12, 12, 12, 12, 12, 12, 12, 12, 12] }),
      lapRecord({ raceId: "R4", lapSequence: [13, 13, 13, 12, 12, 12, 12, 12, 12, 12] }),
      lapRecord({ raceId: "R5", lapSequence: [14, 14, 14, 12, 12, 12, 12, 12, 12, 12] }), // 最遅
    ];
    const results = computeLeaveOneRaceOutActualPace(records);
    const r1 = results.find((r) => r.raceId === "R1")!; // 最速 → 他より速い → high
    const r5 = results.find((r) => r.raceId === "R5")!; // 最遅 → 他より遅い → slow
    expect(r1.actualPaceClass).toBe("high");
    expect(r5.actualPaceClass).toBe("slow");
  });

  it("first600mが導出できないレース（distance<600等）はcontinuousActualPace=nullで警告を出す", () => {
    const records = [lapRecord({ raceId: "R1", distance: 500, lapSequence: [12.5, 11.2] })];
    const results = computeLeaveOneRaceOutActualPace(records);
    expect(results[0].continuousActualPace).toBeNull();
    expect(results[0].warnings.some((w) => w.includes("算出できません"))).toBe(true);
  });

  it("プールが2件未満（LOO baselineに他レースが無い）ならcontinuousActualPace=null", () => {
    const results = computeLeaveOneRaceOutActualPace([lapRecord({ raceId: "R1" })]);
    expect(results[0].continuousActualPace).toBeNull();
  });

  it("着順等の結果論に依存するフィールドが出力に一切含まれない", () => {
    const results = computeLeaveOneRaceOutActualPace([lapRecord({ raceId: "R1" }), lapRecord({ raceId: "R2" })]);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toMatch(/finishPosition|着順|winner|勝ち馬|人気/);
  });
});

describe("generateHistoricalRacePacePrediction: Future Leakage", () => {
  it("targetRaceDate以後の履歴は使用しない（strictly-before）", () => {
    const beforeRace: RacePerformance[] = [race({ raceId: "OLD", raceDate: "2025-01-01", passingPosition: pp([1, 1], 14) })];
    const afterRace: RacePerformance[] = [
      race({ raceId: "OLD", raceDate: "2025-01-01", passingPosition: pp([1, 1], 14) }),
      race({ raceId: "FUTURE", raceDate: "2026-06-01", passingPosition: pp([14, 14], 14) }), // 未来: 追込馬に見えるダミー
    ];

    const withoutFuture = generateHistoricalRacePacePrediction("2026-01-01", [
      { horseId: "h1", horseName: "テスト馬", recentRaces: beforeRace },
    ]);
    const withFutureLeakAttempt = generateHistoricalRacePacePrediction("2026-01-01", [
      { horseId: "h1", horseName: "テスト馬", recentRaces: afterRace },
    ]);

    // targetRaceDate="2026-01-01"より後の"FUTURE"（2026-06-01）は使われないため、結果は同一のはず
    expect(withFutureLeakAttempt.continuousPacePressure).toBe(withoutFuture.continuousPacePressure);
    expect(withFutureLeakAttempt.horses[0].positionEvidenceCount).toBe(withoutFuture.horses[0].positionEvidenceCount);
  });

  it("frame/horseNumberを一切要求しない（Pre-Frame）", () => {
    const races: RacePerformance[] = [race({ raceId: "R1", raceDate: "2025-01-01", passingPosition: pp([1, 1], 14) })];
    const result = generateHistoricalRacePacePrediction("2026-01-01", [
      { horseId: "h1", horseName: "テスト馬", recentRaces: races },
    ]);
    expect(result.paceStage).toBe("pre_frame");
  });
});

describe("generateHistoricalRacePacePrediction: Base Ability/Suitability不変", () => {
  it("Historical Prediction生成を実行しても、同じraces配列から算出したbaseAbilityは変化しない", () => {
    const races: RacePerformance[] = [
      race({ raceId: "R1", raceDate: "2025-05-01", passingPosition: pp([3, 4, 4, 3], 10) }),
    ];
    const before = calculateBaseAbility(races);
    generateHistoricalRacePacePrediction("2026-01-01", [{ horseId: "h1", horseName: "テスト馬", recentRaces: races }]);
    const after = calculateBaseAbility(races);
    expect(after).toBe(before);
  });
});

describe("summarizePilotValidation", () => {
  function validationRecord(overrides: Partial<PaceValidationRecord> = {}): PaceValidationRecord {
    return {
      raceId: "R1",
      raceDate: "2026-01-01",
      predictedContinuousPacePressure: 1.0,
      predictedExpectedPaceClass: "average",
      predictedPaceConfidence: "high",
      actual: {
        raceId: "R1",
        first600mSeconds: 35.0,
        first1000mSeconds: 58.0,
        continuousActualPace: 0.5,
        actualPaceClass: "average",
        warnings: [],
      },
      ...overrides,
    };
  }

  it("Pace Class Accuracyを正しく計算する（一致率）", () => {
    const records = [
      validationRecord({ raceId: "R1", predictedExpectedPaceClass: "average", actual: { ...validationRecord().actual, raceId: "R1", actualPaceClass: "average" } }),
      validationRecord({ raceId: "R2", predictedExpectedPaceClass: "high", actual: { ...validationRecord().actual, raceId: "R2", actualPaceClass: "slow" } }),
    ];
    const summary = summarizePilotValidation(records);
    expect(summary.accuracy).toBeCloseTo(0.5, 5);
    expect(summary.confusionMatrix.average.average).toBe(1);
    expect(summary.confusionMatrix.high.slow).toBe(1);
  });

  it("actualPaceClassがnullのレースはAccuracy集計から除外される", () => {
    const records = [
      validationRecord({ raceId: "R1", actual: { ...validationRecord().actual, raceId: "R1", actualPaceClass: null } }),
    ];
    const summary = summarizePilotValidation(records);
    expect(summary.accuracy).toBeNull();
  });

  it("5件未満なら『参考値』警告を出す", () => {
    const summary = summarizePilotValidation([validationRecord()]);
    expect(summary.warnings.some((w) => w.includes("参考値"))).toBe(true);
  });

  it("continuousの相関はPearson式で算出し、3件未満ならnull", () => {
    const records = [validationRecord({ raceId: "R1" }), validationRecord({ raceId: "R2" })];
    const summary = summarizePilotValidation(records);
    expect(summary.continuousCorrelation).toBeNull();
  });
});

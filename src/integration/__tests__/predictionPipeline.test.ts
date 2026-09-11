import { afterEach, describe, expect, it, vi } from "vitest";
import { collectRace } from "../../collector/collectRace";
import { normalizeRaceBundle } from "../../collector/normalize";
import { getHorseRecentRaces } from "../../ability/horseAbilityData";
import { calculateBaseAbility } from "../../ability/baseAbility";
import { buildGateConfirmedSnapshot } from "../../ability/predictionSnapshot";
import type { OddsSnapshotEntry } from "../../ability/oddsSnapshot";
import { listPredictionSnapshots } from "../../ability/import/predictionSnapshotStore";
import { buildDerivedFromCollector } from "../derivedFromCollector";
import { runPredictionPipeline, type RunPredictionPipelineOptions } from "../predictionPipeline";
import { connectCollectorHorseHistories } from "../collectorHorseHistory";
import { buildRacePredictionArtifact } from "../racePredictionArtifact";
import type { CollectedRaceIdentity, CollectedRunnerRow, PriorHistoryEntry, RawRaceBundle } from "../../collector/types";

const frozen = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" })[0];
const options: RunPredictionPipelineOptions = {
  predictionCutoffAt: frozen.predictionCutoffAt,
  raceCardAvailableAt: frozen.predictionCutoffAt,
  scheduledStartTime: frozen.scheduledStartTime,
};
const race: CollectedRaceIdentity = {
  raceId: frozen.raceId, raceDate: frozen.raceDate, raceName: "新潟記念",
  racecourse: frozen.racecourse, raceNumber: frozen.raceNumber,
  surface: frozen.surface, distance: frozen.distance, going: "unknown", courseLayout: null, courseVariant: null,
};
function runners(): CollectedRunnerRow[] {
  return frozen.runners.map((r) => ({
    ...race, raceNumber: race.raceNumber!, horseId: r.horseId, horseName: r.horseName,
    horseNumber: r.horseNumber!, gate: r.frame!, carriedWeightKg: r.assignedWeight,
    fieldSize: frozen.totalRunners, finishPosition: null, actualRaceTimeSeconds: null,
    final3FSeconds: null, timeGapSeconds: null, passingPosition: null,
    source: "existing formal snapshot", sourceRaceId: null, sourceHorseId: r.sourceHorseId,
  }));
}
function histories(): PriorHistoryEntry[] {
  return frozen.runners.map((r) => ({
    horseId: r.horseId, status: "available", races: structuredClone(getHorseRecentRaces(r.horseId)),
    provenance: { source: "production_data_horses", sourceIdentifier: r.horseId,
      targetRaceId: race.raceId, targetAsOf: frozen.predictionCutoffAt,
      retrievedAt: "2026-09-08T00:00:00Z", method: "production_history_reference", collectorVersion: "test" },
  }));
}
function run(rs = runners(), hs = histories(), opts = options) {
  return runPredictionPipeline(race, rs, hs, opts);
}
function winOdds(rs = runners()): OddsSnapshotEntry[] {
  return rs.map((runner, index) => ({
    raceId: race.raceId,
    horseId: runner.horseId,
    observedAt: "2026-08-28T03:00:00Z",
    availableAt: "2026-08-28T03:00:30Z",
    odds: 2 + index / 10,
    market: "win",
    source: "JRA-VAN test",
    sourceIdentifier: `win-${runner.horseId}`,
  }));
}
function expectBlocked(result: ReturnType<typeof run>) {
  expect(result.formalPredictionReady).toBe(false);
  expect(result.gate.formal).toBe(false);
  expect(result.gate.formalPredictionReady).toBe(false);
  expect(result.gate.reasons.length).toBeGreaterThan(0);
  expect(result.horses.every((h) => h.winProbability === null && h.top2Probability === null && h.top3Probability === null)).toBe(true);
  expect(result.horses.every((h) => h.finalRaceAbility === null)).toBe(true);
}
afterEach(() => vi.useRealTimers());

describe("P0-1: Collector → 発走前Prediction境界", () => {
  it("既存16頭fixtureの結果未確定は取消ではなく、履歴不足なら全体を診断に留める", async () => {
    const c = await collectRace("JRA-20240505-NIIGATA-11", { skipCache: true });
    expect(c.status).toBe("OK");
    const rs = c.runners.map((r) => ({ ...r, finishPosition: null, actualRaceTimeSeconds: null, final3FSeconds: null, timeGapSeconds: null }));
    const result = runPredictionPipeline(c.race!, rs, c.priorHistories, {
      predictionCutoffAt: "2024-05-04T00:00:00Z", raceCardAvailableAt: "2024-05-04T00:00:00Z",
    });
    expect(result.horses).toHaveLength(16);
    expect(result.horses.every((r) => !r.scratched)).toBe(true);
    expectBlocked(result);
  });

  it("新潟11頭の発走前入力は全頭の確率を生成する", () => {
    const result = run();
    expect(result.formalPredictionReady).toBe(true);
    expect(result.gate.formal).toBe(true);
    expect(result.gate.formalPredictionReady).toBe(true);
    expect(result.gate.reasons).toEqual([]);
    expect(result.gate.ineligibleHorses).toEqual([]);
    expect(result.horses).toHaveLength(11);
    expect(result.horses.every((h) => !h.scratched && h.winProbability !== null)).toBe(true);
    expect(result.horses.reduce((s, h) => s + h.winProbability!, 0)).toBeCloseTo(100, 0);
  });

  it("Collectorで追加された6走目をStage Aの同一Horse Historyから使用する", () => {
    const hs = histories();
    const priorCount = hs[0].races.length;
    const added = {
      ...structuredClone(hs[0].races[0]),
      raceId: "P0-2-PIPELINE-NEW",
      sourceRaceId: "P0-2-PIPELINE-NEW",
      raceName: "P0-2追加走",
      raceDate: "2026-08-01",
      availableAt: "2026-08-01T08:00:00+09:00",
      raceScore: 999,
    };
    hs[0].races.unshift(added);
    const result = run(runners(), hs);
    const connected = connectCollectorHorseHistories(runners(), hs, race, options.predictionCutoffAt);
    const expected = calculateBaseAbility(connected.historiesByHorseId[hs[0].horseId]);

    expect(result.gate.formal).toBe(true);
    expect(result.horses.find((horse) => horse.horseId === hs[0].horseId)?.baseAbility).toBe(expected);
    expect(connected.historiesByHorseId[hs[0].horseId]).toHaveLength(priorCount + 1);
  });

  it("normalizeが明示状態を保持し、取消・除外だけを対象外にする", () => {
    const rs = runners();
    rs[0].entryStatus = "scratched";
    rs[1].entryStatus = "excluded";
    const raw: RawRaceBundle = { ...race, raceNumber: 8, runners: rs, provenance: histories()[0].provenance };
    const normalized = normalizeRaceBundle(raw);
    const result = run(normalized);
    expect(result.gate.formal).toBe(true);
    expect(result.horses.filter((h) => h.scratched).map((h) => h.horseId)).toEqual([rs[0].horseId, rs[1].horseId]);
    expect(result.horses.filter((h) => h.winProbability !== null)).toHaveLength(9);
    expect(result.gate.horseDiagnostics.slice(0, 2).every((horse) =>
      horse.explicitlyExcluded && horse.errors.length === 0,
    )).toBe(true);
  });

  it.each([undefined, "", "invalid", "2026-08-28", "2026-08-28T03:00:00", "2026-02-30T00:00:00Z", frozen.scheduledStartTime, "2026-09-01T00:00:00Z"])(
    "cutoff=%sを現在時刻で代用せず拒否する", (cutoff) => {
      expect(() => run(runners(), histories(), { ...options, predictionCutoffAt: cutoff } as RunPredictionPipelineOptions)).toThrow();
    },
  );
  it("optionsそのものの欠落を拒否する", () => {
    expect(() => runPredictionPipeline(race, runners(), histories(), undefined as unknown as RunPredictionPipelineOptions)).toThrow(/predictionCutoffAt/);
  });
  it("発走時刻不明なら同日cutoffを拒否する", () => {
    expect(() => run(runners(), histories(), { ...options, scheduledStartTime: undefined, predictionCutoffAt: "2026-08-30T01:00:00Z" })).toThrow();
  });
  it("同一入力・cutoffなら実行日時が異なっても全出力が一致する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    const a = run();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(run()).toEqual(a);
    const b = run(runners(), histories(), { ...options, generatedAt: "2030-01-01T00:00:00Z" });
    expect(b.horses).toEqual(a.horses);
    expect(b.predictionCutoffAt).toBe(a.predictionCutoffAt);
  });
  it("対象結果・未来走・同日走・cutoff後の訂正版をFinal/Pace/Suitabilityへ入れない", () => {
    const before = run();
    const hs = histories();
    for (const h of hs) {
      const r = h.races[0];
      h.races.unshift(
        { ...r, raceId: race.raceId, raceScore: 100 }, // 日付偽装でも自身IDを排除
        { ...r, raceId: "future", raceDate: "2026-08-29", raceScore: 100 },
        { ...r, raceId: "same-day", raceDate: race.raceDate, raceScore: 100 },
        { ...r, raceId: "late-revision", availableAt: "2026-08-29T00:00:00Z", raceScore: 100 },
      );
    }
    expect(run(runners(), hs)).toEqual(before);
    const rs = runners().map((r) => ({ ...r, finishPosition: 1, actualRaceTimeSeconds: 1, final3FSeconds: 1, timeGapSeconds: 0 }));
    expect(run(rs)).toEqual(before); // targetの結果列は一切計算へ渡さない
  });
  it("cutoff後に確定した出走表・個別情報・馬場情報を拒否する", () => {
    const futureCard = run(runners(), histories(), { ...options, raceCardAvailableAt: "2026-08-29T00:00:00Z" });
    expectBlocked(futureCard);
    expect(futureCard.gate.globalErrors.some((error) => error.code === "FUTURE_DATA_REJECTED")).toBe(true);
    const rs = runners(); rs[0].availableAt = "2026-08-29T00:00:00Z";
    const futureRunner = run(rs);
    expectBlocked(futureRunner);
    expect(futureRunner.gate.ineligibleHorses.find((horse) => horse.horseId === rs[0].horseId)?.errors
      .some((error) => error.code === "FUTURE_DATA_REJECTED")).toBe(true);
    const futureGoing = run(runners(), histories(), { ...options, going: { evaluated: true, going: "良" }, goingAvailableAt: "2026-08-29T00:00:00Z" });
    expectBlocked(futureGoing);
    expect(futureGoing.gate.globalErrors.some((error) => error.code === "FUTURE_DATA_REJECTED")).toBe(true);
    expect(() => run(runners(), histories(), { ...options, going: { evaluated: true, going: "良" } })).toThrow(/goingAvailableAt/);
  });
  it("履歴不足・必須入力欠損・出走馬行欠落で部分集合確率を生成しない", () => {
    const hs = histories(); hs[0].races = hs[0].races.slice(0, 1);
    const missingHistory = run(runners(), hs);
    expectBlocked(missingHistory);
    expect(missingHistory.formalPredictionReady).toBe(false);
    expect(missingHistory.gate.ineligibleHorses.find((horse) => horse.horseId === hs[0].horseId)?.errors
      .some((error) => error.code === "MISSING_HORSE_HISTORY")).toBe(true);
    const rs = runners(); rs[0].carriedWeightKg = null;
    const missingRunnerInput = run(rs);
    expectBlocked(missingRunnerInput);
    expect(missingRunnerInput.gate.ineligibleHorses.find((horse) => horse.horseId === rs[0].horseId)?.errors
      .some((error) => error.code === "MISSING_RUNNER_INPUT")).toBe(true);
    expectBlocked(run(runners().slice(1)));
    expectBlocked(run([]));
  });
  it("canonical horseId未解決馬を馬単位で診断し、全頭の正式予測を止める", () => {
    const rs = runners();
    const unresolvedOriginalId = rs[0].horseId;
    rs[0] = { ...rs[0], horseId: "unresolved-horse", sourceHorseId: "unresolved-source" };
    const hs = histories().filter((history) => history.horseId !== unresolvedOriginalId);
    const result = run(rs, hs);
    const diagnostic = result.gate.ineligibleHorses.find((horse) => horse.horseId === "unresolved-horse");

    expectBlocked(result);
    expect(diagnostic?.errors.some((error) => error.code === "UNRESOLVED_CANONICAL_HORSE_ID")).toBe(true);
    expect(diagnostic?.errors.some((error) => error.code === "MISSING_HORSE_HISTORY")).toBe(true);
  });
  it("対象レース結果しか受信していない馬は履歴ありと見なさず正式予測を止める", () => {
    const hs = histories();
    hs[0].races = [{ ...hs[0].races[0], raceId: race.raceId, raceDate: race.raceDate }];
    const result = run(runners(), hs);
    expectBlocked(result);
    expect(result.gate.ineligibleHorses.find((horse) => horse.horseId === hs[0].horseId)?.errors
      .some((error) => error.code === "MISSING_HORSE_HISTORY")).toBe(true);
  });
  it("不正履歴日時は黙って採用しない", () => {
    const hs = histories(); hs[0].races[0].raceDate = "invalid";
    expect(() => run(runners(), hs)).toThrow(/INVALID_HISTORY_DATE/);
  });
  it("重複ID・別レース入力は正式予測不可", () => {
    const rs = runners(); rs[0] = { ...rs[1] };
    expectBlocked(run(rs));
    const other = runners(); other[0].raceId = "other";
    expectBlocked(run(other));
  });
  it("derived出力も正式不可の理由を保持しpredicted=falseにする", () => {
    const hs = histories(); hs[0].status = "unavailable";
    const result = buildDerivedFromCollector(race, runners(), hs, options);
    expect(result.predicted).toBe(false);
    expect(result.gate?.formal).toBe(false);
    expect(result.gate?.reasons.length).toBeGreaterThan(0);
  });
  it("保存cutoffで11頭すべてのStage A値・適性componentを維持する", () => {
    const result = buildGateConfirmedSnapshot({
      raceTarget: { ...race, postTimeIso: frozen.scheduledStartTime },
      entries: runners().map((r) => ({ horseId: r.horseId, horseName: r.horseName, frame: r.gate, horseNumber: r.horseNumber, carriedWeight: r.carriedWeightKg, scratched: false })),
      going: { evaluated: false }, generatedAt: frozen.predictionCutoffAt,
    });
    for (const r of result.runners) {
      const saved = frozen.runners.find((s) => s.horseId === r.horseId)!;
      expect(r.baseAbility).toBe(saved.baseAbility);
      expect(r.effectiveAbility).toBe(saved.effectiveAbility);
      expect(r.suitability?.overallSuitabilityPercent).toBe(saved.overallSuitabilityPercent);
      expect(r.suitability?.distance.adjustedPercent).toBe(saved.distanceSuitability);
      expect(r.suitability?.course.adjustedPercent).toBe(saved.courseSuitability);
      expect(r.suitability?.going.adjustedPercent).toBe(saved.goingSuitability);
      expect(r.suitability?.gate.adjustedPercent).toBe(saved.gateSuitability);
    }
    const connectedResult = run();
    for (const r of connectedResult.horses) {
      const saved = frozen.runners.find((s) => s.horseId === r.horseId)!;
      expect(r.baseAbility).toBe(saved.baseAbility);
      expect(r.effectiveAbility).toBe(saved.effectiveAbility);
    }
  });
});

describe("P0-4: 予測時点Odds接続", () => {
  it("全11頭のcutoff以前の単勝を接続してもStage A Probabilityを変えない", () => {
    const baseline = run();
    const odds = winOdds();
    const result = run(runners(), histories(), { ...options, odds });

    expect(result.formalPredictionReady).toBe(true);
    expect(result.oddsStatus).toMatchObject({
      market: "win",
      winOddsComplete: true,
      missingHorseIds: [],
      readyForEv: true,
    });
    expect(result.horses.map((horse) => horse.winOdds)).toEqual(odds.map((entry) => entry.odds));
    expect(result.horses.map(({ horseId, winProbability, top2Probability, top3Probability }) =>
      ({ horseId, winProbability, top2Probability, top3Probability })))
      .toEqual(baseline.horses.map(({ horseId, winProbability, top2Probability, top3Probability }) =>
        ({ horseId, winProbability, top2Probability, top3Probability })));
  });

  it("Odds欠損を馬単位で診断するがProbability計算は維持する", () => {
    const baseline = run();
    const one = winOdds().slice(0, 1);
    const result = run(runners(), histories(), { ...options, odds: one });

    expect(result.formalPredictionReady).toBe(true);
    expect(result.oddsStatus.winOddsComplete).toBe(false);
    expect(result.oddsStatus.readyForEv).toBe(false);
    expect(result.oddsStatus.missingHorseIds).toHaveLength(10);
    expect(result.oddsStatus.diagnostics.filter((d) => d.code === "MISSING_WIN_ODDS_BEFORE_CUTOFF")).toHaveLength(10);
    expect(result.horses[0].winOdds).toBe(one[0].odds);
    expect(result.horses.slice(1).every((horse) => horse.winOdds === null)).toBe(true);
    expect(result.horses.map((horse) => horse.winProbability)).toEqual(
      baseline.horses.map((horse) => horse.winProbability),
    );
  });

  it("cutoff後・別レース・未解決horseIdのOddsを使用しない", () => {
    const unsafe: OddsSnapshotEntry[] = [
      { ...winOdds()[0], observedAt: "2026-08-28T03:03:03.358Z", odds: 1.1 },
      { ...winOdds()[0], raceId: "OTHER-RACE", odds: 1.2 },
      { ...winOdds()[0], horseId: "UNRESOLVED-HORSE", odds: 1.3 },
    ];
    const result = run(runners(), histories(), { ...options, odds: unsafe });

    expect(result.horses.every((horse) => horse.winOdds === null)).toBe(true);
    expect(result.oddsStatus.diagnostics.some((d) => d.code === "FUTURE_ODDS_REJECTED")).toBe(true);
    expect(result.oddsStatus.diagnostics.some((d) => d.code === "ODDS_RACE_ID_MISMATCH")).toBe(true);
    expect(result.oddsStatus.diagnostics.some((d) => d.code === "UNRESOLVED_ODDS_HORSE_ID")).toBe(true);
    expect(result.horses.every((horse) => horse.winProbability !== null)).toBe(true);
  });

  it("Formal Gate未通過を完全なOddsだけで正式予測へ変えない", () => {
    const hs = histories();
    hs[0].races = hs[0].races.slice(0, 1);
    const result = run(runners(), hs, { ...options, odds: winOdds() });

    expectBlocked(result);
    expect(result.oddsStatus.winOddsComplete).toBe(true);
    expect(result.oddsStatus.readyForEv).toBe(false);
  });
});

describe("P0-5: Probability × cutoff単勝Odds → Expected Value", () => {
  it("新潟記念11頭で丸め前ProbabilityからEVを生成し、Probability表示値は維持する", () => {
    const baseline = run();
    const odds = winOdds();
    const result = run(runners(), histories(), { ...options, odds });

    expect(result.horses.map((horse) => horse.winProbability)).toEqual(
      baseline.horses.map((horse) => horse.winProbability),
    );
    expect(result.horses.every((horse) =>
      horse.readyForEv && horse.expectedValue !== null && horse.oddsObservedAt !== null &&
      horse.predictionCutoffAt === options.predictionCutoffAt &&
      horse.expectedValueUnavailableReason === null,
    )).toBe(true);
    for (const horse of result.horses) {
      expect(horse.expectedValue).toBeCloseTo((horse.winProbabilityRaw! / 100) * horse.winOdds!, 12);
    }
    const unrounded = result.horses.find((horse) => horse.winProbabilityRaw !== horse.winProbability)!;
    expect(unrounded.expectedValue).not.toBeCloseTo((unrounded.winProbability! / 100) * unrounded.winOdds!, 12);
  });

  it("Odds欠損・cutoff後・別race・未解決IDでは該当馬のEVを生成しない", () => {
    const firstOnly = run(runners(), histories(), { ...options, odds: winOdds().slice(0, 1) });
    expect(firstOnly.horses[0]).toMatchObject({ readyForEv: true, expectedValueUnavailableReason: null });
    expect(firstOnly.horses.slice(1).every((horse) =>
      horse.expectedValue === null && !horse.readyForEv &&
      horse.expectedValueUnavailableReason === "WIN_ODDS_UNAVAILABLE",
    )).toBe(true);

    const rejected = run(runners(), histories(), {
      ...options,
      odds: [
        { ...winOdds()[0], observedAt: "2026-08-28T03:03:03.358Z" },
        { ...winOdds()[1], raceId: "OTHER-RACE" },
        { ...winOdds()[2], horseId: "UNRESOLVED-HORSE" },
      ],
    });
    expect(rejected.horses.every((horse) => horse.expectedValue === null && !horse.readyForEv)).toBe(true);
  });

  it("Formal Gate未通過なら全馬EVを生成しない", () => {
    const hs = histories();
    hs[0].races = hs[0].races.slice(0, 1);
    const result = run(runners(), hs, { ...options, odds: winOdds() });

    expectBlocked(result);
    expect(result.horses.every((horse) =>
      horse.expectedValue === null && !horse.readyForEv &&
      horse.expectedValueUnavailableReason === "FORMAL_PREDICTION_NOT_READY",
    )).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正Odds=%sをPipeline入口で拒否してEVへ渡さない", (invalidOdds) => {
      const result = run(runners(), histories(), {
        ...options,
        odds: [{ ...winOdds()[0], odds: invalidOdds }],
      });

      expect(result.oddsStatus.diagnostics.some((d) => d.code === "INVALID_ODDS_SNAPSHOT")).toBe(true);
      expect(result.horses[0]).toMatchObject({
        winOdds: null,
        expectedValue: null,
        readyForEv: false,
        expectedValueUnavailableReason: "WIN_ODDS_UNAVAILABLE",
      });
    },
  );

  it("同一Probability・同一Oddsなら実行日時に関係なくEVが一致する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    const first = run(runners(), histories(), { ...options, odds: winOdds() });
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const second = run(runners(), histories(), { ...options, odds: winOdds() });

    expect(second.horses.map((horse) => horse.expectedValue)).toEqual(
      first.horses.map((horse) => horse.expectedValue),
    );
  });
});

describe("P0-6: EV Decision Structure", () => {
  it("Prediction成立後も全馬を自動BETにせず、Decisionを独立して保持する", () => {
    const result = run(runners(), histories(), { ...options, odds: winOdds() });

    expect(result.formalPredictionReady).toBe(true);
    expect(result.horses.every((horse) => horse.winProbability !== null && horse.expectedValue !== null)).toBe(true);
    expect(result.horses.every((horse) => horse.evDecision.finalDecision === null)).toBe(true);
    expect(result.horses.every((horse) => [
      "KEN_CANDIDATE",
      "STRATEGY_REVIEW_REQUIRED",
    ].includes(horse.evDecision.decisionState))).toBe(true);
  });

  it("Odds欠損・Formal Gate失敗をNOT_EVALUABLEとして馬単位で診断する", () => {
    const missingOdds = run();
    expect(missingOdds.formalPredictionReady).toBe(true);
    expect(missingOdds.horses.every((horse) =>
      horse.evDecision.assessmentStatus === "NOT_EVALUABLE" &&
      horse.evDecision.decisionState === "NOT_EVALUABLE",
    )).toBe(true);

    const hs = histories();
    hs[0].races = hs[0].races.slice(0, 1);
    const blocked = run(runners(), hs, { ...options, odds: winOdds() });
    expectBlocked(blocked);
    expect(blocked.horses.every((horse) => horse.evDecision.assessmentStatus === "NOT_EVALUABLE")).toBe(true);
  });

  it("cutoff後・別race・canonical ID不一致OddsをDecisionへ混入させない", () => {
    const rejected = run(runners(), histories(), {
      ...options,
      odds: [
        { ...winOdds()[0], observedAt: "2026-08-28T03:03:03.358Z" },
        { ...winOdds()[1], raceId: "OTHER-RACE" },
        { ...winOdds()[2], horseId: "UNRESOLVED-HORSE" },
      ],
    });
    expect(rejected.horses.every((horse) =>
      horse.expectedValue === null && horse.evDecision.assessmentStatus === "NOT_EVALUABLE",
    )).toBe(true);
  });

  it("新潟記念11頭のPrediction全項目をDecision入力の有無で変えない", () => {
    const baseline = run();
    const withDecisionInput = run(runners(), histories(), { ...options, odds: winOdds() });
    const predictionProjection = (result: ReturnType<typeof run>) => result.horses.map((horse) => ({
      horseId: horse.horseId,
      baseAbility: horse.baseAbility,
      overallSuitabilityPercent: horse.overallSuitabilityPercent,
      distanceSuitability: horse.distanceSuitability,
      courseSuitability: horse.courseSuitability,
      goingSuitability: horse.goingSuitability,
      gateSuitability: horse.gateSuitability,
      effectiveAbility: horse.effectiveAbility,
      finalRaceAbility: horse.finalRaceAbility,
      winProbability: horse.winProbability,
      top2Probability: horse.top2Probability,
      top3Probability: horse.top3Probability,
    }));

    expect(predictionProjection(withDecisionInput)).toEqual(predictionProjection(baseline));
  });

  it("Decision Contextと結果はJSON往復できHistorical Replay入力として保存可能", () => {
    const result = run(runners(), histories(), { ...options, odds: winOdds() });
    const replayRecord = JSON.parse(JSON.stringify({
      raceId: result.race.raceId,
      predictionCutoffAt: result.predictionCutoffAt,
      odds: result.odds,
      evDecisionContext: result.evDecisionContext,
      horses: result.horses,
    }));

    expect(replayRecord.evDecisionContext.historicalReplayCompatible).toBe(true);
    expect(replayRecord.horses).toHaveLength(11);
    expect(replayRecord.horses.every((horse: { evDecision: { finalDecision: unknown } }) =>
      horse.evDecision.finalDecision === null,
    )).toBe(true);
  });
});

describe("P0-7: Collector Pipeline Artifact境界", () => {
  it("Collector経路の正式出力をStage A Artifactへ変換できる", () => {
    const prediction = run(runners(), histories(), { ...options, odds: winOdds() });
    const artifact = buildRacePredictionArtifact(prediction);

    expect(artifact).toMatchObject({
      artifactStatus: "FORMAL_PREDICTION",
      source: "COLLECTOR_PREDICTION_PIPELINE",
      predictionStage: "STAGE_A",
      predictionCutoffAt: options.predictionCutoffAt,
      race: { raceId: race.raceId, raceStartAt: options.scheduledStartTime },
      formalPredictionReady: true,
    });
    expect(artifact.horses).toHaveLength(11);
  });
});

it("Collector側の計算済みscoreを信用せず、生実績から既存raceScoreを再計算する", () => {
  const expected = run();
  const hs = histories();
  hs[0].races[0].raceScore += 1;
  hs[0].races[0].memberLevelScoreAtRace = 0;
  hs[0].races[0].timeGapScore = 0;
  expect(run(runners(), hs)).toEqual(expected);
});

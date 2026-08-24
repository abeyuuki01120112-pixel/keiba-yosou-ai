import { describe, expect, it } from "vitest";
import {
  buildAbilityBoard,
  buildGateConfirmedSnapshot,
  buildHorseSnapshotEntry,
  buildRaceNotHeldSnapshot,
  buildT2hSnapshot,
  computeT2hCutoff,
  GOING_UNKNOWN_SENTINEL,
  type RaceEntryInput,
  type SnapshotRaceTarget,
} from "../predictionSnapshot";
import { getHorseRecentRaces } from "../horseAbilityData";
import { calculateBaseAbility } from "../baseAbility";

const SHAKE_ID = "shakeyourheart";
const CUTOFF_AFTER_ALL_HER_RACES = "2026-08-24T00:00:00Z";

function entry(overrides: Partial<RaceEntryInput> = {}): RaceEntryInput {
  return {
    horseId: SHAKE_ID,
    horseName: "シェイクユアハート",
    frame: 5,
    horseNumber: 9,
    carriedWeight: 58,
    scratched: false,
    ...overrides,
  };
}

const HANSHIN_TARGET: SnapshotRaceTarget = {
  raceId: "TEST-RACE-1",
  raceName: "テストステークス",
  raceDate: "2026-08-30",
  racecourse: "阪神",
  surface: "turf",
  distance: 2200,
  raceNumber: 11,
  postTimeIso: "2026-08-30T15:45:00+09:00",
};

describe("CHECKPOINT13 STEP13 A: 正式な全体データ経路からBase Abilityが計算されること", () => {
  it("シェイクユアハートのbaseAbilityが、Snapshot経由でも正式経路（getHorseRecentRaces）と一致する（CHECKPOINT13.4Dで70.3固定assertionから変更。理由はdatasetVersion.ts参照）", () => {
    const result = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: false },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    const expected = calculateBaseAbility(getHorseRecentRaces(SHAKE_ID));
    expect(result.baseAbility).toBe(expected);
  });
});

describe("CHECKPOINT13 STEP13 B: 対象レース出走馬だけの部分データでraceScoreを誤計算しないこと", () => {
  it("entriesに彼女1頭だけを渡しても、entriesに他馬を大量に加えても、baseAbilityは変化しない", () => {
    const aloneResult = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });

    const crowdedEntries: RaceEntryInput[] = [
      entry(),
      ...Array.from({ length: 13 }, (_, i) =>
        entry({ horseId: `dummy-${i}`, horseName: `ダミー馬${i}`, frame: (i % 8) + 1, horseNumber: i + 1 }),
      ),
    ];
    const crowdedResult = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: crowdedEntries,
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });

    const aloneShake = aloneResult.runners.find((r) => r.horseId === SHAKE_ID)!;
    const crowdedShake = crowdedResult.runners.find((r) => r.horseId === SHAKE_ID)!;

    expect(aloneShake.baseAbility).not.toBeNull();
    expect(aloneShake.baseAbility).toBe(crowdedShake.baseAbility);
    expect(aloneShake.suitability?.overallSuitabilityPercent).toBe(crowdedShake.suitability?.overallSuitabilityPercent);
    expect(aloneShake.effectiveAbility).toBe(crowdedShake.effectiveAbility);
  });

  it("このモジュールはbuildRaceHistory/raceHistoryPipelineをimport文で取り込んでいない（静的確認。コメント中の言及は許容）", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../predictionSnapshot.ts"), "utf-8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/raceHistoryPipeline/);
    expect(importLines).not.toMatch(/buildRaceHistory/);
  });
});

describe("CHECKPOINT13 STEP13 C: Stage Aでgoingがunknownの場合、evaluated=falseとして扱われ100%として補完されないこと", () => {
  it("going.evaluated=falseなら、suitability.going.evaluatedはfalse、adjustedPercentは中立100", () => {
    const result = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: false },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(result.suitability?.going.evaluated).toBe(false);
    expect(result.suitability?.going.rawPercent).toBe(100);
    expect(result.suitability?.going.adjustedPercent).toBe(100);
    expect(result.warnings.some((w) => w.includes("evaluated=false"))).toBe(true);
  });

  it("GOING_UNKNOWN_SENTINELは実在するJRA馬場状態表記のいずれとも一致しない", () => {
    expect(["良", "稍重", "重", "不良"]).not.toContain(GOING_UNKNOWN_SENTINEL);
  });
});

describe("CHECKPOINT13 STEP13 D: Stage Bで公式馬場状態が与えられた場合、goingの評価が正しく更新されること", () => {
  it("going.evaluated=true & going='重'（実際に彼女が重馬場を走った履歴あり）なら evaluated=true になる", () => {
    // シェイクユアハートの宝塚記念(2026-06-14)は going="重"
    const result = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: true, going: "重" },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(result.suitability?.going.evaluated).toBe(true);
    expect(result.suitability?.going.horseEvidence?.sampleCount).toBeGreaterThan(0);
  });

  it("Stage AのgoingUnknown結果とStage Bのgoing確定後の結果は異なりうる（同一関数、異なる入力）", () => {
    const stageA = buildHorseSnapshotEntry(entry(), HANSHIN_TARGET, { evaluated: false }, CUTOFF_AFTER_ALL_HER_RACES, 1);
    const stageB = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: true, going: "重" },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(stageA.suitability?.going.evaluated).toBe(false);
    expect(stageB.suitability?.going.evaluated).toBe(true);
    // baseAbility自体は不変（Suitabilityのみが更新される）
    expect(stageA.baseAbility).toBe(stageB.baseAbility);
  });
});

describe("CHECKPOINT13 STEP13 E: evaluated=false componentが能力を不正に動かさないこと", () => {
  it("effectiveAbilityはbaseAbility×overallSuitabilityPercent/100と厳密に一致する（このファイル独自の補正を追加していない）", () => {
    const result = buildHorseSnapshotEntry(entry(), HANSHIN_TARGET, { evaluated: false }, CUTOFF_AFTER_ALL_HER_RACES, 1);
    const expected = Math.round((result.baseAbility! * result.suitability!.overallSuitabilityPercent) / 100 * 10) / 10;
    expect(result.effectiveAbility).toBe(expected);
  });

  it("goingがevaluated=falseでも、overallSuitabilityPercentはevaluated=trueのcomponentだけから計算される（既存frozen仕様の確認）", () => {
    const result = buildHorseSnapshotEntry(entry(), HANSHIN_TARGET, { evaluated: false }, CUTOFF_AFTER_ALL_HER_RACES, 1);
    expect(result.suitability?.evaluatedComponentCount).toBeLessThan(4);
    // goingがevaluated=falseでも中立100として計算に混ざらず、evaluatedComponentCountから除外されている
    expect(result.suitability?.going.evaluated).toBe(false);
  });
});

describe("CHECKPOINT13 STEP13 F: Stage A Snapshot生成後、Stage Bや結果データによってStage Aが書き換わらないこと", () => {
  it("Stage A生成→Stage B生成でも、Stage Aオブジェクトの内容は不変", () => {
    const stageA = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    const stageASnapshotJson = JSON.stringify(stageA);

    // Stage Bを、異なるgoing・異なるentries（出走取消を追加）で生成する
    buildT2hSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry(), entry({ horseId: "scratch-1", horseName: "取消馬", scratched: true })],
      going: { evaluated: true, going: "重" },
      generatedAt: "2026-08-30T13:45:00+09:00",
    });

    expect(JSON.stringify(stageA)).toBe(stageASnapshotJson);
  });

  it("buildGateConfirmedSnapshot/buildT2hSnapshotは呼び出しごとに新しいオブジェクトを返す（共有参照なし）", () => {
    const a1 = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    const a2 = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    expect(a1).not.toBe(a2);
    expect(a1.runners).not.toBe(a2.runners);
  });
});

describe("CHECKPOINT13 STEP13 G: オッズを入力してもBase Ability/Suitability/Effective Abilityが変化しないこと", () => {
  it("Stage Bにoddsを渡しても、oddsを渡さない場合と各馬のability系フィールドは完全一致する", () => {
    const withoutOdds = buildT2hSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: true, going: "重" },
      generatedAt: "2026-08-30T13:45:00+09:00",
    });
    const withOdds = buildT2hSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry()],
      going: { evaluated: true, going: "重" },
      generatedAt: "2026-08-30T13:45:00+09:00",
      odds: [{ horseId: SHAKE_ID, odds: 3.4, popularity: 1, recordedAt: "2026-08-30T13:45:00+09:00" }],
    });

    const a = withoutOdds.runners.find((r) => r.horseId === SHAKE_ID)!;
    const b = withOdds.runners.find((r) => r.horseId === SHAKE_ID)!;
    expect(b.baseAbility).toBe(a.baseAbility);
    expect(b.suitability).toEqual(a.suitability);
    expect(b.effectiveAbility).toBe(a.effectiveAbility);
    expect(withOdds.odds).not.toBeNull();
  });

  it("RaceEntryInput/buildHorseSnapshotEntryにodds関連の入力経路が存在しない（計算関数はoddsを読み取れない）", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../predictionSnapshot.ts"), "utf-8");
    const buildHorseSnapshotEntryBody = source.slice(
      source.indexOf("export function buildHorseSnapshotEntry"),
      source.indexOf("function buildDataCompleteness"),
    );
    expect(buildHorseSnapshotEntryBody).not.toMatch(/odds/i);
  });
});

describe("CHECKPOINT13 STEP13 H: 全馬についてBase Ability順位とEffective Ability順位を取得できること", () => {
  it("baseAbility降順・effectiveAbility降順それぞれのランクが取得できる。出走取消はランク対象外", () => {
    const entries: RaceEntryInput[] = [
      entry({ horseId: SHAKE_ID, horseName: "シェイクユアハート", frame: 1, horseNumber: 1 }),
      entry({ horseId: "unknown-horse", horseName: "データ無し馬", frame: 2, horseNumber: 2 }),
      entry({ horseId: "scratched-horse", horseName: "取消馬", frame: 3, horseNumber: 3, scratched: true }),
    ];
    const snapshot = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries,
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    const board = buildAbilityBoard(snapshot);

    const shakeRow = board.find((r) => r.horseId === SHAKE_ID)!;
    const unknownRow = board.find((r) => r.horseId === "unknown-horse")!;
    const scratchedRow = board.find((r) => r.horseId === "scratched-horse")!;

    expect(shakeRow.rankByBaseAbility).toBe(1);
    expect(shakeRow.rankByEffectiveAbility).toBe(1);
    expect(unknownRow.baseAbility).toBeNull();
    expect(unknownRow.rankByBaseAbility).toBeNull();
    expect(scratchedRow.rankByBaseAbility).toBeNull();
    expect(scratchedRow.rankByEffectiveAbility).toBeNull();
  });
});

describe("CHECKPOINT13 STEP13 I: data completeness不足・比較母集団不足・勝ち馬欠落等の既存warningとの整合", () => {
  it("過去走データが無い馬はwarningsに理由が記録され、dataCompletenessから除外される", () => {
    const snapshot = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: [entry({ horseId: "no-data-horse", horseName: "データ無し馬" })],
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    expect(snapshot.dataCompleteness.baseAbilityAvailableCount).toBe(0);
    expect(snapshot.warnings.some((w) => w.includes("データ不足"))).toBe(true);
  });

  it("getHorseRecentRaces()はdata/horses/内に実データがあるhorseIdについて0件超の履歴を返す（既存の正式経路が生きていることの確認）", () => {
    expect(getHorseRecentRaces(SHAKE_ID).length).toBeGreaterThan(0);
    expect(getHorseRecentRaces("no-such-horse-id").length).toBe(0);
  });
});

describe("future leakage防止（CHECKPOINT13 STEP6）", () => {
  it("predictionCutoffAtより後の日付の過去走は使われない", () => {
    // シェイクユアハートの最新走(2026-06-14)より前をcutoffにすると、baseAbilityが変わる
    const earlyCutoffResult = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: false },
      "2026-06-14T00:00:00Z", // 6/14の走そのものを含めない
      1,
    );
    const fullCutoffResult = buildHorseSnapshotEntry(
      entry(),
      HANSHIN_TARGET,
      { evaluated: false },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(fullCutoffResult.baseAbility).not.toBeNull();
    expect(earlyCutoffResult.baseAbility).not.toBe(fullCutoffResult.baseAbility);
  });
});

describe("race_not_held状態の保存（CHECKPOINT13 STEP3）", () => {
  it("buildRaceNotHeldSnapshotはpredictionと別のraceStatusを持つ", () => {
    const record = buildRaceNotHeldSnapshot("TEST-RACE-CANCELLED", "台風による開催中止", "2026-08-30T09:00:00+09:00");
    expect(record.raceStatus).toBe("raceNotHeld");
    expect(record.raceId).toBe("TEST-RACE-CANCELLED");
  });
});

describe("computeT2hCutoff", () => {
  it("発走予定時刻の2時間前を返す（15:45発走→13:45）", () => {
    const cutoff = computeT2hCutoff("2026-08-30T15:45:00+09:00");
    expect(new Date(cutoff).toISOString()).toBe(new Date("2026-08-30T13:45:00+09:00").toISOString());
  });
});

describe("CHECKPOINT13.2: raceNumber", () => {
  it("SnapshotRaceTarget.raceNumberを保持できる。ability計算には影響しない", () => {
    const withNumber = buildHorseSnapshotEntry(entry(), HANSHIN_TARGET, { evaluated: false }, CUTOFF_AFTER_ALL_HER_RACES, 1);
    const withoutNumber = buildHorseSnapshotEntry(
      entry(),
      { ...HANSHIN_TARGET, raceNumber: null },
      { evaluated: false },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(HANSHIN_TARGET.raceNumber).toBe(11);
    expect(withNumber.baseAbility).toBe(withoutNumber.baseAbility);
    expect(withNumber.effectiveAbility).toBe(withoutNumber.effectiveAbility);
  });
});

describe("CHECKPOINT13.2 Test8: placeholder/fixtureが正式Prediction用データへ黙って混入しない", () => {
  it("全走がdataKind=placeholderの馬（grandia）はbaseAbility算出不能・警告あり", () => {
    // grandiaはCHECKPOINT13.1監査で発見されたV0プレースホルダーデータの馬。
    // CHECKPOINT13.2でdataKind: "placeholder"を全走に付与済み。
    const grandiaEntry = entry({ horseId: "grandia", horseName: "グランディア" });
    const result = buildHorseSnapshotEntry(
      grandiaEntry,
      HANSHIN_TARGET,
      { evaluated: false },
      "2099-01-01T00:00:00Z",
      1,
    );
    expect(result.baseAbility).toBeNull();
    expect(result.suitability).toBeNull();
    expect(result.effectiveAbility).toBeNull();
    expect(result.completenessFlags).toContain("placeholderDataExcluded");
    expect(result.warnings.some((w) => w.includes("placeholder"))).toBe(true);
  });

  it("getHorseRecentRaces(grandia)自体は5走返す（データは存在する）が、Snapshotはそれを実データとして使わない", () => {
    expect(getHorseRecentRaces("grandia").length).toBe(5);
    expect(getHorseRecentRaces("grandia").every((r) => r.dataKind === "placeholder")).toBe(true);
  });

  it("実データ馬（シェイクユアハート）はdataKind未設定でも従来どおりreal扱いされる（後方互換）", () => {
    const result = buildHorseSnapshotEntry(entry(), HANSHIN_TARGET, { evaluated: false }, CUTOFF_AFTER_ALL_HER_RACES, 1);
    expect(result.baseAbility).not.toBeNull();
    expect(result.completenessFlags).not.toContain("placeholderDataExcluded");
  });
});

describe("CHECKPOINT13.2 Test9: Data Completeness Reportで新規warningが取得可能", () => {
  // 実データ馬2023100767は過去走1走のみ（RECENT_RACE_COUNT=5未満）、
  // かつその1走はmemberLevelBreakdownがnull（当時の候補馬データ不足）。
  // insufficientRecentHistory・memberLevelUnavailable両方を実データで再現できる。
  //
  // 【CHECKPOINT13.4Cで判明・CHECKPOINT13.4Hで再発・注記】このIDは既に2回目の
  // 差し替え（"2022105102"→"2016102229"→"2023100767"）。実データImportのたびに
  // 「当時fallbackだった走」が解消されうるため、この種のfixtureは本質的に
  // 陳腐化する運命にある。今回は CHECKPOINT13.4H のmemberLevel追加データImport
  // （兵庫特別JRA-20250928-HANSHIN-09の対戦馬5頭に prior race を追加）により、
  // 同レースに出走していた全12頭（"2016102229"を含む）のmemberLevelBreakdownが
  // 一斉にnullでなくなったため、前回の差し替え先も陳腐化した。バグではなく、
  // Base Ability V1の動的再計算という設計そのものの帰結（CHECKPOINT13.4C参照）。
  const SPARSE_HORSE_ID = "2023100767";

  it("insufficient_evidence: 直近5走に満たない馬（1〜2走）でcompletenessFlagsに含まれる（CHECKPOINT13.4G Short Career Eligibility V1、Case D）", () => {
    expect(getHorseRecentRaces(SPARSE_HORSE_ID).length).toBeLessThan(5);
    const result = buildHorseSnapshotEntry(
      entry({ horseId: SPARSE_HORSE_ID, horseName: "テスト対象馬" }),
      HANSHIN_TARGET,
      { evaluated: false },
      "2099-01-01T00:00:00Z",
      1,
    );
    expect(result.baseAbility).not.toBeNull();
    expect(result.completenessFlags).toContain("insufficient_evidence");
    expect(result.abilityEvidence?.blockingReason).toBe("insufficient_evidence");
  });

  it("memberLevelUnavailable: memberLevelBreakdownがnullの走を含む馬でcompletenessFlagsに含まれる", () => {
    expect(getHorseRecentRaces(SPARSE_HORSE_ID).some((r) => r.memberLevelBreakdown === null)).toBe(true);
    const result = buildHorseSnapshotEntry(
      entry({ horseId: SPARSE_HORSE_ID, horseName: "テスト対象馬" }),
      HANSHIN_TARGET,
      { evaluated: false },
      "2099-01-01T00:00:00Z",
      1,
    );
    expect(result.completenessFlags).toContain("memberLevelUnavailable");
  });

  it("scratched馬・データ不足馬はcompletenessFlagsが空配列で初期化されている（未定義エラーにならない）", () => {
    const scratchedResult = buildHorseSnapshotEntry(
      entry({ scratched: true }),
      HANSHIN_TARGET,
      { evaluated: false },
      CUTOFF_AFTER_ALL_HER_RACES,
      1,
    );
    expect(scratchedResult.completenessFlags).toEqual([]);
  });
});

describe("CHECKPOINT13.2 STEP17: Runner Resolver → RaceEntryInput → Snapshotへの接続可能性確認", () => {
  it("Runner Resolverのresolved結果からRaceEntryInputを構築し、そのままbuildGateConfirmedSnapshotへ渡せる", async () => {
    const { resolveRunners } = await import("../import/runnerResolver");
    const { results } = resolveRunners(
      [{ horseName: "シェイクユアハート", canonicalHorseIdHint: SHAKE_ID }, { horseName: "存在しない馬" }],
      {
        canonicalHorseIds: new Set([SHAKE_ID]),
        canonicalHorseNames: [{ horseId: SHAKE_ID, horseName: "シェイクユアハート" }],
      },
    );

    const resolvedEntries: RaceEntryInput[] = results
      .filter((r) => r.status === "resolved" && r.horseId !== null)
      .map((r) => entry({ horseId: r.horseId!, horseName: r.horseName }));

    expect(resolvedEntries).toHaveLength(1);

    const snapshot = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: resolvedEntries,
      going: { evaluated: false },
      generatedAt: CUTOFF_AFTER_ALL_HER_RACES,
    });
    expect(snapshot.runners).toHaveLength(1);
    expect(snapshot.runners[0].baseAbility).toBe(calculateBaseAbility(getHorseRecentRaces(SHAKE_ID)));
  });
});

describe("CHECKPOINT13.2 STEP14: Missing Data Report", () => {
  it("Runner Resolve結果とSnapshotを組み合わせて、resolved/unresolved/ambiguousと per-horse reasonsを持つレポートを生成できる", async () => {
    const { resolveRunners } = await import("../import/runnerResolver");
    const { buildMissingDataReport, formatMissingDataReport } = await import("../import/missingDataReport");

    const resolverBatch = resolveRunners(
      [
        { horseName: "シェイクユアハート", canonicalHorseIdHint: SHAKE_ID },
        { horseName: "存在しない馬" },
        { horseName: "グランディア", canonicalHorseIdHint: "grandia" },
      ],
      {
        canonicalHorseIds: new Set([SHAKE_ID, "grandia"]),
        canonicalHorseNames: [
          { horseId: SHAKE_ID, horseName: "シェイクユアハート" },
          { horseId: "grandia", horseName: "グランディア" },
        ],
      },
    );

    const resolvedEntries: RaceEntryInput[] = resolverBatch.results
      .filter((r) => r.status === "resolved" && r.horseId !== null)
      .map((r) => entry({ horseId: r.horseId!, horseName: r.horseName }));

    const snapshot = buildGateConfirmedSnapshot({
      raceTarget: HANSHIN_TARGET,
      entries: resolvedEntries,
      going: { evaluated: false },
      generatedAt: "2099-01-01T00:00:00Z",
    });

    const report = buildMissingDataReport(HANSHIN_TARGET.raceId, HANSHIN_TARGET.raceName, resolverBatch.results, snapshot);

    expect(report.totalRunners).toBe(3);
    expect(report.resolved).toBe(2);
    expect(report.unresolved).toBe(1);
    expect(report.ambiguous).toBe(0);

    const grandiaProblem = report.problems.find((p) => p.horseName === "グランディア");
    expect(grandiaProblem?.reasons).toContain("placeholderDataExcluded");

    const unresolvedProblem = report.problems.find((p) => p.horseName === "存在しない馬");
    expect(unresolvedProblem?.reasons).toEqual(["unresolvedHorse"]);

    const text = formatMissingDataReport(report);
    expect(text).toContain(`Race ${HANSHIN_TARGET.raceId}`);
    expect(text).toContain("Resolved: 2");
    expect(text).toContain("Unresolved: 1");
    expect(text).toContain("unresolvedHorse");
  });
});

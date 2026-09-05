/**
 * Formal Prediction Snapshot Persistence V1（CHECKPOINT13.5B）の単体テスト。
 * Base Ability V1・Suitability V1・MemberLevel Evidence V1・Runner Resolver・
 * Formal Gateの意味は一切変更していない。ここで確認するのは、既に計算済みの
 * Snapshotを「変更不能な記録」として保存・再読込できること、
 * 上書き・mutation・diagnostic混入が起きないことの5点（チェックポイント本文Test A〜H）。
 *
 * 保存先はテスト専用の一時ディレクトリ（os.tmpdir()配下）を都度作成・削除する。
 * 本番のsrc/ability/data/predictionSnapshots/には一切書き込まない。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRaceCardBridge } from "../raceCardBridge";
import { buildFormalPredictionSnapshotRecord, buildFormalSnapshotId } from "../formalPredictionSnapshot";
import { persistPredictionSnapshot, loadPredictionSnapshot, listPredictionSnapshots } from "../predictionSnapshotStore";
import { buildT2hSnapshot, PREDICTION_SNAPSHOT_MODEL_VERSION, type RaceEntryInput, type SnapshotRaceTarget } from "../../predictionSnapshot";
import { getHorseRecentRaces } from "../../horseAbilityData";
import { calculateBaseAbility } from "../../baseAbility";
import type { RaceCardInput } from "../raceCardTypes";

const FAR_FUTURE_START = "2099-01-01T15:45:00+09:00";

function raceCard(overrides: Partial<RaceCardInput> = {}): RaceCardInput {
  return {
    raceId: "TEST-STORE-11R",
    raceDate: "2099-01-01",
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cp13-5b-snapshot-store-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Test A: Formal Stage A Snapshotを保存できる", () => {
  it("gate.formal=trueのRace Cardから正式recordを構築し、保存・再読込できる", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    expect(bridgeResult.gate.formal).toBe(true);

    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    expect(record.formal).toBe(true);
    expect(record.stage).toBe("gateConfirmed");
    expect(record.runners).toHaveLength(1);
    expect(record.runners[0].horseId).toBe("shakeyourheart");

    const result = persistPredictionSnapshot(record, { dir: tmpDir });
    expect(result.status).toBe("created");
    expect(fs.existsSync(result.path)).toBe(true);

    const loaded = loadPredictionSnapshot(record.snapshotId, { dir: tmpDir });
    expect(loaded).not.toBeNull();
    expect(loaded?.snapshotId).toBe(record.snapshotId);
    expect(loaded?.runners[0].baseAbility).toBe(record.runners[0].baseAbility);
  });
});

describe("Test B: 保存済みSnapshotの値は、後から現在のdata/horsesを再計算して表示するものではない", () => {
  it("loadPredictionSnapshot()はファイルに書かれた値をそのまま返すだけで、生産データから再計算しない", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    const persisted = persistPredictionSnapshot(record, { dir: tmpDir });
    expect(persisted.status).toBe("created");

    // 「後日Production datasetが変わっても過去Snapshotの値は変わらない」ことを、
    // 実際にdata/horses/を書き換えずに検証する：保存済みJSONファイルを直接、
    // 現在の実データとは異なる（かつ意図的に不自然な）値へ書き換える。
    // これは「過去に、今より少ないデータで計算されたSnapshotが既に保存されている」
    // 状況を模している。loadPredictionSnapshot()がこの値をそのまま返せば、
    // 「保存後にdata/horsesの内容が変わっても、読み込み時に再計算されない」ことの証明になる。
    const raw = fs.readFileSync(persisted.path, "utf-8");
    const parsed = JSON.parse(raw);
    const currentBaseAbility = calculateBaseAbility(getHorseRecentRaces("shakeyourheart"));
    const deliberatelyDifferentValue = Math.round((currentBaseAbility + 12.3) * 10) / 10;
    parsed.runners[0].baseAbility = deliberatelyDifferentValue;
    fs.writeFileSync(persisted.path, JSON.stringify(parsed, null, 2), "utf-8");

    const loaded = loadPredictionSnapshot(record.snapshotId, { dir: tmpDir });
    expect(loaded?.runners[0].baseAbility).toBe(deliberatelyDifferentValue);
    expect(loaded?.runners[0].baseAbility).not.toBe(currentBaseAbility);
  });
});

describe("Test C: 同じsnapshotIdを別内容で上書きできない", () => {
  it("異なる内容の再保存はrejectされ、既存ファイルは変化しない", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    const first = persistPredictionSnapshot(record, { dir: tmpDir });
    expect(first.status).toBe("created");

    const tampered = { ...record, runners: [{ ...record.runners[0], baseAbility: 999.9 }] };
    const second = persistPredictionSnapshot(tampered, { dir: tmpDir });
    expect(second.status).toBe("rejected");

    const loaded = loadPredictionSnapshot(record.snapshotId, { dir: tmpDir });
    expect(loaded?.runners[0].baseAbility).toBe(record.runners[0].baseAbility);
    expect(loaded?.runners[0].baseAbility).not.toBe(999.9);
  });

  it("完全に同一内容の再保存はno-op（duplicate）として扱われ、エラーにも二重ファイルにもならない", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    const first = persistPredictionSnapshot(record, { dir: tmpDir });
    expect(first.status).toBe("created");

    const second = persistPredictionSnapshot(record, { dir: tmpDir });
    expect(second.status).toBe("duplicate");
    expect(fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });
});

describe("Test D: Stage A保存後にStage Bを保存してもStage Aは変化しない", () => {
  it("同一raceIdでもstageが異なれば別snapshotIdとなり、互いに独立している", () => {
    const card = raceCard();
    const bridgeResult = runRaceCardBridge(card);
    const stageARecord = buildFormalPredictionSnapshotRecord(bridgeResult);
    const stageAPersist = persistPredictionSnapshot(stageARecord, { dir: tmpDir });
    expect(stageAPersist.status).toBe("created");

    const entries: RaceEntryInput[] = [
      { horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, carriedWeight: 58, scratched: false },
    ];
    const target: SnapshotRaceTarget = {
      raceId: card.raceId,
      raceName: card.raceId,
      raceDate: card.raceDate,
      racecourse: card.racecourse,
      surface: card.surface,
      distance: card.distance,
      raceNumber: card.raceNumber,
      postTimeIso: card.scheduledStartTime,
    };
    const stageBSnapshot = buildT2hSnapshot({
      raceTarget: target,
      entries,
      going: { evaluated: false },
      generatedAt: FAR_FUTURE_START,
    });
    // buildFormalPredictionSnapshotRecordはRaceCardBridgeResultの構造だけを読むため、
    // Stage AのbridgeResultからdiagnosticSnapshotだけをStage Bのものへ差し替えて渡せる
    // （runRaceCardBridge()自体はStage A専用のまま無変更。新しいStage B用bridge関数は追加しない）。
    const stageBBridgeResult = { ...bridgeResult, diagnosticSnapshot: stageBSnapshot };
    const stageBRecord = buildFormalPredictionSnapshotRecord(stageBBridgeResult);

    expect(stageBRecord.stage).toBe("t2h");
    expect(stageBRecord.snapshotId).not.toBe(stageARecord.snapshotId);

    const stageBPersist = persistPredictionSnapshot(stageBRecord, { dir: tmpDir });
    expect(stageBPersist.status).toBe("created");

    const reloadedStageA = loadPredictionSnapshot(stageARecord.snapshotId, { dir: tmpDir });
    expect(reloadedStageA?.stage).toBe("gateConfirmed");
    expect(reloadedStageA?.runners[0].baseAbility).toBe(stageARecord.runners[0].baseAbility);

    const all = listPredictionSnapshots({ raceId: card.raceId }, { dir: tmpDir });
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.stage).sort()).toEqual(["gateConfirmed", "t2h"]);
  });
});

describe("Test E: diagnostic（formal=false）は正式Prediction Historyへ保存されない", () => {
  it("gate.formal=falseのbridgeResultからはFormal Recordを構築できない（例外）", () => {
    const card = raceCard({
      runners: [
        { horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false },
        { horseName: "存在しない架空馬", frame: 2, horseNumber: 2, scratched: false },
      ],
    });
    const bridgeResult = runRaceCardBridge(card);
    expect(bridgeResult.gate.formal).toBe(false);
    expect(() => buildFormalPredictionSnapshotRecord(bridgeResult)).toThrow();
  });

  it("persistPredictionSnapshot()自体もformal!==trueのオブジェクトを拒否する（型を迂回した直接呼び出しに対する防御）", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    const forged = { ...record, formal: false as unknown as true };
    expect(() => persistPredictionSnapshot(forged, { dir: tmpDir })).toThrow();
  });
});

describe("Test F: going evaluated=falseが保存後も維持される", () => {
  it("goingが未確定（null）のまま保存・再読込しても、evaluated=falseが保たれる（推測で埋めない）", () => {
    const bridgeResult = runRaceCardBridge(raceCard({ going: null }));
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    expect(record.going).toEqual({ evaluated: false, going: null });

    persistPredictionSnapshot(record, { dir: tmpDir });
    const loaded = loadPredictionSnapshot(record.snapshotId, { dir: tmpDir });
    expect(loaded?.going).toEqual({ evaluated: false, going: null });
  });

  it("goingが確定済みの場合はevaluated=trueとその値が保存される", () => {
    const bridgeResult = runRaceCardBridge(raceCard({ going: "良" }));
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    expect(record.going).toEqual({ evaluated: true, going: "良" });
  });
});

describe("Test G: modelVersion / datasetFingerprintが保存される", () => {
  it("正式recordにmodelVersion・datasetVersion（datasetFingerprint含む）が含まれる", () => {
    const bridgeResult = runRaceCardBridge(raceCard());
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);
    expect(record.modelVersion).toBe(PREDICTION_SNAPSHOT_MODEL_VERSION);
    expect(typeof record.datasetVersion.datasetFingerprint).toBe("string");
    expect(record.datasetVersion.datasetFingerprint.length).toBeGreaterThan(0);
    expect(record.datasetVersion.horseCount).toBeGreaterThan(0);

    persistPredictionSnapshot(record, { dir: tmpDir });
    const loaded = loadPredictionSnapshot(record.snapshotId, { dir: tmpDir });
    expect(loaded?.datasetVersion.datasetFingerprint).toBe(record.datasetVersion.datasetFingerprint);
  });
});

describe("Test H: Race Card input値が追跡可能", () => {
  it("frame/horseNumber/scratched等のRace Card入力値がそのままrecordへ保存される", () => {
    const card = raceCard({
      runners: [{ horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 3, horseNumber: 5, assignedWeight: 55.5, scratched: false }],
    });
    const bridgeResult = runRaceCardBridge(card);
    const record = buildFormalPredictionSnapshotRecord(bridgeResult);

    expect(record.raceCardInput.runners[0].frame).toBe(3);
    expect(record.raceCardInput.runners[0].horseNumber).toBe(5);
    expect(record.raceCardInput.runners[0].assignedWeight).toBe(55.5);
    expect(record.runners[0].frame).toBe(3);
    expect(record.runners[0].horseNumber).toBe(5);
    expect(record.runners[0].assignedWeight).toBe(55.5);
  });

  it("raceCardFingerprintは同一入力から常に同じ値になる決定的なハッシュである", () => {
    const card = raceCard();
    const r1 = buildFormalPredictionSnapshotRecord(runRaceCardBridge(card));
    const r2 = buildFormalPredictionSnapshotRecord(runRaceCardBridge(raceCard()));
    expect(r1.raceCardFingerprint).toBe(r2.raceCardFingerprint);

    const differentCard = raceCard({ raceDate: "2099-01-02" });
    const r3 = buildFormalPredictionSnapshotRecord(runRaceCardBridge(differentCard));
    expect(r3.raceCardFingerprint).not.toBe(r1.raceCardFingerprint);
  });
});

describe("buildFormalSnapshotId: snapshotId設計", () => {
  it("raceId・stage・predictionCutoffAtの組から決定的に一意なIDを作る", () => {
    const id1 = buildFormalSnapshotId("JRA-TEST-11", "gateConfirmed", "2026-08-30T00:00:00.000Z");
    const id2 = buildFormalSnapshotId("JRA-TEST-11", "gateConfirmed", "2026-08-30T00:00:00.000Z");
    const id3 = buildFormalSnapshotId("JRA-TEST-11", "t2h", "2026-08-30T00:00:00.000Z");
    const id4 = buildFormalSnapshotId("JRA-TEST-11", "gateConfirmed", "2026-08-30T01:00:00.000Z");
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).not.toBe(id4);
  });
});

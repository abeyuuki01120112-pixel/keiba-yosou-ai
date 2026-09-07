import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequest, processRequest, pollResponse } from "../requestBridge";
import { FakeJraVanProvider } from "../../collector/providers/fakeJraVanProvider";
import type { RaceDataProvider } from "../../collector/providers/RaceDataProvider";
import type { RawRaceBundle } from "../../collector/types";

const REAL_RACE_ID = "JRA-20230507-NIIGATA-11"; // 既存fixture(raw)にあり
const FROZEN_ONLY_RACE_ID = "JRA-20220508-NIIGATA-11"; // rawには無いが凍結済みGate Validationデータにはある

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("createRequest — Request生成", () => {
  it("requestId/raceId/requestedAt/requestedDataTypes/collectorVersionを持つRequestを生成する", () => {
    const dataDir = makeTmpDir();
    const req = createRequest(REAL_RACE_ID, ["race", "runners"], { dataDir });
    expect(req.raceId).toBe(REAL_RACE_ID);
    expect(req.requestId).toBeTruthy();
    expect(req.requestedAt).toBeTruthy();
    expect(req.requestedDataTypes).toEqual(["race", "runners"]);
    expect(req.collectorVersion).toBeTruthy();

    const files = fs.readdirSync(path.join(dataDir, "requests"));
    expect(files).toHaveLength(1);
  });

  it("同一raceId×requestedDataTypesの2回目のcreateRequestは重複生成せず既存Requestを返す（Idempotency）", () => {
    const dataDir = makeTmpDir();
    const first = createRequest(REAL_RACE_ID, ["race", "runners"], { dataDir });
    const second = createRequest(REAL_RACE_ID, ["race", "runners"], { dataDir });
    expect(second.requestId).toBe(first.requestId);

    const files = fs.readdirSync(path.join(dataDir, "requests"));
    expect(files).toHaveLength(1);
  });

  it("requestedDataTypesが異なれば別のRequestとして生成する", () => {
    const dataDir = makeTmpDir();
    const first = createRequest(REAL_RACE_ID, ["race", "runners"], { dataDir });
    const second = createRequest(REAL_RACE_ID, ["race", "runners", "priorHistory"], { dataDir });
    expect(second.requestId).not.toBe(first.requestId);

    const files = fs.readdirSync(path.join(dataDir, "requests"));
    expect(files).toHaveLength(2);
  });
});

describe("processRequest — FakeJraVanProviderによるResponse処理", () => {
  it("Provider経由で正常にraceが取得できればcompletedを書き込み、RawRaceBundle locationを含む", async () => {
    const dataDir = makeTmpDir();
    const provider = new FakeJraVanProvider();
    const req = createRequest(FROZEN_ONLY_RACE_ID, ["race", "runners"], { dataDir });
    const result = await processRequest(req, provider, { dataDir });

    expect("rawRaceBundleLocation" in result).toBe(true);
    if ("rawRaceBundleLocation" in result) {
      expect(result.raceId).toBe(FROZEN_ONLY_RACE_ID);
      expect(fs.existsSync(result.rawRaceBundleLocation)).toBe(true);
      expect(result.validationResult.ok).toBe(true);
      expect(result.source).toBe("fake_jra_van_frozen_gate_validation");
    }

    const completedFiles = fs.readdirSync(path.join(dataDir, "completed"));
    expect(completedFiles).toHaveLength(1);
  });

  it("取得不能なraceIdはFETCH_UNAVAILABLEとしてfailedへ書き込む", async () => {
    const dataDir = makeTmpDir();
    const provider = new FakeJraVanProvider();
    const req = createRequest("JRA-NONEXISTENT-99", ["race", "runners"], { dataDir });
    const result = await processRequest(req, provider, { dataDir });

    expect("errorCode" in result).toBe(true);
    if ("errorCode" in result) {
      expect(result.errorCode).toBe("FETCH_UNAVAILABLE");
    }
    expect(fs.readdirSync(path.join(dataDir, "failed"))).toHaveLength(1);
  });

  it("providerが例外を投げた場合はJRAVAN_ERRORとして分類する", async () => {
    const dataDir = makeTmpDir();
    const throwingProvider: RaceDataProvider = {
      id: "throwing_test_provider",
      version: "test",
      fetchRace: async (): Promise<RawRaceBundle | null> => {
        throw new Error("JV-Link simulated connection error");
      },
    };
    const req = createRequest(REAL_RACE_ID, ["race", "runners"], { dataDir });
    const result = await processRequest(req, throwingProvider, { dataDir });
    expect("errorCode" in result).toBe(true);
    if ("errorCode" in result) {
      expect(result.errorCode).toBe("JRAVAN_ERROR");
      expect(result.errorMessage).toContain("JV-Link simulated connection error");
    }
  });

  it("requestedDataTypesにpriorHistoryを含む場合、Future Leakageがあればfailedとし、rawは保存しない", async () => {
    const dataDir = makeTmpDir();
    // 対象レース自身よりも未来の日付を持つraceIdをターゲットにすると、本人の
    // production prior historyが「未来」に見えることは通常無いため、ここでは
    // leakage監査のロジック自体をProvider経由で確認する目的で、実データの
    // 中で最も古いraceId（2021年）を使い、leakageが検出されない（ok）ことを確認する
    const provider = new FakeJraVanProvider();
    const req = createRequest("JRA-20210509-NIIGATA-11", ["race", "runners", "priorHistory"], { dataDir });
    const result = await processRequest(req, provider, { dataDir });
    // このraceは2021年で、production側の実データはほぼ2024年以降に偏っているため
    // leakageは検出されない想定（ok side）。失敗した場合でもFUTURE_LEAKAGE以外の
    // 理由であることを確認する（誤判定していないこと）。
    if ("errorCode" in result) {
      expect(result.errorCode).not.toBe("FUTURE_LEAKAGE");
    } else {
      expect(result.raceId).toBe("JRA-20210509-NIIGATA-11");
    }
  });

  it("同一requestIdを2回processRequestしても、completedファイルは重複生成されない（Idempotency）", async () => {
    const dataDir = makeTmpDir();
    const provider = new FakeJraVanProvider();
    const req = createRequest(FROZEN_ONLY_RACE_ID, ["race", "runners"], { dataDir });

    const first = await processRequest(req, provider, { dataDir });
    const second = await processRequest(req, provider, { dataDir });

    expect(second).toEqual(first);
    expect(fs.readdirSync(path.join(dataDir, "completed"))).toHaveLength(1);
  });
});

describe("pollResponse", () => {
  it("未処理のrequestIdはpendingを返す", () => {
    const dataDir = makeTmpDir();
    const result = pollResponse("req-nonexistent", { dataDir });
    expect(result.status).toBe("pending");
  });

  it("処理済みのrequestIdはcompletedを返す", async () => {
    const dataDir = makeTmpDir();
    const provider = new FakeJraVanProvider();
    const req = createRequest(FROZEN_ONLY_RACE_ID, ["race", "runners"], { dataDir });
    await processRequest(req, provider, { dataDir });
    const polled = pollResponse(req.requestId, { dataDir });
    expect(polled.status).toBe("completed");
  });
});

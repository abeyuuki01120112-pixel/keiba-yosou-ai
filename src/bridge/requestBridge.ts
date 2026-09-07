import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { keibaDataSubdir } from "../config/keibaDataDir";
import { COLLECTOR_VERSION } from "../collector/collectRace";
import { normalizeRaceBundle, validateNormalizedRunners } from "../collector/normalize";
import { fetchPriorHistoryFromProduction } from "../collector/providers/productionHistoryProvider";
import { auditFutureLeakage } from "../collector/leakageGuard";
import type { RaceDataProvider } from "../collector/providers/RaceDataProvider";
import type { BridgeErrorCode, BridgePollResult, DataRequest, DataResponseCompleted, DataResponseFailed } from "./types";

export interface BridgeDirOptions {
  dataDir?: string;
}

function dirs(dataDir: string) {
  return {
    requests: path.join(dataDir, "requests"),
    completed: path.join(dataDir, "completed"),
    failed: path.join(dataDir, "failed"),
    raw: path.join(dataDir, "raw"),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function findExistingRequest(raceId: string, requestedDataTypes: string[], d: ReturnType<typeof dirs>): DataRequest | null {
  if (!fs.existsSync(d.requests)) return null;
  const sortedTypes = JSON.stringify([...requestedDataTypes].sort());
  const files = fs.readdirSync(d.requests).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const req = readJson<DataRequest>(path.join(d.requests, f));
    if (req.raceId !== raceId) continue;
    if (JSON.stringify([...req.requestedDataTypes].sort()) !== sortedTypes) continue;
    const failedPath = path.join(d.failed, `${req.requestId}.json`);
    if (fs.existsSync(failedPath)) continue; // 失敗済みリクエストは再作成を許可（リトライのため）
    return req; // pending または completed のリクエストは再利用（重複防止、STEP4 Idempotency）
  }
  return null;
}

/**
 * Request（PHASE A-1）。Mac側からWindows側へ「このraceIdのデータを取得してほしい」
 * と依頼する。Idempotency: 同一raceId×requestedDataTypesの組み合わせで、
 * 未失敗のリクエストが既に存在する場合は新規作成せずそれを返す
 * （二重処理・重複データ生成を防ぐ、STEP4）。
 */
export function createRequest(
  raceId: string,
  requestedDataTypes: string[],
  options: BridgeDirOptions = {},
): DataRequest {
  const dataDir = options.dataDir ?? keibaDataSubdir("");
  const d = dirs(dataDir);

  const existing = findExistingRequest(raceId, requestedDataTypes, d);
  if (existing) return existing;

  const request: DataRequest = {
    requestId: `req-${raceId}-${randomUUID()}`,
    raceId,
    requestedAt: new Date().toISOString(),
    requestedDataTypes,
    collectorVersion: COLLECTOR_VERSION,
  };
  writeJson(path.join(d.requests, `${request.requestId}.json`), request);
  return request;
}

function writeFailed(d: ReturnType<typeof dirs>, request: DataRequest, errorCode: BridgeErrorCode, errorMessage: string): DataResponseFailed {
  const failed: DataResponseFailed = {
    requestId: request.requestId,
    raceId: request.raceId,
    failedAt: new Date().toISOString(),
    errorCode,
    errorMessage,
  };
  writeJson(path.join(d.failed, `${request.requestId}.json`), failed);
  return failed;
}

/**
 * Response処理（PHASE A-2/A-3）。Windows側（V0ではFakeJraVanProvider等）が
 * リクエストを処理し、`completed/`または`failed/`へ結果を書き込む。
 *
 * Idempotency（STEP4）: 既に`completed/<requestId>.json`または
 * `failed/<requestId>.json`が存在する場合は再処理せず、そのまま既存結果を返す
 * （重複データ生成なし）。
 *
 * Error分類（PHASE A-3）: 取得不能（FETCH_UNAVAILABLE）／JRA-VANエラー
 * （JRAVAN_ERROR、providerが例外を投げた場合）／データ欠損（DATA_MISSING、
 * runnerが0件）／Future Leakage（FUTURE_LEAKAGE、requestedDataTypesに
 * "priorHistory"が含まれる場合のみ判定）／validation failure
 * （VALIDATION_FAILED）を区別する。
 */
export async function processRequest(
  request: DataRequest,
  provider: RaceDataProvider,
  options: BridgeDirOptions = {},
): Promise<DataResponseCompleted | DataResponseFailed> {
  const dataDir = options.dataDir ?? keibaDataSubdir("");
  const d = dirs(dataDir);

  const completedPath = path.join(d.completed, `${request.requestId}.json`);
  const failedPath = path.join(d.failed, `${request.requestId}.json`);
  if (fs.existsSync(completedPath)) return readJson<DataResponseCompleted>(completedPath);
  if (fs.existsSync(failedPath)) return readJson<DataResponseFailed>(failedPath);

  let raw;
  try {
    raw = await provider.fetchRace(request.raceId);
  } catch (e) {
    return writeFailed(d, request, "JRAVAN_ERROR", e instanceof Error ? e.message : String(e));
  }
  if (raw === null) {
    return writeFailed(d, request, "FETCH_UNAVAILABLE", `raceId=${request.raceId}のデータをProvider "${provider.id}" から取得できませんでした。`);
  }

  const runners = normalizeRaceBundle(raw);
  const validation = validateNormalizedRunners(runners);
  if (!validation.ok) {
    return writeFailed(d, request, "VALIDATION_FAILED", validation.errors.join("; "));
  }
  if (runners.length === 0) {
    return writeFailed(d, request, "DATA_MISSING", "runnerが0件です。");
  }

  if (request.requestedDataTypes.includes("priorHistory")) {
    const priorHistories = runners.map((r) => fetchPriorHistoryFromProduction(r.horseId, request.raceId, raw.raceDate));
    const leakage = auditFutureLeakage(raw.raceDate, priorHistories);
    if (!leakage.ok) {
      return writeFailed(
        d,
        request,
        "FUTURE_LEAKAGE",
        `対象レース(${raw.raceDate})より未来の実績データが${leakage.violations.length}件検出されました。`,
      );
    }
  }

  // RawRaceBundleをraw/<raceId>.jsonへ保存（Collector V0のManualRawFileProviderがそのまま読める場所）
  fs.mkdirSync(d.raw, { recursive: true });
  const rawPath = path.join(d.raw, `${request.raceId}.json`);
  writeJson(rawPath, raw);

  const completed: DataResponseCompleted = {
    requestId: request.requestId,
    raceId: request.raceId,
    rawRaceBundleLocation: rawPath,
    completedAt: new Date().toISOString(),
    source: raw.provenance.source,
    validationResult: validation,
  };
  writeJson(completedPath, completed);
  return completed;
}

/** Mac側がpollingでリクエスト状況を確認する */
export function pollResponse(requestId: string, options: BridgeDirOptions = {}): BridgePollResult {
  const dataDir = options.dataDir ?? keibaDataSubdir("");
  const d = dirs(dataDir);
  const completedPath = path.join(d.completed, `${requestId}.json`);
  const failedPath = path.join(d.failed, `${requestId}.json`);
  if (fs.existsSync(completedPath)) return { status: "completed", data: readJson<DataResponseCompleted>(completedPath) };
  if (fs.existsSync(failedPath)) return { status: "failed", data: readJson<DataResponseFailed>(failedPath) };
  return { status: "pending" };
}

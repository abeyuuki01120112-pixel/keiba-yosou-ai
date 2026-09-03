/**
 * Mac ↔ Windows Data Bridge Contract（PRE-WINDOWS INTEGRATION + UI V0、PHASE A）。
 *
 * Windows PC（JV-Link/JRA-VAN Data Lab）がまだ無い状態でも、将来の連携仕様を
 * 正式化しておくためのcontract。Macが`requests/`へリクエストを書き込み、
 * Windows側（V0時点ではFakeJraVanProviderを使ったシミュレーション）が
 * `completed/`または`failed/`へ結果を書き込む、という非同期ファイルベース
 * プロトコルとして設計する（HTTP/gRPC等は導入しない、V0として過剰設計を避ける）。
 */

export interface DataRequest {
  requestId: string;
  raceId: string;
  /** ISO8601 */
  requestedAt: string;
  /** 例: ["race","runners"] / ["race","runners","priorHistory"] */
  requestedDataTypes: string[];
  collectorVersion: string;
}

/**
 * ・取得不能（FETCH_UNAVAILABLE）
 * ・JRA-VANエラー（JRAVAN_ERROR）
 * ・データ欠損（DATA_MISSING）
 * ・Future Leakage（FUTURE_LEAKAGE）
 * ・validation failure（VALIDATION_FAILED）
 * をそれぞれ区別する（ユーザー指示PHASE A-3）。
 */
export type BridgeErrorCode =
  | "FETCH_UNAVAILABLE"
  | "JRAVAN_ERROR"
  | "DATA_MISSING"
  | "FUTURE_LEAKAGE"
  | "VALIDATION_FAILED";

export interface BridgeValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface DataResponseCompleted {
  requestId: string;
  raceId: string;
  /** RawRaceBundleが実際に書き込まれた場所（絶対パス） */
  rawRaceBundleLocation: string;
  completedAt: string;
  source: string;
  validationResult: BridgeValidationResult;
}

export interface DataResponseFailed {
  requestId: string;
  raceId: string;
  failedAt: string;
  errorCode: BridgeErrorCode;
  errorMessage: string;
}

export type BridgePollResult =
  | { status: "pending" }
  | { status: "completed"; data: DataResponseCompleted }
  | { status: "failed"; data: DataResponseFailed };

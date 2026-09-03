/**
 * Automated Race Data Collector V0（CHECKPOINT: Automated Race Data Collector V0、
 * 2026-09-03）。
 *
 * このモジュールは新規の独立した収集基盤であり、production Ability計算
 * （`src/ability/`配下）へは一切接続しない。`src/collector/data/`配下は
 * `horseAbilityData.ts`のproduction glob（`./data/horses/*.json`）の走査対象外であり、
 * production `data/horses/`への書き込みAPIもこのモジュールは一切importしない。
 * `src/ability/data/gateValidation/`と同じ分離思想を踏襲している。
 *
 * 【重要な既知の制約】このセッションの実行環境では、db.netkeiba.com・
 * www.jra.go.jp を含む外部ネットワークアクセスがegress proxyで
 * ブロックされている（2026-09-03確認）。そのためV0で実装した唯一の
 * 具体的Providerは`ManualRawFileProvider`（`src/collector/data/raw/`配下に
 * 事前配置されたJSONファイルを読み込む）であり、ライブスクレイピングは
 * 行っていない。`RaceDataProvider`インターフェースは、将来ネットワーク
 * アクセスが可能な環境で実装される別のProviderへ差し替え可能な設計にしている。
 */

export type CollectorFieldStatus = "available" | "missing" | "unavailable" | "not_supported";

export interface SourceProvenance {
  source: string;
  sourceIdentifier: string | null;
  targetRaceId: string;
  /** ISO8601。このCollector呼び出しが実行された時刻 */
  retrievedAt: string;
  /** ISO8601。対象時点（predictionCutoffAt相当）。無ければnull */
  targetAsOf: string | null;
  method: "manual_raw_file" | "production_history_reference";
  collectorVersion: string;
}

export interface RawRunnerRow {
  horseId: string;
  horseName: string;
  horseNumber: number;
  gate: number;
  finishPosition: number | null;
  carriedWeightKg: number | null;
  actualRaceTimeSeconds: number | null;
  final3FSeconds: number | null;
  timeGapSeconds: number | null;
  fieldSize: number;
  passingPosition: string | null;
  source: string | null;
  sourceRaceId: string | null;
  sourceHorseId: string | null;
}

export interface RawRaceBundle {
  raceId: string;
  raceDate: string;
  racecourse: string;
  raceNumber: number;
  raceName: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  courseLayout: string | null;
  courseVariant: string | null;
  runners: RawRunnerRow[];
  provenance: SourceProvenance;
}

/** normalizedレイヤー。既存Gate Race CSV契約（24列、docs/checkpoint14d1e...）と同一の項目名を再利用する。 */
export interface CollectedRunnerRow {
  raceId: string;
  raceDate: string;
  racecourse: string;
  raceNumber: number;
  raceName: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  courseLayout: string | null;
  courseVariant: string | null;
  horseId: string;
  horseName: string;
  horseNumber: number;
  gate: number;
  finishPosition: number | null;
  carriedWeightKg: number | null;
  actualRaceTimeSeconds: number | null;
  final3FSeconds: number | null;
  timeGapSeconds: number | null;
  fieldSize: number;
  passingPosition: string | null;
  source: string | null;
  sourceRaceId: string | null;
  sourceHorseId: string | null;
}

export interface PriorHistoryRace {
  raceId: string;
  raceDate: string;
  raceScore: number;
}

export interface PriorHistoryEntry {
  horseId: string;
  status: CollectorFieldStatus;
  races: PriorHistoryRace[];
  provenance: SourceProvenance;
}

export interface FutureLeakageViolation {
  horseId: string;
  raceId: string;
  raceDate: string;
  targetRaceDate: string;
}

export interface FutureLeakageAuditResult {
  ok: boolean;
  checkedRowCount: number;
  violations: FutureLeakageViolation[];
}

export interface CollectorValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface CollectedRaceIdentity {
  raceId: string;
  raceDate: string;
  racecourse: string;
  raceNumber: number;
  raceName: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  courseLayout: string | null;
  courseVariant: string | null;
}

export interface CollectorRunResult {
  status: "OK" | "FAIL";
  raceId: string;
  race: CollectedRaceIdentity | null;
  runners: CollectedRunnerRow[];
  priorHistories: PriorHistoryEntry[];
  provenance: SourceProvenance[];
  validation: CollectorValidationResult;
  leakage: FutureLeakageAuditResult;
  cache: { wasCached: boolean; writtenPath: string | null };
  failureReason: string | null;
}

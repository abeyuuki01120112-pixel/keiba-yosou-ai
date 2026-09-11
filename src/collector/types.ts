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

import type { RacePerformance } from "../ability/types";

export type CollectorFieldStatus = "available" | "missing" | "unavailable" | "not_supported";

/** JV-Link固定長record 1件の取得・公開時点を追跡する監査証跡。 */
export interface JvLinkSourceEvidence {
  recordType: "RA" | "SE";
  raceKey: string;
  horseId: string | null;
  stage: string;
  sourceFile: string;
  providedAt: string;
  retrievedAt: string;
}

export interface SourceProvenance {
  source: string;
  sourceIdentifier: string | null;
  targetRaceId: string;
  /** ISO8601。このCollector呼び出しが実行された時刻 */
  retrievedAt: string;
  /** ISO8601。対象時点（predictionCutoffAt相当）。無ければnull */
  targetAsOf: string | null;
  method: "manual_raw_file" | "production_history_reference" | "jv_link";
  collectorVersion: string;
  /** method=jv_link時の元record証跡。既存sourceでは省略する。 */
  evidence?: JvLinkSourceEvidence[];
}

export type UnsupportedHistoryReasonCode =
  | "UNSUPPORTED_STAGE_B_HISTORY"
  | "UNSCORABLE_STAGE_B_MISSING_REQUIRED_MEASUREMENT"
  | "UNSUPPORTED_OVERSEAS_RACECOURSE"
  | "UNMAPPED_OVERSEAS_RACE_ID"
  | "FINAL3F_MISSING_OVERSEAS"
  | "FINAL3F_NOT_PROVIDED"
  | "GATE_MISSING_OVERSEAS"
  | "GATE_NOT_PROVIDED"
  | "PASSING_POSITION_MISSING_OVERSEAS"
  | "PASSING_POSITION_NOT_PROVIDED";

/**
 * raw取得には成功したが、現行Ability V1へ入力できない過去走の証拠。
 * 欠損値を数値へ変換せず、RacePerformance[]とは分離して保持する。
 */
export interface UnsupportedPriorHistoryEvidence {
  status: "unsupported_for_ability" | "unscorable_for_ability";
  raceKey: string;
  raceDate: string;
  raceName: string;
  racecourseCode: string;
  horseId: string;
  horseName: string;
  raStage: string;
  seStage: string;
  raw: {
    finishPosition: string;
    raceTime: string;
    timeGap: string;
    carriedWeight: string;
    final3F: string;
    gate: string;
    passingPosition: string[];
  };
  reasonCodes: UnsupportedHistoryReasonCode[];
  provenance: JvLinkSourceEvidence[];
}

export type JvLinkConflictClassification = "NON_MATERIAL" | "MATERIAL";

/** RepositoryとJV-Linkのruntime採用差分。Repositoryファイル自体は変更しない。 */
export interface JvLinkHistoryConflictDiagnostic {
  horseId: string;
  raceId: string;
  raceKey: string | null;
  field: string;
  repositoryValue: unknown;
  jvLinkValue: unknown;
  classification: JvLinkConflictClassification;
  selectedSource: "jv_link";
}

/** 結果の有無とは独立した出走状態。省略は従来の出走表行（declared）。 */
export type RunnerEntryStatus = "declared" | "scratched" | "excluded";

export interface RawRunnerRow {
  entryStatus?: RunnerEntryStatus;
  /** 出走表情報が利用可能になった時刻（結果の確定時刻ではない） */
  availableAt?: string;
  horseId: string;
  horseName: string;
  horseNumber: number;
  gate: number;
  finishPosition: number | null;
  carriedWeightKg: number | null;
  actualRaceTimeSeconds: number | null;
  final3FSeconds: number | null;
  timeGapSeconds: number | null;
  /** 発走前Predictionでは取消・除外行を含む出走表の全行数を要求する。 */
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
  entryStatus?: RunnerEntryStatus;
  availableAt?: string;
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
  /** 発走前Predictionでは取消・除外行を含む出走表の全行数を要求する。 */
  fieldSize: number;
  passingPosition: string | null;
  source: string | null;
  sourceRaceId: string | null;
  sourceHorseId: string | null;
}

/**
 * 対象馬の予測時点以前の過去走。Integration Layer（Base Ability V1・
 * Suitability V1）が直接読める形にするため、raceScoreだけの縮約形ではなく
 * `RacePerformance`（既存`src/ability/types.ts`）をそのまま保持する
 * （course/going/gate componentの照合にはracecourse/surface/distance/going
 * すべてが必要なため）。
 */
export interface PriorHistoryEntry {
  horseId: string;
  status: CollectorFieldStatus;
  races: RacePerformance[];
  /** source側が予測時点で選択した順序。Mac側で別の走へ置換しないための監査値。 */
  selectedRaceKeys?: string[];
  /** Abilityへ渡さない実在履歴。raw欠損を捏造せず監査可能に残す。 */
  unsupportedHistories?: UnsupportedPriorHistoryEvidence[];
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
  /** 不明な場合はnull（Formal Prediction Snapshot経由等、raceNumberが未確定な場合がある） */
  raceNumber: number | null;
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

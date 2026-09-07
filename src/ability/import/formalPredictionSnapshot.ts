/**
 * Formal Prediction Snapshot V1（CHECKPOINT13.5B）。
 *
 * Base Ability V1・Suitability V1・MemberLevel Evidence V1・Short Career V1・
 * Runner Resolverの評価ロジック・Formal Gateの意味は、ここでは一切変更しない。
 * このファイルは、既に計算済みの`RaceCardBridgeResult`（raceCardBridge.ts、無変更）を
 * 「その時点の変更不能な予想記録（FormalPredictionSnapshotRecord）」として
 * 1つの平坦なレコードにまとめるだけの層である。数値の再計算・再評価は一切行わない。
 *
 * 【絶対に守ること】
 *   - `bridgeResult.gate.formal !== true` の場合は例外を投げ、Formal Recordを
 *     構築しない（diagnostic/未確定のRunnerを含むSnapshotが正式Prediction Historyへ
 *     紛れ込むことを防ぐ、CHECKPOINT13.5B 12節）。
 *   - baseAbility/suitability/effectiveAbility/rank等の数値は、
 *     `bridgeResult.diagnosticSnapshot`（=buildGateConfirmedSnapshot()の出力そのもの）
 *     の値をそのままコピーするだけ。ここでraceScore/baseAbility等を再計算しない
 *     （4節: Production datasetが後日変化しても、保存済みSnapshotの値は変わらない）。
 */

import { buildAbilityBoard } from "../predictionSnapshot";
import type { AbilityBoardRow, PredictionStage } from "../predictionSnapshot";
import type { RaceCardBridgeResult } from "./raceCardBridge";
import type { RaceCardInput } from "./raceCardTypes";
import { getProductionDatasetVersionInfo } from "../horseAbilityData";
import type { DatasetVersionInfo } from "../datasetVersion";
import { fnv1a } from "../datasetVersion";
import type { HistoryCompleteness, HistoryConfidence } from "../abilityEvidence";
import type { MemberLevelEvidenceStatus } from "../memberLevelEvidence";
import type { Surface } from "../types";

export const FORMAL_SNAPSHOT_SCHEMA_VERSION = "formal-prediction-snapshot-v1";

/** 1頭ぶんの、正式保存用に平坦化したRunner Record */
export interface FormalSnapshotRunnerRecord {
  horseId: string;
  sourceHorseId: string | null;
  horseName: string;
  frame: number | null;
  horseNumber: number | null;
  assignedWeight: number | null;
  scratched: boolean;

  baseAbility: number | null;
  rankByBaseAbility: number | null;

  distanceSuitability: number | null;
  courseSuitability: number | null;
  goingSuitability: number | null;
  gateSuitability: number | null;

  overallSuitabilityPercent: number | null;
  overallConfidence: AbilityBoardRow["overallConfidence"];
  evaluatedComponentCount: number | null;

  effectiveAbility: number | null;
  rankByEffectiveAbility: number | null;

  predictionEligible: boolean;
  warnings: string[];

  abilityEvidenceCount: number | null;
  knownCareerRaceCount: number | null;
  historyCompleteness: HistoryCompleteness | null;
  historyConfidence: HistoryConfidence | null;
  shortCareer: boolean | null;
  memberLevelEvidenceStatus: MemberLevelEvidenceStatus | null;
}

/** goingがStage A時点で未確定だった事実をそのまま保存する（推測で埋めない、CHECKPOINT13.5B 9節） */
export interface FormalSnapshotGoingState {
  evaluated: boolean;
  going: string | null;
}

export interface FormalPredictionSnapshotRecord {
  snapshotId: string;

  raceId: string;
  raceDate: string;
  raceNumber: number | null;
  racecourse: string;
  surface: Surface;
  distance: number;
  scheduledStartTime: string;

  stage: PredictionStage;
  /** 常にtrue。formal=falseのSnapshotはこの型では表現しない（buildFormalPredictionSnapshotRecordが構築を拒否する） */
  formal: true;

  predictionCutoffAt: string;
  generatedAt: string;

  modelVersion: string;
  inputVersion: string;
  /** Base Ability V1 formula/algorithmのバージョンとdata/horses全体のfingerprintを含む（CHECKPOINT13.4C/D、無変更） */
  datasetVersion: DatasetVersionInfo;

  going: FormalSnapshotGoingState;

  /** 正式Predictionに使用したRace Card Inputをそのまま保存（Input Traceability、CHECKPOINT13.5B 8節） */
  raceCardInput: RaceCardInput;
  /** raceCardInputの内容から決定的に算出したfingerprint（fnv1a、datasetFingerprintと同じ方式） */
  raceCardFingerprint: string;

  runners: FormalSnapshotRunnerRecord[];

  totalRunners: number;
  predictionEligibleCount: number;

  warnings: string[];

  schemaVersion: string;
}

function buildSanitizedIdSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

/**
 * snapshotIdを決定的に構築する（CHECKPOINT13.5B 6節）。
 * raceId・stage・predictionCutoffAtの組から一意に定まる（同一レースでも
 * Stage AとStage Bは別snapshotIdになる。同一raceId/stageでもpredictionCutoffAtが
 * 異なれば別のsnapshotIdになり、過去recordを破壊しない）。
 */
export function buildFormalSnapshotId(raceId: string, stage: PredictionStage, predictionCutoffAt: string): string {
  return [buildSanitizedIdSegment(raceId), stage, buildSanitizedIdSegment(predictionCutoffAt)].join("__");
}

function computeRaceCardFingerprint(raceCard: RaceCardInput): string {
  // 決定的な文字列化のため、フィールドの並び順を固定して結合する（JSON.stringifyの
  // キー順に依存しない）。runnersはRace Card Input側の並び順をそのまま使う
  // （枠順確定前でも同じ並び順で入力されている前提。Runner Resolverの判定基準は
  // ここでは一切使わない、単なる内容ハッシュ）。
  const parts = [
    raceCard.raceId,
    raceCard.raceDate,
    String(raceCard.raceNumber),
    raceCard.racecourse,
    raceCard.surface,
    String(raceCard.distance),
    raceCard.scheduledStartTime,
    raceCard.going ?? "",
    ...raceCard.runners.map((r) =>
      [r.horseId ?? "", r.sourceHorseId ?? "", r.horseName, r.frame, r.horseNumber, r.assignedWeight ?? "", r.scratched].join("|"),
    ),
  ];
  return fnv1a(parts.join("\n"));
}

/**
 * RaceCardBridgeResult（raceCardBridge.ts、無変更）から、正式保存用の
 * FormalPredictionSnapshotRecordを構築する。
 *
 * bridgeResult.gate.formal !== true の場合は例外を投げる
 * （diagnostic Snapshotを正式recordとして構築させない、12節）。
 */
export function buildFormalPredictionSnapshotRecord(bridgeResult: RaceCardBridgeResult): FormalPredictionSnapshotRecord {
  if (!bridgeResult.gate.formal) {
    throw new Error(
      `Formal Gateを通過していないSnapshotは正式Prediction Historyとして構築できません（reasons: ${bridgeResult.gate.reasons.join(", ") || "unknown"}）`,
    );
  }

  const { raceCard, diagnosticSnapshot } = bridgeResult;
  const board = buildAbilityBoard(diagnosticSnapshot);
  const boardByHorseId = new Map<string, AbilityBoardRow>(board.map((row) => [row.horseId, row]));
  const snapshotEntryByHorseId = new Map(diagnosticSnapshot.runners.map((r) => [r.horseId, r]));

  const runners: FormalSnapshotRunnerRecord[] = raceCard.runners.map((rc, i) => {
    const rb = bridgeResult.runners[i];
    const horseId = rb.horseId;
    if (!horseId) {
      // gate.formal=trueはunresolved===0を要求するため、理論上ここには来ない。
      // 万一到達した場合は安全側で例外にする（黙って不完全なrecordを作らない）。
      throw new Error(`Formal Gate通過済みのはずのrunnerでhorseIdが未解決です: ${rc.horseName}`);
    }
    const row = boardByHorseId.get(horseId);
    const entry = snapshotEntryByHorseId.get(horseId);

    return {
      horseId,
      sourceHorseId: rc.sourceHorseId ?? null,
      horseName: rc.horseName,
      frame: rc.frame,
      horseNumber: rc.horseNumber,
      assignedWeight: rc.assignedWeight ?? null,
      scratched: rc.scratched,

      baseAbility: row?.baseAbility ?? null,
      rankByBaseAbility: row?.rankByBaseAbility ?? null,

      distanceSuitability: row?.distanceSuitability ?? null,
      courseSuitability: row?.courseSuitability ?? null,
      goingSuitability: row?.goingSuitability ?? null,
      gateSuitability: row?.gateSuitability ?? null,

      overallSuitabilityPercent: row?.overallSuitabilityPercent ?? null,
      overallConfidence: row?.overallConfidence ?? null,
      evaluatedComponentCount: row?.evaluatedComponentCount ?? null,

      effectiveAbility: row?.effectiveAbility ?? null,
      rankByEffectiveAbility: row?.rankByEffectiveAbility ?? null,

      predictionEligible: rb.predictionEligible,
      warnings: entry?.warnings ?? [],

      abilityEvidenceCount: entry?.abilityEvidence?.abilityEvidenceCount ?? null,
      knownCareerRaceCount: entry?.abilityEvidence?.knownCareerRaceCount ?? null,
      historyCompleteness: entry?.abilityEvidence?.historyCompleteness ?? null,
      historyConfidence: entry?.abilityEvidence?.historyConfidence ?? null,
      shortCareer: entry?.abilityEvidence?.shortCareer ?? null,
      memberLevelEvidenceStatus: entry?.memberLevelEvidenceStatus ?? null,
    };
  });

  const predictionCutoffAt = diagnosticSnapshot.predictionCutoffAt;
  const stage = diagnosticSnapshot.stage;

  // JSON往復して、呼び出し側が後から保持している参照を書き換えても
  // このrecordの中身が変化しないようにする（immutableの実効性を高める）。
  const raceCardInputCopy: RaceCardInput = JSON.parse(JSON.stringify(raceCard));

  return {
    snapshotId: buildFormalSnapshotId(raceCard.raceId, stage, predictionCutoffAt),

    raceId: raceCard.raceId,
    raceDate: raceCard.raceDate,
    raceNumber: raceCard.raceNumber,
    racecourse: raceCard.racecourse,
    surface: raceCard.surface,
    distance: raceCard.distance,
    scheduledStartTime: raceCard.scheduledStartTime,

    stage,
    formal: true,

    predictionCutoffAt,
    generatedAt: diagnosticSnapshot.generatedAt,

    modelVersion: diagnosticSnapshot.modelVersion,
    inputVersion: diagnosticSnapshot.inputVersion,
    datasetVersion: getProductionDatasetVersionInfo(),

    going: { evaluated: raceCard.going !== null, going: raceCard.going },

    raceCardInput: raceCardInputCopy,
    raceCardFingerprint: computeRaceCardFingerprint(raceCard),

    runners: JSON.parse(JSON.stringify(runners)),

    totalRunners: bridgeResult.summary.totalRunners,
    predictionEligibleCount: bridgeResult.summary.predictionEligible,

    warnings: [...diagnosticSnapshot.warnings],

    schemaVersion: FORMAL_SNAPSHOT_SCHEMA_VERSION,
  };
}

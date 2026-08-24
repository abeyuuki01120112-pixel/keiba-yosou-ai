/**
 * Prediction Snapshot（CHECKPOINT13・実戦適用基盤 V1）。
 *
 * 凍結済みのBase Ability V1・Suitability V1を、実際のレース出走馬全頭へ
 * 「レース結果を見る前」の時点で適用し、後から再現可能な形で固定する。
 *
 * 【最重要制約・絶対に守る】
 *   対象レース出走馬だけを抜き出してBase Abilityを再計算することは禁止。
 *   このファイルはbuildRaceHistory()を一切importせず、直接も間接にも呼び出さない。
 *   1頭分の過去走は必ず`getHorseRecentRaces()`（horseAbilityData.ts、CHECKPOINT13で追加）
 *   経由で取得する。これはdata/horses/全体を投入して起動時に一度だけ計算済みの
 *   historyByHorseIdを参照するだけであり、CHECKPOINT12.5/12.6で安全性を確認した
 *   正式経路そのものである。
 *
 *   effectiveAbility = baseAbility × overallSuitabilityPercent / 100
 *   （finalRaceAbility.tsと同じ式をこのファイル内で直接計算する。
 *   computeFinalRaceAbility()自体は呼ばない — RaceContext/trackBias/展開予測など
 *   CHECKPOINT13でまだ触らない領域まで計算してしまうため）。
 *
 *   Base Ability V1・Suitability V1の数式・component weight・confidence/coverage分離
 *   仕様はここでは一切変更しない。
 */

import { roundToOneDecimal } from "./raceScore";
import { calculateBaseAbility, RECENT_RACE_COUNT } from "./baseAbility";
import { computeSuitabilityV1 } from "./suitabilityV1";
import { getHorseRecentRaces } from "./horseAbilityData";
import type { RaceGateInput } from "./courseContextPrior";
import type { RacePerformance, Surface } from "./types";
import type { SuitabilityTargetRaceContext } from "./suitabilityTypes";
import type { SuitabilityV1Result } from "./suitabilityV1Types";

export const PREDICTION_SNAPSHOT_MODEL_VERSION = "ability-model-v1+suitability-v1";
export const PREDICTION_SNAPSHOT_INPUT_VERSION = "checkpoint13-v1";

/**
 * goingが未確定の時にtarget.goingへ渡すsentinel値。
 *
 * goingSuitability.ts の GOING_ORDER = ["良","稍重","重","不良"] のいずれとも
 * 一致しない文字列であれば何でもよい。goingIndex()がGOING_ORDER.indexOf()で
 * -1を返すため、getGoingMatchWeight()は対象馬の過去走が何件あっても必ず
 * weight=0を返し、sampleCount=0（=evaluated:false、raw/adjusted=100中立）に
 * 構造的に帰着する（goingSuitability.ts・suitabilityV1.ts自体は無変更）。
 * 実在するJRA馬場状態表記と衝突しない値であることが必須。
 */
export const GOING_UNKNOWN_SENTINEL = "unknown";

export type PredictionStage = "gateConfirmed" | "t2h";

/** 発走2時間前 */
export const T2H_OFFSET_MS = 2 * 60 * 60 * 1000;

/** 1頭分の出走馬入力。Stage A/Bどちらでも共通の形。呼び出し側はpredictionCutoffAt時点で確定していた情報のみを渡すこと */
export interface RaceEntryInput {
  horseId: string;
  horseName: string;
  /** 枠番。不明ならnull（推測しない） */
  frame: number | null;
  /** 馬番。不明ならnull */
  horseNumber: number | null;
  /** 斤量(kg)。Stage Aでは未確定のことがある。不明ならnull */
  carriedWeight: number | null;
  /** 出走取消 */
  scratched: boolean;
}

export interface SnapshotRaceTarget {
  raceId: string;
  raceName: string;
  /** ISO 8601 (YYYY-MM-DD) */
  raceDate: string;
  racecourse: string;
  surface: Surface;
  distance: number;
  /** 発走予定時刻（ISO 8601、T-2h算出に使う） */
  postTimeIso: string;
  /**
   * レース番号（1R〜12R）。CHECKPOINT13.1監査で不足が指摘された項目
   * （CHECKPOINT13.2で追加）。CHECKPOINT13の正式対象は毎週土日の各場11Rだが、
   * 今回はraceNumberを保持できるようにするだけで、フィルタリング機能は追加しない。
   * ability計算には使用しない（監査・識別専用）。不明ならnull。
   */
  raceNumber: number | null;
}

/**
 * goingの確定状況。推測で「良」等を埋めないための明示的な二値。
 * evaluated:falseの場合、target.goingにはGOING_UNKNOWN_SENTINELが使われ、
 * Suitability V1のgoing componentは構造的にevaluated:falseになる。
 */
export type SnapshotGoingInput = { evaluated: true; going: string } | { evaluated: false };

export interface HorseSnapshotEntry {
  horseId: string;
  horseName: string;
  frame: number | null;
  horseNumber: number | null;
  scratched: boolean;
  /**
   * 直近5走の均等平均（Ability Model V1凍結仕様）。
   * null＝過去走データが無く算出不能（「能力0点」と区別する。CLAUDE.md絶対原則4）。
   */
  baseAbility: number | null;
  /** Suitability V1の4component出力＋overallSuitabilityPercent/overallConfidence/evaluatedComponentCount。算出不能ならnull */
  suitability: SuitabilityV1Result | null;
  /** baseAbility × overallSuitabilityPercent / 100。baseAbilityがnullならnull */
  effectiveAbility: number | null;
  warnings: string[];
  /**
   * Data Completeness Reportの機械可読な検知コード一覧（CHECKPOINT13.2で追加）。
   * warningsは人間向けの自由文、completenessFlagsは`missingDataReport.ts`等の
   * 後続処理がコード名で判定できるようにするための構造化フィールド。
   * 値はraceScore/baseAbility/Suitability V1の計算結果には一切影響しない
   * （検知・報告専用）。
   *   "insufficientRecentHistory": 過去走が1件はあるがRECENT_RACE_COUNT
   *     （Base Ability V1既存仕様の直近5走窓）未満で、baseAbilityが完全な
   *     5走平均ではない可能性がある。
   *   "memberLevelUnavailable": baseAbility算出に使った走のいずれかで、
   *     出走馬の候補が1頭も無くmemberLevelがFALLBACK値になっていた。
   *   "placeholderDataExcluded": この馬の過去走の一部/全部がdataKind=
   *     "placeholder"/"fixture"のため、baseAbility/Suitability算出から除外した。
   */
  completenessFlags: string[];
}

/** Stage B用：発走2時間前時点で保存してよいオッズ情報の置き場所。能力計算には一切使用しない */
export interface OddsSnapshotEntry {
  horseId: string;
  odds: number | null;
  popularity: number | null;
  recordedAt: string;
}

export interface SnapshotDataCompleteness {
  totalRunners: number;
  scratchedCount: number;
  /** 出走取消を除く頭数のうち、baseAbilityが算出できた頭数 */
  baseAbilityAvailableCount: number;
  /** 出走取消を除く頭数のうち、4component全てevaluated:trueだった頭数 */
  fourComponentEvaluatedCount: number;
}

export interface PredictionSnapshot {
  raceId: string;
  raceStatus: "scheduled";
  stage: PredictionStage;
  /** この時刻より後の情報は使っていないことを保証する境界時刻（ISO） */
  predictionCutoffAt: string;
  /** 実際にこのSnapshotを生成した時刻（ISO） */
  generatedAt: string;
  raceTarget: SnapshotRaceTarget;
  runners: HorseSnapshotEntry[];
  /** Stage Bでのみ利用。能力計算には使用しない（CHECKPOINT13 STEP7） */
  odds: OddsSnapshotEntry[] | null;
  inputVersion: string;
  modelVersion: string;
  dataCompleteness: SnapshotDataCompleteness;
  warnings: string[];
}

/** レース中止・開催不成立の状態。代替レースを後から選ばず、この状態として保存する */
export interface RaceNotHeldSnapshot {
  raceId: string;
  raceStatus: "raceNotHeld";
  reason: string;
  recordedAt: string;
}

export function buildRaceNotHeldSnapshot(raceId: string, reason: string, recordedAt: string): RaceNotHeldSnapshot {
  return { raceId, raceStatus: "raceNotHeld", reason, recordedAt };
}

export function computeT2hCutoff(postTimeIso: string): string {
  return new Date(Date.parse(postTimeIso) - T2H_OFFSET_MS).toISOString();
}

/**
 * 1頭分のHorseSnapshotEntryを構築する。
 *
 * predictionCutoffAtより前の過去走だけを使う（future leakage防止）。
 * getHorseRecentRaces()は対象馬自身の全履歴（新しい順）を返すため、
 * ここでraceDateがpredictionCutoffAt以降の走を除外してから
 * calculateBaseAbility()・computeSuitabilityV1()（どちらも凍結済み・無変更）に渡す。
 */
/**
 * dataKindが"real"（またはundefined/null＝既存データとの後方互換）の走だけを残す。
 * "placeholder"/"fixture"は正式なStage A/B Snapshotの計算対象から除外する
 * （CHECKPOINT13.1で発見されたV0プレースホルダーデータの混入防止、CHECKPOINT13.2 STEP10/11）。
 */
function excludeNonRealData(races: RacePerformance[]): { real: RacePerformance[]; excludedCount: number } {
  const real = races.filter((r) => r.dataKind == null || r.dataKind === "real");
  return { real, excludedCount: races.length - real.length };
}

export function buildHorseSnapshotEntry(
  entry: RaceEntryInput,
  raceTarget: SnapshotRaceTarget,
  going: SnapshotGoingInput,
  predictionCutoffAt: string,
  fieldSize: number | null,
): HorseSnapshotEntry {
  const warnings: string[] = [];
  const completenessFlags: string[] = [];

  if (entry.scratched) {
    warnings.push("出走取消のため、baseAbility/Suitability/effectiveAbilityは算出していません。");
    return {
      horseId: entry.horseId,
      horseName: entry.horseName,
      frame: entry.frame,
      horseNumber: entry.horseNumber,
      scratched: true,
      baseAbility: null,
      suitability: null,
      effectiveAbility: null,
      warnings,
      completenessFlags,
    };
  }

  const cutoffMs = Date.parse(predictionCutoffAt);
  const beforeCutoff = getHorseRecentRaces(entry.horseId).filter((r) => Date.parse(r.raceDate) < cutoffMs);
  const { real: priorRaces, excludedCount: placeholderExcludedCount } = excludeNonRealData(beforeCutoff);

  if (placeholderExcludedCount > 0) {
    completenessFlags.push("placeholderDataExcluded");
    warnings.push(
      `過去走${placeholderExcludedCount}件がdataKind=placeholder/fixtureのため、baseAbility/Suitability算出から除外しました（正式な実データではありません）。`,
    );
  }

  if (priorRaces.length === 0) {
    completenessFlags.push("insufficientRecentHistory");
    warnings.push(
      "predictionCutoffAtより前の実データ過去走が無いため、baseAbility算出不能です（能力0点ではなくデータ不足を意味します）。",
    );
    return {
      horseId: entry.horseId,
      horseName: entry.horseName,
      frame: entry.frame,
      horseNumber: entry.horseNumber,
      scratched: false,
      baseAbility: null,
      suitability: null,
      effectiveAbility: null,
      warnings,
      completenessFlags,
    };
  }

  const baseAbility = calculateBaseAbility(priorRaces);

  if (priorRaces.length < RECENT_RACE_COUNT) {
    completenessFlags.push("insufficientRecentHistory");
    warnings.push(
      `baseAbility算出に使える実データ過去走が${priorRaces.length}走のみです（Base Ability V1の既存仕様どおり直近最大${RECENT_RACE_COUNT}走の均等平均だが、今回はそれ未満）。`,
    );
  }
  if (priorRaces.slice(0, RECENT_RACE_COUNT).some((r) => r.memberLevelBreakdown === null)) {
    completenessFlags.push("memberLevelUnavailable");
    warnings.push(
      "baseAbility算出に使った走のうち少なくとも1走で、当時の対戦相手データ不足によりmemberLevelがフォールバック値（FALLBACK_MEMBER_LEVEL_SCORE）で計算されていました。",
    );
  }

  const target: SuitabilityTargetRaceContext = {
    racecourse: raceTarget.racecourse,
    surface: raceTarget.surface,
    distance: raceTarget.distance,
    going: going.evaluated ? going.going : GOING_UNKNOWN_SENTINEL,
  };
  const gate: RaceGateInput = {
    horseNumber: entry.horseNumber,
    fieldSize,
    frame: entry.frame,
  };

  const suitability = computeSuitabilityV1({
    horseId: entry.horseId,
    recentRaces: priorRaces,
    target,
    gate,
  });

  if (!going.evaluated) {
    warnings.push(
      "馬場状態が未確定のため、going適性はevaluated=falseとして扱っています（推測で「良」等を補完していません）。",
    );
  }
  if (suitability.evaluatedComponentCount === 0) {
    warnings.push("distance/course/going/gateいずれも評価不能でした（overallSuitabilityPercentは中立100%固定）。");
  }

  const effectiveAbility = roundToOneDecimal((baseAbility * suitability.overallSuitabilityPercent) / 100);

  return {
    horseId: entry.horseId,
    horseName: entry.horseName,
    frame: entry.frame,
    horseNumber: entry.horseNumber,
    scratched: false,
    baseAbility,
    suitability,
    effectiveAbility,
    warnings,
    completenessFlags,
  };
}

function buildDataCompleteness(runners: HorseSnapshotEntry[]): SnapshotDataCompleteness {
  const active = runners.filter((r) => !r.scratched);
  return {
    totalRunners: runners.length,
    scratchedCount: runners.length - active.length,
    baseAbilityAvailableCount: active.filter((r) => r.baseAbility !== null).length,
    fourComponentEvaluatedCount: active.filter((r) => r.suitability?.evaluatedComponentCount === 4).length,
  };
}

function collectSnapshotWarnings(runners: HorseSnapshotEntry[]): string[] {
  const warnings: string[] = [];
  for (const r of runners) {
    for (const w of r.warnings) {
      warnings.push(`${r.horseName}(${r.horseId}): ${w}`);
    }
  }
  return warnings;
}

function buildRunners(
  entries: RaceEntryInput[],
  raceTarget: SnapshotRaceTarget,
  going: SnapshotGoingInput,
  predictionCutoffAt: string,
): HorseSnapshotEntry[] {
  const fieldSize = entries.filter((e) => !e.scratched).length;
  return entries.map((entry) => buildHorseSnapshotEntry(entry, raceTarget, going, predictionCutoffAt, fieldSize));
}

export interface BuildGateConfirmedSnapshotInput {
  raceTarget: SnapshotRaceTarget;
  /** 正式な枠順確定後の出走馬一覧 */
  entries: RaceEntryInput[];
  /** Stage A時点で実際のレース時馬場が確定していない場合はevaluated:false（推測で埋めない） */
  going: SnapshotGoingInput;
  /** Snapshotを生成した時刻（ISO）。predictionCutoffAtとしても使う＝この時刻以降の情報は使わない */
  generatedAt: string;
}

/** Stage A — Gate Confirmed Snapshot。トリガー：正式な枠順確定後 */
export function buildGateConfirmedSnapshot(input: BuildGateConfirmedSnapshotInput): PredictionSnapshot {
  const predictionCutoffAt = input.generatedAt;
  const runners = buildRunners(input.entries, input.raceTarget, input.going, predictionCutoffAt);
  return {
    raceId: input.raceTarget.raceId,
    raceStatus: "scheduled",
    stage: "gateConfirmed",
    predictionCutoffAt,
    generatedAt: input.generatedAt,
    raceTarget: input.raceTarget,
    runners,
    odds: null,
    inputVersion: PREDICTION_SNAPSHOT_INPUT_VERSION,
    modelVersion: PREDICTION_SNAPSHOT_MODEL_VERSION,
    dataCompleteness: buildDataCompleteness(runners),
    warnings: collectSnapshotWarnings(runners),
  };
}

export interface BuildT2hSnapshotInput {
  raceTarget: SnapshotRaceTarget;
  /** T-2h時点で確定している正式出走馬一覧（出走取消・枠順・斤量反映済み） */
  entries: RaceEntryInput[];
  /** T-2h時点のJRA公式馬場状態。評価可能なら再評価する */
  going: SnapshotGoingInput;
  /** Snapshotを実際に生成した時刻（ISO）。predictionCutoffAtは発走2時間前で別途固定される */
  generatedAt: string;
  /** Stage Bでのみ保存可能。能力計算には使用しない */
  odds?: OddsSnapshotEntry[] | null;
}

/** Stage B — T-2h Snapshot。トリガー：各レース発走予定時刻の2時間前 */
export function buildT2hSnapshot(input: BuildT2hSnapshotInput): PredictionSnapshot {
  const predictionCutoffAt = computeT2hCutoff(input.raceTarget.postTimeIso);
  const runners = buildRunners(input.entries, input.raceTarget, input.going, predictionCutoffAt);
  return {
    raceId: input.raceTarget.raceId,
    raceStatus: "scheduled",
    stage: "t2h",
    predictionCutoffAt,
    generatedAt: input.generatedAt,
    raceTarget: input.raceTarget,
    runners,
    odds: input.odds ?? null,
    inputVersion: PREDICTION_SNAPSHOT_INPUT_VERSION,
    modelVersion: PREDICTION_SNAPSHOT_MODEL_VERSION,
    dataCompleteness: buildDataCompleteness(runners),
    warnings: collectSnapshotWarnings(runners),
  };
}

/** Ability Board の1行（CHECKPOINT13 STEP8） */
export interface AbilityBoardRow {
  horseId: string;
  horseName: string;
  frame: number | null;
  horseNumber: number | null;
  scratched: boolean;
  baseAbility: number | null;
  distanceSuitability: number | null;
  courseSuitability: number | null;
  goingSuitability: number | null;
  gateSuitability: number | null;
  overallSuitabilityPercent: number | null;
  effectiveAbility: number | null;
  overallConfidence: SuitabilityV1Result["overallConfidence"] | null;
  evaluatedComponentCount: number | null;
  warnings: string[];
  rankByBaseAbility: number | null;
  rankByEffectiveAbility: number | null;
}

/** 降順ランク（1位が最大値）。null（出走取消・データ不足）はランク対象外でnullのまま */
function computeDescendingRanks(values: (number | null)[]): (number | null)[] {
  const withIndex = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null)
    .sort((a, b) => b.v - a.v);

  const ranks: (number | null)[] = values.map(() => null);
  withIndex.forEach(({ i }, order) => {
    ranks[i] = order + 1;
  });
  return ranks;
}

/**
 * SnapshotからAbility Boardを構築する。Base Ability順位とEffective Ability順位の
 * 両方を保持する（CHECKPOINT13 STEP8の重要事項：適性で誰が上がり誰が下がったか
 * 確認できる状態にする）。
 */
export function buildAbilityBoard(snapshot: PredictionSnapshot): AbilityBoardRow[] {
  const baseAbilityRanks = computeDescendingRanks(snapshot.runners.map((r) => r.baseAbility));
  const effectiveAbilityRanks = computeDescendingRanks(snapshot.runners.map((r) => r.effectiveAbility));

  return snapshot.runners.map((r, i) => ({
    horseId: r.horseId,
    horseName: r.horseName,
    frame: r.frame,
    horseNumber: r.horseNumber,
    scratched: r.scratched,
    baseAbility: r.baseAbility,
    distanceSuitability: r.suitability?.distance.adjustedPercent ?? null,
    courseSuitability: r.suitability?.course.adjustedPercent ?? null,
    goingSuitability: r.suitability?.going.adjustedPercent ?? null,
    gateSuitability: r.suitability?.gate.adjustedPercent ?? null,
    overallSuitabilityPercent: r.suitability?.overallSuitabilityPercent ?? null,
    effectiveAbility: r.effectiveAbility,
    overallConfidence: r.suitability?.overallConfidence ?? null,
    evaluatedComponentCount: r.suitability?.evaluatedComponentCount ?? null,
    warnings: r.warnings,
    rankByBaseAbility: baseAbilityRanks[i],
    rankByEffectiveAbility: effectiveAbilityRanks[i],
  }));
}

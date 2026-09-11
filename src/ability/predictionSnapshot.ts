/**
 * Prediction Snapshot（CHECKPOINT13・実戦適用基盤 V1）。
 *
 * 凍結済みのBase Ability V1・Suitability V1を、実際のレース出走馬全頭へ
 * 「レース結果を見る前」の時点で適用し、後から再現可能な形で固定する。
 *
 * 【最重要制約・絶対に守る】
 *   対象レース出走馬だけを抜き出してBase Abilityを再計算することは禁止。
 *   このファイルはbuildRaceHistory()を直接importしない。P0-1以降は
 *   getHorseRecentRacesAsOf()から、対象結果・cutoff後の情報を除いた全馬集合で
 *   生成済みのRacePerformanceを取得する（対象出走馬だけの再計算はしない）。
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
import { assertPredictionCutoff, isPriorPerformance, predictionTimestamp } from "./predictionBoundary";
import { selectOddsSnapshotsAsOf, type OddsSnapshotDiagnostic, type OddsSnapshotEntry } from "./oddsSnapshot";
import { calculateBaseAbility, RECENT_RACE_COUNT } from "./baseAbility";
import { computeSuitabilityV1 } from "./suitabilityV1";
import { getCareerCountRecord, getHorseRecentRacesAsOf, getRaceFieldPriorRaceCountsAsOf } from "./horseAbilityData";
import { resolveAbilityEvidence, type AbilityEvidence } from "./abilityEvidence";
import { resolveMemberLevelEvidence, type MemberLevelEvidenceStatus } from "./memberLevelEvidence";
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
   *   "placeholderDataExcluded": この馬の過去走の一部/全部がdataKind=
   *     "placeholder"/"fixture"のため、baseAbility/Suitability算出から除外した。
   *   "insufficient_evidence" / "career_history_completeness_unknown" /
   *     "incomplete_recent_history": Short Career Eligibility V1（CHECKPOINT13.4G、
   *     abilityEvidence.ts）による判定。詳細はabilityEvidenceフィールド参照。
   *
   * memberLevel fallback（当時の対戦相手データ不足によりFALLBACK_MEMBER_LEVEL_SCOREを
   * 使用したこと）は、Base Ability V1の正式fallback仕様でraceScore/baseAbility自体は
   * 正式に生成可能なため、completenessFlagsには含めない（Formal Gate正式方針、
   * rescue正式化ラウンド）。事実自体はwarningsへ残す。structural_no_prior_historyと同じ扱い。
   */
  completenessFlags: string[];
  /**
   * Short Career Eligibility V1（CHECKPOINT13.4G）の評価結果。baseAbility算出に
   * 使った走数・キャリア完全性・証拠量のconfidenceを、baseAbilityの数値とは
   * 分離して保持する（「4走だから減点」等は一切行わない）。
   * scratchedまたは過去走0件（baseAbility=null）の場合はnull。
   */
  abilityEvidence: AbilityEvidence | null;
  /**
   * MemberLevel Evidence V1（CHECKPOINT13.4J）。baseAbility算出に使った走
   * （最大RECENT_RACE_COUNT走）を横断した、memberLevel fallbackの原因の要約。
   *   "available": 全走でmemberLevelが正式計算できていた。
   *   "missing_data": 少なくとも1走でfallbackが発生し、かつcanonical datasetに
   *     本来存在するはずの対戦馬prior raceがまだ取り込まれていない可能性がある
   *     （predictionEligibleをblockする）。
   *   "structural_no_prior_history": fallbackが発生した走は全て、対戦馬全員が
   *     source-backedなcareer debutで、prior raceが構造的に存在し得ないケース
   *     のみ（predictionEligibleをblockしない。memberLevelScoreAtRace自体は
   *     引き続きFALLBACK_MEMBER_LEVEL_SCOREのまま、baseAbilityへの追加補正も無い）。
   * scratchedまたは過去走0件の場合はnull。
   */
  memberLevelEvidenceStatus: MemberLevelEvidenceStatus | null;
}

export type { OddsSnapshotEntry } from "./oddsSnapshot";

export interface PredictionOddsStatus {
  market: "win";
  winOddsComplete: boolean;
  missingHorseIds: string[];
  diagnostics: OddsSnapshotDiagnostic[];
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
  /** Stage A/Bで利用可能。能力・Suitability・Probability計算には使用しない。 */
  odds: OddsSnapshotEntry[] | null;
  /** 後続EV計算へ進めるオッズ充足状況。Probabilityの可否には影響しない。 */
  oddsStatus: PredictionOddsStatus;
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
function excludeNonRealData(races: readonly RacePerformance[]): { real: RacePerformance[]; excludedCount: number } {
  const real = races.filter((r) => r.dataKind == null || r.dataKind === "real");
  return { real, excludedCount: races.length - real.length };
}

export function buildHorseSnapshotEntry(
  entry: RaceEntryInput,
  raceTarget: SnapshotRaceTarget,
  going: SnapshotGoingInput,
  predictionCutoffAt: string,
  fieldSize: number | null,
  horseHistories?: Readonly<Record<string, readonly RacePerformance[]>>,
): HorseSnapshotEntry {
  predictionTimestamp(predictionCutoffAt, "predictionCutoffAt");
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
      abilityEvidence: null,
      memberLevelEvidenceStatus: null,
    };
  }

  const beforeCutoff = horseHistories == null
    ? getHorseRecentRacesAsOf(entry.horseId, raceTarget, predictionCutoffAt)
    : (horseHistories[entry.horseId] ?? []).filter((race) =>
        isPriorPerformance(race, raceTarget, predictionCutoffAt),
      );
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
      abilityEvidence: null,
      memberLevelEvidenceStatus: null,
    };
  }

  const baseAbility = calculateBaseAbility(priorRaces);

  const abilityEvidence = resolveAbilityEvidence(
    priorRaces.length,
    getCareerCountRecord(entry.horseId),
    predictionCutoffAt,
  );
  if (abilityEvidence.blockingReason !== null) {
    completenessFlags.push(abilityEvidence.blockingReason);
  }
  if (abilityEvidence.abilityEvidenceCount < RECENT_RACE_COUNT) {
    const shortCareerNote = abilityEvidence.shortCareer
      ? "（キャリア全体を把握済みの短キャリア馬として扱っています。baseAbilityの数値自体は減点していません）"
      : "";
    warnings.push(
      `baseAbility算出に使える実データ過去走が${priorRaces.length}走のみです（Base Ability V1の既存仕様どおり直近最大${RECENT_RACE_COUNT}走の均等平均だが、今回はそれ未満）。${shortCareerNote}`,
    );
  }
  const usedRaces = priorRaces.slice(0, RECENT_RACE_COUNT);
  const memberLevelEvidences = usedRaces.map((r) =>
    resolveMemberLevelEvidence(
      r,
      r.memberLevelBreakdown === null
        ? horseHistories == null
          ? getRaceFieldPriorRaceCountsAsOf(r.raceId, r.raceDate, raceTarget, predictionCutoffAt)
          : Object.values(horseHistories)
              .filter((races) => races.some((race) => race.raceId === r.raceId))
              .map((races) => races.filter((race) => race.raceDate < r.raceDate).length)
        : [],
    ),
  );
  const memberLevelEvidenceStatus: MemberLevelEvidenceStatus = memberLevelEvidences.some(
    (e) => e.memberLevelEvidenceStatus === "missing_data",
  )
    ? "missing_data"
    : memberLevelEvidences.some((e) => e.memberLevelEvidenceStatus === "structural_no_prior_history")
      ? "structural_no_prior_history"
      : "available";

  if (memberLevelEvidenceStatus === "missing_data") {
    // Formal Gate正式方針（rescue正式化ラウンド）: Base Ability V1にはmemberLevel取得不能時の
    // 正式fallback（FALLBACK_MEMBER_LEVEL_SCORE）が既に存在し、raceScore/baseAbility自体は
    // 正式に生成可能である。したがってmemberLevel fallbackの使用だけを理由に
    // predictionEligibleをblockしない（completenessFlagsへは追加しない。structural_no_prior_history
    // と同じ扱い）。fallback使用の事実自体はwarningsへ必ず残す。
    warnings.push(
      "baseAbility算出に使った走のうち少なくとも1走で、当時の対戦相手データ不足によりmemberLevelがフォールバック値（FALLBACK_MEMBER_LEVEL_SCORE）で計算されていました。",
    );
  } else if (memberLevelEvidenceStatus === "structural_no_prior_history") {
    // CHECKPOINT13.4J: 対戦馬全員がsource-backedなcareer debutで、prior raceが
    // 構造的に存在し得ないケース。データ欠損ではないため、これだけを理由に
    // predictionEligibleをblockしない（completenessFlagsへは追加しない）。
    // memberLevelScoreAtRace自体は引き続きFALLBACK_MEMBER_LEVEL_SCOREのまま、
    // baseAbilityへの追加補正も行わない。
    warnings.push(
      "baseAbility算出に使った走のうち少なくとも1走は、対戦馬全員がキャリア初戦（新馬戦等）であることが確認できたため、memberLevelはフォールバック値（FALLBACK_MEMBER_LEVEL_SCORE）のままです。これはデータ欠損ではなく、Evidenceが構造的に存在しないケースです。",
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
    abilityEvidence,
    memberLevelEvidenceStatus,
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

function buildOddsState(
  raceTarget: SnapshotRaceTarget,
  entries: readonly RaceEntryInput[],
  predictionCutoffAt: string,
  odds: readonly OddsSnapshotEntry[] | null | undefined,
  canonicalHorseIds?: ReadonlySet<string>,
): { odds: OddsSnapshotEntry[] | null; oddsStatus: PredictionOddsStatus } {
  const activeHorseIds = entries.filter((entry) => !entry.scratched).map((entry) => entry.horseId);
  const selection = selectOddsSnapshotsAsOf({
    raceId: raceTarget.raceId,
    predictionCutoffAt,
    canonicalHorseIds: canonicalHorseIds ?? new Set(entries.map((entry) => entry.horseId)),
    requiredWinHorseIds: activeHorseIds,
    snapshots: odds ?? [],
  });
  return {
    odds: odds == null ? null : selection.selected,
    oddsStatus: {
      market: "win",
      winOddsComplete: selection.winOddsComplete,
      missingHorseIds: selection.missingWinOddsHorseIds,
      diagnostics: selection.diagnostics,
    },
  };
}

function buildRunners(
  entries: RaceEntryInput[],
  raceTarget: SnapshotRaceTarget,
  going: SnapshotGoingInput,
  predictionCutoffAt: string,
  horseHistories?: Readonly<Record<string, readonly RacePerformance[]>>,
): HorseSnapshotEntry[] {
  const fieldSize = entries.filter((e) => !e.scratched).length;
  return entries.map((entry) =>
    buildHorseSnapshotEntry(entry, raceTarget, going, predictionCutoffAt, fieldSize, horseHistories),
  );
}

export interface BuildGateConfirmedSnapshotInput {
  raceTarget: SnapshotRaceTarget;
  /** 正式な枠順確定後の出走馬一覧 */
  entries: RaceEntryInput[];
  /** Stage A時点で実際のレース時馬場が確定していない場合はevaluated:false（推測で埋めない） */
  going: SnapshotGoingInput;
  /** Snapshotを生成した時刻（ISO）。predictionCutoffAtとしても使う＝この時刻以降の情報は使わない */
  generatedAt: string;
  /** Collector接続済みのcanonical Horse History。省略時はproduction履歴を使う。 */
  horseHistories?: Readonly<Record<string, readonly RacePerformance[]>>;
  /** cutoff時点までに観測済みのOdds Snapshot候補。能力計算には使用しない。 */
  odds?: readonly OddsSnapshotEntry[] | null;
  /** Collector等で解決済みと確認できたcanonical horseId集合。 */
  oddsCanonicalHorseIds?: ReadonlySet<string>;
}

/** Stage A — Gate Confirmed Snapshot。トリガー：正式な枠順確定後 */
export function buildGateConfirmedSnapshot(input: BuildGateConfirmedSnapshotInput): PredictionSnapshot {
  const predictionCutoffAt = input.generatedAt;
  assertPredictionCutoff(predictionCutoffAt, input.raceTarget);
  const runners = buildRunners(
    input.entries,
    input.raceTarget,
    input.going,
    predictionCutoffAt,
    input.horseHistories,
  );
  const oddsState = buildOddsState(
    input.raceTarget,
    input.entries,
    predictionCutoffAt,
    input.odds,
    input.oddsCanonicalHorseIds,
  );
  return {
    raceId: input.raceTarget.raceId,
    raceStatus: "scheduled",
    stage: "gateConfirmed",
    predictionCutoffAt,
    generatedAt: input.generatedAt,
    raceTarget: input.raceTarget,
    runners,
    odds: oddsState.odds,
    oddsStatus: oddsState.oddsStatus,
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
  /** cutoff時点までのOdds Snapshot。能力計算には使用しない。 */
  odds?: readonly OddsSnapshotEntry[] | null;
  /** Collector等で解決済みと確認できたcanonical horseId集合。 */
  oddsCanonicalHorseIds?: ReadonlySet<string>;
  /** Collector接続済みのcanonical Horse History。省略時はproduction履歴を使う。 */
  horseHistories?: Readonly<Record<string, readonly RacePerformance[]>>;
}

/** Stage B — T-2h Snapshot。トリガー：各レース発走予定時刻の2時間前 */
export function buildT2hSnapshot(input: BuildT2hSnapshotInput): PredictionSnapshot {
  const predictionCutoffAt = computeT2hCutoff(input.raceTarget.postTimeIso);
  assertPredictionCutoff(predictionCutoffAt, input.raceTarget);
  const runners = buildRunners(
    input.entries,
    input.raceTarget,
    input.going,
    predictionCutoffAt,
    input.horseHistories,
  );
  const oddsState = buildOddsState(
    input.raceTarget,
    input.entries,
    predictionCutoffAt,
    input.odds,
    input.oddsCanonicalHorseIds,
  );
  return {
    raceId: input.raceTarget.raceId,
    raceStatus: "scheduled",
    stage: "t2h",
    predictionCutoffAt,
    generatedAt: input.generatedAt,
    raceTarget: input.raceTarget,
    runners,
    odds: oddsState.odds,
    oddsStatus: oddsState.oddsStatus,
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

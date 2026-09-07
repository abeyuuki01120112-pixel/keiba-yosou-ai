/**
 * HorseEvidence collector（CHECKPOINT 10.4）。
 *
 * 【重要】このファイルは「対象馬自身が、指定コース条件でどう走ってきたか」を事実として
 * 抽出するだけの器（データ抽出レイヤー）である。scoreもconfidence段階（high/medium/low）も
 * 一切算出しない。gateBiasLevel・gateCoefficient等のCourseContextPrior由来の値も
 * 参照・混入しない（courseContextPrior.tsからはcalculateRelativeGatePosition関数のみを
 * 再利用する。これはhorseNumber/fieldSizeからrelativeGatePositionを安全に計算する
 * null-safeユーティリティであり、CoursePriorの値そのものではない）。
 *
 * baseAbility/raceScore/memberLevel V1のいずれも変更・参照しない、完全に独立したモジュール。
 *
 * スコープ外（次CHECKPOINT以降の判断事項）:
 *   - sampleCountからconfidence（high/medium/low）への変換
 *   - gate補正percent・MAX_WIDTH等の数値補正
 *   - Suitability V1・effectiveAbilityへの接続
 */

import { calculateRelativeGatePosition } from "./courseContextPrior";
import type { RacePerformance, Surface } from "./types";

/**
 * collectHorseGateEvidenceが実際に読む項目だけを型として要求する。
 * RacePerformance全体（raceScore等の算出済みスコア一式）を要求しないことで、
 * このモジュールがAbility Model V1のスコア計算結果に一切依存しないことを型でも保証する。
 * RacePerformance[]はそのまま渡せる（構造的部分型のため代入互換）。
 */
export type HorseEvidenceSourceRace = Pick<
  RacePerformance,
  "raceId" | "raceDate" | "racecourse" | "surface" | "distance" | "gate" | "horseNumber" | "fieldSize" | "finishPosition"
>;

/** 対象とするコース条件（完全一致で絞り込む）。going（馬場状態）はここでは条件に含めない */
export interface HorseEvidenceCourseCondition {
  racecourse: string;
  surface: Surface;
  distance: number;
}

/** 抽出された1走分の事実。frame/horseNumber/fieldSizeが無い場合は推測せずnull */
export interface HorseEvidenceRun {
  raceId: string;
  raceDate: string;
  frame: number | null;
  horseNumber: number | null;
  fieldSize: number | null;
  /**
   * (horseNumber - 1) / (fieldSize - 1)。fieldSize<=1、horseNumber/fieldSizeが不明、
   * horseNumber > fieldSizeのいずれかに該当する場合はnull（推測しない）。
   */
  relativeGatePosition: number | null;
  finishPosition: number;
}

/**
 * STEP7: confidence段階へは変換しない、素材としてのカウントのみ。
 * targetCondition（racecourse×surface×distanceの完全一致）とは別に、
 * 部分一致の件数も事実として保持する（将来の確信度設計の材料）。
 */
export interface HorseEvidenceFactCounts {
  /** racecourseのみ一致（surface/distance不問） */
  sameCourseCount: number;
  /** distanceのみ一致（racecourse/surface不問） */
  sameDistanceCount: number;
  /** surfaceのみ一致（racecourse/distance不問） */
  sameSurfaceCount: number;
  /** racecourse×distanceが一致（surface不問） */
  sameCourseDistanceCount: number;
}

export interface HorseEvidence {
  horseId: string;
  targetCondition: HorseEvidenceCourseCondition;
  /** targetCondition（racecourse×surface×distance完全一致）に該当した走数 = runs.length */
  sampleCount: number;
  runs: HorseEvidenceRun[];
  factCounts: HorseEvidenceFactCounts;
}

/**
 * 対象馬の過去RacePerformanceから、指定コース条件（racecourse×surface×distance完全一致）に
 * 該当する走歴を抽出する。scoring/confidence段階付けは一切行わない（事実の抽出のみ）。
 *
 * @param horseId 対象馬のhorseId（呼び出し側が把握しているIDをそのまま保持するだけで、
 *                historyの中身とは突合しない）
 * @param history 対象馬自身の過去走配列（他馬のデータを混入させないこと）。RacePerformance[]を
 *                そのまま渡せる（scoring結果は読まないため型上も要求しない）
 * @param targetCondition 絞り込み条件（racecourse×surface×distanceの完全一致）
 */
export function collectHorseGateEvidence(
  horseId: string,
  history: readonly HorseEvidenceSourceRace[],
  targetCondition: HorseEvidenceCourseCondition,
): HorseEvidence {
  const matchesTarget = (race: HorseEvidenceSourceRace): boolean =>
    race.racecourse === targetCondition.racecourse &&
    race.surface === targetCondition.surface &&
    race.distance === targetCondition.distance;

  const matched = history.filter(matchesTarget);

  const runs: HorseEvidenceRun[] = matched
    .map((race) => {
      const frame = race.gate ?? null;
      const horseNumber = race.horseNumber ?? null;
      const fieldSize = race.fieldSize ?? null;
      return {
        raceId: race.raceId,
        raceDate: race.raceDate,
        frame,
        horseNumber,
        fieldSize,
        relativeGatePosition: calculateRelativeGatePosition(horseNumber, fieldSize),
        finishPosition: race.finishPosition,
      };
    })
    // 日付昇順（古い順）に揃える。future leakage防止のための特別な意味は無く、
    // 単に監査・表示時の可読性のための決定的な並び順。
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate));

  const factCounts: HorseEvidenceFactCounts = {
    sameCourseCount: history.filter((race) => race.racecourse === targetCondition.racecourse).length,
    sameDistanceCount: history.filter((race) => race.distance === targetCondition.distance).length,
    sameSurfaceCount: history.filter((race) => race.surface === targetCondition.surface).length,
    sameCourseDistanceCount: history.filter(
      (race) => race.racecourse === targetCondition.racecourse && race.distance === targetCondition.distance,
    ).length,
  };

  return {
    horseId,
    targetCondition,
    sampleCount: runs.length,
    runs,
    factCounts,
  };
}

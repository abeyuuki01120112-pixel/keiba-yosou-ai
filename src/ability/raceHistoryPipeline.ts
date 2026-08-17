/**
 * 全馬の過去走データから、実質メンバーレベル・走破タイムスコア・上がり3Fスコア込みの
 * RacePerformance[] を組み立てるパイプライン。
 *
 * 未来情報リーク・循環参照を防ぐ方法（memberLevelScoreAtRace）：
 *   全馬・全レースをレース日付の「昇順（古い順）」に処理する。
 *   あるレースの memberLevelScoreAtRace を計算するときは、
 *   そのレースより厳密に前の日付で「すでに確定済み」の各出走馬の raceScore
 *   （abilityBeforeRace）だけを参照する。同じ日付の他レースや、まだ処理していない
 *   将来のレースは一切参照しない。これにより、
 *     馬AのraceScore → memberLevelScore → 同じレースの馬BのraceScore → ...
 *   のような循環は構造的に発生しない（常に「過去 → 現在」の一方向参照のみ）。
 *
 * raceTimeScoreAtRace・final3FScore（今回追加）：
 *   レース条件（競馬場・surface・距離・馬場状態）と当日馬場補正は、対象レースが
 *   属する「開催日」の時点で確定している客観的事実であり、他馬の能力評価とは
 *   独立している（未来のレース結果には依存しない）。そのため、当日補正の
 *   プールは日付の前後を問わず全レースから対象レース自身を除いて求めてよい。
 *
 *   memberLevelScoreAtRace・raceTimeScoreはレース単位で1回だけ計算し出走馬全員で共通の値を使うが、
 *   final3FScoreは上がり3Fが馬ごとに異なる個別記録のため、レース内相対評価・絶対評価とも
 *   出走馬ごとに個別計算する（当日上がり補正のみレース単位で共通）。
 */

import { calculateAbilityBeforeRace, MAX_PRIOR_RACES_FOR_ABILITY } from "./abilityBeforeRace";
import { lookupCourseTimeBaseline } from "./courseTimeBaseline";
import { lookupCourseFinal3FBaseline } from "./courseFinal3FBaseline";
import { calculateMemberLevel } from "./memberLevel";
import { calculateRaceScore } from "./raceScore";
import { calculateRaceTimeScore, RACE_TIME_SCORE_CENTER } from "./raceTimeScore";
import { calculateFinal3FScore, combineFinal3FValue } from "./final3FScore";
import { calculateTimeGapScore } from "./timeGapScore";
import { calculateTrackAdjustment, type DayRaceRecord } from "./trackAdjustment";
import { calculateFinal3FTrackAdjustment, type DayFinal3FRecord } from "./final3FTrackAdjustment";
import { buildWeightEvaluation, calculateRaceMedianWeight } from "./weightScore";
import { median } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import type {
  CourseFinal3FBaseline,
  CourseTimeBaseline,
  Final3FBreakdown,
  RacePerformance,
  RaceTimeBreakdown,
} from "./types";

/**
 * データ層が保持する生の実績値。
 * memberLevelScore・raceTimeScore・final3FScore・weightScore・timeGapScore・raceScoreは
 * 含まない（すべて自動算出のため）。
 */
export type RaceHistoryRawInput = Omit<
  RacePerformance,
  | "memberLevelScoreAtRace"
  | "retrospectiveMemberLevelScore"
  | "memberLevelBreakdown"
  | "timeGapScore"
  | "raceTimeScore"
  | "raceTimeBreakdown"
  | "final3FScore"
  | "final3FBreakdown"
  | "weightScore"
  | "weightBreakdown"
  | "raceScore"
>;

interface FlatEntry {
  horseId: string;
  raw: RaceHistoryRawInput;
}

function buildRaceTimeEvaluation(
  meta: DayRaceRecord,
  allRaceMetas: DayRaceRecord[],
  baselines: CourseTimeBaseline[],
): { raceTimeScore: number; breakdown: RaceTimeBreakdown | null } {
  const { baseline, meta: baselineMeta } = lookupCourseTimeBaseline(
    baselines,
    meta.racecourse,
    meta.surface,
    meta.distance,
    meta.going,
  );
  if (!baseline) {
    // 基準タイムが無い条件では推測せず中立値にフォールバックする
    return { raceTimeScore: RACE_TIME_SCORE_CENTER, breakdown: null };
  }

  const trackAdjustment = calculateTrackAdjustment(meta, allRaceMetas, baselines);
  const baseDiffSeconds = baseline.medianTimeSeconds - meta.officialTimeSeconds;
  const trackAdjustedDiffSeconds = baseDiffSeconds + trackAdjustment.adjustmentSeconds;

  return {
    raceTimeScore: calculateRaceTimeScore(trackAdjustedDiffSeconds),
    breakdown: {
      baselineTimeSeconds: baseline.medianTimeSeconds,
      actualTimeSeconds: meta.officialTimeSeconds,
      baseDiffSeconds: roundToOneDecimal(baseDiffSeconds),
      trackAdjustment,
      trackAdjustedDiffSeconds: roundToOneDecimal(trackAdjustedDiffSeconds),
      baselineMeta,
    },
  };
}

function buildFinal3FEvaluation(
  horseFinal3FSeconds: number,
  raceFinal3FMedianSeconds: number,
  final3FMeta: DayFinal3FRecord,
  allFinal3FMetas: DayFinal3FRecord[],
  baselines: CourseFinal3FBaseline[],
): { final3FScore: number; breakdown: Final3FBreakdown } {
  const relativeDiffSeconds = raceFinal3FMedianSeconds - horseFinal3FSeconds;

  const { baseline, meta: baselineMeta } = lookupCourseFinal3FBaseline(
    baselines,
    final3FMeta.racecourse,
    final3FMeta.surface,
    final3FMeta.distance,
    final3FMeta.going,
  );

  if (!baseline) {
    // 5年基準が無い条件では、レース内相対評価100%にフォールバックする
    return {
      final3FScore: calculateFinal3FScore(combineFinal3FValue(relativeDiffSeconds, null)),
      breakdown: {
        horseFinal3FSeconds,
        raceFinal3FMedianSeconds,
        relativeDiffSeconds: roundToOneDecimal(relativeDiffSeconds),
        courseBaselineSeconds: null,
        trackAdjustment: null,
        absoluteDiffSeconds: null,
        baselineMeta,
      },
    };
  }

  const trackAdjustment = calculateFinal3FTrackAdjustment(final3FMeta, allFinal3FMetas, baselines);
  const courseBaselineDiffSeconds = baseline.medianFinal3FSeconds - horseFinal3FSeconds;
  const absoluteDiffSeconds = courseBaselineDiffSeconds + trackAdjustment.adjustmentSeconds;

  return {
    final3FScore: calculateFinal3FScore(combineFinal3FValue(relativeDiffSeconds, absoluteDiffSeconds)),
    breakdown: {
      horseFinal3FSeconds,
      raceFinal3FMedianSeconds,
      relativeDiffSeconds: roundToOneDecimal(relativeDiffSeconds),
      courseBaselineSeconds: baseline.medianFinal3FSeconds,
      trackAdjustment,
      absoluteDiffSeconds: roundToOneDecimal(absoluteDiffSeconds),
      baselineMeta,
    },
  };
}

/**
 * horseId -> その馬の生レース実績（何走分でもよい）のマップから、
 * horseId -> 確定済みRacePerformance[]（新しい順）のマップを構築する。
 */
export function buildRaceHistory(
  rawByHorseId: Record<string, RaceHistoryRawInput[]>,
  courseTimeBaselines: CourseTimeBaseline[] = [],
  courseFinal3FBaselines: CourseFinal3FBaseline[] = [],
): Record<string, RacePerformance[]> {
  const entries: FlatEntry[] = [];
  for (const [horseId, races] of Object.entries(rawByHorseId)) {
    for (const raw of races) {
      entries.push({ horseId, raw });
    }
  }

  const byRaceId = new Map<string, FlatEntry[]>();
  for (const entry of entries) {
    const list = byRaceId.get(entry.raw.raceId) ?? [];
    list.push(entry);
    byRaceId.set(entry.raw.raceId, list);
  }

  // レース日付の昇順（古い順）に処理する
  const raceGroups = [...byRaceId.values()].sort(
    (a, b) => Date.parse(a[0].raw.raceDate) - Date.parse(b[0].raw.raceDate),
  );

  // 当日馬場補正用：全レースの客観的な条件・公式タイム（勝ち馬タイム）一覧。
  // 能力評価とは独立した事実データなので、時系列処理より前にまとめて作ってよい。
  const allRaceMetas: DayRaceRecord[] = raceGroups.map((group) => {
    const winner = group.find((e) => e.raw.finishPosition === 1) ?? group[0];
    return {
      raceId: winner.raw.raceId,
      raceDate: winner.raw.raceDate,
      racecourse: winner.raw.racecourse,
      surface: winner.raw.surface,
      distance: winner.raw.distance,
      going: winner.raw.going,
      officialTimeSeconds: winner.raw.raceTime,
    };
  });
  const metaByRaceId = new Map(allRaceMetas.map((m) => [m.raceId, m]));

  // 当日上がり補正用：全レースの上がり3F中央値一覧（同じく事実データ）
  const allFinal3FMetas: DayFinal3FRecord[] = raceGroups.map((group) => {
    const representative = group[0].raw;
    return {
      raceId: representative.raceId,
      raceDate: representative.raceDate,
      racecourse: representative.racecourse,
      surface: representative.surface,
      distance: representative.distance,
      going: representative.going,
      raceFinal3FMedianSeconds: median(group.map((e) => e.raw.final3F)),
    };
  });
  const final3FMetaByRaceId = new Map(allFinal3FMetas.map((m) => [m.raceId, m]));

  // horseId -> 確定済みRacePerformance（日付昇順で蓄積。まだ並べ替えない）
  const finalizedByHorseId = new Map<string, RacePerformance[]>();

  for (const group of raceGroups) {
    // このレースより前に確定済みの、各出走馬自身の過去走だけを見る（未来情報リークなし）
    const abilitiesBeforeRace = group.map((entry) => {
      const prior = finalizedByHorseId.get(entry.horseId) ?? [];
      const recentPriorScores = prior
        .slice(-MAX_PRIOR_RACES_FOR_ABILITY)
        .map((r) => r.raceScore)
        .reverse(); // 新しい順に
      return calculateAbilityBeforeRace(recentPriorScores);
    });

    const { memberLevelScore, breakdown: memberLevelBreakdown } = calculateMemberLevel(abilitiesBeforeRace);

    const meta = metaByRaceId.get(group[0].raw.raceId)!;
    const { raceTimeScore, breakdown: raceTimeBreakdown } = buildRaceTimeEvaluation(
      meta,
      allRaceMetas,
      courseTimeBaselines,
    );

    const final3FMeta = final3FMetaByRaceId.get(group[0].raw.raceId)!;
    const raceMedianWeight = calculateRaceMedianWeight(group.map((e) => e.raw.carriedWeight));

    for (const entry of group) {
      const timeGapScore = calculateTimeGapScore(entry.raw.timeGap, entry.raw.distance);
      const { final3FScore, breakdown: final3FBreakdown } = buildFinal3FEvaluation(
        entry.raw.final3F,
        final3FMeta.raceFinal3FMedianSeconds,
        final3FMeta,
        allFinal3FMetas,
        courseFinal3FBaselines,
      );
      const { weightScore, breakdown: weightBreakdown } = buildWeightEvaluation(
        entry.raw.carriedWeight,
        raceMedianWeight,
        entry.raw.distance,
      );
      const raceScore = calculateRaceScore({
        memberLevelScoreAtRace: memberLevelScore,
        timeGapScore,
        raceTimeScore,
        final3FScore,
        weightScore,
      });

      const finalized: RacePerformance = {
        ...entry.raw,
        memberLevelScoreAtRace: memberLevelScore,
        retrospectiveMemberLevelScore: null,
        memberLevelBreakdown,
        timeGapScore,
        raceTimeScore,
        raceTimeBreakdown,
        final3FScore,
        final3FBreakdown,
        weightScore,
        weightBreakdown,
        raceScore,
      };

      const list = finalizedByHorseId.get(entry.horseId) ?? [];
      list.push(finalized);
      finalizedByHorseId.set(entry.horseId, list);
    }
  }

  const result: Record<string, RacePerformance[]> = {};
  for (const [horseId, races] of finalizedByHorseId.entries()) {
    // 表示・baseAbility計算用に新しい順へ並べ替える
    result[horseId] = [...races].sort(
      (a, b) => Date.parse(b.raceDate) - Date.parse(a.raceDate),
    );
  }
  return result;
}

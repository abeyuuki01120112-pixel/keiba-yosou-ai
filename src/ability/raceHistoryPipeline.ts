/**
 * 全馬の過去走データから、実質メンバーレベル・走破タイムスコア込みの
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
 * raceTimeScoreAtRace（今回追加）：
 *   レース条件（競馬場・surface・距離・馬場状態）と当日馬場補正は、対象レースが
 *   属する「開催日」の時点で確定している客観的事実であり、他馬の能力評価とは
 *   独立している（未来のレース結果には依存しない）。そのため、当日馬場補正の
 *   プールは日付の前後を問わず全レースから対象レース自身を除いて求めてよい。
 *   memberLevelScoreAtRaceと同じく、レース単位で1回だけ計算し、そのレースの
 *   出走馬全員に共通の値として適用する。
 */

import { calculateAbilityBeforeRace, MAX_PRIOR_RACES_FOR_ABILITY } from "./abilityBeforeRace";
import { findCourseTimeBaseline } from "./courseTimeBaseline";
import { calculateMemberLevel } from "./memberLevel";
import { calculateRaceScore } from "./raceScore";
import { calculateRaceTimeScore, RACE_TIME_SCORE_CENTER } from "./raceTimeScore";
import { calculateTimeGapScore } from "./timeGapScore";
import { calculateTrackAdjustment, type DayRaceRecord } from "./trackAdjustment";
import { roundToOneDecimal } from "./raceScore";
import type { CourseTimeBaseline, RacePerformance, RaceTimeBreakdown } from "./types";

/**
 * データ層が保持する生の実績値＋仮サブスコア。
 * memberLevelScore・raceTimeScore・timeGapScore・raceScoreは含まない（すべて自動算出のため）。
 */
export type RaceHistoryRawInput = Omit<
  RacePerformance,
  | "memberLevelScoreAtRace"
  | "retrospectiveMemberLevelScore"
  | "memberLevelBreakdown"
  | "timeGapScore"
  | "raceTimeScore"
  | "raceTimeBreakdown"
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
  const baseline = findCourseTimeBaseline(baselines, meta.racecourse, meta.surface, meta.distance, meta.going);
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

    for (const entry of group) {
      const timeGapScore = calculateTimeGapScore(entry.raw.timeGap, entry.raw.distance);
      const raceScore = calculateRaceScore({
        memberLevelScoreAtRace: memberLevelScore,
        timeGapScore,
        raceTimeScore,
        final3FScore: entry.raw.final3FScore,
        weightScore: entry.raw.weightScore,
      });

      const finalized: RacePerformance = {
        ...entry.raw,
        memberLevelScoreAtRace: memberLevelScore,
        retrospectiveMemberLevelScore: null,
        memberLevelBreakdown,
        timeGapScore,
        raceTimeScore,
        raceTimeBreakdown,
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

/**
 * 全馬の過去走データから、実質メンバーレベル込みの RacePerformance[] を組み立てる
 * パイプライン。
 *
 * 未来情報リーク・循環参照を防ぐ方法：
 *   全馬・全レースをレース日付の「昇順（古い順）」に処理する。
 *   あるレースの memberLevelScoreAtRace を計算するときは、
 *   そのレースより厳密に前の日付で「すでに確定済み」の各出走馬の raceScore
 *   （abilityBeforeRace）だけを参照する。同じ日付の他レースや、まだ処理していない
 *   将来のレースは一切参照しない。これにより、
 *     馬AのraceScore → memberLevelScore → 同じレースの馬BのraceScore → ...
 *   のような循環は構造的に発生しない（常に「過去 → 現在」の一方向参照のみ）。
 */

import { calculateAbilityBeforeRace, MAX_PRIOR_RACES_FOR_ABILITY } from "./abilityBeforeRace";
import { calculateMemberLevel } from "./memberLevel";
import { calculateRaceScore } from "./raceScore";
import { calculateTimeGapScore } from "./timeGapScore";
import type { RacePerformance } from "./types";

/** データ層が保持する生の実績値＋仮サブスコア（memberLevelScore/timeGapScore/raceScoreは含まない） */
export type RaceHistoryRawInput = Omit<
  RacePerformance,
  "memberLevelScoreAtRace" | "retrospectiveMemberLevelScore" | "memberLevelBreakdown" | "timeGapScore" | "raceScore"
>;

interface FlatEntry {
  horseId: string;
  raw: RaceHistoryRawInput;
}

/**
 * horseId -> その馬の生レース実績（何走分でもよい）のマップから、
 * horseId -> 確定済みRacePerformance[]（新しい順）のマップを構築する。
 */
export function buildRaceHistory(
  rawByHorseId: Record<string, RaceHistoryRawInput[]>,
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

    const { memberLevelScore, breakdown } = calculateMemberLevel(abilitiesBeforeRace);

    for (const entry of group) {
      const timeGapScore = calculateTimeGapScore(entry.raw.timeGap, entry.raw.distance);
      const raceScore = calculateRaceScore({
        memberLevelScoreAtRace: memberLevelScore,
        timeGapScore,
        raceTimeScore: entry.raw.raceTimeScore,
        final3FScore: entry.raw.final3FScore,
        weightScore: entry.raw.weightScore,
      });

      const finalized: RacePerformance = {
        ...entry.raw,
        memberLevelScoreAtRace: memberLevelScore,
        retrospectiveMemberLevelScore: null,
        memberLevelBreakdown: breakdown,
        timeGapScore,
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

/**
 * MemberLevel Evidence V1（CHECKPOINT13.4Jで正式導入）。
 *
 * memberLevel formula（memberLevel.ts・memberLevelCandidates.ts・raceHistoryPipeline.ts）は
 * 一切変更しない。FALLBACK_MEMBER_LEVEL_SCORE=50も変更しない。ここで扱うのは
 * 「なぜmemberLevelがfallback値になったか」という付随的なメタ情報（Evidence）だけである。
 *
 * 【絶対に守ること】
 *   - "structural_no_prior_history"（対象走の対戦馬全員がsource-backedな
 *     career debutで、prior raceが構造的に存在し得ない）と、
 *     "missing_data"（本来prior raceが存在するはずだが、canonical datasetに
 *     まだ取り込まれていない）を、単純な「候補馬0頭」だけで区別してはいけない
 *     （CHECKPOINT13.4J 10節）。
 *   - 判定に使うraceName・対戦馬の過去走記録は、いずれも対象走自身の日付より
 *     前の既存事実のみを参照する（future leakage禁止、CHECKPOINT13.4J 11節）。
 *   - 判定不能な場合は必ず安全側（missing_data、predictionEligibleをblock）に倒す。
 */

import { MEMBER_LEVEL_TOP_N } from "./memberLevelCandidates";
import type { RacePerformance } from "./types";

export type MemberLevelEvidenceStatus = "available" | "missing_data" | "structural_no_prior_history";
export type MemberLevelDataCompleteness = "complete" | "incomplete" | "unknown";
export type MemberLevelEvidenceStrength = "full" | "partial" | "none";

export interface MemberLevelEvidence {
  memberLevelEvidenceStatus: MemberLevelEvidenceStatus;
  memberLevelDataCompleteness: MemberLevelDataCompleteness;
  memberLevelEvidenceStrength: MemberLevelEvidenceStrength;
}

/**
 * JRA公式のレース区分名。「新馬」（2歳新馬・3歳新馬等）は、出走資格そのものが
 * 「それまで一度も競走に出走したことのない馬」に制度上限定されている
 * （CHECKPOINT13.4Iで確認済みの事実）。この判定はraceNameという既存の実データ
 * フィールド（捏造ではなく、CSV取り込み時にそのまま記録された値）だけを見る。
 */
const DEBUT_RACE_NAME_PATTERN = /新馬/;

/**
 * 対象raceの出走馬全員（data/horses内で実際に確認できる範囲）について、
 * そのraceの日付より前の実績走数を返す。
 * getAllHorseIdsInField は呼び出し側（predictionSnapshot.ts）が
 * data/horses全体を横断して構築する（このモジュール自体はhorseAbilityData.tsを
 * importしない。既存の「1頭分の過去走は必ずgetHorseRecentRaces経由」という
 * 制約と役割分担するため、フィールド探索はこのモジュールの外で行う）。
 */
export function resolveMemberLevelEvidence(
  race: RacePerformance,
  fieldMemberPriorCounts: number[],
): MemberLevelEvidence {
  if (race.memberLevelBreakdown !== null) {
    return {
      memberLevelEvidenceStatus: "available",
      memberLevelDataCompleteness: "complete",
      memberLevelEvidenceStrength:
        race.memberLevelBreakdown.participantCount >= MEMBER_LEVEL_TOP_N ? "full" : "partial",
    };
  }

  // fallback発生（memberLevelBreakdown === null、候補馬0頭）。
  // structural debutかmissing dataかを、2つの独立した根拠の両方が揃った場合のみ
  // structural判定する（単なるpriorRaceAvailableCount=0だけでは判定しない）。
  const nameMatchesDebut = DEBUT_RACE_NAME_PATTERN.test(race.raceName);
  const fieldConfirmed = fieldMemberPriorCounts.length > 0;
  const allFieldMembersHaveZeroPriors = fieldConfirmed && fieldMemberPriorCounts.every((c) => c === 0);

  if (nameMatchesDebut && allFieldMembersHaveZeroPriors) {
    return {
      memberLevelEvidenceStatus: "structural_no_prior_history",
      memberLevelDataCompleteness: "complete",
      memberLevelEvidenceStrength: "none",
    };
  }

  // 根拠が両方揃わない場合（raceNameが新馬でない、対戦馬がdata/horsesで
  // 1頭も確認できない、または一部の対戦馬に矛盾するprior raceがある）は、
  // 判定不能として安全側（missing_data）に倒す。
  return {
    memberLevelEvidenceStatus: "missing_data",
    memberLevelDataCompleteness: "unknown",
    memberLevelEvidenceStrength: "none",
  };
}

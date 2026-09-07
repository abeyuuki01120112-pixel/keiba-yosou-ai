/**
 * Ability Evidence / Short Career Eligibility V1（CHECKPOINT13.4Gで正式導入）。
 *
 * Base Ability V1の数式・重み（raceScore/memberLevel/final3F/raceTime/timeGap/weightScore）は
 * 一切変更しない。ここで扱うのは「baseAbilityという数値そのもの」ではなく、
 * その数値がどれだけの証拠（実走数）に基づくか、キャリア全体を把握できているか、
 * という付随的なメタ情報（Evidence）だけである。
 *
 * 【絶対に守ること】
 *   - knownCareerRaceCountは、data/horses内の記録走数から絶対に推測しない
 *     （CHECKPOINT13.4F 9節。「実キャリア8走・取得4走」と「実キャリア4走・取得4走」を
 *     区別できないため）。source-backedな値が明示的に登録されている場合のみ使う。
 *   - historyConfidence/historyCompleteness/shortCareerは、baseAbilityの数値を
 *     一切変更しない（「4走だから-3点」のような直接減点は禁止）。
 *   - Suitability V1のconfidence/coverage分離とは別概念（混同しない）。
 */

import { RECENT_RACE_COUNT } from "./baseAbility";

export type HistoryCompleteness = "complete" | "incomplete" | "unknown";
export type HistoryConfidence = "high" | "medium" | "low" | "insufficient";

/** predictionEligibleをblockする理由コード。blockしない場合はnull */
export type AbilityEvidenceBlockingReason =
  | "insufficient_evidence"
  | "career_history_completeness_unknown"
  | "incomplete_recent_history";

/**
 * source-backedなキャリア総走数の記録。
 * data/horses内の記録走数から自動生成してはならない（推測禁止）。
 * 外部ソース（例: netkeibaの公式プロフィール）で人間が確認した値を、
 * 明示的にcareerCounts.jsonへ登録する場合のみ使う。
 */
export interface CareerCountRecord {
  knownCareerRaceCount: number;
  /** この件数を確認した時点（ISO 8601）。predictionCutoffAtより後なら未来情報として無視する（future leakage防止） */
  careerCountAsOf: string;
  /** どこでどう確認したか（自由記述、捏造禁止・追跡可能な説明を書く） */
  careerCountSource: string;
}

export interface AbilityEvidence {
  /** baseAbility算出に実際に使われた走数（最大RECENT_RACE_COUNT） */
  abilityEvidenceCount: number;
  /** 有効なcareerCountRecordがあればその値、無ければnull */
  knownCareerRaceCount: number | null;
  historyCompleteness: HistoryCompleteness;
  historyConfidence: HistoryConfidence;
  /** キャリア全体が把握済みの短キャリア馬（knownCareerRaceCount===recognizedRaceCount かつ RECENT_RACE_COUNT未満）か */
  shortCareer: boolean;
  /** predictionEligibleをblockする理由。blockしないならnull */
  blockingReason: AbilityEvidenceBlockingReason | null;
}

/**
 * careerCountRecordが「未来情報でない」かを判定する（future leakage防止）。
 * careerCountAsOfがpredictionCutoffAtより後なら、まだ確定していなかった情報として無視する。
 */
function isCareerCountValidAsOf(record: CareerCountRecord, predictionCutoffAt: string): boolean {
  return Date.parse(record.careerCountAsOf) <= Date.parse(predictionCutoffAt);
}

function resolveHistoryCompleteness(
  recognizedRaceCount: number,
  careerCountRecord: CareerCountRecord | null,
  predictionCutoffAt: string,
): { completeness: HistoryCompleteness; validKnownCount: number | null } {
  if (recognizedRaceCount >= RECENT_RACE_COUNT) {
    // Base Abilityの窓（直近最大5走）が既に埋まっているため、キャリア全体の総走数が
    // 5走を超えて何走であっても、Base Ability計算上は完全（それ以上参照しない）。
    return {
      completeness: "complete",
      validKnownCount:
        careerCountRecord && isCareerCountValidAsOf(careerCountRecord, predictionCutoffAt)
          ? careerCountRecord.knownCareerRaceCount
          : null,
    };
  }

  if (!careerCountRecord || !isCareerCountValidAsOf(careerCountRecord, predictionCutoffAt)) {
    return { completeness: "unknown", validKnownCount: null };
  }

  const known = careerCountRecord.knownCareerRaceCount;
  // knownCareerRaceCount <= recognizedRaceCount: 記録済みの走数だけで
  // 「本当のキャリア総数」を既に網羅している（同数、または記録走数の方が多い異常値は
  // 安全側＝completeとして扱う）。
  // knownCareerRaceCount > recognizedRaceCount: 本来存在するはずの走が未取得（データ欠損）。
  return { completeness: known <= recognizedRaceCount ? "complete" : "incomplete", validKnownCount: known };
}

/**
 * Short Career Eligibility V1本体。
 * recognizedRaceCount（=getHorseRecentRaces()でfuture leakageカットオフ後にフィルタした
 * 実走数、1件以上を前提。0件はこの関数を呼ぶ前の既存の早期return経路で処理済み・無変更）から、
 * Evidence情報を算出する。
 */
export function resolveAbilityEvidence(
  recognizedRaceCount: number,
  careerCountRecord: CareerCountRecord | null,
  predictionCutoffAt: string,
): AbilityEvidence {
  const abilityEvidenceCount = Math.min(recognizedRaceCount, RECENT_RACE_COUNT);
  const { completeness, validKnownCount } = resolveHistoryCompleteness(
    recognizedRaceCount,
    careerCountRecord,
    predictionCutoffAt,
  );
  const shortCareer = completeness === "complete" && abilityEvidenceCount < RECENT_RACE_COUNT;

  let historyConfidence: HistoryConfidence;
  let blockingReason: AbilityEvidenceBlockingReason | null;

  if (abilityEvidenceCount >= RECENT_RACE_COUNT) {
    // Case A: 5走以上
    historyConfidence = "high";
    blockingReason = null;
  } else if (abilityEvidenceCount <= 2) {
    // Case D: 1〜2走。knownCareerRaceCountの有無に関わらず一律insufficient
    // （確認済み短キャリアであっても証拠量そのものが少なすぎるため）。
    historyConfidence = "insufficient";
    blockingReason = "insufficient_evidence";
  } else if (completeness === "complete") {
    // Case B/C: 3〜4走・キャリア全体を把握済み
    historyConfidence = abilityEvidenceCount === 4 ? "medium" : "low";
    blockingReason = null;
  } else if (completeness === "incomplete") {
    // 3〜4走・knownCareerRaceCountがrecognizedRaceCountを上回る（データ欠損が確認済み）
    historyConfidence = "insufficient";
    blockingReason = "incomplete_recent_history";
  } else {
    // Case E: 3〜4走・完全性を確認できない（推測しない・安全側でblock）
    historyConfidence = "insufficient";
    blockingReason = "career_history_completeness_unknown";
  }

  return {
    abilityEvidenceCount,
    knownCareerRaceCount: validKnownCount,
    historyCompleteness: completeness,
    historyConfidence,
    shortCareer,
    blockingReason,
  };
}

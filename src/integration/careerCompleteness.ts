/**
 * Career Completeness Contract V1（P0）。
 *
 * 【目的】「5走未満の馬」について、
 *   - 本当に通算出走数が5未満なのか（Career Complete）
 *   - それとも取得漏れで5走未満に見えているだけなのか（Incomplete）
 *   - それすら判定できないのか（Unknown）
 * を、JRA-VAN/JV-Link由来の出典付きデータだけで機械的に判定する。
 *
 * 【JRA-VANのどのfieldから証明するか（調査結果）】
 * JV-Data RA/SE固定長recordには「通算出走数」に相当するbyte fieldが存在しない
 * （src/collector/jvlink/records.ts参照。RA=1272byte/SE=555byteのうち、
 * このシステムが読む範囲にも他の既知の仕様書位置にも該当項目はない）。
 * 一方、JV-Link SDKのJVOpen照会は、条件に合致する総件数（ReadCount相当）を
 * 個々のrecordを読み出す前に返す。この「対象馬のSE履歴に対するJVOpenの総件数」を
 * Mac側Collectorが`manifest.historySelections[].careerStartCountAsOf`として明示的に
 * 記録した場合に限り、それを通算出走数の出典として使う
 * （`src/collector/jvlink/runFolderLoader.ts`のJvLinkManifestHistorySelection参照）。
 * RA/SEのbyte内容から推測して埋めることは一切しない。この値が無い場合は
 * 常にUNKNOWNとして扱う（安全側）。
 *
 * 【Career CompletenessとEvidence Sufficiencyの分離】
 * ここで判定するのは「取得済み過去走が、対象馬の通算出走数と一致するか」だけである。
 * 「その走数でBase Ability正式採用に足る証拠量か」は別問題であり、
 * 既存のsrc/ability/abilityEvidence.ts（Short Career Eligibility V1、
 * insufficient_evidence等のHard Stop）を一切変更・迂回しない。
 * 2走で本当にcareer completeであっても、insufficient_evidenceのBLOCKは維持される。
 */

import type { PriorHistoryEntry } from "../collector/types";
import { predictionTimestamp } from "../ability/predictionBoundary";

export type CareerCompletenessStatus = "COMPLETE" | "INCOMPLETE" | "UNKNOWN";

export interface CareerCompletenessContract {
  canonicalHorseId: string;
  /** predictionCutoffAtと同一。対象レース自身・対象レース後の情報は一切含まない。 */
  asOfCutoff: string;
  /** JV-Link JVOpen照会が返した対象馬の通算出走数（asOfCutoff時点）。証明不能ならnull。 */
  careerStartCount: number | null;
  /** 実際に取得できた過去走数（selectedHistoryCountと同値。JV-Link経路では常に一致する）。 */
  availableHistoryCount: number;
  /** JV-Link側が予測時点で選択した過去走数（scorable/unscorable問わず取得済みの総数）。 */
  selectedHistoryCount: number;
  /** careerStartCountとavailableHistoryCountが一致するか。careerStartCount=nullならfalse。 */
  allPriorStartsCaptured: boolean;
  careerCompletenessStatus: CareerCompletenessStatus;
  source: string;
  sourceProvenance: string;
  reason: string;
}

function unknown(
  canonicalHorseId: string,
  asOfCutoff: string,
  availableHistoryCount: number,
  selectedHistoryCount: number,
  reason: string,
): CareerCompletenessContract {
  return {
    canonicalHorseId,
    asOfCutoff,
    careerStartCount: null,
    availableHistoryCount,
    selectedHistoryCount,
    allPriorStartsCaptured: false,
    careerCompletenessStatus: "UNKNOWN",
    source: "UNKNOWN",
    sourceProvenance: "",
    reason,
  };
}

/**
 * 1頭分のCareer Completeness Contractを判定する。
 * priorHistoryは対象レースのpredictionCutoffAt以前だけを含むよう既に境界処理済みの
 * PriorHistoryEntry（collectorHorseHistory.ts経由）を想定する。ここでは追加のfuture
 * leakageチェックは行わない代わりに、targetAsOfとasOfCutoffが一致しない場合は
 * 安全側でUNKNOWNとする（対象時点を保証できないcareerStartCountを採用しない）。
 */
export function resolveCareerCompleteness(
  canonicalHorseId: string,
  asOfCutoff: string,
  priorHistory: PriorHistoryEntry | undefined,
): CareerCompletenessContract {
  predictionTimestamp(asOfCutoff, "asOfCutoff");

  const selectedHistoryCount = priorHistory?.selectedRaceKeys?.length ?? priorHistory?.races.length ?? 0;
  const availableHistoryCount = selectedHistoryCount;

  if (!priorHistory || priorHistory.status !== "available") {
    return unknown(canonicalHorseId, asOfCutoff, availableHistoryCount, selectedHistoryCount,
      "対象馬の履歴が取得できていません（status !== available）。");
  }
  if (priorHistory.provenance.method !== "jv_link") {
    return unknown(canonicalHorseId, asOfCutoff, availableHistoryCount, selectedHistoryCount,
      "JRA-VAN/JV-Link以外のsourceのため、出典付きの通算出走数証明ができません。");
  }
  if (priorHistory.provenance.targetAsOf !== asOfCutoff) {
    return unknown(canonicalHorseId, asOfCutoff, availableHistoryCount, selectedHistoryCount,
      "provenance.targetAsOfとasOfCutoffが一致しないため、対象時点を保証できません。");
  }
  if (priorHistory.careerStartCountAsOf == null) {
    return unknown(canonicalHorseId, asOfCutoff, availableHistoryCount, selectedHistoryCount,
      "Mac側CollectorがcareerStartCountAsOf（JV-Link JVOpen総件数）を提供していません。");
  }

  const careerStartCount = priorHistory.careerStartCountAsOf;
  const allPriorStartsCaptured = availableHistoryCount === careerStartCount;
  const sourceIdentifier = priorHistory.provenance.sourceIdentifier ?? "(unknown source file)";
  return {
    canonicalHorseId,
    asOfCutoff,
    careerStartCount,
    availableHistoryCount,
    selectedHistoryCount,
    allPriorStartsCaptured,
    careerCompletenessStatus: allPriorStartsCaptured ? "COMPLETE" : "INCOMPLETE",
    source: "JRA_VAN",
    sourceProvenance:
      `JV-Link JVOpen照会（sourceIdentifier=${sourceIdentifier}, ` +
      `retrievedAt=${priorHistory.provenance.retrievedAt}, targetAsOf=${asOfCutoff}）`,
    reason: allPriorStartsCaptured
      ? `通算${careerStartCount}走のうち${availableHistoryCount}走すべてを取得済みです。`
      : `通算${careerStartCount}走のうち${availableHistoryCount}走しか取得できていません（データ欠損の可能性）。`,
  };
}

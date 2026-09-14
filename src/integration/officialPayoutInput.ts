/**
 * Official Payout Input（Post-Race Pipeline V1・Phase 3）。
 *
 * officialResultInput.ts（Phase 1）と同じ考え方——Bet Settlement Artifact自体
 * （betSettlement.ts）は任意のsource文字列を受け付ける汎用schemaのままにし、
 * 「Production正本としてFINAL Settlementを受理してよいか」というsource whitelistは、
 * この入力境界だけに閉じ込める（既存テストfixtureが任意のsourceを使い続けられるように
 * するため）。
 *
 * whitelistはofficialResultInput.tsのAPPROVED_FINAL_RESULT_SOURCESをそのまま再利用する
 * （「Official Result Inputと整合する正式sourceだけ」という要件どおり、別の定義を
 * 重複させない）。
 */

import { APPROVED_FINAL_RESULT_SOURCES } from "./officialResultInput";
import {
  buildBetSettlement,
  type BetSettlementArtifact,
  type BuildBetSettlementInput,
  type OfficialPayoutEntry,
} from "./betSettlement";

export type OfficialPayoutInputRejectionCode =
  | "UNAPPROVED_PAYOUT_SOURCE"
  | "STRUCTURAL_VALIDATION_FAILED";

export interface OfficialPayoutInputRejection {
  code: OfficialPayoutInputRejectionCode;
  message: string;
}

export type OfficialPayoutInputOutcome =
  | { status: "accepted"; artifact: BetSettlementArtifact }
  | { status: "rejected"; rejections: OfficialPayoutInputRejection[] };

function checkPayoutSources(payouts: readonly OfficialPayoutEntry[]): OfficialPayoutInputRejection[] {
  const rejections: OfficialPayoutInputRejection[] = [];
  for (const payout of payouts) {
    if (!(APPROVED_FINAL_RESULT_SOURCES as readonly string[]).includes(payout.source)) {
      rejections.push({
        code: "UNAPPROVED_PAYOUT_SOURCE",
        message:
          `betType=${payout.betType}の払戻source="${payout.source}"を正式ソースとして受理できません` +
          `（許可済み: ${APPROVED_FINAL_RESULT_SOURCES.join(", ")}）。` +
          "人間/ChatGPT作成の払戻情報はテストfixtureとしてのみ使用できます。",
      });
    }
  }
  return rejections;
}

/**
 * 正式払戻データを使ってBet Settlement Artifactの受理を試みる。永続化はしない
 * （persistBetSettlement()は呼び出し側が明示的に呼ぶ）。
 * settlementStatusOverride（VOID等）を使う場合は、払戻データが空でもよいため
 * whitelistチェックの対象外とする。
 */
export function submitBetSettlement(input: BuildBetSettlementInput): OfficialPayoutInputOutcome {
  const rejections: OfficialPayoutInputRejection[] = checkPayoutSources(input.payouts);

  let artifact: BetSettlementArtifact | null = null;
  try {
    artifact = buildBetSettlement(input);
  } catch (error) {
    rejections.push({
      code: "STRUCTURAL_VALIDATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (rejections.length > 0 || artifact === null) {
    return { status: "rejected", rejections };
  }
  return { status: "accepted", artifact };
}

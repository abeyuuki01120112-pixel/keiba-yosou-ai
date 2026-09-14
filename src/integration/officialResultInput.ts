/**
 * Official Result Input（Post-Race Pipeline V1・Phase 1）。
 *
 * 外部の正式結果を、canonicalHorseId付きのRace Result Artifact v2へ変換して
 * 受理するためのProduction入力境界。現時点ではWindows/JV-Link実機が使えないため、
 * この関数の実際の呼び出し元は人間/ChatGPTが用意したJSON（手動運用・テスト）だが、
 * 関数自体は入力元非依存に設計している——将来、
 *
 *   JV-Link Stage 6/7
 *   ↓
 *   （正規化レイヤー、未実装）
 *   ↓
 *   BuildRaceResultArtifactV2Input
 *   ↓
 *   submitOfficialResultInput()
 *
 * という形で、Windows到着後にこの関数より前段だけを差し替えれば接続できる
 * （この関数自体・Result Artifact v2 schemaは変更不要）。
 *
 * 【最重要】この関数は、buildRaceResultArtifactV2()が行う構造・状態整合性・v2詳細項目の
 * 検証に加えて、「Production FINALとして受理してよいか」というOfficial Result Input
 * 固有の追加ゲート（source whitelist・期待runner集合との整合性）を持つ。
 * このゲートはraceResultArtifact.ts（汎用schema）には一切追加しない——
 * 既存テストfixtureが任意のsource文字列を使い続けられるようにするため
 * （FINAL/CORRECTEDの正式受理判定は、あくまでこの入力境界だけの責務）。
 */

import {
  buildRaceResultArtifactV2,
  type BuildRaceResultArtifactV2Input,
  type RaceResultArtifactV2,
} from "./raceResultArtifact";

/**
 * FINAL/CORRECTEDとしてProduction正本に受理できるsource種別。
 * 実際に接続済み・接続予定のsourceのみを列挙し、推測で広げない。
 * 将来Providerが増える場合はここへ追記する。
 */
export const APPROVED_FINAL_RESULT_SOURCES = ["JRA_OFFICIAL_RESULT", "JV_LINK"] as const;
export type ApprovedFinalResultSource = (typeof APPROVED_FINAL_RESULT_SOURCES)[number];

export type OfficialResultInputRejectionCode =
  | "UNAPPROVED_SOURCE_FOR_FINAL"
  | "RUNNER_SET_MISMATCH_WITH_EXPECTED"
  | "STRUCTURAL_VALIDATION_FAILED";

export interface OfficialResultInputRejection {
  code: OfficialResultInputRejectionCode;
  message: string;
}

export interface OfficialResultInputOptions {
  /**
   * 呼び出し側が既に把握しているPrediction runner集合（canonicalHorseId）との
   * 整合性チェック（任意）。指定した場合、Resultのrunner集合（scratched/excluded含む
   * 全件）と完全一致しなければ拒否する。Prediction Artifact本体とのjoin・
   * population整合性（出走取消等）は既存joinPredictionAndResult()の責務であり、
   * ここでは単純な集合一致だけを見る。
   */
  expectedCanonicalHorseIds?: readonly string[];
}

export type OfficialResultInputOutcome =
  | { status: "accepted"; artifact: RaceResultArtifactV2 }
  | { status: "rejected"; rejections: OfficialResultInputRejection[] };

/**
 * Official ResultをResult Artifact v2として受理を試みる。
 * この関数自体は永続化しない（persistRaceResultArtifactV2()は呼び出し側が明示的に呼ぶ）。
 * Validation failure時、既存のResult/Prediction Artifactには一切触れない
 * （このプロセス内でメモリ上のオブジェクトを構築しようとするだけで、
 * ディスク上の既存ファイルへは最初から書き込みを行わない）。
 */
export function submitOfficialResultInput(
  input: BuildRaceResultArtifactV2Input,
  options: OfficialResultInputOptions = {},
): OfficialResultInputOutcome {
  const rejections: OfficialResultInputRejection[] = [];

  const requiresApprovedSource = input.resultStatus === "FINAL" || input.resultStatus === "CORRECTED";
  if (requiresApprovedSource &&
      !(APPROVED_FINAL_RESULT_SOURCES as readonly string[]).includes(input.source)) {
    rejections.push({
      code: "UNAPPROVED_SOURCE_FOR_FINAL",
      message:
        `resultStatus=${input.resultStatus}はsource="${input.source}"を正式ソースとして受理できません` +
        `（許可済み: ${APPROVED_FINAL_RESULT_SOURCES.join(", ")}）。` +
        "人間/ChatGPT作成JSONはテストfixtureとしてのみ使用できます。",
    });
  }

  if (options.expectedCanonicalHorseIds !== undefined) {
    const expected = new Set(options.expectedCanonicalHorseIds);
    const actual = new Set(input.runners.map((r) => r.canonicalHorseId));
    const missingFromResult = [...expected].filter((id) => !actual.has(id));
    const unexpectedInResult = [...actual].filter((id) => !expected.has(id));
    if (missingFromResult.length > 0 || unexpectedInResult.length > 0) {
      rejections.push({
        code: "RUNNER_SET_MISMATCH_WITH_EXPECTED",
        message:
          "期待されるcanonicalHorseId集合とResultのrunner集合が一致しません" +
          `（Resultに無い: ${missingFromResult.join(",") || "なし"}` +
          `／期待外: ${unexpectedInResult.join(",") || "なし"}）。`,
      });
    }
  }

  let artifact: RaceResultArtifactV2 | null = null;
  try {
    // canonicalHorseId欠損・重複、runnerの出走状態矛盾（scratched+started等）、
    // v2詳細項目の物理的整合性は、すべてbuildRaceResultArtifactV2()内部
    // （v1のvalidateRaceResultArtifact() + v2のvalidateRaceResultArtifactV2Extras()）
    // が検出する。ここではそれを構造化されたrejectionへ変換するだけで、
    // 検証ロジック自体を重複させない。
    artifact = buildRaceResultArtifactV2(input);
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

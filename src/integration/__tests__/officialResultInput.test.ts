import { describe, expect, it } from "vitest";
import type { BuildRaceResultArtifactV2Input } from "../raceResultArtifact";
import { submitOfficialResultInput, APPROVED_FINAL_RESULT_SOURCES } from "../officialResultInput";

function baseInput(overrides: Partial<BuildRaceResultArtifactV2Input> = {}): BuildRaceResultArtifactV2Input {
  return {
    resultStatus: "FINAL",
    resultVersion: 1,
    resultAvailableAt: "2026-08-30T15:30:00+09:00",
    retrievedAt: "2026-08-30T16:00:00+09:00",
    source: "JRA_OFFICIAL_RESULT",
    sourceIdentifier: "jra-official-2026-08-30-niigata-08",
    race: {
      raceId: "JRA-TEST-RACE-01",
      raceDate: "2026-08-30",
      raceName: "テストレース",
      scheduledStartTime: "2026-08-30T15:00:00+09:00",
      officialStarterCount: 2,
      resultEntryCount: 2,
      going: "良",
    },
    runners: [
      {
        canonicalHorseId: "h1", horseName: "テスト馬1", horseNumber: 1, frameNumber: 1,
        resultStatus: "FINAL", finishPosition: 1, started: true, scratched: false,
        excluded: false, didNotFinish: false, disqualified: false,
        actualRaceTime: 118.7, timeGap: 0, final3F: 34.5, final3FRank: 1,
        passingPosition: null, carriedWeight: 57,
      },
      {
        canonicalHorseId: "h2", horseName: "テスト馬2", horseNumber: 2, frameNumber: 2,
        resultStatus: "FINAL", finishPosition: 2, started: true, scratched: false,
        excluded: false, didNotFinish: false, disqualified: false,
        actualRaceTime: 119.0, timeGap: 0.3, final3F: 34.8, final3FRank: 2,
        passingPosition: null, carriedWeight: 55,
      },
    ],
    ...overrides,
  };
}

describe("Official Result Input（Post-Race Pipeline V1・Phase 1）", () => {
  it("正式source（JRA_OFFICIAL_RESULT）のFINALは受理される", () => {
    const outcome = submitOfficialResultInput(baseInput());
    expect(outcome.status).toBe("accepted");
    if (outcome.status === "accepted") {
      expect(outcome.artifact.schemaVersion).toBe("race-result-artifact-v2");
      expect(outcome.artifact.resultStatus).toBe("FINAL");
    }
  });

  it("正式source（JV_LINK）のFINALも受理される", () => {
    const outcome = submitOfficialResultInput(baseInput({ source: "JV_LINK" }));
    expect(outcome.status).toBe("accepted");
  });

  it("E. 正式source情報が無い（人間/ChatGPT作成JSON等）FINALは拒否する", () => {
    const outcome = submitOfficialResultInput(baseInput({ source: "chatgpt-manual-transcription" }));
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) => r.code === "UNAPPROVED_SOURCE_FOR_FINAL")).toBe(true);
    }
  });

  it("CORRECTEDも同じsource whitelistの対象になる", () => {
    const outcome = submitOfficialResultInput(baseInput({
      resultStatus: "CORRECTED", resultVersion: 2, supersedesArtifactId: "prior-id",
      source: "manual-note",
    }));
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) => r.code === "UNAPPROVED_SOURCE_FOR_FINAL")).toBe(true);
    }
  });

  it("PROVISIONALはsource whitelistの対象外（正式source未確定でも受理できる）", () => {
    const outcome = submitOfficialResultInput(baseInput({
      resultStatus: "PROVISIONAL",
      source: "flash-report-unofficial",
      runners: baseInput().runners.map((r) => ({ ...r, resultStatus: "PROVISIONAL" as const })),
    }));
    expect(outcome.status).toBe("accepted");
  });

  it("D. canonicalHorseId重複はSTRUCTURAL_VALIDATION_FAILEDとして拒否する", () => {
    const outcome = submitOfficialResultInput(baseInput({
      runners: [baseInput().runners[0], { ...baseInput().runners[1], canonicalHorseId: "h1" }],
    }));
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) =>
        r.code === "STRUCTURAL_VALIDATION_FAILED" && /重複/.test(r.message),
      )).toBe(true);
    }
  });

  it("期待されるcanonicalHorseId集合と一致しない場合は拒否する（Prediction runner集合との不整合検出）", () => {
    const outcome = submitOfficialResultInput(baseInput(), {
      expectedCanonicalHorseIds: ["h1", "h2", "h3"],
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.some((r) => r.code === "RUNNER_SET_MISMATCH_WITH_EXPECTED")).toBe(true);
    }
  });

  it("期待されるcanonicalHorseId集合と一致する場合は受理される", () => {
    const outcome = submitOfficialResultInput(baseInput(), {
      expectedCanonicalHorseIds: ["h1", "h2"],
    });
    expect(outcome.status).toBe("accepted");
  });

  it("複数の拒否理由がある場合、すべて返す（1件で止めない）", () => {
    const outcome = submitOfficialResultInput(baseInput({ source: "unofficial" }), {
      expectedCanonicalHorseIds: ["h1", "h2", "h3"],
    });
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejections.map((r) => r.code)).toEqual(
        expect.arrayContaining(["UNAPPROVED_SOURCE_FOR_FINAL", "RUNNER_SET_MISMATCH_WITH_EXPECTED"]),
      );
    }
  });

  it("Validation failure時、この関数自体は何も永続化しない（副作用ゼロ）", () => {
    // submitOfficialResultInput()はbuild結果を返すだけで、persistRaceResultArtifactV2()を
    // 呼ばない設計であることを、返り値がArtifactオブジェクトそのもの（保存結果ではない）
    // であることで確認する。
    const outcome = submitOfficialResultInput(baseInput());
    expect(outcome.status).toBe("accepted");
    if (outcome.status === "accepted") {
      expect(outcome.artifact).not.toHaveProperty("path");
      expect(outcome.artifact).not.toHaveProperty("status");
    }
  });

  it("APPROVED_FINAL_RESULT_SOURCESは既知の2種のみを含む（推測で広げない）", () => {
    expect(APPROVED_FINAL_RESULT_SOURCES).toEqual(["JRA_OFFICIAL_RESULT", "JV_LINK"]);
  });
});

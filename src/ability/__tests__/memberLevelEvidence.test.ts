/**
 * MemberLevel Evidence V1（CHECKPOINT13.4J）の単体テスト。
 * resolveMemberLevelEvidence() を、本番data/horsesの実データに依存しない
 * 合成RacePerformanceで直接検証する（本番データはCP13.4H以降、fallback対象の
 * 走が別の走に置き換わり続けており、production-data依存のテストは繰り返し
 * 陳腐化してきたため。CHECKPOINT13.4J チェックリストのTest A〜Fに対応）。
 */
import { describe, expect, it } from "vitest";
import { resolveMemberLevelEvidence } from "../memberLevelEvidence";
import { buildRacePerformance, type RacePerformanceInput } from "../buildRacePerformance";
import type { MemberLevelBreakdown } from "../types";

const AVAILABLE_BREAKDOWN: MemberLevelBreakdown = {
  candidates: [{ horseId: "h1", ability: 70, sampleCount: 3, confidence: "high", weight: 1.0 }],
  weightedMean: 70,
  simpleTop5Average: 70,
  participantCount: 5,
};

function race(overrides: Partial<RacePerformanceInput>) {
  return buildRacePerformance({
    raceId: "TEST-RACE",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "新潟",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    memberLevelScoreAtRace: 50,
    raceTimeScore: 50,
    final3FScore: 50,
    weightScore: 50,
    ...overrides,
  });
}

describe("resolveMemberLevelEvidence", () => {
  it("Test A: memberLevelBreakdownがある（正式計算済み）→ available、predictionEligibleをblockしない", () => {
    const r = race({ memberLevelBreakdown: AVAILABLE_BREAKDOWN });
    const result = resolveMemberLevelEvidence(r, []);
    expect(result.memberLevelEvidenceStatus).toBe("available");
    expect(result.memberLevelDataCompleteness).toBe("complete");
  });

  it("Test B: fallback発生・新馬戦ではない → missing_data、blockする", () => {
    const r = race({ raceName: "3歳1勝クラス", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, [3, 5, 2]);
    expect(result.memberLevelEvidenceStatus).toBe("missing_data");
    expect(result.memberLevelDataCompleteness).toBe("unknown");
  });

  it("Test C: fallback発生・raceNameが新馬・対戦馬全員が確認できてprior race=0 → structural_no_prior_history、blockしない", () => {
    const r = race({ raceName: "2歳新馬", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, [0, 0, 0, 0]);
    expect(result.memberLevelEvidenceStatus).toBe("structural_no_prior_history");
    expect(result.memberLevelDataCompleteness).toBe("complete");
  });

  it("Test D-1: fallback発生・priorRaceCount=0だがraceNameが新馬ではない → structural扱いしない、missing_dataのままblock", () => {
    const r = race({ raceName: "3歳1勝クラス", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, [0, 0, 0]);
    expect(result.memberLevelEvidenceStatus).toBe("missing_data");
  });

  it("Test D-2: fallback発生・raceNameは新馬だが対戦馬がdata/horsesで1頭も確認できない（fieldMemberPriorCounts=[]）→ 判定不能につきstructural扱いしない、missing_dataのままblock", () => {
    const r = race({ raceName: "2歳新馬", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, []);
    expect(result.memberLevelEvidenceStatus).toBe("missing_data");
  });

  it("Test D-3: fallback発生・raceNameは新馬だが対戦馬の一部にprior raceがある（矛盾）→ structural扱いしない、missing_dataのままblock", () => {
    const r = race({ raceName: "2歳新馬", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, [0, 0, 1]);
    expect(result.memberLevelEvidenceStatus).toBe("missing_data");
  });

  it("Test E: structural判定でも、memberLevelScoreAtRace自体はFALLBACK値のまま変更されない（formula無変更の確認）", () => {
    const r = race({ raceName: "2歳新馬", memberLevelBreakdown: null, memberLevelScoreAtRace: 50 });
    resolveMemberLevelEvidence(r, [0, 0]);
    // resolveMemberLevelEvidence自体はRacePerformanceを書き換えない（読み取り専用）。
    expect(r.memberLevelScoreAtRace).toBe(50);
    expect(r.memberLevelBreakdown).toBeNull();
  });

  it("Test F: structural判定はmemberLevelEvidenceStrength=noneであり、evidenceの強さに関する数値的な補正材料を一切返さない", () => {
    const r = race({ raceName: "2歳新馬", memberLevelBreakdown: null });
    const result = resolveMemberLevelEvidence(r, [0, 0, 0]);
    expect(result.memberLevelEvidenceStrength).toBe("none");
  });
});

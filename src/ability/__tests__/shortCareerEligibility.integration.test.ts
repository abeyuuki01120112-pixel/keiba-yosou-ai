/**
 * Short Career Eligibility V1（CHECKPOINT13.4G）／MemberLevel Evidence V1
 * （CHECKPOINT13.4J）の統合テスト。
 * 本番data/horses・data/careerCounts.jsonを経由した、実際のbuildHorseSnapshotEntry()の
 * 挙動を確認する（regression: 既存5走馬の挙動が壊れていないこと／ロデオドライブの
 * Short Career解決とmemberLevelUnavailable〈structural_no_prior_history〉解決の
 * 両方を確認）。
 */
import { describe, expect, it } from "vitest";
import { buildHorseSnapshotEntry, type RaceEntryInput, type SnapshotRaceTarget } from "../predictionSnapshot";
import { getHorseRecentRaces } from "../horseAbilityData";
import { calculateBaseAbility } from "../baseAbility";

const CUTOFF = "2026-08-24T12:00:00Z";

const TARGET: SnapshotRaceTarget = {
  raceId: "TEST-11R",
  raceName: "テストステークス",
  raceDate: "2026-09-06",
  racecourse: "新潟",
  surface: "turf",
  distance: 2000,
  raceNumber: 11,
  postTimeIso: "2026-09-06T15:45:00+09:00",
};

function entry(overrides: Partial<RaceEntryInput>): RaceEntryInput {
  return {
    horseId: "",
    horseName: "",
    frame: 1,
    horseNumber: 1,
    carriedWeight: null,
    scratched: false,
    ...overrides,
  };
}

describe("CHECKPOINT13.4G 既存5走馬へのregression: シェイクユアハート", () => {
  it("baseAbilityは正式経路（calculateBaseAbility(getHorseRecentRaces)）と完全一致し、Short Career Rule導入前後で変化しない", () => {
    const result = buildHorseSnapshotEntry(
      entry({ horseId: "shakeyourheart", horseName: "シェイクユアハート" }),
      TARGET,
      { evaluated: false },
      CUTOFF,
      null,
    );
    const expected = calculateBaseAbility(getHorseRecentRaces("shakeyourheart"));
    expect(result.baseAbility).toBe(expected);
    expect(result.completenessFlags).not.toContain("insufficient_evidence");
    expect(result.completenessFlags).not.toContain("career_history_completeness_unknown");
    expect(result.completenessFlags).not.toContain("incomplete_recent_history");
  });

  it("5走以上の馬はabilityEvidence.shortCareer=false、blockingReason=null（Case A）", () => {
    const result = buildHorseSnapshotEntry(
      entry({ horseId: "shakeyourheart", horseName: "シェイクユアハート" }),
      TARGET,
      { evaluated: false },
      CUTOFF,
      null,
    );
    expect(getHorseRecentRaces("shakeyourheart").length).toBeGreaterThanOrEqual(5);
    expect(result.abilityEvidence?.abilityEvidenceCount).toBe(5);
    expect(result.abilityEvidence?.historyCompleteness).toBe("complete");
    expect(result.abilityEvidence?.historyConfidence).toBe("high");
    expect(result.abilityEvidence?.shortCareer).toBe(false);
    expect(result.abilityEvidence?.blockingReason).toBeNull();
  });
});

describe("CHECKPOINT13.4G ロデオドライブ: Short Career Rule適用後の状態", () => {
  const RODEO_DRIVE_ID = "2023107166";

  it("実キャリア4走が正しく認識され、baseAbilityは76.7のまま変化しない", () => {
    const races = getHorseRecentRaces(RODEO_DRIVE_ID);
    expect(races.length).toBe(4);
    const result = buildHorseSnapshotEntry(
      entry({ horseId: RODEO_DRIVE_ID, horseName: "ロデオドライブ" }),
      TARGET,
      { evaluated: false },
      CUTOFF,
      null,
    );
    expect(result.baseAbility).toBe(calculateBaseAbility(races));
  });

  it("Short Career Ruleにより、insufficient_evidence/career_history_completeness_unknown/incomplete_recent_historyはもう発火しない（data/careerCounts.jsonのknownCareerRaceCount=4により解消）", () => {
    const result = buildHorseSnapshotEntry(
      entry({ horseId: RODEO_DRIVE_ID, horseName: "ロデオドライブ" }),
      TARGET,
      { evaluated: false },
      CUTOFF,
      null,
    );
    expect(result.completenessFlags).not.toContain("insufficient_evidence");
    expect(result.completenessFlags).not.toContain("career_history_completeness_unknown");
    expect(result.completenessFlags).not.toContain("incomplete_recent_history");
    expect(result.abilityEvidence?.shortCareer).toBe(true);
    expect(result.abilityEvidence?.historyCompleteness).toBe("complete");
    expect(result.abilityEvidence?.historyConfidence).toBe("medium");
    expect(result.abilityEvidence?.blockingReason).toBeNull();
  });

  it("CHECKPOINT13.4J: デビュー戦のmemberLevelUnavailableはstructural_no_prior_historyと正しく判定され、もうblockしない", () => {
    const result = buildHorseSnapshotEntry(
      entry({ horseId: RODEO_DRIVE_ID, horseName: "ロデオドライブ" }),
      TARGET,
      { evaluated: false },
      CUTOFF,
      null,
    );
    // デビュー戦（2歳新馬、JRA-20251221-NAKAYAMA-05）の対戦馬15頭全員が
    // source-backedなcareer debutと確認できるため、memberLevelUnavailableは
    // もうcompletenessFlagsに含まれない（CHECKPOINT13.4I監査→13.4J実装）。
    expect(result.completenessFlags).not.toContain("memberLevelUnavailable");
    expect(result.memberLevelEvidenceStatus).toBe("structural_no_prior_history");
    // baseAbilityの数値自体は無変更（追加補正なし）
    expect(result.baseAbility).toBe(76.7);
    expect(result.completenessFlags).toEqual([]);
  });
});

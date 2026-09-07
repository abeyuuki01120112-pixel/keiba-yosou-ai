/**
 * Short Career Eligibility V1（CHECKPOINT13.4G）のテスト。
 *
 * resolveAbilityEvidence()は純粋関数であり、baseAbilityの数値には一切触れない
 * （baseAbility.ts・raceScore.ts・memberLevel.ts等は無変更）。
 */
import { describe, expect, it } from "vitest";
import { resolveAbilityEvidence, type CareerCountRecord } from "../abilityEvidence";

const CUTOFF = "2026-08-24T00:00:00Z";

function careerCount(count: number, asOf: string = "2026-01-01T00:00:00Z"): CareerCountRecord {
  return { knownCareerRaceCount: count, careerCountAsOf: asOf, careerCountSource: "test" };
}

describe("CHECKPOINT13.4G Short Career Eligibility V1", () => {
  it("Case A: knownCareerRaceCount=5 / recognized=5 → eligible（high, shortCareer=false）", () => {
    const evidence = resolveAbilityEvidence(5, careerCount(5), CUTOFF);
    expect(evidence.abilityEvidenceCount).toBe(5);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.historyConfidence).toBe("high");
    expect(evidence.shortCareer).toBe(false);
    expect(evidence.blockingReason).toBeNull();
  });

  it("Case A: knownCareerRaceCountが未登録でも、recognized>=5なら5走窓が既に埋まっているためeligible（既存5走馬挙動の維持）", () => {
    const evidence = resolveAbilityEvidence(5, null, CUTOFF);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.historyConfidence).toBe("high");
    expect(evidence.blockingReason).toBeNull();
  });

  it("Case A: recognized=6（5走を超える）でも5走windowとして扱われる", () => {
    const evidence = resolveAbilityEvidence(6, null, CUTOFF);
    expect(evidence.abilityEvidenceCount).toBe(5);
    expect(evidence.blockingReason).toBeNull();
  });

  it("Case B: knownCareerRaceCount=4 / recognized=4 → eligible（medium, shortCareer=true）", () => {
    const evidence = resolveAbilityEvidence(4, careerCount(4), CUTOFF);
    expect(evidence.abilityEvidenceCount).toBe(4);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.historyConfidence).toBe("medium");
    expect(evidence.shortCareer).toBe(true);
    expect(evidence.blockingReason).toBeNull();
    expect(evidence.knownCareerRaceCount).toBe(4);
  });

  it("Case C: knownCareerRaceCount=3 / recognized=3 → eligible（low, shortCareer=true）", () => {
    const evidence = resolveAbilityEvidence(3, careerCount(3), CUTOFF);
    expect(evidence.abilityEvidenceCount).toBe(3);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.historyConfidence).toBe("low");
    expect(evidence.shortCareer).toBe(true);
    expect(evidence.blockingReason).toBeNull();
  });

  it("Case D: recognized=2 → ineligible（insufficient, reason=insufficient_evidence）。knownCareerRaceCount一致でcompleteとは判定されても、証拠数floor（<=2走）がeligibilityを一律blockする", () => {
    const evidence = resolveAbilityEvidence(2, careerCount(2), CUTOFF);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.historyConfidence).toBe("insufficient");
    expect(evidence.blockingReason).toBe("insufficient_evidence");
  });

  it("Case D: recognized=1、knownCareerRaceCountが無くてもinsufficient_evidenceで一貫してblockする", () => {
    const evidence = resolveAbilityEvidence(1, null, CUTOFF);
    expect(evidence.blockingReason).toBe("insufficient_evidence");
  });

  it("Case E: career count unknown / recognized=4 → ineligible（historyCompleteness=unknown, reason=career_history_completeness_unknown）。勝手にShort Career判定しない", () => {
    const evidence = resolveAbilityEvidence(4, null, CUTOFF);
    expect(evidence.historyCompleteness).toBe("unknown");
    expect(evidence.historyConfidence).toBe("insufficient");
    expect(evidence.shortCareer).toBe(false);
    expect(evidence.blockingReason).toBe("career_history_completeness_unknown");
    expect(evidence.knownCareerRaceCount).toBeNull();
  });

  it("career count=8 / recognized=4 → incomplete（データ欠損が確認済み、reason=incomplete_recent_history）", () => {
    const evidence = resolveAbilityEvidence(4, careerCount(8), CUTOFF);
    expect(evidence.historyCompleteness).toBe("incomplete");
    expect(evidence.historyConfidence).toBe("insufficient");
    expect(evidence.shortCareer).toBe(false);
    expect(evidence.blockingReason).toBe("incomplete_recent_history");
    expect(evidence.knownCareerRaceCount).toBe(8);
  });

  it("future leakage防止: careerCountAsOfがpredictionCutoffAtより後なら、そのcareerCountRecordは無視される（unknown扱い）", () => {
    const futureRecord = careerCount(4, "2099-01-01T00:00:00Z"); // cutoffより後
    const evidence = resolveAbilityEvidence(4, futureRecord, CUTOFF);
    expect(evidence.historyCompleteness).toBe("unknown");
    expect(evidence.blockingReason).toBe("career_history_completeness_unknown");
    expect(evidence.knownCareerRaceCount).toBeNull();
  });

  it("knownCareerRaceCountがrecognizedRaceCountより小さい異常値は、安全側（complete扱い）で処理する", () => {
    // 記録走数の方がknownCareerRaceCountより多い矛盾ケース。blockしない側に倒す。
    const evidence = resolveAbilityEvidence(4, careerCount(3), CUTOFF);
    expect(evidence.historyCompleteness).toBe("complete");
    expect(evidence.blockingReason).toBeNull();
  });

  it("Base Abilityの数値には一切関与しない（resolveAbilityEvidenceはnumberを返さない設計）", () => {
    const evidence = resolveAbilityEvidence(4, careerCount(4), CUTOFF);
    expect(evidence).not.toHaveProperty("baseAbility");
    expect(evidence).not.toHaveProperty("adjustedBaseAbility");
  });
});

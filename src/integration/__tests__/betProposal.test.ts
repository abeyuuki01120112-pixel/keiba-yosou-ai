import { describe, expect, it } from "vitest";
import {
  buildBetProposalArtifact,
  deserializeBetProposalArtifact,
  serializeBetProposalArtifact,
  validateBetProposalArtifact,
  type BuildBetProposalArtifactInput,
} from "../betProposal";
import type { BetEntry } from "../betTypes";

function baseInput(overrides: Partial<BuildBetProposalArtifactInput> = {}): BuildBetProposalArtifactInput {
  const proposals: BetEntry[] = overrides.proposals ?? [
    {
      betType: "QUINELLA",
      selection: [
        { canonicalHorseId: "h6", role: "ANY", horseNumber: 6 },
        { canonicalHorseId: "h9", role: "ANY", horseNumber: 9 },
      ],
      stake: 500,
    },
    {
      betType: "QUINELLA",
      selection: [
        { canonicalHorseId: "h6", role: "ANY", horseNumber: 6 },
        { canonicalHorseId: "h10", role: "ANY", horseNumber: 10 },
      ],
      stake: 400,
    },
  ];
  return {
    raceId: "JRA-20260913-NAKAYAMA-11",
    predictionArtifactId: "prediction-artifact-001",
    strategyVersion: "KOHEI_V1",
    proposedAt: "2026-09-13T10:00:00+09:00",
    proposals,
    ...overrides,
  };
}

describe("BetProposalArtifact（Post-Race Pipeline V1・Phase 2）", () => {
  it("A. 正常にBet Proposal Artifactを構築できる", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    expect(artifact.artifactType).toBe("BET_PROPOSAL");
    expect(artifact.raceId).toBe("JRA-20260913-NAKAYAMA-11");
    expect(artifact.strategyVersion).toBe("KOHEI_V1");
    expect(artifact.proposals).toHaveLength(2);
  });

  it("predictionArtifactIdは参照として保持される", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    expect(artifact.predictionArtifactId).toBe("prediction-artifact-001");
  });

  it("F. selectionのcanonicalHorseId欠損は拒否する", () => {
    expect(() => buildBetProposalArtifact(baseInput({
      proposals: [{ betType: "WIN", selection: [{ canonicalHorseId: "", role: "ANY" }], stake: 100 }],
    }))).toThrow(/canonicalHorseId/);
  });

  it("proposalsが空なら拒否する", () => {
    expect(() => buildBetProposalArtifact(baseInput({ proposals: [] }))).toThrow(/proposals/);
  });

  it("raceId/predictionArtifactId/strategyVersion欠損は拒否する", () => {
    expect(() => buildBetProposalArtifact(baseInput({ raceId: "" }))).toThrow(/raceId/);
    expect(() => buildBetProposalArtifact(baseInput({ predictionArtifactId: "" }))).toThrow(/predictionArtifactId/);
    expect(() => buildBetProposalArtifact(baseInput({ strategyVersion: "" }))).toThrow(/strategyVersion/);
  });

  it("JSON serialize/deserializeで内容が一致し、fingerprint/artifactIdの整合も検証する", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    const serialized = serializeBetProposalArtifact(artifact);
    expect(deserializeBetProposalArtifact(serialized)).toEqual(artifact);
  });

  it("改変されたJSON（fingerprint不一致）はdeserializeで拒否する", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    const tampered = { ...artifact, proposals: [{ ...artifact.proposals[0], stake: 600 }, artifact.proposals[1]] };
    expect(() => deserializeBetProposalArtifact(JSON.stringify(tampered))).toThrow(/fingerprint/);
  });

  it("validateBetProposalArtifactは単体でも呼び出せる", () => {
    expect(() => validateBetProposalArtifact(baseInput())).not.toThrow();
  });

  it("同一入力からは同一artifactIdが得られる（idempotent構築）", () => {
    const a = buildBetProposalArtifact(baseInput());
    const b = buildBetProposalArtifact(baseInput());
    expect(a.artifactId).toBe(b.artifactId);
    expect(a.proposalContentFingerprint).toBe(b.proposalContentFingerprint);
  });
});

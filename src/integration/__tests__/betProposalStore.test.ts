import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBetProposalArtifact, type BuildBetProposalArtifactInput } from "../betProposal";
import {
  listBetProposalArtifactsForRace,
  persistBetProposalArtifact,
  readBetProposalArtifact,
} from "../betProposalStore";

function baseInput(overrides: Partial<BuildBetProposalArtifactInput> = {}): BuildBetProposalArtifactInput {
  return {
    raceId: "JRA-TEST-RACE-STORE",
    predictionArtifactId: "prediction-001",
    strategyVersion: "KOHEI_V1",
    proposedAt: "2026-09-13T10:00:00+09:00",
    proposals: [
      { betType: "QUINELLA", selection: [{ canonicalHorseId: "h6", role: "ANY" }, { canonicalHorseId: "h9", role: "ANY" }], stake: 500 },
    ],
    ...overrides,
  };
}

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bet-proposal-store-"));
});
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("BetProposalArtifactStore（Post-Race Pipeline V1・Phase 2）", () => {
  it("N. JSON round-tripで保存・再読込した内容が一致する", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    const result = persistBetProposalArtifact(artifact, { dir: tempDir });
    expect(result.status).toBe("created");
    expect(readBetProposalArtifact(artifact.artifactId, { dir: tempDir })).toEqual(artifact);
  });

  it("O. append-only: 同一artifactId・同一内容ならidempotentにduplicate扱いする", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    expect(persistBetProposalArtifact(artifact, { dir: tempDir }).status).toBe("created");
    expect(persistBetProposalArtifact(artifact, { dir: tempDir }).status).toBe("duplicate");
    expect(fs.readdirSync(tempDir).filter((f) => f.endsWith(".json"))).toHaveLength(1);
  });

  it("P. append-only: 同一artifactId・異なる内容は拒否する（上書きしない）", () => {
    const artifact = buildBetProposalArtifact(baseInput());
    expect(persistBetProposalArtifact(artifact, { dir: tempDir }).status).toBe("created");
    const differentContentSameId = buildBetProposalArtifact(baseInput({
      proposals: [{ ...baseInput().proposals[0], stake: 900 }],
    }));
    expect(differentContentSameId.artifactId).toBe(artifact.artifactId);
    const result = persistBetProposalArtifact(differentContentSameId, { dir: tempDir });
    expect(result.status).toBe("rejected");
    expect(readBetProposalArtifact(artifact.artifactId, { dir: tempDir })?.proposals[0].stake).toBe(500);
  });

  it("listBetProposalArtifactsForRaceは同一raceIdの全件を返す", () => {
    const a = buildBetProposalArtifact(baseInput({ proposedAt: "2026-09-13T09:00:00+09:00" }));
    const b = buildBetProposalArtifact(baseInput({ proposedAt: "2026-09-13T10:00:00+09:00" }));
    persistBetProposalArtifact(a, { dir: tempDir });
    persistBetProposalArtifact(b, { dir: tempDir });
    expect(listBetProposalArtifactsForRace(baseInput().raceId, { dir: tempDir })).toHaveLength(2);
  });

  it("存在しないartifactIdの読み込みはnullを返す", () => {
    expect(readBetProposalArtifact("nonexistent-id", { dir: tempDir })).toBeNull();
  });
});

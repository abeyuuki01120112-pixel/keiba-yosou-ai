/**
 * CHECKPOINT14A.2 Test G: Non-destructive Enrichment MergeがBase Ability用fieldに
 * 一切影響しないことの回帰テスト。fixtureのみを使用し、production data
 * （src/ability/data/horses/）は一切変更・参照しない。
 */
import { describe, expect, it } from "vitest";
import { buildRaceHistory, type RaceHistoryRawInput } from "../../raceHistoryPipeline";
import { calculateBaseAbility } from "../../baseAbility";
import { mergeHorseRaceHistory } from "../mergeHorseHistory";

function race(overrides: Partial<RaceHistoryRawInput> = {}): RaceHistoryRawInput {
  return {
    raceId: "R1",
    raceName: "テストレース",
    raceDate: "2026-01-01",
    racecourse: "東京",
    surface: "turf",
    distance: 2000,
    going: "良",
    finishPosition: 1,
    timeGap: 0,
    raceTime: 120,
    final3F: 34,
    carriedWeight: 56,
    ...overrides,
  };
}

describe("CHECKPOINT14A.2 Test G: Enrichment前後でBase Ability用fieldが一切変わらない", () => {
  it("passingPosition/fieldSizeのenrichmentを適用しても、baseAbility/raceScoreは1件たりとも変化しない", () => {
    const existingRaces: RaceHistoryRawInput[] = [
      race({ raceId: "R1", raceDate: "2026-05-01", finishPosition: 1, raceTime: 120.0, final3F: 34.0 }),
      race({ raceId: "R2", raceDate: "2026-04-01", finishPosition: 2, raceTime: 121.0, final3F: 34.5 }),
      race({ raceId: "R3", raceDate: "2026-03-01", finishPosition: 3, raceTime: 122.0, final3F: 35.0 }),
      race({ raceId: "R4", raceDate: "2026-02-01", finishPosition: 1, raceTime: 119.5, final3F: 33.8 }),
      race({ raceId: "R5", raceDate: "2026-01-01", finishPosition: 4, raceTime: 123.0, final3F: 35.5 }),
    ];

    const beforeHistory = buildRaceHistory({ testHorse: existingRaces });
    const baseAbilityBefore = calculateBaseAbility(beforeHistory.testHorse);
    const raceScoresBefore = beforeHistory.testHorse.map((r) => r.raceScore);

    // 全レースについてfieldSize/passingPositionだけを補完するenrichment（core fieldは同一）
    const incomingRaces: RaceHistoryRawInput[] = existingRaces.map((r, i) => ({
      ...r,
      fieldSize: 12,
      passingPosition: { cornerPositions: [5 + i, 3 + i], fieldSize: 12, source: "test", isReliable: true },
    }));

    const mergeResult = mergeHorseRaceHistory(existingRaces, incomingRaces);
    expect(mergeResult.conflicts).toHaveLength(0);
    expect(mergeResult.enriched).toHaveLength(5);
    expect(mergeResult.merged.every((r) => r.fieldSize === 12)).toBe(true);
    expect(mergeResult.merged.every((r) => r.passingPosition !== null)).toBe(true);

    const afterHistory = buildRaceHistory({ testHorse: mergeResult.merged });
    const baseAbilityAfter = calculateBaseAbility(afterHistory.testHorse);
    const raceScoresAfter = afterHistory.testHorse.map((r) => r.raceScore);

    expect(baseAbilityAfter).toBe(baseAbilityBefore);
    expect(raceScoresAfter).toEqual(raceScoresBefore);

    // core fieldそのものも1件も変化していないことを直接確認
    for (let i = 0; i < existingRaces.length; i++) {
      const before = beforeHistory.testHorse.find((r) => r.raceId === existingRaces[i].raceId)!;
      const after = afterHistory.testHorse.find((r) => r.raceId === existingRaces[i].raceId)!;
      expect(after.finishPosition).toBe(before.finishPosition);
      expect(after.raceTime).toBe(before.raceTime);
      expect(after.final3F).toBe(before.final3F);
      expect(after.timeGap).toBe(before.timeGap);
      expect(after.carriedWeight).toBe(before.carriedWeight);
    }
  });
});

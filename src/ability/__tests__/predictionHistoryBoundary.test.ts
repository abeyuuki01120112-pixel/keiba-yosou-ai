import { describe, expect, it, vi } from "vitest";
import type { RaceHistoryRawInput } from "../raceHistoryPipeline";

// productionデータをファイル変更せずモックで汚染し、スコア生成前の除外を検証する。
vi.mock("../data/horses/2022104645.json", async (importOriginal) => {
  const { default: races } = await importOriginal<{ default: RaceHistoryRawInput[] }>();
  const original = races[0];
  return { default: [...races,
    { ...original, raceId: "JRA-20260830-NIIGATA-08", raceDate: "2026-08-01", timeGap: 0 },
    { ...original, raceId: "FUTURE", raceDate: "2026-08-29", timeGap: 0 },
    { ...original, raceId: "LATE", availableAt: "2026-08-29T00:00:00Z", timeGap: 0 },
    { ...original, raceId: "CUTOFF-DAY", raceDate: "2026-08-28", timeGap: 0 },
  ] };
});
import { getHorseRecentRaces, getHorseRecentRacesAsOf } from "../horseAbilityData";
import { buildHorseSnapshotEntry } from "../predictionSnapshot";
import { isPriorPerformance } from "../predictionBoundary";

const target = {
  raceId: "JRA-20260830-NIIGATA-08", raceDate: "2026-08-30", raceName: "新潟記念", racecourse: "新潟",
  surface: "turf" as const, distance: 2000, raceNumber: 8, postTimeIso: "2026-08-30T15:45:00+09:00",
};
const cutoff = "2026-08-28T03:03:03.357Z";
describe("production履歴をスコア構築前に時点制限", () => {
  it("対象結果・未来走・後日確定情報をBase AbilityとStage A適性へ入れない", () => {
    expect(getHorseRecentRaces("2022104645")).toHaveLength(9);
    const safe = getHorseRecentRacesAsOf("2022104645", target, cutoff);
    expect(safe).toHaveLength(5);
    expect(safe.every((r) => ![target.raceId, "FUTURE", "LATE", "CUTOFF-DAY"].includes(r.raceId))).toBe(true);
    const result = buildHorseSnapshotEntry({ horseId: "2022104645", horseName: "ダノンシーマ", frame: 6, horseNumber: 8, carriedWeight: 57, scratched: false }, target, { evaluated: false }, cutoff, 11);
    expect(result.baseAbility).toBe(78.3);
    expect(result.effectiveAbility).toBe(79.8);
  });
  it("日付しかないcutoff当日走を採用せず、確定時刻が明示された過去日走だけ許可する", () => {
    const r = { raceId: "past", raceDate: "2026-08-28" };
    expect(isPriorPerformance(r, target, cutoff)).toBe(false);
    expect(isPriorPerformance({ ...r, availableAt: "2026-08-28T02:00:00Z" }, target, cutoff)).toBe(true);
    expect(isPriorPerformance({ ...r, availableAt: "2026-08-28T04:00:00Z" }, target, cutoff)).toBe(false);
  });
});

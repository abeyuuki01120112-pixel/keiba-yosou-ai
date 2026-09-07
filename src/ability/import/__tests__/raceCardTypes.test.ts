import { describe, expect, it } from "vitest";
import { parseCsv } from "../csvParser";
import { normalizeRaceCard, raceCardFromCsvRows } from "../raceCardTypes";

function validRaceCardJson(overrides: Record<string, unknown> = {}) {
  return {
    raceId: "TEST-11R",
    raceDate: "2026-09-06",
    raceNumber: 11,
    racecourse: "阪神",
    surface: "turf",
    distance: 2000,
    scheduledStartTime: "2026-09-06T15:45:00+09:00",
    going: null,
    runners: [
      { horseId: "shakeyourheart", horseName: "シェイクユアハート", frame: 1, horseNumber: 1, scratched: false },
      { horseName: "未登録馬", frame: 2, horseNumber: 2, scratched: false },
    ],
    ...overrides,
  };
}

describe("CHECKPOINT13.2B Test1: 有効なRace Card JSONを読み込める", () => {
  it("正常なJSONはok:trueで返る", () => {
    const result = normalizeRaceCard(validRaceCardJson());
    expect(result.ok).toBe(true);
  });
});

describe("CHECKPOINT13.2B Test2: raceNumberを保持できる", () => {
  it("raceNumber=11がそのまま保持される", () => {
    const result = normalizeRaceCard(validRaceCardJson());
    expect(result.ok && result.data.raceNumber).toBe(11);
  });

  it("raceNumberが無い/不正な場合はエラーになる（必須項目）", () => {
    const result = normalizeRaceCard(validRaceCardJson({ raceNumber: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "raceNumber")).toBe(true);
    }
  });
});

describe("CHECKPOINT13.2B Test3: going unknownでもStage A inputとして成立し、勝手に補完しない", () => {
  it("going: nullは正常に受理される（推測で「良」を埋めない）", () => {
    const result = normalizeRaceCard(validRaceCardJson({ going: null }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.going).toBeNull();
  });

  it("goingを省略してもnullとして扱われる", () => {
    const input = validRaceCardJson();
    delete (input as Record<string, unknown>).going;
    const result = normalizeRaceCard(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.going).toBeNull();
  });

  it("going: '良' 等の実値も正しく受理される", () => {
    const result = normalizeRaceCard(validRaceCardJson({ going: "良" }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.going).toBe("良");
  });

  it("going: 空文字はエラー（未確定はnullで表現するべきで、空文字を推測補完に使わない）", () => {
    const result = normalizeRaceCard(validRaceCardJson({ going: "" }));
    expect(result.ok).toBe(false);
  });
});

describe("normalizeRaceCard: 異常系", () => {
  it("オブジェクトでない入力はエラー", () => {
    expect(normalizeRaceCard(null).ok).toBe(false);
    expect(normalizeRaceCard("string").ok).toBe(false);
  });

  it("runnersが空配列はエラー", () => {
    const result = normalizeRaceCard(validRaceCardJson({ runners: [] }));
    expect(result.ok).toBe(false);
  });

  it("surfaceが不正な値はエラー", () => {
    const result = normalizeRaceCard(validRaceCardJson({ surface: "grass" }));
    expect(result.ok).toBe(false);
  });

  it("horseNameが空のrunnerはエラー", () => {
    const result = normalizeRaceCard(
      validRaceCardJson({ runners: [{ horseName: "", frame: 1, horseNumber: 1, scratched: false }] }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("raceCardFromCsvRows", () => {
  const csv = [
    "raceId,raceDate,raceNumber,racecourse,surface,distance,scheduledStartTime,going,horseId,horseName,frame,horseNumber,assignedWeight,scratched",
    "TEST-11R,2026-09-06,11,阪神,turf,2000,2026-09-06T15:45:00+09:00,,shakeyourheart,シェイクユアハート,1,1,58,false",
    "TEST-11R,2026-09-06,11,阪神,turf,2000,2026-09-06T15:45:00+09:00,,,未登録馬,2,2,,false",
  ].join("\n");

  it("CSVからRace Cardを構築できる（Test1相当）", () => {
    const result = raceCardFromCsvRows(parseCsv(csv));
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.raceNumber).toBe(11);
    expect(result.ok && result.data.going).toBeNull();
    expect(result.ok && result.data.runners).toHaveLength(2);
  });

  it("レース単位の列が行ごとに食い違うとエラーになる", () => {
    const badCsv = [
      "raceId,raceDate,raceNumber,racecourse,surface,distance,scheduledStartTime,going,horseId,horseName,frame,horseNumber,assignedWeight,scratched",
      "TEST-11R,2026-09-06,11,阪神,turf,2000,2026-09-06T15:45:00+09:00,,a,馬A,1,1,58,false",
      "TEST-11R,2026-09-06,11,東京,turf,2000,2026-09-06T15:45:00+09:00,,b,馬B,2,2,56,false",
    ].join("\n");
    const result = raceCardFromCsvRows(parseCsv(badCsv));
    expect(result.ok).toBe(false);
  });
});

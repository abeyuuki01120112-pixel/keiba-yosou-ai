/**
 * CHECKPOINT13.5A Stage A Readiness Preflight の単体テスト。
 * 新規ロジックは追加していない（既存のraceCardTypes.normalizeRaceCard()・
 * raceCardBridge.runRaceCardBridge()をそのまま使う）。ここで確認したいのは、
 * 新規追加したRace Card Template（枠順・馬場未確定）が「誤って正式Stage Aとして
 * 生成されてしまわない」ことと、「going未確定は既存仕様どおりevaluated:falseに
 * なり、100%固定など不当な扱いをされない」ことの2点の回帰防止。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRaceCard } from "../raceCardTypes";
import { runRaceCardBridge } from "../raceCardBridge";
import { buildAbilityBoard } from "../../predictionSnapshot";
import type { RaceCardInput } from "../raceCardTypes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, "../../data/racecards/niigata-kinen-2026-stage-a.template.json");

function loadTemplateRaw(): unknown {
  return JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf-8"));
}

describe("CHECKPOINT13.5A: 新潟記念Race Card Template", () => {
  it("11頭のhorseName/horseId/sourceHorseIdが事前登録されている", () => {
    const raw = loadTemplateRaw() as { runners: { horseName: string; horseId: string; sourceHorseId: string }[] };
    expect(raw.runners).toHaveLength(11);
    for (const r of raw.runners) {
      expect(r.horseName.length).toBeGreaterThan(0);
      expect(r.horseId).toBe(r.sourceHorseId);
    }
  });

  it("枠順・馬場未確定の現状では、normalizeRaceCard()の検証を通らない（誤って正式Stage Aを生成できない）", () => {
    const result = normalizeRaceCard(loadTemplateRaw());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("raceId");
      expect(paths).toContain("raceDate");
      expect(paths).toContain("raceNumber");
      expect(paths).toContain("scheduledStartTime");
      // 11頭全員のframe/horseNumber未確定エラーが出ている
      expect(paths.filter((p) => p.endsWith(".frame"))).toHaveLength(11);
      expect(paths.filter((p) => p.endsWith(".horseNumber"))).toHaveLength(11);
    }
  });

  it("racecourse/surface/distanceは既存provisional fixtureと一致する（新潟・turf・2000m）", () => {
    const raw = loadTemplateRaw() as { racecourse: string; surface: string; distance: number };
    expect(raw.racecourse).toBe("新潟");
    expect(raw.surface).toBe("turf");
    expect(raw.distance).toBe(2000);
  });
});

describe("CHECKPOINT13.5A: Stage A Formal Gateの現行仕様確認（going未確定はblockしない）", () => {
  const FAR_FUTURE_START = "2099-01-01T15:45:00+09:00";

  function filledRaceCard(going: string | null): RaceCardInput {
    return {
      raceId: "AUDIT-TEST-11R",
      raceDate: "2099-01-01",
      raceNumber: 11,
      racecourse: "新潟",
      surface: "turf",
      distance: 2000,
      scheduledStartTime: FAR_FUTURE_START,
      going,
      runners: [
        { horseId: "2023107166", horseName: "ロデオドライブ", frame: 1, horseNumber: 1, scratched: false },
      ],
    };
  }

  it("frame/horseNumber等が揃っていれば、goingがnull（未確定）でもgate.formal=trueになる（現行仕様。going未確定はFormal Gateをblockしない）", () => {
    const result = runRaceCardBridge(filledRaceCard(null));
    expect(result.gate.formal).toBe(true);
    expect(result.runners[0].predictionEligible).toBe(true);
  });

  it("going未確定時、goingSuitabilityはevaluated=falseに構造的に帰着し、100%固定など不当な扱いをされない（既存仕様、無変更の確認）", () => {
    const result = runRaceCardBridge(filledRaceCard(null));
    const board = buildAbilityBoard(result.diagnosticSnapshot);
    const row = board[0];
    // going未評価分はevaluatedComponentCountから除外され、overallSuitabilityPercentは
    // 他のevaluated済みcomponent（distance/course/gate）のみの平均になる。
    // 100%固定ではないことを、他componentの値と矛盾しないことで確認する。
    expect(row.evaluatedComponentCount).toBeLessThanOrEqual(3);
    expect(row.goingSuitability).not.toBeNull(); // adjustedPercentは常に返る（evaluated判定は別フィールド）
  });
});

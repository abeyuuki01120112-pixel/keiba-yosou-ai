import { describe, expect, it } from "vitest";
import { ALL_GATE_VALIDATION_ROWS } from "../gateValidationV1";
import { collectHorseGateEvidence, type HorseEvidenceSourceRace } from "../horseGateEvidence";
import {
  getHorseEvidenceConfidence,
  resolveHorseEvidenceConfidence,
  type HorseEvidenceConfidence,
} from "../horseEvidenceConfidence";

describe("resolveHorseEvidenceConfidence（STEP6: 境界値0〜6）", () => {
  it("0走 → unknown", () => {
    expect(resolveHorseEvidenceConfidence(0)).toBe("unknown");
  });
  it("1走 → low", () => {
    expect(resolveHorseEvidenceConfidence(1)).toBe("low");
  });
  it("2走 → low", () => {
    expect(resolveHorseEvidenceConfidence(2)).toBe("low");
  });
  it("3走 → medium", () => {
    expect(resolveHorseEvidenceConfidence(3)).toBe("medium");
  });
  it("4走 → medium", () => {
    expect(resolveHorseEvidenceConfidence(4)).toBe("medium");
  });
  it("5走 → high", () => {
    expect(resolveHorseEvidenceConfidence(5)).toBe("high");
  });
  it("6走 → high（5走以上は青天井でhigh）", () => {
    expect(resolveHorseEvidenceConfidence(6)).toBe("high");
  });
  it("負の値（本来発生しないが安全側でunknown）", () => {
    expect(resolveHorseEvidenceConfidence(-1)).toBe("unknown");
  });
});

describe("HorseEvidenceConfidence（STEP4: unknownはneutral/50%/0点等に変換されない）", () => {
  it("0走の結果は文字列'unknown'であり、数値の中立値(50, 0, 100等)ではない", () => {
    const result = resolveHorseEvidenceConfidence(0);
    expect(result).toBe("unknown");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("neutral");
  });
});

describe("HorseEvidenceConfidence（STEP3: confidenceとdirection/scoreの分離が型上成立する）", () => {
  /**
   * evidenceDirection/scoreはまだ実装しない（STEP3・STEP9）。このテストは
   * 「confidence=highとdirection=マイナスが矛盾なく両立する」という設計要件を
   * 型レベルで確認するための、実装に接続しない最小限の型検証。
   */
  interface IllustrativeHorseEvidenceEvaluation {
    confidence: HorseEvidenceConfidence;
    direction: "positive" | "negative" | "neutral" | "unknown";
  }

  it("confidence=high × direction=negative の組み合わせが型・値の両面で成立する", () => {
    const example: IllustrativeHorseEvidenceEvaluation = { confidence: "high", direction: "negative" };
    expect(example.confidence).toBe("high");
    expect(example.direction).toBe("negative");
  });

  it("confidence=low × direction=positive の組み合わせも同様に成立する", () => {
    const example: IllustrativeHorseEvidenceEvaluation = { confidence: "low", direction: "positive" };
    expect(example.confidence).toBe("low");
    expect(example.direction).toBe("positive");
  });
});

describe("getHorseEvidenceConfidence（STEP7: HorseEvidence collectorとの接続）", () => {
  it("collectHorseGateEvidenceの出力からsampleCount経由でconfidenceを求められる", () => {
    const history: HorseEvidenceSourceRace[] = [
      { raceId: "r1", raceDate: "2025-01-01", racecourse: "東京", surface: "dirt", distance: 1600, gate: 1, horseNumber: 1, fieldSize: 16, finishPosition: 3 },
      { raceId: "r2", raceDate: "2025-02-01", racecourse: "東京", surface: "dirt", distance: 1600, gate: 2, horseNumber: 3, fieldSize: 16, finishPosition: 5 },
      { raceId: "r3", raceDate: "2025-03-01", racecourse: "東京", surface: "dirt", distance: 1600, gate: 3, horseNumber: 5, fieldSize: 16, finishPosition: 1 },
    ];
    const evidence = collectHorseGateEvidence("h1", history, { racecourse: "東京", surface: "dirt", distance: 1600 });
    expect(evidence.sampleCount).toBe(3);
    expect(getHorseEvidenceConfidence(evidence)).toBe("medium");
  });

  it("該当走が0件のHorseEvidenceはunknownになる（0点扱いにしない）", () => {
    const evidence = collectHorseGateEvidence("h1", [], { racecourse: "東京", surface: "dirt", distance: 1600 });
    expect(evidence.sampleCount).toBe(0);
    expect(getHorseEvidenceConfidence(evidence)).toBe("unknown");
  });

  it("実データ（東京ダ1600m・CHECKPOINT10.1〜10.5データセット）の実在馬で接続結果を確認する", () => {
    const byName = new Map<string, typeof ALL_GATE_VALIDATION_ROWS>();
    for (const row of ALL_GATE_VALIDATION_ROWS) {
      const list = byName.get(row.horseName) ?? [];
      list.push(row);
      byName.set(row.horseName, list);
    }

    const toHistory = (rows: typeof ALL_GATE_VALIDATION_ROWS): HorseEvidenceSourceRace[] =>
      rows.map((row) => ({
        raceId: row.raceId,
        raceDate: row.date,
        racecourse: row.venue,
        surface: row.surface as HorseEvidenceSourceRace["surface"],
        distance: row.distance,
        gate: row.frame,
        horseNumber: row.horseNumber,
        fieldSize: row.fieldSize,
        finishPosition: row.finishPosition,
      }));

    // sampleCount=1の実在馬 → low
    const [name1, rows1] = [...byName.entries()].find(([, rows]) => rows.length === 1)!;
    const evidence1 = collectHorseGateEvidence(name1, toHistory(rows1), {
      racecourse: rows1[0].venue,
      surface: rows1[0].surface as "turf" | "dirt",
      distance: rows1[0].distance,
    });
    expect(getHorseEvidenceConfidence(evidence1)).toBe("low");

    // sampleCount=2の実在馬 → low
    const [name2, rows2] = [...byName.entries()].find(([, rows]) => rows.length === 2)!;
    const evidence2 = collectHorseGateEvidence(name2, toHistory(rows2), {
      racecourse: rows2[0].venue,
      surface: rows2[0].surface as "turf" | "dirt",
      distance: rows2[0].distance,
    });
    expect(getHorseEvidenceConfidence(evidence2)).toBe("low");

    // sampleCount>=3の実在馬 → medium（このデータセットの最大は3走）
    const [name3, rows3] = [...byName.entries()].find(([, rows]) => rows.length >= 3)!;
    const evidence3 = collectHorseGateEvidence(name3, toHistory(rows3), {
      racecourse: rows3[0].venue,
      surface: rows3[0].surface as "turf" | "dirt",
      distance: rows3[0].distance,
    });
    expect(getHorseEvidenceConfidence(evidence3)).toBe("medium");
  });
});

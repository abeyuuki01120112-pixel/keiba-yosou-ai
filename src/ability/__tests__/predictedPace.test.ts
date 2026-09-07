import { describe, expect, it } from "vitest";
import { classifyPredictedPace } from "../predictedPace";
import type { RunningStyleDistribution } from "../raceContextTypes";

function nigeDominant(): RunningStyleDistribution {
  return { nige: 60, senko: 20, sashi: 10, oikomi: 10 };
}
function senkoDominant(): RunningStyleDistribution {
  return { nige: 10, senko: 60, sashi: 20, oikomi: 10 };
}
function sashiDominant(): RunningStyleDistribution {
  return { nige: 10, senko: 20, sashi: 60, oikomi: 10 };
}
function oikomiDominant(): RunningStyleDistribution {
  return { nige: 10, senko: 10, sashi: 20, oikomi: 60 };
}

describe("classifyPredictedPace", () => {
  it("逃げ候補が2頭以上ならハイペース想定", () => {
    const result = classifyPredictedPace([nigeDominant(), nigeDominant(), sashiDominant(), oikomiDominant()]);
    expect(result.level).toBe("high");
    expect(result.nigeCandidateCount).toBe(2);
  });

  it("逃げ候補・先行候補がともに0頭ならスローペース想定", () => {
    const result = classifyPredictedPace([sashiDominant(), oikomiDominant(), sashiDominant()]);
    expect(result.level).toBe("slow");
    expect(result.nigeCandidateCount).toBe(0);
    expect(result.senkoCandidateCount).toBe(0);
  });

  it("逃げ候補1頭のみなら平均ペース想定", () => {
    const result = classifyPredictedPace([nigeDominant(), sashiDominant(), oikomiDominant()]);
    expect(result.level).toBe("average");
    expect(result.nigeCandidateCount).toBe(1);
  });

  it("逃げ候補0頭でも先行候補がいれば平均ペース想定", () => {
    const result = classifyPredictedPace([senkoDominant(), sashiDominant()]);
    expect(result.level).toBe("average");
  });

  it("fieldSizeは渡した頭数と一致する", () => {
    const result = classifyPredictedPace([nigeDominant(), sashiDominant(), oikomiDominant()]);
    expect(result.fieldSize).toBe(3);
  });
});

/**
 * distanceSuitability（第22実装・STEP4）で使う距離帯の初期区分。
 * V0のcourseTimeBaseline等とは無関係の、適性レイヤー専用の区分。
 */

export type DistanceBand = "short" | "mile" | "middle" | "long" | "superLong";

/** short(0) → superLong(4) の順。隣接帯かどうかの判定に使う */
export const DISTANCE_BAND_ORDER: DistanceBand[] = ["short", "mile", "middle", "long", "superLong"];

interface DistanceBandRange {
  band: DistanceBand;
  minMeters: number;
  /** null = 上限なし */
  maxMeters: number | null;
}

/**
 * 〜1400m：短距離 / 1500〜1700m：マイル帯 / 1800〜2200m：中距離 /
 * 2300〜2600m：長距離 / 2700m〜：超長距離。
 * 区分の間（1401-1499など）は実際のJRA施行距離では稀だが、
 * 該当した場合は距離が最も近い帯へfallbackする（getDistanceBandを参照）。
 */
const DISTANCE_BAND_RANGES: DistanceBandRange[] = [
  { band: "short", minMeters: 0, maxMeters: 1400 },
  { band: "mile", minMeters: 1500, maxMeters: 1700 },
  { band: "middle", minMeters: 1800, maxMeters: 2200 },
  { band: "long", minMeters: 2300, maxMeters: 2600 },
  { band: "superLong", minMeters: 2700, maxMeters: null },
];

/** 距離(m)から所属する距離帯を求める。区分の隙間に該当する場合は最も近い帯を返す */
export function getDistanceBand(distanceMeters: number): DistanceBand {
  for (const range of DISTANCE_BAND_RANGES) {
    if (distanceMeters >= range.minMeters && (range.maxMeters === null || distanceMeters <= range.maxMeters)) {
      return range.band;
    }
  }

  let closest = DISTANCE_BAND_RANGES[0];
  let closestGap = Infinity;
  for (const range of DISTANCE_BAND_RANGES) {
    const gapToMin = Math.abs(distanceMeters - range.minMeters);
    const gapToMax = range.maxMeters === null ? gapToMin : Math.abs(distanceMeters - range.maxMeters);
    const gap = Math.min(gapToMin, gapToMax);
    if (gap < closestGap) {
      closestGap = gap;
      closest = range;
    }
  }
  return closest.band;
}

/** 2つの距離帯が何段階離れているか（0=同じ帯、1=隣接帯、…） */
export function distanceBandGap(a: DistanceBand, b: DistanceBand): number {
  return Math.abs(DISTANCE_BAND_ORDER.indexOf(a) - DISTANCE_BAND_ORDER.indexOf(b));
}

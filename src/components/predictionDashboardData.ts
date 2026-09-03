import type { DerivedRacePrediction } from "../integration/uiTypes";

const modules = import.meta.glob<{ default: DerivedRacePrediction }>("../integration/data/derived/*.json", {
  eager: true,
});

/** 日付降順（新しい順）で全レースを返す */
export function loadAllRaces(): DerivedRacePrediction[] {
  return Object.values(modules)
    .map((m) => m.default)
    .sort((a, b) => (a.race.raceDate < b.race.raceDate ? 1 : -1));
}

export function fmt(value: number | null, suffix = ""): string {
  return value === null ? "--" : `${value}${suffix}`;
}

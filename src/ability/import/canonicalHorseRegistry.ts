/**
 * Canonical Horse Registry（CHECKPOINT13.2B）。
 *
 * CHECKPOINT13.2の残課題「canonicalHorseNames registryを24頭分手作業で
 * ハードコードしない」に対応する。data/horses/ に実在するcanonical horseId
 * 全件と、既知の馬名（simulation/data/sapporoKinen.jsonロースター）を突き合わせ、
 * Runner Resolver（runnerResolver.ts）へそのまま渡せる形の索引を自動生成する。
 *
 * ロースター外の馬（現状40頭中24頭）は馬名が既存データのどこにも記録されていない
 * ため、このレジストリでは`horseName: null`のまま返す（捏造・推測はしない）。
 * horseNameが不明でも、呼び出し側が既にcanonical horseId（例: 実データCSVの
 * horseId列）を把握していればPriority 1でresolveできる。
 *
 * dataKindはその馬の実データ/data/horses/の全走を横断した「馬単位のロールアップ」
 * （CHECKPOINT13.2で走単位に追加したRacePerformance.dataKindから導出するだけの
 * 派生値）。Base Ability V1・Suitability V1の計算そのものには一切使わない。
 */

import { getAllCanonicalHorseIds, getHorseRecentRaces } from "../horseAbilityData";
import { loadDefaultHorses } from "../../simulation/horseData";
import type { CanonicalHorseNameEntry } from "./runnerResolver";

export type CanonicalHorseDataKind = "real" | "mixed" | "placeholder" | "fixture" | "unknown";

export interface CanonicalHorseRegistryEntry {
  horseId: string;
  /** 既知の馬名。simulation/data/sapporoKinen.jsonロースターに無ければnull（推測しない） */
  horseName: string | null;
  /** その馬のdata/horses/内の全走を横断した馬単位のロールアップ。詳細はbuildHorseDataKindRollup参照 */
  dataKind: CanonicalHorseDataKind;
}

/**
 * 1頭分の全走（RacePerformance.dataKind、CHECKPOINT13.2で追加）から、
 * 馬単位のロールアップを導出する。
 *   races.length === 0            → "unknown"（過去走データ自体が無い）
 *   全走がplaceholder              → "placeholder"
 *   全走がfixture                  → "fixture"
 *   real（未設定含む）とplaceholder/fixtureが混在 → "mixed"（実データも存在する）
 *   それ以外（全走real、または未設定）→ "real"
 */
export function buildHorseDataKindRollup(races: { dataKind?: string | null }[]): CanonicalHorseDataKind {
  if (races.length === 0) return "unknown";

  const kinds = new Set(races.map((r) => r.dataKind ?? "real"));
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === "placeholder") return "placeholder";
    if (only === "fixture") return "fixture";
    return "real";
  }
  // 複数種類が混在。real以外が1つでも混じっていればmixed、それ以外はreal扱い
  const hasNonReal = [...kinds].some((k) => k !== "real");
  return hasNonReal ? "mixed" : "real";
}

/**
 * data/horses/ の全horseIdを走査し、canonical horse registryを自動生成する。
 * 手作業でのハードコードは行わない。
 */
export function buildCanonicalHorseRegistry(): CanonicalHorseRegistryEntry[] {
  const roster = loadDefaultHorses();
  const nameByHorseId = new Map(roster.map((h) => [h.horseId, h.horseName]));

  return getAllCanonicalHorseIds().map((horseId) => {
    const races = getHorseRecentRaces(horseId);
    return {
      horseId,
      horseName: nameByHorseId.get(horseId) ?? null,
      dataKind: buildHorseDataKindRollup(races),
    };
  });
}

/** Runner Resolverへそのまま渡せる形（horseNameが既知の馬のみ）に変換する */
export function toCanonicalHorseNameEntries(registry: CanonicalHorseRegistryEntry[]): CanonicalHorseNameEntry[] {
  return registry
    .filter((entry): entry is CanonicalHorseRegistryEntry & { horseName: string } => entry.horseName !== null)
    .map((entry) => ({ horseId: entry.horseId, horseName: entry.horseName }));
}

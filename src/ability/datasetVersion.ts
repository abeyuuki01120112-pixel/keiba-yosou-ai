/**
 * Model Freeze（Base Ability V1の数式・重み・algorithm）と、
 * Dataset Freeze（ある時点のdata/horsesスナップショット）を明示的に分離するための
 * 最小限のバージョン管理。CHECKPOINT13.4C/13.4Dで正式導入。
 *
 * 「同じmodelVersionでも、datasetが変わればbaseAbilityの値が変わりうる」ことを
 * 追跡可能にする。modelVersionはformula/weightsを変更した時だけ更新する
 * （V1の式自体は凍結済み・docs/ability-model-v1.md）。datasetFingerprintは
 * data/horses全体の内容が1件でも変われば変化する。
 */
import type { RaceHistoryRawInput } from "./raceHistoryPipeline";

/** Base Ability V1の数式・重み・algorithmを指すバージョン識別子。formula変更時のみ更新する。 */
export const MODEL_VERSION = "BA-V1";

export interface DatasetVersionInfo {
  modelVersion: string;
  datasetFingerprint: string;
  horseCount: number;
  totalRaceCount: number;
  /** 現在のdataset内で最も新しいraceDate（ISO 8601）。データがなければnull */
  maxRaceDate: string | null;
}

/**
 * 現在のdata/horses全体から、決定的なdataset fingerprintを算出する。
 * 暗号学的ハッシュではなく、「同じ入力なら同じ値、1件でも変われば別の値になる」ことだけを
 * 保証する簡易チェックサム（FNV-1a、ブラウザ・Node双方で依存なく動く）。
 */
export function computeDatasetVersionInfo(rawByHorseId: Record<string, RaceHistoryRawInput[]>): DatasetVersionInfo {
  const horseIds = Object.keys(rawByHorseId).sort();
  let totalRaceCount = 0;
  let maxRaceDate: string | null = null;
  const parts: string[] = [];

  for (const horseId of horseIds) {
    const races = [...rawByHorseId[horseId]].sort((a, b) => a.raceId.localeCompare(b.raceId));
    totalRaceCount += races.length;
    for (const race of races) {
      if (maxRaceDate === null || race.raceDate > maxRaceDate) maxRaceDate = race.raceDate;
      parts.push(
        `${horseId}|${race.raceId}|${race.raceDate}|${race.finishPosition}|${race.raceTime}|${race.final3F}|${race.carriedWeight}|${race.timeGap}`,
      );
    }
  }

  return {
    modelVersion: MODEL_VERSION,
    datasetFingerprint: `${horseIds.length}h-${totalRaceCount}r-${fnv1a(parts.join("\n"))}`,
    horseCount: horseIds.length,
    totalRaceCount,
    maxRaceDate,
  };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 新潟芝2000m Gate Historical Validation V1（CHECKPOINT14D.1D）。
 *
 * 【最重要・絶対に守ること】
 * このファイルは `data/gateValidation/niigataTurf2000GateHistoryV1.json`
 * （production `data/horses/*.json` とは完全に別のディレクトリ）のみを読み込む。
 * `horseAbilityData.ts` の production glob（`import.meta.glob("./data/horses/*.json")`）は
 * `data/gateValidation/` 配下を一切走査しないため、このファイルの内容が
 * baseAbility/raceScore/memberLevel/Suitability/Stage A Snapshotへ混入する経路は
 * 構造的に存在しない（CHECKPOINT8〜10.2で確立済みの`gateValidationV1.ts`と同じ
 * 分離パターンをそのまま踏襲）。
 *
 * このファイル自身も `data/horses/*.json` への書き込みを一切行わない
 * （fsの書き込みAPIを一切importしない）。
 *
 * Ability Control（各Historical行のexpected performance算出）は、production
 * `getHorseRecentRaces()`（`horseAbilityData.ts`、既存・無変更）をREAD-ONLYで参照する
 * （CHECKPOINT14D.1D 9節で明示的に許可された方向）。逆方向
 * （このファイルのデータ→production dataset）のmergeは一切行わない。
 *
 * raceScore自体（各Historical行の「実際の走破後スコア」）は、この10レース153行
 * だけを閉じたデータセットとして`buildRaceHistory()`（既存・無変更）へ渡して算出する
 * ——各レースの実際の出走馬全頭がこの153行に含まれているため
 * （CHECKPOINT14D.1C 3節でrowCount==fieldSizeを確認済み）、memberLevelの計算対象は
 * このデータセット内で自己完結し、production側のhorseIdやraceIdへは一切依存しない。
 */

import rawRows from "./data/gateValidation/niigataTurf2000GateHistoryV1.json";
import { buildRaceHistory, type RaceHistoryRawInput } from "./raceHistoryPipeline";
import { calculateAbilityBeforeRace } from "./abilityBeforeRace";
import { getHorseRecentRaces } from "./horseAbilityData";
import type { RacePerformance } from "./types";

export interface NiigataGateHistoryRow {
  raceId: string;
  raceDate: string;
  racecourse: string;
  raceNumber: number;
  raceName: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  courseLayout: string;
  courseVariant: string | null;
  horseId: string;
  horseName: string;
  horseNumber: number;
  gate: number;
  finishPosition: number;
  carriedWeightKg: number;
  actualRaceTimeSeconds: number;
  final3FSeconds: number;
  timeGapSeconds: number;
  fieldSize: number;
  passingPosition: string | null;
  source: string | null;
  sourceRaceId: string | null;
  sourceHorseId: string | null;
}

/** CHECKPOINT14D.1Cで監査済みの10レース153行（niigata_turf2000_gate_history_v1.zip） */
export const NIIGATA_GATE_HISTORY_ROWS = rawRows as unknown as NiigataGateHistoryRow[];

function toRawInput(row: NiigataGateHistoryRow): RaceHistoryRawInput {
  return {
    raceId: row.raceId,
    raceName: row.raceName,
    raceDate: row.raceDate,
    racecourse: row.racecourse,
    surface: row.surface,
    distance: row.distance,
    going: row.going,
    raceNumber: row.raceNumber,
    finishPosition: row.finishPosition,
    timeGap: row.timeGapSeconds,
    raceTime: row.actualRaceTimeSeconds,
    final3F: row.final3FSeconds,
    carriedWeight: row.carriedWeightKg,
    gate: row.gate,
    horseNumber: row.horseNumber,
    fieldSize: row.fieldSize,
    passingPosition: null,
    source: row.source,
    sourceRaceId: row.sourceRaceId,
    sourceHorseId: row.sourceHorseId,
    dataKind: "real",
  };
}

/**
 * 153行だけを閉じたデータセットとしてbuildRaceHistory()（既存・無変更）へ渡す。
 * production `data/horses/` の内容とは一切マージしない（この関数の入力は
 * NIIGATA_GATE_HISTORY_ROWSのみ）。各レースの実際の出走馬全頭がこの153行に
 * 含まれているため、memberLevel計算はこのデータセット内で自己完結する。
 */
function buildIsolatedHistory(): Record<string, RacePerformance[]> {
  const rawByHorseId: Record<string, RaceHistoryRawInput[]> = {};
  for (const row of NIIGATA_GATE_HISTORY_ROWS) {
    (rawByHorseId[row.horseId] ??= []).push(toRawInput(row));
  }
  // 各horseId内をraceDate降順（新しい順）に並べる。buildRaceHistory自体は
  // raceId横断でraceDate昇順にレースをグルーピングするため順序に依存しないが、
  // calculateAbilityBeforeRaceが「新しい順」を仮定するため、この関数の呼び出し側
  // (computeAbilityAdjustedResiduals)で明示的に再ソートして使う。
  return buildRaceHistory(rawByHorseId, [], [], {});
}

let cachedIsolatedHistory: Record<string, RacePerformance[]> | null = null;
/** 153行の閉じたデータセットのみを入力としたraceScore/memberLevel計算結果（遅延・メモ化） */
export function getIsolatedGateHistory(): Record<string, RacePerformance[]> {
  if (cachedIsolatedHistory === null) {
    cachedIsolatedHistory = buildIsolatedHistory();
  }
  return cachedIsolatedHistory;
}

export interface FrameStats {
  frame: number;
  starts: number;
  wins: number;
  winRate: number;
  top2: number;
  top2Rate: number;
  top3: number;
  top3Rate: number;
  averageFinish: number;
  averageNormalizedFinish: number;
}

/** 枠(1〜8)ごとの生の観測統計（能力未統制）。CHECKPOINT14D.1C 10節と同一定義 */
export function computeRawFrameStats(rows: NiigataGateHistoryRow[] = NIIGATA_GATE_HISTORY_ROWS): FrameStats[] {
  const stats: FrameStats[] = [];
  for (let frame = 1; frame <= 8; frame++) {
    const frameRows = rows.filter((r) => r.gate === frame);
    const starts = frameRows.length;
    if (starts === 0) {
      stats.push({ frame, starts: 0, wins: 0, winRate: 0, top2: 0, top2Rate: 0, top3: 0, top3Rate: 0, averageFinish: 0, averageNormalizedFinish: 0 });
      continue;
    }
    const wins = frameRows.filter((r) => r.finishPosition === 1).length;
    const top2 = frameRows.filter((r) => r.finishPosition <= 2).length;
    const top3 = frameRows.filter((r) => r.finishPosition <= 3).length;
    const averageFinish = frameRows.reduce((s, r) => s + r.finishPosition, 0) / starts;
    const averageNormalizedFinish =
      frameRows.reduce((s, r) => s + (r.finishPosition - 1) / (r.fieldSize - 1), 0) / starts;
    stats.push({
      frame,
      starts,
      wins,
      winRate: wins / starts,
      top2,
      top2Rate: top2 / starts,
      top3,
      top3Rate: top3 / starts,
      averageFinish,
      averageNormalizedFinish,
    });
  }
  return stats;
}

export interface AbilityAdjustedRow {
  raceId: string;
  raceDate: string;
  raceName: string;
  horseId: string;
  horseName: string;
  frame: number;
  horseNumber: number;
  fieldSize: number;
  finishPosition: number;
  raceScore: number;
  abilityBeforeRace: number | null;
  residual: number | null;
  normalizedGatePosition: number;
  /** abilityBeforeRaceの根拠。production=production側の実データのみ使用、none=算出不能 */
  evidenceSource: "production" | "none";
}

/**
 * 各Historical行について、raceScoreはisolatedデータセット（このファイル内で自己完結、
 * production非依存）から取る。abilityBeforeRace（その走以前の実力水準）は、
 * production `getHorseRecentRaces()`（READ-ONLY）を参照し、対象raceDateより厳密に前の
 * 実データのみを使う（future leakage禁止）。production側にその馬の実データが無い場合は
 * abilityBeforeRace=null（50点等で補完しない、CHECKPOINT14D.1C同様の既存方針）。
 *
 * 重要: この関数はgetHorseRecentRaces()を呼ぶだけであり、production
 * `data/horses/*.json`・`historyByHorseId`へは一切書き込まない（読み取り専用）。
 */
export function computeAbilityAdjustedResiduals(): AbilityAdjustedRow[] {
  const isolatedHistory = getIsolatedGateHistory();
  const results: AbilityAdjustedRow[] = [];

  for (const row of NIIGATA_GATE_HISTORY_ROWS) {
    const isolatedPerfs = isolatedHistory[row.horseId] ?? [];
    const perf = isolatedPerfs.find((p) => p.raceId === row.raceId);
    if (!perf) continue;

    const cutoffMs = Date.parse(row.raceDate);
    const productionPriorRaceScores = getHorseRecentRaces(row.horseId)
      .filter((r) => Date.parse(r.raceDate) < cutoffMs)
      .sort((a, b) => Date.parse(b.raceDate) - Date.parse(a.raceDate))
      .map((r) => r.raceScore);

    const abilityBeforeRace =
      productionPriorRaceScores.length > 0 ? calculateAbilityBeforeRace(productionPriorRaceScores) : null;
    const residual = abilityBeforeRace === null ? null : perf.raceScore - abilityBeforeRace;

    results.push({
      raceId: row.raceId,
      raceDate: row.raceDate,
      raceName: row.raceName,
      horseId: row.horseId,
      horseName: row.horseName,
      frame: row.gate,
      horseNumber: row.horseNumber,
      fieldSize: row.fieldSize,
      finishPosition: row.finishPosition,
      raceScore: perf.raceScore,
      abilityBeforeRace,
      residual,
      normalizedGatePosition: row.fieldSize > 1 ? (row.horseNumber - 1) / (row.fieldSize - 1) : 0.5,
      evidenceSource: abilityBeforeRace === null ? "none" : "production",
    });
  }
  return results;
}

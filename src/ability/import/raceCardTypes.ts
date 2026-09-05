/**
 * Race Card Input V1（CHECKPOINT13.2B）。
 *
 * 実際の1レースの出走表を、システムへ安全に投入するための正式Input Schema。
 * これは過去走データ（RacePerformanceInput）ではなく、「今回のレースに誰が出るか」
 * だけを表す別種のデータである。data/horses/ の過去走履歴とは一切混同しない
 * （このファイル自体もdata/horses/を読み書きしない）。
 */

import type { Surface } from "../types";

export interface RaceCardRunnerInput {
  /** 呼び出し側が既に把握しているcanonical horseId。無ければnull/undefined（推測しない） */
  horseId?: string | null;
  /** 外部Source側の馬ID。sourceHorseIdRegistryが無ければ無視される */
  sourceHorseId?: string | null;
  horseName: string;
  /** 枠番 */
  frame: number;
  /** 馬番 */
  horseNumber: number;
  /** 斤量(kg)。Stage A時点で未確定ならnull/undefined（推測しない） */
  assignedWeight?: number | null;
  /** 出走取消 */
  scratched: boolean;
}

export interface RaceCardInput {
  raceId: string;
  /** ISO 8601 (YYYY-MM-DD) */
  raceDate: string;
  /**
   * レース番号。CHECKPOINT13の正式対象（毎週土日各場11R）に合わせ、
   * Race Card Input V1では必須項目とする（9R/10R/WIN5対応は今回追加しない）。
   */
  raceNumber: number;
  racecourse: string;
  surface: Surface;
  distance: number;
  /** 発走予定時刻（ISO 8601）。Stage BのT-2h算出にそのまま使える */
  scheduledStartTime: string;
  /**
   * 馬場状態。Stage A時点で未確定ならnull（推測で「良」等を埋めない）。
   * nullの場合、Suitability V1のgoing componentはevaluated=falseに構造的に帰着する
   * （predictionSnapshot.tsのGOING_UNKNOWN_SENTINELの仕組みをそのまま利用、無変更）。
   */
  going: string | null;
  runners: RaceCardRunnerInput[];
}

export interface RaceCardValidationError {
  path: string;
  message: string;
}

export type RaceCardNormalizeResult =
  | { ok: true; data: RaceCardInput }
  | { ok: false; errors: RaceCardValidationError[] };

const VALID_SURFACES = new Set(["turf", "dirt"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * 任意形式（JSON.parse済みのunknown、またはCSVパース済みRecord<string,string>[]の
 * うち1行目からレースレベル項目を読んだもの）から RaceCardInput を検証・正規化する。
 * 1件でも異常があれば例外を投げず{ok:false, errors}を返す（他の取り込み層と同じ方針）。
 */
export function normalizeRaceCard(input: unknown): RaceCardNormalizeResult {
  const errors: RaceCardValidationError[] = [];
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [{ path: "$", message: "Race Cardはオブジェクトである必要があります" }] };
  }
  const obj = input as Record<string, unknown>;

  if (!isNonEmptyString(obj.raceId)) errors.push({ path: "raceId", message: "raceIdが空です" });
  if (!isNonEmptyString(obj.raceDate) || !DATE_PATTERN.test(obj.raceDate as string) || Number.isNaN(Date.parse(obj.raceDate as string))) {
    errors.push({ path: "raceDate", message: "raceDateはYYYY-MM-DD形式である必要があります" });
  }
  if (typeof obj.raceNumber !== "number" || !Number.isInteger(obj.raceNumber) || obj.raceNumber < 1) {
    errors.push({ path: "raceNumber", message: "raceNumberは1以上の整数である必要があります（必須）" });
  }
  if (!isNonEmptyString(obj.racecourse)) errors.push({ path: "racecourse", message: "racecourseが空です" });
  if (typeof obj.surface !== "string" || !VALID_SURFACES.has(obj.surface)) {
    errors.push({ path: "surface", message: "surfaceはturf/dirtのいずれかである必要があります" });
  }
  if (typeof obj.distance !== "number" || obj.distance <= 0) {
    errors.push({ path: "distance", message: "distanceは正の数値である必要があります" });
  }
  if (!isNonEmptyString(obj.scheduledStartTime) || Number.isNaN(Date.parse(obj.scheduledStartTime as string))) {
    errors.push({ path: "scheduledStartTime", message: "scheduledStartTimeはISO 8601形式である必要があります" });
  }

  // going: null/undefined（未確定）は許可。値がある場合は非空文字列のみ許可（推測で埋めない）
  let going: string | null = null;
  if (obj.going !== undefined && obj.going !== null) {
    if (typeof obj.going !== "string" || obj.going.trim() === "") {
      errors.push({ path: "going", message: "goingは非空文字列またはnull/未指定（未確定）である必要があります" });
    } else {
      going = obj.going;
    }
  }

  if (!Array.isArray(obj.runners) || obj.runners.length === 0) {
    errors.push({ path: "runners", message: "runnersは1件以上の配列である必要があります" });
  }

  const runners: RaceCardRunnerInput[] = [];
  if (Array.isArray(obj.runners)) {
    obj.runners.forEach((raw, idx) => {
      if (typeof raw !== "object" || raw === null) {
        errors.push({ path: `runners[${idx}]`, message: "runnerはオブジェクトである必要があります" });
        return;
      }
      const r = raw as Record<string, unknown>;
      if (!isNonEmptyString(r.horseName)) {
        errors.push({ path: `runners[${idx}].horseName`, message: "horseNameが空です" });
      }
      if (typeof r.frame !== "number" || !Number.isInteger(r.frame) || r.frame < 1) {
        errors.push({ path: `runners[${idx}].frame`, message: "frameは1以上の整数である必要があります" });
      }
      if (typeof r.horseNumber !== "number" || !Number.isInteger(r.horseNumber) || r.horseNumber < 1) {
        errors.push({ path: `runners[${idx}].horseNumber`, message: "horseNumberは1以上の整数である必要があります" });
      }
      const scratched = r.scratched === true;

      runners.push({
        horseId: typeof r.horseId === "string" && r.horseId.trim() !== "" ? r.horseId : null,
        sourceHorseId: typeof r.sourceHorseId === "string" && r.sourceHorseId.trim() !== "" ? r.sourceHorseId : null,
        horseName: isNonEmptyString(r.horseName) ? r.horseName : "",
        frame: typeof r.frame === "number" ? r.frame : NaN,
        horseNumber: typeof r.horseNumber === "number" ? r.horseNumber : NaN,
        assignedWeight: typeof r.assignedWeight === "number" ? r.assignedWeight : null,
        scratched,
      });
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      raceId: obj.raceId as string,
      raceDate: obj.raceDate as string,
      raceNumber: obj.raceNumber as number,
      racecourse: obj.racecourse as string,
      surface: obj.surface as Surface,
      distance: obj.distance as number,
      scheduledStartTime: obj.scheduledStartTime as string,
      going,
      runners,
    },
  };
}

/**
 * CSV形式（1行=1出走馬。レース単位の列は全行で同一値の前提）からRaceCardInputへ変換する。
 * parseCsv()（csvParser.ts）の出力（Record<string,string>[]）をそのまま受け取る。
 */
export function raceCardFromCsvRows(rows: Record<string, string>[]): RaceCardNormalizeResult {
  if (rows.length === 0) {
    return { ok: false, errors: [{ path: "$", message: "CSVに行がありません" }] };
  }
  const first = rows[0];
  const errors: RaceCardValidationError[] = [];

  // レース単位の列が全行で一致しているか確認する（raceIdMismatchの取り込み時点での予防）
  const raceLevelKeys = ["raceId", "raceDate", "raceNumber", "racecourse", "surface", "distance", "scheduledStartTime", "going"];
  rows.forEach((row, idx) => {
    for (const key of raceLevelKeys) {
      if ((row[key] ?? "") !== (first[key] ?? "")) {
        errors.push({
          path: `row[${idx}].${key}`,
          message: `レース単位の項目「${key}」が1行目と異なります（"${first[key]}" vs "${row[key]}"）。1レース分のCSVには同一レースの行だけを含めてください。`,
        });
      }
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  const runners = rows.map((row) => ({
    horseId: row.horseId?.trim() || null,
    sourceHorseId: row.sourceHorseId?.trim() || null,
    horseName: row.horseName?.trim() ?? "",
    frame: Number(row.frame),
    horseNumber: Number(row.horseNumber),
    assignedWeight: row.assignedWeight?.trim() ? Number(row.assignedWeight) : null,
    scratched: row.scratched?.trim().toLowerCase() === "true" || row.scratched?.trim() === "1",
  }));

  return normalizeRaceCard({
    raceId: first.raceId,
    raceDate: first.raceDate,
    raceNumber: first.raceNumber ? Number(first.raceNumber) : undefined,
    racecourse: first.racecourse,
    surface: first.surface,
    distance: first.distance ? Number(first.distance) : undefined,
    scheduledStartTime: first.scheduledStartTime,
    going: first.going?.trim() ? first.going : null,
    runners,
  });
}

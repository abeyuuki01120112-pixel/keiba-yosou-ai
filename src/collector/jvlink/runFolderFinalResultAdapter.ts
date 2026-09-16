/**
 * JV-Link Final Result Adapter（Post-Race Pipeline V1）。
 *
 * 対象レース自身のStage 6/7相当（確定成績）RA/SEから、Result Artifact v2へ
 * mappingするための正規化中間表現を構築する。
 *
 * 【責務分離（絶対厳守）】
 * 既存adaptJvLinkRunFolder()（runFolderAdapter.ts）は対象レースがStage 2
 * （発走前出馬表）であることを要求する（`TARGET_REQUIRES_STAGE_2_RACE_CARD`）。
 * この関数はその逆で、対象レースがStage 6/7（確定成績）であることを要求し、
 * Stage 2・Stage Bを明示的に拒否する。既存のPrediction経路（Stage 2専用）は
 * 一切変更しない——これにより、発走前PredictionへStage 6/7の結果データが
 * 混入するfuture leakageを構造的に防止する。
 *
 * byte offset・実測値抽出ロジックは、historyRace()と同じ
 * readSeMeasurementFields()／raceMeta()（runFolderAdapter.ts、既存）を再利用し、
 * 二重管理しない。
 *
 * 【Stage 6/7の意味について（未確認事項）】
 * このコードベース内には、Stage "6"と"7"を意味的に区別できる根拠が無い
 * （既存historyRace()も両方を同列に「確定済み過去走」として扱っている）。
 * したがって本Adapterも、Stage 6/7を個別の意味では区別せず、
 * 「既存コードが確定済み実績として信頼している2つのstage値のどちらか」
 * という既に実証済みの条件だけを判定基準として採用する。Stage 6と7の
 * 正式な意味の違いは、JV-Data公式仕様書での確認が必要な未確認事項として
 * 別途報告する。
 *
 * 【異常区分（取消・除外・中止・失格）について（未確認事項）】
 * SE record field(332,1)（既存コードが「0=通常」とだけ確認済み）以外に、
 * 取消/除外/中止/失格を区別する既知のbyte fieldがこのコードベースには無い。
 * 推測で分類しないため、field332が"0"以外の走者は「自動分類不能」として
 * 別バケツ（unclassifiedAbnormalRunners）へ分離し、finishPosition等を
 * 一切推測しない。呼び出し側（integration層）が人間の確認結果を
 * 明示的に与えない限り、これらの走者を含むResult Artifactは構築しない。
 */

import type { PassingPositionData } from "../../ability/types";
import { JvRecord, jvTimestampToIso, positiveJvNumber } from "./records";
import { raceMeta, readSeMeasurementFields } from "./runFolderAdapter";
import type { LoadedJvLinkRunFolder } from "./runFolderLoader";

export const JVLINK_FINAL_RESULT_ADAPTER_VERSION = "1.0.0";

/** 確定成績として信頼できるstage値。既存historyRace()と同一の判定基準（過去走でも同じ2値を確定済み実績として扱っている）。 */
const FINAL_RESULT_STAGES = ["6", "7"];

export interface AdaptedJvLinkFinalResultRace {
  raceId: string;
  raceDate: string;
  raceName: string;
  racecourse: string;
  distance: number;
  surface: "turf" | "dirt";
  /** RA recordのgoingが「未発表」の場合はnullへ正規化する（欠損を0や固定値で埋めない）。 */
  going: string | null;
}

export interface AdaptedJvLinkFinalResultRunner {
  canonicalHorseId: string;
  horseName: string;
  horseNumber: number;
  frameNumber: number;
  finishPosition: number;
  actualRaceTime: number | null;
  timeGap: number | null;
  final3F: number | null;
  final3FRank: number | null;
  passingPosition: PassingPositionData | null;
  carriedWeight: number | null;
}

/**
 * SE record field(332,1)が"0"以外の走者。取消/除外/中止/失格のいずれに
 * 該当するかをこのコードベースの既知情報だけでは自動判別できないため、
 * 生のraw値だけを保持し、finishPosition等は一切推測しない。
 */
export interface UnclassifiedAbnormalRunner {
  canonicalHorseId: string;
  horseName: string;
  horseNumber: number;
  /** 取消等でgateが未設定/0の場合がありうるためnullable（推測で埋めない）。 */
  frameNumber: number | null;
  raceKey: string;
  /** SE record field(332,1)の生値（"0"以外）。 */
  nonStartFlagRaw: string;
}

export interface AdaptedJvLinkFinalResultRunFolder {
  race: AdaptedJvLinkFinalResultRace;
  /** field332==="0"（正常完走）が確認できた走者のみ。 */
  runners: AdaptedJvLinkFinalResultRunner[];
  /** 自動分類不能な走者（取消/除外/中止/失格のいずれかの疑いがあるが未確定）。 */
  unclassifiedAbnormalRunners: UnclassifiedAbnormalRunner[];
  /** JV-Linkが当該確定成績recordを提供した時刻（対象record群のprovidedAt最大値）。 */
  resultAvailableAt: string;
  /** Mac側がこのrun folderを取得・処理した時刻（対象record群のretrievedAt最大値）。 */
  retrievedAt: string;
  /** run folder・元raw fileの追跡用識別子。 */
  sourceIdentifier: string;
  targetRaCount: number;
  targetSeCount: number;
}

function parseMeasurement(raw: string, pattern: RegExp, sentinelValues: readonly string[]): string | null {
  if (!pattern.test(raw) || sentinelValues.includes(raw)) return null;
  return raw;
}

function extractRunner(se: JvRecord, fieldSize: number): AdaptedJvLinkFinalResultRunner {
  const fields = readSeMeasurementFields(se);
  const finishPosition = positiveJvNumber(fields.finishPositionRaw, "FINISH_POSITION");

  const timeRaw = parseMeasurement(fields.raceTimeRaw, /^[0-9][0-5][0-9][0-9]$/, ["0000"]);
  const actualRaceTime = timeRaw === null ? null : Number(timeRaw[0]) * 60 + Number(timeRaw.slice(1)) / 10;

  const final3FRaw = parseMeasurement(fields.final3FRaw, /^\d{3}$/, ["000", "999"]);
  const final3F = final3FRaw === null ? null : Number(final3FRaw) / 10;

  const timeGapRaw = parseMeasurement(fields.timeGapRaw, /^[+-]\d{3}$/, []);
  const timeGap = timeGapRaw === null ? null : Number(timeGapRaw) / 10;

  const carriedWeightRaw = parseMeasurement(fields.carriedWeightRaw, /^\d{3}$/, ["000"]);
  const carriedWeight = carriedWeightRaw === null ? null : Number(carriedWeightRaw) / 10;

  const passing = fields.passingRaw
    .filter((value) => /^\d{2}$/.test(value) && Number(value) > 0)
    .map(Number);

  return {
    canonicalHorseId: se.horseId,
    horseName: se.field(41, 36),
    horseNumber: positiveJvNumber(fields.horseNumberRaw, "HORSE_NUMBER"),
    frameNumber: positiveJvNumber(fields.gateRaw, "GATE"),
    finishPosition,
    actualRaceTime,
    timeGap,
    final3F,
    final3FRank: null, // 全走者判明後にrankFinal3F()で確定する。
    passingPosition: passing.length === 0
      ? null
      : { cornerPositions: passing, fieldSize, source: "JRA-VAN/JV-Link", isReliable: true },
    carriedWeight,
  };
}

/**
 * 標準的な競技順位（同着は同順位、次の順位はその分だけ繰り下がる）。
 * final3F=nullの走者は順位付けの対象外（final3FRank=nullのまま）。
 */
function rankFinal3F(runners: AdaptedJvLinkFinalResultRunner[]): AdaptedJvLinkFinalResultRunner[] {
  const ranked = runners.filter((r) => r.final3F !== null).sort((a, b) => (a.final3F as number) - (b.final3F as number));
  const rankByHorseId = new Map<string, number>();
  ranked.forEach((runner, index) => {
    if (index > 0 && ranked[index - 1].final3F === runner.final3F) {
      rankByHorseId.set(runner.canonicalHorseId, rankByHorseId.get(ranked[index - 1].canonicalHorseId) as number);
    } else {
      rankByHorseId.set(runner.canonicalHorseId, index + 1);
    }
  });
  return runners.map((runner) => ({
    ...runner,
    final3FRank: rankByHorseId.get(runner.canonicalHorseId) ?? null,
  }));
}

/**
 * loaded run folderの対象レース自身をStage 6/7確定成績として解釈する。
 * Stage 2（発走前）・Stage B（海外等unsupported）は明示的に拒否する。
 */
export function adaptJvLinkFinalResultRunFolder(loaded: LoadedJvLinkRunFolder): AdaptedJvLinkFinalResultRunFolder {
  const { manifest, targetRa, targetEntries } = loaded;

  if (targetRa.stage === "2") {
    throw new Error(
      "TARGET_IS_PRE_RACE_STAGE_2: 対象レースはStage 2（発走前出馬表）です。" +
        "Final Result Adapterは確定成績（Stage 6/7）専用です。Prediction用adaptJvLinkRunFolder()を使ってください。",
    );
  }
  if (targetRa.stage === "B" || targetEntries.some((entry) => entry.stage === "B")) {
    throw new Error("UNSUPPORTED_TARGET_STAGE_B: 対象レースが海外・特殊stage（B）です（今回は国内JRA想定のため未対応）。");
  }
  if (!FINAL_RESULT_STAGES.includes(targetRa.stage) || targetEntries.some((entry) => !FINAL_RESULT_STAGES.includes(entry.stage))) {
    throw new Error(
      `UNSUPPORTED_TARGET_RESULT_STAGE: 対象レースのstageが確定成績として確認済みの値（${FINAL_RESULT_STAGES.join("/")}）` +
        "ではありません。",
    );
  }

  const meta = raceMeta(targetRa);
  if (meta.raceId !== manifest.targetRaceId) throw new Error("FINAL_RESULT_TARGET_RACE_ID_MISMATCH");
  // historyRace()と同じfield（884、既存コードで"PAST_FIELD_SIZE"として確定済み実績向けに
  // 使われているのと同一のstage系統）を、対象レース自身の確定頭数として再利用する。
  const fieldSize = positiveJvNumber(targetRa.field(884, 2), "FINAL_RESULT_FIELD_SIZE");

  const normalRunners: AdaptedJvLinkFinalResultRunner[] = [];
  const unclassified: UnclassifiedAbnormalRunner[] = [];
  for (const se of targetEntries) {
    if (!/^\d{10}$/.test(se.horseId) || /^0+$/.test(se.horseId)) throw new Error(`INVALID_HORSE_ID: ${se.key}`);
    const horseName = se.field(41, 36);
    if (!horseName) throw new Error(`MISSING_HORSE_NAME: ${se.horseId}`);
    const fields = readSeMeasurementFields(se);
    if (fields.nonStartFlag !== "0") {
      const gateNum = Number(fields.gateRaw);
      unclassified.push({
        canonicalHorseId: se.horseId,
        horseName,
        horseNumber: positiveJvNumber(fields.horseNumberRaw, "HORSE_NUMBER"),
        frameNumber: Number.isInteger(gateNum) && gateNum > 0 ? gateNum : null,
        raceKey: se.key,
        nonStartFlagRaw: fields.nonStartFlag,
      });
      continue;
    }
    normalRunners.push(extractRunner(se, fieldSize));
  }
  const runners = rankFinal3F(normalRunners);

  const duplicateIds = runners.map((r) => r.canonicalHorseId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) throw new Error(`DUPLICATE_FINAL_RESULT_HORSE_ID: ${duplicateIds.join(",")}`);

  const allTargetRecords = [targetRa as JvRecord, ...targetEntries];
  const latestProvidedAt = allTargetRecords.map((r) => r.envelope.providedAt).sort().at(-1);
  const latestRetrievedAt = allTargetRecords.map((r) => r.envelope.retrievedAt).sort().at(-1);
  if (latestProvidedAt === undefined || latestRetrievedAt === undefined) {
    throw new Error("FINAL_RESULT_PROVENANCE_EMPTY");
  }
  const sourceFiles = [...new Set(allTargetRecords.map((r) => r.envelope.sourceFile))];

  return {
    race: {
      raceId: meta.raceId,
      raceDate: meta.raceDate,
      raceName: meta.raceName,
      racecourse: meta.racecourse,
      distance: meta.distance,
      surface: meta.surface,
      going: meta.going === "未発表" ? null : meta.going,
    },
    runners,
    unclassifiedAbnormalRunners: unclassified,
    resultAvailableAt: jvTimestampToIso(latestProvidedAt),
    retrievedAt: latestRetrievedAt,
    sourceIdentifier: `targetRaceKey=${manifest.targetRaceKey};files=${sourceFiles.join(",")}`,
    targetRaCount: 1,
    targetSeCount: targetEntries.length,
  };
}

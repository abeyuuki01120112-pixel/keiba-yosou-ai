import { buildRaceHistory, type RaceHistoryRawInput } from "../../ability/raceHistoryPipeline";
import type {
  JvLinkSourceEvidence,
  PriorHistoryEntry,
  RawRaceBundle,
  RawRunnerRow,
  SourceProvenance,
  UnsupportedPriorHistoryEvidence,
} from "../types";
import { JvRecord, jvTimestampToIso, positiveJvNumber } from "./records";
import type { LoadedJvLinkRunFolder } from "./runFolderLoader";

export const JVLINK_MAC_ADAPTER_VERSION = "1.0.0";

export interface RaceMeta {
  raceId: string;
  raceDate: string;
  racecourse: string;
  raceNumber: number;
  raceName: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  courseLayout: string | null;
  courseVariant: string | null;
}

export interface AdaptedJvLinkRunFolder {
  targetBundle: RawRaceBundle;
  priorHistories: PriorHistoryEntry[];
  scheduledStartTime: string;
  raceCardAvailableAt: string;
  predictionCutoffAt: string;
  targetRaCount: number;
  targetSeCount: number;
  historyRaCount: number;
  historySeCount: number;
  matchedHistoryCount: number;
  unsupportedHistoryCount: number;
}

function evidence(record: JvRecord): JvLinkSourceEvidence {
  return {
    recordType: record.type,
    raceKey: record.key,
    horseId: record.horseId || null,
    stage: record.stage,
    sourceFile: record.envelope.sourceFile,
    providedAt: record.envelope.providedAt,
    retrievedAt: record.envelope.retrievedAt,
  };
}

function provenance(targetRaceId: string, targetAsOf: string, records: readonly JvRecord[]): SourceProvenance {
  const sourceFiles = [...new Set(records.map((record) => record.envelope.sourceFile))];
  const retrievedAt = records.map((record) => record.envelope.retrievedAt).sort().at(-1);
  if (retrievedAt === undefined) throw new Error("JVLINK_PROVENANCE_RECORDS_EMPTY");
  return {
    source: "JRA-VAN/JV-Link",
    sourceIdentifier: sourceFiles.join(";"),
    targetRaceId,
    retrievedAt,
    targetAsOf,
    method: "jv_link",
    collectorVersion: JVLINK_MAC_ADAPTER_VERSION,
    evidence: records.map(evidence),
  };
}

export function raceMeta(ra: JvRecord): RaceMeta {
  if (ra.type !== "RA" || !ra.course) throw new Error(`UNSUPPORTED_HISTORY_RACECOURSE: ${ra.key}`);
  const trackCode = positiveJvNumber(ra.field(706, 2), "TRACK_CODE");
  if (!((trackCode >= 10 && trackCode <= 22) || (trackCode >= 23 && trackCode <= 29))) {
    throw new Error(`UNSUPPORTED_SURFACE_TRACK_CODE: ${ra.key}/${trackCode}`);
  }
  const surface = trackCode <= 22 ? "turf" : "dirt";
  const goingCode = ra.field(surface === "turf" ? 889 : 890, 1);
  const goingByCode: Readonly<Record<string, string>> = {
    "0": "未発表",
    "1": "良",
    "2": "稍重",
    "3": "重",
    "4": "不良",
  };
  const going = goingByCode[goingCode];
  if (going === undefined) throw new Error(`UNKNOWN_GOING_CODE: ${ra.key}/${goingCode}`);
  return {
    raceId: ra.raceId,
    raceDate: ra.date,
    racecourse: ra.course[1],
    raceNumber: positiveJvNumber(ra.field(26, 2), "RACE_NUMBER"),
    raceName: ra.field(33, 60) || ra.field(573, 20),
    surface,
    distance: positiveJvNumber(ra.field(698, 4), "DISTANCE"),
    going,
    courseLayout: [12, 14, 16, 19, 21].includes(trackCode)
      ? "outer"
      : [13, 15, 17, 20, 22].includes(trackCode)
        ? "inner"
        : null,
    courseVariant: ra.field(710, 2) || null,
  };
}

function targetRunner(se: JvRecord, fieldSize: number, availableAt: string): RawRunnerRow {
  if (se.type !== "SE" || se.stage !== "2") throw new Error(`INVALID_TARGET_SE_STAGE: ${se.key}/${se.stage}`);
  if (!/^\d{10}$/.test(se.horseId) || /^0+$/.test(se.horseId)) throw new Error(`INVALID_HORSE_ID: ${se.key}`);
  const horseName = se.field(41, 36);
  if (!horseName) throw new Error(`MISSING_HORSE_NAME: ${se.horseId}`);
  return {
    entryStatus: "declared",
    availableAt,
    horseId: se.horseId,
    horseName,
    horseNumber: positiveJvNumber(se.field(29, 2), "HORSE_NUMBER"),
    gate: positiveJvNumber(se.field(28, 1), "GATE"),
    finishPosition: null,
    carriedWeightKg: positiveJvNumber(se.field(289, 3), "WEIGHT") / 10,
    actualRaceTimeSeconds: null,
    final3FSeconds: null,
    timeGapSeconds: null,
    fieldSize,
    passingPosition: null,
    source: "JRA-VAN/JV-Link",
    sourceRaceId: se.key,
    sourceHorseId: se.horseId,
  };
}

/**
 * SE recordの実測値byte領域を生文字列のまま抽出する（変換・validationはしない）。
 * historyRace()（Ability用、欠損はthrowして使用不可とする）と、
 * runFolderFinalResultAdapter.ts（Result Artifact v2用、欠損はnullとして保持する）の
 * 両方から呼ばれる、byte offsetの単一の真実源（二重管理を避ける）。
 */
export function readSeMeasurementFields(se: JvRecord): {
  nonStartFlag: string;
  finishPositionRaw: string;
  raceTimeRaw: string;
  final3FRaw: string;
  timeGapRaw: string;
  carriedWeightRaw: string;
  passingRaw: string[];
  gateRaw: string;
  horseNumberRaw: string;
} {
  return {
    nonStartFlag: se.field(332, 1),
    finishPositionRaw: se.field(335, 2),
    raceTimeRaw: se.field(339, 4),
    final3FRaw: se.field(391, 3),
    timeGapRaw: se.field(532, 4),
    carriedWeightRaw: se.field(289, 3),
    passingRaw: [352, 354, 356, 358].map((position) => se.field(position, 2)),
    gateRaw: se.field(28, 1),
    horseNumberRaw: se.field(29, 2),
  };
}

function historyRace(ra: JvRecord, se: JvRecord): RaceHistoryRawInput {
  if (!(["6", "7"].includes(ra.stage) && ["6", "7"].includes(se.stage))) {
    throw new Error(`UNSUPPORTED_HISTORY_STAGE: ${se.key}/${ra.stage}/${se.stage}`);
  }
  const fields = readSeMeasurementFields(se);
  if (fields.nonStartFlag !== "0") throw new Error(`NON_START_HISTORY: ${se.key}/${se.horseId}`);
  const meta = raceMeta(ra);
  if (meta.going === "未発表") throw new Error(`MISSING_HISTORY_GOING: ${se.key}`);
  const time = fields.raceTimeRaw;
  const final3F = fields.final3FRaw;
  const timeGap = fields.timeGapRaw;
  if (!/^[0-9][0-5][0-9][0-9]$/.test(time) || time === "0000" ||
      !/^\d{3}$/.test(final3F) || final3F === "000" || final3F === "999" ||
      !/^[+-]\d{3}$/.test(timeGap)) {
    throw new Error(`MISSING_HISTORY_MEASUREMENTS: ${se.key}/${se.horseId}`);
  }
  const fieldSize = positiveJvNumber(ra.field(884, 2), "PAST_FIELD_SIZE");
  const passing = fields.passingRaw
    .filter((value) => /^\d{2}$/.test(value) && Number(value) > 0)
    .map(Number);
  return {
    ...meta,
    gate: positiveJvNumber(fields.gateRaw, "GATE"),
    horseNumber: positiveJvNumber(fields.horseNumberRaw, "HORSE_NUMBER"),
    fieldSize,
    finishPosition: positiveJvNumber(fields.finishPositionRaw, "FINISH_POSITION"),
    timeGap: Number(timeGap) / 10,
    raceTime: Number(time[0]) * 60 + Number(time.slice(1)) / 10,
    final3F: Number(final3F) / 10,
    carriedWeight: positiveJvNumber(fields.carriedWeightRaw, "WEIGHT") / 10,
    passingPosition: passing.length === 0
      ? null
      : { cornerPositions: passing, fieldSize, source: "JRA-VAN/JV-Link", isReliable: true },
    source: "JRA-VAN/JV-Link",
    sourceRaceId: se.key,
    sourceHorseId: se.horseId,
    importedAt: se.envelope.retrievedAt,
    availableAt: jvTimestampToIso(se.envelope.providedAt),
    dataKind: "real",
  };
}

function unsupportedStageB(ra: JvRecord, se: JvRecord): UnsupportedPriorHistoryEvidence {
  const rawFinal3F = se.field(391, 3);
  const rawGate = se.field(28, 1);
  const rawPassing = [352, 354, 356, 358].map((position) => se.field(position, 2));
  const reasonCodes: UnsupportedPriorHistoryEvidence["reasonCodes"] = [
    "UNSCORABLE_STAGE_B_MISSING_REQUIRED_MEASUREMENT",
    "UNSUPPORTED_OVERSEAS_RACECOURSE",
    "UNMAPPED_OVERSEAS_RACE_ID",
  ];
  if (rawFinal3F === "000" || rawFinal3F === "999" || rawFinal3F === "") {
    reasonCodes.push("FINAL3F_NOT_PROVIDED");
  }
  if (rawGate === "0" || rawGate === "") reasonCodes.push("GATE_NOT_PROVIDED");
  if (rawPassing.every((position) => position === "00" || position === "")) {
    reasonCodes.push("PASSING_POSITION_NOT_PROVIDED");
  }
  return {
    status: "unscorable_for_ability",
    raceKey: se.key,
    raceDate: se.date,
    raceName: ra.field(33, 60) || ra.field(573, 20),
    racecourseCode: ra.field(20, 2),
    horseId: se.horseId,
    horseName: se.field(41, 36),
    raStage: ra.stage,
    seStage: se.stage,
    raw: {
      finishPosition: se.field(335, 2),
      raceTime: se.field(339, 4),
      timeGap: se.field(532, 4),
      carriedWeight: se.field(289, 3),
      final3F: rawFinal3F,
      gate: rawGate,
      passingPosition: rawPassing,
    },
    reasonCodes,
    provenance: [evidence(ra), evidence(se)],
  };
}

/** loaded rawを既存Normalize/Integrationが読める構造へ変換する。 */
export function adaptJvLinkRunFolder(loaded: LoadedJvLinkRunFolder): AdaptedJvLinkRunFolder {
  const { manifest, targetRa } = loaded;
  if (targetRa.stage !== "2" || loaded.targetEntries.some((entry) => entry.stage !== "2")) {
    throw new Error("TARGET_REQUIRES_STAGE_2_RACE_CARD");
  }
  const targetMeta = raceMeta(targetRa);
  if (targetMeta.raceId !== manifest.targetRaceId) throw new Error("ADAPTER_TARGET_RACE_ID_MISMATCH");
  const start = targetRa.field(874, 4);
  if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(start) || start === "0000") {
    throw new Error("MISSING_SCHEDULED_START_TIME");
  }
  const scheduledStartTime = `${manifest.raceDate}T${start.slice(0, 2)}:${start.slice(2)}:00+09:00`;
  if (Date.parse(manifest.targetAsOf) >= Date.parse(scheduledStartTime)) {
    throw new Error("TARGET_AS_OF_MUST_PRECEDE_START");
  }
  const latestTargetProvidedAt = loaded.targetRecords
    .map((record) => record.envelope.providedAt)
    .sort()
    .at(-1);
  if (latestTargetProvidedAt === undefined) throw new Error("TARGET_PROVENANCE_EMPTY");
  const raceCardAvailableAt = jvTimestampToIso(latestTargetProvidedAt);
  const fieldSize = positiveJvNumber(targetRa.field(882, 2), "DECLARED_FIELD_SIZE");
  if (loaded.targetEntries.length !== fieldSize) throw new Error("INCOMPLETE_TARGET_ENTRY_LIST");
  const targetBundle: RawRaceBundle = {
    ...targetMeta,
    runners: loaded.targetEntries.map((entry) => targetRunner(entry, fieldSize, raceCardAvailableAt)),
    provenance: provenance(manifest.targetRaceId, manifest.targetAsOf, loaded.targetRecords),
  };

  const historyEntryByIdentity = new Map(
    loaded.historyEntries.map((entry) => [`${entry.horseId}:${entry.key}`, entry]),
  );
  const rawByHorseId: Record<string, RaceHistoryRawInput[]> = {};
  const unsupportedByHorseId: Record<string, UnsupportedPriorHistoryEvidence[]> = {};
  const evidenceByHorseId = new Map<string, JvRecord[]>();

  for (const selection of manifest.historySelections) {
    rawByHorseId[selection.horseId] = [];
    unsupportedByHorseId[selection.horseId] = [];
    const sourceRecords: JvRecord[] = [];
    for (const raceKey of selection.selectedRaceKeys) {
      const se = historyEntryByIdentity.get(`${selection.horseId}:${raceKey}`);
      const ra = loaded.historyRaByKey.get(raceKey);
      if (!se || !ra) throw new Error(`SELECTED_HISTORY_RECORD_MISSING: ${selection.horseId}/${raceKey}`);
      sourceRecords.push(ra, se);
      if (ra.stage === "B" || se.stage === "B") {
        if (ra.stage !== "B" || se.stage !== "B") throw new Error(`INCONSISTENT_STAGE_B_PAIR: ${raceKey}`);
        unsupportedByHorseId[selection.horseId].push(unsupportedStageB(ra, se));
      } else {
        rawByHorseId[selection.horseId].push(historyRace(ra, se));
      }
    }
    evidenceByHorseId.set(selection.horseId, sourceRecords);
  }

  const built = buildRaceHistory(rawByHorseId);
  const priorHistories: PriorHistoryEntry[] = manifest.historySelections.map((selection) => {
    const sourceRecords = evidenceByHorseId.get(selection.horseId);
    if (sourceRecords === undefined) throw new Error(`HISTORY_PROVENANCE_MISSING: ${selection.horseId}`);
    const unsupportedHistories = unsupportedByHorseId[selection.horseId];
    return {
      horseId: selection.horseId,
      status: "available",
      races: built[selection.horseId] ?? [],
      selectedRaceKeys: [...selection.selectedRaceKeys],
      ...(unsupportedHistories.length > 0 ? { unsupportedHistories } : {}),
      provenance: provenance(manifest.targetRaceId, manifest.targetAsOf, sourceRecords),
      ...(selection.careerStartCountAsOf !== undefined
        ? { careerStartCountAsOf: selection.careerStartCountAsOf }
        : {}),
    };
  });

  return {
    targetBundle,
    priorHistories,
    scheduledStartTime,
    raceCardAvailableAt,
    predictionCutoffAt: manifest.targetAsOf,
    targetRaCount: 1,
    targetSeCount: loaded.targetEntries.length,
    historyRaCount: loaded.historyRaByKey.size,
    historySeCount: loaded.historyEntries.length,
    matchedHistoryCount: loaded.historyEntries.filter((entry) => loaded.historyRaByKey.has(entry.key)).length,
    unsupportedHistoryCount: priorHistories.reduce((sum, entry) => sum + (entry.unsupportedHistories?.length ?? 0), 0),
  };
}

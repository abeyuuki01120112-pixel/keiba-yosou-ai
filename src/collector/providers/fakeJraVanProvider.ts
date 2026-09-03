import { ManualRawFileProvider, DEFAULT_RAW_DIR } from "./manualRawFileProvider";
import type { RaceDataProvider } from "./RaceDataProvider";
import type { RawRaceBundle } from "../types";
import frozenGateHistoryRows from "../../ability/data/gateValidation/niigataTurf2000GateHistoryV1.json";

export const FAKE_JRAVAN_PROVIDER_VERSION = "0.1.0-v0";

interface FrozenGateHistoryRow {
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

/**
 * 本物のJRA-VAN Provider（JV-Link経由、Windows PC到着後に実装予定）が無い間、
 * Mac ↔ Windows Data Bridge・Prediction Pipeline・UIを検証できるようにする
 * Fakeの`RaceDataProvider`実装（PRE-WINDOWS INTEGRATION + UI V0、PHASE B）。
 *
 * `RaceDataProvider`と同一interfaceを実装しているため、将来
 * `RealJraVanProvider`（JV-Link接続）へ差し替えても、`collectRace()`・
 * `requestBridge.ts`・Prediction Pipeline・UIのいずれも無変更で動作する
 * ——これがV0で最も重要な設計目標（Windows到着時にProviderを追加するだけで
 * 実データ取得へ移行できる状態）。
 *
 * データソースの優先順位（架空データで埋めない、CLAUDE.md絶対原則5）:
 *   1. `ManualRawFileProvider`（`src/collector/data/raw/`配下の事前配置ファイル）
 *   2. 既存の凍結済みGate Validation実データ
 *      （`niigataTurf2000GateHistoryV1.json`、10レース153行、CHECKPOINT14D.1C監査済み）
 *      ——raceIdが一致すれば`RawRaceBundle`形式へ変換して返す
 *   いずれにも該当raceIdが無ければnull。
 */
export class FakeJraVanProvider implements RaceDataProvider {
  readonly id = "fake_jra_van";
  readonly version = FAKE_JRAVAN_PROVIDER_VERSION;
  private readonly manualProvider: ManualRawFileProvider;

  constructor(rawDir: string = DEFAULT_RAW_DIR) {
    this.manualProvider = new ManualRawFileProvider(rawDir);
  }

  async fetchRace(raceId: string): Promise<RawRaceBundle | null> {
    const manual = await this.manualProvider.fetchRace(raceId);
    if (manual !== null) return manual;
    return fromFrozenGateHistory(raceId);
  }
}

function fromFrozenGateHistory(raceId: string): RawRaceBundle | null {
  const rows = (frozenGateHistoryRows as FrozenGateHistoryRow[]).filter((r) => r.raceId === raceId);
  if (rows.length === 0) return null;
  const r0 = rows[0];

  return {
    raceId: r0.raceId,
    raceDate: r0.raceDate,
    racecourse: r0.racecourse,
    raceNumber: r0.raceNumber,
    raceName: r0.raceName,
    surface: r0.surface,
    distance: r0.distance,
    going: r0.going,
    courseLayout: r0.courseLayout,
    courseVariant: r0.courseVariant,
    runners: rows.map((r) => ({
      horseId: r.horseId,
      horseName: r.horseName,
      horseNumber: r.horseNumber,
      gate: r.gate,
      finishPosition: r.finishPosition,
      carriedWeightKg: r.carriedWeightKg,
      actualRaceTimeSeconds: r.actualRaceTimeSeconds,
      final3FSeconds: r.final3FSeconds,
      timeGapSeconds: r.timeGapSeconds,
      fieldSize: r.fieldSize,
      passingPosition: r.passingPosition,
      source: r.source,
      sourceRaceId: r.sourceRaceId,
      sourceHorseId: r.sourceHorseId,
    })),
    provenance: {
      source: "fake_jra_van_frozen_gate_validation",
      sourceIdentifier: "niigataTurf2000GateHistoryV1.json",
      targetRaceId: raceId,
      retrievedAt: new Date().toISOString(),
      targetAsOf: r0.raceDate,
      method: "manual_raw_file",
      collectorVersion: FAKE_JRAVAN_PROVIDER_VERSION,
    },
  };
}

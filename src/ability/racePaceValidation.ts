/**
 * Historical Pace Validation V1（CHECKPOINT14C.1）。
 *
 * `RaceLapSequenceRecord`（1レース分のラップ列）から、first600m/first1000mを機械的に
 * 導出する純粋関数のみを提供する。baseline依存の`continuousActualPace`/
 * `actualPaceClass`は、CHECKPOINT14C.1時点では実baselineデータが存在しないため
 * 常にnullとし、算出ロジック自体は実装しない（6〜7節で設計のみ提示、V1.1以降）。
 *
 * 【絶対に守ること】
 *   - 着順・「差し馬が勝った」等の結果論は一切参照しない。lapSequence（区間タイム）
 *     のみを根拠とする。
 *   - CHECKPOINT14CのRace Pace Prediction Engine（continuousPacePressure算出式・
 *     expectedPaceClass・runningStyle判定）は一切変更しない（本ファイルは呼び出さない）。
 *   - 存在しない/不十分なラップデータから値を推測して埋めない（null＋warningsで
 *     不足を明示する）。
 */

import type { ActualPaceMetrics, RaceLapSequenceRecord } from "./racePaceValidationTypes";

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * lapSequenceの先頭からtargetMeters分の区間タイムを合計する。
 * targetMetersがsegmentMetersで割り切れない場合、または区間数が不足している場合はnull
 * （推測で補完しない）。
 */
function sumFirstMeters(record: RaceLapSequenceRecord, targetMeters: number): number | null {
  if (record.segmentMeters <= 0) return null;
  if (targetMeters % record.segmentMeters !== 0) return null;
  const segmentsNeeded = targetMeters / record.segmentMeters;
  if (record.lapSequence.length < segmentsNeeded) return null;
  return roundToTwoDecimals(sum(record.lapSequence.slice(0, segmentsNeeded)));
}

/** first600mSecondsを導出する（距離を問わず、600m以上のレースであれば算出可能） */
export function deriveFirst600mSeconds(record: RaceLapSequenceRecord): number | null {
  if (record.distance < 600) return null;
  return sumFirstMeters(record, 600);
}

/**
 * first1000mSecondsを導出する。distance<1000mの場合はnull
 * （「最初の1000m」が距離全体やそれ以上になり意味を持たないため、CHECKPOINT14C.1 5節）。
 */
export function deriveFirst1000mSeconds(record: RaceLapSequenceRecord): number | null {
  if (record.distance < 1000) return null;
  return sumFirstMeters(record, 1000);
}

/**
 * lapSequenceの区間数×segmentMetersが、そのレースのdistanceとおおよそ一致しているかを
 * 確認する診断用チェック。不一致はblockせず警告のみ返す（レース最後の半端な区間や
 * 計測誤差を許容するため）。
 */
function checkLapSequenceCoverage(record: RaceLapSequenceRecord): string[] {
  const warnings: string[] = [];
  if (record.lapSequence.length === 0) {
    warnings.push("lapSequenceが空です。");
    return warnings;
  }
  const coveredMeters = record.lapSequence.length * record.segmentMeters;
  const diff = Math.abs(coveredMeters - record.distance);
  // 1区間分（segmentMeters）を超えて距離と食い違う場合のみ警告する（末尾半端区間は許容）
  if (diff > record.segmentMeters) {
    warnings.push(
      `lapSequenceの区間数×segmentMeters（${coveredMeters}m）がdistance（${record.distance}m）と大きく食い違っています。`,
    );
  }
  return warnings;
}

/**
 * RaceLapSequenceRecordからActualPaceMetricsを組み立てる。
 * continuousActualPace/actualPaceClassはbaseline未実装のため常にnull
 * （CHECKPOINT14C.1時点の既知の制約として明示する）。
 */
export function buildActualPaceMetrics(record: RaceLapSequenceRecord): ActualPaceMetrics {
  const warnings = checkLapSequenceCoverage(record);
  warnings.push(
    "continuousActualPace/actualPaceClassは、course/surface/distance別baselineが" +
      "未整備のため今回は算出していません（CHECKPOINT14C.1の既知の制約。V1.1以降で対応）。",
  );

  return {
    raceId: record.raceId,
    first600mSeconds: deriveFirst600mSeconds(record),
    first1000mSeconds: deriveFirst1000mSeconds(record),
    continuousActualPace: null,
    actualPaceClass: null,
    warnings,
  };
}

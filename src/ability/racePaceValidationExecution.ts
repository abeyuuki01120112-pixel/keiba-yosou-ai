/**
 * Historical Pace Validation Execution V1（CHECKPOINT14C.2B）。
 *
 * Lap Data Package到着後にPilot Validationを実行するための3つの機能を提供する:
 *   1. Leave-One-Race-Out（LOO）方式でのActual Pace算出（自己参照を避ける）
 *   2. 対象レースのraceDate時点へ巻き戻したHistorical Prediction生成
 *      （既存computeHistoricalPositionProfile/computeRacePacePredictionを無変更で呼ぶだけ）
 *   3. Prediction vs Actualの集計（Pace Class Accuracy・Confusion Matrix・相関）
 *
 * 【絶対に守ること】
 *   - Race Pace Prediction Engine（racePacePrediction.ts）・Historical Position
 *     Profile（positionProfile.ts）の計算式は一切変更しない。ここではそれらを
 *     「対象レースより前の履歴だけに絞り込んでから呼び出す」というオーケストレーションのみ行う。
 *   - future leakage: 各runnerのrecentRacesは、targetRaceDateよりstrictly-beforeの
 *     ものだけに絞り込んでからHistorical Position Profileへ渡す
 *     （import/recentRaces.tsと同じ「strictly-before」の規約）。
 *   - Actual Pace（lapSequence由来）は答え合わせ専用。Historical Prediction生成の
 *     入力には一切使わない（この2つの関数は完全に独立した入力を取る）。
 *   - 着順・人気・final3F等の結果論はここでは一切参照しない（lapSequenceのみ）。
 */

import { mean } from "../simulation/probability";
import { computeHistoricalPositionProfile } from "./positionProfile";
import { computeRacePacePrediction } from "./racePacePrediction";
import { deriveFirst600mSeconds, buildActualPaceMetrics } from "./racePaceValidation";
import type { RacePerformance } from "./types";
import type { RacePacePrediction, RacePaceRunnerInput, ExpectedPaceClass } from "./racePacePredictionTypes";
import type { ActualPaceClass, ActualPaceMetrics, RaceLapSequenceRecord, PaceValidationRecord } from "./racePaceValidationTypes";

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Leave-One-Race-Out方式でActual Pace Metricsを算出する。各レースのcontinuousActualPace
 * は、自分自身を除いた同一プール内の他レースのfirst600mSecondsの平均との差分から求める
 * （自己参照禁止）。actualPaceClassは、プール自体の分布（三分位）から相対的に決める
 * （新規のmagic numberを持ち込まない。件数が3未満ならclass判定不能としてnullのまま）。
 *
 * Pilotは5〜8件程度の小標本を想定しており、これは「Production確定baseline」ではなく
 * 「Pace Engineの粗い妥当性を見るための暫定手法」であることを明示する（CHECKPOINT14C.2B 17節）。
 */
export function computeLeaveOneRaceOutActualPace(
  records: RaceLapSequenceRecord[],
): Array<ActualPaceMetrics & { raceId: string }> {
  const withFirst600 = records.map((record) => ({
    record,
    first600: deriveFirst600mSeconds(record),
  }));

  const results = records.map((record) => {
    const base = buildActualPaceMetrics(record);
    const self = withFirst600.find((w) => w.record.raceId === record.raceId)!;
    const warnings = [...base.warnings];

    if (self.first600 === null) {
      warnings.push(
        "first600mSecondsが導出できないため、continuousActualPace（LOO baseline）は算出できません。",
      );
      return { ...base, warnings };
    }

    const others = withFirst600.filter((w) => w.record.raceId !== record.raceId && w.first600 !== null);
    if (others.length === 0) {
      warnings.push(
        "LOO baseline算出に使える他レース（同一プール内でfirst600mSecondsが導出できるレース）が無いため、continuousActualPaceは算出できません。",
      );
      return { ...base, warnings };
    }

    const looMean = mean(others.map((o) => o.first600!));
    // looMean - 自身のfirst600m: 自身がプール平均より速ければ正の値（=pace pressureが高い）になる
    const continuousActualPace = roundToTwoDecimals(looMean - self.first600);
    warnings.push(
      `continuousActualPaceは、自身を除く${others.length}レースのfirst600mSeconds平均（${roundToTwoDecimals(looMean)}秒）との差分（プール平均より速いほど正の値）から算出した暫定値です（Pilot件数が少ないため参考値、CHECKPOINT14C.2B 17節）。`,
    );
    return { ...base, continuousActualPace, warnings };
  });

  // actualPaceClassは、continuousActualPaceが算出できたレース群の三分位（プール内相対）から決める。
  // 3件未満では意味のある三分位が作れないため、classはnullのままにする（新規の絶対閾値を作らない）。
  const withContinuous = results.filter((r): r is typeof r & { continuousActualPace: number } => r.continuousActualPace !== null);
  if (withContinuous.length >= 3) {
    const sorted = [...withContinuous].sort((a, b) => a.continuousActualPace - b.continuousActualPace);
    const thirdSize = Math.ceil(sorted.length / 3);
    sorted.forEach((r, i) => {
      let cls: ActualPaceClass;
      if (i < thirdSize) cls = "slow";
      else if (i >= sorted.length - thirdSize) cls = "high";
      else cls = "average";
      r.actualPaceClass = cls;
      r.warnings.push(
        `actualPaceClassは、Pilotプール内${sorted.length}レースのcontinuousActualPace三分位（新規のmagic numberではなく、このプール自体の分布）から暫定的に分類した値です。`,
      );
    });
  } else if (withContinuous.length > 0) {
    for (const r of withContinuous) {
      r.warnings.push(
        "continuousActualPaceが算出できたレースが3件未満のため、actualPaceClassは意味のある三分位を作れず未算出（null）のままにしています。",
      );
    }
  }

  return results.map((r, i) => ({ ...r, raceId: records[i].raceId }));
}

/**
 * 対象レースのraceDate時点へ巻き戻し、その時点でHistorical Position Profile経由の
 * Race Pace Predictionを生成する。各runnerのrecentRacesはtargetRaceDateより
 * strictly-beforeのものだけに絞り込む（future leakage対策）。
 * computeHistoricalPositionProfile/computeRacePacePrediction自体は無変更で呼ぶだけ。
 */
export function generateHistoricalRacePacePrediction(
  targetRaceDate: string,
  runners: Array<{ horseId: string; horseName: string; recentRaces: RacePerformance[] }>,
): RacePacePrediction {
  const cutoffTime = Date.parse(targetRaceDate);

  const runnerInputs: RacePaceRunnerInput[] = runners.map(({ horseId, horseName, recentRaces }) => {
    const priorRaces = recentRaces
      .filter((r) => Date.parse(r.raceDate) < cutoffTime)
      .sort((a, b) => Date.parse(b.raceDate) - Date.parse(a.raceDate));

    const profile = computeHistoricalPositionProfile(horseId, horseName, priorRaces);
    return {
      horseId,
      horseName,
      earlyNormalizedPositionMean: profile.earlyNormalizedPositionMean,
      positionStdDev: profile.positionStdDev,
      runningStyleDistribution: profile.runningStyleDistribution,
      representativeRunningStyle: profile.representativeRunningStyle,
      positionEvidenceCount: profile.positionEvidenceCount,
      positionConfidence: profile.positionConfidence,
    };
  });

  return computeRacePacePrediction(runnerInputs);
}

export interface PilotValidationSummary {
  totalRaces: number;
  /** expectedPaceClass===actualPaceClassの一致率。比較可能なレースが無ければnull */
  accuracy: number | null;
  /** confusionMatrix[predicted][actual] = 件数 */
  confusionMatrix: Record<ExpectedPaceClass, Record<ActualPaceClass, number>>;
  /** continuousPacePressure と continuousActualPace のPearson相関。3件未満または分散0ならnull */
  continuousCorrelation: number | null;
  warnings: string[];
}

function emptyConfusionMatrix(): Record<ExpectedPaceClass, Record<ActualPaceClass, number>> {
  const row = (): Record<ActualPaceClass, number> => ({ slow: 0, average: 0, high: 0 });
  return { slow: row(), average: row(), high: row() };
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mx = mean(xs);
  const my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(mean(ys.map((y) => (y - my) ** 2)));
  if (sx === 0 || sy === 0) return null;
  return Math.round((cov / (sx * sy)) * 1000) / 1000;
}

/**
 * PaceValidationRecordの集合から、Pilot Validation指標（Pace Class Accuracy・
 * Confusion Matrix・continuous相関）を集計する。sample数が小さい場合は相関を
 * 過大解釈しないよう警告を付与する（CHECKPOINT14C.2B 17節）。
 */
export function summarizePilotValidation(records: PaceValidationRecord[]): PilotValidationSummary {
  const warnings: string[] = [];
  const confusionMatrix = emptyConfusionMatrix();

  const comparable = records.filter((r) => r.actual.actualPaceClass !== null);
  for (const r of comparable) {
    confusionMatrix[r.predictedExpectedPaceClass][r.actual.actualPaceClass!]++;
  }
  const correct = comparable.filter((r) => r.predictedExpectedPaceClass === r.actual.actualPaceClass).length;
  const accuracy = comparable.length > 0 ? roundToTwoDecimals(correct / comparable.length) : null;

  const continuousPairs = records.filter((r) => r.actual.continuousActualPace !== null);
  const continuousCorrelation = pearsonCorrelation(
    continuousPairs.map((r) => r.predictedContinuousPacePressure),
    continuousPairs.map((r) => r.actual.continuousActualPace!),
  );

  if (records.length < 5) {
    warnings.push(
      `対象レース数が${records.length}件と少ないため、Accuracy/相関はいずれも参考値であり、Production採用の判断根拠にはしません。`,
    );
  }
  if (continuousCorrelation === null && continuousPairs.length > 0) {
    warnings.push("continuousActualPaceの分散が0、またはペア数が3件未満のため相関は算出していません。");
  }

  return {
    totalRaces: records.length,
    accuracy,
    confusionMatrix,
    continuousCorrelation,
    warnings,
  };
}

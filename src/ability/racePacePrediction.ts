/**
 * Race Pace Prediction V1（CHECKPOINT14C、Pre-Frame）。
 *
 * 出走メンバー構成（各馬のHistorical Position Profile、CHECKPOINT14B.2で確定した
 * Continuous Position Contract）から、レース全体の前半ペース傾向
 * （continuousPacePressure・frontPressure・expectedPaceClass・paceConfidence）を推定する。
 *
 * 【絶対に守ること】
 *   - Base Ability V1・raceScore・memberLevel・Suitability V1・Effective Ability・
 *     Eligibility・Formal Snapshot・Historical Position Profile V1のいずれも、この処理
 *     からは一切参照・変更しない。Pace PredictionはFinal Race Abilityへ一切接続しない
 *     （そのPaceが各馬に有利/不利かの判定=Pace Scenario Factorは別レイヤー、未実装）。
 *   - Position Band（front/mid/rear）・representativeRunningStyle（単一label）は
 *     diagnostic専用として扱い、pacePressure/frontPressure/expectedPaceClassの算出には
 *     使わない（frontRunnerCandidateCountという診断専用カウントにのみ使う）。主要入力は
 *     連続値（runningStyleDistribution.nige/senko、positionStdDev）とする。
 *   - future leakage: 呼び出し側が対象レースより前のデータから構築したHistorical Position
 *     Profileを渡す前提（baseAbility.ts等と同じ既存の規約）。
 *   - 枠順未確定のPre-Frame V1: frame/horseNumberを入力に含まない・仮定しない。
 *   - scratch: 本関数はcurrent active runner setから毎回再生成する純粋関数であり、
 *     取消馬は呼び出し側が渡す配列から除外するだけで良い（内部状態を保持しない）。
 *   - 根拠のない新規weight（0.6/0.3/0.1等）は導入しない。frontPressure/
 *     continuousPacePressureは、Contract Bのrunning style distribution（既に確率として
 *     確定済みの値）の単純合計のみで構成する。expectedPaceClassの閾値（2・1）は、
 *     legacy predictedPace.ts（CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み）の
 *     「逃げ候補2頭以上→high」「逃げ・先行候補ともに0頭→slow」という既存監査済みの
 *     ルールを、頭数の実数から連続期待値へそのまま転用したものであり、新規に考案した
 *     ものではない。
 */

import { baseConfidenceFromSampleCount } from "./suitabilityConfidence";
import { POSITION_STABILITY_MODERATE_MAX_STD_DEV } from "./positionProfile";
import type { PositionConfidence } from "./positionProfileTypes";
import type {
  ExpectedPaceClass,
  HorsePaceContribution,
  PaceConfidence,
  RacePacePrediction,
  RacePaceRunnerInput,
} from "./racePacePredictionTypes";

/**
 * legacy predictedPace.tsの「逃げ候補2頭以上→ハイペース」をfrontPressure（連続期待値）へ
 * そのまま転用した閾値。新規に考案した値ではない（上記モジュールコメント参照）。
 */
const PACE_CLASS_HIGH_FRONT_PRESSURE_THRESHOLD = 2;
/** 同じく「逃げ・先行候補ともに0頭→スロー」を、continuousPacePressure<1として転用 */
const PACE_CLASS_SLOW_PRESSURE_THRESHOLD = 1;

const CONFIDENCE_RANK: Record<PositionConfidence, number> = { high: 2, medium: 1, low: 0 };

function minConfidence(a: PositionConfidence, b: PositionConfidence): PositionConfidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * positionStdDevが大きい（variable stability、既存のPOSITION_STABILITY_MODERATE_MAX_STD_DEVを
 * 再利用）馬は、confidence計算上のみ最大でも"medium"扱いとする（frontPressureの数値自体は
 * 変更しない。あくまでconfidenceに対する慎重さの反映であり、「必ず前に行く」と決めつけない
 * ためのconfidence側の措置。CHECKPOINT14C 17節）。
 */
function effectiveContributorConfidence(
  positionConfidence: PositionConfidence,
  positionStdDev: number | null,
): PositionConfidence {
  if (positionStdDev !== null && positionStdDev > POSITION_STABILITY_MODERATE_MAX_STD_DEV) {
    return minConfidence(positionConfidence, "medium");
  }
  return positionConfidence;
}

function classifyExpectedPaceClass(frontPressure: number, continuousPacePressure: number): ExpectedPaceClass {
  if (frontPressure >= PACE_CLASS_HIGH_FRONT_PRESSURE_THRESHOLD) return "high";
  if (continuousPacePressure < PACE_CLASS_SLOW_PRESSURE_THRESHOLD) return "slow";
  return "average";
}

/**
 * 出走メンバー構成（Pre-Frame、frame/horseNumberなし）からRace Pace Prediction V1を算出する。
 * runnersは呼び出し側が「現在アクティブな（取消されていない）出走予定馬」に絞り込み済みの
 * 配列を渡す前提（scratch対応、CHECKPOINT14C 15節）。
 */
export function computeRacePacePrediction(runners: RacePaceRunnerInput[]): RacePacePrediction {
  const horses: HorsePaceContribution[] = runners.map((r) => {
    const nigeProbability = r.runningStyleDistribution ? r.runningStyleDistribution.nige / 100 : 0;
    const senkoProbability = r.runningStyleDistribution ? r.runningStyleDistribution.senko / 100 : 0;
    return {
      horseId: r.horseId,
      horseName: r.horseName,
      earlyNormalizedPositionMean: r.earlyNormalizedPositionMean,
      positionStdDev: r.positionStdDev,
      runningStyleDistribution: r.runningStyleDistribution,
      positionEvidenceCount: r.positionEvidenceCount,
      positionConfidence: r.positionConfidence,
      nigeProbability,
      contributionToPacePressure: nigeProbability + senkoProbability,
    };
  });

  const frontPressure = horses.reduce((sum, h) => sum + h.nigeProbability, 0);
  const continuousPacePressure = horses.reduce((sum, h) => sum + h.contributionToPacePressure, 0);
  const expectedPaceClass = classifyExpectedPaceClass(frontPressure, continuousPacePressure);

  const frontRunnerCandidateCount = runners.filter((r) => r.representativeRunningStyle === "nige").length;
  const likelyFrontGroup = horses
    .filter((h) => h.contributionToPacePressure > 0)
    .sort((a, b) => b.contributionToPacePressure - a.contributionToPacePressure)
    .map((h) => h.horseName);

  const warnings: string[] = [];
  const runnersWithoutEvidence = runners.filter((r) => r.positionEvidenceCount === 0);
  if (runnersWithoutEvidence.length > 0) {
    warnings.push(
      `${runnersWithoutEvidence.length}頭がHistorical Position Profile未算出（evidence無し）のため、` +
        `pacePressureへの寄与を0として扱っています（実際の脚質傾向は不明であり、0=後方寄りと断定するものではありません）。`,
    );
  }

  // field coverage（Position Profileが使える頭数）を、既存のbaseConfidenceFromSampleCount
  // （高:4件以上/中:2〜3件/低:0〜1件）へそのまま適用する。元々は1頭のレース数に対する
  // 基準だが、「有効なデータ点の個数→confidence」という同じ意味の閾値をフィールド頭数へ
  // 転用しており、新規の閾値は追加していない。
  const runnersWithEvidence = runners.filter((r) => r.positionEvidenceCount > 0);
  const coverageConfidence = baseConfidenceFromSampleCount(runnersWithEvidence.length);

  const contributors = horses.filter((h) => h.contributionToPacePressure > 0);
  let paceConfidence: PaceConfidence;
  if (contributors.length === 0) {
    paceConfidence = coverageConfidence;
  } else {
    const worstContributorConfidence = contributors.reduce<PositionConfidence>(
      (worst, h) => minConfidence(worst, effectiveContributorConfidence(h.positionConfidence, h.positionStdDev)),
      "high",
    );
    paceConfidence = minConfidence(coverageConfidence, worstContributorConfidence);
  }

  return {
    paceStage: "pre_frame",
    status: "DIAGNOSTIC_PRE_FRAME",
    runnerCount: runners.length,
    continuousPacePressure: Math.round(continuousPacePressure * 1000) / 1000,
    frontPressure: Math.round(frontPressure * 1000) / 1000,
    expectedPaceClass,
    paceConfidence,
    frontRunnerCandidateCount,
    likelyFrontGroup,
    horses,
    warnings,
  };
}

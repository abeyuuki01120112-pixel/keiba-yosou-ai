/**
 * raceContextFactor（STEP5・第23実装）: paceScenarioFactorとtrackBiasFactorの統合。
 *
 *   rawRaceContextFactor = paceScenarioFactor.adjusted × trackBiasFactor.adjusted / 100
 *   raceContextFactor    = clamp(rawRaceContextFactor, 90, 110)
 *
 * 【CHECKPOINT11.17追加・未評価ガード】paceScenarioFactor/trackBiasFactor自体の数式・閾値は
 * 一切変更していない。trackBiasFactorは観測が無い場合すでに自ら中立100を返す
 * （trackBiasFactor.ts、無変更）が、paceScenarioFactorには対戦馬データが0頭でも
 * classifyPredictedPace(既存・無変更)が決定的に"slow"等を返し、それがそのまま
 * raw/valueへ反映されてしまう非対称があった（CHECKPOINT11.16 STEP11で確認）。
 * predictedPace.fieldSize>0（対戦馬データが実際にある）またはtrackBiasFactorに実観測が
 * あるかのいずれも満たさない場合のみ、"評価できていない要素は能力を動かさない"という
 * Suitability V1と同じ原則に従い、valueを中立100へ上書きする（rawは監査用に実際の
 * 計算結果のまま残す）。これはpaceScenarioFactor/trackBiasFactor自体のロジック変更ではなく、
 * その出力をfinalRaceAbilityへ適用するかどうかの、この関数内だけの適用ガードである。
 */

import { clamp } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import type { PaceScenarioFactor, PredictedPace, RaceContextFactor, TrackBiasFactor } from "./raceContextTypes";

export const RACE_CONTEXT_CLAMP_MIN = 90;
export const RACE_CONTEXT_CLAMP_MAX = 110;
const RACE_CONTEXT_NEUTRAL = 100;

export function computeRaceContextFactor(
  paceScenarioFactor: PaceScenarioFactor,
  trackBiasFactor: TrackBiasFactor,
  predictedPace: PredictedPace,
): RaceContextFactor {
  const raw = roundToOneDecimal((paceScenarioFactor.adjusted * trackBiasFactor.adjusted) / 100);
  const evaluated = predictedPace.fieldSize > 0 || trackBiasFactor.usedSource !== "neutral";
  const value = evaluated ? clamp(raw, RACE_CONTEXT_CLAMP_MIN, RACE_CONTEXT_CLAMP_MAX) : RACE_CONTEXT_NEUTRAL;

  return { paceScenarioFactor, trackBiasFactor, raw, value, evaluated };
}

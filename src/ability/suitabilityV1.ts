/**
 * Suitability V1 統合層（CHECKPOINT11.3・最小実装）。
 *
 * CHECKPOINT11.1のSTEP2で決定した案C（既存の系統A・系統Bを内部部品として利用する
 * 薄い統合層）を実装する。既存ロジックは一切複製せず、そのまま呼び出す:
 *   - distance/course/going: 系統A（`distanceSuitability.ts`/`courseSuitability.ts`/
 *     `goingSuitability.ts`）の`compute*Suitability()`をそのまま再利用し、出力を
 *     `SuitabilityComponentResultV1`形式へ変換する薄いラッパーのみ追加する。
 *   - gate: 系統B（`courseContextPrior.ts`のCoursePrior、`horseGateEvidence.ts`+
 *     `horseEvidenceConfidence.ts`のHorseEvidence fact collector）をそのまま再利用する。
 *
 * confidence shrinkは`suitabilityConfidence.ts`の`shrinkTowardCenter`
 * （`adjusted = 100 + (raw - 100) × confidenceWeight`、weight: high=1.0/medium=0.6/
 * low=0.3）をそのまま再利用する。新しい根拠のない重みは作らない
 * （CHECKPOINT11.3 STEP4の明示的な指示）。
 *
 * 【重要】`suitability.ts`・`suitabilityCoreV1.ts`・`suitabilityCoreV1Types.ts`・
 * `courseContextPrior.ts`・`finalRaceAbility.ts`・Ability Model V1関連ファイルは
 * 一切変更しない。baseAbility/raceScore/memberLevel V1・HorseEvidence V1仕様・
 * RaceContext・trackBiasにも触れない。effectiveAbilityへの本番接続も行わない
 * （CHECKPOINT11.3 STEP8・STOP条件）。
 */
import { mean } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { computeCourseSuitability } from "./courseSuitability";
import { computeDistanceSuitability } from "./distanceSuitability";
import { computeGoingSuitability } from "./goingSuitability";
import { SUITABILITY_CENTER, shrinkTowardCenter } from "./suitabilityConfidence";
import {
  computeTokyoDirt1600CourseContextPrior,
  type EmpiricalValidationStatus,
  type RaceGateInput,
} from "./courseContextPrior";
import { collectHorseGateEvidence } from "./horseGateEvidence";
import { getHorseEvidenceConfidence } from "./horseEvidenceConfidence";
import type { RacePerformance } from "./types";
import type { SuitabilityComponent, SuitabilityTargetRaceContext } from "./suitabilityTypes";
import type { CoursePriorDetail, HorseEvidenceDetail } from "./suitabilityCoreV1Types";
import type { SuitabilityComponentResultV1, SuitabilityV1ComponentKey, SuitabilityV1Result } from "./suitabilityV1Types";

/**
 * gateのCoursePrior単独の最大影響幅（±ポイント）。
 * 既存コードで「弱い相性補正」に使われている振幅（`paceScenarioFactor.ts`の
 * PACE_SCENARIO_AMPLITUDE=5、`trackBiasFactor.ts`のTRACK_BIAS_AMPLITUDE=5）と
 * 同じ大きさを踏襲する。CoursePriorが単独で「100→80」のような大きな補正を
 * 生むことを禁止する（CHECKPOINT11.3 STEP5）ための、新規だが保守的な定数。
 */
export const GATE_COURSE_PRIOR_AMPLITUDE = 5;

/**
 * CoursePriorの`empiricalValidationStatus`（出典の主張と実測検証結果の分離、
 * `courseContextPrior.ts`）に応じて、GATE_COURSE_PRIOR_AMPLITUDEをさらに縮小する。
 * 実測検証で裏付けが弱い/未検証の場合に、出典側の主張だけで大きく動かさないための
 * 追加の安全策（根拠となるバックテストが無いため保守的な値を採用、STEP5の指示通り）。
 */
export const GATE_VALIDATION_STATUS_WEIGHT: Record<EmpiricalValidationStatus, number> = {
  supported: 1.0,
  weakOrUnstable: 0.5,
  notEvaluated: 0,
};

/** Suitability V1最終出力への異常値防止の安全境界（通常はほぼ到達しない想定）。clamp(90,110)とは別物 */
export const SUITABILITY_V1_SAFETY_MIN = 60;
export const SUITABILITY_V1_SAFETY_MAX = 120;

const TOKYO_DIRT_1600_TARGET = { racecourse: "東京", surface: "dirt", distance: 1600 } as const;

function isTokyoDirt1600(target: SuitabilityTargetRaceContext): boolean {
  return (
    target.racecourse === TOKYO_DIRT_1600_TARGET.racecourse &&
    target.surface === TOKYO_DIRT_1600_TARGET.surface &&
    target.distance === TOKYO_DIRT_1600_TARGET.distance
  );
}

/**
 * 系統A（distance/course/going）の`SuitabilityComponent`出力を
 * `SuitabilityComponentResultV1`形式へ変換する薄いラッパー。
 *
 * 系統Aは`sampleCount=0`の場合でも`raw=100`（中立）・`confidence="low"`を返す
 * （中立値へのフォールバックであり評価不能ではない、という既存の設計）。
 * CHECKPOINT11.3 STEP4の指示に従い、V1ではこれを「評価不能（unknown）」として
 * 明示的に扱い直す（overall統合から除外できるようにするため）。
 */
function wrapSystemAComponent(key: SuitabilityV1ComponentKey, component: SuitabilityComponent): SuitabilityComponentResultV1 {
  const evaluated = component.sampleCount > 0;
  const confidence = evaluated ? component.confidence : "unknown";

  const horseEvidence: HorseEvidenceDetail = {
    sampleCount: component.sampleCount,
    confidence,
    reason: component.reason,
  };

  return {
    key,
    evaluated,
    rawPercent: component.raw,
    adjustedPercent: component.adjusted,
    confidence,
    reason: component.reason,
    horseEvidence,
    // distance/course/goingにはCoursePrior相当の実装が現状無い（CHECKPOINT11監査結果）
    coursePrior: null,
  };
}

export interface SuitabilityV1Input {
  horseId: string;
  /** baseAbilityと同じ母集団（対象レースより前の直近5走、新しい順）。呼び出し側が用意する */
  recentRaces: RacePerformance[];
  target: SuitabilityTargetRaceContext;
  /** 対象レース（今回）のgate情報。不明な項目はnull（推測しない） */
  gate: RaceGateInput;
}

/**
 * gateコンポーネント。CoursePrior（東京ダート1600m限定・courseContextPrior.ts）を
 * 優先度2として使う。HorseEvidence（本人実績、horseGateEvidence.ts）は事実として
 * 収集・保持するが、gateのpercentを算出する採点式がまだ設計されていないため
 * （既存コードのどこにも存在しない）、今回はrawPercentの算出には使わない。
 * これは「HorseEvidence優先度1」を無視しているのではなく、HorseEvidence側に
 * percentへ変換する式がまだ無いために発生する制約であり、次回以降の課題として
 * 完了報告で明示する（推測でscoreを作らない、というプロジェクトの絶対原則を優先した）。
 */
function computeGateSuitabilityV1(input: SuitabilityV1Input): SuitabilityComponentResultV1 {
  const horseEvidenceRaw = collectHorseGateEvidence(input.horseId, input.recentRaces, {
    racecourse: input.target.racecourse,
    surface: input.target.surface,
    distance: input.target.distance,
  });
  const horseEvidenceConfidence = getHorseEvidenceConfidence(horseEvidenceRaw);
  const horseEvidence: HorseEvidenceDetail = {
    sampleCount: horseEvidenceRaw.sampleCount,
    confidence: horseEvidenceConfidence,
    reason:
      `本人実績（対象条件完全一致${horseEvidenceRaw.sampleCount}走、confidence=${horseEvidenceConfidence}）を` +
      "事実として保持するが、gateのpercent算出式が未設計のため今回のrawPercentには使用しない（次回以降の課題）。",
  };

  if (!isTokyoDirt1600(input.target)) {
    return {
      key: "gate",
      evaluated: false,
      rawPercent: SUITABILITY_CENTER,
      adjustedPercent: SUITABILITY_CENTER,
      confidence: "unknown",
      reason: "CoursePriorは東京ダート1600m限定のため、対象コースでは評価不能（推測で埋めない）。",
      horseEvidence,
      coursePrior: null,
    };
  }

  const coursePrior = computeTokyoDirt1600CourseContextPrior(input.gate.frame);
  if (coursePrior === null) {
    return {
      key: "gate",
      evaluated: false,
      rawPercent: SUITABILITY_CENTER,
      adjustedPercent: SUITABILITY_CENTER,
      confidence: "unknown",
      reason: "枠番（frame）が不明なため、CoursePriorが算出不能（推測で埋めない）。",
      horseEvidence,
      coursePrior: null,
    };
  }

  const validationWeight = GATE_VALIDATION_STATUS_WEIGHT[coursePrior.empiricalValidationStatus];
  const rawPercent = roundToOneDecimal(
    SUITABILITY_CENTER + coursePrior.gateCoefficient * GATE_COURSE_PRIOR_AMPLITUDE * validationWeight,
  );
  const adjustedPercent = roundToOneDecimal(shrinkTowardCenter(rawPercent, coursePrior.sourceConfidence));

  const coursePriorDetail: CoursePriorDetail = {
    confidence: coursePrior.sourceConfidence,
    reason:
      `gateCoefficient=${coursePrior.gateCoefficient}（東京ダート1600m、gateBiasLevel=${coursePrior.gateBiasLevel}、` +
      `empiricalValidationStatus=${coursePrior.empiricalValidationStatus}）。CoursePrior単独の最大影響幅を` +
      `±${GATE_COURSE_PRIOR_AMPLITUDE}ptに制限し、実測検証状況に応じてさらに${validationWeight}倍へ縮小した。`,
    referenceSource: "courseContextPrior.ts (TOKYO_DIRT_1600)",
  };

  return {
    key: "gate",
    evaluated: true,
    rawPercent,
    adjustedPercent,
    confidence: coursePrior.sourceConfidence,
    reason:
      `CoursePrior（東京ダート1600m gate構造事前分布、優先度2）のみに基づくrawPercent=${rawPercent}%。` +
      "本人実績（HorseEvidence、優先度1）はpercent算出式が未設計のため今回は未使用。",
    horseEvidence,
    coursePrior: coursePriorDetail,
  };
}

/**
 * 4componentのうちevaluated=trueだったものだけを対象に、adjustedPercentの単純平均を取る。
 *
 * 「unknownを100として混ぜる」方式ではなく「evaluatedのみで平均する」方式を採用した理由
 * （CHECKPOINT11.3 STEP6）:
 *   unknownを100として混ぜると、少数の実データに基づく正当なシグナル（例:
 *   goingだけ強い証拠でconfidence=high・adjusted=70）が、根拠の無い"100"3つに
 *   希釈されて見えなくなる（(70+100+100+100)/4=92.5という「軽度の不適性」に
 *   化けてしまい、"3要素は評価不能"という事実が結果から読み取れなくなる）。
 *   これは「データ不足を勝手に埋める」ことに等しく、CLAUDE.mdの絶対原則5
 *   （データ不足時は何が不足しているか明確に報告し、勝手に埋めない）に反する。
 *   evaluatedのみで平均し、`evaluatedComponentCount`を結果に含めて呼び出し側に
 *   公開することで、"少数のcomponentだけで算出された"という事実を隠さない設計とした。
 */
export function aggregateSuitabilityComponents(components: SuitabilityComponentResultV1[]): {
  overallSuitabilityPercent: number;
  evaluatedComponentCount: number;
} {
  const evaluatedComponents = components.filter((c) => c.evaluated);
  if (evaluatedComponents.length === 0) {
    return { overallSuitabilityPercent: SUITABILITY_CENTER, evaluatedComponentCount: 0 };
  }

  const overallRaw = mean(evaluatedComponents.map((c) => c.adjustedPercent));
  const overallSuitabilityPercent = clampSafety(roundToOneDecimal(overallRaw));
  return { overallSuitabilityPercent, evaluatedComponentCount: evaluatedComponents.length };
}

/** 通常はほぼ発動しない、異常値防止のための広い安全境界のみ（clamp(90,110)の代替ではない） */
function clampSafety(value: number): number {
  return Math.min(Math.max(value, SUITABILITY_V1_SAFETY_MIN), SUITABILITY_V1_SAFETY_MAX);
}

export function computeSuitabilityV1(input: SuitabilityV1Input): SuitabilityV1Result {
  const distance = wrapSystemAComponent("distance", computeDistanceSuitability(input.recentRaces, input.target));
  const course = wrapSystemAComponent("course", computeCourseSuitability(input.recentRaces, input.target));
  const going = wrapSystemAComponent("going", computeGoingSuitability(input.recentRaces, input.target));
  const gate = computeGateSuitabilityV1(input);

  const { overallSuitabilityPercent, evaluatedComponentCount } = aggregateSuitabilityComponents([
    distance,
    course,
    going,
    gate,
  ]);

  return { distance, course, going, gate, overallSuitabilityPercent, evaluatedComponentCount };
}

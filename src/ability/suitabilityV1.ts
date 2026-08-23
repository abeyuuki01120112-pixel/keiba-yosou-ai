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
import { mean, median } from "../simulation/probability";
import { roundToOneDecimal } from "./raceScore";
import { calculateAbilityBeforeRace } from "./abilityBeforeRace";
import { computeCourseSuitability } from "./courseSuitability";
import { computeDistanceSuitability } from "./distanceSuitability";
import { computeGoingSuitability } from "./goingSuitability";
import { SUITABILITY_CENTER, shrinkTowardCenter } from "./suitabilityConfidence";
import {
  computeTokyoDirt1600CourseContextPrior,
  type EmpiricalValidationStatus,
  type RaceGateInput,
} from "./courseContextPrior";
import { collectHorseGateEvidence, type HorseEvidence } from "./horseGateEvidence";
import { resolveHorseEvidenceConfidence, type HorseEvidenceConfidence } from "./horseEvidenceConfidence";
import type { RacePerformance } from "./types";
import type { SuitabilityComponent, SuitabilityConfidence, SuitabilityTargetRaceContext } from "./suitabilityTypes";
import type { CoursePriorDetail, HorseEvidenceDetail, SuitabilityConfidenceV1 } from "./suitabilityCoreV1Types";
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

/**
 * gate HorseEvidence（本人実績）のrawPerformanceDelta（=raceScore−abilityBeforeRace、
 * HorseEvidence V1と同一定義、CHECKPOINT11.5正式採用）をpercentへ変換するtanh飽和式。
 *
 *   rawPercent = 100 + GATE_HORSE_EVIDENCE_AMPLITUDE × tanh(aggregatedDelta / GATE_HORSE_EVIDENCE_SCALE)
 *
 * tanhは±1に飽和するため、amplitudeはrawPercentが取りうる最大乖離幅を数学的に保証する
 * （どれだけ極端なdeltaでも100±amplitudeを超えない）。「枠は能力を微調整する要素」という
 * 思想に基づき、候補[3,4,5,6,8]のうち実データ（data/horses/、同一馬×同一
 * racecourse×surface×distance再訪問、n=7グループ）で90/110は言うに及ばず95/105すら
 * 一度も超えない最大値として5を採用した（CHECKPOINT11.5 STEP2〜4）。
 */
export const GATE_HORSE_EVIDENCE_AMPLITUDE = 5;

/**
 * scaleは小さいdeltaへの反応感度を決める。CHECKPOINT11.6〜11.9で段階的に
 * 実データを拡張（n=7→18→23グループ、20頭、positive/negative/neutral全方向、
 * negative側5頭・neutral側2グループを確保）し、houohbiscuits依存もleave-one-horse-out
 * でshift=0.00まで実質解消したことを確認した上で、事前に固定した選択ルール
 * （1.過補正防止 2.Base Ability順位の逆転回避 3.LOHO安定性 4.positive/negative双方への
 * 反応性維持 5.解釈可能性、実質同等ならより補正の弱い値を優先するtie-break rule）に
 * 従いscale=3.5とscale=4.0を比較した（CHECKPOINT11.9）。実データ上もっとも強い
 * positive/negative deltaでもscale=4.0は3.5比0.04〜0.18pt程度しか差が無く反応不足は
 * 確認されなかったため、tie-break ruleにより補正の弱いscale=4.0をV1正式値として採用した
 * （CHECKPOINT11.10）。詳細はdocs/gate-horse-evidence-v1-spec.md参照。
 */
export const GATE_HORSE_EVIDENCE_SCALE = 4;

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
 * 【CHECKPOINT11.11・confidence閾値統一】系統Aの`component.confidence`は
 * `suitabilityConfidence.ts`の`baseConfidenceFromSampleCount`（3段階:
 * 0-1=low/2-3=medium/4+=high）で算出されているが、この関数は
 * `memberLevelCandidates.ts`（Ability Model V1・memberLevel V1の本番計算、
 * 凍結済み）と`stabilityFactor.ts`（docs/step6-decisions.mdで閾値変更禁止と
 * 明記済み）からも共有参照されており、**この関数自体・`suitabilityConfidence.ts`は
 * 変更できない**（変更するとAbility Model V1の凍結計算に影響する）。
 *
 * 一方HorseEvidence側は`resolveHorseEvidenceConfidence`（4段階:
 * 0=unknown/1-2=low/3-4=medium/5+=high、HorseEvidence V1凍結仕様）を使っており、
 * gate componentはこちらを使う。両者はsampleCount=2/4で判定が食い違う
 * （2走: medium vs low、4走: high vs medium）。
 *
 * この不一致は、Suitability V1（`suitabilityV1.ts`、CHECKPOINT11.3以降の新設
 * レイヤーで凍結対象外）の出力層でのみ解消する。系統Aの`component.raw`
 * （confidence反映前の生値）を受け取り、**HorseEvidence側の閾値
 * （`resolveHorseEvidenceConfidence`、既存関数をそのまま再利用）でconfidenceを
 * 再判定し、`shrinkTowardCenter`（既存、無変更）で`adjustedPercent`を
 * 独自に再計算する**。`distanceSuitability.ts`等が自身の内部計算・テストで使う
 * `component.adjusted`（3段階基準のまま）自体は一切変更しない
 * （呼び出し元・既存テストへの影響ゼロ）。
 *
 * sampleCount=0の場合は`resolveHorseEvidenceConfidence(0)`が"unknown"を返すため、
 * CHECKPOINT11.3 STEP4の「評価不能（unknown）」扱いもそのまま維持される。
 */
function wrapSystemAComponent(key: SuitabilityV1ComponentKey, component: SuitabilityComponent): SuitabilityComponentResultV1 {
  const evaluated = component.sampleCount > 0;
  const confidence = resolveHorseEvidenceConfidence(component.sampleCount);
  const adjustedPercent = roundToOneDecimal(shrinkTowardCenter(component.raw, toShrinkConfidence(confidence)));

  const horseEvidence: HorseEvidenceDetail = {
    sampleCount: component.sampleCount,
    confidence,
    reason: component.reason,
  };

  return {
    key,
    evaluated,
    rawPercent: component.raw,
    adjustedPercent,
    confidence,
    reason: component.reason,
    horseEvidence,
    // distance/course/goingにはCoursePrior相当の実装が現状無い（CHECKPOINT11監査結果）
    coursePrior: null,
    source: evaluated ? "horseEvidence" : "none",
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
 * gateのrawPerformanceDelta（=raceScore−abilityBeforeRace、HorseEvidence V1と同一定義）を、
 * 対象条件（racecourse×surface×distance完全一致）に該当する走ごとに計算する。
 *
 * `recentRaces`は呼び出し側が既に「対象レースより前・新しい順」に制限した配列
 * （baseAbilityと同じ母集団）である前提。各マッチ走について、その走より古い
 * （newest-first配列で後ろ側の）走だけをabilityBeforeRace算出に使うことで、
 * future leakageを構造的に防ぐ（Ability Model V1凍結済み関数`calculateAbilityBeforeRace`を
 * 無変更のまま再利用）。
 *
 * `recentRaces`自体が直近5走に制限されているため、その中で古い側の走ほど
 * abilityBeforeRace算出に使える「さらに古い走」が窓の外に無く、nullになりやすい
 * （＝この走のdeltaは算出しない、0点や推測で埋めない）。これは意図した安全側の挙動であり、
 * `horseGateEvidence.ts`が返す生のsampleCount（対象条件マッチ数）より、実際に
 * delta化できる件数の方が少なくなりうることをreasonに明記する。
 */
function collectGateHorseEvidenceDeltas(
  recentRaces: RacePerformance[],
  target: Pick<SuitabilityTargetRaceContext, "racecourse" | "surface" | "distance">,
): number[] {
  const deltas: number[] = [];
  recentRaces.forEach((race, i) => {
    if (race.racecourse !== target.racecourse || race.surface !== target.surface || race.distance !== target.distance) {
      return;
    }
    const priorScoresNewestFirst = recentRaces.slice(i + 1).map((r) => r.raceScore);
    const abilityBeforeRace = calculateAbilityBeforeRace(priorScoresNewestFirst);
    if (abilityBeforeRace === null) return;
    deltas.push(race.raceScore - abilityBeforeRace);
  });
  return deltas;
}

/** deltas.length>=1の場合のみ呼ばれる想定（resolveHorseEvidenceConfidenceは"unknown"を返さない）。念のための安全側デフォルト */
function toShrinkConfidence(confidence: HorseEvidenceConfidence): SuitabilityConfidence {
  return confidence === "unknown" ? "low" : confidence;
}

/**
 * 東京ダート1600m限定のCoursePrior detail（監査用）を計算する。
 * frame不明・対象コース外の場合はnull（推測しない）。
 */
function computeGateCoursePriorDetail(input: SuitabilityV1Input): {
  detail: CoursePriorDetail;
  rawPercent: number;
  confidence: SuitabilityConfidence;
} | null {
  if (!isTokyoDirt1600(input.target)) return null;
  const coursePrior = computeTokyoDirt1600CourseContextPrior(input.gate.frame);
  if (coursePrior === null) return null;

  const validationWeight = GATE_VALIDATION_STATUS_WEIGHT[coursePrior.empiricalValidationStatus];
  const rawPercent = roundToOneDecimal(
    SUITABILITY_CENTER + coursePrior.gateCoefficient * GATE_COURSE_PRIOR_AMPLITUDE * validationWeight,
  );

  return {
    rawPercent,
    confidence: coursePrior.sourceConfidence,
    detail: {
      confidence: coursePrior.sourceConfidence,
      reason:
        `gateCoefficient=${coursePrior.gateCoefficient}（東京ダート1600m、gateBiasLevel=${coursePrior.gateBiasLevel}、` +
        `empiricalValidationStatus=${coursePrior.empiricalValidationStatus}）。CoursePrior単独の最大影響幅を` +
        `±${GATE_COURSE_PRIOR_AMPLITUDE}ptに制限し、実測検証状況に応じてさらに${validationWeight}倍へ縮小した。`,
      referenceSource: "courseContextPrior.ts (TOKYO_DIRT_1600)",
    },
  };
}

/**
 * gateコンポーネント（CHECKPOINT11.5で正式化）。
 *
 * 優先順位（`docs/gate-suitability-v1-decision.md`）: HorseEvidence（優先度1）＞
 * CoursePrior（優先度2）＞unknown（優先度3）。今回は「厳密な案A」を採用する
 * （CHECKPOINT11.5 STEP8）: rawPerformanceDeltaが1件でも算出できればHorseEvidenceのみで
 * percentを決定し、CoursePriorは監査用メタデータとしてのみ保持する（percentには混ぜない）。
 * confidenceが低い場合の「弱い証拠を信じすぎない」役割は、新たな合成比重を発明せず、
 * 既存のshrinkTowardCenterに委ねる（弱い証拠は自然に100へ寄る）。
 * HorseEvidenceが1件も無い場合のみ、CoursePrior（東京ダート1600m限定）にフォールバックする。
 */
function computeGateSuitabilityV1(input: SuitabilityV1Input): SuitabilityComponentResultV1 {
  const horseEvidenceRaw: HorseEvidence = collectHorseGateEvidence(input.horseId, input.recentRaces, {
    racecourse: input.target.racecourse,
    surface: input.target.surface,
    distance: input.target.distance,
  });
  const deltas = collectGateHorseEvidenceDeltas(input.recentRaces, input.target);
  const coursePriorResult = computeGateCoursePriorDetail(input);

  if (deltas.length > 0) {
    const confidence = resolveHorseEvidenceConfidence(deltas.length);
    const aggregatedDelta = median(deltas);
    const rawPercent = roundToOneDecimal(
      SUITABILITY_CENTER + GATE_HORSE_EVIDENCE_AMPLITUDE * Math.tanh(aggregatedDelta / GATE_HORSE_EVIDENCE_SCALE),
    );
    const adjustedPercent = roundToOneDecimal(shrinkTowardCenter(rawPercent, toShrinkConfidence(confidence)));

    const horseEvidence: HorseEvidenceDetail = {
      sampleCount: deltas.length,
      confidence,
      reason:
        `対象条件完全一致${horseEvidenceRaw.sampleCount}走のうちabilityBeforeRace算出可能な${deltas.length}走から` +
        `rawPerformanceDelta（=raceScore−abilityBeforeRace、HorseEvidence V1と同一定義）を計算し中央値集約。` +
        `aggregatedDelta=${roundToOneDecimal(aggregatedDelta)}。`,
    };

    return {
      key: "gate",
      evaluated: true,
      rawPercent,
      adjustedPercent,
      confidence,
      reason:
        `HorseEvidence（本人実績、優先度1）のrawPerformanceDelta中央値=${roundToOneDecimal(aggregatedDelta)}を` +
        `tanh変換（amplitude=${GATE_HORSE_EVIDENCE_AMPLITUDE}、scale=${GATE_HORSE_EVIDENCE_SCALE}）してrawPercent=${rawPercent}%。` +
        `confidence(${confidence})で縮小しadjustedPercent=${adjustedPercent}%。` +
        (coursePriorResult !== null
          ? " CoursePriorも算出可能だが、HorseEvidenceが優先度1のため今回のpercentには使用していない。"
          : ""),
      horseEvidence,
      coursePrior: coursePriorResult?.detail ?? null,
      source: coursePriorResult !== null ? "both" : "horseEvidence",
    };
  }

  const horseEvidence: HorseEvidenceDetail = {
    sampleCount: 0,
    confidence: "unknown",
    reason: `対象条件（racecourse×surface×distance完全一致）でrawPerformanceDeltaを算出できる走が無い（本人実績なし）。`,
  };

  if (coursePriorResult === null) {
    return {
      key: "gate",
      evaluated: false,
      rawPercent: SUITABILITY_CENTER,
      adjustedPercent: SUITABILITY_CENTER,
      confidence: "unknown",
      reason: isTokyoDirt1600(input.target)
        ? "枠番（frame）が不明なため、CoursePriorが算出不能（推測で埋めない）。"
        : "本人実績が無く、CoursePriorは東京ダート1600m限定のため対象コースでは評価不能（推測で埋めない）。",
      horseEvidence,
      coursePrior: null,
      source: "none",
    };
  }

  const adjustedPercent = roundToOneDecimal(shrinkTowardCenter(coursePriorResult.rawPercent, coursePriorResult.confidence));

  return {
    key: "gate",
    evaluated: true,
    rawPercent: coursePriorResult.rawPercent,
    adjustedPercent,
    confidence: coursePriorResult.confidence,
    reason:
      `本人実績（HorseEvidence）が無いため、CoursePrior（東京ダート1600m gate構造事前分布、優先度2）` +
      `のみに基づくrawPercent=${coursePriorResult.rawPercent}%。`,
    horseEvidence,
    coursePrior: coursePriorResult.detail,
    source: "coursePrior",
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

const CONFIDENCE_V1_RANK: Record<SuitabilityConfidenceV1, number> = { unknown: 0, low: 1, medium: 2, high: 3 };

/**
 * 4componentのconfidenceのweakest-link（CHECKPOINT11.14 STEP1）。
 * raceOutcomeEvaluation.tsのresolveEvaluationConfidenceと同じ「最も弱いものを採用する」考え方を
 * 再利用するだけで、新しいconfidence定義・閾値は一切作らない。1つでもevaluated=falseの
 * component（常にconfidence="unknown"）があれば、その時点でoverallConfidenceも"unknown"になる。
 */
function computeOverallConfidence(components: SuitabilityComponentResultV1[]): SuitabilityConfidenceV1 {
  return components.reduce<SuitabilityConfidenceV1>(
    (weakest, c) => (CONFIDENCE_V1_RANK[c.confidence] < CONFIDENCE_V1_RANK[weakest] ? c.confidence : weakest),
    "high",
  );
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
  const overallConfidence = computeOverallConfidence([distance, course, going, gate]);

  return { distance, course, going, gate, overallSuitabilityPercent, evaluatedComponentCount, overallConfidence };
}

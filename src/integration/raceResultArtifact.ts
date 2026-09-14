/**
 * Canonical Race Result Artifact（Probability Calibration V1・P0基盤）。
 *
 * Race Prediction Artifact（発走前・immutable）とは完全に別の記録として、
 * レース後の公式確定情報だけを保持する。Prediction Artifactへ
 * finishPosition/actualFinishPosition/winner/resultStatus等を後付けする
 * legacy方式（generateDerivedPredictions.ts）はCalibration正本として使わない。
 *
 * 【絶対に守ること】
 *   - Prediction Artifactの内容（baseAbility/suitability/probability等）を
 *     一切参照・混入しない。Result Artifactは「レース後の客観的事実」のみ。
 *   - PROVISIONALをCalibrationのFINAL結果として扱わない
 *     （isCalibrationFinalResult()で判定する）。
 *   - CORRECTEDは旧Artifactを上書きしない。新しいartifactId（別ファイル）として
 *     追加し、supersedesArtifactIdで旧版を指す（append-only、実際の保存は
 *     raceResultArtifactStore.tsが担当）。
 */

import { fnv1a } from "../ability/datasetVersion";
import type { PassingPositionData } from "../ability/types";

export const RACE_RESULT_ARTIFACT_SCHEMA_VERSION = "race-result-artifact-v1";

export type RaceResultStatus = "PROVISIONAL" | "FINAL" | "CORRECTED";

export interface RaceResultArtifactRunner {
  canonicalHorseId: string;
  horseName: string;
  horseNumber: number | null;
  frameNumber: number | null;
  /**
   * 通常はArtifact全体のresultStatusと同一値。将来、馬単位の個別訂正
   * （一部馬だけ確定が遅れる等）を表現できるよう型としては保持するが、
   * V1では`validateRaceResultArtifact()`がArtifact全体のresultStatusと
   * 一致することを要求する（無根拠な不一致を防ぐ）。
   */
  resultStatus: RaceResultStatus;
  finishPosition: number | null;
  started: boolean;
  scratched: boolean;
  excluded: boolean;
  didNotFinish: boolean;
  disqualified: boolean;
}

export interface RaceResultArtifactRace {
  raceId: string;
  raceDate: string;
  raceName: string;
  scheduledStartTime: string | null;
  officialStarterCount: number;
  resultEntryCount: number;
}

export interface RaceResultArtifact {
  artifactId: string;
  artifactType: "RACE_RESULT";
  schemaVersion: string;
  /** CORRECTEDのたびに1ずつ増える。PROVISIONAL/FINALの初出は1。 */
  resultVersion: number;
  resultStatus: RaceResultStatus;
  resultAvailableAt: string;
  retrievedAt: string;
  source: string;
  sourceIdentifier: string;
  /** CORRECTEDの場合のみ非null。旧Artifactを上書きせず、この値で旧版を指す。 */
  supersedesArtifactId: string | null;
  race: RaceResultArtifactRace;
  runners: RaceResultArtifactRunner[];
  /** resultVersion/retrievedAtを除く内容の決定的fingerprint（idempotent判定に使用）。 */
  resultContentFingerprint: string;
}

export interface BuildRaceResultArtifactInput {
  resultStatus: RaceResultStatus;
  resultVersion: number;
  resultAvailableAt: string;
  retrievedAt: string;
  source: string;
  sourceIdentifier: string;
  supersedesArtifactId?: string | null;
  race: RaceResultArtifactRace;
  runners: RaceResultArtifactRunner[];
}

/** PROVISIONALをCalibrationのFINAL結果として扱わないための唯一の判定関数。 */
export function isCalibrationFinalResult(artifact: Pick<RaceResultArtifact, "resultStatus">): boolean {
  return artifact.resultStatus === "FINAL" || artifact.resultStatus === "CORRECTED";
}

export function buildRaceResultArtifactId(input: {
  raceId: string;
  resultStatus: RaceResultStatus;
  resultVersion: number;
  retrievedAt: string;
}): string {
  return [
    input.raceId,
    "RESULT",
    input.resultStatus,
    `v${input.resultVersion}`,
    input.retrievedAt,
  ].map(sanitizeId).join("__");
}

/**
 * Result Artifactの構造・矛盾チェック。数値の妥当性・状態の整合性のみを見る
 * （実データの真偽・公式性そのものは検証できない。呼び出し側の責務）。
 */
export function validateRaceResultArtifact(input: BuildRaceResultArtifactInput): void {
  if (!input.race.raceId) throw new Error("RaceResultArtifact: raceIdが必要です");
  if (!input.race.raceDate) throw new Error("RaceResultArtifact: raceDateが必要です");
  if (!Number.isInteger(input.race.officialStarterCount) || input.race.officialStarterCount < 0) {
    throw new Error("RaceResultArtifact: officialStarterCountは非負の整数である必要があります");
  }
  if (input.race.resultEntryCount !== input.runners.length) {
    throw new Error("RaceResultArtifact: resultEntryCountがrunners件数と一致しません");
  }
  if (!input.source) throw new Error("RaceResultArtifact: sourceが必要です");
  if (!input.sourceIdentifier) throw new Error("RaceResultArtifact: sourceIdentifierが必要です");
  if (!input.resultAvailableAt) throw new Error("RaceResultArtifact: resultAvailableAtが必要です");
  if (!input.retrievedAt) throw new Error("RaceResultArtifact: retrievedAtが必要です");
  if (!Number.isInteger(input.resultVersion) || input.resultVersion < 1) {
    throw new Error("RaceResultArtifact: resultVersionは1以上の整数である必要があります");
  }

  if (input.resultStatus === "CORRECTED") {
    if (!input.supersedesArtifactId) {
      throw new Error("RaceResultArtifact: CORRECTEDはsupersedesArtifactIdが必須です");
    }
  } else if (input.supersedesArtifactId) {
    throw new Error("RaceResultArtifact: PROVISIONAL/FINALはsupersedesArtifactIdを持てません");
  }

  const seenHorseIds = new Set<string>();
  for (const runner of input.runners) {
    if (!runner.canonicalHorseId) {
      throw new Error("RaceResultArtifact: canonicalHorseIdが必要です");
    }
    if (seenHorseIds.has(runner.canonicalHorseId)) {
      throw new Error(`RaceResultArtifact: canonicalHorseIdが重複しています: ${runner.canonicalHorseId}`);
    }
    seenHorseIds.add(runner.canonicalHorseId);

    if (runner.resultStatus !== input.resultStatus) {
      throw new Error(
        `RaceResultArtifact: runner(${runner.canonicalHorseId})のresultStatusがArtifact全体と一致しません`,
      );
    }

    if (runner.finishPosition !== null) {
      if (!Number.isInteger(runner.finishPosition) || runner.finishPosition <= 0) {
        throw new Error(
          `RaceResultArtifact: runner(${runner.canonicalHorseId})のfinishPositionは正整数である必要があります`,
        );
      }
    }

    // 明らかな状態矛盾の拒否。
    if (runner.scratched && runner.started) {
      throw new Error(`RaceResultArtifact: runner(${runner.canonicalHorseId})がscratchedかつstartedです`);
    }
    if (runner.excluded && runner.started) {
      throw new Error(`RaceResultArtifact: runner(${runner.canonicalHorseId})がexcludedかつstartedです`);
    }
    if ((runner.scratched || runner.excluded) && runner.finishPosition !== null) {
      throw new Error(
        `RaceResultArtifact: runner(${runner.canonicalHorseId})がscratched/excludedなのにfinishPositionがあります`,
      );
    }
    if ((runner.scratched || runner.excluded) && (runner.didNotFinish || runner.disqualified)) {
      throw new Error(
        `RaceResultArtifact: runner(${runner.canonicalHorseId})がscratched/excludedかつdidNotFinish/disqualifiedです`,
      );
    }
    if (runner.didNotFinish && runner.finishPosition !== null) {
      throw new Error(
        `RaceResultArtifact: runner(${runner.canonicalHorseId})がdidNotFinishなのにfinishPositionがあります（nullを許容）`,
      );
    }
    if (!runner.started && !runner.scratched && !runner.excluded) {
      throw new Error(
        `RaceResultArtifact: runner(${runner.canonicalHorseId})はstarted/scratched/excludedのいずれかである必要があります`,
      );
    }

    // FINAL/CORRECTEDでは、Calibrationに使うための「馬の状態」が確定している必要がある
    // （started=trueの馬は、finishPosition確定・didNotFinish・disqualifiedのいずれかで
    //   決着が説明できること。scratched/excludedはfinishPosition不要のまま許容）。
    if (isCalibrationFinalResult({ resultStatus: input.resultStatus }) &&
        runner.started && !runner.scratched && !runner.excluded) {
      const settled = runner.finishPosition !== null || runner.didNotFinish || runner.disqualified;
      if (!settled) {
        throw new Error(
          `RaceResultArtifact: FINAL/CORRECTEDのrunner(${runner.canonicalHorseId})の決着が確認できません` +
            `（finishPosition/didNotFinish/disqualifiedのいずれも無し）`,
        );
      }
    }
  }
}

export function buildRaceResultArtifact(input: BuildRaceResultArtifactInput): RaceResultArtifact {
  validateRaceResultArtifact(input);
  const artifactId = buildRaceResultArtifactId({
    raceId: input.race.raceId,
    resultStatus: input.resultStatus,
    resultVersion: input.resultVersion,
    retrievedAt: input.retrievedAt,
  });
  const withoutFingerprint: Omit<RaceResultArtifact, "resultContentFingerprint"> = {
    artifactId,
    artifactType: "RACE_RESULT",
    schemaVersion: RACE_RESULT_ARTIFACT_SCHEMA_VERSION,
    resultVersion: input.resultVersion,
    resultStatus: input.resultStatus,
    resultAvailableAt: input.resultAvailableAt,
    retrievedAt: input.retrievedAt,
    source: input.source,
    sourceIdentifier: input.sourceIdentifier,
    supersedesArtifactId: input.supersedesArtifactId ?? null,
    race: { ...input.race },
    runners: [...input.runners].map((r) => ({ ...r })),
  };
  const contentForFingerprint = { ...withoutFingerprint, retrievedAt: undefined };
  return {
    ...withoutFingerprint,
    resultContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeRaceResultArtifact(artifact: RaceResultArtifact): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeRaceResultArtifact(serialized: string): RaceResultArtifact {
  const parsed = JSON.parse(serialized) as RaceResultArtifact;
  if (parsed.schemaVersion !== RACE_RESULT_ARTIFACT_SCHEMA_VERSION ||
      parsed.artifactType !== "RACE_RESULT" || !parsed.artifactId) {
    throw new Error("Race Result Artifactの形式が不正です");
  }
  validateRaceResultArtifact(parsed);
  const expectedArtifactId = buildRaceResultArtifactId({
    raceId: parsed.race.raceId,
    resultStatus: parsed.resultStatus,
    resultVersion: parsed.resultVersion,
    retrievedAt: parsed.retrievedAt,
  });
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Race Result Artifactの識別子が内容と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, retrievedAt: undefined, resultContentFingerprint: undefined }),
  );
  if (parsed.resultContentFingerprint !== expectedFingerprint) {
    throw new Error("Race Result Artifactの内容fingerprintが一致しません");
  }
  return parsed;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

/* ============================================================================
 * Race Result Artifact schema v2（Post-Race Pipeline V1・Phase 1）。
 *
 * v1（RACE_RESULT_ARTIFACT_SCHEMA_VERSION）は無変更のまま既存reader/既存保存分の
 * 互換性を維持する。v2はv1のbuildRaceResultArtifact()／validateRaceResultArtifact()を
 * そのまま呼び出して既存の矛盾検知・fingerprint計算を再利用し、Race Review用の
 * 詳細実測値（actualRaceTime/timeGap/final3F/final3FRank/passingPosition/carriedWeight・
 * race-level going）を追加した上位互換schemaとして提供する
 * （racePredictionArtifact.tsのv1→v2と同一パターン）。
 *
 * 詳細項目はすべてnullable（正式ソースに存在しない場合を考慮）。単位はフィールド直下の
 * コメントに明示する。cornerPositions等のpassingPositionはability/types.tsの
 * PassingPositionDataをそのまま再利用し、同じ意味の型を重複定義しない。
 * ============================================================================ */

export const RACE_RESULT_ARTIFACT_SCHEMA_VERSION_V2 = "race-result-artifact-v2";

export interface RaceResultArtifactRunnerV2 extends RaceResultArtifactRunner {
  /** 走破タイム。秒。 */
  actualRaceTime: number | null;
  /** 勝ち馬とのタイム差。秒。 */
  timeGap: number | null;
  /** 上がり3F。秒。 */
  final3F: number | null;
  /** 上がり3F順位（1位が最速）。 */
  final3FRank: number | null;
  /** 通過順位。ability/types.tsのPassingPositionDataを再利用（新規定義しない）。 */
  passingPosition: PassingPositionData | null;
  /** 斤量。kg。 */
  carriedWeight: number | null;
}

export interface RaceResultArtifactRaceV2 extends RaceResultArtifactRace {
  /** 当日馬場状態（良・稍重・重・不良等）。不明ならnull（推測で埋めない）。 */
  going: string | null;
}

export interface RaceResultArtifactV2 extends Omit<RaceResultArtifact, "schemaVersion" | "race" | "runners"> {
  schemaVersion: typeof RACE_RESULT_ARTIFACT_SCHEMA_VERSION_V2;
  race: RaceResultArtifactRaceV2;
  runners: RaceResultArtifactRunnerV2[];
}

export interface BuildRaceResultArtifactV2Input extends Omit<BuildRaceResultArtifactInput, "race" | "runners"> {
  race: RaceResultArtifactRaceV2;
  runners: RaceResultArtifactRunnerV2[];
}

export function buildRaceResultArtifactV2Id(input: {
  raceId: string;
  resultStatus: RaceResultStatus;
  resultVersion: number;
  retrievedAt: string;
}): string {
  return [input.raceId, "RESULT", input.resultStatus, `v${input.resultVersion}`, input.retrievedAt, "v2"]
    .map(sanitizeId).join("__");
}

/**
 * v2追加項目（詳細実測値）だけの検証。v1のvalidateRaceResultArtifact()が担当する
 * 構造・状態整合性チェックとは独立に、v2固有の物理的整合性のみを見る。
 * 呼び出し側（build時・deserialize時）の両方から使えるよう、必要最小限の形で受け取る。
 */
export function validateRaceResultArtifactV2Extras(input: {
  race: Pick<RaceResultArtifactRaceV2, "going">;
  runners: ReadonlyArray<Pick<RaceResultArtifactRunnerV2,
    "canonicalHorseId" | "started" | "scratched" | "excluded" |
    "actualRaceTime" | "timeGap" | "final3F" | "final3FRank" | "passingPosition" | "carriedWeight">>;
}): void {
  if (input.race.going !== null && (typeof input.race.going !== "string" || input.race.going.length === 0)) {
    throw new Error("RaceResultArtifactV2: race.goingはnull、または非空文字列である必要があります");
  }
  for (const runner of input.runners) {
    const label = runner.canonicalHorseId;
    if (runner.actualRaceTime !== null &&
        (!Number.isFinite(runner.actualRaceTime) || runner.actualRaceTime <= 0)) {
      throw new Error(`RaceResultArtifactV2: runner(${label})のactualRaceTimeは正の有限数である必要があります`);
    }
    if (runner.timeGap !== null && (!Number.isFinite(runner.timeGap) || runner.timeGap < 0)) {
      throw new Error(`RaceResultArtifactV2: runner(${label})のtimeGapは0以上の有限数である必要があります`);
    }
    if (runner.final3F !== null && (!Number.isFinite(runner.final3F) || runner.final3F <= 0)) {
      throw new Error(`RaceResultArtifactV2: runner(${label})のfinal3Fは正の有限数である必要があります`);
    }
    if (runner.final3FRank !== null &&
        (!Number.isInteger(runner.final3FRank) || runner.final3FRank <= 0)) {
      throw new Error(`RaceResultArtifactV2: runner(${label})のfinal3FRankは正の整数である必要があります`);
    }
    if (runner.carriedWeight !== null &&
        (!Number.isFinite(runner.carriedWeight) || runner.carriedWeight <= 0)) {
      throw new Error(`RaceResultArtifactV2: runner(${label})のcarriedWeightは正の有限数である必要があります`);
    }
    if (runner.passingPosition !== null) {
      const p = runner.passingPosition;
      if (!Array.isArray(p.cornerPositions) || p.cornerPositions.some((c) => !Number.isInteger(c) || c <= 0) ||
          !Number.isInteger(p.fieldSize) || p.fieldSize <= 0 ||
          typeof p.source !== "string" || p.source.length === 0 || typeof p.isReliable !== "boolean") {
        throw new Error(`RaceResultArtifactV2: runner(${label})のpassingPositionが不正です`);
      }
    }
    // 出走していない馬（scratched/excluded）は、レース中の実測値を一切持てない
    // （物理的に不可能なため。carriedWeightは事前計量のため出走有無と無関係に許容する）。
    if ((runner.scratched || runner.excluded) &&
        (runner.actualRaceTime !== null || runner.timeGap !== null || runner.final3F !== null ||
         runner.final3FRank !== null || runner.passingPosition !== null)) {
      throw new Error(
        `RaceResultArtifactV2: runner(${label})はscratched/excludedのため、レース中の実測値を持てません`,
      );
    }
  }
}

/**
 * v1のbuildRaceResultArtifact()をそのまま呼び出し（既存の矛盾検知・fingerprint計算を
 * 再利用・重複させない）、Race Review用の詳細実測値を追加したv2 Artifactを構築する。
 */
export function buildRaceResultArtifactV2(input: BuildRaceResultArtifactV2Input): RaceResultArtifactV2 {
  validateRaceResultArtifactV2Extras(input);
  const v1 = buildRaceResultArtifact(input);
  const detailByHorseId = new Map(input.runners.map((r) => [r.canonicalHorseId, r]));
  const runners: RaceResultArtifactRunnerV2[] = v1.runners.map((runner): RaceResultArtifactRunnerV2 => {
    const detail = detailByHorseId.get(runner.canonicalHorseId)!;
    return {
      ...runner,
      actualRaceTime: detail.actualRaceTime,
      timeGap: detail.timeGap,
      final3F: detail.final3F,
      final3FRank: detail.final3FRank,
      passingPosition: detail.passingPosition,
      carriedWeight: detail.carriedWeight,
    };
  });
  const artifactId = buildRaceResultArtifactV2Id({
    raceId: v1.race.raceId,
    resultStatus: v1.resultStatus,
    resultVersion: v1.resultVersion,
    retrievedAt: v1.retrievedAt,
  });
  // v1.resultContentFingerprint（v1自身の内容だけのhash）をそのまま持ち越すと、
  // v2のfingerprint計算対象に紛れ込み、deserialize時の再計算（resultContentFingerprintを
  // 完全に除外して計算）と食い違う。v1のfingerprintは明示的に捨てる。
  const { resultContentFingerprint: _v1Fingerprint, ...v1WithoutFingerprint } = v1;
  const withoutFingerprint: Omit<RaceResultArtifactV2, "resultContentFingerprint"> = {
    ...v1WithoutFingerprint,
    artifactId,
    schemaVersion: RACE_RESULT_ARTIFACT_SCHEMA_VERSION_V2,
    race: { ...v1.race, going: input.race.going },
    runners,
  };
  const contentForFingerprint = { ...withoutFingerprint, retrievedAt: undefined };
  return {
    ...withoutFingerprint,
    resultContentFingerprint: fnv1a(canonicalJson(contentForFingerprint)),
  };
}

export function serializeRaceResultArtifactV2(artifact: RaceResultArtifactV2): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

export function deserializeRaceResultArtifactV2(serialized: string): RaceResultArtifactV2 {
  const parsed = JSON.parse(serialized) as RaceResultArtifactV2;
  if (parsed.schemaVersion !== RACE_RESULT_ARTIFACT_SCHEMA_VERSION_V2 ||
      parsed.artifactType !== "RACE_RESULT" || !parsed.artifactId) {
    throw new Error("Race Result Artifact v2の形式が不正です");
  }
  validateRaceResultArtifact(parsed);
  validateRaceResultArtifactV2Extras(parsed);
  const expectedArtifactId = buildRaceResultArtifactV2Id({
    raceId: parsed.race.raceId,
    resultStatus: parsed.resultStatus,
    resultVersion: parsed.resultVersion,
    retrievedAt: parsed.retrievedAt,
  });
  if (parsed.artifactId !== expectedArtifactId) {
    throw new Error("Race Result Artifact v2の識別子が内容と一致しません");
  }
  const expectedFingerprint = fnv1a(
    canonicalJson({ ...parsed, retrievedAt: undefined, resultContentFingerprint: undefined }),
  );
  if (parsed.resultContentFingerprint !== expectedFingerprint) {
    throw new Error("Race Result Artifact v2の内容fingerprintが一致しません");
  }
  return parsed;
}

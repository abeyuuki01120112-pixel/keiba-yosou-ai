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

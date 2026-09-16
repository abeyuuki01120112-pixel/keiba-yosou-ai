/**
 * JV-Link Final Result Import（Post-Race Pipeline V1）。
 *
 * run folder（Windows/JV-Link由来、対象レース自身がStage 6/7確定成績）を、
 *   load → Final Result Adapter → Official Result Input → Result Artifact v2
 * まで一度に処理するMac側Production entrypoint。
 *
 * 【責務】
 * - loadJvLinkRunFolder()（既存、無変更）でraw 3ファイルを読み込む。
 * - adaptJvLinkFinalResultRunFolder()（新規）でStage 6/7確定成績を正規化する。
 * - 自動分類できない走者（取消/除外/中止/失格の疑いがあるがfield332だけでは
 *   判別不能）がいる場合は、呼び出し側が明示的な分類を与えない限り
 *   Result Artifactを構築しない（"needs_manual_classification"を返す）。
 * - submitOfficialResultInput()（既存、無変更）でsource whitelist等の
 *   Production受理判定を行う。
 * - persist=trueの場合のみpersistRaceResultArtifactV2()（既存、無変更）で
 *   append-only保存する（既定はfalse＝構築のみ、dry-run相当）。
 */

import {
  adaptJvLinkFinalResultRunFolder,
  type AdaptedJvLinkFinalResultRunFolder,
  type UnclassifiedAbnormalRunner,
} from "../collector/jvlink/runFolderFinalResultAdapter";
import { loadJvLinkRunFolder } from "../collector/jvlink/runFolderLoader";
import {
  submitOfficialResultInput,
  type OfficialResultInputRejection,
} from "./officialResultInput";
import {
  type BuildRaceResultArtifactV2Input,
  type RaceResultArtifactRunnerV2,
  type RaceResultArtifactV2,
  type RaceResultStatus,
} from "./raceResultArtifact";
import {
  persistRaceResultArtifactV2,
  type PersistRaceResultArtifactResult,
} from "./raceResultArtifactStore";

/** JV_LINK由来のResultをProduction正本として受理する際の既定source。 */
export const DEFAULT_JVLINK_FINAL_RESULT_SOURCE = "JV_LINK";

export interface ManualAbnormalRunnerClassification {
  canonicalHorseId: string;
  scratched?: boolean;
  excluded?: boolean;
  didNotFinish?: boolean;
  disqualified?: boolean;
}

export interface ImportJvLinkFinalResultOptions {
  expectedRaceId?: string;
  resultStatus: RaceResultStatus;
  resultVersion: number;
  supersedesArtifactId?: string | null;
  /** 既定 DEFAULT_JVLINK_FINAL_RESULT_SOURCE。テストfixtureのみ別値を指定できる。 */
  source?: string;
  sourceIdentifierPrefix?: string;
  expectedCanonicalHorseIds?: readonly string[];
  manualAbnormalRunnerClassifications?: readonly ManualAbnormalRunnerClassification[];
  /** trueならappend-only storeへ保存する。省略時はfalse（構築のみ、dry-run相当）。 */
  persist?: boolean;
  persistDir?: string;
}

export type ImportJvLinkFinalResultOutcome =
  | { status: "needs_manual_classification"; unclassified: UnclassifiedAbnormalRunner[] }
  | { status: "rejected"; rejections: OfficialResultInputRejection[] }
  | { status: "built"; input: BuildRaceResultArtifactV2Input; artifact: RaceResultArtifactV2 }
  | {
      status: "persisted";
      input: BuildRaceResultArtifactV2Input;
      artifact: RaceResultArtifactV2;
      persistence: PersistRaceResultArtifactResult;
    };

function classificationToRunner(
  runner: UnclassifiedAbnormalRunner,
  classification: ManualAbnormalRunnerClassification,
): RaceResultArtifactRunnerV2 {
  const scratched = classification.scratched ?? false;
  const excluded = classification.excluded ?? false;
  const didNotFinish = classification.didNotFinish ?? false;
  const disqualified = classification.disqualified ?? false;
  if (!scratched && !excluded && !didNotFinish && !disqualified) {
    throw new Error(
      `IMPORT_JVLINK_FINAL_RESULT_INVALID_CLASSIFICATION: canonicalHorseId=${runner.canonicalHorseId}` +
        "はscratched/excluded/didNotFinish/disqualifiedのいずれか1つ以上をtrueにする必要があります。",
    );
  }
  return {
    canonicalHorseId: runner.canonicalHorseId,
    horseName: runner.horseName,
    horseNumber: runner.horseNumber,
    frameNumber: runner.frameNumber,
    resultStatus: "FINAL", // buildRaceResultArtifactV2()内でartifact全体のresultStatusへ揃えて再構築される
    finishPosition: null,
    started: !scratched && !excluded,
    scratched,
    excluded,
    didNotFinish,
    disqualified,
    actualRaceTime: null,
    timeGap: null,
    final3F: null,
    final3FRank: null,
    passingPosition: null,
    carriedWeight: null,
  };
}

function normalToRunner(runner: AdaptedJvLinkFinalResultRunFolder["runners"][number]): RaceResultArtifactRunnerV2 {
  return {
    canonicalHorseId: runner.canonicalHorseId,
    horseName: runner.horseName,
    horseNumber: runner.horseNumber,
    frameNumber: runner.frameNumber,
    resultStatus: "FINAL",
    finishPosition: runner.finishPosition,
    started: true,
    scratched: false,
    excluded: false,
    didNotFinish: false,
    disqualified: false,
    actualRaceTime: runner.actualRaceTime,
    timeGap: runner.timeGap,
    final3F: runner.final3F,
    final3FRank: runner.final3FRank,
    passingPosition: runner.passingPosition,
    carriedWeight: runner.carriedWeight,
  };
}

/** run folder loadからResult Artifact v2 build（＋任意でpersist）までを一度に行う。 */
export function importJvLinkFinalResult(
  runDir: string,
  options: ImportJvLinkFinalResultOptions,
): ImportJvLinkFinalResultOutcome {
  const loaded = loadJvLinkRunFolder(runDir, options.expectedRaceId);
  const adapted = adaptJvLinkFinalResultRunFolder(loaded);

  const classificationByHorseId = new Map(
    (options.manualAbnormalRunnerClassifications ?? []).map((c) => [c.canonicalHorseId, c]),
  );
  const stillUnclassified = adapted.unclassifiedAbnormalRunners.filter(
    (runner) => !classificationByHorseId.has(runner.canonicalHorseId),
  );
  if (stillUnclassified.length > 0) {
    return { status: "needs_manual_classification", unclassified: stillUnclassified };
  }

  const runners: RaceResultArtifactRunnerV2[] = [
    ...adapted.runners.map(normalToRunner),
    ...adapted.unclassifiedAbnormalRunners.map((runner) =>
      classificationToRunner(runner, classificationByHorseId.get(runner.canonicalHorseId)!),
    ),
  ].map((runner) => ({ ...runner, resultStatus: options.resultStatus }));

  const source = options.source ?? DEFAULT_JVLINK_FINAL_RESULT_SOURCE;
  const sourceIdentifier = `${options.sourceIdentifierPrefix ?? "jvlink-run"};${adapted.sourceIdentifier}`;

  const input: BuildRaceResultArtifactV2Input = {
    resultStatus: options.resultStatus,
    resultVersion: options.resultVersion,
    resultAvailableAt: adapted.resultAvailableAt,
    retrievedAt: adapted.retrievedAt,
    source,
    sourceIdentifier,
    supersedesArtifactId: options.supersedesArtifactId ?? null,
    race: {
      raceId: adapted.race.raceId,
      raceDate: adapted.race.raceDate,
      raceName: adapted.race.raceName,
      scheduledStartTime: null, // Final Result Adapterは確定成績専用recordのみを読み、発走予定時刻（Stage2専用）は扱わない
      officialStarterCount: runners.length,
      resultEntryCount: runners.length,
      going: adapted.race.going,
    },
    runners,
  };

  const outcome = submitOfficialResultInput(input, {
    expectedCanonicalHorseIds: options.expectedCanonicalHorseIds,
  });
  if (outcome.status === "rejected") {
    return { status: "rejected", rejections: outcome.rejections };
  }

  if (!options.persist) {
    return { status: "built", input, artifact: outcome.artifact };
  }
  const persistence = persistRaceResultArtifactV2(outcome.artifact, { dir: options.persistDir });
  return { status: "persisted", input, artifact: outcome.artifact, persistence };
}

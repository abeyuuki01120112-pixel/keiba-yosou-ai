import {
  importJvLinkFinalResult,
  type ImportJvLinkFinalResultOptions,
} from "../src/integration/jvLinkFinalResultImport";
import type { RaceResultStatus } from "../src/integration/raceResultArtifact";

interface CliOptions {
  runDir: string;
  raceId: string;
  resultStatus: RaceResultStatus;
  resultVersion: number;
  supersedesArtifactId?: string;
  source?: string;
  expectedCanonicalHorseIds?: string[];
  persist: boolean;
  persistDir?: string;
}

const RESULT_STATUSES: readonly RaceResultStatus[] = ["PROVISIONAL", "FINAL", "CORRECTED"];

function parseArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let persistFlag = false;
  let dryRunFlag = false;
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === "--persist") {
      persistFlag = true;
      continue;
    }
    if (key === "--dry-run") {
      dryRunFlag = true;
      continue;
    }
    if (!key.startsWith("--")) throw new Error(`不明な引数です: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key}の値が必要です`);
    if (values.has(key)) throw new Error(`${key}が重複しています`);
    values.set(key, value);
  }
  const known = new Set([
    "--run-dir", "--race-id", "--status", "--result-version",
    "--supersedes-artifact-id", "--source", "--expected-horse-ids", "--persist-dir",
  ]);
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`不明なオプションです: ${key}`);
  if (persistFlag && dryRunFlag) throw new Error("--persistと--dry-runは同時に指定できません");

  const runDir = values.get("--run-dir");
  if (!runDir) throw new Error("--run-dirは必須です");
  const raceId = values.get("--race-id");
  if (!raceId) throw new Error("--race-idは必須です");
  const statusRaw = values.get("--status");
  if (!statusRaw || !RESULT_STATUSES.includes(statusRaw as RaceResultStatus)) {
    throw new Error(`--statusは${RESULT_STATUSES.join("/")}のいずれかである必要があります`);
  }
  const resultVersionRaw = values.get("--result-version") ?? "1";
  const resultVersion = Number(resultVersionRaw);
  if (!Number.isInteger(resultVersion) || resultVersion < 1) {
    throw new Error("--result-versionは1以上の整数である必要があります");
  }
  if (statusRaw === "CORRECTED" && !values.has("--supersedes-artifact-id")) {
    throw new Error("--status CORRECTEDには--supersedes-artifact-idが必須です");
  }

  return {
    runDir,
    raceId,
    resultStatus: statusRaw as RaceResultStatus,
    resultVersion,
    ...(values.has("--supersedes-artifact-id") ? { supersedesArtifactId: values.get("--supersedes-artifact-id") } : {}),
    ...(values.has("--source") ? { source: values.get("--source") } : {}),
    ...(values.has("--expected-horse-ids")
      ? { expectedCanonicalHorseIds: values.get("--expected-horse-ids")!.split(",").map((id) => id.trim()).filter(Boolean) }
      : {}),
    // 明示的な--persistが無い限りdry-run（構築のみ・保存しない）。--dry-runは意図を明示するための同義フラグ。
    persist: persistFlag,
    ...(values.has("--persist-dir") ? { persistDir: values.get("--persist-dir") } : {}),
  };
}

function main(): void {
  try {
    const cli = parseArgs(process.argv.slice(2));
    const options: ImportJvLinkFinalResultOptions = {
      expectedRaceId: cli.raceId,
      resultStatus: cli.resultStatus,
      resultVersion: cli.resultVersion,
      supersedesArtifactId: cli.supersedesArtifactId ?? null,
      source: cli.source,
      expectedCanonicalHorseIds: cli.expectedCanonicalHorseIds,
      persist: cli.persist,
      persistDir: cli.persistDir,
    };
    console.log(`mode: ${cli.persist ? "PERSIST" : "DRY-RUN（保存しません）"}`);
    const outcome = importJvLinkFinalResult(cli.runDir, options);

    if (outcome.status === "needs_manual_classification") {
      console.error("needs_manual_classification: 自動分類できない走者がいます（取消/除外/中止/失格の疑い）。");
      for (const runner of outcome.unclassified) {
        console.error(
          `  - canonicalHorseId=${runner.canonicalHorseId} horseName=${runner.horseName}` +
          ` horseNumber=${runner.horseNumber} nonStartFlagRaw=${runner.nonStartFlagRaw}`,
        );
      }
      console.error("importJvLinkFinalResult()にmanualAbnormalRunnerClassificationsを与えて再実行してください。");
      process.exitCode = 1;
      return;
    }
    if (outcome.status === "rejected") {
      console.error("rejected: Official Result Inputが受理しませんでした。");
      for (const rejection of outcome.rejections) console.error(`  - [${rejection.code}] ${rejection.message}`);
      process.exitCode = 1;
      return;
    }

    const { artifact } = outcome;
    console.log(`raceId: ${artifact.race.raceId}`);
    console.log(`raceName: ${artifact.race.raceName}`);
    console.log(`resultStatus: ${artifact.resultStatus} (v${artifact.resultVersion})`);
    console.log(`source: ${artifact.source}`);
    console.log(`sourceIdentifier: ${artifact.sourceIdentifier}`);
    console.log(`resultAvailableAt: ${artifact.resultAvailableAt}`);
    console.log(`retrievedAt: ${artifact.retrievedAt}`);
    console.log(`runners: ${artifact.runners.length}`);
    console.log(`artifactId: ${artifact.artifactId}`);

    if (outcome.status === "built") {
      console.log("結果: Result Artifact v2を構築しました（未保存・dry-run）。");
    } else {
      console.log(`結果: ${outcome.persistence.status} (${outcome.persistence.path})`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();

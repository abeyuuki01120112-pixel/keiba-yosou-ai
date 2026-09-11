import { importJvLinkRunFolder } from "../src/integration/jvLinkRunImport";

interface CliOptions {
  runDir: string;
  expectedRaceId?: string;
  normalizedDir?: string;
  skipCache: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let skipCache = false;
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === "--skip-cache") {
      skipCache = true;
      continue;
    }
    if (!key.startsWith("--")) throw new Error(`不明な引数です: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key}の値が必要です`);
    if (values.has(key)) throw new Error(`${key}が重複しています`);
    values.set(key, value);
  }
  const known = new Set(["--run-dir", "--race-id", "--normalized-dir"]);
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`不明なオプションです: ${key}`);
  const runDir = values.get("--run-dir");
  if (!runDir) throw new Error("--run-dirは必須です");
  return {
    runDir,
    ...(values.has("--race-id") ? { expectedRaceId: values.get("--race-id") } : {}),
    ...(values.has("--normalized-dir") ? { normalizedDir: values.get("--normalized-dir") } : {}),
    skipCache,
  };
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = importJvLinkRunFolder(options.runDir, options);
    const ready = result.ability.filter((row) => row.ready);
    const blocked = result.ability.filter((row) => !row.ready);
    const nonMaterial = result.historyConnection.jvLinkConflictDiagnostics
      .filter((row) => row.classification === "NON_MATERIAL").length;
    const material = result.historyConnection.jvLinkConflictDiagnostics
      .filter((row) => row.classification === "MATERIAL").length;
    console.log(`raceId: ${result.race.raceId}`);
    console.log(`target: RA=${result.adapted.targetRaCount} SE=${result.adapted.targetSeCount}`);
    console.log(`history: RA=${result.adapted.historyRaCount} SE=${result.adapted.historySeCount} matched=${result.adapted.matchedHistoryCount}`);
    console.log(`futureLeakage: ${result.leakage.violations.length}`);
    console.log(`unsupportedHistory: ${result.adapted.unsupportedHistoryCount}`);
    console.log(`abilityReady: ${ready.length}`);
    console.log(`abilityBlocked: ${blocked.length}`);
    for (const row of blocked) console.log(`  - ${row.horseId} ${row.reasons.join(",")}`);
    for (const row of result.ability) {
      console.log(
        `  ${row.horseName}(${row.horseId}): ability=${row.baseAbility ?? "BLOCKED"}` +
        ` selected=${row.selectedHistoryCount} scorable=${row.scorableHistoryCount}` +
        ` completeness=${row.historyCompleteness}`,
      );
      for (const unscorable of row.unscorableHistories) {
        console.log(`    unscorable=${unscorable.raceKey} stage=${unscorable.stage} reason=${unscorable.reason}`);
      }
    }
    console.log(`conflicts: NON_MATERIAL=${nonMaterial} MATERIAL=${material} selectedSource=jv_link`);
    console.log(`normalizedCache: ${result.cache.writtenPath ?? "skipped"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();

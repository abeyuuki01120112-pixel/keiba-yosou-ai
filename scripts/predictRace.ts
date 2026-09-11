/** Production Prediction Runner CLI V1. */

import { runProductionPrediction, type ProductionPredictionRunnerInput } from "../src/integration/productionPredictionRunner";

interface ParsedArgs extends ProductionPredictionRunnerInput {
  help: boolean;
}

function usage(): string {
  return [
    "使い方:",
    "  npm run predict:race -- --race-id <raceId> --stage <STAGE_A|STAGE_B> \\",
    "    --prediction-cutoff-at <ISO8601> --race-card-available-at <ISO8601> \\",
    "    --scheduled-start-time <ISO8601> [--odds-file <path>]",
    "",
    "入力:  KEIBA_DATA_DIR/normalized/<raceId>.json",
    "出力:  KEIBA_DATA_DIR/predictions/<artifactId>.json",
  ].join("\n");
}

export function parseProductionPredictionArgs(argv: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`不明な引数です: ${arg}`);
    const equalsIndex = arg.indexOf("=");
    const key = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const value = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key}の値が必要です`);
    if (values.has(key)) throw new Error(`${key}が重複しています`);
    values.set(key, value);
  }
  if (help) {
    return {
      help,
      raceId: "",
      stage: "STAGE_A",
      predictionCutoffAt: "",
      raceCardAvailableAt: "",
      scheduledStartTime: "",
    };
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`${key}は必須です`);
    return value;
  };
  const stage = required("--stage");
  if (stage !== "STAGE_A" && stage !== "STAGE_B") throw new Error("--stageはSTAGE_AまたはSTAGE_Bです");
  const known = new Set([
    "--race-id", "--stage", "--prediction-cutoff-at", "--race-card-available-at",
    "--scheduled-start-time", "--odds-file",
  ]);
  for (const key of values.keys()) if (!known.has(key)) throw new Error(`不明なオプションです: ${key}`);
  return {
    help: false,
    raceId: required("--race-id"),
    stage,
    predictionCutoffAt: required("--prediction-cutoff-at"),
    raceCardAvailableAt: required("--race-card-available-at"),
    scheduledStartTime: required("--scheduled-start-time"),
    ...(values.has("--odds-file") ? { oddsFile: values.get("--odds-file") } : {}),
  };
}

function main(): void {
  try {
    const { help, ...input } = parseProductionPredictionArgs(process.argv.slice(2));
    if (help) {
      console.log(usage());
      return;
    }
    const result = runProductionPrediction(input);
    console.log(`raceId: ${result.artifact.race.raceId}`);
    console.log(`stage: ${result.artifact.predictionStage}`);
    console.log(`predictionCutoffAt: ${result.artifact.predictionCutoffAt}`);
    console.log(`formalPredictionReady: ${result.artifact.formalPredictionReady}`);
    console.log(`artifactStatus: ${result.artifact.artifactStatus}`);
    console.log(`artifactPersistence: ${result.persistence.status}`);
    console.log(`artifactPath: ${result.persistence.path}`);
    console.log("trackBias: neutral fallback (manual=null, auto=null)");
    console.log(`oddsReady: ${result.prediction.oddsStatus.winOddsComplete}`);
    console.log(`evReady: ${result.prediction.oddsStatus.readyForEv}`);
    if (result.prediction.gate.reasons.length > 0) {
      console.log("formalGateDiagnostics:");
      for (const reason of result.prediction.gate.reasons) console.log(`  - ${reason}`);
    }
    const oddsDiagnostics = result.prediction.oddsStatus.diagnostics;
    if (oddsDiagnostics.length > 0) {
      console.log("oddsDiagnostics:");
      for (const diagnostic of oddsDiagnostics) {
        console.log(`  - ${diagnostic.code}: horseId=${diagnostic.horseId ?? "(none)"} ${diagnostic.message}`);
      }
    }
    if (!result.artifact.formalPredictionReady || result.persistence.status === "rejected") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  }
}

main();

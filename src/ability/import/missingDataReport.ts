/**
 * Missing Data Report（CHECKPOINT13.2 STEP14）。
 *
 * Dry Run前に、実レース単位で「あと何が足りないか」だけを機械的に一覧化する。
 * Runner Resolver（runnerResolver.ts）の resolved/unresolved/ambiguous 結果と、
 * PredictionSnapshot（predictionSnapshot.ts）の各馬の warnings/completenessFlags を
 * 1つのレポートへ統合するだけの薄い層。ability計算・resolveロジック自体は
 * 一切ここには実装しない（他モジュールをそのまま呼び出す）。
 *
 * duplicateRaceEntry（CHECKPOINT13.2 STEP12-C）・raceIdMismatch（STEP12-D）は
 * data/horses/全体を横断してはじめて検出できる問題であり、`npm run validate:data`
 * （scripts/validateAbilityData.mjs）側で検知する設計とする。このレポートは
 * 「これから作ろうとしているSnapshot1本」を対象にした軽量チェックであり、
 * 全データ横断監査の代わりにはしない（役割分担を明確にする）。
 */

import type { RunnerResolveResult } from "./runnerResolver";
import type { HorseSnapshotEntry, PredictionSnapshot } from "../predictionSnapshot";

export interface RunnerProblem {
  horseName: string;
  horseId: string | null;
  /** unresolvedHorse / ambiguousHorse / insufficientRecentHistory / memberLevelUnavailable / placeholderDataExcluded 等 */
  reasons: string[];
}

export interface MissingDataReport {
  raceId: string;
  raceName: string;
  totalRunners: number;
  resolved: number;
  unresolved: number;
  ambiguous: number;
  problems: RunnerProblem[];
}

/**
 * Runner Resolverの結果（resolve前の実レース出走馬一覧全体）と、resolveできた馬について
 * 構築済みのPredictionSnapshot（あれば）を組み合わせてレポートを作る。
 *
 * snapshotがまだ無い場合（Runner Resolveまでしか終わっていない場合）はundefinedのままでよい。
 * その場合はunresolved/ambiguousのみのレポートになる。
 */
export function buildMissingDataReport(
  raceId: string,
  raceName: string,
  resolverResults: RunnerResolveResult[],
  snapshot?: PredictionSnapshot,
): MissingDataReport {
  const problems: RunnerProblem[] = [];

  const snapshotByHorseId = new Map<string, HorseSnapshotEntry>();
  if (snapshot) {
    for (const runner of snapshot.runners) {
      snapshotByHorseId.set(runner.horseId, runner);
    }
  }

  let resolved = 0;
  let unresolved = 0;
  let ambiguous = 0;

  for (const result of resolverResults) {
    if (result.status === "unresolved") {
      unresolved++;
      problems.push({ horseName: result.horseName, horseId: null, reasons: ["unresolvedHorse"] });
      continue;
    }
    if (result.status === "ambiguous") {
      ambiguous++;
      problems.push({ horseName: result.horseName, horseId: null, reasons: ["ambiguousHorse"] });
      continue;
    }

    resolved++;
    const snapshotEntry = result.horseId ? snapshotByHorseId.get(result.horseId) : undefined;
    if (snapshotEntry && snapshotEntry.completenessFlags.length > 0) {
      problems.push({
        horseName: result.horseName,
        horseId: result.horseId,
        reasons: snapshotEntry.completenessFlags,
      });
    }
  }

  return {
    raceId,
    raceName,
    totalRunners: resolverResults.length,
    resolved,
    unresolved,
    ambiguous,
    problems,
  };
}

/** CHECKPOINT13.2の完了報告例と同じ書式の人間向けテキストを生成する */
export function formatMissingDataReport(report: MissingDataReport): string {
  const lines: string[] = [];
  lines.push(`Race ${report.raceId} ${report.raceName}`);
  lines.push("");
  lines.push(`Total runners: ${report.totalRunners}`);
  lines.push(`Resolved: ${report.resolved}`);
  lines.push(`Unresolved: ${report.unresolved}`);
  lines.push(`Ambiguous: ${report.ambiguous}`);
  lines.push("");

  if (report.problems.length === 0) {
    lines.push("Missing / Problem: なし");
    return lines.join("\n");
  }

  lines.push("Missing / Problem:");
  lines.push("");
  for (const problem of report.problems) {
    lines.push(problem.horseName);
    for (const reason of problem.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

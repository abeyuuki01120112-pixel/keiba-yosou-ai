/**
 * Prediction Artifact + Result Artifact のjoin基盤（Probability Calibration V1・P0）。
 *
 * horseNameはhuman audit用の一致確認にのみ使用し、primary join keyとして使わない
 * （馬名の表記揺れ・同名馬による誤joinを避けるため）。primary keyは常に
 * raceId + canonicalHorseId。Artifact自体はpredictionArtifactId + resultArtifactIdで
 * 明示的に選択する（「どのartifactとどのartifactをjoinしたか」を常に追跡可能にする）。
 */

import type { RacePredictionArtifactV2 } from "./racePredictionArtifact";
import type { RaceResultArtifact } from "./raceResultArtifact";
import { isCalibrationFinalResult } from "./raceResultArtifact";

export interface PredictionResultJoinIssue {
  code:
    | "RACE_ID_MISMATCH"
    | "CANONICAL_HORSE_ID_SET_MISMATCH"
    | "PREDICTION_POPULATION_VS_STARTER_MISMATCH"
    | "RESULT_NOT_FINAL"
    | "DUPLICATE_RESULT_HORSE_ID"
    | "WINNER_NOT_UNIQUE";
  message: string;
}

export interface PredictionResultJoinedRunner {
  canonicalHorseId: string;
  predictionHorseName: string;
  resultHorseName: string;
  /** predictionHorseNameとresultHorseNameが一致するか（human audit専用。joinの正当性には使わない）。 */
  horseNameMatchesForAudit: boolean;
  predictionEligible: boolean;
  winProbabilityRaw: number | null;
  top2ProbabilityRaw: number | null;
  top3ProbabilityRaw: number | null;
  finishPosition: number | null;
  started: boolean;
  scratched: boolean;
  excluded: boolean;
  didNotFinish: boolean;
  disqualified: boolean;
  /** finishPosition===1のとき true。同着・未確定はfalse（別途dead heat検知で扱う）。 */
  isWinner: boolean;
}

export interface PredictionResultJoinResult {
  predictionArtifactId: string;
  resultArtifactId: string;
  ok: boolean;
  issues: PredictionResultJoinIssue[];
  runners: PredictionResultJoinedRunner[];
}

/**
 * Prediction Artifact（v2）とResult Artifactを、raceId + canonicalHorseIdでjoinする。
 * horseNameは一切join keyに使わない（監査用のhorseNameMatchesForAuditのみへ反映）。
 */
export function joinPredictionAndResult(
  prediction: RacePredictionArtifactV2,
  result: RaceResultArtifact,
): PredictionResultJoinResult {
  const issues: PredictionResultJoinIssue[] = [];

  if (prediction.race.raceId !== result.race.raceId) {
    issues.push({
      code: "RACE_ID_MISMATCH",
      message: `predictionのraceId(${prediction.race.raceId})とresultのraceId(${result.race.raceId})が一致しません。`,
    });
  }

  if (!isCalibrationFinalResult(result)) {
    issues.push({
      code: "RESULT_NOT_FINAL",
      message: `resultStatus=${result.resultStatus}はCalibration用のFINAL結果として扱えません。`,
    });
  }

  const resultHorseIdCounts = new Map<string, number>();
  for (const runner of result.runners) {
    resultHorseIdCounts.set(runner.canonicalHorseId, (resultHorseIdCounts.get(runner.canonicalHorseId) ?? 0) + 1);
  }
  const duplicateResultHorseIds = [...resultHorseIdCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateResultHorseIds.length > 0) {
    issues.push({
      code: "DUPLICATE_RESULT_HORSE_ID",
      message: `Result Artifactにcanonical HorseIdの重複があります: ${duplicateResultHorseIds.map(([id]) => id).join(",")}`,
    });
  }

  const predictionHorseIds = new Set(prediction.horses.map((h) => h.canonicalHorseId));
  const resultHorseIds = new Set(result.runners.map((r) => r.canonicalHorseId));
  const missingFromResult = [...predictionHorseIds].filter((id) => !resultHorseIds.has(id));
  const missingFromPrediction = [...resultHorseIds].filter((id) => !predictionHorseIds.has(id));
  if (missingFromResult.length > 0 || missingFromPrediction.length > 0) {
    issues.push({
      code: "CANONICAL_HORSE_ID_SET_MISMATCH",
      message: `canonicalHorseId集合が一致しません（predictionのみ: ${missingFromResult.join(",") || "なし"}` +
        `／resultのみ: ${missingFromPrediction.join(",") || "なし"}）。`,
    });
  }

  // Prediction population（除外・取消を除く出走予定馬）と、official starter集合
  // （scratched/excludedではない、または実際にstarted=trueの馬）が一致するかを確認する。
  // cutoff後取消はV1 Calibration対象外（section13）——この不一致がまさにその検知条件。
  const predictionActiveIds = new Set(
    prediction.horses.filter((h) => !h.scratched).map((h) => h.canonicalHorseId),
  );
  const officialStarterIds = new Set(
    result.runners.filter((r) => !r.scratched && !r.excluded).map((r) => r.canonicalHorseId),
  );
  const predictionOnlyActive = [...predictionActiveIds].filter((id) => !officialStarterIds.has(id));
  const starterOnlyActive = [...officialStarterIds].filter((id) => !predictionActiveIds.has(id));
  if (predictionOnlyActive.length > 0 || starterOnlyActive.length > 0) {
    issues.push({
      code: "PREDICTION_POPULATION_VS_STARTER_MISMATCH",
      message: `Prediction populationとofficial starter集合が一致しません` +
        `（predictionのみ有効: ${predictionOnlyActive.join(",") || "なし"}` +
        `／resultのみ出走: ${starterOnlyActive.join(",") || "なし"}）。cutoff後取消の疑いがあります。`,
    });
  }

  const winners = result.runners.filter((r) => r.finishPosition === 1);
  if (winners.length > 1) {
    issues.push({
      code: "WINNER_NOT_UNIQUE",
      message: `finishPosition=1の馬が複数存在します（同着の疑い）: ${winners.map((w) => w.canonicalHorseId).join(",")}`,
    });
  }

  const resultByHorseId = new Map(result.runners.map((r) => [r.canonicalHorseId, r]));
  const runners: PredictionResultJoinedRunner[] = prediction.horses
    .filter((h) => resultByHorseId.has(h.canonicalHorseId))
    .map((h): PredictionResultJoinedRunner => {
      const r = resultByHorseId.get(h.canonicalHorseId)!;
      return {
        canonicalHorseId: h.canonicalHorseId,
        predictionHorseName: h.horseName,
        resultHorseName: r.horseName,
        horseNameMatchesForAudit: h.horseName === r.horseName,
        predictionEligible: h.predictionEligible,
        winProbabilityRaw: h.winProbabilityRaw,
        top2ProbabilityRaw: h.top2ProbabilityRaw,
        top3ProbabilityRaw: h.top3ProbabilityRaw,
        finishPosition: r.finishPosition,
        started: r.started,
        scratched: r.scratched,
        excluded: r.excluded,
        didNotFinish: r.didNotFinish,
        disqualified: r.disqualified,
        isWinner: r.finishPosition === 1 && winners.length === 1,
      };
    });

  return {
    predictionArtifactId: prediction.artifactId,
    resultArtifactId: result.artifactId,
    ok: issues.length === 0,
    issues,
    runners,
  };
}

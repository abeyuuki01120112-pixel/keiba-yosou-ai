import type { PredictionPipelineHorseResult, PredictionPipelineResult } from "./predictionPipeline";
import type { RacePerformance } from "../ability/types";

/**
 * UI V0（PRE-WINDOWS INTEGRATION + UI V0、PHASE D）向けの永続化済み予測データ形式。
 * `PredictionPipelineResult`（PHASE C）に、取得できた場合のみ埋まる
 * オッズ・EV・実着順を追加する。未取得の場合は必ずnull
 * （0や推測値で埋めない、UIは"--"として表示する）。
 */
export interface DerivedHorseResult extends PredictionPipelineHorseResult {
  actualFinishPosition: number | null;
  winOdds: number | null;
  /** 期待値ロジックは今回のV0では未接続（明示的にスコープ外）。常にnull */
  ev: number | null;
}

export interface DerivedRacePrediction {
  race: PredictionPipelineResult["race"];
  generatedAt: string;
  modelVersion: string;
  /** 1頭以上でfinalRaceAbilityが算出できていればtrue */
  predicted: boolean;
  /** 1頭以上でactualFinishPositionが分かっていればtrue */
  hasResult: boolean;
  horses: DerivedHorseResult[];
  /** Horse Detail用。馬ごとの過去走全件（RacePerformance、実データそのまま） */
  priorHistoriesByHorseId: Record<string, RacePerformance[]>;
}

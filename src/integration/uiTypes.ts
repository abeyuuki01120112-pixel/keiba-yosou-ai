import type { PredictionPipelineHorseResult, PredictionPipelineResult } from "./predictionPipeline";
import type { RacePerformance } from "../ability/types";

/**
 * UI V0（PRE-WINDOWS INTEGRATION + UI V0、PHASE D）向けの永続化済み予測データ形式。
 * `PredictionPipelineResult`（PHASE C）に実着順を追加する。正式EVは
 * PredictionPipelineHorseResult.expectedValueとして継承し、旧UI互換のevとは分離する。
 */
export interface DerivedHorseResult extends PredictionPipelineHorseResult {
  actualFinishPosition: number | null;
  /** 旧UI互換フィールド。正式EVは継承したexpectedValueを参照する。 */
  ev: number | null;
}

export interface DerivedRacePrediction {
  race: PredictionPipelineResult["race"];
  generatedAt: string;
  modelVersion: string;
  predictionStage?: PredictionPipelineResult["predictionStage"];
  predictionSource?: PredictionPipelineResult["predictionSource"];
  raceStartAt?: string | null;
  /** 新規生成は全頭gate通過時のみtrue（旧保存JSONの意味は変更しない）。 */
  predicted: boolean;
  /** legacy保存JSONでは未記録。新規生成は必ず正式可否と理由を保持する。 */
  predictionCutoffAt?: string;
  formalPredictionReady?: boolean;
  gate?: PredictionPipelineResult["gate"];
  odds?: PredictionPipelineResult["odds"];
  oddsStatus?: PredictionPipelineResult["oddsStatus"];
  evDecisionContext?: PredictionPipelineResult["evDecisionContext"];
  /** 1頭以上でactualFinishPositionが分かっていればtrue */
  hasResult: boolean;
  horses: DerivedHorseResult[];
  /** Horse Detail用。馬ごとの過去走全件（RacePerformance、実データそのまま） */
  priorHistoriesByHorseId: Record<string, RacePerformance[]>;
}

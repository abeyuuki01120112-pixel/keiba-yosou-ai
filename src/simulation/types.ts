/**
 * V0シミュレーターの型定義。
 * 「馬本来の能力データ」と「今回のレース限定評価（馬プロ入力）」を分離すること。
 */

/** 脚質。ポジションを固定するものではなく「狙いやすいポジション」の傾向として使う */
export type RunningStyle = "escape" | "leader" | "stalker" | "closer";

/** 馬プロが今回のレースについて判断する展開ペース */
export type Pace = "slow" | "medium" | "high";

/**
 * 馬本来の恒久的な能力値。将来の馬データベースの基本形。
 * 各パラメータは0〜100。
 */
export interface HorseAbility {
  horseId: string;
  horseName: string;
  /** 馬番 */
  number: number;
  /** 基礎能力：馬そのものの総合的な競走能力 */
  baseAbility: number;
  /** スタート能力：ゲートを出る速さ・出遅れにくさ */
  start: number;
  /** 序盤のポジション獲得能力：逃げ・先行争いに影響 */
  earlySpeed: number;
  /** 持久力：道中の消耗やハイペースへの耐性 */
  stamina: number;
  /** 長く脚を使える能力：3〜4コーナーから直線までの持続戦 */
  sustainedSpeed: number;
  /** 瞬発力：直線で一気に加速する能力 */
  acceleration: number;
  /** 終いの伸び：ゴール前の最後の脚 */
  finishing: number;
  /** 能力発揮の安定度：高いほどブレが小さい */
  consistency: number;
  /** 脚質 */
  runningStyle: RunningStyle;
}

/**
 * 今回のレース限定の補正値。馬の恒久能力とは別枠。
 * 将来、馬プロの展開・トラックバイアス予想などをここに入力する。
 * V0では未入力（すべて0）でも動作する。
 */
export interface RaceAdjustments {
  /** トラックバイアス（内外・前後有利など） */
  trackBias: number;
  /** ラップ適性 */
  lapSuitability: number;
  /** ペース適性 */
  paceSuitability: number;
  /** コース適性 */
  courseSuitability: number;
  /** 馬プロの総合的な所見を数値化したもの */
  professionalOpinion: number;
}

export const ZERO_RACE_ADJUSTMENTS: RaceAdjustments = {
  trackBias: 0,
  lapSuitability: 0,
  paceSuitability: 0,
  courseSuitability: 0,
  professionalOpinion: 0,
};

/** レース全体の設定。ペースは馬プロが指定するもので、AIが独自予想しない */
export interface RaceConfig {
  pace: Pace;
  /** 乱数seed。指定すれば同じ結果が再現できる */
  seed?: number;
  /** horseId単位のレース限定補正（未指定の馬はゼロ補正） */
  raceAdjustments?: Record<string, Partial<RaceAdjustments>>;
}

/** 各フェーズでの位置関係スコア（将来の馬群アニメーション用トレース） */
export interface PhaseSnapshot {
  phase: "start" | "early" | "middle" | "corner" | "straight" | "finish";
  /** horseId -> そのフェーズ時点でのポジションスコア（高いほど前方） */
  positions: Record<string, number>;
}

/** 1レースの結果 */
export interface RaceResult {
  /** 1着から最下位まで horseId を並べたもの */
  order: string[];
  /** horseId -> 着順（1始まり） */
  positions: Record<string, number>;
  /** 代表レース再生用（trace: trueの時のみ含まれる） */
  trace?: PhaseSnapshot[];
}

/** 集計された馬ごとの成績 */
export interface SimulationHorseStats {
  horseId: string;
  horseName: string;
  number: number;
  simulations: number;
  wins: number;
  seconds: number;
  thirds: number;
  /** 0〜100 (%) */
  winRate: number;
  /** 0〜100 (%) 連対率（2着以内） */
  top2Rate: number;
  /** 0〜100 (%) 複勝率（3着以内） */
  top3Rate: number;
}

export type SimulationTrialCount = 1 | 10 | 100 | 1000 | 10000 | 100000;

export const SIMULATION_TRIAL_COUNTS: SimulationTrialCount[] = [
  1, 10, 100, 1000, 10000, 100000,
];

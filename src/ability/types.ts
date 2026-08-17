/**
 * 馬の能力スコア関連の型定義（第1実装：baseAbility V0）。
 *
 * 固定思想（プロジェクト全体で崩さないこと）:
 *   馬の能力 → 今回条件への適性 → 展開・TBなど → その他の補助要素
 * baseAbilityは「展開・トラックバイアス・騎手・調教などを一切含まない、
 * 馬そのものの地力評価」として扱う。
 *
 * 前が壁になった／出遅れた／トラックバイアス／騎手判断などの
 * レース回顧的な要素は、AIが数字から勝手に推測しない
 * （ユーザー・馬プロが後から補正するファクターとして別途扱う）。
 */

export type Surface = "turf" | "dirt";

/**
 * memberLevelScoreAtRace の算出内訳（V0: 上位3頭40% / 上位5頭30% / 全体20% / 層の厚さ10%）。
 * レース単位の値であり、そのレースに出走した全馬で共通。
 */
export interface MemberLevelBreakdown {
  top3Average: number;
  top5Average: number;
  fieldAverage: number;
  depthScore: number;
  /** 能力値が参照できた出走馬の頭数（未参照の馬は集計から除外） */
  participantCount: number;
}

/**
 * TODO（将来実装・今回のスコープ外）:
 * レース格（G1/G2/G3/L/OPなど）。表示用の付随情報として保持してよいが、
 * memberLevelScoreAtRace の計算には絶対に使わない（レース名や格による固定加点は禁止）。
 */
export type RaceGrade = "G1" | "G2" | "G3" | "L" | "OP" | "unknown";

/**
 * 競馬場×芝/ダート×距離×馬場状態ごとの過去5年基準タイム。
 * 平均ではなく中央値を使う（外れ値に引っ張られにくくするため）。
 * V0では仮データを保持するのみ。実データ確定後は差し替え可能な構造にしている。
 */
export interface CourseTimeBaseline {
  racecourse: string;
  surface: Surface;
  /** メートル */
  distance: number;
  going: string;

  sampleYears: number;
  sampleCount: number;
  medianTimeSeconds: number;
}

/**
 * 当日馬場補正。対象レースを除いた同日・同競馬場・同surfaceのレース群から算出する。
 * サンプルが少なすぎる場合は勝手に大きな補正を作らず、adjustmentSeconds=0・isReliable=falseとする。
 */
export interface TrackBiasTimeAdjustment {
  /** 実走タイム - 基準タイム の中央値（秒）。負の値＝当日は基準より速い馬場 */
  adjustmentSeconds: number;
  sampleCount: number;
  isReliable: boolean;
}

/**
 * raceTimeScoreAtRace の算出根拠。レース単位の値であり、そのレースに出走した全馬で共通。
 * 5年基準タイムが見つからない条件だった場合はnull（raceTimeScoreは中立値にフォールバックする）。
 */
export interface RaceTimeBreakdown {
  baselineTimeSeconds: number;
  /** そのレースの公式タイム（勝ち馬の走破タイム）秒 */
  actualTimeSeconds: number;
  /** baselineTimeSeconds - actualTimeSeconds（正の値＝基準より速い） */
  baseDiffSeconds: number;
  trackAdjustment: TrackBiasTimeAdjustment;
  /** baseDiffSeconds + trackAdjustment.adjustmentSeconds */
  trackAdjustedDiffSeconds: number;
}

/**
 * 競馬場×芝/ダート×距離×馬場状態ごとの過去5年上がり3F基準。
 * 平均ではなく中央値を使う。V0では仮データを保持するのみ。
 */
export interface CourseFinal3FBaseline {
  racecourse: string;
  surface: Surface;
  /** メートル */
  distance: number;
  going: string;

  sampleYears: number;
  sampleCount: number;
  medianFinal3FSeconds: number;
}

/**
 * final3FScore の算出根拠。上がり3Fは馬ごとに異なる個別値のため、
 * memberLevelScoreAtRace・raceTimeScoreとは異なり、同じレースでも出走馬ごとに値が違う。
 *
 * レース内相対評価（raceFinal3FMedianSecondsとの差）は常に算出できる。
 * 5年基準タイムが見つからない条件だった場合、絶対評価（courseBaselineSeconds以下）はnullとなり、
 * final3FScoreはレース内相対評価100%にフォールバックする。
 */
export interface Final3FBreakdown {
  horseFinal3FSeconds: number;
  /** 完走馬の上がり3F中央値（平均ではなく中央値） */
  raceFinal3FMedianSeconds: number;
  /** raceFinal3FMedianSeconds - horseFinal3FSeconds（正の値＝レースの標準より速い上がり） */
  relativeDiffSeconds: number;
  /** 5年基準タイム。見つからない場合はnull */
  courseBaselineSeconds: number | null;
  /** 当日上がり補正。courseBaselineSecondsがnullの場合はnull */
  trackAdjustment: TrackBiasTimeAdjustment | null;
  /** (courseBaselineSeconds - horseFinal3FSeconds) + trackAdjustment.adjustmentSeconds。courseBaselineSecondsがnullの場合はnull */
  absoluteDiffSeconds: number | null;
}

/**
 * weightScore の算出根拠。斤量は馬ごとに異なる個別値のため、final3FScoreと同じく
 * 同じレースでも出走馬ごとに値が違う（raceMedianWeightKg・secondsPerKgはレース単位で共通）。
 *
 * 出走馬全頭の斤量が参照できない（不正値など）場合、isReliable=falseとなり、
 * weightDiffKg・weightAdjustmentSecondsは0（中立）にフォールバックする。
 */
export interface WeightBreakdown {
  horseCarriedWeightKg: number;
  /** そのレース出走馬の斤量中央値（平均ではなく中央値） */
  raceMedianWeightKg: number;
  /** horseCarriedWeightKg - raceMedianWeightKg（正の値＝平均より重い斤量） */
  weightDiffKg: number;
  /** メートル */
  distance: number;
  /** 距離に応じた1kgあたりの秒換算（V0: 0.2 * distance/2000） */
  secondsPerKg: number;
  /** weightDiffKg * secondsPerKg（正の値＝平均より重い負荷を背負った） */
  weightAdjustmentSeconds: number;
  isReliable: boolean;
}

/** 1走分の実績データとスコア内訳 */
export interface RacePerformance {
  raceId: string;
  raceName: string;
  /** ISO 8601 (YYYY-MM-DD) */
  raceDate: string;

  racecourse: string;
  surface: Surface;
  /** メートル */
  distance: number;
  /** 馬場状態（良・稍重・重・不良 など） */
  going: string;

  finishPosition: number;
  /**
   * 勝ち馬とのタイム差（秒）。負けた馬は正の値。
   * 勝った馬は、2着馬につけた着差をマイナス値として保持する
   * （例: 0.2秒差で勝利 → timeGap = -0.2）。
   */
  timeGap: number;
  /** 走破タイム（秒） */
  raceTime: number;
  /** 上がり3F（秒） */
  final3F: number;
  /** 斤量（kg） */
  carriedWeight: number;

  /**
   * 実質メンバーレベル・当時評価（0〜100）。
   * レース格（G1/G2/G3など）は一切使わず、そのレースに実際に出走していた
   * 各馬の abilityBeforeRace（そのレースより前の過去走だけで計算した能力値）から
   * calculateMemberLevel() で算出する。raceScoreの計算にはこの値を使う。
   */
  memberLevelScoreAtRace: number;
  /**
   * 実質メンバーレベル・事後再評価値（0〜100）。
   * TODO（将来実装・今回のスコープ外）: レース後の出走馬の活躍
   * （2着馬がG1勝利、5着馬が重賞好走 など）を踏まえて「実はハイレベル戦だった」と
   * 再評価する機能。V0では常にnull・未使用。
   */
  retrospectiveMemberLevelScore: number | null;
  /**
   * memberLevelScoreAtRace の算出根拠（上位3頭平均・上位5頭平均・全体平均・層の厚さ）。
   * 参照可能な能力値を持つ出走馬が1頭も無く算出不能だった場合はnull。
   */
  memberLevelBreakdown: MemberLevelBreakdown | null;
  /** タイム差スコア（0〜100）。calculateTimeGapScore() で距離補正込みに計算する */
  timeGapScore: number;
  /**
   * 走破タイムスコア（0〜100）。
   * 競馬場×芝/ダート×距離×馬場状態 ごとの過去5年基準タイム中央値と当日馬場補正から、
   * calculateRaceTimeScore() で算出する。レース単位の値であり、そのレースの全出走馬で共通。
   */
  raceTimeScore: number;
  /**
   * raceTimeScore の算出根拠。5年基準タイムが見つからなかった場合はnull。
   */
  raceTimeBreakdown: RaceTimeBreakdown | null;
  /**
   * 上がり3Fスコア（0〜100）。
   * レース内相対評価（レース上がり中央値との差）60% ＋
   * 絶対評価（5年基準＋当日上がり補正との差）40% から calculateFinal3FScore() で算出する。
   * 上がり順位は直接評価に使わない。馬ごとに異なる個別値（レース単位で共通ではない）。
   */
  final3FScore: number;
  /** final3FScore の算出根拠 */
  final3FBreakdown: Final3FBreakdown;
  /**
   * 斤量補正スコア（0〜100）。
   * 「56kgなら70点」のような固定点数ではなく、レース斤量中央値との差を
   * 距離に応じた秒換算（V0: 2000mで1kg ≒ 0.2秒）に変換し calculateWeightScore() で算出する。
   * 重い斤量を背負って走った馬ほど高評価、軽斤量ほど低評価。馬ごとに異なる個別値。
   */
  weightScore: number;
  /** weightScore の算出根拠 */
  weightBreakdown: WeightBreakdown;

  /** 5項目の加重平均（0〜100、小数第1位）。calculateRaceScore() の結果 */
  raceScore: number;
}

/** 馬1頭分の能力プロフィール（直近5走とbaseAbility） */
export interface HorseAbilityProfile {
  horseId: string;
  horseName: string;

  /** 直近5走。[0]が前走、[4]が5走前 の順（新しい順） */
  recentRaces: RacePerformance[];

  /** 直近5走を均等20%ずつ平均した基礎能力（0〜100、小数第1位） */
  baseAbility: number;
}

/**
 * TODO（将来実装・今回のスコープ外）:
 * - レースラップの自動分類（瞬発戦 / 持続戦 / 消耗戦）
 * - コース適性（回り・コースサイズ・直線長・坂・コーナー数など）
 */
export type LapProfile = "burst" | "sustained" | "attrition";

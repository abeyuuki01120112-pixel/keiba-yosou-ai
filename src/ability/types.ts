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
   * 実質メンバーレベル（0〜100）。
   * レース格（G1/G2/G3など）で固定しない。
   * 将来的には出走馬全体の能力・上位馬の能力・高能力馬の頭数・
   * その後の好走実績などから算出する。V0では仮入力値を保持するのみ。
   */
  memberLevelScore: number;
  /** タイム差スコア（0〜100）。calculateTimeGapScore() で距離補正込みに計算する */
  timeGapScore: number;
  /**
   * 走破タイムスコア（0〜100）。
   * 将来的には 競馬場×芝/ダート×距離×馬場状態 ごとの過去5年基準タイム中央値
   * ＋ 当日馬場補正 ＋ 実走破タイム から算出する。V0では仮入力値を保持するのみ。
   */
  raceTimeScore: number;
  /**
   * 上がり3Fスコア（0〜100）。
   * 将来的にはレース全体の上がり水準・過去5年の同条件基準・当日の上がり馬場補正を使う。
   * V0では仮入力値を保持するのみ。
   */
  final3FScore: number;
  /**
   * 斤量補正スコア（0〜100）。
   * 将来的には距離に応じた秒換算（2000mで1kg差 ≒ 約0.2秒が目安）で算出する。
   * V0では仮入力値を保持するのみ。
   */
  weightScore: number;

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

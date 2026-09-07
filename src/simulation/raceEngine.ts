/**
 * 1レース分のシミュレーションロジック。
 *
 * 設計思想：
 * - AIが独自に展開・トラックバイアス・ラップ適性を予想するのではなく、
 *   「馬の能力データ」＋「馬プロが指定したレース限定補正・ペース」＋「確率的なブレ」
 *   から1レースを計算する。
 * - 脚質はポジションを固定しない。あくまで「狙いやすいポジション」の傾向として
 *   スタート結果や乱数と合成される。
 *
 * フェーズ構成（Phase A〜F）：
 *   A. スタート      … start・脚質・出遅れ判定
 *   B. 序盤          … earlySpeedと脚質でポジション争い、ペースの実効値を決定
 *   C. 道中          … staminaを消耗、ペース・隊列位置により消耗量が変わる
 *   D. 3〜4コーナー   … sustainedSpeedで進出、位置取りの差も残る
 *   E. 直線          … accelerationで加速
 *   F. ゴール前       … finishingと残りスタミナで着順確定
 */

import { SeededRandom, clamp } from "./probability";
import type {
  HorseAbility,
  Pace,
  PhaseSnapshot,
  RaceAdjustments,
  RaceConfig,
  RaceResult,
} from "./types";
import { ZERO_RACE_ADJUSTMENTS } from "./types";

const PACE_BASE_VALUE: Record<Pace, number> = {
  slow: 0.85,
  medium: 1.0,
  high: 1.15,
};

const RUNNING_STYLE_BIAS: Record<HorseAbility["runningStyle"], number> = {
  escape: 18,
  leader: 8,
  stalker: 0,
  closer: -12,
};

/** consistencyから能力発揮率のブレ幅（標準偏差）を求める。高いほどブレが小さい */
function consistencyToSd(consistency: number): number {
  const c = clamp(consistency, 0, 100);
  return 0.02 + ((100 - c) / 100) * 0.1;
}

interface HorseRaceState {
  horse: HorseAbility;
  adjustments: RaceAdjustments;
  discharge: number; // 能力発揮率（1.0が基準）
  startScore: number;
  earlyPosScore: number;
  remainingEnergy: number;
  cornerScore: number;
  straightScore: number;
  finalScore: number;
}

function resolveAdjustments(
  horseId: string,
  raceAdjustments: RaceConfig["raceAdjustments"],
): RaceAdjustments {
  const partial = raceAdjustments?.[horseId];
  if (!partial) return ZERO_RACE_ADJUSTMENTS;
  return { ...ZERO_RACE_ADJUSTMENTS, ...partial };
}

/**
 * 16頭前後を想定した1レースシミュレーション。
 * trace=trueの場合、各フェーズのポジションスコアを記録する（代表レース再生用）。
 */
export function simulateRace(
  horses: HorseAbility[],
  config: RaceConfig,
  rng: SeededRandom,
  options: { trace?: boolean } = {},
): RaceResult {
  const trace: PhaseSnapshot[] = [];

  // --- Phase A: スタート ---
  const states: HorseRaceState[] = horses.map((horse) => {
    const discharge = clamp(
      rng.nextNormal(1.0, consistencyToSd(horse.consistency)),
      0.6,
      1.4,
    );

    // 出遅れ確率：startが低いほど出遅れやすい
    const stumbleProbability = clamp(0.08 - (horse.start / 100) * 0.06, 0.01, 0.08);
    const stumblePenalty = rng.chance(stumbleProbability)
      ? -rng.nextRange(15, 35)
      : 0;

    const startScore =
      horse.start * discharge + rng.nextNormal(0, 8) + stumblePenalty;

    return {
      horse,
      adjustments: resolveAdjustments(horse.horseId, config.raceAdjustments),
      discharge,
      startScore,
      earlyPosScore: 0,
      remainingEnergy: 100,
      cornerScore: 0,
      straightScore: 0,
      finalScore: 0,
    };
  });

  if (options.trace) {
    trace.push({
      phase: "start",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.startScore]),
      ),
    });
  }

  // --- Phase B: 序盤（ポジション争い・ペース決定） ---
  for (const s of states) {
    const styleBias = RUNNING_STYLE_BIAS[s.horse.runningStyle];
    s.earlyPosScore =
      s.horse.earlySpeed * s.discharge * 0.7 +
      s.startScore * 0.3 +
      styleBias +
      rng.nextNormal(0, 10);
  }

  if (options.trace) {
    trace.push({
      phase: "early",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.earlyPosScore]),
      ),
    });
  }

  // 逃げ争い（複数の先行争い馬が競り合うとペースが上がりやすい）
  const sortedByEarly = [...states].sort(
    (a, b) => b.earlyPosScore - a.earlyPosScore,
  );
  const topScore = sortedByEarly[0]?.earlyPosScore ?? 0;
  const contenders = sortedByEarly.filter(
    (s) =>
      (s.horse.runningStyle === "escape" || s.horse.runningStyle === "leader") &&
      topScore - s.earlyPosScore <= 10,
  ).length;
  const paceContestBoost = Math.min(contenders * 0.03, 0.08);

  const effectivePace = clamp(
    PACE_BASE_VALUE[config.pace] + rng.nextNormal(0, 0.05) + paceContestBoost,
    0.7,
    1.3,
  );

  // --- Phase C: 道中（スタミナ消耗） ---
  const totalHorses = states.length;
  const rankOf = new Map<string, number>();
  sortedByEarly.forEach((s, idx) => rankOf.set(s.horse.horseId, idx + 1));

  for (const s of states) {
    const rank = rankOf.get(s.horse.horseId) ?? totalHorses;
    const positionFactor = 1 + (1 - rank / totalHorses) * 0.5;
    const staminaResistance = 0.5 + (s.horse.stamina * s.discharge) / 100;
    const consumptionNoise = clamp(rng.nextNormal(1, 0.08), 0.7, 1.3);
    const consumption =
      (30 * effectivePace * positionFactor * consumptionNoise) /
      staminaResistance;
    s.remainingEnergy = clamp(100 - consumption, 0, 100);
  }

  if (options.trace) {
    trace.push({
      phase: "middle",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.remainingEnergy]),
      ),
    });
  }

  // --- Phase D: 3〜4コーナー ---
  for (const s of states) {
    s.cornerScore =
      s.horse.sustainedSpeed * s.discharge * 0.55 +
      s.remainingEnergy * 0.25 +
      s.earlyPosScore * 0.2 +
      s.adjustments.trackBias * 0.4 +
      s.adjustments.lapSuitability * 0.4 +
      rng.nextNormal(0, 9);
  }

  if (options.trace) {
    trace.push({
      phase: "corner",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.cornerScore]),
      ),
    });
  }

  // --- Phase E: 直線 ---
  for (const s of states) {
    s.straightScore =
      s.horse.acceleration * s.discharge * 0.65 +
      s.cornerScore * 0.35 +
      s.adjustments.paceSuitability * 0.3 +
      s.adjustments.courseSuitability * 0.3 +
      rng.nextNormal(0, 9);
  }

  if (options.trace) {
    trace.push({
      phase: "straight",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.straightScore]),
      ),
    });
  }

  // --- Phase F: ゴール前（着順確定） ---
  for (const s of states) {
    s.finalScore =
      s.horse.finishing * s.discharge * 0.4 +
      s.straightScore * 0.35 +
      s.remainingEnergy * 0.1 +
      s.horse.baseAbility * s.discharge * 0.15 +
      s.adjustments.professionalOpinion * 0.5 +
      rng.nextNormal(0, 8);
  }

  if (options.trace) {
    trace.push({
      phase: "finish",
      positions: Object.fromEntries(
        states.map((s) => [s.horse.horseId, s.finalScore]),
      ),
    });
  }

  const finishOrder = [...states].sort((a, b) => b.finalScore - a.finalScore);

  const order = finishOrder.map((s) => s.horse.horseId);
  const positions: Record<string, number> = {};
  finishOrder.forEach((s, idx) => {
    positions[s.horse.horseId] = idx + 1;
  });

  return options.trace ? { order, positions, trace } : { order, positions };
}

/**
 * 乱数まわりのユーティリティ。
 * seedを指定すれば再現可能、指定しなければ毎回異なる結果になる。
 */

export class SeededRandom {
  private state: number;

  constructor(seed?: number) {
    const s = seed ?? Date.now() ^ (Math.random() * 0xffffffff);
    // 0を避ける（mulberry32が縮退するため）
    this.state = (s >>> 0) || 1;
  }

  /** [0, 1) の一様乱数（mulberry32） */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) の一様乱数 */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 正規分布乱数（Box-Muller法） */
  nextNormal(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * sd;
  }

  /** 指定確率でtrueを返す */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

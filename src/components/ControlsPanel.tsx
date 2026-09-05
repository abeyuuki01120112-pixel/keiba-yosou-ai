import type { Pace, SimulationTrialCount } from "../simulation/types";
import { SIMULATION_TRIAL_COUNTS } from "../simulation/types";

interface Props {
  pace: Pace;
  onPaceChange: (pace: Pace) => void;
  trialCount: SimulationTrialCount;
  onTrialCountChange: (count: SimulationTrialCount) => void;
  seedText: string;
  onSeedTextChange: (text: string) => void;
  onRun: () => void;
  isRunning: boolean;
  lastElapsedMs: number | null;
}

const PACE_LABEL: Record<Pace, string> = {
  slow: "スロー",
  medium: "ミドル",
  high: "ハイ",
};

export function ControlsPanel({
  pace,
  onPaceChange,
  trialCount,
  onTrialCountChange,
  seedText,
  onSeedTextChange,
  onRun,
  isRunning,
  lastElapsedMs,
}: Props) {
  return (
    <div className="controls-panel">
      <div className="controls-row">
        <label className="controls-label">
          ペース（馬プロ予想を想定した手動選択）
          <div className="pace-buttons">
            {(Object.keys(PACE_LABEL) as Pace[]).map((p) => (
              <button
                key={p}
                type="button"
                className={p === pace ? "pace-btn active" : "pace-btn"}
                onClick={() => onPaceChange(p)}
              >
                {PACE_LABEL[p]}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="controls-row">
        <label className="controls-label">
          試走回数
          <div className="pace-buttons">
            {SIMULATION_TRIAL_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className={count === trialCount ? "pace-btn active" : "pace-btn"}
                onClick={() => onTrialCountChange(count)}
              >
                {count.toLocaleString()}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="controls-row">
        <label className="controls-label">
          乱数seed（任意・同じ値なら同じ結果を再現）
          <input
            className="seed-input"
            type="text"
            inputMode="numeric"
            placeholder="未指定なら毎回ランダム"
            value={seedText}
            onChange={(e) => onSeedTextChange(e.target.value)}
          />
        </label>
      </div>

      <div className="controls-row">
        <button type="button" className="run-btn" onClick={onRun} disabled={isRunning}>
          {isRunning ? "計算中..." : `${trialCount.toLocaleString()}回シミュレーション実行`}
        </button>
        {lastElapsedMs !== null && (
          <span className="elapsed-text">
            所要時間: {(lastElapsedMs / 1000).toFixed(3)} 秒
          </span>
        )}
      </div>
    </div>
  );
}

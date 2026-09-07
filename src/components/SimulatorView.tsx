import { useState } from "react";
import { loadDefaultHorses, RACE_NAME } from "../simulation/horseData";
import { runSimulation } from "../simulation/simulationRunner";
import type { Pace, SimulationHorseStats, SimulationTrialCount } from "../simulation/types";
import { ControlsPanel } from "./ControlsPanel";
import { ResultsTable } from "./ResultsTable";
import { HorseDetailPanel } from "./HorseDetailPanel";
import { ImportStatusPanel } from "./ImportStatusPanel";

const horses = loadDefaultHorses();

function parseSeed(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** プロジェクト最初期のV0シミュレーター（Ability Model導入前の暫定実装、参考保存） */
export function SimulatorView() {
  const [pace, setPace] = useState<Pace>("medium");
  const [trialCount, setTrialCount] = useState<SimulationTrialCount>(1000);
  const [seedText, setSeedText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SimulationHorseStats[]>([]);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [oddsByHorseId, setOddsByHorseId] = useState<Record<string, number | undefined>>({});
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);

  const handleRun = () => {
    setIsRunning(true);
    // 計算中表示を先に描画させてから重い処理に入る
    setTimeout(() => {
      const result = runSimulation(
        horses,
        { pace, seed: parseSeed(seedText) },
        trialCount,
      );
      setStats(result.stats);
      setLastElapsedMs(result.elapsedMs);
      setIsRunning(false);
    }, 0);
  };

  const handleOddsChange = (horseId: string, value: number | undefined) => {
    setOddsByHorseId((prev) => ({ ...prev, [horseId]: value }));
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>{RACE_NAME} V0 レースシミュレーター</h1>
        <p className="app-subtitle">
          馬の能力値 × 馬プロの展開予想 × 確率的ブレ → 大量試走 → 実オッズとの乖離から期待値の高い馬を探す
        </p>
      </header>

      <div className="horse-quick-list">
        {horses.map((h) => (
          <button
            key={h.horseId}
            type="button"
            className="horse-quick-btn"
            onClick={() => setSelectedHorseId(h.horseId)}
          >
            {h.number}. {h.horseName}
          </button>
        ))}
      </div>

      <HorseDetailPanel horseId={selectedHorseId} onClose={() => setSelectedHorseId(null)} />

      <ControlsPanel
        pace={pace}
        onPaceChange={setPace}
        trialCount={trialCount}
        onTrialCountChange={setTrialCount}
        seedText={seedText}
        onSeedTextChange={setSeedText}
        onRun={handleRun}
        isRunning={isRunning}
        lastElapsedMs={lastElapsedMs}
      />

      <ResultsTable
        stats={stats}
        oddsByHorseId={oddsByHorseId}
        onOddsChange={handleOddsChange}
        onSelectHorse={setSelectedHorseId}
      />

      <ImportStatusPanel />
    </div>
  );
}

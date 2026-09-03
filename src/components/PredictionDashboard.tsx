import { useState } from "react";
import "./PredictionDashboard.css";
import { loadAllRaces } from "./predictionDashboardData";
import { RaceListView } from "./RaceListView";
import { RaceDetailView } from "./RaceDetailView";
import { HorseDetailDrawer } from "./HorseDetailDrawer";

const races = loadAllRaces();

/**
 * 予想ダッシュボード（PRE-WINDOWS INTEGRATION + UI V0、PHASE D）。
 * ユーザー本人専用。一般公開・ユーザー登録・課金機能は無し。
 * PC/iPad横画面での分析ダッシュボードとして、情報密度優先で構成する。
 */
export function PredictionDashboard() {
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);

  const selectedRace = races.find((r) => r.race.raceId === selectedRaceId) ?? null;
  const selectedHorse = selectedRace?.horses.find((h) => h.horseId === selectedHorseId) ?? null;
  const selectedHorsePriorRaces = selectedHorseId
    ? (selectedRace?.priorHistoriesByHorseId[selectedHorseId] ?? [])
    : [];

  return (
    <div className="prediction-dashboard">
      {selectedRace === null ? (
        <RaceListView races={races} onSelectRace={setSelectedRaceId} />
      ) : (
        <RaceDetailView
          race={selectedRace}
          onBack={() => {
            setSelectedRaceId(null);
            setSelectedHorseId(null);
          }}
          onSelectHorse={setSelectedHorseId}
        />
      )}

      {selectedHorse && (
        <HorseDetailDrawer
          horse={selectedHorse}
          priorRaces={selectedHorsePriorRaces}
          onClose={() => setSelectedHorseId(null)}
        />
      )}
    </div>
  );
}

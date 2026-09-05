import type { DerivedRacePrediction } from "../integration/uiTypes";
import { fmt } from "./predictionDashboardData";

interface RaceDetailViewProps {
  race: DerivedRacePrediction;
  onBack: () => void;
  onSelectHorse: (horseId: string) => void;
}

export function RaceDetailView({ race, onBack, onSelectHorse }: RaceDetailViewProps) {
  const sortedHorses = [...race.horses].sort((a, b) => {
    const ra = a.rankByFinalRaceAbility ?? 999;
    const rb = b.rankByFinalRaceAbility ?? 999;
    if (ra !== rb) return ra - rb;
    return (a.horseNumber ?? 999) - (b.horseNumber ?? 999);
  });

  const hasOdds = race.horses.some((h) => h.winOdds !== null);
  const hasEv = race.horses.some((h) => h.ev !== null);
  const hasResult = race.hasResult;

  return (
    <div className="race-detail-view">
      <button type="button" className="back-button" onClick={onBack}>
        ← レース一覧へ戻る
      </button>
      <h2>
        {race.race.raceDate} {race.race.racecourse} {race.race.raceName}（
        {race.race.surface === "turf" ? "芝" : "ダ"}
        {race.race.distance}m）
      </h2>
      <p className="race-meta">
        modelVersion: {race.modelVersion} / generatedAt: {race.generatedAt}
      </p>

      <table className="dashboard-table horse-table">
        <thead>
          <tr>
            <th>馬番</th>
            <th>馬名</th>
            <th>Base Ability</th>
            <th>Suitability</th>
            <th>finalRaceAbility</th>
            <th>AI順位</th>
            <th>Win%</th>
            <th>Confidence</th>
            {hasOdds && <th>Odds</th>}
            {hasEv && <th>EV</th>}
            {hasResult && <th>実着順</th>}
          </tr>
        </thead>
        <tbody>
          {sortedHorses.map((h) => (
            <tr
              key={h.horseId}
              className={`horse-row ${h.actualFinishPosition === 1 ? "horse-row-winner" : ""}`}
              onClick={() => onSelectHorse(h.horseId)}
            >
              <td>{h.horseNumber ?? "--"}</td>
              <td className="horse-name-cell">{h.horseName}</td>
              <td>{fmt(h.baseAbility)}</td>
              <td>{fmt(h.overallSuitabilityPercent, "%")}</td>
              <td>{fmt(h.finalRaceAbility)}</td>
              <td>{fmt(h.rankByFinalRaceAbility, "位")}</td>
              <td>{fmt(h.winProbability, "%")}</td>
              <td>{h.confidence ?? "--"}</td>
              {hasOdds && <td>{fmt(h.winOdds)}</td>}
              {hasEv && <td>{fmt(h.ev)}</td>}
              {hasResult && <td>{fmt(h.actualFinishPosition, "着")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

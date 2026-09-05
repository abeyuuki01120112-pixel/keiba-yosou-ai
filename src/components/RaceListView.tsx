import type { DerivedRacePrediction } from "../integration/uiTypes";

interface RaceListViewProps {
  races: DerivedRacePrediction[];
  onSelectRace: (raceId: string) => void;
}

export function RaceListView({ races, onSelectRace }: RaceListViewProps) {
  return (
    <div className="race-list-view">
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>競馬場</th>
            <th>レース名</th>
            <th>距離</th>
            <th>状態</th>
            <th>予測</th>
            <th>結果</th>
          </tr>
        </thead>
        <tbody>
          {races.map((r) => (
            <tr key={r.race.raceId} className="race-row" onClick={() => onSelectRace(r.race.raceId)}>
              <td>{r.race.raceDate}</td>
              <td>{r.race.racecourse}</td>
              <td className="race-name-cell">{r.race.raceName}</td>
              <td>
                {r.race.surface === "turf" ? "芝" : "ダ"}
                {r.race.distance}m
              </td>
              <td>{r.hasResult ? "確定" : "予定"}</td>
              <td>
                <span className={`badge ${r.predicted ? "badge-ok" : "badge-none"}`}>
                  {r.predicted ? "予測済" : "未予測"}
                </span>
              </td>
              <td>
                <span className={`badge ${r.hasResult ? "badge-ok" : "badge-none"}`}>
                  {r.hasResult ? "結果あり" : "結果なし"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {races.length === 0 && <p className="empty-state">まだ予測データがありません。npm run generate:derived を実行してください。</p>}
    </div>
  );
}

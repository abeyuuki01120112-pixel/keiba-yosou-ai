import type { DerivedHorseResult } from "../integration/uiTypes";
import type { RacePerformance } from "../ability/types";
import { fmt } from "./predictionDashboardData";

interface HorseDetailDrawerProps {
  horse: DerivedHorseResult;
  priorRaces: RacePerformance[];
  onClose: () => void;
}

export function HorseDetailDrawer({ horse, priorRaces, onClose }: HorseDetailDrawerProps) {
  return (
    <div className="horse-detail-drawer">
      <div className="drawer-header">
        <h3>
          {horse.horseNumber}. {horse.horseName}
        </h3>
        <button type="button" className="drawer-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <section className="drawer-section">
        <h4>今回評価の根拠</h4>
        <div className="ability-summary-grid">
          <div>
            <span className="label">Base Ability</span>
            <span className="value">{fmt(horse.baseAbility)}</span>
          </div>
          <div>
            <span className="label">Suitability（総合）</span>
            <span className="value">{fmt(horse.overallSuitabilityPercent, "%")}</span>
          </div>
          <div>
            <span className="label">effectiveAbility</span>
            <span className="value">{fmt(horse.effectiveAbility)}</span>
          </div>
          <div>
            <span className="label">finalRaceAbility</span>
            <span className="value">{fmt(horse.finalRaceAbility)}</span>
          </div>
          <div>
            <span className="label">AI順位</span>
            <span className="value">{fmt(horse.rankByFinalRaceAbility, "位")}</span>
          </div>
          <div>
            <span className="label">Win%</span>
            <span className="value">{fmt(horse.winProbability, "%")}</span>
          </div>
        </div>
      </section>

      <section className="drawer-section">
        <h4>Suitability内訳（distance/course/going/gate）</h4>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>distance</th>
              <th>course</th>
              <th>going</th>
              <th>gate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{fmt(horse.distanceSuitability, "%")}</td>
              <td>{fmt(horse.courseSuitability, "%")}</td>
              <td>{fmt(horse.goingSuitability, "%")}</td>
              <td>{fmt(horse.gateSuitability, "%")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="drawer-section">
        <h4>過去走（raceScore / memberLevel / final3F 内訳）</h4>
        {priorRaces.length === 0 ? (
          <p className="empty-state">対象時点より前の実データ過去走がありません（データ不足）。</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>レース名</th>
                <th>着順</th>
                <th>raceScore</th>
                <th>memberLevel</th>
                <th>final3F</th>
                <th>timeGap</th>
                <th>raceTime</th>
                <th>weight</th>
              </tr>
            </thead>
            <tbody>
              {priorRaces.map((r) => (
                <tr key={r.raceId}>
                  <td>{r.raceDate}</td>
                  <td className="race-name-cell">{r.raceName}</td>
                  <td>{r.finishPosition}着</td>
                  <td>{r.raceScore}</td>
                  <td>{r.memberLevelScoreAtRace}</td>
                  <td>{r.final3FScore}</td>
                  <td>{r.timeGapScore}</td>
                  <td>{r.raceTimeScore}</td>
                  <td>{r.weightScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {horse.warnings.length > 0 && (
        <section className="drawer-section">
          <h4>Warnings</h4>
          <ul className="warning-list">
            {horse.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

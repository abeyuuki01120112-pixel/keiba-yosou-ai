import { useMemo, useState } from "react";
import { loadHorseAbilityProfile } from "../ability/horseAbilityData";

const RACE_LABELS = ["前走", "2走前", "3走前", "4走前", "5走前"];

interface Props {
  horseId: string | null;
  onClose: () => void;
}

export function HorseDetailPanel({ horseId, onClose }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const profile = useMemo(
    () => (horseId ? loadHorseAbilityProfile(horseId) : undefined),
    [horseId],
  );

  if (!horseId) return null;

  return (
    <div className="horse-detail-panel">
      <div className="detail-header">
        <h2>{profile?.horseName ?? horseId} の馬能力</h2>
        <button type="button" className="detail-close-btn" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      {!profile || profile.recentRaces.length === 0 ? (
        <p className="empty-hint">この馬の直近走データはまだ登録されていません。</p>
      ) : (
        <>
          <div className="base-ability">
            <span className="base-ability-label">基礎能力</span>
            <span className="base-ability-value">{profile.baseAbility.toFixed(1)}</span>
          </div>

          <ul className="recent-race-list">
            {profile.recentRaces.map((race, idx) => {
              const isOpen = expandedIndex === idx;
              return (
                <li key={race.raceId} className="recent-race-item">
                  <button
                    type="button"
                    className="recent-race-row"
                    onClick={() => setExpandedIndex(isOpen ? null : idx)}
                  >
                    <span className="race-label">{RACE_LABELS[idx] ?? `${idx + 1}走前`}</span>
                    <span className="race-name">{race.raceName}</span>
                    <span className="race-score">{race.raceScore.toFixed(1)}</span>
                    <span className="expand-caret">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && (
                    <div className="race-breakdown">
                      <div className="breakdown-row">
                        <span>実質メンバーレベル</span>
                        <span>{race.memberLevelScoreAtRace.toFixed(1)}</span>
                      </div>
                      {race.memberLevelBreakdown && (
                        <div className="member-level-sub-breakdown">
                          <div className="breakdown-row sub-row">
                            <span>上位3頭平均</span>
                            <span>{race.memberLevelBreakdown.top3Average.toFixed(1)}</span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>上位5頭平均</span>
                            <span>{race.memberLevelBreakdown.top5Average.toFixed(1)}</span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>全体平均</span>
                            <span>{race.memberLevelBreakdown.fieldAverage.toFixed(1)}</span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>層の厚さ</span>
                            <span>{race.memberLevelBreakdown.depthScore.toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                      <div className="breakdown-row">
                        <span>タイム差</span>
                        <span>{race.timeGapScore.toFixed(1)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>走破タイム</span>
                        <span>{race.raceTimeScore.toFixed(1)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>上がり3F</span>
                        <span>{race.final3FScore.toFixed(1)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>斤量補正</span>
                        <span>{race.weightScore.toFixed(1)}</span>
                      </div>
                      <div className="breakdown-row breakdown-total">
                        <span>1走スコア</span>
                        <span>{race.raceScore.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

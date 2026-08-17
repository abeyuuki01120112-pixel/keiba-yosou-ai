import { useMemo, useState } from "react";
import { loadHorseAbilityProfile } from "../ability/horseAbilityData";
import { formatRaceTimeSeconds } from "../ability/raceTimeScore";

const RACE_LABELS = ["前走", "2走前", "3走前", "4走前", "5走前"];

/**
 * このレースのraceScoreに、fallback／仮baseline由来の暫定値が
 * 1項目でも含まれているかどうか。完全実データと誤認しないための表示用フラグ。
 */
function hasProvisionalScore(race: {
  memberLevelBreakdown: unknown;
  raceTimeBreakdown: unknown;
  final3FBreakdown: { courseBaselineSeconds: number | null };
  weightBreakdown: { isReliable: boolean };
}): boolean {
  return (
    race.memberLevelBreakdown === null ||
    race.raceTimeBreakdown === null ||
    race.final3FBreakdown.courseBaselineSeconds === null ||
    !race.weightBreakdown.isReliable
  );
}

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
                    <span className="race-name">
                      {race.raceName}
                      {hasProvisionalScore(race) && (
                        <span className="provisional-badge" title="内訳の一部にfallback／仮baseline由来の暫定値を含む">
                          暫定含む
                        </span>
                      )}
                    </span>
                    <span className="race-score">{race.raceScore.toFixed(1)}</span>
                    <span className="expand-caret">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && (
                    <div className="race-breakdown">
                      <div className="breakdown-row">
                        <span>
                          実質メンバーレベル
                          {!race.memberLevelBreakdown && <span className="provisional-tag">【暫定】</span>}
                        </span>
                        <span>{race.memberLevelScoreAtRace.toFixed(1)}</span>
                      </div>
                      {race.memberLevelBreakdown ? (
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
                      ) : (
                        <div className="member-level-sub-breakdown">
                          <div className="breakdown-row sub-row">
                            <span>
                              【暫定】参照可能な出走馬のabilityBeforeRace（過去走データ）が無いため、
                              中立値にフォールバック
                            </span>
                            <span></span>
                          </div>
                        </div>
                      )}
                      <div className="breakdown-row">
                        <span>タイム差</span>
                        <span>{race.timeGapScore.toFixed(1)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>
                          走破タイム
                          {!race.raceTimeBreakdown && <span className="provisional-tag">【暫定】</span>}
                        </span>
                        <span>{race.raceTimeScore.toFixed(1)}</span>
                      </div>
                      {race.raceTimeBreakdown ? (
                        <div className="member-level-sub-breakdown">
                          <div className="breakdown-row sub-row">
                            <span>5年基準タイム</span>
                            <span>{formatRaceTimeSeconds(race.raceTimeBreakdown.baselineTimeSeconds)}</span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>実走破タイム</span>
                            <span>{formatRaceTimeSeconds(race.raceTimeBreakdown.actualTimeSeconds)}</span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>基準との差</span>
                            <span>
                              {race.raceTimeBreakdown.baseDiffSeconds >= 0 ? "+" : ""}
                              {race.raceTimeBreakdown.baseDiffSeconds.toFixed(1)}秒
                            </span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>
                              当日馬場補正
                              {!race.raceTimeBreakdown.trackAdjustment.isReliable && "（サンプル不足）"}
                            </span>
                            <span>
                              {race.raceTimeBreakdown.trackAdjustment.adjustmentSeconds >= 0 ? "+" : ""}
                              {race.raceTimeBreakdown.trackAdjustment.adjustmentSeconds.toFixed(1)}秒
                            </span>
                          </div>
                          <div className="breakdown-row sub-row">
                            <span>補正後タイム価値</span>
                            <span>
                              {race.raceTimeBreakdown.trackAdjustedDiffSeconds >= 0 ? "+" : ""}
                              {race.raceTimeBreakdown.trackAdjustedDiffSeconds.toFixed(1)}秒
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="member-level-sub-breakdown">
                          <div className="breakdown-row sub-row">
                            <span>【暫定】この条件（競馬場×surface×距離×馬場状態）の5年基準タイムが無いため、中立値(70点)にフォールバック</span>
                            <span></span>
                          </div>
                        </div>
                      )}
                      <div className="breakdown-row">
                        <span>
                          上がり3F
                          {race.final3FBreakdown.courseBaselineSeconds === null && (
                            <span className="provisional-tag">【暫定】</span>
                          )}
                        </span>
                        <span>{race.final3FScore.toFixed(1)}</span>
                      </div>
                      <div className="member-level-sub-breakdown">
                        <div className="breakdown-row sub-row">
                          <span>実上がり</span>
                          <span>{race.final3FBreakdown.horseFinal3FSeconds.toFixed(1)}</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>レース上がり中央値</span>
                          <span>{race.final3FBreakdown.raceFinal3FMedianSeconds.toFixed(1)}</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>レース平均との差</span>
                          <span>
                            {race.final3FBreakdown.relativeDiffSeconds >= 0 ? "+" : ""}
                            {race.final3FBreakdown.relativeDiffSeconds.toFixed(1)}秒
                          </span>
                        </div>
                        {race.final3FBreakdown.courseBaselineSeconds !== null ? (
                          <>
                            <div className="breakdown-row sub-row">
                              <span>5年同条件上がり基準</span>
                              <span>{race.final3FBreakdown.courseBaselineSeconds.toFixed(1)}</span>
                            </div>
                            <div className="breakdown-row sub-row">
                              <span>
                                当日上がり補正
                                {race.final3FBreakdown.trackAdjustment &&
                                  !race.final3FBreakdown.trackAdjustment.isReliable &&
                                  "（サンプル不足）"}
                              </span>
                              <span>
                                {(race.final3FBreakdown.trackAdjustment?.adjustmentSeconds ?? 0) >= 0 ? "+" : ""}
                                {(race.final3FBreakdown.trackAdjustment?.adjustmentSeconds ?? 0).toFixed(1)}秒
                              </span>
                            </div>
                            <div className="breakdown-row sub-row">
                              <span>補正後上がり価値</span>
                              <span>
                                {(race.final3FBreakdown.absoluteDiffSeconds ?? 0) >= 0 ? "+" : ""}
                                {(race.final3FBreakdown.absoluteDiffSeconds ?? 0).toFixed(1)}秒
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="breakdown-row sub-row">
                            <span>【暫定】5年基準データなし（レース内相対評価100%で算出）</span>
                            <span></span>
                          </div>
                        )}
                      </div>
                      <div className="breakdown-row">
                        <span>
                          斤量補正
                          {!race.weightBreakdown.isReliable && <span className="provisional-tag">【暫定】</span>}
                        </span>
                        <span>{race.weightScore.toFixed(1)}</span>
                      </div>
                      <div className="member-level-sub-breakdown">
                        <div className="breakdown-row sub-row">
                          <span>実斤量</span>
                          <span>{race.weightBreakdown.horseCarriedWeightKg.toFixed(1)}kg</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>レース斤量中央値</span>
                          <span>{race.weightBreakdown.raceMedianWeightKg.toFixed(1)}kg</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>斤量差</span>
                          <span>
                            {race.weightBreakdown.weightDiffKg >= 0 ? "+" : ""}
                            {race.weightBreakdown.weightDiffKg.toFixed(1)}kg
                          </span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>距離</span>
                          <span>{race.weightBreakdown.distance}m</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>1kgあたり秒換算</span>
                          <span>{race.weightBreakdown.secondsPerKg.toFixed(2)}秒</span>
                        </div>
                        <div className="breakdown-row sub-row">
                          <span>
                            斤量負荷換算
                            {!race.weightBreakdown.isReliable && "（サンプル不足）"}
                          </span>
                          <span>
                            {race.weightBreakdown.weightAdjustmentSeconds >= 0 ? "+" : ""}
                            {race.weightBreakdown.weightAdjustmentSeconds.toFixed(2)}秒
                          </span>
                        </div>
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

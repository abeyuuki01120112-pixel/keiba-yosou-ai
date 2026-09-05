# CHECKPOINT14A.1 — Legacy STEP5〜11 Compatibility Audit / Position Data Root Cause

監査のみ。**コード変更・data collection・CHECKPOINT14Bへの着手は一切行っていない。**
診断のため`grep`／`git`によるファイル・データ内容の直接確認のみ実施した（一時スクリプトの
作成・実行は無し）。

## 1. Legacy Asset Inventory

対象9ファイルはすべて実在し、すべて`docs/prediction-philosophy.md`が「実装対応」として
参照する「STEP」番号体系（STEP5〜STEP7）に属する。呼び出し元を実際にgrepで確認した結果、
**9ファイルすべてが、自分自身のテストファイル以外からは一切呼ばれていない**
（`predictionSnapshot.ts`は`computeFinalRaceAbility()`を意図的に呼ばない、とコード内に
明記。`App.tsx`からも到達不能）。

| Asset | 実装STEP | テスト | production callers（自ファイル・テスト以外） |
|---|---|---|---|
| runningStyle.ts | STEP5 | pass | finalRaceAbility.ts（同じSTEP5内部のみ） |
| passingPositionRunningStyle.ts | STEP5.1 | pass | finalRaceAbility.ts（同上） |
| predictedPace.ts | STEP5 | pass | finalRaceAbility.ts（同上） |
| paceScenarioFactor.ts | STEP5 | pass | finalRaceAbility.ts（同上） |
| trackBiasFactor.ts | STEP5 | pass | finalRaceAbility.ts（同上） |
| finalRaceAbility.ts | STEP5.1統合 | pass | **無し**（現行Pipelineから未呼び出し） |
| stabilityFactor.ts | STEP6 | pass | outcomeScore.ts（同STEP6内部のみ） |
| outcomeScore.ts | STEP6 | pass | **無し** |
| outcomeProbability.ts | STEP6 | pass | **無し** |

## 2. Asset Classification

| Asset | Classification | Reason |
|---|---|---|
| runningStyle.ts | **REUSE_WITH_CHANGES** | distribution形式・優先順位ロジック（manual>passingPosition>fallback）は現行思想と整合。final3Fプロキシのconfidence常時lowは妥当な安全設計。ただし「position variance」等の追加シグナルは未実装で、現行Contract拡張が要る |
| passingPositionRunningStyle.ts | **REUSE_WITH_CHANGES** | コーナー数可変への対応設計・isReliableガードは妥当。ただし`cornerPositions`のindexとコーナー番号の対応が未定義（CP14A既指摘）で、実データ投入前に仕様確定が必須 |
| predictedPace.ts | **REUSE_WITH_CHANGES** | 頭数構成ベースの相対判定（絶対秒未使用）は現行思想（odds/popularity不使用、course非依存）と整合。ただしpaceConfidence皆無・pacePressure（連続値）皆無で、Contract自体を拡張する必要がある |
| paceScenarioFactor.ts | **REBUILD** | ロジック自体（脚質×ペースの相性）は参考になるが、**finalRaceAbilityへの直接乗算補正（±5%）を無条件に行う設計**であり、CHECKPOINT14の「今回はPaceを当てられるか検証するだけで、Final Race Abilityへの加減点は作らない」という方針と正面から矛盾する。正式採用は不可、参考実装に留める |
| trackBiasFactor.ts | **DEFER** | CHECKPOINT15対象と明記されており、CHECKPOINT14では評価対象外。ただし監査は実施（9節） |
| finalRaceAbility.ts | **REBUILD** | 10節で詳述。Suitability V1呼び出し自体は正しいが、Pace/TrackBiasの±5%補正を無検証のままeffectiveAbilityへ直接掛け合わせる構造であり、現行の「Pace/Positionをまず独立検証する」方針と整合しない |
| stabilityFactor.ts | **KEEP** | 11節で詳述。baseAbility/confidenceとは明確に分離された設計で、現行思想と矛盾しない。ただし現状呼び出し元が無く、休眠状態 |
| outcomeScore.ts | **DEFER** | 12節・13節参照。ロジック自体は数式・制約とも明確だが、finalRaceAbility（STEP5経由）に依存するため、STEP5側の扱いが決まるまで評価を確定できない |
| outcomeProbability.ts | **DEFER** | 同上。Plackett-Luceモデル自体はodds/popularity不使用で健全だが、入力のfinalRaceAbilityが確定するまで正式評価を保留する |

## 3〜10. 1ファイルずつの詳細監査

### 3. runningStyle.ts（脚質・詳細監査）

| 項目 | 内容 |
|---|---|
| purpose | 馬の脚質（逃げ/先行/差し/追込）をdistribution形式で推定する |
| inputs | `recentRaces: RacePerformance[]`（直近最大5走、baseAbilityと同じ母集団） |
| outputs | `RunningStyleProfile`（distribution・sampleCount・confidence・source・reason・dominantStyle） |
| formula/rule | `closeness = tanh(avgRelativeDiff / FINAL3F_SCORE_SCALE)`（final3Fのレース内相対値の平均をtanh変換）→4分位への線形補間 |
| hard-coded constants | `RUNNING_STYLE_ANCHORS`（-1/-1/3/1/3/1の分割点）。final3FScore.tsの`FINAL3F_SCORE_SCALE`を流用 |
| dependent modules | `final3FScore.ts`（`FINAL3F_SCORE_SCALE`）、`raceScore.ts`（丸め） |
| data requirements | `final3FBreakdown.relativeDiffSeconds`（100%充足）。通過順位ではない |
| future leakage risk | 無し（`recentRaces`は呼び出し側が既にpredictionCutoffAtでフィルタ済みの前提。このファイル自体に日付フィルタは無い＝呼び出し側依存） |
| odds/popularity使用有無 | 無し |
| Base Abilityとの関係 | 参照するが変更しない。baseAbility算出には一切影響しない別レイヤー |
| Suitabilityとの関係 | 独立。混同無し |
| test coverage | `runningStyle.test.ts`、pass |
| 現在の呼び出し元 | `finalRaceAbility.ts`のみ |

**脚質の決め方（5節への回答）**: 「この馬は永久に差し馬」という固定ラベルには**なっていない**。
`recentRaces`（直近最大5走）から都度動的に再計算するdistribution形式であり、過去走が
変われば毎回再評価される。ただし現在唯一有効なシグナルはfinal3Fプロキシのみで、
「front tendency」「normalized position」「variance」は通過順位データが無いため未実装。
confidenceは実データ量に関わらず常に"low"に固定されている（プロキシ推定の限界を
正直に反映した設計であり、危険な過信ではない）。

### 4. predictedPace.ts（想定ペース・詳細監査）

| 項目 | 内容 |
|---|---|
| purpose | 出走メンバー構成から、レース全体のペース水準（slow/average/high）をルールベースで判定 |
| inputs | `fieldRunningStyleDistributions: RunningStyleDistribution[]`（出走予定馬全員のdistribution） |
| outputs | `PredictedPace`（level・nigeCandidateCount・senkoCandidateCount・fieldSize・reason） |
| formula/rule | 逃げ候補（dominantStyle="nige"）2頭以上→high／逃げ・先行候補ともに0頭→slow／それ以外→average |
| hard-coded constants | 「2頭以上」という閾値自体がコード内に固定（定数化されておらず、`if (nigeCandidateCount >= 2)`と直書き。他ファイルのような`export const`定数化はされていない） |
| dependent modules | `runningStyle.ts`（`dominantRunningStyle()`） |
| data requirements | `fieldRunningStyleDistributions`（=各馬のrunningStyle結果。実質final3Fプロキシに依存） |
| future leakage risk | 無し（現在レースの出走メンバー構成のみを見る。過去レースを参照しない） |
| odds/popularity使用有無 | 無し。course/distance/going/frame/fieldSizeも一切使用していない（distributionのみが入力） |
| Base Abilityとの関係 | 無関係（独立） |
| Suitabilityとの関係 | 無関係（独立） |
| test coverage | `predictedPace.test.ts`、pass |
| 現在の呼び出し元 | `finalRaceAbility.ts`のみ |

course/distance/going/frame/fieldSizeを一切入力していない点は、CHECKPOINT14Aで提示した
Contract案（course-aware設計）より単純。odds/popularity/jockey/pedigreeは一切使用していない
ことを確認した。

### 5. paceScenarioFactor.ts（ペース相性補正・詳細監査）

| 項目 | 内容 |
|---|---|
| purpose | 対象馬の脚質と想定ペースの「相性」を、100%中心の±5%補正として数値化する |
| inputs | `runningStyle: RunningStyleProfile`、`usedRunningStyleSource`、`predictedPace: PredictedPace` |
| outputs | `PaceScenarioFactor`（raw・adjusted・confidence・usedRunningStyleSource・predictedPace・reason） |
| formula/rule | `raw = 100 + 5 × paceLevelScore × runningStyleLeanScore`（±1×±1で最大±5）。confidenceに応じてshrinkTowardCenterで100%側へ縮小 |
| hard-coded constants | `PACE_SCENARIO_AMPLITUDE=5`、`PACE_SCENARIO_CLAMP_MIN/MAX=95/105`（コメントに「V1仮値」等の明記は無いが、`docs/prediction-philosophy.md`のTODO参照あり） |
| dependent modules | `runningStyle.ts`（leanScore）、`suitabilityConfidence.ts`（shrinkTowardCenter） |
| data requirements | runningStyle（4節経由でfinal3Fプロキシ）、predictedPace |
| future leakage risk | 無し（対象レース自身の情報を参照しない） |
| odds/popularity使用有無 | 無し |
| Base Abilityとの関係 | **書き換えない**（effectiveAbility確定後の追加乗算レイヤーとしてのみ作用、`finalRaceAbility.ts`側で使用） |
| Suitabilityとの関係 | 独立した別レイヤー（乗算の順序としてはSuitability適用後） |
| test coverage | `paceScenarioFactor.test.ts`、pass |
| 現在の呼び出し元 | `finalRaceAbility.ts`のみ |

**REBUILD判定の理由（8節）**: Pace PredictionとFinal Race Abilityへの補正が**分離されていない**
設計になっている。`paceScenarioFactor.ts`自体が「予測（ペース水準の判定）」と
「補正（能力値への乗算）」を1つの関数の中で同時に行っており、CHECKPOINT14の
「まずPaceを当てられるか検証する。今回は補正factorを正式採用しない」という方針に
合わせるには、予測部分（脚質×ペースの相性判定）と補正部分（±5%を実際に掛けるかどうか）を
明確に分離する再設計が必要。ロジックの数式自体（tanh・clamp・confidence縮小のパターン）は
本プロジェクトの他レイヤーと一貫しており、参考にはできる。

### 6. trackBiasFactor.ts（トラックバイアス・詳細監査、CHECKPOINT15対象・今回は監査のみ）

| 項目 | 内容 |
|---|---|
| purpose | 対象馬の脚質と人間入力のtrackBias観測（前有利/後有利）の相性を±5%補正として数値化 |
| inputs | `runningStyle`、`observation: TrackBiasObservation | null`、`usedSource` |
| formula/rule | paceScenarioFactor.tsと同型（`raw = 100 + 5 × biasScore × leanScore`） |
| 現在のbias定義 | `FrontBackBias`（front/neutral/closer）のみ実際に使用。`InsideOutsideBias`（inside/outside）は型に存在するが**枠番データが無いため未使用**（コメントに明記） |
| static course tendencyとの混同有無 | **無し**。`TrackBiasObservation`は「その日・その開催の観測」専用の型で、`courseKarte`（Static Course Profile）とは別の型・別のファイル。CHECKPOINT14A9節で確認した3層分離は、このファイルに関しては既に実現されている |
| データ入力元 | V1では人間入力（manual）のみ。自動計算（auto）は型上存在するが常にnull（未実装） |
| future leakage risk | `raceContextLeakageGuard.ts`（`isTrackBiasEligible()`）で厳密にガード済み。自己参照禁止・未来日付禁止・同日は自分より前のレース番号のみ許可 |

正式採用しない（今回の指示どおり）。監査のみ。

### 7. finalRaceAbility.ts（最重要監査対象）

| 項目 | 内容 |
|---|---|
| purpose | baseAbility→Suitability V1→effectiveAbility→（Pace×TrackBias）→finalRaceAbilityの統合オーケストレーター |
| inputs | `FinalRaceAbilityInput`（baseAbility・horseId・recentRaces・suitabilityTarget・gate・raceContextTarget・manualRunningStyle・fieldRunningStyleDistributions・manualTrackBias・autoTrackBias） |
| outputs | `FinalRaceAbilityResult`（baseAbility〜finalRaceAbilityまでの全中間値を保持） |
| formula/rule | `effectiveAbility = baseAbility × suitability.overallSuitabilityPercent / 100`（**現行のpredictionSnapshot.tsと全く同じ式**）→`finalRaceAbility = effectiveAbility × raceContext.value / 100` |
| dependent modules | `computeSuitabilityV1()`（**Suitability V1をそのまま正式呼び出し**、CHECKPOINT11.14で本番接続済みとコメントに明記） |
| future leakage risk | `priorRaces = recentRaces.filter(r => r.raceId !== raceContextTarget.raceId)`という自己参照除外の安全網あり |

**現在の正式構造との整合性チェック**:

| 懸念 | 判定 |
|---|---|
| Base Abilityを直接書き換えるか | **していない**。`input.baseAbility`をそのまま`result.baseAbility`として返すのみ |
| Suitabilityを無視するか | **していない**。`computeSuitabilityV1()`をそのまま呼び、`effectiveAbility`も現行と同一式 |
| 重複補正を行うか | **行っていない**。suitability適用は1回のみ |
| Pace/TrackBiasの扱い | **ここがREBUILD理由**。`raceContextFactor.value`（pace×trackBiasをclamp(90,110)したもの）を`effectiveAbility`へ**無条件に**乗算している。CHECKPOINT14が要求する「まずPace/Positionを独立検証してから、検証済みのものだけをFinal Race Abilityへ反映する」という段階的検証プロセスが無く、未検証のペース判定がそのまま能力値へ反映される構造になっている |

**結論**: `effectiveAbility`算出部分（baseAbility×suitability）は現行`predictionSnapshot.ts`と
完全に整合しており、この部分だけならKEEPできる。しかし`finalRaceAbility.ts`という1ファイルの
中でeffectiveAbility算出と「未検証のPace/TrackBias補正の適用」が一体化しているため、
ファイル全体としてはREBUILD（再設計してeffectiveAbility算出部分とPace/TrackBias適用部分を
分離する必要がある）と判定する。

### 8. stabilityFactor.ts（安定性・詳細監査）

| 項目 | 内容 |
|---|---|
| purpose | 直近成績の「安定性」（下方半偏差ベース）を0〜100点で評価する |
| formula | `raw = 70 - 25 × tanh(downsideSemiDeviation / 10)`。サンプル不足時はNEUTRAL(65)側へconfidence比例で縮小 |
| Evidence/Confidenceとの関係 | **`stabilityConfidence`は`baseConfidenceFromSampleCount()`（STEP4のconfidence判定を流用）で別フィールドとして返され、`stabilityFactor`（数値）自体には影響しない**。「サンプルが少ないから能力を下げる」という直接減点は行っていない。むしろサンプル不足時はNEUTRAL(65、CENTER=70よりやや低い中立値)側へ縮小するだけで、Evidence不足を数値へ混ぜ込んではいない |

**11節への回答**: Confidence/EvidenceとPerformance Adjustmentの混同は**無い**。CHECKPOINT13.4G
以降のShort Career Evidence（`abilityEvidence.ts`、「4走だから減点しない」という原則）と
設計思想が一致している。KEEP判定の根拠。

### 9. outcomeScore.ts / outcomeProbability.ts（詳細監査）

**outcomeScore**:
- 何をscore化しているか: `finalRaceAbility`を中心に、ライバルとのmargin・stabilityFactorを
  小さな補正として加えた「winScore/top2Score/top3Score」（各0〜100）。
- formula: `rawDelta = (finalRaceAbility - 70) + marginWeight×margin + stabilityWeight×stabilityDelta`
  → `CENTER(70) + AMPLITUDE(28) × tanh(rawDelta / SCALE(15))`。
- score range: 0〜100（clamp済み）。
- Final Race Abilityとの関係: 主要な入力。win/top2/top3で使うrivalの人数（0番目/1番目/2番目に
  強いライバル）とstability重み（0/0.2/0.35）が異なるのみで、finalRaceAbility自体を
  変更しない。

**outcomeProbability**:
- score→probability変換式: `strength_i = exp(finalRaceAbility_i / 10)`（Plackett-Luce）。
  outcomeScoreとは**完全に別の変換**（outcomeScoreの出力を入力に使わない）。
- softmax等の利用有無: 実質softmaxと同型（`s_i / Σs_j`）。
- 全馬win probability合計100%になるか: **なる**（逐次除外モデルの閉形式総和のため構造的に保証）。
  top2は200%、top3は300%が合計（1頭あたり複数のtopN枠を持つため）。
- calibration根拠: **無し**。`PLACKETT_LUCE_TEMPERATURE=10`は「将来バックテストで校正する前提の
  初期値」と明記されており、実データでの精度検証は行われていない。
- top2/top3の処理: 逐次除外モデル（1着→残りから2着→残りから3着）による厳密な閉形式計算。
  近似（win×2等）は使っていない。
- confidenceとの関係: `outcomeProbability.ts`自体にconfidence概念は無い。

## 10. Future Leakage / Odds Audit（9ファイル横断）

| ファイル | future leakage対策 | odds/popularity使用 |
|---|---|---|
| runningStyle.ts | 呼び出し側のrecentRacesフィルタに依存（自前対策なし） | 無し |
| passingPositionRunningStyle.ts | 同上 | 無し |
| predictedPace.ts | 現在レースの構成のみ参照、対策不要 | 無し |
| paceScenarioFactor.ts | 対象レース自身を参照しない | 無し |
| trackBiasFactor.ts | 呼び出し側（`resolveTrackBias`経由）で`raceContextLeakageGuard.ts`により厳密にガード | 無し |
| finalRaceAbility.ts | `priorRaces`の自己参照除外あり（安全網） | 無し |
| stabilityFactor.ts | 呼び出し側のrecentRacesフィルタに依存 | 無し |
| outcomeScore.ts | 現在レースのメンバー構成のみ参照 | 無し |
| outcomeProbability.ts | 同上 | 無し |

**9ファイル全てでodds/popularity/jockey/trainer/pedigree/馬体重の使用は無い**ことを確認した。
future leakageについては、`trackBiasFactor.ts`（`raceContextLeakageGuard.ts`経由）と
`finalRaceAbility.ts`（自己参照除外）が明示的なガードを持つ一方、`runningStyle.ts`等の
他ファイルは「呼び出し側が既にフィルタ済みのrecentRacesを渡す」という前提に依存しており、
自前のガードは無い。現行`predictionSnapshot.ts`（`predictionCutoffAt`ベースのフィルタ）と
同じ前提に立てば問題ないが、これらのファイル単体では保証されない。

## 11. passingPosition / fieldSize 0% Root Cause

**単一の原因ではなく、少なくとも2つの異なる原因が混在している。** 推測せず、コード・データを
直接確認して特定した。

### passingPosition（通過順位）: 分類B「schemaはあるがCSV importerが取り込んでいない」

- `RacePerformance.passingPosition`（型）は存在する。
- しかし`src/ability/import/buildImportResult.ts`の`toRaceHistoryRawInput()`（CSV→ability計算用
  オブジェクトへの変換関数）を確認したところ、**gate/horseNumber/fieldSize/source等はすべて
  明示的にマッピングされているが、`passingPosition`は一切参照されていない**。
- `src/ability/import/normalize.ts`（CSV各列の読み取り）にも`passingPosition`列を読む処理は無い。
- つまり、たとえ将来CSVに`passingPosition`列を追加しても、現在のimportコードは**その列を
  読み飛ばし、常に未設定のまま**になる。schemaはRacePerformance型にはあるが、
  import経路には無い、という「分類B」に該当する。

### fieldSize（過去走の出走頭数）: 分類C「CSV columnはあるが現在のdata packageに値が無い」
### **に加えて、分類A〜Eのいずれにも明確に当てはまらない分類E「その他」の原因が実際に存在する**

- `race-performances.csv`のテンプレート・`normalize.ts`・`buildImportResult.ts`はいずれも
  `fieldSize`を正しく読み取り・マッピングしている（コード上の欠陥は無い）。
- `src/ability/data/import/samples/`配下の28件のサンプルCSVのうち3件
  （`takarazuka_kinen_2026_18horses.csv`／`batch9_arima_nikkei/arima_kinen_2025_full_field_verified.csv`／
  `batch9_arima_nikkei/nikkei_sho_2026_full_field_verified.csv`）を直接確認したところ、
  **`fieldSize`列に実際の出走頭数（18・16・15）が正しく入っている**ことを確認した。
- しかし、これらのCSVに含まれる馬（例: メイショウタバル horseId `2021103272`、
  ミュージアムマイル horseId `2022105081`）の`data/horses/<horseId>.json`を直接確認したところ、
  **該当raceIdのエントリにgate/horseNumber/fieldSize/source等のフィールドが一切無い
  （最も古い・素のスキーマのまま）**ことを確認した。
- **原因を特定した**: `scripts/importRacePerformancesCsv.ts`が使う
  `src/ability/import/mergeHorseHistory.ts`の`mergeHorseRaceHistory()`は、既存raceIdと
  新規raceIdが**1件でもフィールド差分を持つ場合、無条件にconflictとして扱い、
  その馬のファイル全体への書き込みをスキップする**設計になっている
  （`docs/checkpoint13-4a-data-package-contract.md`にも「conflictが1件でもあればその馬の
  ファイルは書き込まれない」と明記済み。CHECKPOINT13.2で意図的に導入された「silent overwrite
  禁止」の安全機構）。
- これは意図的な安全設計だが、**副作用として「後から素の記録より情報が豊富なCSVを再投入しても、
  既存raceIdと1項目でも食い違えばconflict扱いになり、豊富な情報が反映されない」**という
  結果を招いている。少なくとも上記2頭では、この結果として`fieldSize`を含む豊富な情報が
  disk上へ到達していないことを直接確認した（有馬記念2025・宝塚記念2026の各1頭で確認、
  日経賞2026については該当horseIdのファイル自体が見当たらず今回は未確認）。
- **したがって、fieldSize 0%は「分類C（データが元から無かった）」と
  「分類E・その他（データはCSVに存在したが、merge conflict回避の安全機構により書き込みが
  スキップされ、豊富な情報が反映されないまま残った）」の両方が混在している。** 全891件のうち
  どこまでが分類C・分類Eかは、本ラウンドでは全件個別確認していない（推測しない）。

## 12. Current Data Counts

`data/horses/`全447ファイルを対象に、`grep`で直接カウントした（実測値）。

| 項目 | 件数 |
|---|---|
| total race entries | 891 |
| passingPosition populated count | 0 |
| fieldSize populated count | 0 |
| both（passingPosition かつ fieldSize）populated count | 0 |
| gate populated count | 705（79.1%） |
| horseNumber populated count | 705（79.1%） |
| dataKind present count（CHECKPOINT13.2以降の取り込み） | 780（87.6%） |

## 13. Import Contract Compatibility

- `docs/data-input-guide.md`は`raceNumber, gate, horseNumber, fieldSize`を
  「参考列（保持のみ、計算には使わない）」として既に明記済み。**`passingPosition`は
  ドキュメントにも一切記載が無い。**
- `race-performances.csv`テンプレートのヘッダに`fieldSize`列は存在するが`passingPosition`列は
  存在しない。
- `import:csv`（`buildImportResult.ts`）は`fieldSize`を正しく保持可能（11節参照）。
  `passingPosition`は保持経路が無い（同上）。
- `scripts/validateAbilityData.mjs`（CHECKPOINT12.6）は`fieldSize`を既に検証ロジックの一部
  （horseNumber>fieldSizeの矛盾検知、実ロード頭数との比較）に使っており、
  データが投入されれば即座に活用可能な状態。

## 14. Minimum Position Profile Data Contract

Position/Pace Profile V1（予測ではなくProfile）に最低限必要なfieldを評価した。

| フィールド | 必要性 | 現状 |
|---|---|---|
| passingPosition | **必須**（Position Profileの主データ） | 0% |
| fieldSize（過去走） | **必須**（相対位置の正規化に必要） | 0%（一部はmerge conflictで滞留） |
| distance / racecourse / surface / going | 参考（コース別の傾向分離に有用だが必須ではない） | 100% |
| raceDate | 必須（future leakage判定・時系列順序に必須、既存の全計算で使用中） | 100% |

## 15. Minimum Historical Data Requirement

いきなり全JRA過去10年等は要求しない。最初の検証に必要な最小規模として、以下を提案する
（根拠付き）:

- **horses**: 10〜20頭程度。Base Ability V1のシェイクユアハート1頭検証（CHECKPOINT5）や
  Gate HorseEvidence実証（CHECKPOINT12.3、実馬3頭で開始）等、本プロジェクトはこれまでも
  「少数の実馬で経路を実証してから広げる」進め方を一貫して取ってきた。同じ規律を踏襲する。
- **races**: 各馬5走前後（既存のRECENT_RACE_COUNTと同じ窓）。
- **race entries**: 概算50〜100件程度。`passingPositionRunningStyle.ts`の
  `classifyRunningStyleFromPositions()`を実データで初めて検証するには、2コーナー・4コーナー
  双方のコース、逃げ・先行・差し・追込それぞれに該当しそうな馬を最低数件ずつ含めることが
  望ましい。

## 16. 新潟記念11頭 Data Requirement

Base Ability用データと同様、必要最小限で始める方針を提案する。11頭全馬・全過去走を
いきなり要求せず、まず**11頭それぞれの直近1〜2走分**のpassingPosition・fieldSizeから
開始することを提案する（CHECKPOINT14Aの16節で確認済みの、各馬の直近5走の一覧を土台に、
最も新しい1〜2走のみを対象にする）。全馬・全5走を要求すると合計最大55走分のデータ収集に
なり、「いきなり大量データを要求しない」という指示に反する。

## 17. Recommended Reuse Architecture

チェックポイント23節の案を踏まえ、以下の境界を提案する（実装はしない、案の提示のみ）。

```
Historical Data（passingPosition・fieldSize、投入後）
        ↓
Position Profile（runningStyle.ts／passingPositionRunningStyle.tsを土台に拡張。
                  REUSE_WITH_CHANGES。confidence契約を新設）
        ↓
Current Race Field Composition
        ↓
Pace Prediction（predictedPace.tsを土台に拡張。REUSE_WITH_CHANGES。
                 paceConfidence/pacePressureを新設）
        ↓
Position Prediction（新設。band出力・course-aware設計）
        ↓
   [ここで一旦停止・独立検証]
        ↓ 検証済みの範囲のみ、将来のCHECKPOINTで
Final Race Ability（現行のeffectiveAbility算出＝predictionSnapshot.tsの式のみを正式採用。
                    paceScenarioFactor.ts/trackBiasFactor.tsの±5%補正は
                    REBUILD/DEFERのため、この段階では一切適用しない）
```

`finalRaceAbility.ts`／`paceScenarioFactor.ts`／`trackBiasFactor.ts`を土台にする場合も、
**Pace/Position Predictionの「予測」部分と、能力値への「補正適用」部分を必ず別ファイル・
別関数に分離**し、予測精度が検証されるまで補正適用部分を呼び出さない設計にすることを推奨する。

## 18. Revised CHECKPOINT14 Roadmap

CHECKPOINT14A末尾で提示した案を、本ラウンドの発見（legacy資産の分類）を踏まえて更新する。

```
14A    Contract / Data Audit                          完了
14A.1  Legacy STEP5〜11 Audit / Position Data Root Cause 完了（本ラウンド）
14A.2（追加提案） 上記分類（KEEP/REUSE_WITH_CHANGES/REBUILD/DEFER）を
                  ChatGPTと確認し、再利用方針を正式決定（実装なし）
14B    Position Profile V1
       （passingPositionRunningStyle.ts等をREUSE_WITH_CHANGESの方針で拡張。
        まず16節の新潟記念11頭・直近1〜2走の最小データで実証）
14C    Race Pace V1
       （predictedPace.tsをREUSE_WITH_CHANGESの方針で拡張。paceConfidence新設）
14D    Position Prediction V1（band出力・course-aware設計の新規実装）
14E    Historical Reproducibility Test（raceResultTypes.tsの活用検討含む）
14F    Niigata Kinen Formal Prediction（正式枠順確定後）
```

14A.2を挟む理由: 本ラウンドの分類（KEEP/REUSE_WITH_CHANGES/REBUILD/DEFER）はあくまで
監査結果の提示であり、正式な採否決定ではない。特に`finalRaceAbility.ts`／
`paceScenarioFactor.ts`のREBUILD判定・`outcomeScore.ts`等のDEFER判定は、
ChatGPT側の確認を経ずに14Bへ進むべきではない。

## 19. 判定

**B-BOTH（B-REFACTOR かつ B-DATA、両方該当）。**

無理にA判定しない理由:
- **B-REFACTOR側**: `finalRaceAbility.ts`・`paceScenarioFactor.ts`はREBUILD判定であり、
  「予測」と「能力値への補正適用」が分離されていないため、そのままでは正式Contractに
  適合しない。再設計（少なくとも関数分離）が必要。
- **B-DATA側**: passingPosition・fieldSizeとも実データが極めて乏しい（0%、一部はmerge
  conflictで滞留）。Position Profile V1着手には最低限のデータ投入が先に必要。

一方、`runningStyle.ts`・`passingPositionRunningStyle.ts`・`predictedPace.ts`・
`stabilityFactor.ts`はREUSE_WITH_CHANGESまたはKEEPであり、「旧STEP資産は正式予想には
不適切」というC判定にするほど悲観的な状況ではない。特にfieldSize問題の一部（分類E）は
「データが存在しない」のではなく「存在するのに安全機構が原因で反映されていない」という、
新規データ収集より先に着手できる可能性のある論点であることが分かった点は、
B-DATAの深刻度を多少和らげる材料になる。

## 20. 次にChatGPTと決める必要がある項目（優先順位順）

1. **【最優先】4分類（KEEP/REUSE_WITH_CHANGES/REBUILD/DEFER）の承認**。
   特に`finalRaceAbility.ts`・`paceScenarioFactor.ts`のREBUILD判定に同意するか。
2. **mergeHorseRaceHistory()のconflict-skip設計をどう扱うか**: 11節で発見した
   「新しく豊富な情報を持つCSVが再投入されても、既存raceIdとの差分がconflict扱いになり
   反映されない」という副作用について、(a) 現状の安全設計を維持し、conflict発生時は
   人間が個別に確認・上書き判断する運用にする、(b) 特定フィールド（gate/horseNumber/
   fieldSize等、能力計算に使わない参考列に限る）だけは自動的にenrichできる例外を設ける、
   のいずれの方針にするか。**これはコード変更を伴う判断のため、今回は決定のみ、実装しない。**
3. **`cornerPositions`配列のindexとコーナー番号の対応関係**（CHECKPOINT14Aから持ち越し）。
4. **Position Profile V1着手時の最小データ範囲**: 15節・16節の提案（新潟記念11頭の
   直近1〜2走）で良いか。
5. **`outcomeScore.ts`／`outcomeProbability.ts`のDEFER判定の期限**: STEP5側（Pace/Position）の
   扱いが確定するまで保留で良いか、それとも並行して評価を進めるか。

以上、CHECKPOINT14A.1完了。CHECKPOINT14B・コード変更・data collectionへは進まず、
ここでSTOPする。

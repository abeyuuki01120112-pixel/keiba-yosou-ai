# Gate 30レース拡張研究 v3設計 — 新潟記念由来の5仮説を検証データセット化する

**作成日**: 2026-09-02
**位置づけ**: `docs/checkpoint14d1e-niigata-gate-30race-expansion-contract.md`
（v2、既存10レース＋新規20レース＝30レースのSelection Rule・CSVスキーマ・
Isolation Architectureを正式決定）の**拡張版（v3）**。v2で決定した内容は
すべて維持し、`docs/2026-niigata-kinen-stage-a-internal-decomposition.md`
（本日完了）で発見された5つの仮説を、Gate 30研究の正式な検証項目として
追加する設計を行う。

**今回のスコープ（明示）**: **設計のみ。実行しない。**
- 30レースの収集・Import・実行はまだ行わない。
- production コード・パラメータ・既存スコアリングロジック（Base Ability V1・
  Suitability V1・`PLACKETT_LUCE_TEMPERATURE`・`paceScenarioFactor.ts`・
  `trackBiasFactor.ts`のいずれの重み・定数も）は一切変更しない。
- 新しい係数・component・自動検出パイプラインは実装しない。
- 「1kg=◯点」のような新規換算式は作らない。
- 本ラウンドはドキュメント作成のみ。`git status --short`で
  コード・データファイルの変更が無いことを最後に確認する。

---

## 0. 全体方針

v2（既存10レース＋新規20レース、CSVスキーマ、Isolation Architecture＝
`data/gateValidation/`配下からのみ読み込み、production `data/horses/`へは
importしない）はそのまま維持する。本v3は**v2に4つの追加データセットと
1つの派生生成物群を積み増す差分設計**であり、v2の既存契約を書き換えない。

対象仮説とv2既存項目の対応表:

| # | 仮説（このラウンドの由来） | 必要な追加データ | 既存v2データで足りるか |
|---|---|---|---|
| 1 | Suitability Evidence Double Counting監査 | なし（既存CSVで足りる） | 足りる（派生生成物で対応） |
| 2 | finalRaceAbility Score Spacing検証 | なし（既存CSVで足りる） | 足りる（派生生成物で対応） |
| 3 | Stage A過小評価型（展開利）の検証 | 一部追加（公式ペース評（S/M/H等）） | 一部不足 |
| 4 | 斤量研究 | 追加（年齢・性別） | 不足 |
| 5 | Stage B / Track Bias自動推定の可能性研究 | 追加（同日・前日の他レース集計） | 不足 |
| ＋ | Base Ability再現性検証 | なし | 足りる |
| ＋ | 勝率Calibration用データ保存 | 追加（オッズ・実勝敗） | 不足 |

---

## 1. Gate 30で保存する項目（データスキーマ）

### 1-1. 既存v2スキーマ（据え置き、変更なし）

`race_gate_history.csv`（24列）・`runner_prior_history.csv`（21列）・
`PACKAGE_MANIFEST.json`・`SOURCE_MANIFEST.csv`・`README.md`・
`CHECKSUMS.sha256`は`docs/checkpoint14d1e-niigata-gate-30race-expansion-contract.md`
6節・8節・14節の定義のまま**一切変更しない**。Selection Rule（3節、
既知馬重複数タイブレーク）・Future Leakage Rule（10節、Gate Raceごとの
個別cutoff）も変更しない。

### 1-2. 新規追加CSV（4種類）

#### (A) `runner_demographics.csv` — 年齢・性別（仮説4：斤量研究用）

現行コードベースには年齢・性別を保持するフィールドが一切存在しない
（`horseId`先頭4桁が生年を非公式に示唆する可能性はあるが、確認された契約ではない）。
斤量研究には年齢・性別が必須のため、**実データソース（JRA公式レース結果・
競馬新聞等の実在情報）から新規収集する。horseIdからの逆算・推測は禁止。**

```
raceId,horseId,horseName,sex,ageAtRace,source,sourceRaceId
```

| フィールド | 型 | 必須/任意 | 備考 |
|---|---|---|---|
| raceId | string | 必須 | 既存Gate Race raceIdと一致させる |
| horseId | string | 必須 | production canonical horseId（既存契約と同一） |
| sex | enum(牡/牝/せん) | 必須 | 実データのみ。不明な場合は空欄（推測禁止） |
| ageAtRace | integer | 必須 | 実データのみ。不明な場合は空欄（horseId逆算禁止） |
| source | string | 必須 | 出典URL |
| sourceRaceId | string | 任意 | 出典側のレースID |

#### (B) `race_pace_commentary.csv` — 公式ペース評（仮説3：展開利検証用）

JRA公式のラップタイムは既に`raceLapData.json`（CHECKPOINT14C系列、
既存Isolation Pattern）で個別収集された実績があるが、**「S/M/H」等の
定性的なペース評は、実測ラップから機械的に導出できる既存関数が無い**
（`predictedPace.ts`は事前予測用であり、レース後の実際のペース評価をする
関数ではない）。したがって、**実際にJRA公式または信頼できる媒体が
明記した公式ペース評があれば、それをそのまま記録する（推測・独自判定は禁止）。**

```
raceId,officialPaceRating,officialPaceRatingSource,lapDataAvailable,lapDataRaceId
```

| フィールド | 型 | 必須/任意 | 備考 |
|---|---|---|---|
| raceId | string | 必須 | |
| officialPaceRating | enum(S/M/H) or 空欄 | 任意 | 公式評が見つからない場合は空欄（NOT_AVAILABLE、推測しない） |
| officialPaceRatingSource | string | 任意 | 出典URL。空欄の場合は理由（"未公表"等）を`README.md`に記載 |
| lapDataAvailable | boolean | 必須 | `raceLapData.json`（既存）にこのraceIdのラップが既にあるか |
| lapDataRaceId | string | 任意 | 既存`raceLapData.json`側のキーとの対応 |

#### (C) `track_bias_context.csv` — 同日・前日の他レース集計（仮説5：Track Bias研究用）

これはv2に存在しない**新規スコープ**（対象レース自身ではなく、
同競馬場・同開催の**他レース**の集計データ）。CHECKPOINT14D.4で
1レース分（赤倉特別）だけ人力診断した内容を、30レース分・機械的に記録
できる形に一般化する。

```
targetRaceId,contextRaceId,contextRaceDate,relativeTiming,winningRunningStyle,
winningGatePosition,winningGateZone,winnerLast3F,officialGoingAtContextRace,
courseVariantNote,source
```

| フィールド | 型 | 必須/任意 | 備考 |
|---|---|---|---|
| targetRaceId | string | 必須 | 対象Gate Raceのid |
| contextRaceId | string | 必須 | 参照する他レースのid（同競馬場） |
| contextRaceDate | date | 必須 | |
| relativeTiming | enum(same_day_earlier/previous_day) | 必須 | 対象レースとの時間関係。同日「後」のレースはfuture leakageのため収集しない |
| winningRunningStyle | enum(nige/senko/sashi/oikomi/不明) | 任意 | 実データから読み取れる場合のみ。判定不能なら空欄 |
| winningGatePosition | integer | 任意 | |
| winningGateZone | enum(inner/middle/outer) | 任意 | |
| winnerLast3F | number(seconds) | 任意 | |
| officialGoingAtContextRace | string | 任意 | |
| courseVariantNote | string | 任意 | コース替わり・開催週等の分かる情報があれば自由記述 |
| source | string | 必須 | |

**Future Leakage Rule拡張**: `relativeTiming=same_day_earlier`または
`previous_day`のみ収集可能。対象レースと同日でも**後**のレース、または
対象レースより後の日付のレースは一切収集しない（既存10節のルールをこの
新規データにも同じ思想で拡張適用）。

#### (D) `race_odds_result.csv` — オッズ・実勝敗（勝率Calibration用データ保存）

**重要な方針転換の明記**: v2（`docs/checkpoint14d1e-niigata-gate-30race-expansion-contract.md`
15節）の`DATA REQUEST MANIFEST`は`excludeFromRequest`に「オッズ・人気」を
明記していた。これは**Ability評価（Base Ability/Suitability/Stage B
Ranking）にオッズを混入させない**という目的のための除外であり、
今回のユーザー指示は「オッズをAbility評価に使う」ことではなく
「独立して保存し、Stage A/B完了後の**勝率Calibration検証専用**に
後で使う」ことを明示的に要求している。この用途はSTEP7以降の
"AI勝率とオッズを独立させた上でのEV比較"という既存原則
（`docs/prediction-philosophy.md`・CLAUDE.md絶対原則1）と矛盾しない。
**したがって、v2の除外方針を覆すのではなく、「Ability計算には使わない・
Calibration検証にのみ使う」という利用範囲を明示した上で、新規に収集する。**

```
raceId,horseId,winOddsType,winOdds,winOddsObservedAt,actualFinishPosition,actualWin,source
```

| フィールド | 型 | 必須/任意 | 備考 |
|---|---|---|---|
| raceId | string | 必須 | |
| horseId | string | 必須 | |
| winOddsType | enum(prediction_time/final) | 必須 | **新規追加（2026-09-03、ユーザー指示7節）。** どちらのスナップショットかを明示する。過去レースで発走前スナップショットが確認できない場合、`final`のみ収集し`prediction_time`は行ごと省略する（後述の代替禁止ルール参照）。 |
| winOdds | number | 必須 | winOddsTypeに対応する単勝オッズ値 |
| winOddsObservedAt | string | 必須 | 取得時刻（`winOddsType=final`の場合は確定時刻、`prediction_time`の場合はその時点のタイムスタンプ） |
| actualFinishPosition | integer | 必須 | 既存`race_gate_history.csv`のfinishPositionと重複するが、Calibration専用ファイル単体で完結させるため冗長に持つ |
| actualWin | boolean | 必須 | actualFinishPosition===1 |
| source | string | 必須 | |

**予測時点オッズと確定オッズの分離ルール（絶対厳守、2026-09-03ユーザー指示7節）**:

- 勝率Calibration検証で本来必要なのは「その予測時点で取得可能だったオッズ
  （`winOddsType=prediction_time`）」である。**過去レースでprediction-time
  オッズが取得できない場合、確定オッズ（`winOddsType=final`）を代替値として
  使用してはいけない。** その場合、そのレース・その馬の
  `prediction_time`行は作成せず、`missing`/`unavailable`として扱う
  （Calibration検証の対象からは除外、または明示的にlow-confidenceの
  参考値として扱う——係数化・穴埋めはしない）。
- 確定オッズ（`winOddsType=final`）は、**市場との参考比較専用**として
  別行（別レコード）で保存することは可能。ただし
  `prediction_time`オッズの代用として扱わない——2つのwinOddsTypeは
  常に明確に区別し、混同・合算しない。
- この区別は、将来の30レース実行ラウンドで`race_odds_result.csv`を
  本格収集する際（Phase 2）に適用する。今回（Phase 1）は本格収集を
  行っていないため、実データへの適用はまだ発生していない。

**Isolation要件（絶対厳守）**: `race_odds_result.csv`は
`data/gateValidation/`配下でも**さらに独立したサブディレクトリ**
（例: `data/gateValidation/calibration/`）に格納し、`niigataGateHistoryV1.ts`
や既存Suitability/Base Ability計算パイプラインの`import`グラフから
物理的に到達不能な場所に置く。将来のWin Probability Calibration V1検証
スクリプトのみがこのファイルを読み込む。

---

### 1-3. 派生生成物（スクリプトで生成、コード変更不要）

以下は**既存の凍結済み関数をそのまま呼び出す読み取り専用スクリプト**で
算出する（`scratch-stageA-decompose.ts`と同じ方式）。新規CSVの収集は
不要——1-1・1-2で集めたデータと既存productionコードの組み合わせのみで
生成できる。

| 生成物 | 使用する既存関数 | 説明 |
|---|---|---|
| `suitability_evidence_overlap_report` | `computeSuitabilityV1()`＋独自のevidence-race再構成ロジック（後述2-1） | 馬ごと・component間のevidence race重複検出 |
| `finalRaceAbility_spacing_report` | `calculateBaseAbility()`・`computeSuitabilityV1()`・（可能な範囲で）`computeFinalRaceAbility()` | 馬間点差 vs 実際の着差・タイム差の対応表 |
| `stageA_undervaluation_classification` | `runningStyleLeanScore()`・Stage A rank・実際の着順 | 「Stage A下位×実際上位」馬の展開要因切り分け |
| `weight_research_table` | 既存`carriedWeightKg`＋新規`runner_demographics.csv` | 斤量・年齢・性別と結果の記述的対応表（係数化なし） |
| `baseAbility_reproducibility_scorecard` | `calculateBaseAbility()` | 30レースでのBase Ability単体top3的中率等の記述統計 |
| `win_probability_calibration_dataset` | `computeOutcomeProbabilitiesRaw()`（Temperature=10固定、変更なし） | finalRaceAbility・AI勝率・オッズ・市場暗示確率・実勝敗の対応表（Calibration検証専用、Ability計算へは不接続） |

**重要な技術的制約の明記**: `SuitabilityComponentResultV1`（`suitabilityV1Types.ts`）
の`reason`文字列にはevidence元のraceIdが構造化フィールドとして含まれていない
（`horseEvidence.reason`は説明文のみ）。したがって「どのcomponentがどのraceIdを
根拠にしたか」を機械的に判定するには、**component内部のマッチング条件
（course: `racecourse`一致のみ／gate: `racecourse×surface×distance`完全一致／
distance: 距離バケット類似度）を、component関数と同じロジックで外側から
独立に再現し、対象馬の`recentRaces`に適用してevidence raceId集合を
再構成する**必要がある（今回のバレエマスター分析で実際に行った手法と同じ）。
これはコード変更ではなく、既存の公開されたマッチング条件を読み取り専用で
複製するスクリプトであり、production側の`suitabilityV1.ts`は一切変更しない。

---

## 2. 各仮説の評価方法

### 2-1. 【最優先1】Suitability Evidence Double Counting監査

**方法**:
1. Ability Controlled かつ Suitability評価対象（distance/course/going/gateの
   いずれか2つ以上がevaluated=trueになる馬）を30レース全体から抽出する。
2. 各馬について、component別に「evidenceとして使われたrace idの集合」を
   1-3節の方法で再構成する。
   - distance: `distanceSuitability.ts`の類似度判定条件（距離バケット等、
     既存ロジックをそのまま踏襲）に合致するrecentRaces。
   - course: `racecourse`一致のrecentRaces。
   - gate: `racecourse×surface×distance`完全一致のrecentRaces。
   - going: 対象レースのgoingが不明な場合は評価されない
     （production同様、`GOING_UNKNOWN_SENTINEL`を用いる。実際の
     historical goingを使う版は別途注記付きの反事実分析としてのみ実施し、
     デフォルトの評価には混ぜない——本ラウンドの稍重反事実分析と同じ
     取り扱い）。
3. 2つ以上のcomponentのevidence race集合に**共通のraceIdがある**馬を
   「double counting候補」として記録する。
4. 各double counting候補について、共通raceIdが**そのcomponentの唯一の
   根拠（n=1）かどうか**を区別する（n>=2の一部が重複しているだけの場合は
   影響が相対的に小さいため、別カテゴリとして記録する）。

**記録項目**: horseId, raceId(対象Gate Race), overlappingComponents（例:
"course,gate"）, overlappingEvidenceRaceId, eachComponentSampleCount,
eachComponentAdjustedPercent, overallSuitabilityPercent, 該当馬のStage A順位。

**成功/失敗判定基準**:
- **再現する**: n=1でのdouble countingパターン（バレエマスター型）が、
  対象30レース内の複数の異なる馬・異なるレースで独立に観測される場合。
  件数を実数のまま報告し、恣意的な閾値（%）は設けない
  （`docs/checkpoint14d1e-...`12節の既存方針＝閾値を新規発明しない、を踏襲）。
- **再現しない**: double counting候補がバレエマスター1件のみ、または
  ほぼ観測されない場合。
- **条件付きで再現する**: 特定の条件（例: courseとgateの両方が
  n=1・confidence=lowの場合に限られる、または特定の距離・開催時期に
  偏る）でのみ観測される場合。
- **データ不足**: Ability Controlled かつ Suitability 2component以上
  evaluatedの馬が少数（目安として個別解釈可能な件数に満たない場合。
  具体的な閾値は事前に固定せず、実際に集まった母数を明示した上で
  判断する）。

**明記**: 本仮説の検証結果からweight変更・component削除・統合を
**この段階では一切行わない**（ユーザー指示通り）。

---

### 2-2. 【優先2】finalRaceAbility Score Spacing検証

**方法**:
1. 30レースそれぞれについて、Ability Controlled な出走馬全頭の
   `effectiveAbility`（Stage A、既存関数）を算出する。Stage B相当の
   `paceScenarioFactor`／`trackBiasFactor`は、pace commentary
   （1-2(B)）・Track Bias context（1-2(C)）が揃った範囲でのみ
   `computeFinalRaceAbility()`を実行し、揃わない場合は
   `effectiveAbility`をそのまま代理指標として使う（Stage Bが未実装の
   レースが多いと想定されるため、両方のケースを区別して記録する）。
2. 各レース内で上位馬同士のペアごとに、点差（pt）・実際の着差
   （`finishPosition`差）・タイム差（`timeGapSeconds`、既存列）を
   記録する。
3. 対象馬自身の直近走raceScoreの変動幅（このラウンドで用いた方法と
   同一）も同時に記録し、「馬間点差 vs 自己変動幅」の比較を
   全30レース分について行う。

**記録項目**: raceId, horseIdペア, pointGap, finishPositionGap,
timeGapSecondsDiff, marginCategory(僅差/中差/大差——`timeGapSeconds`の
実測値をそのまま記載し、恣意的なカテゴリ境界は設けない。既存
`timeGapScore.ts`の連続変換とは別に、本検証では生の秒数のみを記録する）,
horseA自己変動幅, horseB自己変動幅。

**成功/失敗判定基準**:
- **再現する**: 僅差決着（`timeGapSeconds`が小さいレース）において、
  上位馬間の点差が両馬の自己変動幅の範囲内に収まるケースが、
  30レース中の僅差決着レースの大半で観測される場合。
- **再現しない**: 僅差決着でも点差が自己変動幅を明確に上回るケースが
  多い場合（＝点差が実際の着差と無関係に開いてしまっている可能性を示唆）。
- **条件付きで再現する**: baseAbilityのサンプル数（5走揃っているか
  どうか）によって傾向が変わる場合。
- **データ不足**: 僅差決着かつAbility Controlled多頭数のレースが
  少数の場合。

**明記**: 本検証は`docs/win-probability-calibration-v1-research.md`の
Plackett-Luce Temperature校正とは独立に扱う。本検証では勝率変換を
一切行わない（rawのeffectiveAbility/finalRaceAbilityの点差のみを見る）。

---

### 2-3. 【優先3】Stage A過小評価型（展開利）の検証

**方法**:
1. 30レースそれぞれについて、Stage A順位（Base Ability×Suitability、
   Stage B抜き）と実際の着順を比較し、「Stage A順位より実着順が
   明確に上」だった馬を抽出する（新潟記念のサヴォーナと同型のケース）。
2. 該当馬について、`runningStyleLeanScore()`（既存関数、変更なし）を
   対象レース以前の実績から算出し、脚質傾向を記録する。
3. 対象レースの`officialPaceRating`（1-2(B)、取得できた場合のみ）と
   該当馬の`passingPosition`（既存列）を突き合わせ、「その馬の脚質が
   その日のペースに対して有利だったと考えられるか」を記述的に分類する
   （逃げ／単騎逃げ／Sペース先行／ハイペース差し／位置取り利／前残り／
   差し決着——ユーザー指定の7分類をそのまま用いる。分類はレース展開の
   客観的記述に基づき、事後的な「勝ったから展開が良かった」という
   トートロジーにならないよう、公式ペース評・脚質傾向という独立変数の
   組み合わせのみで判定する）。
4. 該当馬について、Base Ability・Suitabilityそれぞれの値も同時に記録し、
   「展開要因だけで説明できるか」「Base Ability/Suitability自体が
   過小評価だった可能性があるか」を切り分ける（両方が併存するケースも
   正直に記録する）。

**成功/失敗判定基準**（Stage Aの誤差 vs Stage B未実装領域の切り分け）:
- 該当馬のBase Ability・Suitabilityが同型の他馬と比較して**明確に
  見劣りしない**（＝Stage A自体は大きく間違っていない）にもかかわらず
  実着順が良かった場合 → **Stage B未実装領域（展開）として説明可能**。
- 該当馬のBase Ability・Suitabilityが同型の他馬と比較して**明確に
  低い**（＝そもそもStage A自体が過小評価していた可能性がある）場合 →
  **Stage A誤差の候補**（ただし単独では断定せず、他のraceScore構成要素
  との照合を要する）。
- 両方の兆候が混在する場合 → **併存として記録**（無理にどちらかに
  分類しない）。
- 該当馬が少数、または`officialPaceRating`が取得できないレースが
  多い場合 → **データ不足**。

---

### 2-4. 【優先4】斤量研究（研究のみ・式は作らない）

**方法**:
1. `runner_demographics.csv`（年齢・性別、実データのみ）と既存
   `carriedWeightKg`を結合する。
2. 各レースについて、フィールド内の斤量分布（中央値・レンジ）を算出し、
   各馬の斤量と中央値との差分（既存`weightScore.ts`の「フィールド中央値
   相対」という発想を、今回の斤量＝当日条件版として再利用するが、
   計算式・スコア化は行わない——単なる記述統計としての差分値のみ）。
3. finalRaceAbility（またはeffectiveAbility）・実着順・着差と、
   斤量差・年齢・性別を並べた記述テーブルを作成する。

**成功/失敗判定基準**: この仮説には「再現する/しない」の二値判定を
適用しない（ユーザー指示により式化・係数化を禁止しているため、
仮説自体が「有意な傾向として記録に値するか」という記述的判断にとどまる）。
代わりに以下を報告する:
- 斤量差が大きいケース（何kg以上、という閾値は事前に固定せず、
  実際に収集されたデータの分布を見てから記述する）で、finalRaceAbility
  下位馬が上位馬に先着する頻度の**記述統計**（相関係数等の統計的推定は
  サンプル数が十分（目安として最低30〜50組以上のペア）でない限り
  行わない——中途半端なサンプル数での相関係数提示は「データで裏付けた
  ように見えて実際は根拠薄弱」という誤解を招くため）。
- 年齢・性別別の傾向があるかどうかの記述。
- 「Race Condition層として実装する根拠になり得るか」の考察のみ
  （実装しない）。

---

### 2-5. 【優先5】Stage B / Track Bias自動推定の可能性研究

**方法**:
1. `track_bias_context.csv`（同日・前日の他レース集計）を対象30レースの
   うち収集可能な範囲で作成する。
2. 各Gate Raceについて、同日・前日の他レースの「勝った馬の脚質」
   「勝った馬の枠位置（内/中/外）」「上がり3F」等の傾向と、
   Gate Race自身の実際の結果（脚質・枠位置別の着順傾向）を突き合わせる。
3. 現行`trackBias.ts`の`resolveTrackBias()`が受け付ける入力形状
   （`frontBackBias`／`insideOutsideBias`／`paceLevelObserved`／
   `timeLevelObserved`、CHECKPOINT14D.3のStage B Input Contract D節で
   既に定義済み）と、収集した`track_bias_context.csv`の情報が
   対応づけられるかを確認する。

**成功/失敗判定基準**（自動検出パイプラインの実装可否研究、実装自体は
しない）:
- **有望**: 同日・前日の他レース傾向とGate Race自身の結果傾向の間に、
  一貫した対応関係が複数レースで観測される場合（例: 前日の同競馬場で
  外枠有利だった開催では、対象Gate Raceでも外枠が優勢な傾向が見られる、
  等）。ただし「有望」は自動検出式の妥当性を保証するものではなく、
  次の設計フェーズで検討する価値がある、という位置づけにとどめる。
- **不明瞭**: 傾向が一貫しない、レースごとにバラバラな場合。
- **データ不足**: 同日・前日の他レースデータが十分に収集できなかった
  場合（新潟開催は他コースに比べ同日レース数が限られるため、
  この可能性は高いと想定される——事前に楽観視しない）。

**明記**: この仮説の結果をもって`autoTrackBias`の実装には**この
ラウンドでは着手しない**。あくまで「実装する価値があるかどうかの
一次調査」に位置づける。

---

### 2-6. 【Base Abilityについて】再現性検証

**方法**: 30レースそれぞれについて、Ability Controlled馬のみで
Base Ability（Suitability・Stage B抜き）単体の順位を算出し、
実際の上位3着馬のうちBase Ability上位3位以内に入っていた馬の数を
レースごとに記録する。

**評価**: 「的中率◯%以上で成功」という閾値は設けない
（既存12節の非magic-threshold方針を踏襲）。単純に度数分布として
報告し、「新潟記念で観測された再現性がどの程度一般的か」を
Ability Model V1変更の判断材料として今後ユーザー・ChatGPTと相談する
ための記述データとして提供するにとどめる。**この検証結果をもって
Base Ability V1の重みを変更することは、このラウンドでも将来のGate 30
実行ラウンドでも行わない**（既存重みは凍結のまま）。

---

### 2-7. 【勝率Calibrationについて】データ保存のみ

**方法**: `win_probability_calibration_dataset`として、30レース分の
（可能な範囲で）全出走馬について、finalRaceAbility（またはStage Aの
effectiveAbility代理）・`computeOutcomeProbabilitiesRaw()`（T=10固定、
既存関数そのまま）によるAI勝率・`race_odds_result.csv`の単勝オッズ・
市場暗示確率（=100/オッズ、オーバーラウンド未調整である旨を明記）・
実勝敗を1レコードにまとめて保存する。

**成功/失敗判定は本ラウンドでは行わない**。これは仮説検証ではなく、
将来`docs/win-probability-calibration-v1-research.md`で設計した
Log Loss/Brier Score評価に使うための**データ保存タスク**である。
Temperatureの変更・校正はこのラウンドでも将来のGate 30実行ラウンドでも
行わない。

---

## 3. コード変更なしで実施可能な範囲

- 1-3節の全ての派生生成物（Suitability evidence重複検出・score spacing
  比較・Stage A過小評価分類・斤量記述統計・Base Ability再現性・
  win probability calibrationデータ整形）は、**既存の凍結済み関数
  （`calculateBaseAbility`・`computeSuitabilityV1`・
  `runningStyleLeanScore`・`computeOutcomeProbabilitiesRaw`・
  `computeFinalRaceAbility`）をそのまま呼び出す読み取り専用スクリプトで
  実施可能。**
- Isolation Architecture（`data/gateValidation/`配下、production
  `data/horses/`への影響なし）は既存パターンをそのまま再利用できる。
- 2-1〜2-6の判定基準はすべて「記録・分類・記述統計」であり、新たな
  計算式・重み・component実装を伴わない。

## 4. 追加実装が必要になる範囲（このラウンドでは着手しない）

- `runner_demographics.csv`・`race_pace_commentary.csv`・
  `track_bias_context.csv`・`race_odds_result.csv`の**外部データ収集**
  自体（ChatGPT側での実施を想定、次節）。
- Suitability component評価関数から、evidence raceIdを構造化フィールドと
  して直接返す機能（現状`reason`文字列のみ）——今回は代わりに外部
  スクリプトでマッチング条件を独立再現する対応とし、production側の
  型・関数は変更しない。将来的にこれをコード側に正式実装するかどうかは
  別途相談事項とする（10節参照）。
- `autoTrackBias`検出パイプライン本体（2-5節はあくまで一次調査であり、
  実装はこのラウンドにも将来のGate 30実行ラウンドにも含まれない）。
- 斤量・年齢・性別をStage AまたはRace Condition層に組み込む実装
  （2-4節は記述研究のみ）。

---

## 5. Isolation / Future Leakage継続適用

- 新規4CSVもすべて`data/gateValidation/`配下（`race_odds_result.csv`は
  さらに`data/gateValidation/calibration/`のサブディレクトリ）に格納し、
  production `data/horses/`・既存Suitability/Base Ability計算パイプラインの
  importグラフから独立させる。
- `track_bias_context.csv`のFuture Leakage Ruleは1-2(C)で明記した通り、
  対象レースより後（同日でも後）のレースは収集しない。
- `race_pace_commentary.csv`・`runner_demographics.csv`・
  `race_odds_result.csv`はいずれも実データのみを収集し、不明な場合は
  空欄（NOT_AVAILABLE）とする。推測・補完は一切行わない。

---

## 6. 次にChatGPTへ依頼する内容（実行はまだしない）

本ラウンドはここまでの設計提示でSTOPする。次のターンでChatGPT側に
依頼する想定の作業（**Claude側はまだ着手しない**）:

1. v2で既に依頼済みの`race_gate_history.csv`（30レース分）・
   `runner_prior_history.csv`の収集を完了する（未完了の場合）。
2. 本v3で新規追加した4CSV（`runner_demographics.csv`・
   `race_pace_commentary.csv`・`track_bias_context.csv`・
   `race_odds_result.csv`）を、1-2節のスキーマに従って収集する。
   特に`track_bias_context.csv`は新潟の同日開催他レースという
   新しい収集対象のため、既存10レース分についても新規収集が必要になる
   点に注意。
3. 収集できなかった項目（年齢・性別が判明しない馬、公式ペース評が
   見当たらないレース等）は、無理に埋めず「不明」として提出する。
4. 新規4CSVを既存ZIP構成（`niigata_turf2000_gate_history_v2_30r.zip`）に
   追加する形（v3として`niigata_turf2000_gate_history_v3_30r.zip`に
   改称するか、既存ZIPへの追補とするかはChatGPT側の収集の都合に合わせて
   よい）で提出する。

---

## 7. 判定

**A-DESIGN-READY（設計完了、収集・実行は未着手）**

1〜2節でスキーマを確定し、2-1〜2-7節で各仮説の評価方法・判定基準を
定義し、3〜5節でコード変更の要否とIsolation継続を確認した。
30レースの収集・Import・スクリプト実行は次回以降に持ち越す。

---

## 8. Regression

本ラウンドはドキュメント作成のみ。`git status --short`で
コード・データファイルの変更が無いことを確認済み
（新規追加は本ファイルのみ）。`npm test`/`npm run lint`/`npm run build`/
`npm run validate:data`は前回コミット時点の結果（787/787テスト・
lint clean・build成功・validate:data検証成功、既存warningのみ）から
不変である。

---

以上、v3設計の提示でSTOPします。30レースの収集・実行、
Suitability component構造の変更、autoTrackBias実装、斤量の式化、
Base Ability/Suitability/Temperatureの変更は、いずれもこのラウンドでは
行っていません。

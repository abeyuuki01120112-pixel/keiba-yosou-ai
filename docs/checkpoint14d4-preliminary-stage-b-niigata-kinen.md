# CHECKPOINT 14D.4 — PRELIMINARY_STAGE_B Execution / 2026 新潟記念

CHECKPOINT14D.3の判定（A-STAGE-A-FROZEN-STAGE-B-READY）を受け、2026新潟記念
について初めてPRELIMINARY_STAGE_Bを実行した。**Formal Stage A（immutable
snapshot）は一切変更していない。** Base Ability・Suitability V1も無変更。
既存の検証済みコード（`finalRaceAbility.ts`のSTEP5オーケストレーター、
`racePacePrediction.ts`のRace Pace Prediction V1、`positionProfile.ts`の
Historical Position Profile V1）を実際に実行し、新規magic weightは一切
発明していない。Odds・Umapro・Probability・Monte Carloのいずれも使用して
いない。

---

## 1. External Input Integrity

添付`stage_b_preliminary_external_inputs_2026-08-29_1757.json`を読み込んだ。
`stageBUseRules`セクションで以下が明示されている:

```
stageAImmutable: true
officialGoingForTargetRace: null
targetRaceHorseWeights: null
targetDayTrackBias: null
weatherCanBeUsedAsForecastOnly: true
saturdayTrackEvidenceCanBeUsedAsDiagnosticPriorOnly: true
noMagicWeights: true
oddsExcluded: true
umaproExcluded: true
```

この制約をそのまま尊重した。天気予報・前日馬場実績はいずれも
**Diagnostic/forecastとしてのみ**扱い、officialGoing・馬体重・当日Track
Biasは`null`のまま（推測で埋めていない）。

---

## 2. Weather Snapshot

tenki.jp新潟市1時間天気（asOf 2026-08-29T17:00）と新潟競馬場向け予報を
そのまま転記する:

| 時刻 | 降水確率 | 降水量 | 気温 | 風向 | 風速 |
|---|---|---|---|---|---|
| 15時 | 60% | 2.0mm/h | 28.2℃ | 南西 | 5m/s |
| 16時 | 50% | 0.5mm/h | 28.9℃ | 南西 | 5m/s |
| 17時 | 50% | 0.6mm/h | 28.5℃ | 南西 | 4m/s |

新潟記念発走15:45を挟む時間帯。日別予報は「激しいにわか雨」（highC28/lowC24）。

**解釈**: `rainLikely=true`・`rainIntensityUncertain=true`（予報間で降雨強度に
差がある）。**「絶対に重馬場」「必ず大雨」とは断定しない**（添付ファイル
自身の`preliminaryInterpretation`をそのまま踏襲）。これは**forecastであり
observed actualではない**——4節の通りScoreには反映していない。

---

## 3. Saturday Track Snapshot（8/29実観測）

| 時刻 | レース | コース | 天候 | 馬場 |
|---|---|---|---|---|
| 10:45 | 3R | 芝1600m外 | 小雨 | 良 |
| 11:45 | 5R | 芝2200m | 小雨 | 稍重 |
| 15:10 | 7R（赤倉特別） | 芝2000m外 | 曇 | 稍重 |

**馬場が「良→稍重」へ変化する実観測**。8/28時点の公式情報（芝良、含水率
決勝線12.0%・4角10.7%）と比べ、8/29の降雨で悪化傾向にあることが実データ
から読み取れる。ただし**8/30 official goingはまだ未確定**（4節の通り
`officialGoing=null`のまま維持）。

---

## 4. Same-Course 赤倉特別 Diagnostic

2026-08-29 15:10、新潟芝2000m外・赤倉特別（対象の新潟記念と同一条件）。

```
winnerTime = 1:58.6　last3F = 34.5
lapSequence(sec) = 13.1-11.2-11.5-11.9-12.1-12.3-12.0-11.6-11.1-11.8

top3:
1着 通過4-4 上がり34.3
2着 通過1-1 上がり34.6
3着 通過11-11 上がり33.8
```

**前（1-1）・中団に近い前（4-4）・後方（11-11）の全てから上位馬が出ている。**
checkpoint本文7節の指示通り、これを単一のFRONT_BIAS/CLOSER_BIASへ固定せず、
**MIXED / INCONCLUSIVEをTrack Bias Diagnosticの基本値**とした（9節・
Track Bias Diagnostic参照）。既存コード（`trackBiasFactor.ts`/`trackBias.ts`）
にはこの1レースの実績から自動的にfrontBackBiasを分類する機能は無い
（auto観測は未実装、CHECKPOINT14D.3監査で確認済み）——「既存ロジックが
別の正式分類を返す」ケースには該当しなかったため、MIXED/INCONCLUSIVEの
まま維持した。

---

## 5. Pace Prediction（実コード再実行）

`racePacePrediction.ts`の`computeRacePacePrediction()`を、11頭の
Historical Position Profile V1（実データのみ、Pre-Frame）から実際に
再計算した:

```
continuousPacePressure = 2.75
frontPressure           = 0.65
expectedPaceClass        = average
paceConfidence           = high
frontRunnerCandidateCount= 0（representativeRunningStyle="nige"の馬は0頭）
likelyFrontGroup（寄与度降順）:
  ロデオドライブ・ドゥレッツァ・サヴォーナ・ダノンシーマ・
  ゾロアストロ・チェルヴィニア・ステレンボッシュ
warnings = []
```

**11頭中、逃げ最多想定馬は不在（representativeRunningStyle="nige"の馬0頭）**
——ロデオドライブがnige確率25%を持つが、代表スタイルはsenko（先行）。
継続値ベースの`continuousPacePressure`（前に行きたい馬の期待値合計）は
2.75で、フィールド全体としては「平均的なペース」に収まる。

**この結果はStage B Scoreへ直接接続しない**（`racePacePrediction.ts`
自身のdocstring「Pace PredictionはFinal Race Abilityへ一切接続しない」の
通り、Diagnostic表示専用）。実際にScoreへ接続されているのは、既存の
legacy`predictedPace.ts`（`classifyPredictedPace()`）経由の別系統である
（9節参照）。

---

## 6. Position Projection（実コード再実行）

`positionProfile.ts`の`computeHistoricalPositionProfile()`を11頭全馬で
実行した（Contract A＋B）。

| Horse | 代表脚質 | 分布(nige/senko/sashi/oikomi) | 前/中/後率 | earlyNormMean | positionStdDev | evidence数 | confidence |
|---|---|---|---|---|---|---|---|
| ダノンシーマ | sashi | 20/20/60/0 | 40/60/0 | 0.377 | 0.171 | 5 | high |
| ロデオドライブ | senko | 25/50/0/25 | 75/0/25 | 0.289 | 0.265 | 4 | high |
| ゾロアストロ | sashi | 20/0/40/40 | 20/40/40 | 0.546 | 0.212 | 5 | high |
| バレエマスター | oikomi | 0/0/20/80 | 0/20/80 | 0.800 | 0.149 | 5 | high |
| ジュンブロッサム | oikomi | 0/0/20/80 | 0/20/80 | 0.755 | 0.076 | 5 | high |
| ボーンディスウェイ | sashi | 0/0/80/20 | 0/80/20 | 0.620 | 0.130 | 5 | high |
| アーバンシック | sashi | 0/0/60/40 | 0/60/40 | 0.655 | 0.106 | 5 | high |
| サヴォーナ | sashi | 0/40/60/0 | 60/40/0 | 0.310 | 0.171 | 5 | high |
| ドゥレッツァ | senko | 0/60/40/0 | 80/20/0 | 0.382 | 0.147 | 5 | high |
| チェルヴィニア | sashi | 0/20/60/20 | 20/60/20 | 0.496 | 0.204 | 5 | high |
| ステレンボッシュ | sashi | 0/20/60/20 | 20/60/20 | 0.460 | 0.208 | 5 | high |

**単一脚質labelだけで判断しない**：`runningStyleDistribution`（確率分布）と
`earlyNormalizedPositionMean`（0=最前方〜1=最後方の連続値）を併記した。
全馬evidence 4〜5走、confidence=highと、evidence面では11頭全馬が
充実している。

---

## 7. Wet Evidence Audit（Diagnostic専用、Base Abilityへ混入禁止）

各馬の実production historyから、稍重・重・不良での実走を監査した
（`going`実データフィールドのみ、推測なし）:

| Horse | wetEvidenceCount | 内訳 |
|---|---|---|
| ボーンディスウェイ | 2 | 七夕賞(稍重)5着72.4／札幌記念(稍重)9着69.1 |
| サヴォーナ | 1 | 七夕賞(稍重)10着62.0 |
| ロデオドライブ | 1 | 2歳新馬(重)1着72.4 |
| ドゥレッツァ | 2 | 京都大賞典(稍重)8着71.4／宝塚記念(稍重)9着73.0 |
| ゾロアストロ | 0 | なし |
| チェルヴィニア | 0 | なし |
| ジュンブロッサム | 1 | ダービー卿CT(稍重)11着67.3 |
| ダノンシーマ | 0 | なし |
| アーバンシック | 2 | 宝塚記念(稍重)14着64.5／日経賞(稍重)3着74.6 |
| バレエマスター | 0 | なし |
| ステレンボッシュ | 2 | 中山牝馬S(稍重)7着71.6／札幌記念(稍重)15着59.2 |

**これはBase Abilityへ一切混ぜていない。** 正式Stage Bで数値反映できる
validated logic（雨補正式等）は現状repositoryに存在しないため、今回は
Diagnosticとして表示するのみに留めた。参考として、wet評価数が0の馬
（ゾロアストロ・チェルヴィニア・ダノンシーマ・バレエマスター）は、
湿った馬場での実績が無いため「向き不向き不明」という状態であり、
「湿った馬場に弱い」ことを意味しない。

---

## 8. Wind Diagnostic

**NOT_EVALUATED。** repository内にコース方向（course geometry、新潟芝
2000m外の直線・コーナー方位データ）が存在しないため、南西風5m/s予報が
向かい風・追い風・横風のいずれになるかを客観的に判定できない。推測での
判定はしていない。

---

## 9. Track Bias Diagnostic

**MIXED / INCONCLUSIVE（Score未反映）。** 4節の赤倉特別実績が根拠。
`trackBiasFactor.ts`のtrackBias観測は、無ければ無条件でneutral(100%,
confidence=low)を返す設計（既存コード、無変更）。今回は`manualTrackBias`
・`autoTrackBias`ともに`null`のまま`computeFinalRaceAbility()`を実行した
——これは「観測を無視した」のではなく、**「今回はまだ観測が無い」という
事実をそのままコードへ渡した結果**である。

---

## 10. Preliminary Stage B Board

`finalRaceAbility.ts`の`computeFinalRaceAbility()`を11頭全馬で実際に
実行した（`baseAbility`はFormal Stage A Snapshotの値をそのまま入力、
`manualRunningStyle=null`・`manualTrackBias=null`・`autoTrackBias=null`
——今回確定していない入力は全てnullのまま、推測で埋めていない）。

| Rank | Horse | Stage A | Preliminary Stage B | Rank変化 | Pace Fit | Confidence |
|---|---|---|---|---|---|---|
| 1 | ダノンシーマ | 80 | 80 | ±0 | average・factor100%（中立） | medium |
| 2 | ロデオドライブ | 77 | 77 | ±0 | average・factor100%（中立） | medium |
| 3 | ゾロアストロ | 74 | 74 | ±0 | average・factor100%（中立） | low |
| 4 | バレエマスター | 74 | 74 | ±0 | average・factor100%（中立） | low |
| 5 | ジュンブロッサム | 73 | 73 | ±0 | average・factor100%（中立） | low |
| 6 | ボーンディスウェイ | 73 | 73 | ±0 | average・factor100%（中立） | medium |
| 7 | アーバンシック | 72 | 72 | ±0 | average・factor100%（中立） | high |
| 8 | サヴォーナ | 70 | 70 | ±0 | average・factor100%（中立） | high |
| 9 | ドゥレッツァ | 70 | 70 | ±0 | average・factor100%（中立） | medium |
| 10 | チェルヴィニア | 70 | 70 | ±0 | average・factor100%（中立） | high |
| 11 | ステレンボッシュ | 68 | 68 | ±0 | average・factor100%（中立） | high |

**全11頭でPreliminary Stage B Score = Stage A Score、順位変化ゼロ。**
Weather/Wet/Wind/Track Biasは全てDiagnostic欄として別表示する
（12節参照）——「データは存在するがモデル未接続」（Weather・Wet）と
「データが存在しない」（Wind）を明確に区別した。

完全なmachine-readable版は`docs/checkpoint14d4-preliminary-stage-b-niigata-kinen.json`
に格納した。

---

## 11. Stage A → Stage B Changes（実コードによる正式説明）

**なぜ全11頭で変化がゼロなのか、正式componentだけで説明する:**

`raceContextFactor = paceScenarioFactor.adjusted × trackBiasFactor.adjusted / 100`
（`raceContextFactor.ts`、無変更）において:

1. **paceScenarioFactor = 100%（中立）**: 5節の通り`classifyPredictedPace()`
   （legacy、`finalRaceAbility.ts`が実際に接続している系統）が11頭の
   フィールド構成から`level="average"`と判定した。`paceScenarioFactor.ts`の
   計算式`raw = 100 + 5 × paceLevelScore × leanScore`において、
   `average`のPACE_LEVEL_SCOREは0のため、各馬の脚質傾向（leanScore）に
   関わらず**raw=100が数学的に一意に決まる**（脚質で有利不利が生まれる
   条件そのものが今回は成立していない）。
2. **trackBiasFactor = 100%（中立）**: 9節の通りtrackBias観測が無いため、
   既存コードの安全側デフォルトにより無条件で中立。

**両方が中立のため、raceContextFactor=100%となり、
`finalRaceAbility = effectiveAbility × 100/100 = effectiveAbility`
（Stage Aのeffective Abilityと完全一致）。** これは「計算していない」
のではなく、「計算した結果、今回のフィールド構成・現時点の観測状況では
補正要因が働かない」という、実コード実行に基づく正当な結論である。
**説明できない順位変更は発生していない**（そもそも順位変更が無い）。

---

## 12. 11頭 Explainability（Stage Bでの追加説明）

全11頭で「なぜStage Bでもこの評価なのか」は共通の構造を持つため、
まとめて記載する（個別のStage A要因はCHECKPOINT14D.2の11頭Cardを参照）:

**プラス（Stage B時点で追加された要因）**: なし——paceScenarioFactor・
trackBiasFactorとも中立のため、Stage Aからの追加プラスは無い。

**マイナス（Stage B時点で追加された要因）**: なし——同様の理由で追加
マイナスも無い。

**未評価（Stage Bでこの段階ではまだ数値反映していない要因）**:
- Weather（予報のみ、Score未反映）
- Wind（NOT_EVALUATED、course geometryデータ無し）
- Track Bias（MIXED、Score未反映）
- Official Going（未確定）
- 当日馬体重（未確定）

**Confidence**: Stage A時点のoverallConfidence（CHECKPOINT14D.2）をそのまま
継承しつつ、「officialGoing・当日Track Bias・馬体重が未確定のため、
Final Stage Bより確信度が低い」という前提を全馬共通で明示する（18節）。

個別馬のwetEvidence・positionProjectionの詳細は6・7節の表、および
`docs/checkpoint14d4-preliminary-stage-b-niigata-kinen.json`の各馬レコード
（`weatherDiagnostic`/`wetDiagnostic`/`windDiagnostic`/`trackBiasDiagnostic`/
`positiveFactors`/`negativeFactors`/`notEvaluatedFactors`）を参照。

---

## 13. Missing Race-Day Inputs

現時点でnullのまま維持した項目（推測で埋めていない）:

```
officialGoing            = null（2026-08-30発走当日に確定）
targetRaceHorseWeights   = null（発走約1時間前にJRA公式発表）
targetDayTrackBias       = null（当日の先行レース結果が必要）
```

---

## 14. Final Stage B Update Plan

CHECKPOINT14D.3で確定した通り、FINAL_STAGE_Bは原則発走約2時間前に以下を
取得・固定する:

```
公式天候（実況）
official going（正式馬場発表）
含水率等（取得できる正式ソースがあれば）
当日芝レース結果（新潟記念より前に行われる同日レースの決着）
当日Track Bias（上記から人間が観測を入力、または将来のauto実装）
最新風（実況）
馬体重
馬体重増減
```

これらが揃った時点で、`manualTrackBias`/`officialGoing`等を実際に
`computeFinalRaceAbility()`へ渡し、raceContextFactorが中立から動くかどうか
（すなわちPreliminary Stage BとFinal Stage Bの間で実際に順位変動が起こる
かどうか）を再確認する。

---

## 15. Regression

本ラウンドは`docs/`配下2ファイルの新規追加のみで、コード・実データ・
永続化済みFormal Stage A Snapshotは一切変更していない。検証用の一時
スクリプトは削除済み。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Formal Stage A drift → 0
Base Ability drift    → 0
Suitability drift     → 0
Frozen Benchmark      → 70.3（変更なし）
永続化済みSnapshotファイル → git diff無し
```

---

## 16. 判定

**A-PRELIMINARY-STAGE-B**

validated data（実コード：`finalRaceAbility.ts`・`racePacePrediction.ts`・
`positionProfile.ts`）だけを使い、Preliminary Stage B Board生成に成功した。
Weather/Wind/Track Biasは全て正しくDiagnostic分離され、Scoreへの混入は
一切無い。新規magic weightも一切発明していない。

---

## 17. 次にChatGPTと決める必要がある項目（優先順位）

1. Stage B Boardの監査
2. 明日Final Stage B更新Contract（14節のUpdate Planを実行に移す手順）
3. Probability Engine
4. 10万回Simulation
5. Odds / EV
6. BET / PASS
7. Minimal Prediction UI

STOP。Probability・Monte Carlo・Odds/EV・BET/PASS・本格UI実装のいずれも、
次のCHECKPOINTでの明示的な指示を待つ。

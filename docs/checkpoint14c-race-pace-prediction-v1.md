# CHECKPOINT14C — Race Pace Prediction V1（Pre-Frame）

新潟記念の正式枠順が未確定であるため、Race Pace Prediction V1は**Pre-Frame（枠順を
一切仮定しない段階）** までとした。Historical Position Profile V1（CHECKPOINT14B.2で
確定したContinuous Position Contract）を入力に、レース全体の前半ペース傾向
（continuousPacePressure・frontPressure・expectedPaceClass・paceConfidence）を推定する
独立レイヤーとして実装した。

新規ファイル: `src/ability/racePacePredictionTypes.ts`（型定義）、
`src/ability/racePacePrediction.ts`（本体、`computeRacePacePrediction()`）、
`src/ability/__tests__/racePacePrediction.test.ts`（11 tests）。既存ファイルの変更は無い。
Base Ability V1・raceScore・MemberLevel・Suitability V1・Effective Ability・Eligibility・
Formal Snapshot・Historical Position Profile V1への参照・変更は一切無い。

## 1. Pace Prediction Contract

`RacePacePrediction`の出力契約:

```
paceStage: "pre_frame"                 … 今回は常にこれ（post_frameは型のみ用意、未実装）
status: "DIAGNOSTIC_PRE_FRAME"         … Formal Predictionではないことの明示
runnerCount
continuousPacePressure                 … source of truth（連続値）
frontPressure                          … nigeProbabilityのみの合計
expectedPaceClass: slow/average/high   … continuousPacePressure/frontPressureからの表示用分類
paceConfidence: high/medium/low        … evidence品質のみに基づく（Pace Classの強弱とは別概念）
frontRunnerCandidateCount              … diagnostic専用の単純カウント
likelyFrontGroup                       … 寄与度降順のhorseName配列（diagnostic/説明用）
horses: HorsePaceContribution[]        … 監査用の馬別内訳
warnings
```

Pace Predictionと「そのPaceが各馬に有利/不利か」（Pace Scenario Factor）は完全に分離し、
本ラウンドではPace Scenario Factor・Final Race Abilityのいずれにも接続していない
（`racePacePrediction.ts`はHistoricalPositionProfile系の型のみをimportし、
`effectiveAbility`・`finalRaceAbility`関連の型・関数は一切参照しない）。

## 2. Legacy predictedPace再利用内容

`predictedPace.ts`（CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み）の思想を以下の通り
転用した:

- **再利用した部分**: 「逃げ候補が2頭以上ならハイペース」「逃げ・先行候補がともに0頭なら
  スローペース」という、既に監査済みのルールベース閾値（2・0）。
- **変更した部分**: 判定材料を「dominantStyleの単純カウント（情報損失が大きいハード
  カウント）」から、「runningStyleDistributionのnige/senko確率の連続合計（frontPressure/
  continuousPacePressure）」へ置き換えた。同じ閾値（2・0→<1）を頭数の実数ではなく
  連続期待値に適用しており、**新規の閾値を考案してはいない**が、ハードカウントから
  連続量への転用自体は今回初めて行ったものであり、独立した再バックテストは行っていない
  ことを明記する。

`paceScenarioFactor.ts`・`trackBiasFactor.ts`・`finalRaceAbility.ts`・`outcomeScore.ts`・
`outcomeProbability.ts`はいずれも一切参照・変更していない（今回禁止範囲）。

## 3. Horse-level Pace Inputs

1頭分の入力（`RacePaceRunnerInput`）は、CHECKPOINT14B.2で確定したContinuous Position
Contractのうち以下のみ:

```
horseId, horseName,
earlyNormalizedPositionMean, positionStdDev,
runningStyleDistribution, representativeRunningStyle（diagnostic用途のみ）,
positionEvidenceCount, positionConfidence
```

**frame・horseNumberは型に存在しない**（Pre-Frame V1であることをコンパイル時に保証する
設計）。racecourse/surface/distance/goingは今回のPace Prediction計算式そのものには
使用していない（legacy predictedPace.ts自身も出走メンバー構成のみで判定しており、
コース形状補正等は元々スコープ外。新規のコース別調整を今回追加すると根拠のない
weightになるため見送った）。

## 4. Continuous Pace Pressure

各馬の`contributionToPacePressure = (runningStyleDistribution.nige + runningStyleDistribution.senko) / 100`
（evidenceが無い馬は0）の単純合計を`continuousPacePressure`とした。**新規のweight
（0.6/0.3/0.1等）は一切導入していない** — nige/senko確率は既にContract B側で確定済みの
値であり、これをそのまま加算するのみ。

`frontPressure`は同様にnigeProbabilityのみの合計。「前方を主張する頭数の期待値
（frontPressure）」と「前方に位置しようとする頭数全体の期待値（continuousPacePressure、
nige+senko）」を区別して両方保持した。

**high positionStdDevの扱い（7・17節）**: 「forward pressure」を`earlyNormalizedPositionMean`
と`positionStdDev`の重み付き合成では構成しなかった。理由: そのような合成には根拠のない
weightが必要になる。代わりに、頻度ベースの`runningStyleDistribution`（nige/senko%）を
主要入力としたところ、位置取りが不安定な馬は実際の分類頻度としてnige/senko%が自然に
低く出る（毎回前へ行くわけではないため）ことをTest Fで確認した。したがって
**stdDevを追加のペナルティ係数として掛け合わせる必要が無く**、`positionStdDev`は
`paceConfidence`側の慎重さの反映にのみ用いた（6節）。

## 5. Pace Class

`expectedPaceClass`は`continuousPacePressure`/`frontPressure`から導出される表示用の
3分類（slow/average/high）とした。Position Bandと同じ位置付けで、境界に近い値で
クラスが反転しても`continuousPacePressure`自体は変化しない（Test C）。CHECKPOINT14D
以降のPredictionが入力に使うべきは、このクラスではなく`continuousPacePressure`/
`frontPressure`であることを型コメントに明記した。

## 6. Pace Confidence

`paceConfidence`はevidence品質のみに基づき、以下2つのordinal最小値（min）で構成した
（新規のweight付き合成ではない）:

1. **field coverage confidence**: `positionEvidenceCount>0`の頭数に対し、既存の
   `baseConfidenceFromSampleCount()`（高:4件以上/中:2〜3件/低:0〜1件、Suitability
   Confidenceで既に監査済みの閾値）をそのまま適用。「有効なデータ点の個数→confidence」
   という同じ意味の閾値を、1頭の過去走数からフィールド頭数へ転用した。
2. **front-side contributor confidence**: `contributionToPacePressure>0`の馬（前方へ
   行く可能性がある馬）のうち最も信頼度が低い馬のconfidence。ただし、その馬の
   `positionStdDev`が既存の`POSITION_STABILITY_MODERATE_MAX_STD_DEV`（=0.3、
   CHECKPOINT14B.1/B.2で確定済みの再利用可能な閾値）を超える場合は、その馬の
   confidenceを最大でも"medium"として扱う（stdDevによるconfidence側の慎重さの反映。
   frontPressureの数値自体は変更しない）。

前方候補馬が1頭も無い場合は、field coverage confidenceのみを採用する。
Pace Classそのものの強弱（速い/遅い）とPace Confidenceの強さは独立した別軸であり、
新潟記念11頭では前者が"average"、後者が"high"という組み合わせになっている（8節）。

## 7. Pre-Frame / Post-Frame Contract

`PaceStage = "pre_frame" | "post_frame"`として型を用意し、`RacePacePrediction.paceStage`
は今回常に`"pre_frame"`。`status: "DIAGNOSTIC_PRE_FRAME"`を必須フィールドとして持たせ、
Formal Prediction（Formal Stage A Snapshot等）とは別物であることを型レベルで明示した。
将来枠順確定後の`post_frame`評価は、同じ`RacePacePrediction`型の別インスタンスとして
生成する想定であり、Pre-Frame側の結果を上書きする構造にはしていない（本ラウンドでは
post_frame自体を生成するロジックは未実装）。

## 8. 新潟記念11頭 Pre-Frame Diagnostic

**Race全体（DIAGNOSTIC / PRE_FRAME / NOT FORMAL）:**

```
continuousPacePressure: 2.75
frontPressure:          0.65
expectedPaceClass:      average
paceConfidence:         high
frontRunnerCandidateCount: 0
likelyFrontGroup: ロデオドライブ・ドゥレッツァ・サヴォーナ・ダノンシーマ・
                  ステレンボッシュ・ゾロアストロ・チェルヴィニア
```

**馬別内訳:**

| 馬名 | earlyNormMean | positionStdDev | distribution(nige/senko/sashi/oikomi) | nigeProb | contributionToPacePressure |
|---|---|---|---|---|---|
| アーバンシック | 0.655 | 0.106 | 0/0/60/40 | 0 | 0 |
| サヴォーナ | 0.310 | 0.171 | 0/40/60/0 | 0 | 0.4 |
| ジュンブロッサム | 0.755 | 0.076 | 0/0/20/80 | 0 | 0 |
| ステレンボッシュ | 0.460 | 0.208 | 0/20/60/20 | 0 | 0.2 |
| ゾロアストロ | 0.546 | 0.212 | 20/0/40/40 | 0.2 | 0.2 |
| ダノンシーマ | 0.377 | 0.171 | 20/20/60/0 | 0.2 | 0.4 |
| チェルヴィニア | 0.496 | 0.204 | 0/20/60/20 | 0 | 0.2 |
| ドゥレッツァ | 0.382 | 0.147 | 0/60/40/0 | 0 | 0.6 |
| バレエマスター | 0.800 | 0.149 | 0/0/20/80 | 0 | 0 |
| ボーンディスウェイ | 0.620 | 0.130 | 0/0/80/20 | 0 | 0 |
| ロデオドライブ | 0.289 | 0.265 | 25/50/0/25 | 0.25 | 0.75 |

`frontRunnerCandidateCount=0`（representativeRunningStyleがnigeの馬が1頭も無い）だが、
`frontPressure=0.65`（複数馬が部分的にnige性を持つ）という、ハードカウントでは
見えない情報がcontinuous値で表現されている点が、legacy（ハードカウントのみ）との
明確な違いである。

## 9. 秒数Predictionの可否

**NOT_RECOMMENDED_FOR_V1。** `src/ability/types.ts`に`LapProfile`という型定義自体は
存在するが、実際にどのRacePerformanceにもlap/split（600m通過・1000m通過等）の
実データフィールドが無く、CHECKPOINT14Aのデータ監査でも同様の欠如が確認されている。
実データ基盤が無い状態で`predictedFirst600m`/`predictedFirst1000m`を実装すると、
根拠の無い推測値を実データのように扱うことになるため（CLAUDE.md絶対原則5）、
V1では実装を見送る。

## 10. Actual Pace Validation案（仕様提案のみ、実装無し）

将来CHECKPOINT14Eで`expectedPaceClass` vs `actualPace`を検証する際の`actualPace`定義案:

1. **first600m relative to course baseline**: 対象コース・距離のfirst600m通過タイムの
   母集団分布に対する相対値。要: 実際のfirst600mラップデータ。
2. **first1000m relative to course/distance baseline**: 同上、1000m通過版。
3. **lap distribution（ラップの前後半配分）**: 前半3F・後半3F等の配分比。

いずれも9節の通り現状実データが無いため、**今回は定義の提案のみに留め、実際の
actualPaceラベルは作成していない**。

## 11. Magic Number Audit

新規に導入した数値定数は無い。使用した閾値は全て既存の監査済み値の再利用:

| 使用箇所 | 値 | 由来 |
|---|---|---|
| expectedPaceClass=high境界 | frontPressure>=2 | legacy predictedPace.ts（nigeCandidateCount>=2）を連続値へ転用 |
| expectedPaceClass=slow境界 | continuousPacePressure<1 | legacy predictedPace.ts（nige・senko候補ともに0）を連続値へ転用 |
| field coverage confidence | baseConfidenceFromSampleCount（4以上/2以上） | suitabilityConfidence.ts（STEP4、既存） |
| front-side confidence downgrade境界 | POSITION_STABILITY_MODERATE_MAX_STD_DEV=0.3 | positionProfile.ts（CHECKPOINT14B.1/B.2、既存） |

「forward pressure」をearlyNormalizedPositionMean・nige/senko確率・positionStdDevの
重み付き合成で構成する案は、根拠のあるweightが存在しないため**実装しなかった**
（4節参照）。この判断自体が、23節「New Magic Number禁止」への対応である。

## 12. Tests / Regression

`src/ability/__tests__/racePacePrediction.test.ts`: **11 tests、全てpass**。

- Test A: 後方寄りの馬を前方寄りへ差し替えるとpressureが増加（減少しない）
- Test B: 全馬oikomi（後方）のフィールドはslow、highにはならない
- Test C: computeRacePacePredictionはBand相当の概念を型にも計算にも持たないため、
  同一入力の再計算結果は不変
- Test D: RacePaceRunnerInputにframe/horseNumberが存在しないことの型・実行時両面確認
- Test E: 取消馬を除いた配列を渡すと、その馬の寄与が完全に消える（内部状態非保持）
- Test F: 位置取りが不安定な馬のnige/senko確率が安定馬より低くなること、
  contributionToPacePressureも低くなること、paceConfidenceがstdDevで慎重化されうること
- Test G: 出力にodds/popularity/人気の文字列が一切含まれないことの直接確認
- Test H: Base Ability不変
- Test I: Suitability V1不変
- Test J: Race Pace Prediction計算の反復実行がbaseAbility計算経路に副作用を持たない
  ことの間接確認（Frozen Benchmark自体は`abilityModelV1.frozenBenchmark.test.ts`で直接検証）
- Extra: evidence無し馬はpacePressueへの寄与0＋警告

- **Base Ability**: 新潟記念11頭・シェイクユアハートとも無変更。
- **Suitability V1**: 無変更（既存Test I）。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- `npm test`: **739 / 739 pass**（既存728 + 新規11）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。
- `git status`: 新規ファイル3件（`racePacePrediction.ts`・`racePacePredictionTypes.ts`・
  テスト）のみ、他ファイルへの影響なし。

## 13. 判定

**A**。

Race Pace Prediction V1（Pre-Frame）は、Historical Position Profile V1の
Continuous Position Contract（CHECKPOINT14B.2）のみを入力に、根拠のない新規weightを
一切導入せずに成立した。Position Bandは主要入力から除外し（diagnostic専用の
`frontRunnerCandidateCount`にのみ間接利用）、Running Style Distributionは単一labelに
潰さずnige/senko確率をそのまま利用した。Position StabilityとPosition Confidenceの
分離（CHECKPOINT14B.2）と同じ原則を踏襲し、`positionStdDev`は数値スコアの減点ではなく
confidence側の慎重さにのみ反映した。expectedPaceClassの閾値はlegacy predictedPace.ts
（REUSE_WITH_CHANGES判定済み）の既存監査済み定数（2・0）を連続値へ転用したものであり、
新規に考案した閾値ではない。秒数Prediction（first600m/1000m）は実データ基盤が
存在しないため実装せず、NOT_RECOMMENDED_FOR_V1として明記した。Base Ability/
Suitability V1/Historical Position Profile V1/Frozen Benchmarkへの回帰は無い。
無理にA判定にしているわけではなく、Contract分離の一貫性・Magic Number監査・
全回帰確認が揃った結果としてのA判定である。

Current Race Position Prediction V1（CHECKPOINT14D）へ進める状態にあると判定する。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **CHECKPOINT14D（Current Race Position Prediction）着手の可否**: 正式枠順確定後、
   frame/horseNumberを入力に追加したPost-Frame評価をどう設計するか（内外枠による
   前を取りに行く可能性への影響、13節で言及した既存の`paceStage="post_frame"`型を
   使って追加する想定）。
2. **expectedPaceClass閾値（2・<1）の連続値版としての妥当性**: legacy定数の連続値への
   転用は今回初めてであり、独立した再検証は行っていない。将来のバックテストで
   校正が必要か。
3. **Actual Pace Definition（10節）の正式化タイミング**: Lap実データが将来収集された
   場合、どの定義案（first600m/first1000m/lap distribution）を採用するか。
4. **秒数Prediction再検討のタイミング**: Lap実データ基盤が整った時点でのV1.1/V2候補。

以上、CHECKPOINT14C完了。CHECKPOINT14Dへは進まず、ここでSTOPする。

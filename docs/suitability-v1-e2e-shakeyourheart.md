# Suitability V1 実馬1頭エンドツーエンド検証（CHECKPOINT11.15）

CHECKPOINT11.14で本番接続したBase Ability → Suitability V1 → effectiveAbility →
finalRaceAbilityのパイプラインを、シェイクユアハート1頭・実データのみで実行し、
数値の妥当性を確認した。全頭展開・RaceContext/trackBias再設計・Race Review Engine・
キーンランドC実戦投入には進んでいない。本ラウンドは検証のみで、本番コードは無変更。

検証は`loadHorseAbilityProfile("shakeyourheart")`（`HorseDetailPanel.tsx`が使う実データ
読み込み関数そのもの）→`computeFinalRaceAbility()`（CHECKPOINT11.14で本番接続済み）という
実コードをそのまま呼び出す一時スクリプト（`zzz_shakeyourheartE2E.test.ts`、確認後削除）で行った。

---

## 1. 対象馬・対象条件

- **対象馬**: シェイクユアハート（horseId=`shakeyourheart`、`data/horses/shakeyourheart.json`）
- **対象条件**: 実際の最新走・宝塚記念の実条件をそのまま使用
  - racecourse: 阪神　surface: turf　distance: 2200m　going: 重
  - raceId: `JRA-20260614-HANSHIN-11`、raceDate: 2026-06-14
  - raceNumber: 11（宝塚記念はG1・最終レースという公知の事実に基づく。推測値ではない）
  - gate: `{ horseNumber: null, fieldSize: null, frame: null }`
    （**実データに枠番情報が一切存在しないため**。全22頭分の`data/horses/*.json`を確認した結果、
    gate/horseNumber/fieldSizeを持つファイルは0件だった。`RacePerformance`型自体は
    これらを`optional`として保持できる設計だが、実際に値が入っている実データが
    repo内に存在しない。架空値で埋めず、型が本来表現できる「不明」をそのまま渡した）
- **recentRaces**: 実データ5走（宝塚記念・金鯱賞・京都記念・中日新聞杯・アンドロメダS、
  すべて`data/horses/shakeyourheart.json`の実記録）をそのまま`computeFinalRaceAbility`へ渡した。
  宝塚記念自身は`raceContextTarget.raceId`一致により関数内部のfuture leakageガードで
  自動的にSuitability計算対象（priorRaces）から除外される（既存仕様、無変更）。
- `manualRunningStyle`/`fieldRunningStyleDistributions`/`manualTrackBias`/`autoTrackBias`は
  実データが無いため、それぞれnull/空配列とした（架空値の補完ではなく、実データ不在の明示）。

---

## 2. baseAbility

**70.3** — CHECKPOINT11.14後も完全再現された（`abilityModelV1.regression.test.ts`と同じ値）。

内訳（直近5走、raceScore・memberLevelScoreAtRace等は既存仕様のまま、新しい順）:

| raceName | raceDate | 条件 | finishPosition | raceScore | memberLevelScoreAtRace | raceTimeScore | final3FScore | weightScore |
|---|---|---|---|---|---|---|---|---|
| 宝塚記念 | 2026-06-14 | 阪神/turf/2200/重 | 14 | 62.6 | 74.4 | 93 | 58.7 | 70 |
| 金鯱賞 | 2026-03-15 | 中京/turf/2000/良 | 1 | 74.6 | 69.5 | 60.1 | 84.5 | 70 |
| 京都記念 | 2026-02-15 | 京都/turf/2200/良 | 4 | 67.8 | 66.7 | 51.9 | 75.8 | 70 |
| 中日新聞杯 | 2025-12-13 | 中京/turf/2000/良 | 1 | 75.8 | 65.3 | 70 | 82.7 | 76.1 |
| アンドロメダS | 2025-11-15 | 京都/turf/2000/良 | 2 | 70.6 | 66.6 | 51.4 | 81.7 | 74.1 |

baseAbility = 5走のraceScore単純平均 = (62.6+74.6+67.8+75.8+70.6)/5 = 70.28 → 70.3（既存の丸め仕様通り）。

---

## 3. distance結果

```json
{
  "evaluated": true,
  "rawPercent": 99.2,
  "adjustedPercent": 99.5,
  "confidence": "medium",
  "reason": "直近4走のうち、距離2200m（middle帯）との近さに応じて重み付けした4走（重み付き平均raceScore=71.6）を、全体平均raceScore=72.2と比較。raw=99.2% → confidence(high)で縮小しadjusted=99.2%。",
  "source": "horseEvidence",
  "HorseEvidence sampleCount": 4,
  "CoursePrior使用": "無し"
}
```

confidence="medium"は`resolveHorseEvidenceConfidence(4)`（4段階、3-4=medium）による
CHECKPOINT11.11の確定仕様通り。adjustedPercent=99.5は`shrinkTowardCenter(99.2, "medium")`
（weight=0.6）＝100+(99.2-100)×0.6=99.52→99.5で、実際の出力と一致する。

**注意（説明可能性の観点で発見した既知の非整合）**: `reason`文字列内の「confidence(high)で縮小し
adjusted=99.2%」という記述は、`distanceSuitability.ts`自身の内部計算（旧3段階confidence基準、
`baseConfidenceFromSampleCount`ベース）が使った"high"という別のconfidence値・別の縮小結果を
そのまま引き継いだ文言であり、実際にSuitabilityComponentResultV1として出力される
`confidence="medium"`・`adjustedPercent=99.5`とは数値上一致しない。これは`wrapSystemAComponent`
（CHECKPOINT11.11で確定済みの既存実装、`component.raw`のみを引き継ぎ`component.reason`は
そのまま流用する設計）に起因する既存の挙動であり、今回新たに発生したものではない。
confidence判定・adjustedPercentの計算自体は正しいが、reason文言が古い内部計算の説明を
そのまま表示してしまう点は、人間が結果を読む際に混乱を招きうる。今回は
「Suitability V1式の変更禁止」に該当するため修正していない（第21節・第22節で技術的負債として報告）。

---

## 4. course結果

```json
{
  "evaluated": false,
  "rawPercent": 100,
  "adjustedPercent": 100,
  "confidence": "unknown",
  "reason": "直近4走に競馬場「阪神」での実績が無いため、中立100%（confidence=低）とした。",
  "source": "none",
  "HorseEvidence sampleCount": 0,
  "CoursePrior使用": "無し"
}
```

シェイクユアハートの直近4走（宝塚記念を除く）はいずれも中京・京都で、阪神での実績が
1走も無いため、course componentはevaluated=falseとなった。これは推測での埋め合わせではなく、
実データに基づく正当な「評価不能」判定である。

---

## 5. going結果

```json
{
  "evaluated": true,
  "rawPercent": 100,
  "adjustedPercent": 100,
  "confidence": "medium",
  "reason": "直近4走のうち、馬場状態「重」との近さに応じて重み付けした4走（重み付き平均raceScore=72.2）を、全体平均raceScore=72.2と比較。raw=100% → confidence(high)で縮小しadjusted=100%。",
  "source": "horseEvidence",
  "HorseEvidence sampleCount": 4,
  "CoursePrior使用": "無し"
}
```

raw=100%（重み付き平均と全体平均が一致）のため、confidence（medium）による縮小を適用しても
adjustedPercent=100%のまま変化しない（`shrinkTowardCenter`は100を中心とした縮小のため、
raw自体が100の場合は常に100を返す仕様通り）。同じくreason文言に上記distanceと同様の
「confidence(high)」という古い内部表現の残存が見られる（技術的負債として第21節に記載）。

---

## 6. gate結果

```json
{
  "evaluated": false,
  "rawPercent": 100,
  "adjustedPercent": 100,
  "confidence": "unknown",
  "reason": "本人実績が無く、CoursePriorは東京ダート1600m限定のため対象コースでは評価不能（推測で埋めない）。",
  "source": "none",
  "HorseEvidence sampleCount": 0,
  "CoursePrior使用": "無し"
}
```

対象条件（阪神×turf×2200）で本人のgate実績（rawPerformanceDelta算出可能な走）が無く、
かつ対象コースが東京ダート1600m限定のCoursePriorの適用範囲外のため、evaluated=falseとなった。
これも実データの正当な反映であり、推測での埋め合わせは一切発生していない。

---

## 7. evaluatedComponentCount

**2**（distance・goingのみ。course・gateはevaluated=falseのため不算入）。

---

## 8. overallConfidence

**"unknown"**。4componentのconfidenceのweakest-link
（distance=medium、course=unknown、going=medium、gate=unknown）を取った結果、
course・gateの"unknown"が全体を支配する。evaluated=falseのcomponentは常にconfidence="unknown"
であるという既存仕様（CHECKPOINT11.11）通りの正しい挙動。

---

## 9. overallSuitabilityPercent

**99.8%**。

計算過程: evaluated=trueの2component（distance adjustedPercent=99.5、going adjustedPercent=100）
の単純平均 = (99.5+100)/2 = 99.75 → `roundToOneDecimal`で99.8。course・gate（evaluated=false）は
この平均計算から除外されている（含めていれば(99.5+100+100+100)/4=99.875となり、
今回とは異なる——かつ「100として埋める」ことになり、CHECKPOINT11.3 STEP6で明示的に
不採用と決めた方式に反する）。

---

## 10. effectiveAbility

```
effectiveAbility = roundToOneDecimal(baseAbility × overallSuitabilityPercent / 100)
                 = roundToOneDecimal(70.3 × 99.8 / 100)
                 = roundToOneDecimal(70.1594)
                 = 70.2
```

---

## 11. finalRaceAbility

**69.7**。`computeFinalRaceAbility`の既存STEP5（RaceContext）処理がeffectiveAbility確定後に
そのまま追加で作用した結果であり、今回新たな補正を加えたものではない。実コード結果に基づき、
追加処理の内容をすべて列挙する:

1. **runningStyle（脚質）解決**: `manualRunningStyle=null`・`passingPositionRunningStyle`データ無し
   のため、`fallbackAutoRunningStyle`（final3F相対値ベース、confidence常にlow）が採用された。
   結果: sashi 83.2% / oikomi 16.8%（nige/senko=0%）、confidence="low"。
2. **predictedPace（想定ペース）**: `fieldRunningStyleDistributions=[]`（対戦馬の実データが
   無いため空配列）→ 逃げ候補0・先行候補0 → `level="slow"`（既存ルールベース判定、無変更）。
3. **paceScenarioFactor**: raw=97.8%（スローペース×差し寄りの相性）、confidence="low"のため
   `shrinkTowardCenter`で100側へ縮小しadjusted=99.3%。
4. **trackBiasFactor**: manual/auto双方の観測情報が無いため中立100%（`usedSource="neutral"`）。
5. **raceContext.value**: `clamp(99.3 × 100 / 100, 90, 110)` = 99.3（clampは発動せず）。
6. **finalRaceAbility**: `roundToOneDecimal(70.2 × 99.3 / 100)` = `roundToOneDecimal(69.7086)` = **69.7**。

これらはすべてSTEP5（第23〜24実装、CHECKPOINT11.14以前から凍結的に運用されている既存ロジック）
であり、今回のCHECKPOINTで内容を変更していない（そのまま実行し、結果を観測しただけ）。

---

## 12. safety boundary発動有無

**発動していない。** overallSuitabilityPercent=99.8は`SUITABILITY_V1_SAFETY_MIN=60`〜
`SUITABILITY_V1_SAFETY_MAX=120`の範囲内に自然に収まっており、`clampSafety()`が値を
変更する場面は無かった。同様にraceContext.value=99.3もclamp(90,110)の範囲内で発動していない。

---

## 13. CoursePrior使用箇所

**無し。** 4componentのいずれも`coursePrior: null`。対象条件（阪神×turf×2200）が
CoursePriorの唯一の適用範囲（東京ダート1600m）に該当しないため、gate componentの
CoursePriorフォールバックも発動しなかった。distance/course/goingはそもそもCoursePrior相当の
実装を持たない（既存仕様、CHECKPOINT11監査結果通り）。

---

## 14. HorseEvidence使用箇所

distance（sampleCount=4）とgoing（sampleCount=4）の2componentで使用された。
両方とも「直近4走（宝塚記念を除く）」を対象条件との近さで重み付けした既存の
`distanceSuitability.ts`/`goingSuitability.ts`の計算結果を、CHECKPOINT11.14で新しく
本番接続したSuitability V1の`wrapSystemAComponent`が受け取って再利用したもの。
course・gateはHorseEvidence sampleCount=0（対象条件に一致する実績が無い）のため未使用。

---

## 15. unknown component

**course・gateの2つ。** いずれも`confidence="unknown"`・`evaluated=false`。
第9節で確認した通り、この2つの値（rawPercent=100/adjustedPercent=100）は
**overallSuitabilityPercentの平均計算には一切含まれていない**（100として埋められていない）。
`evaluatedComponentCount=2`という数値そのものが、4component中2つしか評価に使われていない
事実を隠さず結果に公開している（CHECKPOINT11.3 STEP6の設計方針が実データ上も機能していることを確認）。

---

## 16. 旧Suitability混入有無

**無し。** CHECKPOINT11.14で`finalRaceAbility.ts`のimportを`./suitability`（旧）から
`./suitabilityV1`（新）へ完全に切り替え済みであり、`computeFinalRaceAbility`の呼び出し経路上に
`computeSuitabilityBreakdown`/`computeEffectiveAbility`（旧`suitability.ts`）への参照は
ソースコード上に一切存在しない（CHECKPOINT11.14完了報告時点でgrep確認済み、本ラウンドで
コード変更していないため状態は不変）。本ラウンドで呼び出した`computeFinalRaceAbility`が
内部で呼ぶのは`computeSuitabilityV1`のみであり、構造的に旧経路を呼びようがない。

---

## 17. 能力9割思想との整合性

- **1componentだけで大幅変動していないか**: していない。実際に評価されたdistance
  （100→99.5、-0.5pt）・going（100→100、±0pt）はいずれも軽微な変動に留まり、
  overallSuitabilityPercent=99.8はほぼ中立。
- **gateが主役になっていないか**: なっていない。gateはevaluated=falseで
  平均計算に一切寄与していない（第9節・第15節参照）。
- **CoursePriorが過大影響していないか**: 影響そのものが皆無（第13節）。
- **unknownが100として埋められていないか**: 埋められていない（第15節、機械的に確認済み）。
- 総合して、Base Ability=70.3に対する最終的な補正幅は effectiveAbility 70.2
  （-0.1、Suitability由来）→ finalRaceAbility 69.7（-0.5、RaceContext由来、脚質・想定ペースの
  実データが乏しいことによる保守的な縮小）であり、Base Abilityを大きく破壊するような
  補正は発生していない。「馬の能力が9割」という設計思想と整合する結果だった。

---

## 18. baseAbility=70.3再現

`abilityModelV1.regression.test.ts`を含む全527テストが通過し、シェイクユアハートの
baseAbility=**70.3**が本ラウンドでも完全再現されることを確認した（第2節参照）。

---

## 19. test/lint/build/validate:data

- `npm test` — 527/527 pass（54 test files。本ラウンドはコード変更が無いため件数は
  CHECKPOINT11.14完了時点と同一）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ
  （sapporoKinenロースター外のhorseId、courseTimeBaselines欠落25/48、
  courseFinal3FBaselines欠落28/48）。

---

## 20. A/B/C判定

**B（構造は正しいが追加検証必要）。**

「無理にA判定にしない」という本セッション一貫の方針に従い、以下の理由からBとした。
計算そのものに欠陥は見つからなかったが、今回の1頭検証だけでは本番利用可否を確定するには
証拠が不十分と判断する。

- 4component中、実際に`evaluated=true`で非中立の実データが使われたのはdistance・goingの
  2つのみ（course・gateは対象条件との実データ不足により未評価）。gateやCoursePriorが
  実際にoverallSuitabilityPercentへ寄与するケースはまだ1件も実データで確認できていない。
- RaceContext層（paceScenarioFactor/trackBiasFactor）も対戦馬の実データが無く、
  ほぼ中立値（99.3%）のまま通過しており、この層の実データでの妥当性も未検証。
- 検証対象が1頭・1条件のみで、複数馬・複数条件間の相対的な妥当性（順位が直感と大きく
  乖離していないか等）の比較確認は行っていない。
- 第3節・第5節で報告した`reason`文言の非整合（confidence再判定後の値と一致しない）は、
  数値自体は正しいものの、人間向けの説明可能性に既知の欠陥があることを示している。

これらは「計算式が間違っている」ことを意味せず、構造・計算ロジック自体は実データ上も
正しく機能していることを確認できた。したがって次段階（複数馬での検証、course/gateが
実際に評価されるケースの確認）を経ればA判定に至る見込みが高い。

---

## 21. technical debt

- `wrapSystemAComponent`が`component.reason`をそのまま流用するため、reason文言が
  再判定後のconfidence/adjustedPercentと数値上食い違う（第3節・第5節）。修正には
  `suitabilityV1.ts`（Suitability V1式、今回変更禁止）への変更が必要なため、次回以降の
  承認事項として残す。
- 旧`suitability.ts`系・`suitabilityCoreV1Types.ts`系はCHECKPOINT11.14時点から未削除のまま
  （CHECKPOINT11.14完了報告の技術的負債を継続）。
- gate/course componentが実データで評価される具体的なケース（対象コースでの実績がある馬、
  または東京ダート1600mでの評価）はまだ本番接続後に1件も実観測できていない。

---

## 22. 次にChatGPTと決める必要がある項目

1. 本番利用可能性をA判定へ引き上げるための追加検証の範囲（複数馬・複数条件の検証を
   次のCHECKPOINTで行うか）。
2. gate/CoursePriorが実際に評価される実データケース（例: 東京ダート1600mでの実績がある馬）
   を使った追加検証の要否。
3. reason文言の非整合（第21節）を修正するかどうか、修正する場合の設計方針
   （`wrapSystemAComponent`の`reason`をconfidence再判定後の値で再生成する等）。
4. RaceContext層（paceScenarioFactor/trackBiasFactor/predictedPace）を実データで検証する
   タイミング（本CHECKPOINTでは変更禁止・観測のみ）。
5. 全頭展開・キーンランドC実戦投入への着手タイミング。

**ここでSTOPします。** 全頭展開、キーンランドC実戦投入、RaceContext、trackBiasにはまだ進みません。

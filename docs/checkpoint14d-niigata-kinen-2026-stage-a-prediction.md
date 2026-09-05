# CHECKPOINT 14D — 2026 新潟記念 Formal Stage A Prediction

CURRENT TARGET（2026新潟記念 GIII、新潟芝2000m、8R、11頭）の正式Stage Aを、
既存の凍結済みインフラ（Base Ability V1・Suitability V1・Race Card Input
Bridge V1・Prediction Snapshot V1・Formal Prediction Snapshot V1）のみを
使って生成し、immutable snapshotとして永続化した記録。

**HISTORICAL VALIDATION（2026-05-16新潟大賞典、CHECKPOINT14C.2G/H）とは
完全に分離。** 新潟大賞典のPrediction=AVERAGE / Actual=HIGHという結果を、
今回の新潟記念のPace Predictionへ一切反映していない（11節で数値的に確認）。

## 0. 開催日の扱いについて（前提の明記）

CHECKPOINT本文に2026新潟記念の正式な発走予定時刻が含まれていなかったため、
ユーザーに確認した上で **2026-08-30(日) 15:45発走** と仮定して
raceId=`JRA-20260830-NIIGATA-08`・raceDate=`2026-08-30`を使用した。
これは実世界のJRA開催慣行（新潟記念は例年8月最終日曜開催）に基づく推定であり、
JRA公式発表そのものではない。Base Ability/Suitability/Score計算には
一切影響しない（純粋にsnapshotの識別子・日付ラベルとしてのみ使用）。
正式な発走時刻が確定次第、必要であれば新しいsnapshotIdで再生成する
（既存recordの上書きはしない）。

## 1. Race Card Validation

`normalizeRaceCard()`（Race Card Input V1、無変更）で11頭を検証、
`runRaceCardBridge()`（Runner Resolver → Stage A Snapshot、無変更）で解決:

| 項目 | 結果 |
|---|---|
| Total runners | 11 |
| Resolved | 11 |
| Unresolved / Ambiguous | 0 / 0 |
| Prediction eligible | 11 |
| Gate | **FORMAL**（正式Snapshotとして扱える） |

horseId解決は全馬「canonical horseId一致（Priority 1）」——CHECKPOINT13.3で
確定済みのhorseIdをそのまま`horseId`ヒントとして渡したため、馬名fuzzy
matchには一切依存していない。

正式Race Card（枠番・馬番・斤量はcheckpoint本文の通り正式入力として保存。
騎手はRace Card Input V1のスキーマに項目が無いため、計算に影響しない
参考情報として本報告書にのみ記載する）:

| 枠 | 馬番 | 馬名 | horseId | 斤量 | 騎手 |
|---|---|---|---|---|---|
| 1 | 1 | ボーンディスウェイ | 2019104658 | 57.0 | 丸山元気 |
| 2 | 2 | サヴォーナ | 2020100734 | 57.0 | 池添謙一 |
| 3 | 3 | ロデオドライブ | 2023107166 | 57.0 | C.ルメール |
| 4 | 4 | ドゥレッツァ | 2020103650 | 59.0 | 田辺裕信 |
| 5 | 5 | ゾロアストロ | 2023106850 | 55.0 | 岩田望来 |
| 6 | 6 | チェルヴィニア | 2021105643 | 56.0 | 津村明秀 |
| 6 | 7 | ジュンブロッサム | 2019105118 | 58.0 | 杉原誠人 |
| 7 | 8 | ダノンシーマ | 2022104645 | 57.0 | 川田将雅 |
| 7 | 9 | アーバンシック | 2021105436 | 59.0 | 三浦皇成 |
| 8 | 10 | バレエマスター | 2019104850 | 57.0 | 菊沢一樹 |
| 8 | 11 | ステレンボッシュ | 2021105743 | 56.0 | 戸崎圭太 |

オッズ・人気は今回一切取得・入力していない。

## 2. 11頭 Base Ability（直近5走均等平均、V1凍結・無変更）

| 馬名 | baseAbility | 使用走数 | shortCareer | historyCompleteness |
|---|---|---|---|---|
| ボーンディスウェイ | 73.1 | 5 | false | complete |
| サヴォーナ | 70.2 | 5 | false | complete |
| ロデオドライブ | 76.7 | 4 | **true** | complete |
| ドゥレッツァ | 67.4 | 5 | false | complete |
| ゾロアストロ | 74.8 | 5 | false | complete |
| チェルヴィニア | 69.1 | 5 | false | complete |
| ジュンブロッサム | 72.7 | 5 | false | complete |
| ダノンシーマ | 78.3 | 5 | false | complete |
| アーバンシック | 72.1 | 5 | false | complete |
| バレエマスター | 72.4 | 5 | false | complete |
| ステレンボッシュ | 69.4 | 5 | false | complete |

ロデオドライブのみ4走（Short Career Eligibility V1により「キャリア全体を
把握済みの短キャリア馬」と判定——`knownCareerRaceCount=4`＝実キャリアそのものが
4走で、データ欠損ではない。CHECKPOINT13-4Bで既に確認済みの事実を再利用）。
baseAbility自体は減点していない（CLAUDE.md絶対原則3・4通り）。

天候・馬場・枠順・騎手・オッズによるBase Abilityの調整は一切行っていない。

## 3. Niigata Turf 2000 Suitability（Suitability V1、4component、無変更）

goingは未確定のため`GOING_UNKNOWN_SENTINEL`を使用——構造的に
`going`componentがevaluated=falseへ帰着する（推測で「良」等を補完しない、
既存の凍結済みメカニズムをそのまま利用）。

| 馬名 | distance | course | going | gate | overall% | evaluated数 |
|---|---|---|---|---|---|---|
| ボーンディスウェイ | 99.9(medium) | 100(未評価) | 100(未評価) | 100(未評価) | 99.9 | 1 |
| サヴォーナ | 99.6(high) | 100(未評価) | 100(未評価) | 100(未評価) | 99.6 | 1 |
| ロデオドライブ | 100(medium) | 100(未評価) | 100(未評価) | 100(未評価) | 100 | 1 |
| ドゥレッツァ | 103.7(medium) | 100(未評価) | 100(未評価) | 100(未評価) | 103.7 | 1 |
| ゾロアストロ | 99.2(high) | 99.6(評価済) | 100(未評価) | 100(未評価) | 99.4 | 2 |
| チェルヴィニア | 100.9(high) | 100(未評価) | 100(未評価) | 100(未評価) | 100.9 | 1 |
| ジュンブロッサム | 100.4(high) | 100.7(評価済) | 100(未評価) | 100(未評価) | 100.6 | 2 |
| ダノンシーマ | 101.9(medium) | 100(未評価) | 100(未評価) | 100(未評価) | 101.9 | 1 |
| アーバンシック | 100.1(high) | 100(未評価) | 100(未評価) | 100(未評価) | 100.1 | 1 |
| バレエマスター | 101.8(high) | 102(評価済) | 100(未評価) | 101.4(評価済) | 101.7 | 3 |
| ステレンボッシュ | 98.3(high) | 100(未評価) | 100(未評価) | 100(未評価) | 98.3 | 1 |

course/gateが「未評価」の馬が大半なのは、直近5走に新潟芝2000mでの実績が
無いため（新規weightで穴埋めしていない、evaluatedComponents=1のみで
overallを算出——不足を隠さない設計、CHECKPOINT11.3の既存方針通り）。

**Effective Ability = baseAbility × overallSuitabilityPercent / 100**
（`finalRaceAbility.ts`と同じ式。ただしSTEP5=`computeFinalRaceAbility()`
自体は呼んでいない——pace展開・trackBias補正が混入するのを避けるため、
`predictionSnapshot.ts`のコメントにも明記された設計判断をそのまま踏襲）。

## 4. Stage A Board（1〜11位、オッズ不使用）

| Rank | 馬番 | 馬名 | Base Ability | Suitability | Stage A Score(表示) | Position Confidence |
|---|---|---|---|---|---|---|
| 1 | 8 | ダノンシーマ | 78.3 | 101.9% | **80** | high |
| 2 | 3 | ロデオドライブ | 76.7 | 100.0% | **77** | high |
| 3 | 5 | ゾロアストロ | 74.8 | 99.4% | **74** | high |
| 4 | 10 | バレエマスター | 72.4 | 101.7% | **74** | high |
| 5 | 7 | ジュンブロッサム | 72.7 | 100.6% | **73** | high |
| 6 | 1 | ボーンディスウェイ | 73.1 | 99.9% | **73** | high |
| 7 | 9 | アーバンシック | 72.1 | 100.1% | **72** | high |
| 8 | 2 | サヴォーナ | 70.2 | 99.6% | **70** | high |
| 9 | 4 | ドゥレッツァ | 67.4 | 103.7% | **70** | high |
| 10 | 6 | チェルヴィニア | 69.1 | 100.9% | **70** | high |
| 11 | 11 | ステレンボッシュ | 69.4 | 98.3% | **68** | high |

（内部値: effectiveAbility=73.0/69.9/69.9/69.7を1位刻みで四捨五入した結果、
6位ボーンディスウェイと5位ジュンブロッサム、8〜10位のサヴォーナ/ドゥレッツァ/
チェルヴィニアが表示上団子になる。18節で解説。）

## 5. 上位5頭 横比較

**1位 ダノンシーマ(80) vs 2位 ロデオドライブ(77)**: baseAbility自体で
78.3 vs 76.7と1.6差があり、Suitability（101.9% vs 100.0%）もダノンシーマが
やや上回るため、Effective Abilityでも明確に差が開いた（79.8 vs 76.7）。
ダノンシーマは距離適性componentが101.9%（medium confidence、直近5走が
距離2000m前後に集中）と裏付けあり。ロデオドライブは実績自体は強い
（4走中の中身、CP13-4Bで確認済み）が短キャリアでdistance component
confidence=mediumに留まる。

**2位 ロデオドライブ(77) vs 3位 ゾロアストロ(74)**: baseAbilityで
76.7 vs 74.8、2ポイント弱の差。ゾロアストロは新潟course componentが
評価済み（99.6%、直近に新潟実績あり）という点でロデオドライブより
情報量は多いが、course適性自体がほぼ中立（99.6%）でありbaseAbilityの
差を覆すほどではない。

**3位 ゾロアストロ(74) vs 4位 バレエマスター(74)**: 表示上は同スコアだが
内部値は74.4 vs 73.6で明確にゾロアストロが上。ゾロアストロはbaseAbility
自体が74.8とバレエマスター(72.4)より高く、Suitability%はバレエマスター
（101.7%、course/gate両方で新潟実績による加点）の方が高いものの、
baseAbilityの差（2.4pt）をSuitability差だけでは逆転しきれない。

**4位 バレエマスター(74) vs 5位 ジュンブロッサム(73)**: baseAbilityは
バレエマスター72.4・ジュンブロッサム72.7とほぼ互角（0.3差）。バレエマスターは
唯一distance/course/gateの3componentが評価済み（新潟芝2000m実績あり）で
Suitability101.7%まで積み上がった一方、ジュンブロッサムはdistance/courseの
2componentのみでSuitability100.6%。Evidence量の差がSuitabilityの差になり、
僅差の逆転が生まれている。

**5位 ジュンブロッサム(73) vs 6位 ボーンディスウェイ(73)**: 内部値も
73.1 vs 73.0とほぼ完全な互角。baseAbilityはボーンディスウェイの方が
0.4高い(73.1 vs 72.7)が、SuitabilityはBジュンブロッサムが上回り(100.6% vs
99.9%)、両者がほぼ相殺している。事実上の同格として扱うのが妥当。

## 6. Historical Position Profile（11頭、単一ラベルに潰さない）

| 馬名 | evidenceCount | earlyNormMean | stdDev | nige/senko/sashi/oikomi(%) | confidence |
|---|---|---|---|---|---|
| ボーンディスウェイ | 5 | 0.620 | 0.130 | 0/0/80/20 | high |
| サヴォーナ | 5 | 0.310 | 0.171 | 0/40/60/0 | high |
| ロデオドライブ | 4 | 0.289 | 0.265 | 25/50/0/25 | high |
| ドゥレッツァ | 5 | 0.382 | 0.147 | 0/60/40/0 | high |
| ゾロアストロ | 5 | 0.546 | 0.212 | 20/0/40/40 | high |
| チェルヴィニア | 5 | 0.496 | 0.204 | 0/20/60/20 | high |
| ジュンブロッサム | 5 | 0.755 | 0.076 | 0/0/20/80 | high |
| ダノンシーマ | 5 | 0.377 | 0.171 | 20/20/60/0 | high |
| アーバンシック | 5 | 0.655 | 0.106 | 0/0/60/40 | high |
| バレエマスター | 5 | 0.800 | 0.149 | 0/0/20/80 | high |
| ステレンボッシュ | 5 | 0.460 | 0.208 | 0/20/60/20 | high |

11頭全馬がevidenceCount≥4・confidence=high。earlyNormalizedPositionMeanが
小さい（前寄り）馬: ロデオドライブ(0.289)・サヴォーナ(0.310)。大きい（後方寄り）
馬: バレエマスター(0.800)・ジュンブロッサム(0.755)。

## 7. Pre-Race Pace Prediction V1（frozen formula、無変更）

```
paceStage: pre_frame（型仕様上、常にこの値。frame/horseNumberは
                       Race Pace Prediction V1の入力型に存在しない）
continuousPacePressure: 2.75
frontPressure:          0.65
expectedPaceClass:      average
paceConfidence:         high
frontRunnerCandidateCount: 0
likelyFrontGroup: ロデオドライブ・ドゥレッツァ・サヴォーナ・ダノンシーマ・
                  ゾロアストロ・チェルヴィニア・ステレンボッシュ
```

CHECKPOINT14Cで生成した「新潟記念11頭 Pre-Frame Diagnostic」の値と
**完全一致**（continuousPacePressure/frontPressure/expectedPaceClass/
paceConfidenceのいずれも1桁まで同一）。これは意図した結果であり、
Historical Validation側の作業（CHECKPOINT14C.2G/H、新潟大賞典15頭への
Position Evidence追加）がこの11頭のいずれの過去走データも一切変更して
いないことの直接的な確認になっている（`git diff`でも確認済み、11頭に
重複馬なし）。

正式枠順が確定した今回も、Race Pace Prediction V1の入力型に
frame/horseNumberが存在しないためPre-Frame扱いのまま
（`paceStage: "pre_frame"`）——checkpoint本文の指示通り、枠確定を理由に
式・型を変更していない。

## 8. Known Model Issues

CHECKPOINT14C.2Hで数値確認済みの**KNOWN_MODEL_ISSUE**をそのまま継承する
（今回のために新規に発見・修正したものではない）:

> **frontPressureはnigeProbabilityのみの合計であり、senko（先行）確率の
> 寄与を一切含まない。** 2026-05-16新潟大賞典の検証で、senko確率>0かつ
> nigeProbability=0の馬（3頭）が、continuousPacePressureには計1.8ポイント
> 寄与しながらfrontPressureには0しか寄与しないという構造上の
> under-count（過小計上）を実データで確認した。

今回の新潟記念11頭でも同じ構造が存在する: `frontRunnerCandidateCount=0`
（representativeRunningStyleがnigeの馬が1頭も無い）にもかかわらず
`frontPressure=0.65`（複数馬が部分的にnige性を持つ、7頭が
`likelyFrontGroup`に含まれる）という、ハードカウントとcontinuousな
寄与度の間に同種の乖離が見える。**この乖離を理由にPace formulaを
今回修正することはしていない**（checkpoint本文の明示的な禁止事項）。
Actual Paceとの比較検証は、このレースが実際に行われた後の
Historical Validationフェーズで初めて可能になる。

## 9. Confidence

- **Suitability overallConfidence**: 11頭全馬が有効な値を持つ
  （evaluatedComponentCount=1〜3。0頭は無し）。
- **Position Confidence**: 11頭全馬high（6節）。
- **abilityEvidence.historyConfidence**: 10頭がhigh、ロデオドライブのみ
  medium（4走の短キャリア、shortCareer=trueとして正式に区別）。
- Confidenceとscore/probabilityは分離したまま——confidenceが
  medium/lowだからといってbaseAbility/effectiveAbilityの数値を
  縮小・変更していない（CLAUDE.md絶対原則3）。

## 10. Stage A Snapshot Persistence

既存の凍結済みFormal Prediction Snapshot V1（CHECKPOINT13.5B）を
無変更のまま使用し、immutableに保存した:

```
snapshotId: JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z
formal: true
stage: gateConfirmed
modelVersion: ability-model-v1+suitability-v1
inputVersion: checkpoint13-v1
datasetVersion: { modelVersion: "BA-V1", datasetFingerprint: "447h-916r-2d4014e6",
                   horseCount: 447, totalRaceCount: 916, maxRaceDate: "2026-08-08" }
保存先: src/ability/data/predictionSnapshots/JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z.json
```

`persistPredictionSnapshot()`（既存、無変更）による保存——既存snapshotIdへの
overwrite/mutationは構造的に禁止された経路のみを使用（同一内容の再保存は
no-op、内容が異なれば書き込み自体を拒否する設計）。datasetVersion.maxRaceDate
=2026-08-08はraceDate=2026-08-30より厳密に前であり、future leakageが
無いことをデータ面からも確認できる。

Position Profile（6節）・Pace Prediction（7節）はFormal Snapshotの
スキーマ（CHECKPOINT13.5B、変更していない）には含まれないフィールドの
ため、本報告書にのみ記録した（再現性は`computeHistoricalPositionProfile`/
`computeRacePacePrediction`をこのraceCard・horseId一覧に対して再実行すれば
常に同じ値が得られる形で保証されている）。

## 11. Ability Gap（過剰解釈しない）

- 1位(80)〜2位(77): 3点差。baseAbility自体で1.6差があり、実質的な差と
  見てよい。
- 5位(73)〜6位(73): 表示上同点だが内部値も73.1/73.0とほぼ完全な互角
  （5節参照）。「ほぼ互角」と説明するのが適切。
- 8〜10位(70/70/70): 内部値は69.9/69.9/69.7で、いずれも1点未満の差。
  3頭とも「ほぼ互角」の集団として扱うべきで、8位だから9位・10位より
  明確に強いと解釈しない方がよい。
- 11位(68)〜10位(70): 2点差。ステレンボッシュはSuitability%が98.3%と
  11頭中最低（course/going/gate全て未評価、distance適性のみやや低め）で、
  baseAbility自体(69.4)も下位グループのため、11頭中では相対的に
  裏付けの弱い評価となっている。

## 12. Regression

```
npm run validate:data   → 検証成功（エラーなし。既存の警告のみ、新規警告無し）
npm test                → Test Files 74 passed / Tests 775 passed
npm run lint            → エラー無し
npm run build            → 成功
Frozen Benchmark         → 70.3（abilityModelV1.frozenBenchmark.test.ts 3 passed）
```

`git diff --stat`で確認: Base Ability V1・Suitability V1・Historical
Position Profile V1・Race Pace Prediction V1・`raceLapData.json`・
Formal Prediction Snapshot関連ファイル（`predictionSnapshot.ts`/
`formalPredictionSnapshot.ts`/`predictionSnapshotStore.ts`/
`raceCardBridge.ts`/`raceCardTypes.ts`）はいずれも無変更。
`src/ability/data/horses/`配下も無変更（今回は既存データの読み取りのみ）。
新規追加は`src/ability/data/predictionSnapshots/`配下の1ファイルのみ。

## 13. 判定

**A-STAGE-A**

11頭の正式Stage AをBase Ability V1・Suitability V1・Race Pace Prediction
V1・Formal Prediction Snapshot V1（いずれも既存の凍結済みインフラ、
無変更）だけを使って構築し、immutable snapshotとして保存できた。
オッズ・天候・当日馬場・Track Bias・騎手補正・新規枠順補正のいずれも
混入させていない。Historical Validation（新潟大賞典）の結果も一切
反映していない。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **2026新潟記念の正式発走予定時刻の確認**: 今回は2026-08-30(日)15:45を
   ユーザー確認の上で仮定として使用した。正式な発表と異なる場合、
   新しいsnapshotId（同一raceIdでもpredictionCutoffAtが変われば別ID）で
   再生成する必要がある。
2. **CHECKPOINT14C.2Hで発見したKNOWN_MODEL_ISSUE（frontPressureの
   senko非計上構造）への対応方針**: 今回も同型の乖離が11頭で確認できる
   （8節）。モデル改善に進めるかどうかは別途決定が必要。
3. **Stage B（実馬場・雨・風・Track Bias込みの再評価）へ進むタイミング**:
   今回は明示的に着手していない。T-2h Snapshot（`buildT2hSnapshot()`、
   既存インフラ）をいつ・どの情報が確定した時点で生成するか。
4. **Odds/EV/BET判断フェーズへの着手可否**: checkpoint本文の正式順序
   （Stage B Performance → 勝率・連対率・複勝率 → Monte Carlo → 実オッズ
   → 期待値 → BET/WATCH/PASS）に従い、今回はStage Aで停止。

以上、CHECKPOINT14Dの範囲でSTOPします。Stage B・Odds・EV・BET判断へは
着手していません。

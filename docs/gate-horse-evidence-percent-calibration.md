# gate HorseEvidence → percent 校正（CHECKPOINT11.4・比較・実データ確認のみ、正式式は未確定）

**作成日: 2026-08-23。ステータス: 比較・実データ確認のみ。正式式の実装・接続は行わない。**

CHECKPOINT11.3で「gateのHorseEvidenceは事実のみ保持し、percent算出には未使用」と
明示した残課題に着手する。**今回は候補比較と実データでの感覚確認までとし、正式式の
実装は次回（ChatGPT承認後）に行う。**

---

## STEP1: CHECKPOINT11.3監査

`src/ability/suitabilityV1.ts`・`suitabilityV1Types.ts`を再確認し、以下すべてが
維持されていることを確認した（前回コミット以降、無変更）。

- distance / course / going / gate の4component構成。
- confidence shrink（`shrinkTowardCenter`、high=1.0/medium=0.6/low=0.3を再利用）。
- `sampleCount=0`は`evaluated=false`・`confidence="unknown"`。
- `aggregateSuitabilityComponents()`はevaluatedなcomponentのみで単純平均。
- 最終`clamp(90,110)`は使用せず、`SUITABILITY_V1_SAFETY_MIN/MAX=60/120`のみ。
- CoursePrior単独の最大影響幅`GATE_COURSE_PRIOR_AMPLITUDE=5`pt。
- Ability Model V1関連ファイル・`finalRaceAbility.ts`・`suitability.ts`・
  `suitabilityCoreV1.ts`・`courseContextPrior.ts`はいずれも無変更。
- `effectiveAbility`への接続は無し（`suitabilityV1.ts`はbaseAbilityを一切importしていない）。

**問題なし。次のSTEPへ進む。**

---

## STEP2: gate HorseEvidenceの元データ確認

`horseGateEvidence.ts`の`collectHorseGateEvidence()`が実際に返す`HorseEvidenceRun`は
以下のみ:

| 項目 | 利用可能か |
|---|---|
| sampleCount | ✅（`HorseEvidence.sampleCount = runs.length`） |
| 各走の枠順（frame） | ✅ |
| fieldSize | ✅ |
| relativeGatePosition | ✅（`calculateRelativeGatePosition()`で算出済み） |
| raceScore | ❌ **`HorseEvidenceRun`型に存在しない**（`HorseEvidenceSourceRace`が`Pick<RacePerformance, "raceId"\|...\|"finishPosition">`で意図的に絞られているため） |
| abilityBeforeRace | ❌ **どこにも保持されていない**（RacePerformance型自体にこのフィールドは無く、`calculateAbilityBeforeRace()`をその都度呼ぶ必要がある） |
| rawPerformanceDelta | ❌ 未算出（上記2つが無いため計算できない） |
| confidence | ✅（`horseEvidenceConfidence.ts`の`getHorseEvidenceConfidence()`で別途算出可能） |
| finishPosition | ✅ 保持されているが、**適性評価には使わない**（下記参照） |

**重要な誤解防止**: `collectHorseGateEvidence()`の**戻り値の型**にraceScoreが
無いだけで、渡している`recentRaces: RacePerformance[]`自体にはraceScoreが
含まれている（構造的部分型で渡しているだけ）。したがって、rawPerformanceDeltaを
計算するには`horseGateEvidence.ts`を変更する必要はなく、**別途RacePerformance[]から
直接、同じマッチ条件（racecourse×surface×distance完全一致）でraceScoreと
abilityBeforeRaceを取り出す薄い関数を新設すればよい**（次回の実装スコープ）。

**着順・人気・オッズの扱い**: `finishPosition`はHorseEvidenceRunに保持されている
（監査用）が、**今回検討するどの候補（A〜D）もfinishPositionを直接の入力に使わない**
（raceScoreは既にmemberLevel/timeGap/final3F/weight込みの5要素加重平均であり、
finishPositionそのものではない）。人気・オッズは元データにも存在せず使用していない。

**future leakage**: `abilityBeforeRace`は`calculateAbilityBeforeRace()`
（Ability Model V1凍結済み関数、無変更で再利用）を、対象走より**厳密に前**の
最大5走のraceScoreに対して呼ぶ必要がある。STEP8の実データ検証でもこの規律を
厳密に守った（日付昇順に並べ替えた上で、対象走のインデックスより前の要素だけを
スライスして使用）。

---

## STEP3: HorseEvidence → percent候補比較

| 候補 | 概要 | future leakage | 少数サンプル耐性 | 外れ値耐性 | Base Ability二重評価リスク | 解釈可能性 | 実装コスト | HorseEvidence V1整合性 |
|---|---|---|---|---|---|---|---|---|
| **A. rawPerformanceDeltaの線形変換** | `rawPercent = 100 + median(delta) × coefficient`（delta = raceScore − abilityBeforeRace） | 安全（`calculateAbilityBeforeRace`を対象走より前だけに適用） | 良い（median採用、HorseEvidence V1で実証済み） | 良い（median、ゴールドシップ有馬記念で実証済み） | **低**（絶対raceScoreでなく自分の基準との差） | 高い（点差がそのまま意味を持つ） | 中（abilityBeforeRaceを走ごとに再計算する必要がある） | **完全一致**（HorseEvidence V1の`rawPerformanceDelta`定義そのもの） |
| B. 自身のraceScore分布に対するz-score正規化 | `zScore=(raceScore−mean)/stdev`、`rawPercent=100+median(zScore)×amplitude` | 中（recentRacesプールの区切り方に依存、系統Aと同じ弱点） | **悪い**（n<3でstdevが不安定） | 中 | 中（stdevで割ることで「安定した馬ほど同じ点差が大きく評価される」逆転が起きうる） | 中 | 中 | 低（HorseEvidence V1の定義と異なる別設計） |
| C. 条件一致 vs 不一致の平均差 | `diff=matchedAvg−unmatchedAvg`、`rawPercent=100+diff×coefficient` | 中（同上） | **悪い**（直近5走をmatched/unmatchedに分割するとさらに小サンプル化） | 悪い（平均ベース、時期的な好不調の混入リスク） | 中（unmatched側の時期が偏ると「単に近況が良い/悪い」を条件適性と誤認しうる） | 中〜高 | 低 | 低（別設計） |
| **D. Aのtanh飽和変換** | `rawPercent = 100 + tanh(median(delta)/scale) × amplitude`（`final3FScore.ts`/`runningStyle.ts`で既に使われているtanh変換パターンを踏襲） | Aと同じく安全 | Aと同じく良い | **Aより良い**（外れ値でも飽和し無限に伸びない） | Aと同じく低い | 中〜高（tanhの直感性はやや落ちるが既存コードに前例あり） | 中（Aと同じ計算＋tanh 1行） | Aの正式変種（rawPerformanceDelta/median定義は維持、percent変換部のみ非線形） |

**候補B・Cは不採用の方向**: いずれも小サンプル耐性・future leakage安全性の面で
候補Aに劣り、かつ既存HorseEvidence V1（rawPerformanceDelta/median）とは別設計に
なってしまう（プロジェクト内に3つ目の並行設計を作ることになり、STEP1〜STEP2で
既に問題視した「系統の並存」を悪化させる）。

**推奨: 候補A（rawPerformanceDelta＋median、HorseEvidence V1の定義そのもの）を
基盤とし、線形係数ではなく候補D（tanh飽和変換）でpercentへ変換する。**
理由はSTEP8の実データ検証で示す。

---

## STEP4: HorseEvidenceは絶対能力ではないことの確認

候補A/Dはいずれも`raceScore − abilityBeforeRace`という**本人基準の差**のみを
使う。CHECKPOINT11.4が示した例（強い馬A: 75→76, delta=+1／弱い馬B: 55→59,
delta=+4）を実際に計算式へ通すと、**弱い馬Bの方が大きいdeltaを示す**——絶対
raceScoreの大小（76 vs 59）ではなく、本人にとっての伸び幅（+1 vs +4）で評価される。
これはBase Abilityの絶対値をpercentへ混入させない設計であり、STEP4の要求と一致する。

**Base Abilityの二重加点防止**: `overallSuitabilityPercent`は最終的に
`effectiveAbility = baseAbility × overallSuitabilityPercent / 100`へ接続される
想定（未接続）だが、`overallSuitabilityPercent`の算出に`baseAbility`自体や
`raceScore`の絶対値を一切使わない（候補A/Dとも`delta`のみ）ため、
「能力が高い馬だから自動的にSuitabilityも高くなる」という回路は存在しない。

---

## STEP5: gate特有の評価単位（relativeGatePosition）

`horseGateEvidence.ts`の`HorseEvidenceRun.relativeGatePosition`
（`(horseNumber-1)/(fieldSize-1)`、0〜1の連続値）は既に利用可能。

**推奨設計（次回実装時の方針、今回は未実装）**: 対象走（今回のレース）の
`relativeGatePosition`と、本人の過去各走の`relativeGatePosition`の近さに応じて
重み付けする方式を、`distanceSuitability.ts`の距離帯近似度による重み付け
（1.0/0.6/0.3/0）と同じ発想で導入する。1番/10頭と1番/18頭を同じ「内枠」として
一律に扱わないという指示に合致する。**重みの具体的な減衰関数（線形／距離帯型／
ガウシアン等）は今回決定しない。**

**CoursePriorとの役割分離**: 現行`suitabilityV1.ts`の実装（CHECKPOINT11.3）が
既にこの分離を満たしている——`SuitabilityComponentResultV1.horseEvidence`
（本人実績、STEP2〜5で扱う対象）と`.coursePrior`（東京ダート1600m構造事前分布、
`courseContextPrior.ts`）は別フィールドとして保持されたままであり、1つの数値へ
混ぜる処理はまだ存在しない。今回の変更もこの分離を崩さない。

---

## STEP6: 少数サンプル時の扱い・confidence不一致の監査

候補A/Dとも、`median(delta)`を`shrinkTowardCenter(rawPercent, confidence)`に
通す設計とする（distance/course/goingと同じ既存パターンをそのまま踏襲、新しい
縮小方式は作らない）。

**confidence不一致の実態**（CHECKPOINT11.2 STEP5で既に指摘、今回実データで再確認）:

| sampleCount | Suitability側（`baseConfidenceFromSampleCount`、CHECKPOINT11.3のunknown上書き後） | HorseEvidence側（`resolveHorseEvidenceConfidence`） |
|---|---|---|
| 0 | unknown | unknown |
| 1 | low | low |
| 2 | **medium** | **low** |
| 3 | medium | **medium** |
| 4 | **high** | medium |
| 5+ | high | high |

sampleCount=2と4で**ラベルは同じでも意味する実際のデータ量が異なる**
（2走をmediumと呼ぶかlowと呼ぶか、4走をhighと呼ぶかmediumと呼ぶか）。
distance/course/goingの`confidence`とgateの`confidence`を同じ`overallSuitability`
平均の中で扱う以上、この不一致は解消すべき実害のある問題である。

---

## STEP7: confidence統一候補比較

| 案 | 内容 | 評価 |
|---|---|---|
| A. Suitabilityを4段階（HorseEvidenceの境界に合わせる: 0=unknown/1-2=low/3-4=medium/5+=high）へ統一 | `baseConfidenceFromSampleCount`の閾値をHorseEvidence側に合わせて変更 | **推奨**。HorseEvidence V1のconfidence閾値は凍結済み仕様（`docs/horse-evidence-v1.md`）であり変更不可。Suitability側（`suitabilityConfidence.ts`の`baseConfidenceFromSampleCount`、CHECKPOINT9より前の第22実装由来）は凍結対象外のため、こちらを合わせる方が既存の frozen 仕様を一切変更せずに済む |
| B. HorseEvidenceを3段階（low/medium/high、unknown廃止）へ落とす | HorseEvidence側のunknownを他へ統合 | **不採用**。HorseEvidence V1凍結仕様の「sampleCount=0を明示的にunknownとし、neutral/low等へ変換しない」という原則（`docs/horse-evidence-v1.md`・CHECKPOINT10.6）に反する。凍結仕様の変更は今回のSTOP条件でも明示的に禁止されている |
| C. 内部4段階・UI表示のみ3段階 | 表示層でのみ統合 | 不十分。STEP6で示したのは**境界値（sampleCount何走からmedium/highか）の不一致**であり、表示段階の話ではない。表示だけ揃えても計算上の不整合は残る |

**推奨: 案A。** ただしこれは`suitabilityConfidence.ts`の`baseConfidenceFromSampleCount`
の**閾値変更**にあたるため、今回の「限定自動修正ループ」の対象外（STOPして
ChatGPTの承認を待つべき変更）として扱い、**今回は実装しない**。

---

## STEP8: 実データでのpercent幅確認

`gateValidationV1.ts`の東京ダート1600m30レースデータには**raceScore・timeGap等が
存在せず**、gate限定のrawPerformanceDeltaを実データで直接計算することはできない
（既知の制約、CHECKPOINT10系列から継続）。

代わりに、`data/horses/`の実データ全体（40頭）から、**同一馬×同一
racecourse×surface×distance（`horseGateEvidence.ts`と同じマッチ条件）への
再訪問レース**についてrawPerformanceDeltaを計算し、「gate限定ではないが
condition-repeat型deltaの代表値」として分布を確認した（読み取り専用スクリプト、
`calculateAbilityBeforeRace()`を無変更のまま再利用、報告後に削除）。

```
sampleCount(delta) = 11（40頭中、再訪問条件を満たした走のみ）
min = -1.10 / p25 = 2.55 / median = 5.20 / p75 = 7.40 / max = 12.20
```

**候補A（線形）**:

| coefficient | p25 | median | p75 | min | max | ±10%以上の頻度 |
|---|---|---|---|---|---|---|
| 0.5 | 101.3 | 102.6 | 103.7 | 99.5 | 106.1 | 0/11（0%） |
| 1.0 | 102.5 | 105.2 | 107.4 | 98.9 | 112.2 | 2/11（18.2%） |
| 2.0 | 105.1 | 110.4 | 114.8 | 97.8 | 124.4 | **6/11（54.5%）→過補正** |

**候補D（tanh飽和）**:

| scale / amplitude | p25 | median | p75 | min | max | ±10%以上の頻度 |
|---|---|---|---|---|---|---|
| 5 / 5 | 102.3 | 103.9 | 104.5 | 98.9 | 104.9 | 0/11（0%） |
| 5 / 10 | 104.6 | 107.8 | 109.0 | 97.8 | 109.8 | 0/11（0%） |
| 10 / 10 | 102.5 | 104.8 | 106.3 | 98.9 | 108.4 | 0/11（0%） |

**STEP3の推奨（候補D）を裏付ける結果**: 線形変換はcoefficientを大きくすると
STEP8自身の基準（±10%以上が頻発＝過補正）に抵触する（coefficient=2.0で
54.5%が該当）。tanh飽和変換は試したいずれのscale/amplitude組でも±10%を
一度も超えなかった——**係数の選び方に対して構造的に安全側**である。

**サンプル数についての率直な限界**: n=11は非常に小さく、これ単体で係数を
確定できるだけの統計的根拠ではない。今回はあくまで「候補式の挙動の感覚を
実データで掴む」ためのものであり、**正式な係数決定にはより大きなサンプルが
必要**（次回以降の課題、STEP21）。

---

## STEP9: 能力9割思想との整合性チェック（baseAbility=70参考表示）

`effectiveAbility`本体には接続していない。参考計算のみ。

| gatePercent | 70 × gatePercent / 100 |
|---|---|
| 97% | 67.9 |
| 100% | 70.0 |
| 103% | 72.1 |
| 105% | 73.5 |
| 110% | 77.0 |

STEP8の実データ（tanh候補、scale=5/amplitude=5〜10）が示すgate単独の実際の
変動幅（97.8〜109.8%）は、この参考表からeffectiveAbility換算でおおよそ
68.5〜76.9の範囲に収まる——baseAbility70の馬がgate要因だけでbaseAbility50台や
90台の馬と入れ替わるような極端な逆転は起きない。**「枠順だけで能力評価が
大きく逆転しない」という大原則と、STEP8の実データ結果は整合している。**

---

## STEP10: 60〜120安全境界の監査

- CHECKPOINT11.3のCASE A〜Dテスト（実データではなく設計上の想定値）では、
  安全境界は一度も発動しなかった（意図的な極端値テストでのみ発動を確認済み）。
- 今回のSTEP8実データ検証でも、**採用候補（D、tanh）はいずれの設定でも
  97.8〜109.8%の範囲に収まり、60〜120には遠く及ばない**。境界に接近したのは
  STEP3で不採用と判断した候補A・coefficient=2.0のみ（max=124.4、実際に安全境界
  120を上回りclampされる水準）。

**結論: 60〜120は今回変更しない。** 実データ・CASEテストいずれからも、
妥当な候補式であれば安全境界に到達しないことが確認でき、逆に安全境界へ
到達する候補（過大なcoefficientの線形式）はSTEP8で既に不採用と判断済みである
ため、境界自体を動かす根拠が無い。

---

## STEP11: effectiveAbility接続までの残課題

| 項目 | 状態 |
|---|---|
| gate percent正式式 | **未確定**（候補Dが有力、coefficient/scale/amplitudeは次回決定） |
| confidence統一 | **未確定**（案A推奨、`suitabilityConfidence.ts`の閾値変更が必要、次回実装） |
| unknownの扱い | 確定済み（evaluated=false、平均から除外、CHECKPOINT11.3で実装済み） |
| CoursePrior | 確定済み（東京ダート1600m限定、±5pt上限、CHECKPOINT11.3で実装済み） |
| gate以外のCoursePrior拡張 | 未着手（distance/course/goingには現状CoursePrior無し、CHECKPOINT11で既出） |
| runningStyle/surface/turn | 未実装（V1スコープ外、CHECKPOINT11.1で決定済み） |
| 実馬テスト | **未実施**。今回のSTEP8はn=11の一般データであり、gate限定・複数の実際の
  候補馬（例: キーンランドC出走予定馬）でcomputeSuitabilityV1()を実際に走らせて
  結果を目視確認するラウンドがまだ無い |
| finalRaceAbility.tsとの接続方法 | CHECKPOINT11.1のSTEP8で設計済み（`finalRaceAbility.ts`内部の
  `computeSuitabilityBreakdown()`呼び出しを`computeSuitabilityV1()`へ差し替える）が
  未実施 |

**effectiveAbilityへ安全に接続するために、あと最低限必要なもの**:
1. gate percent正式式の確定（本CHECKPOINTの次）。
2. confidence統一（案A実装）。
3. 実馬（複数頭）でのcomputeSuitabilityV1()目視テスト——CASE A〜Dのような
   合成データだけでなく、実際の出走予定馬で結果が常識と乖離しないことの確認。
4. `finalRaceAbility.ts`側の差し替え方針の最終合意（CHECKPOINT11.1で設計済みだが
   実施タイミング未決定）。

---

## 限定自動修正ループの適用状況

今回、型エラー・lintエラー・buildエラー・テストコード上のミスは発生しなかった
（新規追加は読み取り専用の検証スクリプトのみで、実装ファイルの変更は無し）。
数式変更・閾値変更・補正幅変更・confidence定義変更・HorseEvidenceの意味変更・
Suitability統合式変更は今回いずれも実施していない（すべて比較・提案のみ）。

---

## 変更禁止・STOP条件の遵守

`raceScore`・`baseAbility`・`memberLevel`・`timeGapScore`・`raceTimeScore`・
`final3FScore`・`weightScore`・HorseEvidence V1の正式仕様・`finalRaceAbility.ts`・
`RaceContext`・`trackBias`はいずれも今回変更していない。`effectiveAbility`本番接続・
Race Review Engineにも進んでいない。`suitabilityV1.ts`・`suitabilityV1Types.ts`も
今回は無変更（読み取り専用の検証スクリプト1件を追加し、報告後に削除するのみ）。

---

## 完了報告（21項目）

1. **CHECKPOINT11.3監査結果**: 全項目維持を確認、問題なし（STEP1）。
2. **gate HorseEvidence利用可能データ**: sampleCount/frame/fieldSize/
   relativeGatePosition/confidenceは利用可能。raceScore/abilityBeforeRace/
   rawPerformanceDeltaは`horseGateEvidence.ts`の戻り値には無いが、渡している
   RacePerformance[]自体には存在するため新規の薄い関数で計算可能（STEP2）。
3. **percent変換候補A〜D**: A(rawPerformanceDelta線形)/B(z-score正規化)/
   C(matched vs unmatched平均差)/D(Aのtanh飽和変種)（STEP3）。
4. **各候補の長所・短所**: STEP3の表参照。B・Cは小サンプル耐性・future leakage
   安全性で劣り、HorseEvidence V1との整合性も低い。
5. **推奨候補**: A（rawPerformanceDelta/median、HorseEvidence V1の定義そのもの）を
   基盤とし、percent変換部に候補D（tanh飽和）を採用する方向を推奨。係数は未確定。
6. **Base Ability二重評価防止確認**: 候補A/Dとも本人基準の差分（delta）のみを
   使い、絶対raceScore・baseAbilityを直接参照しないことを確認（STEP4）。
7. **relativeGatePositionの扱い**: 既に利用可能。将来は対象走とのrelativeGatePosition
   近似度による重み付け（distanceSuitability.tsと同型のパターン）を推奨するが、
   減衰関数は今回未確定（STEP5）。
8. **CoursePriorとの役割分離**: 既存実装（CHECKPOINT11.3）のhorseEvidence/
   coursePrior分離構造を維持、今回変更なし（STEP5）。
9. **sampleCount/confidenceの扱い**: median集約＋shrinkTowardCenterの既存
   パターンを踏襲予定（STEP6）。
10. **confidence統一案A〜C比較**: STEP7の表参照。
11. **confidence推奨案**: 案A（Suitability側の閾値をHorseEvidence側の4段階へ
    統一）。ただし閾値変更のため今回は実装せず、次回のSTOP対象として明記。
12. **実データpercent分布**: STEP8参照。n=11、候補A(coefficient=1)でmedian105.2%・
    max112.2%、候補D(scale5/amplitude10)でmedian107.8%・max109.8%。
13. **過補正が発生したケース**: 候補A・coefficient=2.0で±10%以上が54.5%
    （6/11件）発生、過補正候補と判定（STEP8自身の基準に基づく）。
14. **Base Ability=70での参考影響**: gate97〜110%でeffectiveAbility参考値
    67.9〜77.0（STEP9、本番未接続）。
15. **60〜120安全境界監査**: 妥当な候補（D）では到達せず、過補正候補（A・
    coefficient=2.0）でのみ接近・超過。今回は境界を変更しない（STEP10）。
16. **effectiveAbility接続までの残課題**: gate percent正式式・confidence統一・
    実馬複数頭テスト・finalRaceAbility.ts差し替えタイミング合意の4点（STEP11）。
17. **Base Abilityへの影響0確認**: Ability Model V1ファイル群・`suitabilityV1.ts`・
    `suitabilityV1Types.ts`とも今回無変更（読み取り専用検証のみ）。
18. **baseAbility=70.3再現確認**: `abilityModelV1.regression.test.ts`で確認、
    変化なし（下記test結果参照）。
19. **test/lint/build/validate:data**: 下記参照。
20. **変更ファイル一覧**: `docs/gate-horse-evidence-percent-calibration.md`
    （新規、本ドキュメント）のみ。検証用の`zzz_gateEvidencePercentDistribution.test.ts`
    は報告後に削除（コミットしない）。
21. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. gate HorseEvidence → percentの正式式（候補D・tanh飽和を軸に、scale/
       amplitudeの具体値）。
    2. Suitability confidence閾値をHorseEvidence側（0/1-2/3-4/5+）へ統一するか
       （案A、`suitabilityConfidence.ts`の閾値変更を伴う）。
    3. gate限定のより大きな実データセット（現状n=11は一般condition-repeatで
       gate限定ではない）の要否。
    4. relativeGatePosition近似度による重み付け関数の具体設計。
    5. 実馬（複数頭）でのcomputeSuitabilityV1()目視テストの実施タイミング。

## test/lint/build/validate:data

```
npm test              # 521/521成功（zzz_検証含む。報告後にzzz_ファイルを削除して再確認）
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

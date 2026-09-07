# CHECKPOINT 14D.1 — Niigata Turf 2000 Gate Suitability Gap Audit / Stage A Explainability

CHECKPOINT14D（`JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z`）の
Stage A Snapshotについて、「枠順が新潟芝2000mではスコアへ影響していない」ことの
根本原因をコード・データ両面から監査した記録。**新潟Gate補正の実装は今回行っていない
（禁止事項通り）。既存Snapshotの削除・変更も行っていない。**

## STATUS = PROVISIONAL_STAGE_A

CHECKPOINT14DのStage A Snapshotは**削除・上書きしていない**（ファイルは無変更のまま
`src/ability/data/predictionSnapshots/`に存在する）。ただし本CHECKPOINTの結論として、
そのSnapshotの評価内容は**PROVISIONAL**（Niigata Turf 2000 Gate Suitabilityが未検証の
状態）として扱う。正式FREEZEは今回行わない。これは新しいコード状態ではなく、
運用上の位置づけ（このドキュメント自体が監査履歴）である。

---

## 1. なぜ東京ダート1600m限定なのか（コード監査、推測なし）

Suitability V1の「gate」componentは、実際には**2つの独立した経路**を持つ
（`suitabilityV1.ts`の`computeGateSuitabilityV1()`）。この2経路を混同すると
「gateは東京ダート1600m限定」という誤解が生まれるため、明確に分離して説明する。

### 経路A: HorseEvidence（本人実績）——コース非依存、新潟でも機能する

`collectGateHorseEvidenceDeltas()`は、対象馬自身の過去走のうち
`racecourse×surface×distance`が対象条件と**完全一致**する走から、
`raceScore − abilityBeforeRace`（HorseEvidence V1と同一定義）を算出する。
**この関数はracecourseを問わない汎用ロジックであり、コードのどこにも
「東京ダート1600m限定」という条件は存在しない。** 新潟であっても、対象馬に
新潟×turf×2000mの実過去走があれば、この経路は正しく機能する
（現に、CHECKPOINT14Dの11頭中バレエマスターはこの経路で`gate.evaluated=true`に
到達した——`source: "horseEvidence"`、13節参照）。

### 経路B: CoursePrior（コース構造由来の事前分布）——東京ダート1600m限定

`computeGateCoursePriorDetail()`は`isTokyoDirt1600(target)`が`true`の場合のみ
動作する（`suitabilityV1.ts` 97-103行）。この限定は**設計判断であり、バグや
未実装ではない**。根拠は`docs/gate-suitability-v1-decision.md`
（CHECKPOINT10.3、2026-08-22確定）にコード変更履歴と共に記録されている:

- CHECKPOINT6〜10.2で、東京ダート1600mについてのみ「芝スタートで外側ほど芝区間が
  約30m長い」という構造的根拠（JRA-VAN・競馬ラボ等の複数ソース）に基づく
  CoursePriorを実データ検証した（10戦157頭→30戦451頭）。
- 検証の結果、frame-finishPosition相関係数は「-0.1267」（10戦時点、方向は一致）
  →「+0.0081」（30戦時点、ほぼゼロ・符号反転）と不安定だった。
- 方針として「方向情報（gateBiasLevel・gateCoefficientの符号）は保持するが、
  強い数値補正の根拠には使わない」案Dを採用し、
  `EmpiricalValidationStatus = "weakOrUnstable"`を導入した。
- **他コースへの一般化は、この検証プロセス自体が東京ダート1600m用にしか
  行われていないため、意図的に実施していない**（`docs/gate-suitability-v1-decision.md`
  STEP2に「案A〜E比較」があるが、これはすべて東京ダート1600mのCoursePrior自体の
  扱いについての議論であり、他コースへの拡張案は文書内に存在しない）。

**結論**: 「gate componentが新潟で機能しない」という表現は不正確。正確には
「CoursePrior（経路B）が東京ダート1600m限定」であり、「HorseEvidence（経路A）は
コース非依存だが、新潟に該当する実過去走を持つ馬が少ないため、多くの馬で
evaluated=falseになっている」というデータ不足の問題である。

---

## 2. 現在のGate Suitability対応コース一覧

| racecourse | surface | distance | courseLayout | gateModelAvailable | 対応経路 | sampleSize | confidence |
|---|---|---|---|---|---|---|---|
| 東京 | dirt | 1600 | - | **true** | CoursePrior + HorseEvidence | 30戦451頭（CoursePrior検証時点） | weakOrUnstable |
| 新潟 | turf | 2000 | 外回り | **HorseEvidenceのみ**（対象馬に実績があれば） | HorseEvidenceのみ | 1レース13頭（4節） | 個別馬でlow〜medium |
| その他全コース | - | - | - | CoursePriorはfalse固定 | HorseEvidenceのみ | コースごとに異なる | - |

`data/courseKarte/`配下には`tokyoDirt1600.json`のみ存在（3節）。CoursePriorという
意味でのgateModelは東京ダート1600m以外**未実装**。

---

## 3. 新潟芝2000m Course Karte監査

`src/ability/data/courseKarte/`配下を確認した結果、**新潟のCourse Karteファイルは
存在しない**（`tokyoDirt1600.json`のみ）。`docs/gate-suitability-v1-decision.md`の
コメントから、CHECKPOINT6で「course_karte_v1_5courses.zip」という5コース分の
ソースが監査されたことが分かるが、**残り4コースが具体的にどのコースだったかは
repository内のいかなるdoc・commitにも記録が見つからなかった（unknown）**。
推測では補わない。

| 項目 | 値 |
|---|---|
| 外回りとして構造化されているか | **一部裏付けあり**。`data/horses/`側のCourse Suitability計算には
  courseLayoutフィールド自体が存在しないため未対応。ただし別系統の`raceLapData.json`
  （CHECKPOINT14C.1、Pace Validation専用の別ファイル）の`JRA-20260516-NIIGATA-11`
  エントリに`courseLayout: "outer"`という値がある（5節でクロス確認）。 |
| スタート地点 | unknown（repository内に記載無し） |
| 最初のコーナーまでの距離 | unknown |
| コーナー数 | unknown |
| 直線長 | unknown |
| 高低差 | unknown |
| 枠順関連field | `RacePerformance`/`RaceHistoryRawInput`型には`gate`（枠番）・`horseNumber`
  （馬番）フィールドが存在する（値の有無は馬ごとに異なる）。`courseLayout`・
  `courseVariant`フィールドはこの型には存在しない。 |
| A/B等course variation | unknown（`courseVariant`フィールド自体が`data/horses/`側のスキーマに無い） |
| Track Biasとの分離 | 型レベルで分離されている——`trackBias.ts`/`trackBiasFactor.ts`は
  Suitability V1（gate含む）とは別のSTEP5レイヤーであり、`computeSuitabilityV1()`
  からは一切参照されない（`finalRaceAbility.ts`のSTEP5でのみ合流する設計、
  CHECKPOINT14DでSTEP5自体を呼んでいないため、今回のStage AにTrack Biasは
  一切混入していない）。 |

---

## 4. 新潟芝2000m Historical Race Data監査

`data/horses/*.json`（全447ファイル・916走）を横断的に集計した結果:

| 項目 | 値 |
|---|---|
| totalRaces（racecourse=新潟・surface=turf・distance=2000） | **1レース**（`JRA-20260516-NIIGATA-11`、新潟大賞典） |
| totalRunners | 13頭（実データとして存在する行数） |
| dateRange | 2026-05-16 〜 2026-05-16（単一日） |
| fieldSize distribution | 15（`raceLapData.json`側の記録による。`data/horses/`側の
  各行に`fieldSize`が入っているのは1/13行のみ） |
| going distribution | 良: 13/13（単一条件） |
| gate available rate | 13/13 |
| horseNumber available rate | 13/13 |
| finishPosition available rate | 13/13 |
| passingPosition available rate | 1/13 |

**outer courseの識別**: `data/horses/`側には`courseLayout`フィールドが無いため
このレース自体では判定不能だが、別ファイル`raceLapData.json`
（CHECKPOINT14C.1〜2C）の同一raceIdエントリに`courseLayout: "outer"`という
値がクロスリファレンスとして存在する（3節）。他のレースについては、
この種のクロスリファレンスが存在しないため判定不能。

**統計的検証可能量の判断**: **不可能。** 1レース・単一日付・単一going条件
（良のみ）・fieldSize情報も実質1件のみでは、frame別成績の統計的傾向を
検出する土台が無い。5節で述べる「観測された枠別成績」の分離すら、n=1レースでは
意味を持たない。

---

## 5. 枠番と馬番の区別（監査手順の確認）

今回の監査ではframe（枠番）とhorseNumber（馬番）を全て区別して集計した（4節の
`gateAvailableRate`と`horseNumberAvailableRate`は別々に算出）。ただし前述の通り
対象条件のレースが1件のみのため、frame別・horseNumber別いずれの統計分析も
今回は実施していない（母数が無い）。

---

## 6〜9. Gate Metrics設計 / Ability Control可否

現状のデータ量（1レース）では、starts/wins/winRate/top2Rate/top3Rate/
averageFinishNormalized/expectedVsActualのいずれも**算出しても統計的に無意味**
（n=1では母集団を語れない）。

**Ability Control自体の実行可否**: 設計上は可能——既存の`calculateAbilityBeforeRace`
（frozen、Ability Model V1）を使い、対象走の「その走時点での実力水準」と実際の
raceScoreとの残差を取る仕組みは、`collectGateHorseEvidenceDeltas`が既にこの方式で
実装している（2節で説明した経路A、future leakage対策込みで動作確認済み——
CHECKPOINT12.3で実コードトレースにより確認済み）。今回新たに実装や検証はしていない
（データが無いため）が、**仕組み自体は既存かつ検証済み**であることは明記しておく。

---

## 10〜11. Going別分離 / Track Biasとの分離

- **Going別分離**: 今回のrepository内データはgoing="良"のみ（4節）のため、
  分割は不可能（サンプル不足）。
- **Track Biasとの分離**: 概念上、Gate Suitability（構造的・静的）とTrack Bias
  （開催週・当日変動）は既にコード上分離されている（3節の表参照）。Suitability V1
  （`computeSuitabilityV1`）はTrack Bias関連コード（`trackBias.ts`/`trackBiasFactor.ts`）
  を一切importしていない。

---

## 12. Pace / PositionとのInteraction（Future Candidate記録のみ）

今回は新しい補正式を作らないため調査は行っていない。「外枠の先行馬」「内枠の
差し馬」というinteractionは、Historical Position Profile V1（脚質分布）と
Gate Suitabilityが将来組み合わされる可能性がある領域として、Future Candidateに
留める（実装判断は次CHECKPOINT以降）。

---

## 13. Sample Size / Confidence設計（提案のみ）

新潟専用のGate Suitability V1を将来実装するなら、既存の`resolveHorseEvidenceConfidence`
（HorseEvidence V1凍結仕様、4段階: 0=unknown/1-2=low/3-4=medium/5+=high）を
**そのまま再利用する**のが既存設計と整合する（東京ダート1600mのHorseEvidence経路も
同じ関数を使っている、実コード確認済み）。新規confidence閾値は提案しない。
十分なsample数が無い場合は`evaluated=false`を返す既存の分岐パターン
（`suitabilityV1.ts`の各component共通の設計）をそのまま踏襲できる。

---

## 14. Shrinkage方針

`shrinkTowardCenter`（既存、`adjusted = 100 + (raw - 100) × confidenceWeight`、
weight: high=1.0/medium=0.6/low=0.3）は東京ダート1600mのgate componentで
既に使われている（`suitabilityV1.ts`）。新潟専用に別のshrink方式・weightを
新設する理由は今回の監査からは見出せなかった——既存方式の再利用を推奨する
（新規magic coefficientの提案はしない）。

---

## 15/16. 判定に向けて：データは不足している

4節の通り、対象条件（新潟×turf×2000m）のレースはrepository内に**1件のみ**。
統計的なGate Suitability検証には全く不十分であり、**B-DATA**と判断する
（19節で確定）。`docs/checkpoint14d1-niigata-turf2000-gate-data-request-manifest.json`
/ `.md`（machine-readable + human-readable）を本ラウンドで作成した。

---

## 17. Stage A Board 3ランキング比較（11頭）

### A. Base Ability Ranking（馬そのものの絶対能力）

| 順位 | 馬名 | Base Ability |
|---|---|---|
| 1 | ダノンシーマ | 78.3 |
| 2 | ロデオドライブ | 76.7 |
| 3 | ゾロアストロ | 74.8 |
| 4 | ボーンディスウェイ | 73.1 |
| 5 | ジュンブロッサム | 72.7 |
| 6 | バレエマスター | 72.4 |
| 7 | アーバンシック | 72.1 |
| 8 | サヴォーナ | 70.2 |
| 9 | ステレンボッシュ | 69.4 |
| 10 | チェルヴィニア | 69.1 |
| 11 | ドゥレッツァ | 67.4 |

### B. Niigata Turf 2000 Suitability Ranking（今回コースへの適性のみ）

| 順位 | 馬名 | Suitability% | evaluated数 |
|---|---|---|---|
| 1 | ドゥレッツァ | 103.7% | 1 |
| 2 | ダノンシーマ | 101.9% | 1 |
| 3 | バレエマスター | 101.7% | 3 |
| 4 | チェルヴィニア | 100.9% | 1 |
| 5 | ジュンブロッサム | 100.6% | 2 |
| 6 | アーバンシック | 100.1% | 1 |
| 7 | ロデオドライブ | 100.0% | 1 |
| 8 | ボーンディスウェイ | 99.9% | 1 |
| 9 | サヴォーナ | 99.6% | 1 |
| 10 | ゾロアストロ | 99.4% | 2 |
| 11 | ステレンボッシュ | 98.3% | 1 |

（**gate componentは11頭中10頭がevaluated=false**——1節の通りHorseEvidence
（経路A）に必要な「新潟×turf×2000mの本人実過去走」を持つのがバレエマスターの
1頭のみのため。CoursePrior（経路B）は東京ダート1600m限定のため今回11頭全馬で
使用不可。Bランキングの序列はほぼdistance componentが決めている。）

### C. Provisional Stage A Ranking（能力×現時点で評価可能な適性）

| 順位 | 馬名 | Score |
|---|---|---|
| 1 | ダノンシーマ | 80 |
| 2 | ロデオドライブ | 77 |
| 3 | ゾロアストロ | 74 |
| 4 | バレエマスター | 74 |
| 5 | ジュンブロッサム | 73 |
| 6 | ボーンディスウェイ | 73 |
| 7 | アーバンシック | 72 |
| 8 | サヴォーナ | 70 |
| 9 | ドゥレッツァ | 70 |
| 10 | チェルヴィニア | 70 |
| 11 | ステレンボッシュ | 68 |

A（Base Ability）とC（Provisional Stage A）の順位はほぼ一致——4〜7位の並びが
入れ替わる程度で、Suitability補正が±3.7pt以内（10節の通り小さい）に収まって
いるため、能力序列を大きく覆すような変動は無い。

---

## 18. 11頭 Score Decomposition

| 馬名 | Base Ability | evidence数 | confidence | Suitability% | evaluated | Effective Ability | Stage A(表示) |
|---|---|---|---|---|---|---|---|
| ダノンシーマ | 78.3 | 5 | high | 101.9% | 1(distance) | 79.8 | 80 |
| ロデオドライブ | 76.7 | 4(short career) | medium | 100.0% | 1(distance) | 76.7 | 77 |
| ゾロアストロ | 74.8 | 5 | high | 99.4% | 2(distance,course) | 74.4 | 74 |
| バレエマスター | 72.4 | 5 | high | 101.7% | 3(distance,course,gate) | 73.6 | 74 |
| ジュンブロッサム | 72.7 | 5 | high | 100.6% | 2(distance,course) | 73.1 | 73 |
| ボーンディスウェイ | 73.1 | 5 | high | 99.9% | 1(distance) | 73.0 | 73 |
| アーバンシック | 72.1 | 5 | high | 100.1% | 1(distance) | 72.2 | 72 |
| サヴォーナ | 70.2 | 5 | high | 99.6% | 1(distance) | 69.9 | 70 |
| ドゥレッツァ | 67.4 | 5 | high | 103.7% | 1(distance) | 69.9 | 70 |
| チェルヴィニア | 69.1 | 5 | high | 100.9% | 1(distance) | 69.7 | 70 |
| ステレンボッシュ | 69.4 | 5 | high | 98.3% | 1(distance) | 68.2 | 68 |

「なぜこの点数なのか」の計算経路（6頭抜粋）:

- **ダノンシーマ**: baseAbility=78.3（11頭中1位、5走full evidence）。
  distance component=101.9%（直近5走中、距離2000m寄りの4走の重み付き平均
  raceScore=80.8が全体平均78.3を上回った——2000m前後で強い実績）。
  course/gate/goingは評価不能のまま中立扱い。78.3×1.019=79.8→**80**。
- **ロデオドライブ**: baseAbility=76.7（4走、short career=true、キャリア全体を
  把握済み）。distance=100.0%（ほぼ中立）。76.7×1.0=76.7→**77**。
- **ゾロアストロ**: baseAbility=74.8。distance=99.2%(high)・course=99.6%
  （評価済みだが新潟実績自体は薄く、ほぼ中立）で2component平均→overall99.4%。
  74.8×0.994=74.4→**74**。
- **ドゥレッツァ**: baseAbility=67.4（11頭中最下位）。distance=103.7%（直近5走中、
  距離2000m寄りの走が全体平均より明確に強かった）が唯一のevaluated component。
  67.4×1.037=69.9→**70**——baseAbilityの低さをSuitabilityが部分的に補ったが、
  上位馬には届かない。
- **チェルヴィニア**: baseAbility=69.1。distance=100.9%(high)。69.1×1.009=69.7
  →**70**。
- **ステレンボッシュ**: baseAbility=69.4（11頭中2番目に低い）。distance=98.3%
  （high confidence、直近5走が距離2000m寄りでもやや平均以下のraceScore）。
  69.4×0.983=68.2→**68**——11頭中最下位。

---

## 19. ダノンシーマ80監査

| 項目 | 値 |
|---|---|
| baseAbility | 78.3 |
| abilityEvidenceCount | 5（RECENT_RACE_COUNT=5をフル使用） |
| historyCompleteness | complete |
| historyConfidence | high |
| shortCareer | false |
| memberLevelEvidenceStatus | **available**（フォールバック無し） |
| completenessFlags | []（空——placeholder除外・insufficientHistory・
  memberLevelUnavailableのいずれも無し） |
| 直近5走 | 2026-05-31(3着,raceScore78.9)・2026-03-22(3着,75.1)・
  2026-01-31(1着,83.9)・2025-11-22(1着,78.1)・2025-09-28(1着,75.3) |

**データ不足が高評価として扱われていないことを確認した。** 5走ともraceScore・
memberLevelScoreAtRaceが正式計算済み（フォールバック値ではない）。3勝を含む
安定して高いraceScore（75.1〜83.9）の均等平均としてbaseAbility=78.3が算出されており、
「情報不足で中立寄りになった結果たまたま高く見えている」という現象は確認されなかった
（むしろ逆——evidence量・confidenceともに11頭中最高水準）。distance component
（101.9%）も実データに基づく評価済み値であり、course/gate/goingが未評価でも
overallSuitabilityPercentは架空の値で埋めていない。**結果を見てScoreを下げる調整は
行っていない**（指示通り）。

---

## 20. ステレンボッシュ68監査

| 項目 | 値 |
|---|---|
| baseAbility | 69.4（11頭中10位） |
| abilityEvidenceCount | 5（フル使用、データ不足ではない） |
| historyCompleteness | complete |
| historyConfidence | high |
| shortCareer | false |
| memberLevelEvidenceStatus | **available**（フォールバック無し） |
| completenessFlags | []（空） |
| 直近5走 | 2026-06-07(10着,raceScore68.1)・2026-05-09(2着,76.8)・
  2026-03-07(7着,71.6)・2025-11-16(10着,71.2)・2025-08-17(15着,59.2) |

**低評価の内訳分解**:
- **Base Ability自体が低いか**: **はい、これが主因。** 5走中3走が7〜15着という
  低調な結果で、raceScoreも59.2〜76.8とばらつきが大きく平均69.4に留まる。
  これはfallback・データ欠損ではなく、実際の直近成績が中位〜下位クラスの
  馬であることの反映。
- **Suitabilityが低いか**: 副次的要因。distance component=98.3%（high
  confidence、距離2000m寄りの5走の重み付き平均raceScoreが68.2と全体平均
  69.4よりやや低い）——わずかなマイナス補正（-1.2pt相当）。
- **未評価componentが多いか**: 11頭中10頭と同様、course/gate/goingが
  evaluated=falseだが、これは中立(100%)として扱われるだけで**Scoreを下げる
  方向には作用しない**（average計算から除外されるため、下振れの原因ではない）。
- **fallbackか**: いいえ。memberLevelEvidenceStatus=available、
  completenessFlags=[]——正式計算のみで構成された値。

**G1馬（過去の実績・知名度）を理由にした補正は一切行っていない。** 実際の
直近5走のraceScoreに基づく計算結果をそのまま表示している。

---

## 21. 枠順未評価による影響候補（Diagnostic、Scoreは動かさない）

| 馬 | 馬番 | 枠 | 分類 |
|---|---|---|---|
| ボーンディスウェイ | 1 | 1 | 内枠 |
| サヴォーナ | 2 | 2 | 内枠 |
| ロデオドライブ | 3 | 3 | 内枠 |
| ドゥレッツァ | 4 | 4 | 中枠 |
| ゾロアストロ | 5 | 5 | 中枠 |
| チェルヴィニア | 6 | 6 | 中枠 |
| ジュンブロッサム | 7 | 6 | 中枠 |
| ダノンシーマ | 8 | 7 | 外枠 |
| アーバンシック | 9 | 7 | 外枠 |
| バレエマスター | 10 | 8 | 外枠 |
| ステレンボッシュ | 11 | 8 | 外枠 |

内枠3頭・中枠4頭・外枠4頭とほぼ均等に分布している。1節で確認した通り
Gate Suitabilityが機能していないのは「新潟の枠に一般的な有利不利があるか
どうか」自体が未検証（4節、データ1レースのみ）だからであり、特定の枠へ
偏ったリスクがあるとは**今回のデータからは判断できない**（判断材料が
無いことを"影響ゼロ"と混同しない）。

---

## 22. Going未評価の維持

`going: null`（`GOING_UNKNOWN_SENTINEL`経由）を維持。雨予報はStage Aへ入れていない
（CHECKPOINT14Dから変更なし）。

---

## 23. Pace / Known Model Issue

Race Pace Prediction V1の出力は無変更のまま保持:

```
continuousPacePressure: 2.75
frontPressure: 0.65
expectedPaceClass: average
paceConfidence: high
```

CHECKPOINT14C.2H由来のKNOWN_MODEL_ISSUE（frontPressureがsenko確率を計上しない
構造）も継続保持。今回のGate Suitability Gapを理由にPace式を変更していない。

---

## 24. Regression

```
npm run validate:data   → 検証成功（エラーなし、既存の警告のみ）
npm test                → Test Files 74 passed / Tests 775 passed
npm run lint            → エラー無し
npm run build            → 成功
Frozen Benchmark         → 70.3（abilityModelV1.frozenBenchmark.test.ts 3 passed）
```

`git diff --stat`: 本ラウンドはコード・データとも無変更（監査＋2つのdocs追加
＋DATA REQUEST MANIFEST 2ファイルのみ）。Base Ability V1・Suitability V1・
Historical Position Profile V1・Race Pace Prediction V1・既存Stage A Snapshot
（CHECKPOINT14D）はいずれもバイト単位で無変更。

---

## 25. 判定

**B-DATA**

Suitability V1のgate componentの構造自体（HorseEvidence経路A・CoursePrior経路B）は
コード監査により完全に説明できた（1節）。しかし新潟芝2000m外回りAコースについて
Gate Suitabilityを統計的に検証するための実データは、repository内に**1レース13頭**
（単一日付・単一going条件）しか存在せず、統計的検証には全く不十分（4節）。
`docs/checkpoint14d1-niigata-turf2000-gate-data-request-manifest.json`/`.md`を
本ラウンドで作成した。

---

## 26. 次にChatGPTと決める必要がある項目（優先順位順）

1. **NIIGATA_TURF_2000_GATE_DATA_REQUEST manifestに基づく実データZIPの提供**
   （最優先。これが無い限りGate Suitability V1の統計的検証自体が着手できない）。
2. **新潟競馬場のコース改修履歴の有無**——repository内で確認できなかった未確認事項
   （manifest内「openQuestion」）。時代を分けて集計する必要があるかどうかに影響する。
3. **course_karte_v1_5courses.zip（CHECKPOINT6）に含まれていた残り4コースの特定**
   ——新潟が含まれていた可能性もあるが、repository内のいかなる記録からも
   確認できなかった（unknown、2節）。もし新潟のCourse Karteが既に存在するなら、
   新規ZIP収集より優先度が高い可能性がある。
4. **十分なデータが集まった場合のGate Suitability V1実装方針**——13〜14節の
   設計提案（既存confidence閾値・shrinkTowardCenterの再利用）で進めてよいか。
5. **CHECKPOINT14D Stage A Snapshotの正式FREEZEタイミング**——Gate Suitability
   検証完了後に再度Stage A（Formal）として確定するか、それとも現行の
   PROVISIONAL状態のまま新潟記念（2026-08-30予定）を迎えることを許容するか。

以上、CHECKPOINT14D.1の範囲でSTOPします。新潟Gate Suitabilityの実装・
Formal Stage A Freeze・Stage Bへは着手していません。

# CHECKPOINT14A — Pace / Position Prediction Contract & Data Readiness Audit

監査・仕様設計のみのラウンド。**コード変更は行っていない**（診断用の一時スクリプトのみ実行し、
確認後に削除した）。新しい展開予測ロジックは実装していない。

## 0. 最重要の前提発見（本監査で最初に報告すべき事実）

作業前に想定していなかった事実として、**「展開・位置取り予測」に相当する実装が、
本プロジェクトに既に存在する**ことが判明した。CHECKPOINT13系列（Ability Model V1・
Suitability V1・Prediction Snapshot）とは別に、より古い「STEP」番号体系
（STEP1〜STEP11、`docs/prediction-philosophy.md`が正式に参照）で以下が実装済み・
テスト済み・`docs/prediction-philosophy.md`に「実装対応」として明記されている。

| レイヤー | ファイル | 内容 | テスト |
|---|---|---|---|
| STEP5 脚質推定 | `runningStyle.ts` | final3F相対値プロキシによる脚質分布推定（confidence常にlow） | pass |
| STEP5.1 脚質推定（通過順位） | `passingPositionRunningStyle.ts` | 通過順位から脚質を分類（実データ0件のため常にnullを返す） | pass |
| STEP5 想定ペース | `predictedPace.ts` | 出走メンバーの脚質構成（逃げ/先行候補数）からslow/average/highをルールベース判定 | pass |
| STEP5 ペース相性補正 | `paceScenarioFactor.ts` | 脚質×想定ペースの相性を±5%の乗算補正としてfinalRaceAbilityへ反映 | pass |
| STEP5 トラックバイアス | `trackBias.ts`／`trackBiasFactor.ts`／`raceContextLeakageGuard.ts` | 人間入力のtrackBias観測（前後・内外）を±5%補正、future leakageガード付き | pass |
| STEP5 統合 | `raceContextFactor.ts`／`finalRaceAbility.ts` | pace×trackBiasをclamp(90,110)で統合し`finalRaceAbility`を算出 | pass |
| STEP6 安定性 | `stabilityFactor.ts` | 下方半偏差による安定性評価（CLAUDE.md明示的凍結） | pass |
| STEP6/7 確率化 | `outcomeScore.ts`／`outcomeProbability.ts`／`raceOutcomeEvaluation.ts` | finalRaceAbilityからPlackett-Luce（`PLACKETT_LUCE_TEMPERATURE=10`、CLAUDE.md明示的凍結）でwin/top2/top3確率を算出 | 未実行（本ラウンドでは確認せず） |
| STEP10/11 事後記録の型 | `raceResultTypes.ts` | `lapSeconds`・`passingPositions`・PRPS（Post-Race Performance Score）の**型のみ**。採点ロジック未実装、データ0件 | — |

**重要な事実関係**:
1. `computeFinalRaceAbility()`は、現行のPrediction Snapshot経路（`predictionSnapshot.ts`）から
   **意図的に呼ばれていない**（同ファイル冒頭コメントに明記）。`App.tsx`からも一切参照されない。
   つまりこのSTEP5〜7のパイプラインは、実装・テストとも完了しているが、CHECKPOINT13系列の
   実データ・Formal Gate・Persistenceパイプラインとは**現在完全に切り離されている**。
2. CLAUDE.mdは`outcomeScore.ts`／`stabilityFactor.ts`／`PLACKETT_LUCE_TEMPERATURE`を明示的に
   凍結対象としているが、`paceScenarioFactor.ts`等STEP5の個別ファイルは凍結リストに名指しされて
   いない。ただし出力は最終的に凍結対象の`outcomeScore.ts`へ流れ込む構造。
3. `paceScenarioFactor.ts`／`trackBiasFactor.ts`は、Base Abilityへではなく**finalRaceAbilityへの
   乗算補正（±5%）を既に実装済み**である。CHECKPOINT14Aの指示「今回、Final Race Abilityへの
   加減点は作らないでください」は、この既存実装をベースに拡張しないという意味だと理解し、
   本ラウンドでは一切変更していない。

この事実を踏まえ、以降の各節は「ゼロから設計する」のではなく「既存資産をどう扱うか」を
併記する形で監査した。**この既存資産の扱い方針（再利用／再設計／凍結のまま保持）は、
本ラウンドでは決定していない。17節の最優先項目とする。**

## 1. Existing Data Inventory

`RacePerformance`（`types.ts`）の実データ充足率を、`data/horses/`全447ファイル・
実レースエントリ891件に対して直接調査した（推測なし）。

| フィールド | 型上の存在 | 実データ充足率 | 備考 |
|---|---|---|---|
| finishPosition | 必須 | 891/891（100%） | 既存raceScore計算のcore項目 |
| raceDistance（`distance`） | 必須 | 891/891（100%） | 同上 |
| racecourse | 必須 | 891/891（100%） | 同上 |
| surface | 必須 | 891/891（100%） | 同上 |
| going | 必須 | 891/891（100%） | 同上 |
| raceTime | 必須 | 891/891（100%） | 同上 |
| final3F | 必須 | 891/891（100%） | 同上（runningStyleのfinal3Fプロキシの入力） |
| gate（枠番） | 任意（CHECKPOINT9） | ファイル単位418/447（93.5%） | 実データあり。CHECKPOINT13.2以降のimportに集中 |
| horseNumber（馬番） | 任意（CHECKPOINT9） | ファイル単位418/447（93.5%） | 同上 |
| raceNumber | 任意（第26実装） | ファイル単位430/447（96.2%） | 同上 |
| **fieldSize（出走頭数、過去走）** | 任意（CHECKPOINT9） | **0/705（0%）** | **フィールド自体は705件に存在するが、値は常にnull。一度も実値が投入されていない** |
| **passingPosition（通過順位）** | 任意（STEP5.1） | **0/891（0%）** | **キー自体が1件も存在しない。`PassingPositionData`型は定義済みだが未使用** |
| lap time / first3F・600m・1000m | **型として存在しない**（`RacePerformance`にフィールド無し） | 0% | `LapProfile`型（`nige/senko/oikomi`とは別の"burst/sustained/attrition"）がTODOコメント付きで存在するのみ、未使用 |
| corner positions | `passingPosition.cornerPositions`として存在 | 0% | 上記と同一 |

**現在レースの`fieldSize`（未来）は別物として既にREADY**: `predictionSnapshot.ts`の
`buildRunners()`は`entries.filter(e => !e.scratched).length`で**今回レースの**出走頭数を
その場で計算しており、これはgate suitability（`RaceGateInput.fieldSize`）で既に本番使用
されている。**「過去走のfieldSize」と「今回レースのfieldSize」は別概念**であり、後者は
既に利用可能・前者のみ0%という点を明確に区別する。

その他、展開予測に流用できる既存フィールド:
- `final3FBreakdown.relativeDiffSeconds`（レース内相対上がり3F）: 100%算出済み。
  現在の`runningStyle.ts`が唯一の脚質推定シグナルとして使っている。
- `memberLevelScoreAtRace`／`memberLevelBreakdown`: レースの相対的なレベル感の参考になりうるが、
  ペース分類への直接活用は未設計。
- `carriedWeight`（斤量）は既存weightScoreで使用中。**馬体重とは別物**（馬体重の型・データは
  存在しない。CLAUDE.md原則1で除外対象）。

## 2. Passing Position Audit

- **全891レースエントリのうち、`passingPosition`が入っているものは0件（0%）。**
- 一方、`passingPositionRunningStyle.ts`は既に完成・テスト済み（`computePassingPositionRunningStyle()`、
  `classifyRunningStyleFromPositions()`）。設計は以下の通り、コーナー数の異なるコースに対して
  ある程度頑健:
  - `cornerPositions[0]`（最初の有効な通過順位）が絶対順位2位以内なら「逃げ」。
  - 記録が3件以上ある場合のみ**最終コーナー（配列の最後）を除外**して前半〜中盤の平均位置比率を見る。
    2件以下の場合は全件を使う。→ 2コーナーのみのレース（新潟芝2000m外系）でも配列長2件として
    自然に扱える設計だが、**実データで検証されたことは一度も無い**（0件のため）。
  - `isReliable`フラグで信頼できない記録を除外する設計（malformed対策）は既にあるが、
    実データが無いため未検証。
- **未解決の重要な仕様問題（推測しない）**: `cornerPositions: number[]`は単なる配列であり、
  「配列のindex 0が実際に1コーナー目を指すのか、それともそのレースの最初に通過する
  コーナー（新潟外回りなら実質3コーナー相当）を指すのか」を型・コード上どこにも明記していない。
  JRA公式の通過順位表記は競馬場・コース取りによって「あるコーナー」から始まったり、
  一部コーナーが存在しなかったりする。**この対応関係は、実際にimportするデータの出典側の
  記法を確認しないと確定できない。今回推測で決めない。**
- 上記より、`fieldSize`と組み合わせた相対位置への変換自体（`computePositionRatio()`）は
  既に実装・テスト済みだが、実データが無いため一度も実行結果を検証できていない。

## 3. Candidate Feature Set

チェックポイント8節の候補を、現状データで評価した。

**Horse History**

| 特徴量 | 評価 |
|---|---|
| recent passing positions | DATA_REQUIRED（0%） |
| normalized passing position | DATA_REQUIRED（passingPosition・fieldSizeとも0%） |
| running style tendency | PARTIAL — final3Fプロキシで全馬算出可能（confidence常にlow）。通過順位ベースは0% |
| position variance | DATA_REQUIRED（実データ無しでは算出不能。sampleCountは既存だがvarianceの算出ロジック自体が未実装） |
| recent race field size | DATA_REQUIRED（過去走fieldSizeが0%） |
| distance / surface / course / going | READY（100%、既存raceScore等で使用中） |

**Current Race**

| 特徴量 | 評価 |
|---|---|
| fieldSize（今回レース） | READY（`predictionSnapshot.ts`で既に算出・使用中） |
| distance / course / surface / going | READY（Race Card Input経由、CP13.5A/Bで確立済み） |
| frame / horseNumber | READY（枠順確定後。スキーマ・Runner Resolverは対応済み、新潟記念は未確定のまま） |
| 同型馬数 / front-runner candidate count | PARTIAL — `predictedPace.ts`の`classifyPredictedPace()`が既に実装済み（nige/senko候補数から判定）。入力の脚質がfinal3Fプロキシ止まりという制約あり |

**Lap Data**

| 特徴量 | 評価 |
|---|---|
| first 3F / 600m / 1000m / lap sequence | NOT_RECOMMENDED_FOR_V1（型が存在せず、データも0%。`raceResultTypes.ts`にラップの置き場所`lapSeconds`は用意されているが未使用） |

## 4. Excluded Features

| 特徴量 | 除外理由 |
|---|---|
| odds / popularity | CLAUDE.md絶対原則1・`docs/prediction-philosophy.md`思想9で明示的に禁止。Pace/Position Predictionにも同様に適用すべき（10節参照） |
| jockey reputation | CLAUDE.md絶対原則1で「能力評価の主要因にしない」対象。データ自体も存在しない |
| trainer reputation | 同上 |
| workout（調教） | 同上。データ自体も存在しない |
| pedigree（血統） | 同上。データ自体も存在しない |
| body weight（馬体重） | 同上。**注意: 斤量（`carriedWeight`）とは別物であり、斤量は既存weightScoreで使用中。馬体重のデータは存在しない** |

いずれも必要性の有無を判断しての除外ではなく、CLAUDE.md/philosophy文書の既存方針をそのまま
Pace/Position V1にも適用する、という確認に留めた。今回追加しない。

## 5. Running Style Contract

既存の`RunningStyleProfile`（`raceContextTypes.ts`）が、チェックポイント7節の要求
（固定ラベルにしない、distribution形式）を既に満たす設計になっている。

- 優先順位: `manualRunningStyle` > `passingPositionRunningStyle`（実データ0%のため現状常にnull）
  > `fallbackAutoRunningStyle`（final3Fプロキシ、常に算出可能・confidence常にlow）。
- 出力はnige/senko/sashi/oikomiの4値distribution（合計100）＋`dominantStyle`。単一ラベル固定ではない。
- **未実装**: 「position variance」（レースごとの位置取りのばらつき）。`sampleCount`は保持しているが、
  分散自体を計算するロジックはまだ無い。通過順位実データが無ければ意味のある値にならない。

CHECKPOINT14Aとしての結論: **Running Style Contractの型・優先順位ロジックは既に存在し、
妥当。新規設計は不要。実データ（通過順位）が入った時点でconfidenceが自動的に引き上がる
設計に既になっている。**

## 6. Position Prediction Contract

チェックポイント11節が要求する出力（`expectedRunningStyle`／`expectedEarlyPositionBand`／
`expected3CPositionBand`／`expected4CPositionBand`／`positionConfidence`）に相当する型は
**現状コード上どこにも存在しない**（`RunningStyleProfile`はあるが、コーナー別のband予測は無い）。

設計候補（数式・実装はまだ確定しない）:

- **相対位置の正規化候補**（6節の要求どおり、3案を提示、選定しない）:
  1. `normalizedRank = position / fieldSize`（単純比率）
  2. `frontPercentile = 1 - (position - 1) / (fieldSize - 1)`
     （`courseContextPrior.ts`の`calculateRelativeGatePosition()`と同じ式。gate適性で
     既に実績のある式を再利用できる可能性がある）
  3. `positionBand`（例: 前3割／中4割／後3割の3区分、またはより細かいbucket）
- **コースのコーナー数に応じた出力設計**: 新潟芝2000m外のような2コーナーのみのコースでは、
  存在しない`expected1CPositionBand`／`expected2CPositionBand`相当を無理に出力しない
  （チェックポイント11節の指示どおり）。ただし「配列のどのindexがどのコーナーに対応するか」
  （2節の未解決問題）を先に決めないと、コース非依存の出力契約は設計できない。
- **band vs 点予測**: 19節の指示・現在のデータ量（実データ0%）を踏まえ、**band予測を推奨**する
  （20節・19節の判断とも一致）。

## 7. Pace Prediction Contract

チェックポイント12節が要求する出力（`expectedPaceClass`／`pacePressure`／
`frontRunnerCandidateCount`／`paceConfidence`）のうち、**`frontRunnerCandidateCount`と
`expectedPaceClass`相当は`predictedPace.ts`の`classifyPredictedPace()`が既に実装済み**
（逃げ候補2頭以上→high、逃げ・先行候補ともに0頭→slow、それ以外→average、というルールベース）。
これは13節が懸念する「絶対秒による判定」ではなく、**既にメンバー構成（相対）ベースの判定**に
なっている。

不足している要素:
- `pacePressure`（連続値としての圧力度）に相当するものは無い（現状はslow/average/highの3値のみ）。
- `paceConfidence`は存在しない。`predictedPace.ts`自体にconfidenceフィールドが無い
  （下流の`paceScenarioFactor.ts`は`runningStyle.confidence`を流用しているだけで、
  ペース分類そのものの確信度ではない）。
- `predictedFirst600m`／`predictedFirst1000m`: 3節の通りNOT_RECOMMENDED_FOR_V1
  （lap dataが0%のため）。

## 8. Pace Classを何に対して相対評価すべきか（13節への回答）

現状データでは絶対秒による相対評価（course/going/race level/track speedとの比較）は
**lap dataが無いため実行不可能**。ただし将来的な設計候補として、既存の類似パターンを
2つ提示する（今回選定・実装しない）:

1. `courseTimeBaselines.ts`と同じ「競馬場×芝ダート×距離×馬場状態ごとの中央値との比較」
   パターンをlap dataに適用する案（lap dataが将来入手できた場合の拡張先）。
2. `memberLevelScoreAtRace`を「レースレベル」の代理指標として、同レベル帯のレース間で
   ペース傾向を比較する案（lap data不要、現在のデータで着手可能）。

V1として現実的なのは、**`predictedPace.ts`が既に採用している「頭数構成ベースの相対判定」
（絶対秒を一切使わない）をそのまま踏襲する**案。Track Biasとの役割混同を避けるため、
Pace Predictionは「メンバー構成から見た展開の型」、Track Biasは「その日の馬場的な有利不利」
として明確に分離する（8節の要求どおり。現行コードでも`PredictedPace`と`TrackBiasObservation`
は既に別の型として分離されている）。

## 9. Course Profile / Track Biasとの分離（3節・8節への回答）

現行コードは既に3層をおおむね分離している:

| 層 | 該当ファイル | 現状 |
|---|---|---|
| Static Course Profile | `courseKarte/*.json`（`courseContextPrior.ts`が読む） | **東京ダート1600mのみ1件存在。新潟芝2000mは無い** |
| Track Bias（当日傾向） | `trackBias.ts`／`trackBiasFactor.ts`／`raceContextLeakageGuard.ts` | 型・future leakageガードとも実装済み。V1は人間入力のみ（自動計算は未実装、常にnull） |
| Pace Prediction | `predictedPace.ts` | 実装済み（7節参照） |

courseKarteのスキーマ（`courseId/venue/surface/distanceM/turn/layout/geometry/coreTraits/
gateBias/styleBias/going/confidence/_source`）は、チェックポイント3節が例示した
「新潟芝2000m外・直線が長い・コーナー2回」のようなStatic Course Profileの入れ物として
**そのまま再利用可能**。ただし現状は東京ダート1600m専用に書かれており、汎用コース非依存の
利用へは接続されていない（`courseContextPrior.ts`の関数名が`computeTokyoDirt1600CourseContextPrior`
のようにコース固定）。新潟用に同スキーマで新規1件作るだけであれば新規基盤は不要。

**courseKarteとPace/Position Predictionは現状コード上まだ接続されていない**（courseKarteは
Suitability V1のgate componentのCoursePriorとしてのみ使われている）。「コーナー数に応じた
出力」（6節）を実現するには、courseKarte（または同等の新規メタデータ）にコーナー数を
明示的に持たせる新フィールドが必要になる可能性がある（現状のcourseKarteスキーマにも
コーナー数の専用フィールドは無い）。

## 10. Pre-Frame / Post-Frame設計（15節への回答）

実現可能と判断する。CHECKPOINT13.5A/Bで確立した「Formal Gate通過前はdiagnostic、
通過後のみformal」という分離パターンをそのまま流用できる:

- **Pre-Frame（provisional）**: frame/horseNumberに依存しない特徴量（脚質傾向・
  フィールド構成からのペース傾向）だけで計算する診断値。`RaceCardBridgeResult.gate.formal=false`
  の状態、または枠順自体がRace Cardに無い状態に相当。
- **Post-Frame（formal）**: 枠順確定後、frame依存の特徴量（枠バイアス等）を含めて再計算し、
  Formal Gate通過後にのみ正式値として扱う。

仮枠は作らない（CLAUDE.md原則5、CP13.5Aの既存方針を踏襲）。この二段階設計は
**新しい基盤を必要とせず、既存のFormal Gate/diagnostic分離パターンの再適用で足りる**、
というのが本監査の結論。

## 11. Scratchの扱い（16節への回答）

現行のFormal Gate（`raceCardBridge.ts`）は、出走取消馬が1頭でもいると
`predictionEligible=false`になりgate.formal自体がfalseになる仕様（CP13.5Bで確認済み、無変更）。
Pace/Position Predictionの`frontRunnerCandidateCount`等も、**Formal Snapshot生成時点の
出走馬セット（scratched=falseの馬のみ）から都度再計算する設計にすれば、既存のFormal Gateの
挙動と自然に整合する**。出走取消による再計算のための新しい仕組みは不要と判断する。

## 12. Confidence Contract（20節への回答）

Suitability ConfidenceともShort Career Evidence（historyConfidence）とも別概念として
設計すべき、というチェックポイントの指示に同意する。既存コードには2つの先例がある:

- `RunningStyleProfile.confidence`: `baseConfidenceFromSampleCount()`（STEP4から流用）で
  サンプル数に応じてhigh/medium/lowを決める設計が既にある。
- `overallConfidence`（Suitability V1）・`evaluationConfidence`（`raceOutcomeEvaluation.ts`）:
  「evaluated済みcomponentのうち最も弱いもの」を採用するweakest-link方式が、本プロジェクトで
  既に2箇所で採用されている。

`positionConfidence`／`paceConfidence`を新設する場合、**この既存のweakest-link方式を
踏襲するのが一貫性がある**、という設計方針を提案する（今回は方針提示のみ、実装しない）。

## 13. Post-Race Validation Metrics（18節への回答）

`raceResultTypes.ts`（CHECKPOINT13 STEP10/11）に、まさにこの用途の型が**既に用意されている**
（`HorseRaceResultRecord`・`RaceLevelResultRecord`・`RaceLapRecord`・`PostRacePerformanceScoreRecord`）。
ただし採点ロジック未実装、データ0件、他コードから一切参照されていない（型のみ存在）。

指標候補の評価:

| 指標 | 評価 |
|---|---|
| pace class accuracy（カテゴリ一致率） | 実行可能候補。lap dataを必要とせず、`expectedPaceClass`と事後の実際のペース分類（`raceResultTypes.ts`のRaceLapRecord等から人手で分類する運用も含め）を比較できる |
| first600 / first1000 MAE | NOT_RECOMMENDED_FOR_V1。予測値・実測値とも現状データが無い（`raceResultTypes.ts`の`lapSeconds`にも実データは0件） |
| position band hit rate | 実行可能候補。ただし通過順位の実データ（正解データ）自体が0%であり、検証対象レースについて別途通過順位を投入する必要がある |
| normalized position MAE | 同上（通過順位実データ依存） |
| 3C / 4C position error | 同上。かつ2節の「配列indexとコーナーの対応」問題が未解決のままでは誤差の定義自体が曖昧になる |

## 14. Data Readiness Matrix

| 機能 | 判定 | 理由 |
|---|---|---|
| Running Style Profile | **PARTIAL** | final3Fプロキシで全馬算出可能（低confidence）。通過順位ベースの高精度版はDATA_REQUIRED |
| Position Prediction | **DATA_REQUIRED** | passingPosition・過去走fieldSizeとも0%。出力契約自体も未設計 |
| Pace Class Prediction | **PARTIAL** | `predictedPace.ts`が既に頭数構成ベースで計算可能。ただし入力精度がRunning Style Profileに連動して低い。paceConfidence未実装。精度検証（バックテスト）未実施 |
| First600 Prediction | **NOT_RECOMMENDED_FOR_V1** | lap dataが型・データとも0% |
| First1000 Prediction | **NOT_RECOMMENDED_FOR_V1** | 同上 |

## 15. Data Gap（22節への回答。必要最小限のみ提示）

いきなり大量データを要求しない、という指示に従い、優先順位順に3件のみ提示する。

1. **過去走の`fieldSize`（出走頭数）**: 新規のプロプライエタリデータではなく、公開されている
   確定着順情報から遡って補完可能な事実。これがあるだけで既存のgate/horseNumberと組み合わせた
   相対枠順・相対位置の基礎指標が作れるようになる。全過去走ではなく、まず新潟記念11頭の
   直近走分からで良い。
2. **通過順位（コーナー通過順）データ**: 新潟記念11頭の直近1〜2走分からの最小サンプルで開始。
   全馬・全過去走を一括要求しない。
3. **新潟芝2000m外のcourseKarte 1件**: 既存の`courseKarte`スキーマ（東京ダート1600mと同形式）
   に倣った新規レコード。コーナー数・直線長等の構造情報。

lap系データ（first600/1000）は今回要求しない（14節のとおりV1では扱わない前提とする）。

## 16. 新潟記念11頭の準備状態（23節への回答）

実際に`getHorseRecentRaces()`（本番経路）＋既存の`computeAutoRunningStyle()`／
`computePassingPositionRunningStyle()`を11頭全馬に対して実行し、確認した
（正式予測ではなく、現状の監査目的の実行）。

| 馬名 | 直近走数 | fieldSize充足 | passingPosition充足 | fallbackAutoRunningStyle（dominant/confidence） |
|---|---|---|---|---|
| アーバンシック | 5 | 0/5 | 0/5 | senko / low |
| サヴォーナ | 5 | 0/5 | 0/5 | sashi / low |
| ジュンブロッサム | 5 | 0/5 | 0/5 | sashi / low |
| ステレンボッシュ | 5 | 0/5 | 0/5 | senko / low |
| ゾロアストロ | 5 | 0/5 | 0/5 | sashi / low |
| ダノンシーマ | 5 | 0/5 | 0/5 | sashi / low |
| チェルヴィニア | 5 | 0/5 | 0/5 | senko / low |
| ドゥレッツァ | 5 | 0/5 | 0/5 | nige / low |
| バレエマスター | 5 | 0/5 | 0/5 | sashi / low |
| ボーンディスウェイ | 5 | 0/5 | 0/5 | sashi / low |
| ロデオドライブ | 4 | 0/4 | 0/4 | oikomi / low |

11頭全馬でfallback（final3Fプロキシ）のRunning Styleは算出可能（confidence常にlow）。
`passingPositionRunningStyle`は11頭全馬でnull（通過順位データが無いため）。
`classifyPredictedPace()`にこの11頭のdistributionを渡せば技術的にはペース分類も算出できるが、
**入力精度が低いため参考値以上の意味を持たせるべきではない**。まだ正式予測は生成していない。

## 17. CHECKPOINT14推奨ロードマップ（24節への回答）

チェックポイント案（14A〜14F）に、0節の発見を踏まえた確認ステップを1つ追加することを提案する。

```
14A  Contract / Data Audit                       ← 本ラウンド、完了
14A-2（追加提案） 既存STEP5/6/7/10-11資産の扱い方針確定
                  （再利用／再設計／凍結保持のまま並行、をChatGPTと決定。実装なし）
14B  Position Profile V1                         （通過順位の最小データ投入＋実データでの検証）
14C  Race Pace V1                                （predictedPace.tsの実データ検証or再設計）
14D  Position Prediction V1                       （band出力・コーナー数に応じた設計の実装）
14E  Historical Reproducibility Test              （raceResultTypes.tsの活用含む精度検証）
14F  Niigata Kinen Formal Prediction              （正式枠順確定後の実適用）
```

14A-2を挟む理由: 14B以降で新しいPosition/Pace Engineを設計・実装する前に、既に動作する
STEP5実装（`passingPositionRunningStyle.ts`等）を土台に拡張するのか、別物として再設計するのかを
決めておかないと、二重実装や後戻りのリスクがある。

## 18. Tests

本ラウンドはコード変更を行っていないため、新規テスト追加は無い。監査目的で以下を実行し
確認した（すべて既存・無変更のテスト、コミット対象外の一時スクリプトのみ実行後削除）。

- `npx vitest run`（STEP5/6関連9ファイル）: 9 files / 89 tests、すべてpass。
- `data/horses/*.json`全447ファイルに対する`grep`ベースのフィールド充足率調査（1節・2節）。
- 新潟記念11頭に対する`getHorseRecentRaces()`＋既存`runningStyle`関数の実行確認（16節）。
- `git status`: 変更ファイル無し（本報告書のみ追加）。

## 19. 判定

**B-DATA かつ B-SPEC（両方該当）。**

無理にA判定しない理由:
- **データ面（B-DATA）**: passingPosition・過去走fieldSizeとも実データ0%。Position Prediction・
  First600/1000 Predictionは現状データだけでは構築不可能。
- **仕様面（B-SPEC）**: 0節で判明した既存STEP5/6/7/10-11資産の扱い方針が未決定。この決定を
  せずに14B以降へ進むと、既存の`passingPositionRunningStyle.ts`等と重複・矛盾する実装を
  新規に作ってしまうリスクがある。また、`cornerPositions`のindexとコーナー番号の対応、
  Position Band/Pace Classの相対評価基準等、複数の設計判断が残っている。

一方で、Contract候補・Confidence設計・Future Leakageガードの設計方針自体は、既存コード
（STEP5・Suitability V1・CP13.5A/Bのdiagnostic/formal分離パターン）を土台にすれば
妥当な形で提示できることを確認できた。**「現在のデータ構造では展開予測V1が不適切」
というC判定にするほど悲観的な状況ではない**が、「必要データとContractが確定し、
Position Profile V1実装へ進める」というA判定にできる状態でもない。

## 20. 次にChatGPTと決める必要がある項目（優先順位順）

1. **【最優先】既存STEP5（Pace/Position/TrackBias/FinalRaceAbility）・STEP6/7
   （Probability/OutcomeScore）・STEP10/11（raceResultTypes/PRPS）を、CHECKPOINT14で
   どう扱うか。** 再利用するのか、CHECKPOINT13の実データ規律に合わせて再設計するのか、
   現状のまま凍結保持して並行させるのか。この判断が14B以降の設計の土台になる。
2. **通過順位（passingPosition）最小データ投入の範囲**: 新潟記念11頭の直近1〜2走からで
   良いか、対象範囲の確認。
3. **過去走`fieldSize`の補完方法・出典**。
4. **`cornerPositions`配列のindexとコーナー番号（1C/2C/3C/4C）の対応関係**を、実際の
   データ出典の記法に合わせてどう正式定義するか。
5. **新潟芝2000m外のcourseKarte新規作成**をこのタイミングで行うか。
6. **Position Band / Pace Classの相対評価基準**: V1では8節提案の「頭数構成ベースのみ
   （絶対秒を使わない）」で確定してよいか。
7. **Post-Race Validation（raceResultTypes.ts）の本格運用開始タイミング**（14E相当）。

以上、CHECKPOINT14A完了。CHECKPOINT14B以降へは進まず、ここでSTOPする。

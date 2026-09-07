# CHECKPOINT14C.1 — Historical Pace Validation Data Contract / Lap Data Readiness Audit

CHECKPOINT14C（Race Pace Prediction V1、Pre-Frame）はA判定だったが、これは「Pace
Prediction Engineの構造が成立した」ことのみを意味し、「実戦精度が証明された」ことは
意味しない。本ラウンドは、Pace Prediction V1を過去レースで客観検証するために必要な
**Actual Pace Data Contract**と、必要最小限のLap Dataの仕様を確定する。

**大量データ取得・Pace Engine変更・Current Race Position Predictionは行っていない。**
新規ファイル: `src/ability/racePaceValidationTypes.ts`（型）、
`src/ability/racePaceValidation.ts`（lapSequenceからfirst600m/first1000mを導出する
純粋関数のみ、baseline依存部分は未実装）、
`src/ability/__tests__/racePaceValidation.test.ts`（11 tests、全て合成データ）、
`src/ability/data/raceLapData.json`（race-level enrichmentのプレースホルダー、
実データ0件）。CHECKPOINT14Cの`racePacePrediction.ts`・`racePacePredictionTypes.ts`・
`positionProfile.ts`等は**無変更**（`git diff --stat`で確認済み、差分無し）。

## 1. Existing Lap Data Inventory

`data/horses/`全447ファイル・891レース分（unique raceId 127件）を実際に走査した結果:

| フィールド | key存在 | 値がnon-null | 備考 |
|---|---|---|---|
| raceTime | 891/891 (100%) | 891/891 (100%) | |
| distance | 891/891 (100%) | 891/891 (100%) | |
| racecourse | 891/891 (100%) | 891/891 (100%) | |
| surface | 891/891 (100%) | 891/891 (100%) | |
| going | 891/891 (100%) | 891/891 (100%) | |
| fieldSize | 705/891 (79.1%) | 54/891 (6.1%) | CHECKPOINT14A.3のenrichment分のみ実値 |
| passingPosition | 54/891 (6.1%) | 54/891 (6.1%) | 同上 |
| lap/lapSequence/first3F/first600/first1000 | **0/891 (0%)** | **0/891 (0%)** | フィールド自体が1件も存在しない |

**Lap/sectional data（区間タイム）は現時点で1件も存在しない。** `types.ts`に
`LapProfile`という型定義自体はあるが、どのレースにも実データとして紐づいていない
（CHECKPOINT14Aの監査結果と一致、状況は変化していない）。

`courseKarte/`は依然として`tokyoDirt1600.json`の1件のみで、新潟芝2000mのエントリは
存在しない（CHECKPOINT14A時点から未変化）。

## 2. Actual Pace Contract

`racePaceValidationTypes.ts`に以下を定義した:

```
RaceLapSequenceRecord   … 1レース分のラップ列（race-level、馬ごとに重複させない）
  raceId, raceDate, raceName, racecourse, surface, distance, going, fieldSize,
  segmentMeters（区間の距離。推測せず明示必須）, lapSequence（区間タイム配列）, source

ActualPaceMetrics
  first600mSeconds, first1000mSeconds  … lapSequenceから機械的に導出
  continuousActualPace, actualPaceClass … baseline未整備のため常にnull（6節）
  warnings

PaceValidationRecord
  raceId, raceDate,
  predictedContinuousPacePressure, predictedExpectedPaceClass, predictedPaceConfidence,
  actual: ActualPaceMetrics
```

**着順・「差し馬が勝った」「逃げ馬が残った」・final3Fのみからの推測は一切行っていない。**
`buildActualPaceMetrics()`の入力は`RaceLapSequenceRecord`（lapSequenceのみ）であり、
`finishPosition`等の結果論フィールドを一切参照しない設計であることをテストで直接
確認した（`着順等の結果論に依存するフィールドが型・出力のいずれにも存在しない`）。

## 3. Pace Baseline設計（比較・提案のみ、実装は無し）

| 候補 | 粒度 | Sample数の見込み（30件のturf2000m実データより） | 評価 |
|---|---|---|---|
| A. course+surface+distance | 例: 新潟・turf・2000m | 新潟のみだと**1件**（8節） | V1として粒度は正しいが、単独courseではsample数が致命的に不足 |
| B. A + going | さらに絞る | 新潟のみだと1件未満相当 | V1では細分化しすぎ、going分をさらに割ると0件になりうる |
| C. A + race class | さらに絞る | 同上 | 8節「Race LevelをPaceと混同しない」に反する懸念、V1では不採用 |

**推奨: V1はAをベースに、course単独でsample不足の場合はsurface+distance共通の
他courseプールへの`distanceFallback`的な階層を許容する**（`baselineLookup.ts`の
既存tier概念: exact→distanceFallback→defaultFallbackと同じ設計思想の転用、新規発明
ではない）。goingはbaselineの主キーには含めず、`courseTimeBaseline`同様
「wet/dryの大分類でサンプルをプールする」等の扱いをV1.1で検討する候補として残す
（今回は判断保留、13節）。race classをbaselineに含めることは、8節の懸念
（G1だから速い、と決めつけるリスク）とsample数トレードオフの両面から、
**V1では見送りを推奨**する。

## 4. Actual Pace Continuous / Class

`ActualPaceMetrics.continuousActualPace`（course/surface/distance baselineに対する
相対値、CHECKPOINT14CのcontinuousPacePressureと対になる連続値）を型として用意した。
`actualPaceClass`（slow/average/high）はそこから導出される表示用分類とする設計を
`continuousPacePressure`/`expectedPaceClass`と対称にした。**ただし両方とも、
baseline実データが無い現時点では常にnullを返す**（`buildActualPaceMetrics()`の
実装・テストで確認済み）。

class閾値（slow/average/high境界）は、baseline実データが揃った時点で
「Historical distribution（実際に集まったcontinuousActualPaceの分布の分位点等）」から
定めることを推奨し、**新規のmagic numberを今回は導入していない**（10節の「客観基準を
優先」への対応）。

## 5. Validation Metrics（提案のみ）

V1正式指標として以下を提案する:

1. **Pace Class Accuracy**（`expectedPaceClass` vs `actualPaceClass`の一致率）— 最優先。
   直感的で説明しやすく、confusion matrixとセットで分類の偏りを可視化できる。
2. **Confusion Matrix**（3×3、slow/average/high）— Accuracy単体では見えない
   「high予測がslowになった」等の系統的な誤りを検出するため必須。
3. **continuousPacePressure vs continuousActualPaceの相関（Pearson/Spearman）**—
   連続値同士の関係を、閾値に依存せず評価できる。

MAE first600/MAE first1000は、秒数Prediction自体をCHECKPOINT14Cで
NOT_RECOMMENDED_FOR_V1としているため、**今回は正式指標に含めない**。将来Lap実データが
蓄積し秒数Predictionを実装する段階（9節）で追加を検討する候補とする。

## 6. Confidence Validation Contract

`PaceValidationRecord.predictedPaceConfidence`を記録するため、将来
「`paceConfidence=high`の予測群のPace Class Accuracyが、`low`の予測群より高いか」を
`PaceValidationRecord`の集合から集計するだけで検証できる設計にした（新たな型・
仕組みは不要、既存フィールドの集計のみ）。**今回はCalibration集計自体を実施しない**
（指示通り）。

## 7. Minimum Historical Dataset（提案）

いきなりJRA全10年等は要求しない。以下の段階的な提案:

- **Phase 1（Engine動作確認用、最小）**: 新潟芝2000m 5〜8件 + 他course turf2000m
  10〜15件（baselineプール用）。Pace Class AccuracyやConfusion Matrixが計算できる
  最低限のサンプル数として。
- **Phase 2（V1.1、信頼できるbaseline）**: `MIN_RELIABLE_SAMPLE_COUNT=15`
  （`baselineLookup.ts`の既存V0暫定値をそのまま再利用）を、course+surface+distance
  プールの目標サンプル数として採用することを提案する。

## 8. 新潟芝2000m必要Race数

**現状: 新潟芝2000m のunique raceは`data/horses/`内に1件のみ**
（`JRA-20260516-NIIGATA-11` 新潟大賞典 2026-05-16 良）。turf2000m全体（course問わず）
では30件（東京6・中京4・阪神4・中山4・福島4・函館2・札幌2・京都2・新潟1・小倉1）。

7節Phase 1の提案に基づき、**まず新潟芝2000mを5〜8件程度**（現状の1件から追加で
4〜7件）取得できれば、Engineの基本的な妥当性確認（Pace Class Accuracyの粗い傾向）が
可能になると見積もる。course単独でのbaseline確立（Phase 2、15件）にはさらに
7〜14件の追加が必要。それまでの間は、他course turf2000mの30件をsurface+distance
プールとして暫定的に使う設計（3節のdistanceFallback的階層）を推奨する。

## 9. Lap Data Package Contract

`RaceLapSequenceRecord`のフィールドをそのままCSV/ZIP作成の正式契約として提示する:

```
raceId, raceDate, raceName, racecourse, surface, distance, going, fieldSize,
segmentMeters, lapSequence（区間タイムの配列。CSVではセミコロン区切り等で1列に
収めるか、"lap1","lap2",...と可変長列にするかは今後のZIP形式次第）,
source
```

`segmentMeters`は推測せず必ず明示すること（JRAの一般的なラップ表記は200m区間だが、
コースや資料によって異なりうるため、値として受け取る）。`lapSequence`の合計距離が
`distance`とおおよそ一致するかは、本ラウンドで実装した`buildActualPaceMetrics()`が
自動で警告する（大きく食い違う場合のみ、末尾半端区間は許容）。

## 10. Race-level Data Architecture

**既存の`data/raceFieldAggregates.json`（raceIdをキーにした別ファイル、馬ごとに
重複させないrace-level enrichment）と全く同じ方式を採用することを推奨する。**
今回`src/ability/data/raceLapData.json`を`{note, laps: []}`という同じ形（実データ0件の
プレースホルダー）で新設した。

- **race_performances.csv（horse-level）への重複保存は推奨しない**: lapSequenceは
  レース単位で1つしか存在しない値であり、出走馬N頭分に複製すると、CHECKPOINT13.2以来の
  「enrichment mergeの衝突検出（1件でも食い違えば書き込まない）」設計と整合しづらく
  なる（horse単位のCSVに race単位の値を混ぜると、同じraceの別馬の行で値が食い違った
  際に不要な衝突を誘発するリスクがある）。
- **`raceLapData.json`（race-level、新設）が適切**: `raceFieldAggregates.json`と同じ
  パターンを踏襲することで、CHECKPOINT13.2以来の実装済みマージ処理・監査パターンを
  そのまま応用できる（今回は接続していないが、将来`raceHistoryPipeline.ts`へ
  `raceFieldAggregatesByRaceId`と同様の`raceLapDataByRaceId`を追加する形で拡張可能な
  設計にした）。

## 11. Future Leakage Safety

`PaceValidationRecord`の設計上、`predicted*`フィールド（CHECKPOINT14Cの
`computeRacePacePrediction()`が返した値）と`actual`（`buildActualPaceMetrics()`が
返した値）は明確に分離されたトップレベルフィールドであり、`actual`側の値が
Predictionの入力に混ざる経路は存在しない（`racePacePrediction.ts`は
`racePaceValidationTypes.ts`・`racePaceValidation.ts`のいずれも一切importしていない
ことをコード上確認済み）。Predictionに使う馬履歴（`getHorseRecentRaces()`経由）は
既存の「対象レースより前のみ」という規約（baseAbility.ts等と同じ）にそのまま従う。

## 12. 判定

**A-DATA**。

必要なData Contract（`RaceLapSequenceRecord`・`ActualPaceMetrics`・
`PaceValidationRecord`）を確定し、着順等の結果論を排除したfirst600m/first1000mの
機械的導出ロジックを実装・テストで確認した。Race-level enrichmentのファイル配置
（`raceLapData.json`、既存`raceFieldAggregates.json`と同じ方式）も確定した。
CHECKPOINT14CのRace Pace Prediction Engineへの変更は無い（`git diff`で確認済み）。

一方、**実Lapデータは依然として0件**であり（1節）、`continuousActualPace`/
`actualPaceClass`はbaseline実データが揃うまで算出できない（4節、意図的にnull）。
これは「Data Contractが未確定」ではなく「ChatGPT側でLap Data ZIPを作成すれば
すぐに投入できる状態が整った」ことを意味するため、B-SPECではなくA-DATAと判定する。
無理にA判定にしているわけではなく、Contract自体は完成しているが、検証を実行するには
9節のフィールド契約に従った実データの投入が必要という、データ待ちの状態を正確に
表す判定である。

## 13. 次にChatGPTと決める必要がある項目（優先順位順）

1. **新潟芝2000m Lap Data ZIPの作成**: 8節の提案（まず5〜8件）に基づき、9節の
   フィールド契約（`raceId, raceDate, raceName, racecourse, surface, distance, going,
   fieldSize, segmentMeters, lapSequence, source`）でZIPを作成できるか。
2. **他course turf2000mのbaselineプール分の要否**: 8節で提案した「新潟単独では
   sample不足のため、他course turf2000mを暫定baselineに使う」方針への合意。
3. **goingをbaselineへ含めるか（3節）**: V1では主キーに含めない案を提案したが、
   最終判断はChatGPT側で。
4. **race-level enrichmentのraceHistoryPipeline接続タイミング**: 実データが揃った
   時点で`raceLapDataByRaceId`を`raceFieldAggregatesByRaceId`と同様に接続するか
   （CHECKPOINT14C.2候補）。

以上、CHECKPOINT14C.1完了。CHECKPOINT14Dへは進まず、ここでSTOPする。

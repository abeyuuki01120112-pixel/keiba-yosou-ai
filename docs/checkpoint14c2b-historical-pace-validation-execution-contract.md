# CHECKPOINT14C.2B — Historical Lap Data Intake / Pace Validation Execution Contract

ChatGPT側からLap Data Packageが到着した際に、安全にImportし、Race Pace Prediction V1を
過去レースで検証するための正式実行Contractを固定した。**今回もLap Data Packageは
添付されていないため、外部検索・推測・架空データ作成は一切行わず、実importも
実行していない。** 新規コードは全て合成テストデータのみで検証した
support codeであり、Race Pace Prediction Engine（`racePacePrediction.ts`・
`racePacePredictionTypes.ts`）・Historical Position Profile（`positionProfile.ts`）は
`git diff`で無変更を確認済み。

新規ファイル: `src/ability/racePaceValidationIntake.ts`（Dry Run・非破壊Import）、
`src/ability/racePaceValidationExecution.ts`（LOO Actual Pace・Historical Prediction
生成・Pilot Metrics集計）、対応するテスト2本（計25 tests）。

## 1. Lap Intake Readiness

`racePaceValidationIntake.ts`を新設。ChatGPT側から届く`RaceLapSequenceRecord[]`を、
実際に`raceLapData.json`へ書き込む前にDry Runする関数群（`runLapDataDryRun`・
`planLapDataImport`・`writeRaceLapDataStoreIfClean`・`loadRaceLapDataStore`）を実装した。
`writeRaceLapDataStoreIfClean`はDry Runがクリーンな場合のみ書き込み、1件でも重大
conflictがあれば何も書き込まずblockedを返す（`predictionSnapshotStore.ts`の
非破壊persistence思想・`mergeHorseHistory.ts`の「conflict1件で全体block」思想を
race-level enrichmentへ転用）。全テストは一時ディレクトリのみを使用し、本番
`src/ability/data/raceLapData.json`（実データ0件のまま）には一切書き込んでいない。

## 2. Schema Validation

Dry Run（`runLapDataDryRun`）が確認する項目（CHECKPOINT14C.2B 6節の要求を満たす）:

- `segmentMeters > 0`
- `lapSequence`が空でない、かつ全要素が正の有限数
- 必須メタデータ（raceId/raceDate/raceName/racecourse/surface/distance/going/source）が
  全て存在し空でない
- `lapSequence.length × segmentMeters`が`distance`と`segmentMeters`を超えて食い違わないか
- バッチ内の同一raceId重複（内容一致=duplicate、不一致=metadataConflicts）
- 既存`raceLapData.json`との同一raceId比較（内容一致=duplicate、不一致=
  existingRaceConflicts、silent overwrite防止）

**推測補完は一切行っていない**（不正な値はエラー/警告として報告するのみで、
欠損値を埋める処理はどこにも無い）。

## 3. Dry Run Contract

`LapDataDryRunResult`の出力フィールドは、CHECKPOINT14C.2B 9節の指定と完全一致させた:

```
records, validRecords, duplicates, metadataConflicts, lapLengthErrors,
distanceMismatch, existingRaceConflicts, warnings, blocked
```

`blocked`は`metadataConflicts`・`lapLengthErrors`・`distanceMismatch`・
`existingRaceConflicts`のいずれかが1件でもあれば`true`になり、その場合
`planLapDataImport()`は`merged`に`null`を返す（自動importしない）。`duplicates`単独では
blockしない（同一内容の再送信は安全なno-opとして扱う、既存persistence規約と同じ）。

## 4. Future Leakage Control

`generateHistoricalRacePacePrediction(targetRaceDate, runners)`は、各runnerの
`recentRaces`を`targetRaceDate`よりstrictly-before（`import/recentRaces.ts`と同じ
規約）に絞り込んでから`computeHistoricalPositionProfile()`へ渡す。テストで、
target日以後の走（`raceDate`が未来）を混入させても結果が変わらないことを直接確認した
（`generateHistoricalRacePacePrediction: Future Leakage`）。Actual側
（`computeLeaveOneRaceOutActualPace`）はlapSequenceのみを入力に取り、
Prediction側の関数・型を一切importしていない（コード上分離を確認済み）。

## 5. Leave-One-Race-Out Baseline

`computeLeaveOneRaceOutActualPace(records)`を実装した。各レースの
`continuousActualPace`は「自分自身を除いた同一プール内の他レースのfirst600mSeconds
平均」との差分（`looMean - 自身のfirst600m`、プール平均より速いほど正の値）から算出し、
**自己参照を回避**する。プール内で継続値が算出できたレースが3件以上あれば、
その分布の三分位（新規のmagic numberではなく、プール自体の相対順位）から
`actualPaceClass`を決める。3件未満なら`actualPaceClass`は`null`のままにし、
「プールが小さいため意味のある分位が作れない」旨を警告する。テストで、最速レースが
`high`、最遅レースが`slow`に正しく分類されることを合成データで確認した。

## 6. Historical Prediction Contract

`generateHistoricalRacePacePrediction()`は、`computeHistoricalPositionProfile()`・
`computeRacePacePrediction()`を**無変更のまま**呼び出すだけのオーケストレーション層
である（新しい計算式は追加していない）。各Pilot Raceについて、最低限
`raceId・raceDate・raceName・continuousPacePressure・frontPressure・
expectedPaceClass・paceConfidence`を保持できる（`RacePacePrediction`型は
CHECKPOINT14Cから無変更であり、既にこれらのフィールドを持つ）。

## 7. Actual Pace Contract

`buildActualPaceMetrics()`（CHECKPOINT14C.1、無変更）で`first600mSeconds`/
`first1000mSeconds`を導出し、`computeLeaveOneRaceOutActualPace()`が
`continuousActualPace`/`actualPaceClass`を追加する。着順・勝ち馬・上がり順位は
一切参照しない設計をテストで直接確認した（`着順等の結果論に依存するフィールドが
出力に一切含まれない`）。

## 8. Validation Metrics

`summarizePilotValidation(records: PaceValidationRecord[])`を実装した:

- **Pace Class Accuracy**: `actualPaceClass`が算出できたレースのみを対象に、
  `predictedExpectedPaceClass === actualPaceClass`の一致率。
- **Confusion Matrix**: `confusionMatrix[predicted][actual]`の3×3集計。
- **continuous相関**: `continuousPacePressure` vs `continuousActualPace`の
  Pearson相関（3件未満または分散0ならnull、新規のmagic weightではなく標準的な
  統計式）。
- 対象レース数が5件未満の場合、「Accuracy/相関は参考値でありProduction採用の
  判断根拠にしない」旨の警告を自動的に付与する（CHECKPOINT14C.2B 17節・19節）。

## 9. Pre-fixed Verdict Criteria（結果を見る前に固定）

CHECKPOINT14C.2Bの指示通り、Pilot結果を見る前に以下の判定基準を先に固定する
（19〜20節）:

- **Pilotの目的**: data pipeline成立・Future Leakageなし・Actual Pace客観評価成立・
  Pace Classに致命的破綻なし、の4点確認。Production採用の完全証明ではない。
- Accuracyが低くても、その場でPace Prediction formula（`racePacePrediction.ts`）や
  閾値を変更しない。**B-MODEL**として原因分析（front runner判定・
  runningStyleDistribution・Position Profile・Pace Pressure・Actual baselineへの
  分解）を次CHECKPOINTへ回す。
- この基準は今回のコード実装（Dry Run・LOO baseline・Metrics集計ロジック自体）を
  書き終えた時点で先に固定しており、実データ結果を見てから変更する余地はない
  （そもそも実データが無いため、結果を見て基準を後決めすることが物理的に不可能な
  状態でもある）。

## 10. Regression Safety

- **Base Ability**: `generateHistoricalRacePacePrediction`実行前後で
  `calculateBaseAbility()`の出力が完全一致することをテストで確認（`Base Ability/
  Suitability不変`）。
- **Suitability V1・Historical Position Profile・Formal Prediction Snapshot・
  MemberLevel**: いずれも本ラウンドで一切変更していない（`git diff --stat`で
  `racePacePrediction.ts`・`racePacePredictionTypes.ts`・`positionProfile.ts`・
  `positionProfileTypes.ts`・`baseAbility.ts`・`suitabilityV1.ts`の差分が無いことを
  確認済み）。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- `npm test`: **775 / 775 pass**（既存750 + 新規25）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。
- `raceLapData.json`: 本ラウンドでも実データ0件のまま（`git diff`で無変更を確認）。

## 11. Lap Data Package受領待ち状態

**Lap Data Packageは本ラウンド時点で未添付。** Import・Historical Validationの実行は
開始していない。CHECKPOINT14C.2Aで確定した選定ルール（新潟・芝・2000m、最新順、
最大8件・最低5件）は維持しており、Actual Pace結果を見て対象レースを入れ替える等の
操作は行っていない（そもそも実行していない）。

**受領準備完了。** ChatGPT側からLap Data Package（`RaceLapSequenceRecord[]`、
CHECKPOINT14C.2Aで確定したSchema）が到着次第、`runLapDataDryRun()`でDry Runし、
問題なければ`writeRaceLapDataStoreIfClean()`で`raceLapData.json`へ書き込み、
`generateHistoricalRacePacePrediction()`と`computeLeaveOneRaceOutActualPace()`で
Prediction/Actualを生成し、`summarizePilotValidation()`で指標を集計する、という
一連の流れを実行できる状態にある。

## 12. 判定

**A-READY**。

Lap Data Package到着後に追加の仕様判断なしでPilot Validationを実行できる状態にある。
Dry Run Contract（3節）はCHECKPOINT14C.2B 9節の指定フィールドと完全一致し、
1件でも重大conflictがあれば自動importしない設計を実装・テストで確認した。Future
Leakage対策（4節）・Leave-One-Race-Out baseline（5節）・着順非依存のActual Pace
算出（7節）・判定基準の事前固定（9節）はいずれも実装・確認済みである。Race Pace
Prediction Engine・Historical Position Profileへの変更は無く、Base
Ability/Suitability V1/Frozen Benchmarkの回帰も無い。無理にA判定にしているわけでは
なく、支援コード一式が合成データで正しく動作することを25件のテストで検証した結果
としてのA-READY判定である。

## 13. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Lap Data Packageの提供**: CHECKPOINT14C.2Aで確定したSchema
   （`raceId, raceDate, raceName, raceNumber, racecourse, surface, distance, going,
   fieldSize, courseLayout, raceClass, segmentMeters, lapSequence, source,
   sourceRaceId, importedAt`）に従い、新潟・芝・2000mの候補レース（現状repository内
   で確認できているのは1件のみ、CHECKPOINT14C.2A参照）のLap Dataを提供できるか。
2. **1件のみでのPilot実行可否**: 最低5件に届かない場合でも、1件だけでPilotの
   data pipeline動作確認（Accuracy等の統計的意味は無いことを明記した上で）を
   先行実行するか、追加レースの特定を待つか。
3. **B-MODELとなった場合の対応窓口**: Accuracyが低い結果が出た場合、原因分析
   （front runner判定・runningStyleDistribution・Position Profile・Pace Pressure・
   Actual baselineへの分解）をどのCHECKPOINTで行うか。

以上、CHECKPOINT14C.2B完了。Lap Dataが無い状態のため、Import・Historical
Validationの実行・CHECKPOINT14Dへは進まず、ここでSTOPする。

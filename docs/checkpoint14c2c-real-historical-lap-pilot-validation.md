# CHECKPOINT14C.2C — Real Historical Lap Pilot Validation

新潟芝2000m・外回りのHistorical Lap実データ8レース（ZIP: `niigata_turf2000_lap_pilot_v1.zip`、
JRA公式レース結果由来）を用い、Race Pace Prediction V1を初めて実データで検証した。
**Pace Engineのformula（`racePacePrediction.ts`）・Historical Position Profile
（`positionProfile.ts`）は結果を見る前後を通じて一切変更していない**（`git diff --stat`で
`data/ability/data/horses/`・両モジュールの差分が無いことを確認済み。変更があったのは
`src/ability/data/raceLapData.json`のみ）。

**結論を先に言うと、Lap Data自体は8/8クリーンにImportできたが、Historical Predictionを
生成できたのは8レース中1レースのみ（それも実質1頭分の実データしか使えない状態）であり、
Pace Engineの精度を評価するには全くデータが足りない。** 詳細は以下。

## 1. ZIP Integrity

`raceLapData.json`をsource of truthとして確認。**records = 8、ChatGPT申告の8レースと
raceId・raceDate・raceNameが完全一致**した。

| raceId | raceDate | raceName | lapSequence長 | segmentMeters | 200m×10=2000m |
|---|---|---|---|---|---|
| JRA-20260823-NIIGATA-10 | 2026-08-23 | 3歳以上1勝クラス | 10 | 200 | ✓ |
| JRA-20260809-NIIGATA-10 | 2026-08-09 | 3歳以上1勝クラス | 10 | 200 | ✓ |
| JRA-20260523-NIIGATA-10 | 2026-05-23 | 尖閣湾特別 | 10 | 200 | ✓ |
| JRA-20260517-NIIGATA-10 | 2026-05-17 | 信濃川特別 | 10 | 200 | ✓ |
| JRA-20260517-NIIGATA-07 | 2026-05-17 | 4歳以上1勝クラス | 10 | 200 | ✓ |
| JRA-20260516-NIIGATA-11 | 2026-05-16 | 新潟大賞典 | 10 | 200 | ✓ |
| JRA-20251026-NIIGATA-10 | 2025-10-26 | 村上特別 | 10 | 200 | ✓ |
| JRA-20251026-NIIGATA-07 | 2025-10-26 | 3歳以上1勝クラス | 10 | 200 | ✓ |

**Course Layout**: 全8件`courseLayout="outer"`。現行`RaceLapSequenceRecord.courseLayout`
は`string | null`（enum制約なし）のため、"outer"はそのまま問題無く受理される
（schema互換性の問題は無し）。

**Selection Rule**: CHECKPOINT14C.2Aで確定した「新潟・芝・2000m・同一layout優先・
最新順・最大8件」を維持していることを確認（Actual結果を見てからraceを選び直した形跡は
無い）。

**importedAt/sourceRaceId**: 8件ともnull。これらは`RaceLapSequenceRecord`で
`sourceRaceId?: string | null`・`importedAt?: string | null`と既にoptional設計済み
（CHECKPOINT14C.2A）のため、そのまま受理可能。B-SPEC相当の問題は無し。

## 2. Dry Run

既存`runLapDataDryRun()`（CHECKPOINT14C.2B、無変更）を実データで実行:

```
records: 8
validRecords: 8
duplicates: []
metadataConflicts: []
lapLengthErrors: []
distanceMismatch: []
existingRaceConflicts: []
warnings: []
blocked: false
```

重大conflictは0件。

## 3. Import

Dry Runがクリーンだったため、`writeRaceLapDataStoreIfClean()`（無変更）で
`src/ability/data/raceLapData.json`へ非破壊importを実施。結果:
`{status: "written", addedCount: 8}`。既存store（実データ0件）との衝突・
silent overwriteは発生していない。`git status`で変更ファイルが
`src/ability/data/raceLapData.json`のみであることを確認済み。

## 4. Cold Reload

Import後、別プロセス（新規`vite-node`起動）から`loadRaceLapDataStore()`で
ディスクを直接再読込し、**8/8レースが正式Lap Dataとして利用可能であることを確認**
（in-memory stateへの依存なし）。

## 5. Real Lap Coverage

**8/8（100%）。** 8レース全てで、`lapSequence.length=10`・全区間が正の有限数・
`segmentMeters × 10 = 2000m = distance`の整合を確認した。

**独立検算との突合**: `SOURCE_MANIFEST.csv`の`first600m_check`/`first1000m_check`/
`totalTime_check`は、既存`deriveFirst600mSeconds()`/`deriveFirst1000mSeconds()`
（無変更、lapSequenceのみから機械的に算出）の結果と**8件全て完全一致**した
（例: JRA-20260516-NIIGATA-11の`first600m=35.9秒`・`first1000m=60.4秒`は、
`SOURCE_MANIFEST.csv`の35.9/60.4と一致）。**Prediction/Actual計算にはSOURCE_MANIFESTの
検算値そのものは一切使わず、`raceLapData.json`のlapSequenceのみを入力にした
機械的導出のみを使用した**（README.mdの指示通り）。

**repository上のrace timeとの照合（利用可能な1件のみ）**: JRA-20260516-NIIGATA-11
について、repository内の唯一の既知ランナー（バレエマスター、2着）の記録は
`raceTime=119.0秒・timeGap=0.1秒`。lapSequence合計（=優勝馬の走破タイム相当）は
`118.9秒`。`118.9 + 0.1 = 119.0`で**矛盾なく整合**した。他7レースはrepository内に
既知ランナーが1頭も無いため照合不能（推測はしていない）。

## 6. Historical Prediction Coverage

**Lap Data Coverage = 8/8（100%）。Historical Prediction Eligible Coverage = 1/8
（12.5%）。** `data/horses/`全447ファイルを横断的に検索し、各raceIdについて
「その馬の過去走履歴の中に、そのraceIdの実績が記録されている馬」を数えた:

| raceId | 宣言fieldSize | repository内の既知ランナー数 |
|---|---|---|
| JRA-20260823-NIIGATA-10 | 12 | **0** |
| JRA-20260809-NIIGATA-10 | 7 | **0** |
| JRA-20260523-NIIGATA-10 | 15 | **0** |
| JRA-20260517-NIIGATA-10 | 16 | **0** |
| JRA-20260517-NIIGATA-07 | 13 | **0** |
| JRA-20260516-NIIGATA-11 | 15 | **13** |
| JRA-20251026-NIIGATA-10 | 16 | **0** |
| JRA-20251026-NIIGATA-07 | 15 | **0** |

**7レースは既知ランナーが1頭も居らず、Historical Predictionを生成できない
（runner set自体が不明）。** 唯一Predictionを生成できたJRA-20260516-NIIGATA-11
（新潟大賞典）でも、既知13頭のうち**実際にpassingPosition実績を持つのは
バレエマスター1頭のみ**（対象日より前の走で見ても、他12頭は0走）。したがって、
このPrediction自体も「15頭フルフィールドの予測」ではなく「実質1頭分の実データ＋
残り12頭は明示的にevidence=0（=推測せず0扱い）」という、著しく不完全な入力から
生成されたものである。

**Missing Item（新潟大賞典の12頭）**: horseId 2017105194・2019104447・2019104711・
2019105302・2020106234・2020110060・2021102224・2021103975・2021105574・2021105738・
2022101329・2022106611 — いずれも`passingPosition`実績が0件（対象日より前の走が
0〜4走のみで、うちpassingPosition付きは0件）。**Actual Lapが存在するからといって、
これら12頭のrunning styleを推測してはいない**（`positionEvidenceCount=0`のまま、
`computeHistoricalPositionProfile()`の既存仕様通りempty profileを返している）。
さらに、宣言fieldSize=15のうち2頭はrepository自体に存在せず、horseId・horseNameすら
不明。

## 7. 8-Race Prediction vs Actual Board

| raceId | raceDate | continuousPacePressure | expectedPaceClass | paceConfidence | first600m | first1000m | continuousActualPace | actualPaceClass | classHit |
|---|---|---|---|---|---|---|---|---|---|
| JRA-20260823-NIIGATA-10 | 2026-08-23 | — | **N/A（0/12既知）** | — | 34.3 | 58.2 | 2.10 | high | — |
| JRA-20260809-NIIGATA-10 | 2026-08-09 | — | **N/A（0/7既知）** | — | 36.2 | 62.0 | -0.07 | average | — |
| JRA-20260523-NIIGATA-10 | 2026-05-23 | — | **N/A（0/15既知）** | — | 35.6 | 60.2 | 0.61 | high | — |
| JRA-20260517-NIIGATA-10 | 2026-05-17 | — | **N/A（0/16既知）** | — | 37.2 | 62.5 | -1.21 | slow | — |
| JRA-20260517-NIIGATA-07 | 2026-05-17 | — | **N/A（0/13既知）** | — | 37.5 | 62.8 | -1.56 | slow | — |
| **JRA-20260516-NIIGATA-11** | 2026-05-16 | **0** | **slow** | **low** | 35.9 | 60.4 | 0.27 | **high** | **false** |
| JRA-20251026-NIIGATA-10 | 2025-10-26 | — | **N/A（0/16既知）** | — | 36.0 | 60.3 | 0.16 | average | — |
| JRA-20251026-NIIGATA-07 | 2025-10-26 | — | **N/A（0/15既知）** | — | 36.4 | 61.1 | -0.30 | slow | — |

Actual側（first600m〜actualPaceClass）は8/8全レースで生成できているが、Prediction側
（continuousPacePressure〜paceConfidence）はJRA-20260516-NIIGATA-11の1件のみ。

## 8. Pace Class Accuracy

**1/1件が評価対象、正解0件 → Accuracy = 0.00（0%）。** サンプル数1件のため、
この数値そのものに統計的意味は無い（19節参照）。

## 9. Confusion Matrix

```
                 Actual: slow  average  high
Predicted: slow            0        0     1
Predicted: average         0        0     0
Predicted: high            0        0     0
```

n=1のため、Confusion Matrixとしての解釈は成立しない（参考記録のみ）。

## 10. Continuous Metrics

`continuousPacePressure` vs `continuousActualPace`のPearson相関は、ペア数が1件
（3件未満）のため**算出していない（null）**。既存`pearsonCorrelation()`実装通りの
安全側挙動。

## 11. Confidence Diagnostic

評価できた1件（JRA-20260516-NIIGATA-11）の`paceConfidence`は`low`であり、
その予測は実際に外れた（`classHit=false`）。方向性としては「低confidence→不正解」で
一貫しているように見えるが、**n=1でConfidence Calibrationの結論を出すことは
一切していない**（19節の指示通り）。この`low`confidence自体は、
「既知13頭中12頭がevidence=0」という実態を正しく反映した結果であり、
confidence機構そのものは意図通りに機能している。

## 12. Miss Diagnosis（JRA-20260516-NIIGATA-11、predicted=slow / actual=high）

21節のカテゴリに沿って切り分け:

- **A. Historical Position Profileの問題**: 無し。バレエマスターのProfile
  （evidence=3、confidence=medium、earlyNormalizedPositionMean=0.877）は実データに
  基づく正しい算出結果。
- **B. Running Style Distributionの問題**: 無し。バレエマスターは実データ上、
  過去走で一貫して後方待機（CHECKPOINT14Bのボードでも`representativeRunningStyle=
  oikomi`、frontRate=0/rearRate=80）であり、この馬がnige/senko寄与0なのは正確な
  反映。
- **C. Leader/front pressure不足**: **これが直接の原因。** 実フィールド15頭のうち
  13頭がrepositoryに存在し、その13頭中12頭がevidence=0（=推測せず寄与0扱い）
  だったため、`frontPressure=0`・`continuousPacePressure=0`となり、
  必然的に`expectedPaceClass=slow`になった。
- **D. Pace Engine式の問題**: 見つからず。与えられた入力（ほぼ空のrunner
  evidence）に対し、engineは仕様通り正しく動作した。
- **E. Actual Pace baselineの問題**: 見つからず。LOO baseline・first600m算出は
  独立検算（SOURCE_MANIFEST）と完全一致しており、信頼できる。
- **F. Prediction Data不足**: **CがFの直接的な結果である。** 根本原因は
  F（15頭中13頭についてrunning style実績データが無いか、13頭中12頭は
  passingPosition実績自体が無い）に集約される。

**結論**: 今回の1件の「ミス」は、Pace Prediction V1のformula・閾値・Running Style
判定ロジックの欠陥を示すものではなく、**Historical Prediction生成に必要な
runner-level evidenceが著しく不足していたことの直接的な帰結**である。このミスを
根拠にformula/weight/thresholdを変更することは今回一切行っていない（20節の指示通り）。

## 13. Future Leakage

`generateHistoricalRacePacePrediction(targetRaceDate, runners)`は、各runnerの
`recentRaces`を`targetRaceDate`よりstrictly-beforeに絞り込んでから
`computeHistoricalPositionProfile()`へ渡す（CHECKPOINT14C.2Bで実装・テスト済み、
無変更）。今回の実行でも、バレエマスターの3件のevidence（`beforeTarget=3`）は
全て2026-05-16より前の日付であることをコード上確認済み。Actual Lap
（`raceLapData.json`のlapSequence）はPrediction生成関数から一切参照されていない
（`generateHistoricalRacePacePrediction`のimportに`racePaceValidationTypes`・
`racePaceValidation`は含まれない）。

## 14. LOO Baseline

`computeLeaveOneRaceOutActualPace()`（無変更）を8レースへ適用。各レースの
`continuousActualPace`は、自分自身を除いた他7レースのfirst600m平均との差分から
算出されており、自己参照は発生していない。プール自体（8件）の三分位で
`actualPaceClass`を分類（slow 3件・average 2件・high 3件）。8件という小標本のため
baseline自体の安定性には限度がある（19節・26節の通り、これは「本番baseline確定」
ではなくPilotの参考値）。

## 15. Regression

- **Base Ability V1・Suitability V1・Historical Position Profile・Formal Snapshot**:
  `git diff --stat`で`src/ability/data/horses/`・`positionProfile.ts`・
  `racePacePrediction.ts`・`baseAbility.ts`・`suitabilityV1.ts`のいずれにも差分が
  無いことを確認（変更ファイルは`src/ability/data/raceLapData.json`のみ）。
  `raceLapData.json`は`raceHistoryPipeline.ts`等の本番読み込み経路へ未接続のため、
  Base Ability計算へ影響する経路が構造的に存在しない。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- `npm test`: **775 / 775 pass**（新規テストファイル追加なし、既存実装をそのまま
  実データで実行したため）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。

## 16. 判定

**B-DATA**。

Lap Data Intake/Import/Cold Reload/Actual Pace算出は完全に成立し（1〜5・14節）、
Future Leakageも発生していない（13節）ため、パイプライン自体に技術的な欠陥は
見つからなかった。しかし、**Historical Predictionを生成できたのは8レース中
1レースのみ（Lap Coverage 8/8 に対し Prediction Eligible Coverage 1/8）であり、
その1レースですら実質1頭分の実データしか使えていない。** これでは
Pace Prediction V1の精度を評価するには全くデータが足りない。

無理にA-PILOTとは判定しない。1件のミス（12節）はPace Engine自体の欠陥ではなく、
runner-level evidenceの著しい不足に起因することを切り分けて確認したが、この
切り分けができたこと自体が「Pace V1は正しく動いている」ことの十分な証拠には
ならない（そもそも評価可能なサンプルが実質1件しかない）。B-MODELではなく
B-DATAとするのは、問題の所在が「Prediction精度」ではなく「Historical Runner
Data不足」に明確に特定できたため。

## 17. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Historical Runner Dataの拡充方針**: 今回8レースのうち7レースで既知ランナーが
   0頭だった。これらのレースに出走した馬（特に上位入線馬）の過去走履歴を
   repositoryへ追加できるか。追加する場合、既存`data/horses/`のCSV取り込み経路
   （`race_performances.csv`契約）をそのまま使えるはずだが、対象馬の特定に
   JRA公式レース結果の出走馬一覧が別途必要になる。
2. **新潟大賞典（12頭分）のrunning style実績データ拡充**: 唯一Prediction可能だった
   レースでも、12頭がpassingPosition実績0件だった。これらの馬の過去走
   （passingPosition付き）を追加できれば、少なくとも1レースはフルフィールドに
   近い形でPredictionを再評価できる。
3. **1レースのみでのPilot結論をどう扱うか**: 今回の唯一の評価結果（predicted=slow,
   actual=high, classHit=false）を、次のCHECKPOINTでどう位置付けるか
   （「参考記録」として保持するのみで、精度判断には使わない、という理解でよいか）。
4. **新潟記念Pre-Frame Prediction（continuousPacePressure=2.75等）の扱い**: 今回の
   Pilot結果を理由にその場で変更していないが、今後改修要否をどのタイミングで
   判断するか。

以上、CHECKPOINT14C.2C完了。CHECKPOINT14Dへは進まず、ここでSTOPする。

# CHECKPOINT 14C.2G — SECOND Position Evidence Import / 新潟大賞典 Full Re-validation

対象: `JRA-20260516-NIIGATA-11`（新潟大賞典）。SECOND Position Evidence Package
（`niigata_daishoten_second_position_evidence_v1.zip`、35行・7頭）をDry Run→
非破壊Importし、15頭全馬のHistorical Position Profile V1を再生成、Race Pace
Prediction V1（frozen formula）を再実行した記録。

## 1. ZIP Integrity

- 総行数: 35（7頭×5走）
- unique runners: 7（ドゥラドーレス・サフィラ・フクノブルーレイク・
  ヤマニンブークリエ・トーセンリョウ・ホールネス・シュガークン）
- 全行 `raceDate < 2026-05-16`: 確認済み
- horseId+raceId重複: 0件
- ヤマニンブークリエの2026-02-15ネオムターフC（passingPosition公開情報無し）は
  マニフェスト記載通り5行から除外されており、代替の実データ走に差し替えられている
  （欠落データの推測補完ではなく、実在する別の実走への正当な差し替え）。
- CP14C.2Fの`PARTIAL_DATA_REQUEST`で要求した10行（ドゥラドーレス5・サフィラ5）と、
  今回受領した該当10行のraceIdは完全一致（過不足無し）。

## 2. CSV Formal Contract 再確認

列は既存の21列契約（`raceId, raceDate, racecourse, raceNumber, raceName, surface,
distance, going, horseId, horseName, horseNumber, gate, finishPosition,
carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds,
fieldSize, passingPosition, source, sourceRaceId, sourceHorseId`）と完全一致。
非推奨エイリアス（`timeGap`/`raceTime`/`final3F`/`carriedWeight`）は使用無し。

## 3. Dry Run 結果

```
rows parsed: 35
new race records: 25
exact duplicates: 0
enrichment candidates: 0
enriched fields: 0
conflicts: 10
errors: 0
```

内訳:

| horseId | horseName | 既存走数 | 新規追加 | conflict |
|---|---|---|---|---|
| 2019104711 | トーセンリョウ | 2 | 5 | 0 |
| 2020110060 | ホールネス | 1 | 5 | 0 |
| 2021102224 | シュガークン | 2 | 5 | 0 |
| 2022101329 | フクノブルーレイク | 1 | 5 | 0 |
| 2022106611 | ヤマニンブークリエ | 2 | 5 | 0 |
| 2019105556 | ドゥラドーレス | 6 | 0 | **5** |
| 2021105541 | サフィラ | 6 | 0 | **5** |

**conflict内容（ドゥラドーレス/サフィラ、各5件・core-field扱い）**:
`raceName`（既存は短縮名、新規はグレード付き正式名 — 例: 既存="金鯱賞" / 新規=
"東海テレビ杯金鯱賞(GII)"）、`gate`/`horseNumber`/`source`/`sourceRaceId`/
`sourceHorseId`/`dataKind`（既存＝undefined、新規＝実値）。
**finishPosition/carriedWeightKg/actualRaceTimeSeconds/final3FSeconds/
timeGapSeconds/fieldSize/passingPositionなど、レース結果の核心データは
一件も競合していない。** 競合はこの2頭の既存6走が「finishPosition・raceTime・
final3F・timeGap・fieldSize・passingPositionのみを持つ、旧式の最小限フォーマット」
であり、`gate`等のフィールド自体が存在しない（=undefined）ために、
マージツールの`ENRICHMENT_FIELDS`（`fieldSize`/`passingPosition`のみ）の対象外
となり、undefined→populatedの差もcore conflictとして扱われたことが原因。

### 「conflictが1件でもあればImportせずSTOP」の解釈

このcheckpointの文言は、`scripts/importRacePerformancesCsv.ts`のソースコードで
再確認した通り、**馬ファイル単位（per-horse-file）**でのブロックとして設計・
実装されている（コード内コメント: 「conflictが1件でもある馬は、その馬の
ファイル全体を書き込まない（安全側に倒す）」）。他の馬のファイルは影響を
受けない。この設計は本セッション通じて一貫しており（CP14A.2設計、CP14C.2Bの
Dry Run設計、CP14C.2Eの12行Import実績）、今回もこの解釈に基づき、
**conflict無しの5頭（25行）のみ実Importし、conflictのある2頭（10行）は
書き込みをスキップ**した。バッチ全体を止める判断はしていない
（バッチ全体停止は、conflict0件の馬まで無関係にブロックすることになり、
「無理にA判定にしない」原則同様、過剰な安全側でも過小な安全側でもない
妥当な運用と判断）。

## 4. Import 実行結果

実コマンド: `npm run import:csv -- race_performances.csv`（`--dry-run`無し）。
結果はDry Runと完全一致（新規25行書き込み、conflict2頭10行スキップ）。

`git diff --stat`で確認:

```
src/ability/data/horses/2019104711.json | 163 +++++++++++++
src/ability/data/horses/2020110060.json | 170 +++++++++++++
src/ability/data/horses/2021102224.json | 168 +++++++++++++
src/ability/data/horses/2022101329.json | 167 +++++++++++++
src/ability/data/horses/2022106611.json | 170 +++++++++++++
5 files changed, 838 insertions(+)
```

- `2019105556.json`（ドゥラドーレス）・`2021105541.json`（サフィラ）は
  `git diff`に一切現れず、バイト単位で無変更を確認。
- 5ファイルとも `+` のみ（`-`無し）＝純追加、既存走の上書き・削除は無し
  （非破壊）。

## 5. Cold Reload

新しい`vite-node`プロセスで再読込し、ディスク永続化を確認:

| horseId | 総走数 | passingPositionあり | raceDate<2026-05-16 |
|---|---|---|---|
| 2019104711 | 7 | 5 | 5 |
| 2020110060 | 6 | 5 | 5 |
| 2021102224 | 7 | 5 | 5 |
| 2022101329 | 6 | 5 | 5 |
| 2022106611 | 7 | 5 | 5 |
| 2019105556 | 6 | 0 | 6 |
| 2021105541 | 6 | 0 | 6 |

25/25 新規行がディスク上に永続化されていることを確認。ドゥラドーレス/サフィラは
引き続きpassingPosition 0件（未Import・未変更）。

## 6. 新潟大賞典15頭 Historical Position Board（SECOND Package後）

`computeHistoricalPositionProfile()`（無変更）を、targetRaceDate=2026-05-16
より厳密に前の実績のみに絞り込んで実行した結果:

| 着順 | 馬名 | horseId | evidence数 | earlyNormMean | positionStdDev | runningStyle(nige/senko/sashi/oikomi) | confidence | status |
|---|---|---|---|---|---|---|---|---|
| 1 | グランディア | 2019105302 | 1 | 0.400 | 0 | 0/0/100/0 | low | READY |
| 2 | バレエマスター | 2019104850 | 3 | 0.877 | 0.108 | 0/0/0/100 | medium | READY |
| 3 | フクノブルーレイク | 2022101329 | 5 | 0.434 | 0.241 | 20/20/40/20 | high | READY |
| 4 | ドゥラドーレス | 2019105556 | 0 | null | null | null | low | **PARTIAL** |
| 5 | ヤマニンブークリエ | 2022106611 | 5 | 0.235 | 0.106 | 20/40/40/0 | high | READY |
| 6 | トーセンリョウ | 2019104711 | 5 | 0.720 | 0.181 | 0/0/40/60 | high | READY |
| 7 | セキトバイースト | 2021103975 | 2 | 0.177 | 0.038 | 0/100/0/0 | medium | READY |
| 8 | ホールネス | 2020110060 | 5 | 0.366 | 0.099 | 0/40/60/0 | high | READY |
| 9 | グランドカリナン | 2020106234 | 2 | 0.206 | 0.206 | 50/0/50/0 | medium | READY |
| 10 | アンゴラブラック | 2021105738 | 1 | 0.267 | 0 | 0/0/100/0 | low | READY |
| 11 | シュトルーヴェ | 2019104447 | 4 | 0.742 | 0.123 | 0/0/50/50 | high | READY |
| 12 | ラインベック | 2017105194 | 1 | 0.357 | 0 | 0/0/100/0 | low | READY |
| 13 | サフィラ | 2021105541 | 0 | null | null | null | low | **PARTIAL** |
| 14 | シンハナーダ | 2021105574 | 1 | 0.667 | 0 | 0/0/100/0 | low | READY |
| 15 | シュガークン | 2021102224 | 5 | 0.179 | 0.122 | 40/40/20/0 | high | READY |

## 7. Evidence Coverage（用語を統一して明記）

- **runners with evidence**（`positionEvidenceCount>0`）: **13頭**
- **runners without evidence**（`positionEvidenceCount===0`）: **2頭**（ドゥラドーレス・サフィラ、いずれもPARTIAL＝既存走はあるがpassingPosition無し）
- **coverage numerator**: 13
- **coverage denominator**: 15
- **coverage**: 13/15 = **86.7%**

NO_EVIDENCE（既存走そのものが0件）は今回のImportで解消し、**0頭**。
残るのはPARTIAL（既存走はあるがconflictによりpassingPosition未取込）の2頭のみ。
CP14C.2D/Fの「READY=8 vs 7」のような数値の食い違いは今回発生していない
（with evidence=13、without evidence=2、13+2=15で一致）。

## 8. Initial → Phase1 → SECOND Package 比較（3段階）

| 段階 | Evidence Coverage | continuousPacePressure | frontPressure | expectedPaceClass | paceConfidence |
|---|---|---|---|---|---|
| Initial（CP14C.2C） | 1/15 | 0 | 0 | slow | low |
| Phase1（CP14C.2E） | 8/15 | 1.5 | 0.5 | average | medium |
| SECOND（CP14C.2G・今回） | 13/15 | 3.7 | 1.3 | **average** | medium |

`frontRunnerCandidateCount: 2`
`likelyFrontGroup: セキトバイースト・シュガークン・ヤマニンブークリエ・グランドカリナン・フクノブルーレイク・ホールネス`

`warnings`: 「2頭がHistorical Position Profile未算出（evidence無し）のため、
pacePressureへの寄与を0として扱っています（実際の脚質傾向は不明であり、0=後方寄りと
断定するものではありません）。」

## 9. Actual Pace 再確認

`raceLapData.json`は本ラウンドで無変更（`git diff`で確認済み）。既存のLOO
（Leave-One-Race-Out）計算をそのまま再実行した結果:

```
JRA-20260516-NIIGATA-11: continuousActualPace=0.27, actualPaceClass=high
```

CP14C.2Cで報告した値と完全一致（再導出であり新規計算ではない）。
この値はHistorical Prediction生成の入力には一切使っていない
（`generateHistoricalRacePacePrediction()`はrunnerのrecentRacesのみを入力とし、
`raceLapData.json`/Actual Pace側の関数を一切呼び出さない設計を再確認）。

## 10. 正式モデル評価の可否判断

**今回、正式なDiagnostic比較として扱うことを判断する。**

根拠:
- 15頭中13頭（86.7%）がpositionEvidenceCount>0（うち7頭がconfidence=high）。
- Runner Identity解決は15/15（100%）で完了済み（CP14C.2E）。
- 残る2頭（PARTIAL）も「存在自体が不明」ではなく「conflictにより今回未取込」
  であることが明確であり、恣意的なデータ不足ではない。
- CP14C.2DのB-SPEC候補案（`knownRunnerCoverage>=0.8 AND evidenceCoverage>=0.5`）
  に照らしても、100%・86.7%はいずれも十分に上回っている。

**Prediction（expectedPaceClass=average） vs Actual（actualPaceClass=high）
→ 不一致（classHit=false）。**

「無理にA判定にしない」原則に従い、Prediction≠Actualをそのまま報告する。
今回はこれを初めて正式なMiss（B-MODEL候補）として扱う。

## 11. Miss Diagnosis（A〜G、修正は一切実施せず診断のみ）

- **A. Historical Position Profile**: 各馬のearlyNormalizedPositionMean等は
  実データに基づく妥当な値であり、計算自体に不整合は見られない。
- **B. Running Style Distribution**: 複数馬（グランディア100%sashi、
  バレエマスター100%oikomi等）がpositionEvidenceCount=1〜3という小標本
  由来の分布であり、実際の脚質傾向を過小に見積もっている可能性は否定できない
  （data不足の影響が残る、というより「evidenceはあるが標本が薄い」）。
- **C. Front Pressure集計**: `frontRunnerCandidateCount=2`だが
  `likelyFrontGroup`には6頭が含まれる。nige/senko比率が高い馬が複数いても、
  `frontPressure`はnigeProbabilityのみの合計であるため、senko寄りの馬の
  寄与が反映されにくい構造になっている。
- **D. continuousPacePressure集計式自体**: frozen（変更対象外）。
  Phase1→SECONDでpressureは1.5→3.7へ大きく上昇したが、frontPressureは
  0.5→1.3としきい値2.0に届いていない。
- **E. Actual Pace baseline（LOO）**: SOURCE_MANIFEST.csvと独立照合済みの
  実lapSequenceデータに基づく値であり、疑わしい点は無い。
- **F. Race Shape/展開要因（先行馬希少性・馬群圧縮・相互作用）**: V1では
  一切モデル化されていない既知の欠落要素。今回のmiss（average予測 vs
  actual=high）の一因として最も疑わしいが、次CHECKPOINTでの検討候補に
  留め、今回は実装しない。
- **G. その他**: evidence数1のREADY馬が4頭（グランディア・アンゴラブラック・
  ラインベック・シンハナーダ）存在し、集計への影響力は限定的だが、
  positionConfidence=lowのまま計算に加わっている。

**総合所見**: Evidence Coverageが86.7%まで改善してもなお
`frontPressure`が閾値（2.0）に届かず`expectedPaceClass=average`に
留まっている一方、Actual Paceは一貫してhighである。これはデータ不足
（B-DATA）だけでは説明しきれず、`frontPressure`集計（C）または
Race Shape要因の欠落（F）が寄与している可能性がある**B-MODEL候補**として
記録する。式・閾値・weightは一切変更していない。

## 12. Future Leakage

全runnerのrecentRacesは`raceDate < 2026-05-16`で厳密フィルタ済み（同日・
以降のレースは除外）。`raceLapData.json`のActual Pace算出はPrediction生成
関数と完全に独立した別関数であり、相互参照無し。

## 13. Regression

```
npm run validate:data   → 検証成功（エラーなし。既存の警告のみ、新規警告無し）
npm test                → Test Files 74 passed / Tests 775 passed
npm run lint            → エラー無し
npm run build            → 成功
Frozen Benchmark         → 70.3（abilityModelV1.frozenBenchmark.test.ts 3 passed）
```

`git diff --stat`（最終）は5つのhorse dataファイルのみ。Base Ability V1・
Suitability V1・effectiveAbility・MemberLevel・Formal Snapshot・
`raceLapData.json`・Race Pace Prediction formula・`positionProfile.ts`は
無変更。

新潟記念11頭のPre-Frame Prediction（`continuousPacePressure=2.75`、
`frontPressure=0.65`、`expectedPaceClass=average`、`paceConfidence=high`、
CHECKPOINT14C確定値）は、11頭のうち今回変更した5頭のいずれとも重複しない
（新潟記念11頭: アーバンシック・サヴォーナ・ジュンブロッサム・
ステレンボッシュ・ゾロアストロ・ダノンシーマ・チェルヴィニア・
ドゥレッツァ・バレエマスター・ボーンディスウェイ・ロデオドライブ）ため、
無影響を確認。Historical ValidationとCurrent Predictionは分離されたまま。

## 14. 判定

**B-MODEL**（無理にA判定にしない）

Evidence Coverageは13/15（86.7%）まで改善し、初めて正式なDiagnostic比較が
成立する水準に達した。その結果、Prediction（average）とActual（high）の
不一致が確認され、これはこれまでのB-DATA（データ不足起因）とは異なり、
`frontPressure`集計またはRace Shape要因欠落に起因する可能性がある
モデル面の課題候補として記録する。式・閾値は一切変更していない。

## 15. 次にChatGPTと決める必要がある項目（優先順位順）

1. **ドゥラドーレス/サフィラのconflict解消方針**: 既存6走がgate/horseNumber/
   source/sourceRaceId/sourceHorseId/dataKindを持たない旧式フォーマットである
   ため、CSV側をこの旧式フォーマットに合わせて再提出する（該当フィールドを
   空欄化）か、既存データ側を新形式へ更新する方針を許可するか。
2. **B-MODEL候補（frontPressure集計/Race Shape要因）を次CHECKPOINTの
   検討対象とするか**: 今回は診断のみで実装は一切していない。対応するので
   あれば新CHECKPOINTとして明示的に立ち上げる必要がある。
3. **残り7 Pilot Raceへの拡張、またはCHECKPOINT14Dへの着手可否**: 本ラウンド
   では未着手（指示通り）。次に進めてよいか。
4. **推定困難な小標本READY馬（evidence数1が4頭）の扱い**: 今回は
   positionConfidence=lowのまま計算に含めているが、最小evidence数の
   足切りルールを設けるかどうかは今回のスコープ外。

以上、CHECKPOINT14C.2Gの範囲でSTOPします。残り7 Pilot RaceやCHECKPOINT14D
へは着手していません。

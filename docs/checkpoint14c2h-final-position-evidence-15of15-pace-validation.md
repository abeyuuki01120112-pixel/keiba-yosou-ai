# CHECKPOINT 14C.2H — Remaining 2 Runner Enrichment Conflict Resolution / 15-of-15 Final Pace Validation

対象: `JRA-20260516-NIIGATA-11`（新潟大賞典）。CP14C.2Gでconflictによりskipされた
ドゥラドーレス（2019105556）・サフィラ（2021105541）の残り10行を、
`fieldSize`/`passingPosition`のみに限定したPosition Enrichment専用の安全な
非破壊補完で解消し、15頭中15頭のHistorical Position Evidenceを完成させた記録。

## 1. 10行 Existing vs Incoming Audit

`buildImportResult()`（既存の正式normalizeロジック、無変更）でCSVを再パースし、
horseId+raceIdで既存recordと突合。全フィールドを比較した結果:

| 分類 | フィールド | 結果 |
|---|---|---|
| CORE | raceDate/racecourse/surface/distance/going/raceNumber/finishPosition/timeGap/raceTime/final3F/carriedWeight | **10行すべてMATCH**（数値・文字列とも完全一致） |
| CORE | raceName | **10行すべてDIFFER**（既存=短縮名、例:"金鯱賞" / incoming=グレード付き正式名、例:"東海テレビ杯金鯱賞(GII)"） |
| CORE(legacy) | gate/horseNumber/source/sourceRaceId/sourceHorseId/dataKind | 既存側=undefined（フィールド自体が無い） / incoming=実値あり |
| ENRICHMENT | fieldSize/passingPosition | 既存側=undefined / incoming=実値あり（今回の取り込み対象） |

## 2. Conflictの分離

### A. Real Core Conflict（両側に実値があり値が異なるもの）

**finishPosition/carriedWeight/actualRaceTimeSeconds/final3FSeconds/timeGapSeconds/
raceDate/racecourse/surface/distance/going/raceNumberは10行中0件が食い違い。**
つまりレース結果そのものを表す実質的なcore dataには一切矛盾が無い。

`raceName`のみ、両側に実値がありながら内容が異なる（短縮名 vs グレード付き正式名）。
これは「別のレースを指している」矛盾ではなく、同一レースの表記の詳しさの違いである
ため、値の対立ではあるが、レース結果データの信頼性に関わる対立ではない。
今回はこのフィールドを一切書き換えないことで対応した（3節参照）。

### B. Legacy Missing Metadata

`gate`/`horseNumber`/`source`/`sourceRaceId`/`sourceHorseId`/`dataKind`は、
既存側がそもそもこれらのフィールド自体を持たない旧式フォーマットであることに
起因する。今回はこれらを一切書き込まない方針とした（4節参照）。

## 3〜4. Enrichment-only処理（既存の安全設計を再利用）

新しいImporterは作らず、既存の`mergeHorseHistory.ts`の`mergeHorseRaceHistory()`
（ENRICHMENT_FIELDS=`fieldSize`/`passingPosition`のみを対象とする、CHECKPOINT14A.2で
確定済みの安全機構、無変更）をそのまま再利用した。

具体的な絞り込み: 各10行について、`mergeHorseRaceHistory()`へ渡す「incoming」record
を「既存recordの完全な複製 + fieldSize/passingPositionだけをCSV由来の値へ差し替え」
として構築した。これにより：

- raceName/gate/horseNumber/source/sourceRaceId/sourceHorseId/dataKind等の
  core fieldは、比較対象としても書き込み対象としても一切登場しない
  （既存値のまま完全一致するため`diffCoreFields`は差分ゼロと判定する）。
- 一般的な「undefinedなら何でもincomingを許可」という緩和ルールは導入していない
  （`mergeHorseHistory.ts`自体は無変更。ENRICHMENT_FIELDSの定義もCASE A〜D判定
  ロジックも一切変更していない）。今回変更したのは「どのデータをincomingとして
  渡すか」という、この一回限りのオーケストレーション側のみ。

## 5. Production Importerへの影響

`scripts/importRacePerformancesCsv.ts`・`src/ability/import/mergeHorseHistory.ts`
は本ラウンドで一切変更していない（`git diff`で確認済み）。conflict判定ロジック・
ENRICHMENT_FIELDSの範囲・per-horse-fileブロック挙動は今後も従来通り動作する。

## 6. Dry Run

```
rows: 10
matchedExistingRows: 10
enrichmentCandidates: 10
fieldSizeCandidates: 10
passingPositionCandidates: 10
realCoreConflicts: 0
blocked: false
```

理想値（`realCoreConflicts=0, enrichmentCandidates=10`）が実データでそのまま
成立した。

## 7. Enrichment実行

Dry Runと同じ結果で実書き込みを実施。`git diff`で確認した変更内容:

- `2019105556.json`（ドゥラドーレス）: 5行に`fieldSize`/`passingPosition`/
  `importedAt`を追加。
- `2021105541.json`（サフィラ）: 5行に`fieldSize`/`passingPosition`/
  `importedAt`を追加。
- `raceName`/`gate`/`horseNumber`/`source`/`sourceRaceId`/`sourceHorseId`/
  `dataKind`/`finishPosition`等、他のいかなるフィールドも変更無し
  （`57.0`→`57`、`0.0`→`0`という表示上の差分のみ存在するが、これはJS上
  同一の数値をJSON.stringifyで再出力した際の表記正規化であり、値そのものの
  変更ではない）。
- 変更ファイルは想定通りこの2ファイルのみ。

## 8. Cold Reload

新しい`vite-node`プロセスで確認:

```
2019105556: total races=6, with passingPosition=5, with fieldSize=5
2021105541: total races=6, with passingPosition=5, with fieldSize=5
```

10/10 がディスク上に永続化されていることを確認。

## 9. ドゥラドーレス Position Profile（再生成後）

```
positionEvidenceCount: 5
earlyNormalizedPositionMean: 0.692
positionStdDev: 0.153
runningStyleDistribution: { nige: 0, senko: 0, sashi: 80, oikomi: 20 }
positionConfidence: high
historicalPositionStatus: READY
```

## 10. サフィラ Position Profile（再生成後）

```
positionEvidenceCount: 5
earlyNormalizedPositionMean: 0.376
positionStdDev: 0.185
runningStyleDistribution: { nige: 0, senko: 40, sashi: 60, oikomi: 0 }
positionConfidence: high
historicalPositionStatus: READY
```

いずれも無理にREADYへ合わせたのではなく、5走分の実passingPositionデータが
揃った結果として自然にREADY（positionEvidenceCount>0）へ到達した。

## 11. 新潟大賞典15頭 Evidence Coverage（最終）

| 着順 | 馬名 | horseId | evidence数 | status |
|---|---|---|---|---|
| 1 | グランディア | 2019105302 | 1 | READY |
| 2 | バレエマスター | 2019104850 | 3 | READY |
| 3 | フクノブルーレイク | 2022101329 | 5 | READY |
| 4 | ドゥラドーレス | 2019105556 | 5 | READY |
| 5 | ヤマニンブークリエ | 2022106611 | 5 | READY |
| 6 | トーセンリョウ | 2019104711 | 5 | READY |
| 7 | セキトバイースト | 2021103975 | 2 | READY |
| 8 | ホールネス | 2020110060 | 5 | READY |
| 9 | グランドカリナン | 2020106234 | 2 | READY |
| 10 | アンゴラブラック | 2021105738 | 1 | READY |
| 11 | シュトルーヴェ | 2019104447 | 4 | READY |
| 12 | ラインベック | 2017105194 | 1 | READY |
| 13 | サフィラ | 2021105541 | 5 | READY |
| 14 | シンハナーダ | 2021105574 | 1 | READY |
| 15 | シュガークン | 2021102224 | 5 | READY |

- **runners with evidence**: 15
- **runners without evidence**: 0
- **READY**: 15 / **PARTIAL**: 0 / **NO_EVIDENCE**: 0 / **UNRESOLVED**: 0

**15/15が実際に成立した。** 無理に合わせたのではなく、実データの取り込みのみで
到達した結果である。

## 12. Historical Pace Prediction（完全再実行、frozen formula）

```
continuousPacePressure: 4.1
frontPressure: 1.3
expectedPaceClass: average
paceConfidence: medium
frontRunnerCandidateCount: 2
likelyFrontGroup: セキトバイースト・シュガークン・ヤマニンブークリエ・
                  グランドカリナン・フクノブルーレイク・ホールネス・サフィラ
warnings: []（evidence不足によるwarningは今回0件）
```

式・weight・threshold は一切変更していない（`positionProfile.ts`・
`racePacePrediction.ts`・`racePaceValidationExecution.ts`は本ラウンド無変更、
`git diff`で確認済み）。

## 13. 4段階比較

| 段階 | Evidence | Pressure | FrontPressure | Class | Confidence |
|---|---|---|---|---|---|
| Initial（CP14C.2C） | 1/15 | 0 | 0 | SLOW | LOW |
| Phase1（CP14C.2E） | 8/15 | 1.5 | 0.5 | AVERAGE | MEDIUM |
| SECOND（CP14C.2G） | 13/15 | 3.7 | 1.3 | AVERAGE | MEDIUM |
| **FINAL 15/15（CP14C.2H・今回）** | **15/15** | **4.1** | **1.3** | **AVERAGE** | **MEDIUM** |

**Actual Pace: HIGH**（`continuousActualPace=0.27`、`raceLapData.json`無変更、
LOOで再確認・CP14C.2Cと完全一致）

## 14. Prediction vs Actual

Evidence 15/15が達成された最終状態でも、**Prediction=AVERAGE / Actual=HIGH で
不一致（classHit=false）のまま**。continuousPacePressureはEvidence充実に伴い
0→1.5→3.7→4.1と単調に上昇したが、frontPressureは13/15の時点（1.3）から
15/15（1.3）へ横ばいで、expectedPaceClass=high境界（frontPressure>=2）には
届いていない。

15/15達成という条件のもとで、この新潟大賞典については**正式にPace Prediction
V1のMiss**として記録する。「Pace Engine全体が悪い」とは結論しない。1レースの
Missとして保存する（21節参照）。

## 15. Miss Diagnosis（A〜G）

- **A. Front Pressure集約**: `frontPressure`はnigeProbabilityのみの合計であり、
  senko側の寄与を一切含まない設計（frozen）。15頭合計の`nigeProbability`総和は
  1.3（frontPressureと一致）。
- **B. 先行確率の扱い（senko probabilityの相互作用）**: 16節で数値診断。
- **C. 逃げ馬不在時の集団先行**: `frontRunnerCandidateCount=2`（グランドカリナン・
  シュガークン、representativeRunningStyle=nigeの馬）のみが「候補」だが、
  senko比率の高い馬が複数（7頭中5頭）存在し、集団としての先行意識の高さが
  `frontPressure`に反映されにくい構造が確認された。
- **D. Race Shape（馬群全体の圧力・位置関係）**: V1では一切モデル化されていない。
  17節で候補として提示。
- **E. Position variance**: 15頭中7頭がpositionConfidence=high（evidence数4〜5）、
  4頭がlow（evidence数1）。低evidence馬の分布（例: グランディア100%sashi、
  シンハナーダ100%sashi）はサンプル数1件由来であり、実際の脚質傾向を過小/過大に
  見積もっている可能性は残るが、frontPressure不足の主因ではない
  （evidence数の多い高confidence馬にも同じsenko非計上構造が存在するため）。
- **F. Actual Pace baseline（LOO）**: `raceLapData.json`はSOURCE_MANIFEST.csvと
  独立照合済み・無変更。疑わしい点は無い。
- **G. その他**: 無し。

## 16. senko / collective pressure診断（数値付き）

CP14C.2Gで提起した仮説（「senko確率の高い馬が複数いても、frontPressureへ
十分反映されない構造」）を、15/15の実データで検証した。

**15頭の`contributionToPacePressure`内訳（frozen formulaの実行結果そのまま）**:

| 馬名 | nigeProbability | senko(%) | frontPressureへの寄与 | continuousPacePressureへの寄与 | 差分（frontPressureに反映されないsenko分） |
|---|---|---|---|---|---|
| フクノブルーレイク | 0.2 | 20 | 0.2 | 0.4 | 0.2 |
| ヤマニンブークリエ | 0.2 | 40 | 0.2 | 0.6 | 0.4 |
| セキトバイースト | 0 | 100 | 0 | 1.0 | **1.0** |
| ホールネス | 0 | 40 | 0 | 0.4 | **0.4** |
| グランドカリナン | 0.5 | 0 | 0.5 | 0.5 | 0 |
| サフィラ | 0 | 40 | 0 | 0.4 | **0.4** |
| シュガークン | 0.4 | 40 | 0.4 | 0.8 | 0.4 |
| （他8頭、nige=senko=0） | 0 | 0 | 0 | 0 | 0 |

**該当頭数**: senko確率>0の馬は7頭。うち3頭（セキトバイースト・ホールネス・
サフィラ）はnigeProbability=0のため、senko分がfrontPressureへ**一切**
反映されない（合計1.8ポイント）。残り4頭（フクノブルーレイク・
ヤマニンブークリエ・シュガークン、+nige50%のグランドカリナンはsenko0%なので
該当なし）はnige分のみfrontPressureへ計上され、senko分（合計1.0ポイント）は
継続的に除外される。

**総計**: `continuousPacePressure`合計4.1のうち、senko由来の寄与は
2.8（68%）。この2.8のうち`frontPressure`へ反映されるのは0（senkoは
frontPressureの定義上一切含まれないため）。`frontPressure`はnige由来の
1.3のみで構成される。

**確認結果**: 「senko確率の高い馬が複数いても、frontPressureへ十分反映
されない構造」は**実データ上でも存在することを確認した**。特に
セキトバイースト（senko100%、evidence数2でconfidence=medium）・
ホールネス（senko40%、evidence数5・confidence=high）・サフィラ
（senko40%、evidence数5・confidence=high、CP14C.2Hで新規READY化）の
3頭は、`frontPressure`の計算上「先行意識ゼロ」と同じ扱いになっている。
これはデータ不足由来ではなく、`frontPressure`の定義（nigeProbabilityのみの
合計）そのものに起因する。**修正はまだ行わない**（21節）。

## 17. Race Shape候補

今回のデータからは、「単独の絶対的逃げ馬はいない（frontRunnerCandidateCount=2、
うち明確な単騎逃げ候補は無し）が、senko比率の高い馬（7頭中3頭がsenko比率
40%以上かつnige0%）が複数存在し、結果としてActual Pace=highになった」という
構造が確認できる。これは16節の診断と整合的であり、Race Shape / collective
pressure（個々の馬のnige/senko確率だけでなく、フィールド全体でどれだけの馬が
「前に行きたがる」傾向を持つかという集団的要因）を、**次CHECKPOINTの検討候補**
として提示する。今回は実装しない。

## 18. 新潟記念CURRENT TARGETとの分離

今回変更した2ファイル（2019105556.json・2021105541.json）は、2026新潟記念
11頭（アーバンシック・サヴォーナ・ジュンブロッサム・ステレンボッシュ・
ゾロアストロ・ダノンシーマ・チェルヴィニア・ドゥレッツァ・バレエマスター・
ボーンディスウェイ・ロデオドライブ）のいずれとも重複しない。新潟記念の
Stage A Prediction（`continuousPacePressure=2.75`、`frontPressure=0.65`、
`expectedPaceClass=average`、`paceConfidence=high`）・能力値は、本ラウンドの
Historical Validation結果を見て一切変更していない。

## 19. Base Ability等の完全不変確認

`git diff --stat`（最終）は2つのhorse dataファイルのみ:

```
src/ability/data/horses/2019105556.json | 35 +++++++++++++++++++++++++++++++++--
src/ability/data/horses/2021105541.json | 32 ++++++++++++++++++++++++++++++--
2 files changed
```

Base Ability V1・Suitability V1・MemberLevel・Effective Ability・
Formal Snapshot・`raceLapData.json`・`positionProfile.ts`・
`racePacePrediction.ts`・`racePaceValidationExecution.ts`・
`mergeHorseHistory.ts`・`importRacePerformancesCsv.ts`は無変更。

Frozen Benchmark = **70.3**（`abilityModelV1.frozenBenchmark.test.ts` 3 passed で再確認）。

## 20. Score表示仕様について

今回、Pace計算・内部表現への変更は行っていない（指示通り）。ユーザー向け
表示を整数化する方針変更は、UI実装が絡む別スコープであり、本ラウンドの
Position Enrichment/Pace Validationの範囲外のため着手していない。

## 21. Regression

```
npm run validate:data   → 検証成功（エラーなし。既存の警告のみ、新規warning無し）
npm test                → Test Files 74 passed / Tests 775 passed
npm run lint            → エラー無し
npm run build            → 成功
Frozen Benchmark         → 70.3（3 tests passed）
```

Base Ability V1・Suitability V1・raceLapData.json・新潟記念11頭データは
無変更（19節）。

## 22. 判定

**A-VALIDATION**

10行のEnrichmentが安全に成功し（realCoreConflicts=0、既存の安全設計
`mergeHorseRaceHistory()`をそのまま再利用、production importerの一般ルールは
一切緩和せず）、新潟大賞典15頭のHistorical Position Evidenceが15/15で
完成した。この状態でHistorical Pace Prediction V1を正式に評価可能となった。

PredictionはActualと一致しなかった（AVERAGE vs HIGH）が、CHECKPOINT指示の
通り「PredictionがActualと一致しなくてもA-VALIDATION可」であるため、
Evidence完成・非破壊Enrichment成功・正式評価成立という観点でA-VALIDATIONと
判定する。Prediction Missそのものは14〜17節の通りB-MODEL候補として別途
記録している（次CHECKPOINTでの検討対象）。

## 23. 次にChatGPTと決める必要がある項目（優先順位順）

1. **frontPressure集計のsenko除外構造（16節で数値確認済み）を次CHECKPOINTの
   モデル改善検討に進めるか**: 今回は診断のみ、実装は一切していない。
   進める場合、新CHECKPOINTを明示的に立ち上げる必要がある。
2. **Race Shape / collective pressure（17節）の設計要否**: 単独逃げ馬不在
   でも複数senko馬の集団的先行意識がActual Pace=highに寄与した可能性がある
   構造が見えている。次フェーズの新規要因として検討するかどうか。
3. **残り7 Pilot Raceへの拡張、またはCHECKPOINT14Dへの着手可否**: 本ラウンド
   では未着手（指示通り）。
4. **Score表示の整数化方針（20節）**: 内部計算はfull precision維持、
   ユーザー表示のみ整数化という分離方針自体は確認したが、UI実装は別途
   明示的な指示が必要。

以上、CHECKPOINT14C.2Hの範囲でSTOPします。残り7 Pilot Race・新潟記念Stage A・
CHECKPOINT14Dへは着手していません。

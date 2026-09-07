# CHECKPOINT14C.2E — Phase 1 Position Evidence Import / Runner Identity Re-audit

`niigata_daishoten_phase1_position_identity_v1.zip`（Phase 1 Position Evidence 12行 +
新潟大賞典Runner Identity解決）を検証・Importし、新潟大賞典のHistorical Position
Profile coverageを再監査した。**Pace Engine formula
（`racePacePrediction.ts`・`positionProfile.ts`）は一切変更していない**（`git diff`で
無変更を確認済み、変更ファイルは`src/ability/data/horses/`の7ファイルのみ）。

## 1. ZIP Integrity

`race_performances.csv`（12行）・`runner_identity_resolution.csv`（15頭）・
`SOURCE_MANIFEST.csv`（12件の独立検算URL）を独立確認した。

- **Phase 1 12行の内訳**: ラインベック1・シュトルーヴェ4・グランディア1・
  グランドカリナン2・セキトバイースト2・シンハナーダ1・アンゴラブラック1
  = 計12行、ChatGPT申告と完全一致。
- **Runner Identity 15/15**: `runner_identity_resolution.csv`に新潟大賞典15頭全馬の
  finishPosition/frame/horseNumber/horseName/horseIdが記載されており、そのうち
  ドゥラドーレス(2019105556)・サフィラ(2021105541)が
  `identityStatusBefore=UNRESOLVED_IN_MANIFEST → identityStatusAfter=
  RESOLVED_FROM_JRA_OFFICIAL`と明記されていた。

## 2. Dry Run

既存の`npm run import:csv -- <csv> --dry-run`（CHECKPOINT14A.2の
enrichment merge経路、無変更）で実行:

```
rows parsed: 12
new race records: 0
exact duplicates: 0
enrichment candidates: 12
enriched fields（延べ）: 24（fieldSize + passingPosition × 12件）
conflicts: 0
errors: 0
```

**Header Compatibility**: CSVヘッダーは`raceId, raceDate, racecourse, raceNumber,
raceName, surface, distance, going, horseId, horseName, horseNumber, gate,
finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds,
timeGapSeconds, fieldSize, passingPosition, source, sourceRaceId,
sourceHorseId`で、CHECKPOINT14C.2Dで提示した正式column名と完全一致。旧alias
（`timeGap`/`raceTime`/`final3F`/`carriedWeight`）は使われていないことを確認した。

**Core Field Safety**: 12行全てが「既存recordのoptional field（fieldSize・
passingPosition）をnull→populatedへ補完」する enrichment候補として認識され、
`conflicts: 0`。raceId/raceDate/racecourse/surface/distance/going/horseId/
finishPosition/actualRaceTimeSeconds/final3FSeconds/timeGapSeconds/
carriedWeightKgの既存値との不一致は0件だった。**重大conflictが無いためImportを実施**
（1件でもあればSTOPする設計だが、今回は該当なし）。

## 3. Position Enrichment Import

Dry Runがクリーンだったため、`npm run import:csv`（`--dry-run`無し）で正式Importを
実施。`git diff`で7ファイルの変更を確認:

| horseId | 変更内容 |
|---|---|
| 2017105194 | 1走: fieldSize null→15、passingPosition追加（cornerPositions [6,6,6,6]） |
| 2019104447 | 4走: fieldSize null→各値、passingPosition追加 |
| 2019105302 | 1走: fieldSize null→16、passingPosition追加 |
| 2020106234 | 2走: fieldSize null→各値、passingPosition追加 |
| 2021103975 | 2走: fieldSize null→各値、passingPosition追加 |
| 2021105574 | 1走: fieldSize null→10、passingPosition追加 |
| 2021105738 | 1走: fieldSize null→16、passingPosition追加 |

各diffで、`-`（削除）行はfieldSize（null→値）とimportedAtのみ、`+`（追加）行は
fieldSize値・importedAt更新・passingPosition新規追加のみであり、
raceId/raceDate/racecourse/surface/distance/going/horseNumber/gate/
finishPosition/carriedWeight/raceTime/final3F/timeGap/source/sourceRaceId/
sourceHorseId/dataKindのいずれも変更されていないことを確認した（silent
overwrite無し）。

## 4. Cold Reload

Import後、別プロセス（新規`vite-node`起動）から`getHorseRecentRaces()`で
ディスクを直接再読込し、**12/12件全てで`fieldSize`・`passingPosition`が
populatedであることを確認**した（in-memory stateへの依存なし）。

## 5. Runner Identity Resolution

`runner_identity_resolution.csv`の15頭全馬について、horseIdでrepository内の
`data/horses/<horseId>.json`ファイル存在を独立確認した。**15/15件全てファイルが
存在し、ID-firstでresolve可能であることを確認した**（馬名だけのfuzzy matchでの
確認は行っていない）。

特にドゥラドーレス(2019105556)・サフィラ(2021105541)は、既にrepository内に
horseId単位のファイルが存在していた（それぞれ6走分の既存データ、いずれも
新潟大賞典自身のraceIdは含まれず、passingPosition/fieldSizeは0件）。この2頭は
Phase 1 CSVには含まれておらず（今回Enrichmentされていない）、
identity resolutionのみが今回の対応範囲。

## 6. 新潟大賞典15頭Roster（Import後）

| finishPosition | frame | horseNumber | horseName | horseId | resolverStatus |
|---|---|---|---|---|---|
| 1 | 2 | 3 | グランディア | 2019105302 | RESOLVED |
| 2 | 6 | 11 | バレエマスター | 2019104850 | RESOLVED |
| 3 | 5 | 9 | フクノブルーレイク | 2022101329 | RESOLVED |
| 4 | 4 | 6 | ドゥラドーレス | 2019105556 | RESOLVED |
| 5 | 5 | 8 | ヤマニンブークリエ | 2022106611 | RESOLVED |
| 6 | 4 | 7 | トーセンリョウ | 2019104711 | RESOLVED |
| 7 | 7 | 12 | セキトバイースト | 2021103975 | RESOLVED |
| 8 | 1 | 1 | ホールネス | 2020110060 | RESOLVED |
| 9 | 3 | 5 | グランドカリナン | 2020106234 | RESOLVED |
| 10 | 3 | 4 | アンゴラブラック | 2021105738 | RESOLVED |
| 11 | 7 | 13 | シュトルーヴェ | 2019104447 | RESOLVED |
| 12 | 2 | 2 | ラインベック | 2017105194 | RESOLVED |
| 13 | 6 | 10 | サフィラ | 2021105541 | RESOLVED |
| 14 | 8 | 14 | シンハナーダ | 2021105574 | RESOLVED |
| 15 | 8 | 15 | シュガークン | 2021102224 | RESOLVED |

**resolved = 15/15。無理に合わせたのではなく、実際にrepository内で全馬の
horseIdファイル存在を確認できた結果。**

## 7. Historical Position Status Before / After

各馬のtargetRaceDate（2026-05-16）より前のpassingPosition実績件数
（`positionEvidenceCount`）:

| horseName | horseId | positionEvidenceCount | passingPositionCount | fieldSizeCount | historicalPositionStatus |
|---|---|---|---|---|---|
| グランディア | 2019105302 | 1 | 1 | 1 | READY |
| バレエマスター | 2019104850 | 3 | 3 | 3 | READY |
| フクノブルーレイク | 2022101329 | 0 | 0 | 0 | NO_EVIDENCE |
| ドゥラドーレス | 2019105556 | 0 | 0 | 0 | **PARTIAL**（既存6走あるがpassingPosition無し） |
| ヤマニンブークリエ | 2022106611 | 0 | 0 | 0 | NO_EVIDENCE |
| トーセンリョウ | 2019104711 | 0 | 0 | 0 | NO_EVIDENCE |
| セキトバイースト | 2021103975 | 2 | 2 | 2 | READY |
| ホールネス | 2020110060 | 0 | 0 | 0 | NO_EVIDENCE |
| グランドカリナン | 2020106234 | 2 | 2 | 2 | READY |
| アンゴラブラック | 2021105738 | 1 | 1 | 1 | READY |
| シュトルーヴェ | 2019104447 | 4 | 4 | 4 | READY |
| ラインベック | 2017105194 | 1 | 1 | 1 | READY |
| サフィラ | 2021105541 | 0 | 0 | 0 | **PARTIAL**（既存6走あるがpassingPosition無し） |
| シンハナーダ | 2021105574 | 1 | 1 | 1 | READY |
| シュガークン | 2021102224 | 0 | 0 | 0 | NO_EVIDENCE |

final3Fプロキシによる代替推定は一切行っていない（NO_EVIDENCE/PARTIALの馬を
READY扱いに水増ししていない）。

**Before（CHECKPOINT14C.2D時点、13頭中）**: READY=1・PARTIAL=7・NO_EVIDENCE=4・
UNRESOLVED=2。
**After（本ラウンド、15頭中）**: **READY=8・PARTIAL=2・NO_EVIDENCE=5・
UNRESOLVED=0。**

Phase 1対象だった7頭（PARTIAL）は**7/7がREADY化**した。新規解決された2頭
（ドゥラドーレス・サフィラ）はPARTIALとして新たにカウントされた
（identity resolutionのみで、passingPosition enrichmentはまだ受けていないため）。

## 8. Position Evidence Coverage

| 指標 | Before | After |
|---|---|---|
| 既知runner数 | 13/15（87%） | **15/15（100%）** |
| READY runner数 | 1/13（8%） | **8/15（53%）** |
| evidence無し（PARTIAL+NO_EVIDENCE+UNRESOLVED）合計 | 12/13（92%） | 7/15（47%） |

## 9. Historical Pace Prediction再実行可否

Coverageが大幅に改善したため（READY 1→8）、既存`generateHistoricalRacePacePrediction()`
（無変更）で**診断目的として**再実行した。Formula変更は行っていない。

```
runnerCount: 15
continuousPacePressure: 1.5   （Before: 0）
frontPressure: 0.5            （Before: 0）
expectedPaceClass: average    （Before: slow）
paceConfidence: medium        （Before: low）
frontRunnerCandidateCount: 1
likelyFrontGroup: [セキトバイースト, グランドカリナン]
```

寄与内訳（一部抜粋）: セキトバイースト(senko100%, contribution=1)・
グランドカリナン(nige50%/sashi50%, contribution=0.5)・その他READY馬は
sashi/oikomi中心のためcontribution=0。7頭（NO_EVIDENCE 5 + PARTIAL 2）は
evidence無しのため寄与0（推測していない）。

**Actual側**（CHECKPOINT14C.2Cから無変更）: `first600m=35.9秒・first1000m=60.4秒・
continuousActualPace=0.27・actualPaceClass=high`。

**predicted=average vs actual=high → classHit=false（依然として不一致）。**
ただし3段階中1段差（slow→averageの2段差だった前回より近づいた）。

**この再実行結果を正式なPrediction評価（Pilot Metricsのaccuracy集計対象）とは
扱わない。** 理由: evidence coverage（READY 53%）はCHECKPOINT14C.2Dの時点で
提案した未確定候補基準（`knownRunnerCoverage>=0.8 かつ evidenceCoverage>=0.5`）を
辛うじて満たすが、この基準自体がChatGPT未承認のB-SPEC候補であることに加え、
NO_EVIDENCE 5頭（33%）が依然としてrunner setから実質的に欠落した状態でのpredictionを
「正式評価」として扱うのは尚早と判断した。diagnostic参考値として報告する。

## 10. Remaining Missing Evidence

**PARTIAL 2頭（identity解決済み、raceId既知、passingPositionのみ不足。
Phase 1と同じ低コスト・高leverageのenrichmentで対応可能）:**

RECENT_RACE_COUNT=5のため、各馬の直近5走（既に判明済みのraceId）のみが
Historical Position Profileへ影響する。6走目（最も古い1走）は評価対象外のため、
enrichment不要（要求しない）。

| horseId | horseName | 要求対象raceId（直近5走） | raceDate |
|---|---|---|---|
| 2019105556 | ドゥラドーレス | JRA-20260315-CHUKYO-11 | 2026-03-15 |
| 2019105556 | ドゥラドーレス | JRA-20260125-NAKAYAMA-11 | 2026-01-25 |
| 2019105556 | ドゥラドーレス | JRA-20250921-NAKAYAMA-11 | 2025-09-21 |
| 2019105556 | ドゥラドーレス | JRA-20250713-FUKUSHIMA-11 | 2025-07-13 |
| 2019105556 | ドゥラドーレス | JRA-20250510-TOKYO-11 | 2025-05-10 |
| 2021105541 | サフィラ | JRA-20260315-CHUKYO-11 | 2026-03-15 |
| 2021105541 | サフィラ | JRA-20260215-KYOTO-11 | 2026-02-15 |
| 2021105541 | サフィラ | JRA-20251116-KYOTO-11 | 2025-11-16 |
| 2021105541 | サフィラ | JRA-20251012-TOKYO-11 | 2025-10-12 |
| 2021105541 | サフィラ | JRA-20250518-TOKYO-11 | 2025-05-18 |

（各馬とも6走目: ドゥラドーレスJRA-20250209-KOKURA-11、サフィラ
JRA-20250412-HANSHIN-11はRECENT_RACE_COUNT=5の範囲外のため要求しない。）

**NO_EVIDENCE 5頭（identity解決済みだが、targetRace以前の実績が0件。新規raceId
特定が必要）:**

| horseId | horseName | knownCareerRaceCount | requiredPriorRaceCount |
|---|---|---|---|
| 2022101329 | フクノブルーレイク | 0 | UNKNOWN（0〜5走、実際のキャリアに依存） |
| 2022106611 | ヤマニンブークリエ | 0 | UNKNOWN（0〜5走） |
| 2019104711 | トーセンリョウ | 0 | UNKNOWN（0〜5走） |
| 2020110060 | ホールネス | 0 | UNKNOWN（0〜5走） |
| 2021102224 | シュガークン | 0 | UNKNOWN（0〜5走） |

具体的raceIdはrepository上で特定不能なため推測していない（UNKNOWNのまま）。

## 11. Phase 3 Data Request要否

**要（部分的）。** 10節の通り、2種類の追加要求が残っている:

1. **低コスト・高優先**: ドゥラドーレス・サフィラの直近5走分
   （raceId既知、計10行、Phase 1と同じenrichment方式）。
2. **中〜高コスト**: NO_EVIDENCE 5頭の新規過去走（raceId不明、最大25行の
   未知数、外部特定が必要）。

**外部データ取得は今回行っていない**（禁止事項の通り）。

## 12. Regression

- `git status`: 変更ファイルは`src/ability/data/horses/`の7ファイルのみ
  （2017105194・2019104447・2019105302・2020106234・2021103975・2021105574・
  2021105738）。
- **Pace Engine（`racePacePrediction.ts`・`racePacePredictionTypes.ts`）・
  Historical Position Profile（`positionProfile.ts`・`positionProfileTypes.ts`）・
  Base Ability（`baseAbility.ts`）・Suitability V1（`suitabilityV1.ts`）・
  raceLapData.json**: `git diff --stat`で差分無しを確認。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- `npm test`: **775 / 775 pass**（新規テスト追加なし、既存実装をそのまま実データで
  実行したため）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。

## 13. 判定

**B-DATA**。

Runner Identityは15/15（100%）解決し、B-IDENTITYの懸念は解消した。Phase 1の
Position Evidence Import（12行）も、Dry Run・Import・Cold Reloadの全工程で
問題無く完了し、7頭全馬がREADY化した（8節）。しかし、**新潟大賞典15頭のうち
7頭（47%）が依然としてPosition Evidence無し**（PARTIAL 2頭・NO_EVIDENCE 5頭）
であり、Historical Predictionの診断的再実行結果（predicted=average）は
Actual（high）と依然として不一致だった。

無理にA-EVIDENCEとは判定しない。Coverageは大きく改善した（READY 1→8）が、
NO_EVIDENCE 5頭が実質的にrunner setから欠落した状態でのPredictionを正式評価
として扱うのは時期尚早であり、Phase 3（10〜11節の追加Evidence）が必要という
判断が実態を最も正確に表す。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **ドゥラドーレス・サフィラの直近5走分passingPosition提供**（10節の10行）:
   Phase 1と同じ低コストのenrichmentで対応可能。次のZIPで最優先候補として推奨。
2. **NO_EVIDENCE 5頭の新規過去走特定**: raceId不明のため外部調査が必要。
   優先順位を2番目とするか、そもそも今回のPilot 1レースの完成度向上に
   コストをかけるべきか。
3. **evidence coverage閾値（B-SPEC候補、CHECKPOINT14C.2Dで提示済み）の正式決定**:
   `knownRunnerCoverage>=0.8 かつ evidenceCoverage>=0.5`を正式採用するか。
   採用する場合、現状（15/15・53%）は基準をぎりぎり満たすため、Phase 3完了を
   待たずに「正式評価」へ格上げしてよいか。
4. **残り7 Pilot Race・94 runnersへの着手タイミング**（Phase 4、今回は触れていない）。

以上、CHECKPOINT14C.2E完了。Phase 3取得・残り7レース・CHECKPOINT14Dへは進まず、
ここでSTOPする。

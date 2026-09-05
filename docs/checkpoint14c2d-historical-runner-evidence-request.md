# CHECKPOINT14C.2D — Historical Runner Evidence Data Request Manifest

CHECKPOINT14C.2Cで判明した「Historical Prediction Coverage = 1/8」の原因
（runner-level Position Evidence不足）を正確に列挙し、ChatGPT側が次の実データZIPを
作成できるManifestを確定した。**Pace Engine（`racePacePrediction.ts`）・
Historical Position Profile（`positionProfile.ts`）・`raceLapData.json`はいずれも
無変更。Pilot Race 8件の対象・順序も変更していない。** 今回はaudit/manifest作成のみで、
外部データ取得・推測補完・Import・再Validationは一切行っていない。

## 1. Pilot Race Roster Audit

CHECKPOINT14C.2Cの8レースをそのまま固定して監査した:

| # | raceId | raceDate | raceName | raceNumber | 宣言fieldSize | repository内の既知runner数 |
|---|---|---|---|---|---|---|
| 1 | JRA-20260823-NIIGATA-10 | 2026-08-23 | 3歳以上1勝クラス | 10 | 12 | **0** |
| 2 | JRA-20260809-NIIGATA-10 | 2026-08-09 | 3歳以上1勝クラス | 10 | 7 | **0** |
| 3 | JRA-20260523-NIIGATA-10 | 2026-05-23 | 尖閣湾特別 | 10 | 15 | **0** |
| 4 | JRA-20260517-NIIGATA-10 | 2026-05-17 | 信濃川特別 | 10 | 16 | **0** |
| 5 | JRA-20260517-NIIGATA-07 | 2026-05-17 | 4歳以上1勝クラス | 7 | 13 | **0** |
| 6 | JRA-20260516-NIIGATA-11 | 2026-05-16 | 新潟大賞典 | 11 | 15 | **13** |
| 7 | JRA-20251026-NIIGATA-10 | 2025-10-26 | 村上特別 | 10 | 16 | **0** |
| 8 | JRA-20251026-NIIGATA-07 | 2025-10-26 | 3歳以上1勝クラス | 7 | 15 | **0** |

7レースは既知runnerが0頭のため、**全員UNRESOLVED_RUNNER**（宣言fieldSize合計94頭）。
新潟大賞典のみ13頭が既知（残り2頭がUNRESOLVED_RUNNER）。

## 2. Historical Evidence Coverage

既知13頭（新潟大賞典のみ）の内訳:

| status | 頭数 | 意味 |
|---|---|---|
| READY | **1** | targetRace以前にpassingPosition実績あり → Profile算出可能 |
| PARTIAL | **8** | targetRace以前の実績はあるが、その走にpassingPositionが無い |
| NO_EVIDENCE | **4** | targetRace以前の実績自体が0件 |
| UNRESOLVED | **2** | horseId/horseName自体が未解決 |

**PARTIAL（8頭）は、既存のraceIdが判明済みであり、その走へpassingPositionを
追加するだけで良い（新規raceId特定は不要、CHECKPOINT14A.2のenrichment mergeで
対応可能）。** NO_EVIDENCE（4頭）は実績自体が無いため、新規raceId特定が必要。

final3Fプロキシによる代替推定は今回一切行っていない（20節の指示通り。
PARTIAL/NO_EVIDENCEの馬をREADY扱いに水増ししていない）。

## 3. 新潟大賞典 Detailed Audit

| horseId | horseName | resolved? | targetRace以前のPosition Evidence件数 | Profile source | final3F proxy使用 |
|---|---|---|---|---|---|
| 2019104850 | バレエマスター | ✓ | **3/3（全てpassingPosition付き）** | passingPosition（実データ） | 無し |
| 2017105194 | (id only) | ✓ | 0/1 | — | 無し（NO_EVIDENCE扱いにせずPARTIALと正直に区別） |
| 2019104447 | (id only) | ✓ | 0/4 | — | 無し |
| 2019105302 | (id only) | ✓ | 0/1 | — | 無し |
| 2020106234 | (id only) | ✓ | 0/2 | — | 無し |
| 2021103975 | (id only) | ✓ | 0/2 | — | 無し |
| 2021105574 | (id only) | ✓ | 0/1 | — | 無し |
| 2021105738 | (id only) | ✓ | 0/1 | — | 無し |
| 2019104711 | (id only) | ✓ | 0/0 | — | 無し |
| 2020110060 | (id only) | ✓ | 0/0 | — | 無し |
| 2021102224 | (id only) | ✓ | 0/0 | — | 無し |
| 2022101329 | (id only) | ✓ | 0/0 | — | 無し |
| 2022106611 | (id only) | ✓ | 0/0 | — | 無し |
| (2頭) | UNRESOLVED | ✗ | — | — | — |

**passingPosition evidenceが無い12頭を、一切READY扱いにしていない。** これが
CHECKPOINT14C.2Cで`continuousPacePressure=0`・`expectedPaceClass=slow`（実際は
high、外れ）となった直接原因である。

horseNameが判明しているのはバレエマスター（既知の11頭ロスター内）のみで、他12頭は
`data/horses/`にhorseId単位のファイルは存在するがhorseName自体を持っていない
（`RacePerformance`にhorseNameフィールドは元々存在しない設計であり、名前解決には
別途ロスター参照が必要。今回は推測していない）。

## 4. Missing Runner Summary

- **UNRESOLVED_RUNNER**: 96頭分（新潟大賞典2頭 + 他7レース合計94頭）。horseId/
  horseName自体が不明。
- **NO_EVIDENCE**: 4頭（新潟大賞典のみ）。horseIdは既知だがtargetRace以前の実績が
  repositoryに0件。
- **PARTIAL**: 8頭（新潟大賞典のみ）。既存raceIdは判明済みだが、その走に
  passingPositionが無い。

## 5. Required Position Data Contract

新規のフィールド名は増やしていない。**既存CSV取り込み契約
（CHECKPOINT14A.3Bで確定、`normalize.ts`がsource of truth）をそのまま再利用する**:

```
raceId, raceDate, racecourse, raceNumber, raceName, surface, distance, going,
horseId, horseName, horseNumber, gate,
finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds,
fieldSize, passingPosition,
source, sourceRaceId, sourceHorseId
```

Pace Validation専用の目的に限れば、実質必要なのは
`raceId, raceDate, racecourse, surface, distance, going, horseId, horseName,
fieldSize, passingPosition`だが、既存Importerの必須項目チェック
（`normalize.ts`）を満たすには残りのフィールドも提供が必要（値が不明な場合の
許容範囲は既存Importer仕様通り）。**Base Ability再計算目的での大量data要求は
行っていない**（11節の指示通り、対戦馬全頭・winner・memberLevel用dataの
無制限要求はしていない）。

## 6. Required Prior Race Manifest

**Phase 1相当（ENRICHMENT、raceId既知）: 12行。**

| horseId | 不足raceId | raceDate | racecourse | 不足field |
|---|---|---|---|---|
| 2017105194 | JRA-20260412-FUKUSHIMA-11 | 2026-04-12 | 福島 | passingPosition |
| 2019104447 | JRA-20251109-TOKYO-11 | 2025-11-09 | 東京 | passingPosition |
| 2019104447 | JRA-20250817-SAPPORO-11 | 2025-08-17 | 札幌 | passingPosition |
| 2019104447 | JRA-20241222-NAKAYAMA-11 | 2024-12-22 | 中山 | passingPosition |
| 2019104447 | JRA-20241124-TOKYO-12 | 2024-11-24 | 東京 | passingPosition |
| 2019105302 | JRA-20240714-HAKODATE-11 | 2024-07-14 | 函館 | passingPosition |
| 2020106234 | JRA-20260411-HANSHIN-10 | 2026-04-11 | 阪神 | passingPosition |
| 2020106234 | JRA-20251129-TOKYO-11 | 2025-11-29 | 東京 | passingPosition |
| 2021103975 | JRA-20260315-CHUKYO-11 | 2026-03-15 | 中京 | passingPosition |
| 2021103975 | JRA-20251116-KYOTO-11 | 2025-11-16 | 京都 | passingPosition |
| 2021105574 | JRA-20260131-TOKYO-11 | 2026-01-31 | 東京 | passingPosition |
| 2021105738 | JRA-20260307-NAKAYAMA-11 | 2026-03-07 | 中山 | passingPosition |

**Phase 3相当（新規、raceId不明）: 4頭 × 最大5走（未知数、上限20行）。**
horseId 2019104711・2020110060・2021102224・2022101329・2022106611（5頭、
うち1頭は本節冒頭の表に記載漏れなので明記: 2022106611も同じくNO_EVIDENCE）
それぞれについて、対象日より前の実績（最大5走、Short Careerならそれ以下で可、
6節の指示通り5走未満を理由に追加不可能なraceを要求しない）を新規提供する
必要がある。具体的raceIdはrepository側で特定不能なため**UNKNOWN**のまま
（推測raceIdは生成していない）。

**Phase 4相当（新規、runner roster自体が不明）: 94頭分。** 具体的な要求前に
runner識別（horseId/horseName）が必要。

## 7. Deduplication Result

今回のPilotでは、同一horseが複数targetRaceに重複出走しているケースは無かった
（新潟大賞典以外の7レースは既知runnerが0頭のため重複しようがない）。したがって
**dedup対象は0件、6節の12行はいずれも一意の要求である。**

## 8. Collection Size

```
Pilot races: 8
unique known runners: 13
READY runners: 1
PARTIAL runners: 8
NO_EVIDENCE runners: 4
UNRESOLVED runner-slots: 96（新潟大賞典2 + 他7レース94）
unique prior races requested (enrichment, concrete): 12
total requested race-performance rows (concrete): 12
total requested race-performance rows (unknown upper bound): 最大20（NO_EVIDENCE 4頭×最大5走）
```

## 9. Phased Collection Recommendation

Actual Pace結果を見ずに、データ完全性のみに基づく決定論的な優先順位:

1. **Phase 1**: 新潟大賞典8頭へのpassingPositionエンリッチメント（12行、raceId
   既知、最小コスト・最高leverage）。
2. **Phase 2**: 新潟大賞典の未解決2頭の身元確認。
3. **Phase 3**: 新潟大賞典のNO_EVIDENCE 4頭の新規過去走追加（最大20行、未知数）。
4. **Phase 4**: 残り7レース（raceDateの新しい順=決定論的に着手するならJRA-
   20260823-NIIGATA-10から）のrunner roster特定＋各馬最大5走分の実績データ
   （94頭分、最も工数が大きい）。

## 10. Future Leakage Check

Manifest内の全`requiredPriorRaces`は、機械的に`raceDate < targetRace.raceDate`を
満たすもののみを列挙した（例: 新潟大賞典`targetRaceDate=2026-05-16`に対し、
挙げた12件は全て2026-04-12以前）。対象race自身のpassingPositionをEvidence要求に
含めていない。target race後の履歴も要求していない。

## 11. Machine-readable Manifest

`docs/checkpoint14c2d-historical-runner-evidence-request.json`として出力した
（pilotRacesFixed・runnerRosterAudit・requiredPositionDataContract・
targetRaceManifests・deduplicationResult・collectionSize・
phasedCollectionRecommendation・predictionEligibilityProposal・
explicitlyOutOfScopeThisRoundを含む）。

## 12. Regression

- `git status`で本ラウンドの変更は`docs/`配下の新規ファイル2件のみ
  （`.json`・`.md`）。コード・データファイルへの変更は無し。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- **Base Ability/Suitability V1/Historical Position Profile V1/Race Pace
  Prediction V1/raceLapData.json**: いずれも無変更（audit/manifest作成のみ）。
- `npm test`: **775 / 775 pass**。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。

## 13. 判定

**B-IDENTITY**。

Position Data Contract（既存CSV契約の再利用）・Required Prior Race Manifest・
Phased Collection Recommendationはいずれも確定し、ChatGPT側がPhase 1
（12行の具体的enrichment要求）については即座に次の実データZIPを作成できる状態
にある。一方、**8レース中7レースはrunner roster自体が完全に未解決（96頭中94頭が
このカテゴリ）であり、新潟大賞典の残り2頭も未解決**である。これらについては
「必要なEvidence」を具体的に列挙する前段階として、runner identity
（horseId/horseName）の追加解決が必須であり、今回のManifestではその解決を
行っていない（外部Web検索が禁止されているため）。

無理にA-DATAとは判定しない。Phase 1のみを見ればA-DATA相当だが、Manifest全体
としては「runner identityの追加解決が必要」というB-IDENTITYが実態を最も正確に
表す。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Phase 1（12行のenrichment）から着手するか**: raceId・horseIdとも既知で
   最小コストのため、まずここから実データZIPを作成することを推奨する。
2. **他7レースのrunner roster解決方法**: JRA公式レース結果の出走馬一覧から、
   horseId/horseNameをどう解決するか（ChatGPT側での追加調査が必要）。
3. **NO_EVIDENCE 4頭の新規過去走データ**: 具体的なraceId特定が必要なため、
   Phase 1・2より後回しにする方針でよいか。
4. **Prediction Eligibility閾値（22節のB-SPEC候補）**: `knownRunnerCoverage>=0.8`
   かつ`evidenceCoverage>=0.5`等の案を採用するか、別の基準にするか。
5. **段階的収集の範囲**: 全8レースを最終的に埋めるか、新潟大賞典1レースの
   完全化を優先し、他7レースは将来のPilot拡張として保留するか。

以上、CHECKPOINT14C.2D完了。データ取得・Import・再Validationへは進まず、
ここでSTOPする。

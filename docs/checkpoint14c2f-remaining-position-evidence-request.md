# CHECKPOINT14C.2F — Remaining 7 Runners Position Evidence Manifest

新潟大賞典15頭をHistorical Position Evidence上で完成させるため、残り7頭
（PARTIAL 2頭・NO_EVIDENCE 5頭）についてChatGPT側が収集すべき実データを列挙した。
**コード変更・データ取得・Pace Engine変更は一切行っていない**（`git status`で
本ラウンドの変更が0件であることを確認済み）。

## 1. READY 8 vs Coverage 7 差異

**コード上の事実として、差異は存在しない。** `generateHistoricalRacePacePrediction()`
（無変更）を実際に再実行し、`prediction.horses`を直接検査した結果:

```
positionEvidenceCount > 0（READY相当）: 8頭
positionEvidenceCount === 0: 7頭
```

`prediction.warnings`の「7頭がHistorical Position Profile未算出（evidence無し）」は、
この7頭（PARTIAL 2頭 + NO_EVIDENCE 5頭）を指しており、READY(8)の補集合
（8+7=15）と完全に一致する。

CHECKPOINT14C.2E報告の該当箇所を確認したところ、「READY runner数: 8/15（53%）」
と「evidence無し（PARTIAL+NO_EVIDENCE+UNRESOLVED）合計: 7/15（47%）」を
同じ表の隣接する行に並記していた。これは**同一の15頭を2通りの見方（保有側/欠落側）
で示した相補的な数値**であり、「evidence coverage = 7/15 = 47%」という表現は
後者（欠落側）の行を指すと考えられる。数値自体に誤りは無いため、report
correctionは不要と判断した。

**該当項目**: 上記選択肢のうち「report上の集計ミス」ではなく、**「READYの定義と
'evidence無し'の定義が表裏一体であることが、隣接する2行の並記により誤解されやすい
表現だった」**という表記上の紛らわしさが原因。Short Career等の別条件・Prediction
生成時のrunner exclusionには該当しない（推測ではなく、実際にコードを再実行して
確認した）。Pace formula変更は行っていない。

## 2. Remaining 7 Runners（完全列挙）

| horseName | horseId | sourceHorseId | historicalPositionStatus | currentPositionEvidenceCount | currentPassingPositionCount | currentFieldSizeCount | knownCareerRaceCount | shortCareer |
|---|---|---|---|---|---|---|---|---|
| ドゥラドーレス | 2019105556 | null（既存recordに未収録） | PARTIAL | 0 | 0 | 0 | 6 | false |
| サフィラ | 2021105541 | null（既存recordに未収録） | PARTIAL | 0 | 0 | 0 | 6 | false |
| フクノブルーレイク | 2022101329 | 2022101329 | NO_EVIDENCE | 0 | 0 | 0 | 0 | unknown（唯一の記録がtargetRace自身のみ） |
| ヤマニンブークリエ | 2022106611 | null | NO_EVIDENCE | 0 | 0 | 0 | 0 | unknown（targetRace後の1走のみ既知） |
| トーセンリョウ | 2019104711 | 2019104711 | NO_EVIDENCE | 0 | 0 | 0 | 0 | unknown（targetRace後の1走のみ既知） |
| ホールネス | 2020110060 | 2020110060 | NO_EVIDENCE | 0 | 0 | 0 | 0 | unknown（唯一の記録がtargetRace自身のみ） |
| シュガークン | 2021102224 | 2021102224 | NO_EVIDENCE | 0 | 0 | 0 | 0 | unknown（targetRace後の1走のみ既知） |

`knownCareerRaceCount`はtargetRaceDate（2026-05-16）より前の実績数。
`shortCareer`について、フクノブルーレイク・ホールネスはrepository上の記録が
targetRace自身の1走のみであり、真のデビュー戦（shortCareer=true相当）か、
単にrepositoryに未収録なだけかを判別できないため`unknown`とした（推測していない）。
ヤマニンブークリエ・トーセンリョウ・シュガークンは、targetRace**後**の1走が
既にrepositoryにあり（それぞれ2026-07-12七夕賞・2026-06-13ジューンステークス・
2026-06-14宝塚記念、いずれもfuture leakageのためPosition Evidenceには使えない）、
これらが重賞級のレースへ出走できていることから、targetRace以前にも実際の
出走歴がある可能性が高いと考えられるが、これも推測であり確定情報ではない。

## 3. PARTIAL 2頭の直近最大5走（再確認済み）

**ドゥラドーレス（horseId=2019105556）**: repository上に6走が既存（いずれも
`fieldSize`・`passingPosition`・`sourceHorseId`キー自体が存在しない、
CHECKPOINT14C.2Eの「既存6走ともpassingPosition未収録」を独立に再確認した）。
直近5走（RECENT_RACE_COUNT=5の対象）:

| horseId | horseName | raceId | raceDate | raceName | racecourse | surface | distance | going |
|---|---|---|---|---|---|---|---|---|
| 2019105556 | ドゥラドーレス | JRA-20260315-CHUKYO-11 | 2026-03-15 | 金鯱賞 | 中京 | turf | 2000 | 良 |
| 2019105556 | ドゥラドーレス | JRA-20260125-NAKAYAMA-11 | 2026-01-25 | アメリカJCC | 中山 | turf | 2200 | 良 |
| 2019105556 | ドゥラドーレス | JRA-20250921-NAKAYAMA-11 | 2025-09-21 | オールカマー | 中山 | turf | 2200 | 良 |
| 2019105556 | ドゥラドーレス | JRA-20250713-FUKUSHIMA-11 | 2025-07-13 | 七夕賞 | 福島 | turf | 2000 | 良 |
| 2019105556 | ドゥラドーレス | JRA-20250510-TOKYO-11 | 2025-05-10 | エプソムC | 東京 | turf | 1800 | 稍重 |

（6走目 JRA-20250209-KOKURA-11・小倉日経賞・2025-02-09はRECENT_RACE_COUNT=5の
範囲外のため対象外）

**サフィラ（horseId=2021105541）**: 同じく6走既存、6走ともfieldSize・
passingPosition・sourceHorseIdキー自体が無いことを再確認した。直近5走:

| horseId | horseName | raceId | raceDate | raceName | racecourse | surface | distance | going |
|---|---|---|---|---|---|---|---|---|
| 2021105541 | サフィラ | JRA-20260315-CHUKYO-11 | 2026-03-15 | 金鯱賞 | 中京 | turf | 2000 | 良 |
| 2021105541 | サフィラ | JRA-20260215-KYOTO-11 | 2026-02-15 | 京都記念 | 京都 | turf | 2200 | 良 |
| 2021105541 | サフィラ | JRA-20251116-KYOTO-11 | 2025-11-16 | エリザベス女王杯 | 京都 | turf | 2200 | 良 |
| 2021105541 | サフィラ | JRA-20251012-TOKYO-11 | 2025-10-12 | アイルランドT | 東京 | turf | 1800 | 良 |
| 2021105541 | サフィラ | JRA-20250518-TOKYO-11 | 2025-05-18 | ヴィクトリアマイル | 東京 | turf | 1600 | 良 |

（6走目 JRA-20250412-HANSHIN-11・阪神牝馬S・2025-04-12は範囲外）

## 4. PARTIAL_DATA_REQUEST（machine-readable、10行）

```json
[
  { "horseId": "2019105556", "horseName": "ドゥラドーレス", "raceId": "JRA-20260315-CHUKYO-11", "raceDate": "2026-03-15", "raceName": "金鯱賞", "racecourse": "中京", "surface": "turf", "distance": 2000, "going": "良" },
  { "horseId": "2019105556", "horseName": "ドゥラドーレス", "raceId": "JRA-20260125-NAKAYAMA-11", "raceDate": "2026-01-25", "raceName": "アメリカJCC", "racecourse": "中山", "surface": "turf", "distance": 2200, "going": "良" },
  { "horseId": "2019105556", "horseName": "ドゥラドーレス", "raceId": "JRA-20250921-NAKAYAMA-11", "raceDate": "2025-09-21", "raceName": "オールカマー", "racecourse": "中山", "surface": "turf", "distance": 2200, "going": "良" },
  { "horseId": "2019105556", "horseName": "ドゥラドーレス", "raceId": "JRA-20250713-FUKUSHIMA-11", "raceDate": "2025-07-13", "raceName": "七夕賞", "racecourse": "福島", "surface": "turf", "distance": 2000, "going": "良" },
  { "horseId": "2019105556", "horseName": "ドゥラドーレス", "raceId": "JRA-20250510-TOKYO-11", "raceDate": "2025-05-10", "raceName": "エプソムC", "racecourse": "東京", "surface": "turf", "distance": 1800, "going": "稍重" },
  { "horseId": "2021105541", "horseName": "サフィラ", "raceId": "JRA-20260315-CHUKYO-11", "raceDate": "2026-03-15", "raceName": "金鯱賞", "racecourse": "中京", "surface": "turf", "distance": 2000, "going": "良" },
  { "horseId": "2021105541", "horseName": "サフィラ", "raceId": "JRA-20260215-KYOTO-11", "raceDate": "2026-02-15", "raceName": "京都記念", "racecourse": "京都", "surface": "turf", "distance": 2200, "going": "良" },
  { "horseId": "2021105541", "horseName": "サフィラ", "raceId": "JRA-20251116-KYOTO-11", "raceDate": "2025-11-16", "raceName": "エリザベス女王杯", "racecourse": "京都", "surface": "turf", "distance": 2200, "going": "良" },
  { "horseId": "2021105541", "horseName": "サフィラ", "raceId": "JRA-20251012-TOKYO-11", "raceDate": "2025-10-12", "raceName": "アイルランドT", "racecourse": "東京", "surface": "turf", "distance": 1800, "going": "良" },
  { "horseId": "2021105541", "horseName": "サフィラ", "raceId": "JRA-20250518-TOKYO-11", "raceDate": "2025-05-18", "raceName": "ヴィクトリアマイル", "racecourse": "東京", "surface": "turf", "distance": 1600, "going": "良" }
]
```

いずれもtargetRaceDate（2026-05-16）より前。既存fieldSize/passingPositionは
10行とも無し（重複要求ではない）。

## 5. NO_EVIDENCE 5頭

| horseName | horseId | sourceHorseId | knownCareerRaceCount | targetRaceId | targetRaceDate |
|---|---|---|---|---|---|
| フクノブルーレイク | 2022101329 | 2022101329 | 0 | JRA-20260516-NIIGATA-11 | 2026-05-16 |
| ヤマニンブークリエ | 2022106611 | null（未収録） | 0 | JRA-20260516-NIIGATA-11 | 2026-05-16 |
| トーセンリョウ | 2019104711 | 2019104711 | 0 | JRA-20260516-NIIGATA-11 | 2026-05-16 |
| ホールネス | 2020110060 | 2020110060 | 0 | JRA-20260516-NIIGATA-11 | 2026-05-16 |
| シュガークン | 2021102224 | 2021102224 | 0 | JRA-20260516-NIIGATA-11 | 2026-05-16 |

## 6. NO_EVIDENCE各馬のprior race identity

repository内を確認したが、**5頭全てについて、targetRace以前のprior race
identityはrepository内に一切無い**（推測raceIdは作成していない）:

| horseName | repository内の既知情報 | prior race identity |
|---|---|---|
| フクノブルーレイク | targetRace自身（2026-05-16）のみ | **EXTERNAL_DISCOVERY_REQUIRED** |
| ヤマニンブークリエ | targetRace後の2026-07-12七夕賞のみ | **EXTERNAL_DISCOVERY_REQUIRED** |
| トーセンリョウ | targetRace後の2026-06-13ジューンステークスのみ | **EXTERNAL_DISCOVERY_REQUIRED** |
| ホールネス | targetRace自身（2026-05-16）のみ | **EXTERNAL_DISCOVERY_REQUIRED** |
| シュガークン | targetRace後の2026-06-14宝塚記念のみ | **EXTERNAL_DISCOVERY_REQUIRED** |

## 7. NO_EVIDENCE Data Request

各馬について、targetRaceDateより前の直近最大5走（Short Careerの場合はcareer
全走で可）を要求する。具体的raceIdはrepository側で特定不能なため、6節の通り
EXTERNAL_DISCOVERY_REQUIREDのまま。ChatGPT側が収集する最低限フィールドは
9節のCSV契約に準じる（`horseId, horseName, raceId, raceDate, raceName,
racecourse, surface, distance, going, fieldSize, passingPosition`）。

**上限目安**: 5頭 × 最大5走 = 最大25行（実際のキャリア長次第でこれより少ない
可能性が高い。存在しない5走目を無理に要求しない）。

## 8. Total Collection Rows

```
PARTIAL 2頭: 10行（確定、4節に全行掲載済み）
NO_EVIDENCE 5頭: 最大25行（未知数、具体的raceId不明のため）
合計上限: 最大35行
```

## 9. Future Leakage Check

4節の10行全てについて`raceDate < 2026-05-16`を満たすことを確認した（最新は
ドゥラドーレス・サフィラとも2026-03-15）。targetRace自身、およびtargetRace以後の
レース（ヤマニンブークリエの2026-07-12等）はPosition Evidence要求に含めていない。

## 10. CSV正式Contract

`normalize.ts`（source of truth、無変更）が要求する既存の正式column名:

```
raceId, raceDate, racecourse, raceNumber, raceName, surface, distance, going,
horseId, horseName, horseNumber, gate,
finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds,
fieldSize, passingPosition,
source, sourceRaceId, sourceHorseId
```

**使うべきでない旧alias**: `timeGap`（正: `timeGapSeconds`）・`raceTime`
（正: `actualRaceTimeSeconds`）・`final3F`（正: `final3FSeconds`）・
`carriedWeight`（正: `carriedWeightKg`）。

## 11. Machine-readable Manifest

`docs/checkpoint14c2f-remaining-position-evidence-request.json`として出力した
（coverageDiscrepancyExplanation・remainingSevenRunners・partialRunners・
noEvidenceRunners・requiredPositionDataContract・collectionRowLimits・
futureLeakageCheck・explicitlyOutOfScopeThisRoundを含む）。

## 12. Regression

- `git status`: 本ラウンドの変更は0件（コード・データとも無変更、audit/manifest
  作成のみ）。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- **Base Ability V1・Suitability V1・Historical Position Profile V1・
  Race Pace Prediction V1・raceLapData.json**: いずれも無変更。
- `npm test`: **775 / 775 pass**。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。

## 13. 判定

**B-SPEC**。

Remaining 7 Runnersの実データ要求（PARTIAL 2頭・確定10行、NO_EVIDENCE 5頭・
最大25行）は完全に列挙し、CSV契約も既存のものをそのまま再掲した。ChatGPT側で
SECOND Position Evidence ZIPを作成できる状態にある。一方で、NO_EVIDENCE 5頭の
`shortCareer`判定（2節）が`unknown`のままであり、「本当にデビュー戦なのか
未収録なだけなのか」という区別が付かない状態でChatGPT側にPrior Race特定を
依頼する形になっている。この曖昧さをどう扱うか（例: JRA公式の出走歴一覧で
確認可能であれば0走要求で確定させる）については、次のZIP作成時にChatGPT側の
判断・確認が必要なため、無理にA-DATAとはせずB-SPECとした。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **PARTIAL 2頭（10行、確定済み）から着手するか**: raceId既知・低コストのため
   最優先を推奨。
2. **NO_EVIDENCE 5頭のshortCareer確定**: JRA公式の馬柱・出走歴一覧で「本当に
   targetRace以前の出走が無い（デビュー戦等）」か「単にrepository未収録」かを
   確認できるか。
3. **NO_EVIDENCE 5頭のprior race特定（該当する場合）**: 上記で「出走歴あり」と
   判明した馬について、具体的なraceId/raceDateを外部調査できるか。
4. **35行到達前の段階投入可否**: PARTIAL 10行のみを先に投入し、evidence
   coverageの変化を確認してからNO_EVIDENCE分を検討する2段階アプローチにするか。

以上、CHECKPOINT14C.2F完了。データ取得・Import・残り7レース・CHECKPOINT14Dへは
進まず、ここでSTOPする。

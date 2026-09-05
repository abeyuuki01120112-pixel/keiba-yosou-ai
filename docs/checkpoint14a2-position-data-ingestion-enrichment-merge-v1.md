# CHECKPOINT14A.2 — Position Data Ingestion / Non-destructive Enrichment Merge V1

CHECKPOINT14A.1で特定した唯一の技術的Gap（`passingPosition`のimport経路が存在しないこと、
および`fieldSize`が実在するのにmerge conflict保護で反映されないケースがあること）を解消する
実装ラウンド。**Base Ability V1・Suitability V1・Short Career V1・MemberLevel Evidence V1・
Formal Snapshotの数式・重み・意味は一切変更していない。** Position/Pace Predictionの実装にも
着手していない。

## 1. passingPosition Import経路

CSV → normalize → RaceHistoryRawInput → merge → persistence → reload まで、値が保持される
ことを確認した。

- `race_performances.csv`のヘッダへ`passingPosition`列を追加（既存5行のデータは変更せず、
  末尾セルが自動的に空文字列として扱われる。既存の`consistency.test.ts`は無回帰）。
- `src/ability/import/normalize.ts`: `passingPosition`列（例: `"3-4-4-3"`）を`"-"`区切りで
  パースし、`PassingPositionData`（`cornerPositions`・`fieldSize`・`source`・`isReliable`）へ
  変換する`parsePassingPositionCorners()`を新設。存在しないコーナーは一切補完しない
  （記録された数だけがそのまま`cornerPositions.length`になる）。
- `src/ability/import/types.ts`: `RacePerformanceInput`へ`passingPosition: PassingPositionData | null`
  を追加。
- `src/ability/import/buildImportResult.ts`: `toRaceHistoryRawInput()`で`passingPosition`を
  そのままマッピング。
- `src/ability/raceHistoryPipeline.ts`: **無変更**。`RaceHistoryRawInput`は元々
  `Omit<RacePerformance, 計算専用field>`という型定義になっており、`passingPosition`は
  既にこの型に含まれていた。最終`RacePerformance`構築時に`...entry.raw`をスプレッドしている
  既存コードにより、値は自動的に伝播する（コード変更不要だった）。

## 2. fieldSize Import経路

既存のCSV→normalize→RaceHistoryRawInputの経路は元々完全に機能していた
（CHECKPOINT14A.1で確認済み）。本ラウンドで変更したのはmerge層のみ（3節）。

## 3. Non-destructive Enrichment Merge

`src/ability/import/mergeHorseHistory.ts`を書き換え、`ENRICHMENT_FIELDS = ["fieldSize",
"passingPosition"]`に限定した特別扱いを追加した。

| CASE | 条件 | 挙動 |
|---|---|---|
| A | 既存null・新規値あり | 補完（`enriched`へ記録） |
| B | 既存値あり・新規が同じ値 | no-op（`duplicateRaceIds`扱い、他のenrichment fieldにも補完が無ければ） |
| C | 既存値あり・新規null | 既存を維持（何もしない） |
| D | 既存値あり・新規が異なる値 | conflict（record全体をblock、既存値を維持） |

`raceTime`・`finishPosition`・`carriedWeight`・`raceId`・`horseId`等のcore fieldは
`ENRICHMENT_FIELDS`に含めていない（6節の指示どおり）。

## 4. Core Conflict Safety

- core field（ENRICHMENT_FIELDS以外）が1件でも食い違えば、従来どおりrecord全体をconflict
  として報告し、そのraceIdの内容は一切変更しない。
- enrichment fieldがCASE D（既存値あり・新規が異なる値）の場合も、record全体をconflictとして
  block する（部分適用しない。危険な部分書き込みを避けるための設計、7節）。
- atomicityの粒度は既存の`mergeHorseRaceHistory()`の単位（1頭分の履歴全体ではなく、raceId
  単位）を維持。1つのraceIdでconflictがあっても、同じ馬の他のraceId（新規追加・enrichment
  とも）はブロックされない。ただしCLI（`scripts/importRacePerformancesCsv.ts`）側は従来どおり
  「1件でもconflictがあればその馬のファイル全体を書き込まない」という既存の安全機構を
  維持している（11節の指示どおり、破壊していない）。

## 5. Validation

- passingPosition: 数値を`"-"`区切りで並べた形式のみ許可。非数値混入・0以下・区切り文字違い・
  空要素はすべてreject（行全体をエラー扱い）。存在しないコーナーを推測で補完しない。
- passingPositionを指定する場合、同じ行の`fieldSize`を必須とする（`PassingPositionData.fieldSize`
  が型上required項目のため）。
- passingPositionの最大値が`fieldSize`を超える場合はreject。
- fieldSize自体: 既存の`optionalNumber()`検証（数値・空欄許容）をそのまま使用（無変更）。
- JRAレースの頭数上限等のハードコード追加は行っていない（根拠のある既存仕様が無いため、
  10節の指示どおり見送った）。

## 6. Dry Run Output

`npm run import:csv -- <file> --dry-run`実行時、全馬横断の集計を新設した
（`=== Dry Run Summary（全馬横断集計） ===`）。

```
rows parsed: <CSV行数>
new race records: <新規追加>
exact duplicates: <完全重複>
enrichment candidates（record数）: <enrichment適用予定のrace数>
enriched fields（延べfield数）: <補完されるfield数の合計>
conflicts: <conflict件数>
errors: <normalizeエラー件数>
```

馬ごとの詳細出力にも、`enrichment候補（既存recordのoptional fieldをnull→populatedへ安全に
補完）: N件`という行と、対象raceId・補完fieldの一覧を追加した。

## 7. Existing Data実証

`src/ability/import/__tests__/enrichmentExistingDataDemo.test.ts`（新規）で、CHECKPOINT14A.1で
特定済みの実データ（`src/ability/data/import/samples/takarazuka_kinen_2026_18horses.csv`の
メイショウタバル、`fieldSize=18`）を**読み取り専用のfixture**として使用し、実証した
（production dataへの書き込みは一切行っていない）。

- **実証1（現状の正直な結果）**: このCSVをメイショウタバルの実際のdisk上recordへそのまま
  マージしようとすると、`fieldSize`自体はconflictにならないものの、`gate`・`horseNumber`
  （このCSVには実データとして含まれているが、既存recordには無い）が**core field**として
  扱われるため、record全体がconflictになり、書き込まれない。**「今回の実装だけで
  CHECKPOINT14A.1発見の全ケースが自動的に解消するわけではない」**という誠実な結果を
  そのままテストとして固定した。
- **実証2**: 「`fieldSize`以外は既に一致している」という想定（将来、gate/horseNumber/
  metadataが別途揃った状態を模したfixture）では、実際のCSV値`fieldSize=18`が正しく
  安全に補完されることを確認した。
- 別途`enrichmentBaseAbilityRegression.test.ts`（Test G）で、enrichment適用の前後で
  `baseAbility`・`raceScore`が1件たりとも変化しないことを、5走分のfixtureで確認した。

## 8. ChatGPT追加ZIP Contract

**新しい複雑なschemaは作っていない。既存の`race_performances.csv`形式（列を1つ追加しただけ）
のまま安全に受け取れる。**

必須列（既存契約、無変更）: `raceId, raceDate, racecourse, raceNumber, raceName, surface,
distance, going, horseId, horseName, horseNumber, gate, finishPosition, carriedWeightKg,
actualRaceTimeSeconds, final3FSeconds, timeGapSeconds`

新規列: `fieldSize, passingPosition`（`passingPosition`は`"3-4-4-3"`または`"8-7"`のような
`"-"`区切り形式）

**重要な運用上の制約（7節の実証で判明）**: 新潟記念11頭の**既存raceId**へenrichmentを
適用する場合、`fieldSize`・`passingPosition`**以外**の全列（`raceNumber`・`gate`・
`horseNumber`・`horseName`・`raceDate`等を含む）を、`data/horses/<horseId>.json`に
既に入っている値と**完全に一致**させること。1項目でも異なれば、そのraceId全体がconflict
としてblockされ、fieldSize/passingPositionも一切反映されない。CHECKPOINT14A監査時点で
新潟記念11頭の直近5走はgate/horseNumberとも100%充足済みであることを確認しているため
（CHECKPOINT14A報告書16節）、既存値をそのまま転記すれば問題は起きないはずだが、
**ZIP作成後は必ず`npm run import:csv -- <file> --dry-run`を先に実行し、
Dry Run Summaryの`conflicts`が0件であることを確認してから、実際の書き込みへ進むこと**
を強く推奨する。

## 9. Test Results

| チェックポイントのTest | 対応するテスト | 結果 |
|---|---|---|
| Test A: null→populatedの両方補完 | `mergeHorseHistory.test.ts`「Test A」 | pass |
| Test B: 完全一致はno-op | `mergeHorseHistory.test.ts`「Test B」 | pass |
| Test C: passingPosition食い違いはconflict | `mergeHorseHistory.test.ts`「Test C」 | pass |
| Test D: core field（raceTime）食い違いはconflict | `mergeHorseHistory.test.ts`「Test D」 | pass |
| Test E: malformed passingPositionはreject | `normalize.test.ts`「Test E」＋区切り文字違い・0以下のケース | pass |
| Test F: 2コーナーのみのpassingPositionをそのまま保持 | `normalize.test.ts`＋`mergeHorseHistory.test.ts`両方に「Test F」 | pass |
| Test G: Base Ability用fieldがImport前後で不変 | `enrichmentBaseAbilityRegression.test.ts` | pass |

追加で、CASE C（既存維持）・片方のfieldのみ補完可能なケース・fieldSize列欠落時の
reject・fieldSizeを超える値のreject等のテストも追加した。

`npx tsc -b`: エラーなし。`npm test`: **701 / 701 pass**（新規19件、既存682件は
無変更・無回帰）。

## 10. Regression

- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更）。
- **Production Base Ability**: シェイクユアハート baseAbility = **70.9**（無変更）。
  `git status`で`src/ability/data/horses/`配下に変更が無いことも確認済み（本ラウンドは
  コードのみ変更、実データは1件も書き換えていない）。
- **Suitability V1**: 無変更、既存テスト無回帰。
- **Formal Snapshot**: 無変更、既存テスト無回帰。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし（`src/components/ImportStatusPanel.tsx`が
  `buildImportResult.ts`を経由してブラウザバンドルへ到達しているため、bundle sizeが
  約1KB増加しているが、これは新しいpassingPosition検証コードの追加分であり異常ではない）。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告は無関係の既存事項。

## 11. 判定

**A**。

ChatGPT側で新潟記念11頭Position Data ZIPを、既存の`race_performances.csv`形式のまま
（`fieldSize`・`passingPosition`列を追加するだけで）作成・投入可能な状態になった。
passingPosition/fieldSizeのCSV→normalize→merge→persistence→reloadの経路を実装・
テスト済みで確認し、既存のcore field安全機構（silent overwrite禁止・conflict検出・
record全体のblock）は一切緩めていない。CHECKPOINT14A.1で発見した実データ
（メイショウタバルのfieldSize=18）を使った実証も行った。

無理にA判定にしていない根拠として明記する: 7節の実証1は、当初期待していたであろう
「発見済みのCSVをそのまま再投入すれば直ちに解決する」という単純な結果には**ならなかった**
（gate/horseNumberが別のcore fieldとして扱われるため）。これを正直にテストとして固定し、
8節で「新しいZIPでは、fieldSize/passingPosition以外の列を既存値と完全一致させる必要がある」
という運用上の制約を明記した。この制約を回避せず正確に伝えた上で、なお「ChatGPT側が
正しい値でZIPを作れば投入可能」という状態を実装・実証できたため、A判定とする。

## 12. 次にChatGPTと決める必要がある項目（優先順位順）

1. **gate/horseNumber等もenrichment field化するか**: 今回は`fieldSize`・`passingPosition`
   のみに限定した（6節の指示どおり）。新潟記念11頭は既にgate/horseNumberが充足済みのため
   今回は影響しないが、他の馬・他のレースで同様の問題（CHECKPOINT14A.1で発見した
   有馬記念2025のミュージアムマイル等）を解消するには、この決定が必要になる。
2. **`raceNumber`・`source`系metadataもenrichment field化するか**: 7節の実証1で
   `raceNumber`・`source`・`sourceRaceId`・`sourceHorseId`も同様の食い違いを起こし得る
   ことを確認した。同上の判断が必要。
3. **新潟記念11頭 Position Data ZIPの投入スケジュール**: 8節の契約に沿ってChatGPT側が
   ZIPを作成し、dry-run確認後に投入するタイミング。
4. **CHECKPOINT14A.1で挙げた4分類（KEEP/REUSE_WITH_CHANGES/REBUILD/DEFER）承認**:
   まだ確認が取れていない場合、Position Profile実装（14B）着手前に必要。

以上、CHECKPOINT14A.2完了。コード変更・テストとも完了したため、実装・テスト後commit/push
した上でSTOPする。CHECKPOINT14Bへは進まない。

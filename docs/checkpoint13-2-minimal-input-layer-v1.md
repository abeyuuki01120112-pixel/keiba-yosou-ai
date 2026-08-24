# CHECKPOINT 13.2 Minimal Input Layer V1 実装結果

2026-08-24実施。CHECKPOINT13.1の監査結果（判定B）を踏まえ、実11R Dry Run前に
必要な最小限のInput Layer 6項目を実装した。Base Ability V1・Suitability V1の
数式・component weight・凍結仕様は一切変更していない
（`git status`で変更ファイルを確認済み。frozen対象ファイルは0件）。

## 1. 変更ファイル

| ファイル | 内容 |
|---|---|
| `src/ability/types.ts` | `RacePerformance`へ`source`/`sourceRaceId`/`sourceHorseId`/`importedAt`/`dataKind`を追加（すべてoptional・ability計算には未使用） |
| `src/ability/import/types.ts` | `RacePerformanceInput`へ`source`/`sourceRaceId`/`sourceHorseId`を追加（optional） |
| `src/ability/import/normalize.ts` | CSVの`source`/`sourceRaceId`/`sourceHorseId`列（任意）を正規化 |
| `src/ability/import/buildImportResult.ts` | 上記フィールドを`toRaceHistoryRawInput`へ受け渡し、CSV経路は`dataKind:"real"`固定 |
| `src/ability/import/runnerResolver.ts`（新規） | Runner Resolver V1 |
| `src/ability/import/mergeHorseHistory.ts`（新規） | CSV Merge/Upsertのコア関数 |
| `src/ability/import/missingDataReport.ts`（新規） | Missing Data Report生成 |
| `scripts/importRacePerformancesCsv.ts` | デフォルトをMerge/Upsertへ変更。`--replace`で旧「まるごと置き換え」を維持 |
| `scripts/validateAbilityData.mjs` | 新フィールドをスキーマに追加、raceIdMismatch検知を追加 |
| `src/ability/predictionSnapshot.ts` | `SnapshotRaceTarget.raceNumber`追加、placeholder/fixture除外、`completenessFlags`追加 |
| `src/ability/data/horses/*.json`（15ファイル） | CHECKPOINT13.1で確認済みのV0プレースホルダー馬に`dataKind:"placeholder"`を付与（データのみの変更、計算式は無変更） |
| `src/ability/__tests__/predictionSnapshot.test.ts` 他 | 新規テスト追加・既存テストの新フィールド対応 |

## 2. CSV Merge / Upsert

**旧挙動**: `import:csv`は対象馬の`data/horses/<horseId>.json`を常に「まるごと置き換え」ていた。既存の過去走とCSVの新規行を合算したい場合は、CSV側に既存分も手動で含める必要があった。

**新挙動（デフォルト）**: Merge/Upsert方式。重複判定キーは`canonical horseId`（呼び出し側が1頭単位で処理） + `canonical raceId`。
- 既存に無いraceId → 追加（`addedRaceIds`）。
- 既存と完全一致するraceId（importedAtを除く全フィールド比較）→ 無視（`duplicateRaceIds`、二重登録なし）。
- 既存と内容が食い違う同一raceId → **conflict**として検出。どのフィールドが・どちらの値かを列挙し、**自動採用しない**。conflictが1件でもある馬はそのファイル全体を書き込まない（安全側）。

`--replace`フラグで旧「まるごと置き換え」方式に戻せる（意図的な一括修正用、限定用途）。

実際にCLIを動かして検証した（スクラッチ、検証後削除）: (1)新規馬1走のimport→正常追加、(2)同一CSVの再import→重複検知で書き込みスキップ、(3)別raceIdの2走目import→1走目を保持したまま2走に増加、をいずれも実データフローで確認済み。また、既存の`data/import/race-performances.csv`（V0時代のサンプルCSV）を実際にdry-run importしたところ、対象5頭（admireterra等、今回`dataKind:"placeholder"`を付与した馬と一致）で`dataKind`の食い違い（既存"placeholder" vs 新規"real"）によるconflictが正しく検出され、書き込みが安全にスキップされることを確認した（実データと紐付いていることの裏付け）。

## 3. Runner Resolver

`src/ability/import/runnerResolver.ts`。優先順位（指示どおり実装、勝手な変更なし）:
- **Priority 1**: `canonicalHorseIdHint`が`canonical horseId`集合に存在すれば即resolved。
- **Priority 2**: `sourceHorseId`が`sourceHorseIdRegistry`（呼び出し側が用意）に対応を持てばresolved。今回Source Adapterは作らないため、レジストリが空なら常にスキップされる。
- **Priority 3**: `horseName`の完全一致（NFKC正規化で全角/半角・前後空白・連続空白のみ吸収。**ファジーマッチ・類似度判定は一切行わない**＝「危険な推測resolve」の禁止を遵守）。

判定は必ず`resolved`/`unresolved`/`ambiguous`のいずれか。同名馬が2件以上あれば`ambiguous`とし、候補一覧を保持したまま**勝手に1頭へ確定しない**。`resolveRunners()`でバッチ処理し、`{total, resolved, unresolved, ambiguous}`のサマリーを返す。

## 4. Source / Provenance

`RacePerformance`/`RacePerformanceInput`に`source`/`sourceRaceId`/`sourceHorseId`/`importedAt`（optional）を追加。**Canonical ID（`raceId`/`horseId`）とは明確に別フィールドとして分離しており、同一視していない**。CSV側に列が無ければ`null`のまま（推測で埋めない）。将来`source + sourceHorseId → canonical horseId`のレジストリを`RunnerResolverContext.sourceHorseIdRegistry`として渡せば、Priority 2のresolveがそのまま機能する設計。

## 5. Placeholder隔離

`RacePerformance.dataKind: "real" | "placeholder" | "fixture" | null`を追加。**未記載（undefined/null）は"real"として扱う**（既存の実データ馬22頭＋シェイクユアハートとの後方互換性維持）。

CHECKPOINT13.1で確認済みの15頭（admireterra/arata/ecolowaltz/grandia/houohbiscuits/igacchi/magicsands/meinermount/onyankopon/pinkgin/readiness/roshampark/sakurafarrell/shohei/zendanhayabusa）の全走に`dataKind:"placeholder"`を付与した。

**正式Predictionへの混入防止方法**: `predictionSnapshot.ts`の`buildHorseSnapshotEntry()`で、`dataKind`が`"placeholder"`/`"fixture"`の走を、baseAbility/Suitability算出の対象から**除外**する（instruction 11の2択のうち「snapshot対象外」を採用。黙って使用することは無い）。除外があった場合は`completenessFlags`に`"placeholderDataExcluded"`を、`warnings`に人間向け説明を追加する。

**適用範囲を意図的に限定した**: `horseAbilityData.ts`の`historyByHorseId`（既存の馬詳細画面・シミュレーション機能が使う）自体は変更していない。除外はStage A/B Snapshotの生成時のみに限定した（instruction 11が「正式なStage A/Stage B Snapshot生成時に」と明示的にスコープしているため、既存UIへの影響を避ける最小変更とした）。テストで、全走がplaceholderの馬（grandia）がbaseAbility=null・completenessFlags=["placeholderDataExcluded"]となること、実データ馬（シェイクユアハート、dataKind未設定）が従来どおりreal扱いされることの両方を確認済み。

## 6. Data Completeness Report

新しく検知可能になった項目（CHECKPOINT13.2 STEP12のA〜F）:

| コード | 検知場所 | 内容 |
|---|---|---|
| A. unresolvedHorse | `runnerResolver.ts` | resolveできない |
| B. ambiguousHorse | `runnerResolver.ts` | 複数候補で確定不能 |
| C. duplicateRaceEntry | `mergeHorseHistory.ts`（import時） / 既存`validate:data`（同一馬内raceId重複、CHECKPOINT12.6以前から存在） | 同一horse/raceの重複 |
| D. raceIdMismatch | `validateAbilityData.mjs`（新規追加） | 同一raceIdなのにracecourse/surface/distance/going/raceDateが馬によって食い違う |
| E. insufficientRecentHistory | `predictionSnapshot.ts` | 過去走はあるがRECENT_RACE_COUNT（既存のBase Ability V1定数=5、新ルールではなく既存仕様をそのまま参照）未満 |
| F. memberLevelUnavailable | `predictionSnapshot.ts` | baseAbility算出に使った走のいずれかでmemberLevelBreakdownがnull（FALLBACK値使用） |

C・Dはdata/horses/全体を横断してはじめて検出できるため`validate:data`側に置き、E・Fは1頭単位のSnapshot生成時に検出できるため`predictionSnapshot.ts`側（`HorseSnapshotEntry.completenessFlags`）に置いた。役割分担を`missingDataReport.ts`のコメントに明記している。

`src/ability/import/missingDataReport.ts`の`buildMissingDataReport()`が、Runner Resolverの結果（A/B）とSnapshotの`completenessFlags`（E/F、およびplaceholderDataExcluded）を1つのレース単位レポートへ統合する。`formatMissingDataReport()`で、CHECKPOINT13.2の指示例と同じ書式のテキストを生成できる：

```
Race TEST-RACE-1 テストステークス

Total runners: 3
Resolved: 2
Unresolved: 1
Ambiguous: 0

Missing / Problem:

存在しない馬
- unresolvedHorse

グランディア
- placeholderDataExcluded
```

## 7. raceNumber

`SnapshotRaceTarget`（`predictionSnapshot.ts`）に`raceNumber: number | null`を追加した。CHECKPOINT13.1で「`SnapshotRaceTarget`にraceNumberが無い」と指摘されていた箇所。ability計算には使用しない（監査・識別専用）。フィルタリング機能（11R限定等）は今回追加していない（指示どおり）。

なお`RacePerformance.raceNumber`自体は既に第26実装で存在していたが、`scripts/validateAbilityData.mjs`のスキーマ定義に登録されておらず「未知のフィールド」警告の原因になっていたため、今回あわせて登録した（純粋なバリデータの是正、計算には影響しない）。

## 8. Stage A / Stage Bとの接続可能性

`buildGateConfirmedSnapshot()`/`buildT2hSnapshot()`/`buildAbilityBoard()`自体は変更していない。Runner Resolverの出力（`resolved`結果）から`RaceEntryInput[]`を組み立て、そのまま`buildGateConfirmedSnapshot()`へ渡せることをテストで確認した（`CHECKPOINT13.2 STEP17`のテスト）。`missingDataReport.ts`もSnapshotの`completenessFlags`をそのまま読むだけで、Snapshot側の型・ロジックには手を入れていない。

**ただし、今回は実際のJRA 11Rのデータを使ったDry Runは行っていない**（指示どおり）。実行するには、実際のレースカード（出走馬名一覧）を`RunnerResolveInput[]`へ変換する手順（テキスト貼り付け・CSV等）がまだ無く、これは次回以降の課題として残る。

## 9. Test Results

- 新規テストファイル: `runnerResolver.test.ts`（12件）、`mergeHorseHistory.test.ts`（8件）。
- `predictionSnapshot.test.ts`へ追加: raceNumber・Test8（placeholder隔離、3件）・Test9（completeness report、3件）・STEP17（Resolver→Snapshot接続、1件）・STEP14（Missing Data Report、1件）＝計9件追加。
- 既存テスト`consistency.test.ts`を新フィールド追加に合わせて更新（1件、期待値の追記のみ）。
- **`npm test`（全体）: 582/582件pass**（CHECKPOINT13.1時点534件から、CHECKPOINT13.2で48件追加）。
- **`npm run lint`: エラーなし**。
- **`npm run build`: 型チェック・ビルドとも成功**。
- **`npm run validate:data`: 「検証成功（エラーなし）」**。新フィールドによる「未知のフィールド」警告は解消。既存警告（勝ち馬欠落・比較母集団不足・baselineカバレッジ）は維持。raceIdMismatchの新規警告は現状0件（既存データに矛盾なし）。

## 10. Base Ability V1への影響

**無変更**。`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/`memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`/`raceHistoryPipeline.ts`は本ラウンドで1行も変更していない（`git status`で確認済み）。`data/horses/`への`dataKind`付与はデータ層の追記のみで、`RacePerformance`型の既存フィールド・既存の値は一切変更していない。「対象レース出走馬だけの部分計算」も引き続き行っていない（`predictionSnapshot.ts`は`getHorseRecentRaces()`経由でのみ過去走を取得、`buildRaceHistory()`は今回も一切import/呼び出ししていない）。

## 11. Suitability V1への影響

**無変更**。`suitabilityV1.ts`/`distanceSuitability.ts`/`courseSuitability.ts`/`goingSuitability.ts`/`courseContextPrior.ts`/`horseGateEvidence.ts`/`suitabilityConfidence.ts`は1行も変更していない。HorseEvidence優先・CoursePrior弱いfallback・unknown非100%埋め・evaluated=false非干渉・confidence/coverage分離・weakest-link confidenceの各仕様もすべて既存のまま。

## 12. 残課題（実11R Dry Run前にまだ必要なもの）

優先順位順：

1. **実際のレースカード（出走馬名一覧）の入力手段**: 現状Runner Resolverへの入力（`RunnerResolveInput[]`）を人手で組み立てる必要がある。CSV/テキスト貼り付け等の簡易入力手段はまだ無い。
2. **`canonicalHorseNames`レジストリの拡充**: 現状`horseName`は`simulation/data/sapporoKinen.json`の16頭ロースターにしか記録が無く、CHECKPOINT13.1で指摘した「24頭は馬名から自動resolveできない」という制約は今回も解消していない（Runner Resolverの仕組みは用意したが、突き合わせ対象となる正式馬名の登録簿がまだ薄いまま）。
3. **`sourceHorseIdRegistry`の実データ化**: 型・Priority 2の仕組みは用意したが、実際に`sourceHorseId → canonical horseId`の対応を記録したレジストリはまだ空のまま。
4. **`dataKind:"placeholder"`データの扱い方針の最終決定**: 今回は隔離（Snapshot除外）にとどめた。削除するか、実データに置き換えるか、明示的な`fixture/`ディレクトリへ移すかは未決定。
5. **`--replace`モードの使用ルール明文化**: 緊急時の一括修正用として残したが、いつ使ってよいかの運用ルールは今回定めていない。

## 13. 判定: B

**A（実11R Runner Resolve/Dry Runへ進める）ではない。無理にAを出さない。**

理由:
- CHECKPOINT13.1で指摘された6項目（CSV Merge/Upsert・Runner Resolver・Source/Provenance・Placeholder隔離・Data Completeness Report拡張・raceNumber対応）はいずれも実装し、テストで動作を確認した。**Input Layerの設計自体に問題は無い**（Cではない）。
- しかし、上記12節の残課題（特に1・2）が未解決であり、実際のJRA 11Rを流し込むには「レースカードをどう入力するか」「大半の実データ馬をどう馬名からresolveするか」がまだ機能として欠けている。これらはInput Layerの「部品」は揃ったが「実際に使うための最後の配線」がまだ無い状態であり、小さな追加実装（B）で埋まる範囲と判断する。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. 実際のレースカード（出走馬名一覧）をRunner Resolverへ入力する方法（手動テキスト貼り付けで十分か、簡易CSV形式を新設するか）。
2. `canonicalHorseNames`レジストリの拡充方法・優先順位（ロースター外24頭の正式馬名をどこから確認するか）。
3. `dataKind:"placeholder"`の15頭データの最終的な扱い（隔離維持／削除／実データ置き換え）。
4. CHECKPOINT13.3として実11R Dry Runへ進むか、それとも上記1・2を先に埋める追加ラウンドを挟むか。

ここでSTOPします。CHECKPOINT13.3（実11R Dry Run）へはまだ進みません。

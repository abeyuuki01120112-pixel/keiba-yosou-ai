# CHECKPOINT 13.2B Race Card Input Bridge V1 実装結果

2026-08-24実施。CHECKPOINT13.2「Minimal Input Layer V1」の判定B（Input Layer
の部品は揃ったが実11R投入への最後の配線が無い）を受け、今回は
「Race Card → Runner Resolver → Missing Data Report → RaceEntryInput →
Stage A Snapshot → Ability Board」の配線だけを完成させた。Base Ability V1・
Suitability V1の数式・component weight・凍結仕様は本ラウンドでも一切変更
していない（frozen対象ファイルはgit statusで無変更を確認済み）。

## 1. 変更ファイル

| ファイル | 内容 |
|---|---|
| `src/ability/import/raceCardTypes.ts`（新規） | Race Card Input V1のSchema・JSON/CSV正規化 |
| `src/ability/import/canonicalHorseRegistry.ts`（新規） | `data/horses/`から自動生成するcanonical horse registry |
| `src/ability/import/raceCardBridge.ts`（新規） | Race Card→Runner Resolver→RaceEntryInput→Stage A Snapshotの橋渡し、predictionEligible判定、Missing Data Report |
| `scripts/raceCardCheck.ts`（新規） | `npm run racecard:check`のCLI本体（読み取り専用） |
| `src/ability/horseAbilityData.ts` | `getAllCanonicalHorseIds()`を追加（既存2関数・既存計算方法は無変更） |
| `scripts/importRacePerformancesCsv.ts` | `--replace`使用時に明示的な警告bannerを表示するよう変更 |
| `package.json` / `package-lock.json` | `racecard:check`スクリプト追加。`vite-node`をdevDependencyに追加（後述STEP3参照） |
| `docs/race-card-input-v1.md`（新規） | Race Card Input V1のSchema・使い方の説明 |
| テスト3ファイル（新規、計36件） | `raceCardTypes.test.ts`・`canonicalHorseRegistry.test.ts`・`raceCardBridge.test.ts` |

## 2. Race Card Schema

`src/ability/import/raceCardTypes.ts`の`RaceCardInput`。指示どおり最低限の項目を実装：

```
raceId, raceDate, raceNumber（必須）, racecourse, surface, distance,
scheduledStartTime, going（null許容）,
runners[]: horseId?, sourceHorseId?, horseName, frame, horseNumber,
           assignedWeight?, scratched
```

- `going`はnull（未確定）を正式に許可する。`normalizeRaceCard()`はnull/未指定を
  そのまま受理し、推測で「良」等へ補完しない（空文字はエラーとして弾く＝
  「未確定はnullで表現する」規約を強制）。`raceCardBridge.ts`側で、
  `going !== null`の場合のみ`{evaluated:true, going}`をSuitability V1へ渡し、
  それ以外は`{evaluated:false}`（`predictionSnapshot.ts`のCHECKPOINT13から
  無変更の仕組み）を渡すため、既存仕様どおり`going.evaluated=false`へ
  自然に繋がる。
- `raceNumber`は必須項目として検証する（欠落・非整数はエラー）。9R/10R/WIN5
  向けのフィルタリング機能は追加していない（指示どおり）。

## 3. CLI / Input方法

```
npm run racecard:check -- path/to/racecard.json [--board]
npm run racecard:check -- path/to/racecard.csv  [--board]
```

JSON・CSVどちらもサポート（拡張子で自動判別）。CSVは1行=1出走馬形式で、
レース単位の列（raceId等）が行ごとに食い違うとエラーになる（取り込み時点
での`raceIdMismatch`予防）。

**技術的な注記（今回判明した制約への対処）**: `predictionSnapshot.ts`が使う
`horseAbilityData.ts`は`import.meta.glob`（Vite専用API）で`data/horses/*.json`
を読み込むため、既存の`tsx`ベースCLI（`import:csv`等）と同じ方式では
`raceCardCheck.ts`を実行できないことが実装中に判明した（`tsx`は
`import.meta.glob`を解決できずクラッシュする）。この問題は、既存の
Vite/Vitestツールチェーンに整合する標準的な解決策として`vite-node`を
devDependencyに追加し、`racecard:check`のみ`vite-node`経由で実行するよう
にして解決した（`import:csv`等の既存CLIは`data/horses/`を直接fs読み込み
する設計のため元々この問題が無く、無変更のまま`tsx`を使い続けている）。
実際にCLIを実行し、JSON/CSV双方でシェイクユアハート（実データ・resolved・
predictionEligible=true・baseAbility=70.3）とグランディア（V0プレースホルダー・
resolvedだがpredictionEligible=false）を含むRace Cardを診断できることを
確認した（スクラッチ、検証後削除）。

## 4. Runner Resolve接続

CHECKPOINT13.2の`runnerResolver.ts`を**無変更のまま再利用**した（優先順位
canonical horseId→sourceHorseId対応→horseName完全一致、ファジーマッチ禁止、
resolved/unresolved/ambiguousの3値判定もすべて既存のまま）。`raceCardBridge.ts`
はRace Cardの各runnerを`RunnerResolveInput`へ変換して`resolveRunners()`を
呼び出すだけで、resolveロジック自体は複製していない。

## 5. canonicalHorseNames処理

**自動生成**（`src/ability/import/canonicalHorseRegistry.ts`）。24頭を手作業で
ハードコードすることはしていない。`horseAbilityData.ts`の`getAllCanonicalHorseIds()`
（新規追加、`data/horses/`の全horseIdを列挙するだけ）と`getHorseRecentRaces()`
（CHECKPOINT13で追加、無変更）から、各horseIdについて「馬単位のdataKind
ロールアップ」（走単位のdataKindから機械的に導出、real/mixed/placeholder/
fixture/unknown）を計算する。馬名は`simulation/data/sapporoKinen.json`
ロースター（16頭）から取得できる分だけ埋め、ロースター外の24頭は
`horseName: null`のまま返す（捏造・推測はしない。この24頭はcanonical horseId
を既に知っている場合のみPriority 1でresolveできる、というCHECKPOINT13.1の
監査結果と整合する挙動）。

alias/override用の手動レジストリは今回追加していない（現状そのようなケース
が実データに存在しないため）。将来必要になれば、`RunnerResolverContext`の
既存の`sourceHorseIdRegistry`とは別の、小さな`horseName`エイリアス表として
追加できる設計にはなっている。

## 6. sourceHorseIdRegistry

構造（`RunnerResolverContext.sourceHorseIdRegistry`、CHECKPOINT13.2で追加）は
既存のまま再利用。**今回、実データは投入していない**（`runRaceCardBridge()`の
デフォルトは空オブジェクト`{}`）。正式なJRA/Kaggle等のSourceが決定していない
現状で架空のmappingを作ることはしていない。"registry infrastructure ready /
data未投入"の状態。

## 7. Placeholder / predictionEligible

`resolverStatus`（resolved/unresolved/ambiguous）と`predictionEligible`
（正式予想に使ってよいか）を明確に分離した（`RunnerBridgeResult`型）。

判定ルール（`raceCardBridge.ts`）: `predictionEligible = resolved && !scratched
&& baseAbility !== null && reasons.length === 0`。`reasons`は以下から構成：
- canonical horse registryの馬単位dataKindロールアップが`placeholder`/`fixture`
  → `"placeholder_data"`
- Stage A Snapshotの`completenessFlags`（CHECKPOINT13.2で追加、無変更）を
  そのまま反映: `insufficientRecentHistory`・`memberLevelUnavailable`は
  そのままのコード名、`placeholderDataExcluded`は`"placeholder_data"`へ
  エイリアス（同じ検知を二重実装せず、既存コードの出力を再利用している
  ことの明示）。
- `scratched`（出走取消）

実際にgrandia（CHECKPOINT13.1で確認済みのV0プレースホルダー馬）を含む
Race Cardで、`resolverStatus: resolved`かつ`predictionEligible: false`
（`reason: placeholder_data`）となることをテスト・CLI実行の両方で確認した。

## 8. Missing Data Report

`formatRaceCardBridgeReport()`が、指示どおりの書式（Race/Race Number/
Total runners/Resolved/Unresolved/Ambiguous/Prediction eligible/
Prediction ineligible、馬ごとのresolverStatus/predictionEligible/reason）
でテキストレポートを生成する。CHECKPOINT13.2の`missingDataReport.ts`
（レース結果を見る前の一般的な不足レポート）とは役割が異なるため別モジュール
として実装したが、両者とも`completenessFlags`という同じ土台を参照している。

## 9. Data Completeness Gate

`RaceCardBridgeResult.gate: { formal: boolean; reasons: string[] }`。
`unresolved`・`ambiguous`・`predictionIneligible`（placeholder/insufficient
history/scratched等を含む）が1件でもあれば`formal=false`とし、理由を列挙する。
**診断用のSnapshot（`diagnosticSnapshot`）自体は常に生成する**（resolvedな馬
だけを使って構築、CHECKPOINT13の`buildGateConfirmedSnapshot()`をそのまま
呼ぶ）。`gate.formal=false`のときはCLI/レポートで明示的に
「DIAGNOSTIC ONLY（正式Snapshotとしては扱えません）」と表示し、正式予想と
診断出力を区別する。「なんとなく計算できる馬だけでAbility Boardを完成させて
正式扱いする」ことはしていない。

## 10. Stage A接続テスト

`CHECKPOINT13.2B Test10`で、fixtureデータ（シェイクユアハート、既存の実データ）
を使い、Race Card → Runner Resolver → RaceEntryInput → `buildGateConfirmedSnapshot()`
→ `buildAbilityBoard()`まで実際に接続し、baseAbility=70.3（凍結済み正式値）が
Ability Boardの`rankByBaseAbility=1`まで正しく伝播することを確認した。
**実際のJRA 11Rデータはまだ投入していない**（指示どおり、fixtureのみ）。

## 11. Stage B再利用可能性

`RaceCardInput`のフィールド（going/runners[].scratched/scheduledStartTime等）は
Stage Bでもそのまま再利用できる設計にした：goingを`null`→実際の馬場状態へ
更新するだけで`buildT2hSnapshot()`（CHECKPOINT13、無変更）にそのまま渡せる。
oddsはRace Card Input自体には含めていない（`predictionSnapshot.ts`の
`OddsSnapshotEntry`が既にStage B専用として分離済みのため、Race Card側で
重複定義しない）。**Stage B向けの新ロジックは今回追加していない**
（`raceCardBridge.ts`は`buildGateConfirmedSnapshot()`のみを呼び出し、
`buildT2hSnapshot()`は呼んでいない）。

## 12. --replace安全策

- デフォルトはMerge/Upsertのまま維持（CHECKPOINT13.2から無変更）。
- `--replace`使用時に、破壊的操作であることを明示する警告bannerを表示する
  よう変更した（`scripts/importRacePerformancesCsv.ts`）。
- `raceCardBridge.ts`・`raceCardCheck.ts`は`importRacePerformancesCsv.ts`を
  一切importしていない（静的確認をテストに追加、`CHECKPOINT13.2B Test12`）。
  通常のRace Card flowから`--replace`が呼ばれることは構造的に無い。
- 既存の`--dry-run`等との互換性は壊していない。

## 13. Test Results

- 新規テスト: `raceCardTypes.test.ts`（13件）、`canonicalHorseRegistry.test.ts`
  （9件）、`raceCardBridge.test.ts`（14件）＝計36件（要求されたTest1〜12を
  すべてカバー、一部は複数ケースに分割）。
- **`npm test`（全体）: 618/618件pass**（CHECKPOINT13.2時点582件から36件追加）。
- **`npm run lint`: エラーなし**。
- **`npm run build`: 型チェック・ビルドとも成功**。
- **`npm run validate:data`: 「検証成功（エラーなし）」**。本ラウンドは
  `data/horses/`を一切変更していないため、警告内容もCHECKPOINT13.2時点から
  無変更。
- CLIの実動作確認（JSON/CSV両形式、スクラッチファイル使用・検証後削除）:
  resolved+eligible（シェイクユアハート）、resolved+ineligible/placeholder_data
  （グランディア）、unresolved（架空馬）を含むRace Cardで、期待どおりの
  レポート・Ability Board出力・`data/horses/`無変更（git statusで確認）を確認。

## 14. Base Ability V1への影響

**無変更**。`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/
`memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`/`raceHistoryPipeline.ts`は
本ラウンドで1行も変更していない（`git status`で確認済み）。`horseAbilityData.ts`
への変更も、既存の`historyByHorseId`計算方法・既存2関数・`getHorseRecentRaces()`
の挙動を変えない新規export（`getAllCanonicalHorseIds()`）の追加のみ。
「対象レース出走馬だけの部分計算」は本ラウンドでも一切行っていない
（`raceCardBridge.ts`は`buildGateConfirmedSnapshot()`を呼ぶだけで、
`buildRaceHistory()`は一切import/呼び出ししていない）。

## 15. Suitability V1への影響

**無変更**。`suitabilityV1.ts`/`distanceSuitability.ts`/`courseSuitability.ts`/
`goingSuitability.ts`/`courseContextPrior.ts`/`horseGateEvidence.ts`/
`suitabilityConfidence.ts`は1行も変更していない。going未確定時の
evaluated=false化は、Race Card側で`going: null`のときのみ
`predictionSnapshot.ts`の既存sentinel機構（無変更）を通すよう配線しただけで、
Suitability V1自体・`predictionSnapshot.ts`のコンポーネント計算ロジックには
一切手を加えていない。

## 16. 実11R Dry Run前の残課題

1. **本物のJRA 11R出走表の入手手段**: Race Card Input自体は完成したが、
   実際の週末レースの出走表をどこから取得しJSON/CSV化するかは未定（指示どおり
   自動取得・スクレイピングは今回対象外）。
2. **ロースター外24頭の馬名登録**: `canonicalHorseRegistry`の馬名自動取得は
   `simulation/data/sapporoKinen.json`の16頭に限られたまま。24頭は依然として
   `horseId`を事前に把握していないとresolveできない。
3. **`sourceHorseIdRegistry`の実データ化**: 構造は再利用可能だが、依然として
   空のまま（正式Source決定待ち）。
4. **`dataKind:"placeholder"`データの最終方針**: CHECKPOINT13.2から持ち越し、
   未決定のまま。

## 17. 判定: B

**A（実11R Race Cardを投入してCHECKPOINT13.3へ進める）ではない。無理にAを
出さない。**

理由:
- 指示された配線（Race Card → Runner Resolver → Missing Data Report →
  RaceEntryInput → Stage A Snapshot → Ability Board）は完成し、fixtureで
  end-to-endの接続を確認した。**Input設計自体に問題は無い**（Cではない）。
  canonicalHorseNamesの自動生成・predictionEligibleとresolvedの分離・
  Data Completeness Gate・`--replace`の安全化もすべて指示どおり実装できた。
- しかし、STEP16に挙げた残課題（特に1・2）は本質的に「実際の週末レース情報
  をどう入手するか」という、このラウンドのスコープ外の問題であり、
  Input Layer側の実装では解決できない。CHECKPOINT13.3へ進むには、少なくとも
  1本の実レース出走表（手動転記でもよい）を用意する段階が必要であり、
  これは「小さな追加配線」ではなく「データの入手」という別種の課題のため、
  純粋な機能実装としては完了しているが実11R投入の準備としてはB評価とする。

## 18. 次にChatGPTと決める必要がある項目（優先順位順）

1. 実際のJRA 11R出走表を、今回のRace Card Input形式へどう転記・投入するか
   （手動転記の運用ルールを決めるだけで良いか、他の手段を検討するか）。
2. ロースター外24頭の馬名をどこから確認し、`simulation/data/sapporoKinen.json`
   または将来の別レジストリへどう登録していくか。
3. `dataKind:"placeholder"`の15頭データの最終的な扱い（CHECKPOINT13.2から
   持ち越し）。
4. CHECKPOINT13.3として実11R Dry Runへ進む条件（上記1が整い次第進めるか、
   別途チェックポイントを設けるか）。

ここでSTOPします。CHECKPOINT13.3（実11R Dry Run）へはまだ進みません。

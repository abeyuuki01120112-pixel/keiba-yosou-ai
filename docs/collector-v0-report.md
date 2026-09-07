# Automated Race Data Collector V0 — 実装報告

**作成日**: 2026-09-03
**位置づけ**: 「対象raceIdを指定すれば、レース情報・出走馬・過去走の自動収集
基盤までを自動化する」というCHECKPOINT（Automated Race Data Collector V0）の
実装結果。

**結論を先に明記する**: V0（レース情報・出走馬・過去走の自動収集基盤）は
実装・テスト完了。**ただし、当初想定していた「ライブスクレイピングによる
完全自動化」は、この実行環境のネットワークポリシーにより実現不可能である
ことが判明した（12節・13節で詳述）。** V0で実際に構築できたのは、
「生データさえ配置されれば、そこから先（正規化・Future Leakage監査・
Provenance追跡・冪等な保存）を完全自動化するパイプライン」である。
30レース全件収集・毎週の実戦適用へはまだ進んでいない（STOP指示通り）。

---

## 1. 現在まで手動だった部分

- レース識別・出走馬情報・過去走データの取得（すべて`netkeiba`等から
  人間が手作業で収集し、CSV/ZIPとして提供）
- 正規化（項目名の統一、既存24列/21列契約への変換）
- 重複・欠損・異常値のチェック（人間の目視、または本ラウンド以前は
  読み取り専用スクリプトで都度実施）
- Future Leakageの確認（都度、コードを読んで手動確認していた）
- データの保存場所の決定・ファイル命名（都度、人間が判断）
- Source Provenanceの記録（README.mdへの手書き記載のみ、構造化データとしては
  存在しなかった）

## 2. 今回自動化できた部分

- **正規化パイプライン**: `RawRaceBundle`（生データ形式）→
  `CollectedRunnerRow[]`（既存Gate Race CSV契約と同一項目名の正規化形式）への
  変換を`normalizeRaceBundle()`で完全自動化。
- **バリデーション**: horseId重複・horseNumber重複・finishPosition等の
  必須項目欠損・`horseNumber > fieldSize`異常（既知の出走取消パターン）の
  自動検出を`validateNormalizedRunners()`で実装。
- **Prior History取得**: 既存production `getHorseRecentRaces()`
  （`src/ability/horseAbilityData.ts`、既存・無変更）をREAD-ONLYで再利用し、
  対象レース出走馬全員について、利用可能な過去走を自動取得
  （`fetchPriorHistoryFromProduction()`）。取得できない馬は
  `status: "unavailable"`として自動的に明示（0件補完なし）。
- **Future Leakage Guard**: 対象レース日付以降のprior history行が1件でも
  あれば、warningではなく**Collector Run全体をFAIL**させる仕組みを
  `auditFutureLeakage()`で実装（同日も含めて`>=`判定）。
- **Source Provenance**: 全データ項目について
  `source/sourceIdentifier/targetRaceId/retrievedAt/targetAsOf/method/
  collectorVersion`を構造化データとして自動記録。
- **Idempotency / Cache**: 同一raceIdの再実行で、キャッシュファイルが
  重複生成されず、内容が同一なら書き込み自体をスキップする仕組みを
  `writeNormalizedCache()`で実装。
- **`collectRace(targetRaceId)`という単一の呼び出しで、上記すべてを
  一気通貫実行できるオーケストレーター**を実装（`collectRace.ts`）。
- CLI（`npm run collect:race -- <raceId>`）を追加。

## 3. まだ自動化できていない部分

- **生データそのものの取得（ライブスクレイピング）**: 12節・13節で
  詳述する環境上の制約により、V0では実装していない。人間またはChatGPT側が
  `src/collector/data/raw/<raceId>.json`へ生データを事前配置する運用が
  引き続き必要（STEP2で設計したSource Adapter方式により、将来ネットワーク
  アクセスが可能になった際に、この部分だけを差し替え可能）。
- Base Ability用データ生成・Suitability用データ生成（derived層）— 今回は
  接続していない（明示的にスコープ外）。
- 当日条件取得（天候・馬場・オッズ等）— スコープ外。
- Gate30の既存10レース・追加20レースそのものへの本格適用（全件実行はSTOP指示）。
- B分類41頭を含む「全runner」規模でのprior history自動取得の実績確認 —
  V0では5レース・75頭規模のBatch Testのみ実施（9節）。

## 4. 使用したdata source

| データ | 使用したsource | 備考 |
|---|---|---|
| レース情報・出走馬（target race） | `ManualRawFileProvider`（`src/collector/data/raw/`配下の事前配置JSON） | 生データそのものはライブ取得していない（12節） |
| Prior History | `ProductionHistoryProvider`（既存`getHorseRecentRaces()`のREAD-ONLY再利用） | **STEP1監査の指示通り、既存の取得経路（過去の`import:csv`で実際に取り込まれた実データ）を新規実装せず再利用した** |

**STEP1監査（現在のデータ取得経路の完全監査）**: コードベース全体
（`src/`・`scripts/`）を`fetch(`・`axios`・`cheerio`・`puppeteer`・
`playwright`・`node-fetch`等で検索した結果、**ネットワーク越しにデータを
取得するコードは一件も存在しなかった。** `package.json`の依存関係にも
HTTPクライアント・スクレイピングライブラリは含まれていない。既存の
データ取得経路はすべて`scripts/importRacePerformancesCsv.ts`等の
**ローカルCSVファイルを読み込むだけの手動インポートスクリプト**であり、
`README.md`（`src/ability/data/gateValidation/`）にも過去のすべての
Gate Validationデータセットが「ユーザー提供ZIP」由来であることが
明記されている。JRA-VAN DataLab等の公式APIとの接続実績も無い。

## 5. Collector Architecture

```
collectRace(targetRaceId)
  │
  ├─ 1. ManualRawFileProvider.fetchRace(raceId)
  │      → RawRaceBundle | null（無ければ即FAIL、推測補完なし）
  │
  ├─ 2. normalizeRaceBundle(raw) → CollectedRunnerRow[]
  ├─ 3. validateNormalizedRunners(rows) → { ok, errors, warnings }
  │
  ├─ 4. runners.map(r => fetchPriorHistoryFromProduction(r.horseId, ...))
  │      → PriorHistoryEntry[]（available/unavailableを明示）
  │
  ├─ 5. auditFutureLeakage(raceDate, priorHistories)
  │      → { ok, checkedRowCount, violations }
  │      violations.length > 0 なら status: "FAIL"
  │
  └─ 6. writeNormalizedCache(...) → { wasCached, writtenPath }
         （冪等・重複防止）
```

**Source Adapter方式**（STEP2）: `RaceDataProvider`インターフェース
（`src/collector/providers/RaceDataProvider.ts`）を切り出し、
`ManualRawFileProvider`はその1実装に過ぎない設計にした。将来、外部
ネットワークアクセスが可能な環境で`NetkeibaLiveProvider`等を追加する場合、
`collectRace()`の呼び出し側でProviderを差し替えるだけで済む（過剰設計を
避けるため、Provider登録レジストリ・複数Provider自動フォールバック等は
V0では実装していない——1 Provider構成で十分なため）。

## 6. raw / normalized / derivedの構造

| 層 | 実装状況 | 保存場所 |
|---|---|---|
| **raw** | 実装済み。取得元から取得した原データ（`RawRaceBundle`型） | `src/collector/data/raw/<raceId>.json` |
| **normalized** | 実装済み。既存Gate Race CSV契約と同一項目名の共通フォーマット（`CollectedRunnerRow[]`）＋prior history | `src/collector/data/normalized/<raceId>.json` |
| **derived** | **未接続（明示的にスコープ外）。** Base Ability等の計算で使う派生データへの変換は行っていない | (未実装) |

いずれも`src/ability/`配下のproduction Ability計算とは物理的に独立した
ディレクトリ（`src/collector/data/`）に置かれており、
`horseAbilityData.ts`のproduction glob（`./data/horses/*.json`）の
走査対象外である（`src/ability/data/gateValidation/`と同じ分離思想）。

## 7. Future Leakage Guard

`auditFutureLeakage(targetRaceDateIso, priorHistories)`は、
`Date.parse(race.raceDate) >= targetMs`（対象レース日付**以上**、同日を
含む）を1件でも検出した場合、`ok: false`を返す。`collectRace()`側は
これを見て**Collector Run全体のstatusを"FAIL"にする**（warningではない）。
単体テストで以下を確認済み:

- 対象レースより後の日付のprior historyが1件 → `ok: false`（FAIL）
- 対象レースと**同日**のprior history → `ok: false`（FAIL、`>=`判定）
- すべて対象レースより前 → `ok: true`

## 8. Smoke Test結果

**対象**: `JRA-20230507-NIIGATA-11`（2023年新潟大賞典、16頭、既存の凍結済み
実データ）を使用。

**比較結果**:

| 項目 | 自動Collector | 既存Frozen Data | 一致 |
|---|---|---|---|
| race identity（raceId/racecourse/surface/distance） | 一致 | 一致 | ✓ |
| runner count | 16 | 16 | ✓ |
| horse identity（horseId） | 16件一致 | 16件一致 | ✓ |
| finishPosition | 全16頭一致 | 全16頭一致 | ✓ |
| carriedWeightKg | 全16頭一致 | 全16頭一致 | ✓ |
| actualRaceTimeSeconds | 全16頭一致 | 全16頭一致 | ✓ |
| prior history | 0/16 available | (該当データセット無し) | 期待通り（下記参照） |
| race date | 2023-05-07 | 2023-05-07 | ✓ |
| future leakage | ok=true, violations=0 | — | ✓ |

差分は検出されなかった（自動テスト`collectRace.test.ts`で機械的に
再検証済み）。prior historyが0/16なのは、2023年のこのレースの出走馬が
production `data/horses/`側のAbility Controlled対象（10/153、6.5%）に
含まれていないためであり、**バグではなく既知の実データ状況と整合する
正しい挙動**（`docs/gate30-phase1-basic-data-completion-audit.md`5節と
数値上も整合）。

## 9. Batch Test結果

**対象**: 既存10レースのうち5レース（Smoke Test対象＋Ability Controlled
出走馬を含む4レース: JRA-20250517/20250831/20240505/20240901-NIIGATA-11）、
計75頭。

| raceId | runners | status | priorHistory available | leakage violations | validation warnings |
|---|---|---|---|---|---|
| JRA-20230507-NIIGATA-11 | 16 | OK | 0/16 | 0 | 0 |
| JRA-20250517-NIIGATA-11 | 16 | OK | 1/16 | 0 | 0 |
| JRA-20250831-NIIGATA-11 | 16 | OK | 2/16 | 0 | 1（出走取消馬のhorseNumber>fieldSize、既知パターン） |
| JRA-20240505-NIIGATA-11 | 16 | OK | 5/16 | 0 | 0 |
| JRA-20240901-NIIGATA-11 | 11 | OK | 2/11 | 0 | 1（同上） |

- **成功率**: 5/5（100%）
- **欠損率**: prior history available合計10/75（13.3%）——既存の
  Ability Control coverage（6.5%、全153行ベース）と別集計ではあるが、
  同じ根本原因（`runner_prior_history.csv`未収集）に起因する低い値であり、
  想定と整合。
- **取得時間**: 1レースあたり約1.5秒（内訳の大半はvite-nodeの起動
  オーバーヘッドであり、Collectorの処理自体はミリ秒オーダー）
- **source failure**: 0件（rawファイルはすべて存在する状態でテストしたため）
- **Future Leakage**: 5レースとも0件（違反なし）
- **重複**: 5レース全件を2回ずつ実行し、`src/collector/data/normalized/`の
  ファイル数が5のまま増えないことを確認（重複ファイル生成なし）
- **再実行結果**: 2回目の実行は全レースで`wasCached: true`（内容が同一の
  ため書き込みスキップ）、normalized出力（`runners`配列）は1回目と
  完全に同一（`toEqual`で一致確認）

30レース全件実行はまだ行っていない（STOP指示に従う）。

## 10. Gate30を自動収集できる見込み

**「正規化・検証・Future Leakage監査・Provenance・冪等保存」の部分は
高い見込みで再利用可能。** ただしこれは「生データが既に手元にある場合」に
限られる。**追加20レースの生データそのものを自動取得できる見込みは、
現状のセッション環境では実質ゼロ**（12節）。ChatGPT側が生データを
`RawRaceBundle`形式のJSONとして提供できれば、そこから先はこのCollectorで
完全自動化できる——つまり、既存のZIP/CSVによる手渡しを、
「`RawRaceBundle`形式のJSON手渡し＋自動パイプライン」に置き換えることは
今すぐ可能である（次善の運用改善として8-12節・14節で提案）。

## 11. 毎週の実戦レースへ再利用できる見込み

10節と同じ制約が適用される。**「レース情報・出走馬・過去走の自動収集
基盤」という設計自体は、対象がGate30の過去レースであっても毎週の
実戦レースであっても同一のコードで動作する**（`collectRace(targetRaceId)`
の呼び出し1つで完結、V0の設計目標通り）。ただし生データの供給経路が
外部ネットワークアクセスに依存する限り、「対象レース自動検出」
（最終システムのSTEP1）や「レース情報の自動取得」（同STEP2）は、
このセッション環境内では実現できない。

## 12. 技術的ブロッカー

**このClaude Code on the web環境のネットワークegressポリシーが、
外部Webサイトへのアクセスを一律ブロックしている。** 2026-09-03に
以下を実機確認した（STEP1監査の一部として実施、認証突破・アクセス
制限回避は一切試みていない）:

| 確認対象 | 結果 |
|---|---|
| `curl https://db.netkeiba.com/robots.txt`（プロキシ経由） | `CONNECT tunnel failed, response 403` |
| WebFetch `https://db.netkeiba.com/robots.txt` | `EGRESS_BLOCKED` |
| WebFetch `https://www.jra.go.jp/robots.txt` | `EGRESS_BLOCKED` |
| WebFetch `https://example.com`（一般ドメインでの疎通確認） | `EGRESS_BLOCKED` |

`example.com`という完全に無害な汎用ドメインでもブロックされたことから、
これは特定サイトへのアクセス制限ではなく、**この環境のネットワーク
ポリシーがnpm/pypi等の一部パッケージレジストリとAnthropic自身のAPIを
除く、一般的な外部Webアクセスを構造的に許可していない**ことを意味する
（`$HTTPS_PROXY/__agentproxy/status`の`noProxy`許可リストにも
netkeiba・JRA関連ドメインは含まれていない）。

この制約は、Claude Codeのコード実装能力の問題ではなく、**この
リモート実行環境固有のネットワーク設定**によるものである。異なる
ネットワークポリシーを持つ環境（例: 外部アクセスを許可したCI環境、
ローカル実行環境）であれば、同じ`RaceDataProvider`インターフェースを
実装した別のProviderを追加することで、ライブ取得は技術的に可能と
考えられる。

## 13. 外部データソース上の制約

12節のネットワークブロックにより、netkeiba・JRA公式サイトの
利用規約・スクレイピング可否そのものを本ラウンドでは調査できていない
（robots.txtの内容すら取得できなかった）。将来、ネットワークアクセスが
可能な環境でライブProviderを実装する際は、以下を事前に確認する必要がある
（今回は未着手、次のCHECKPOINT候補）:

- 対象サイトのrobots.txt・利用規約における自動アクセスの可否
- アクセス頻度・レート制限の有無
- JRA-VAN DataLab等、公式・許諾された有料APIの利用可否（ユーザーが
  契約している場合、これがrobots.txt上の懸念を回避する最も確実な経路になる
  可能性がある——`docs/step6-decisions.md`1-4節で既に「別STEPで検証を
  予定」と記載されている項目）
- 認証突破・アクセス制限回避は行わない（ユーザー絶対条件、今回も
  一切試みていない）

## 14. 次に進むべきCHECKPOINT（提案、優先順位付き）

1. **`RawRaceBundle`形式JSONでのデータ授受への移行**: 今後ChatGPT側が
   ZIP/CSVの代わりに`RawRaceBundle`形式のJSONを`src/collector/data/raw/`へ
   提供する運用に切り替えることで、正規化・検証・Future Leakage監査・
   Provenance記録を即座に自動化できる。次回のGate30データ収集（追加20
   レース分）から、この形式での提供を試験導入することを提案する。
2. **JRA-VAN DataLab等の公式API利用可否の調査**: ネットワークブロックを
   回避する手段としてではなく、そもそも合法的・許諾された取得経路として
   検討する価値がある（ユーザー・ChatGPT側での契約状況次第）。
3. **ネットワークアクセスが可能な別環境でのライブProvider試作**: この
   セッション環境の制約を前提に、別環境（CI等）での実現可能性を
   別途検証する。
4. **derived層（Base Ability用データ生成）への接続検討**: production
   Ability計算とどう安全に接続するか（Isolation Architectureを維持した
   まま）は、V0が安定した後の課題として設計のみ先行させる余地がある。

---

## Regression

`git status --short`で確認: 新規追加は以下のみ。

```
M  package.json（"collect:race"スクリプト追加のみ）
?? scripts/collectRace.ts
?? src/collector/（types.ts, normalize.ts, leakageGuard.ts, cache.ts,
   collectRace.ts, providers/, __tests__/, data/raw/, data/normalized/）
```

`src/ability/`・`data/horses/`・既存のBase Ability V1・Suitability V1・
memberLevel・final3F・finalRaceAbility・Plackett-Luce・Temperature・
勝率計算・EV計算・各種weight/parameter・production prediction logicは
**一切変更していない**。

```
npm test            → Test Files 76 passed / Tests 800 passed
                       （既存787 + Collector新規13、すべてPASS）
npm run lint         → PASS（警告なし）
npm run build        → PASS
npm run validate:data → 検証成功（既存warningのみ、新規warningなし）
```

追加した自動テスト（`src/collector/__tests__/collectRace.test.ts`、13件）:
正常取得／data source not found／Future Leakage FAIL（未来・同日の2パターン）
／正常ケースでのleakage ok/true／Missing Data明示／Idempotency・重複防止／
normalization（正常・horseId重複・horseNumber重複・finishPosition欠損）／
Source Provenance／デフォルトraw pathの実在確認。

---

以上、V0の範囲でSTOPします。30レース全件収集・derived層接続・
毎週の実戦レースへの適用は、いずれも今回は着手していません。

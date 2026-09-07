# CHECKPOINT14A.3 — 新潟記念 Position Data Enrichment Import / Readiness Audit

CHECKPOINT14A.2で完成したNon-destructive Enrichment Mergeの正式経路を使い、ChatGPT作成の
新潟記念11頭Position Data ZIPを検証・投入した。Running Style/Pace/Position Prediction本体は
実装していない。

## 1. ZIP Integrity

`niigata_kinen_2026_cp14a2_position_enrichment_v1.zip`を展開し、`race_performances.csv`
（54行、ヘッダ含め55行）を確認した。ChatGPT側の事前検査値をClaude側で独立に再検証した結果：

| 項目 | ChatGPT申告値 | Claude独立確認値 | 一致 |
|---|---|---|---|
| rows | 54 | 54 | ✅ |
| horses | 11 | 11 | ✅ |
| unique races | 49 | 49 | ✅ |
| passingPosition missing | 0 | 0（全行に値あり） | ✅ |
| fieldSize missing | 0 | 0（全行に値あり） | ✅ |
| duplicate horseId+raceId | 0 | 0 | ✅ |
| 馬別内訳（10頭×5走＋ロデオドライブ×4走） | — | 完全一致（Pythonで再集計） | ✅ |

**1点、事前検査値には含まれていなかった重大な問題を発見した**（2節で詳述）。

## 2. Dry Run Result

**ZIPのCSVをそのまま既存の`npm run import:csv -- <file> --dry-run`へ通したところ、
54行全てが「除外データ件数（欠損のため能力計算対象外）」となり、対象馬0頭・
enrichment候補0件という結果になった。**

原因: CSVのヘッダ名が、CHECKPOINT14A.2で文書化したCSV取り込み契約
（`docs/data-input-guide.md`／CHECKPOINT14A.2報告書8節）と一致していなかった。

| CSVの列名 | 契約上の正しい列名 |
|---|---|
| `timeGap` | `timeGapSeconds` |
| `raceTime` | `actualRaceTimeSeconds` |
| `final3F` | `final3FSeconds` |
| `carriedWeight` | `carriedWeightKg` |

（`raceId, raceName, raceDate, racecourse, raceNumber, surface, distance, going, horseId,
horseName, gate, horseNumber, fieldSize, finishPosition, passingPosition, source,
sourceRaceId, sourceHorseId, dataKind`は契約と一致していた）

この4列は、`data/horses/<horseId>.json`内で実際に使われている計算後の`RacePerformance`型の
フィールド名（`raceTime`／`final3F`／`timeGap`／`carriedWeight`）と一致しており、ChatGPT側が
「3節（Core値の完全一致確認）」のために参照したcanonical recordのフィールド名を、
CSV取り込み専用の`RacePerformanceInput`型のフィールド名（`actualRaceTimeSeconds`等）と
取り違えたことが原因と判断した（値そのものは正しく、名前だけが違う）。

**空欄（欠損許容）として扱われるため、normalizeはエラーを出さずに全行を静かに除外していた
（正常なフィールド名不一致検出の仕組みが無いため、これ自体もCHECKPOINT14A.2以降の
既知の改善余地として12節に記録する）。**

このため、**CSVをそのまま自動Importすることはしなかった**（2節の「core field conflictが
1件でもあれば自動Importせず詳細を報告」という指示の精神を、この種の構造的な列名不一致にも
適用した）。

代わりに、production dataとは無関係な一時ディレクトリ上でのみ、上記4列のヘッダ名を
契約どおりに補正した診断用コピーを作成し（**値は一切変更していない、ヘッダ名のみの機械的な
リネーム**）、再度dry-runを実行して確認した：

```
rows parsed: 54
new race records: 0
exact duplicates: 0
enrichment candidates（record数）: 54
enriched fields（延べfield数）: 108
conflicts: 0
errors: 0
```

ChatGPT申告値・Claude独立再集計値と完全に一致し、**core field conflict・enrichment
conflictとも0件**であることを確認した。

## 3. Import Result

上記の診断確認（ヘッダ名補正後のdry-runが完全にcleanであること、対象4列以外は一切変更が
無いことをヘッダ差分で直接確認済み）を踏まえ、ヘッダ名を契約どおりに補正したCSVを使い、
`npm run import:csv`（`--dry-run`無し）で正式にimportした。

- 変更されたファイル: `src/ability/data/horses/`配下11ファイル（対象11頭と完全一致）。
- `git diff`で全11ファイルを確認し、**削除された行は`fieldSize`（null→値）と
  `importedAt`（タイムスタンプ更新）のみ**であることを確認した。`raceTime`・
  `finishPosition`・`carriedWeight`・`gate`・`horseNumber`・`source`・`sourceRaceId`・
  `sourceHorseId`・`dataKind`等のcore field・既存metadataは1バイトも変化していない。
- 新規追加された行は、`fieldSize`（数値）と`passingPosition`（`cornerPositions`・
  `fieldSize`・`source`・`isReliable`）オブジェクトのみ。

## 4. Core Conflict Audit

3節のヘッダ名不一致問題を除き、passingPosition/fieldSize以外の既存値
（raceId/raceDate/racecourse/distance/going/finishPosition/timeGap/raceTime/final3F/
carriedWeight/gate/horseNumber）について、**54行全てでcanonical recordと完全一致**して
いたことを、`mergeHorseRaceHistory()`のcore field比較（1件でも異なればconflict化する
既存ロジック、無変更）を通して確認した。conflict 0件。silent overwriteは発生していない
（`git diff`で直接確認済み）。

## 5. Position Coverage

Import後、新潟記念11頭それぞれの直近最大5走を対象に実測した（`getHorseRecentRaces()`
経由の本番経路）。

| 馬名 | recentRaceCount | passingPositionPopulatedCount | fieldSizePopulatedCount | bothPopulatedCount | positionDataCoverage |
|---|---|---|---|---|---|
| アーバンシック | 5 | 5 | 5 | 5 | 5/5 |
| サヴォーナ | 5 | 5 | 5 | 5 | 5/5 |
| ジュンブロッサム | 5 | 5 | 5 | 5 | 5/5 |
| ステレンボッシュ | 5 | 5 | 5 | 5 | 5/5 |
| ゾロアストロ | 5 | 5 | 5 | 5 | 5/5 |
| ダノンシーマ | 5 | 5 | 5 | 5 | 5/5 |
| チェルヴィニア | 5 | 5 | 5 | 5 | 5/5 |
| ドゥレッツァ | 5 | 5 | 5 | 5 | 5/5 |
| バレエマスター | 5 | 5 | 5 | 5 | 5/5 |
| ボーンディスウェイ | 5 | 5 | 5 | 5 | 5/5 |
| ロデオドライブ | 4 | 4 | 4 | 4 | 4/4 |

**合計 54/54（100%）both populated。** 目標に無理に合わせたのではなく、ChatGPT側のZIPが
最初から11頭の直近走を漏れなく対象にしていたため、結果として100%になった。

## 6. passingPosition Parsing

実データの`cornerPositions`長の分布（54行）: 2コーナー14件・3コーナー11件・4コーナー29件。
malformed（非数値・0以下・区切り文字違い）は**0件**。

実例（実際にimportされた値）:
- `9-10-8-8`（アーバンシック、中京、4コーナー） → `[9, 10, 8, 8]`
- `14-14`（ジュンブロッサム、新潟、2コーナー） → `[14, 14]`（存在しない3・4コーナーを
  補完せず、記録された2件のみで保持されていることを`git diff`で直接確認した）
- `12-11-11`（アーバンシック、東京、3コーナー） → `[12, 11, 11]`

新潟のような2コーナーコースを含め、存在しないコーナーの補完は一切発生していない。

## 7. Position relative normalization readiness

`passingPosition.cornerPositions`と`passingPosition.fieldSize`（＝`RacePerformance.fieldSize`
と同値）が両方揃ったことで、各走について相対位置への変換に必要な生データが出揃った
ことを確認した（正式な`normalizedPosition`ロジックはまだ実装しない、監査のみ）。

実例: ジュンブロッサムの2走「`11-13`（fieldSize=18の東京）」と「`12-11`（fieldSize=14の
東京）」は、いずれも絶対位置は11〜13番手台だが、頭数が異なるため本来同じ「4番手」等として
一括りにできない例に相当する。`position / fieldSize`のような比率変換を行えば、
`13/18 ≈ 0.72`と`11/14 ≈ 0.79`のように、頭数の違いを踏まえた相対的な位置の近さ・遠さを
区別できる状態になっている（CHECKPOINT14A提示の正規化候補の1つ、数式はまだ確定しない）。

## 8. Historical Position Profile Readiness

11頭全馬について、以下の判定結果とした。

| 馬名 | 判定 | 根拠 |
|---|---|---|
| アーバンシック | **READY** | 5/5 both populated |
| サヴォーナ | **READY** | 5/5 both populated |
| ジュンブロッサム | **READY** | 5/5 both populated |
| ステレンボッシュ | **READY** | 5/5 both populated |
| ゾロアストロ | **READY** | 5/5 both populated |
| ダノンシーマ | **READY** | 5/5 both populated |
| チェルヴィニア | **READY** | 5/5 both populated |
| ドゥレッツァ | **READY** | 5/5 both populated |
| バレエマスター | **READY** | 5/5 both populated |
| ボーンディスウェイ | **READY** | 5/5 both populated |
| ロデオドライブ | **READY（Short Career前提）** | 4/4 both populated（9節参照、5走目は要求していない） |

既存の`computePassingPositionRunningStyle()`（CHECKPOINT14A.1で監査済み、無変更）を
実際に11頭全馬へ適用したところ、**全馬でconfidence="high"（サンプル4〜5走）となり、
これまで常にnullだった`passingPositionRunningStyle`が初めて実際の値を返すようになった**
ことを確認した（final3Fプロキシによる旧`fallbackAutoRunningStyle`はconfidence常時
"low"のままで対照的）。position varianceの正式な算出ロジックは今回実装していないが、
`cornerPositions`が複数走ぶん揃ったことで、将来算出するためのraw dataは揃っている。

## 9. Rodeo Drive

キャリア4走（Short Career Eligibility V1で既に`shortCareer=true`・`historyConfidence=
medium`として確定済み、CHECKPOINT13.4G/13.4J）。今回のPosition Data enrichmentで
**4走すべてにpassingPosition/fieldSizeが揃った（4/4）**ことを確認した。5走目は要求して
いない。Historical Position Profileについても、既存のShort Career Evidence V1と同じ
「キャリア全体を把握済みの短キャリア馬」という扱いを踏襲し、4走ベースで
**READY（Short Careerとして利用可能）**と判定する。`computePassingPositionRunningStyle()`
の実行結果は`dominant=senko, confidence=high, sampleCount=4`であり、баseConfidence判定
（4走以上→high）とも整合している。

## 10. Base Ability Regression

- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、`abilityModelV1.
  frozenBenchmark.test.ts` 3 tests pass）。
- **Production**: シェイクユアハート baseAbility = **70.9**（無変更）。
- **新潟記念11頭**（enrichment前後）: 全馬、CHECKPOINT14A/14A.2で確認済みの値と完全一致
  （アーバンシック72.1・サヴォーナ70.2・ジュンブロッサム72.7・ステレンボッシュ69.4・
  ゾロアストロ74.8・ダノンシーマ78.3・チェルヴィニア69.1・ドゥレッツァ67.4・
  バレエマスター72.3・ボーンディスウェイ73.1・ロデオドライブ76.7）。**1頭も変化していない。**

## 11. Suitability Regression

`src/ability/suitabilityV1.ts`・`goingSuitability.ts`・`courseContextPrior.ts`等は
本ラウンドで一切変更していない。passingPosition/fieldSizeをSuitabilityへ接続する処理も
追加していない。既存テスト無回帰。

## 12. Formal Snapshot Regression

`src/ability/predictionSnapshot.ts`・`formalPredictionSnapshot.ts`・
`predictionSnapshotStore.ts`は本ラウンドで一切変更していない。過去に保存済みの
Formal Snapshotは今回のimportでは1件も存在しない（CHECKPOINT13.5B完了時点で
`src/ability/data/predictionSnapshots/`はまだ空）ため、書き換えの心配自体が
発生していない。将来Snapshotが保存された後にposition dataをenrichmentした場合でも、
Snapshot自体は生成時点の値を固定保存する設計（CHECKPOINT13.5B）のため、影響しない設計に
なっている。

## 13. Tests / Regression Summary

- `npx tsc -b`: エラーなし。
- `npm test`: **701 / 701 pass**（コード変更を伴わないラウンドのため新規テスト無し、
  CHECKPOINT14A.2までの既存701件が無回帰）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告は無関係の既存事項。
- `git diff --stat -- src/ability/data/horses/`: 11ファイル変更、削除された行は
  `fieldSize`・`importedAt`のみであることを確認済み。

## 14. 判定

**A**。

11頭すべてでHistorical Position Profile V1実装（14B相当）へ進めるだけのデータが揃った
（54/54 both populated、malformed 0件、Base Ability/Suitability/Formal Snapshotへの
regressionなし）。

無理にA判定にしていない根拠として明記する: 2節で見つけたCSVヘッダ名不一致は、
ZIPをそのまま自動Importすれば**サイレントに全行が除外される**という、見過ごせば
気づかれない可能性がある問題だった。これを検出し、**production dataには一切触れない
診断用コピーで内容が完全にcleanであることを機械的に検証してから**、ヘッダ名のみを
契約どおりに補正して正式にimportした。値そのものは一切変更しておらず、`git diff`で
core fieldの無変更を直接確認済みである。この手順を経ずに「ChatGPT申告値と一致したから」
だけでA判定にはしていない。

## 15. 次にChatGPTと決める必要がある項目（優先順位順）

1. **CSV取り込み契約のフィールド名を、将来的にcanonical `RacePerformance`のフィールド名
   （`raceTime`/`final3F`/`timeGap`/`carriedWeight`）にも対応させるか**（2節の根本原因）。
   今回はヘッダ名を機械的に補正して対応したが、今後も同種のズレが起きうる。normalize.tsに
   フィールド名のエイリアス対応を追加する、またはZIP作成手順書を更新してCSV取り込み専用の
   フィールド名（`actualRaceTimeSeconds`等）を明記する、のいずれかの方針が必要。
2. **正規化位置（normalizedPosition）ロジックの数式確定**: 7節で示した生データは揃ったが、
   数式自体（`position/fieldSize`かfront percentile方式か等、CHECKPOINT14A6節で提示した
   複数案）はまだ未確定。
3. **position varianceの算出ロジック新設**: 8節で指摘した通り、raw dataは揃ったが
   variance自体を計算するコードはまだ無い。
4. **CHECKPOINT14B（Position Profile V1）着手の可否**: 本ラウンドでデータ面の準備が
   揃ったため、着手判断を仰ぐタイミング。

以上、CHECKPOINT14A.3完了。CHECKPOINT14Bへは進まず、ここでSTOPする。

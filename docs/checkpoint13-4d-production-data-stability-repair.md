# CHECKPOINT13.4D: Production Data Stability Repair V1 完了報告

日付: 2026-08-24

CHECKPOINT13.4Cの原因監査で確定した3つの基盤問題を修正した実装フェーズ。**Base Ability V1の数式・重み・algorithmは一切変更していない。**

---

## 1. Model Freeze / Dataset Freeze の分離

新規モジュール `src/ability/datasetVersion.ts` を追加（追加のみ、既存ファイル無変更）:

- `MODEL_VERSION = "BA-V1"`: formula/weights/algorithmを指す識別子。式を変更する時だけ更新する。
- `computeDatasetVersionInfo(rawByHorseId)`: 現在のdata/horses全体から`datasetFingerprint`（FNV-1a、暗号学的ハッシュではなく「1件でも変われば値が変わる」ことだけを保証する簡易チェックサム）・`horseCount`・`totalRaceCount`・`maxRaceDate`を算出する。
- `horseAbilityData.ts`に`getProductionDatasetVersionInfo()`を追加（既存の`historyByHorseId`計算・エクスポートは無変更）。

これにより、「同じBA-V1でもDataset Xでは70.3、Dataset Yでは70.9」という事実を、値だけでなく`datasetFingerprint`という形で明示的に追跡できるようにした。

## 2. Frozen Benchmark（CP12.6再現）

新規ファイル `src/ability/__tests__/fixtures/benchmark-dataset-cp12_6.json` を追加。commit `2f3c9a4`（CP13.4A・Data Package Contract確定時点、CP12.6の値をそのまま再現していたデータ状態）のdata/horses全40ファイル・courseTimeBaselines・courseFinal3FBaselines・raceFieldAggregatesを丸ごと凍結したスナップショット。

新規テストファイル `src/ability/__tests__/abilityModelV1.frozenBenchmark.test.ts` がこのfixtureのみを使い、`buildRaceHistory()`を直接呼んで検証する（本番`data/horses`を一切読まない）。

**結果: PASS。シェイクユアハートのbaseAbility=70.3を完全に再現した。** 直近5走のraceScore/memberLevelScoreAtRaceも全て一致（13.4Cの3節の値と同一）。このテストは今後、本番data/horsesがどれだけ増減しても変化しない。

## 3. Identity Fix（horseIdAliasesByName）

`scripts/importRacePerformancesCsv.ts`を修正:

- ロースター馬名エイリアス機構（`buildHorseIdAliasesByName`）を**デフォルトOFF**に変更。
- 新規CLIフラグ`--alias-roster-names`を追加。付けた場合のみ、従来通りロースター16頭の馬名一致でcanonical horseIdへ差し替える（対象馬自身の外部ID体系CSVを既存プロフィールへ接続する、本来の用途に限定）。
- デフォルト（フラグ無し）では、CSVのhorseId列がそのままcanonical horseIdとして使われる。

`src/ability/import/buildImportResult.ts`・`src/ability/import/horseIdAliases.ts`自体は変更していない（元々`options.horseIdAliasesByName`が空なら何もしない、正しく汎用的な設計だったため。問題はCLIスクリプトが常に全16頭分のエイリアスを無条件構築していた点のみ）。

これにより、優先順位は実質的に：
1. canonical horseId（CSVのhorseId列、デフォルトでそのまま採用）
2. sourceHorseId（後述4節・9節のRunner Resolver側で自動対応）
3. explicit alias mapping（`--alias-roster-names`、明示的opt-inのみ）
4. horseName exact match fallback（Runner ResolverのPriority 3、読み取り専用・書き込みには使わない）

という設計に修正された。

## 4. 34-row Restore

### Dry Run

元ZIP（`niigata_kinen_2026_cp13_4_data_v1.zip`）が`/root/.claude/uploads/`に現存していることを確認し、再取得した（`NEED_REATTACH_DATA_PACKAGE`は不要だった）。CHECKPOINT13.4Cで特定した34行（ロースター11頭名衝突により除外されていた行）だけを抽出したCSV（`restore_34_rows.csv`）を作成し、修正済みインポーター（エイリアスOFF）でDry Run:

```
読み込み件数: 34 / 正常データ件数: 34 / 除外: 0 / エラー: 0
対象馬: 11頭（実numeric horseId、ロースターのcanonical horseIdとは別）
既存: 0走（duplicateなし）/ 新規追加: 34走（4+5+2+3+5+5+2+2+1+1+4）
conflict: 0件
```

### 実Import結果

Dry Runと完全一致。**11件の新規canonical horseIdファイルを作成**（`2017104756.json`等）。既存の11個のロースター（プレースホルダー）ファイルは一切触れていない — 完全に別の識別子として安全に共存する。

### Added / Ignored / Conflicts

- Added: 34行（前記11ファイル）
- Ignored（duplicate）: 0件（この34行に限れば、既存ファイルが元々存在しなかったため）
- Conflicts: 0件

## 5. RaceField Integrity（復元前後比較）

49レース全件について、`data/horses/`実データを実際に横断集計して比較（CSVの行数ではなく、canonical fileベースで検証）:

| 指標 | 復元前 | 復元後 |
|---|---|---|
| winnerPresent=false のレース数 | 3（函館記念・阪神大賞典・新潟大賞典） | **0** |
| 49レース合計fieldSize | 671 | 705（+34） |
| fieldSizeが変化したレース数 | — | 21レース |

変化したレース一覧（抜粋、全21件は復元によるfieldSize増加のみ、減少は無し）:

```
JRA-20240714-HAKODATE-11（函館記念）: 13→16、winnerPresent False→True
JRA-20260322-HANSHIN-11（阪神大賞典）: 9→10、winnerPresent False→True
JRA-20260516-NIIGATA-11（新潟大賞典）: 12→13、winnerPresent False→True
（他18レースはwinnerPresentは元々True、fieldSizeのみ+1〜+4増加）
```

**34行全てがraceField比較母集団へ正しく反映され、母集団がより完全になったことを確認した。**

## 6. Runner Resolver: ID-first対応

`src/ability/import/canonicalHorseRegistry.ts`に`buildSourceHorseIdRegistry()`を追加:

- `data/horses/`の実データ（各馬の各走に記録された`sourceHorseId`）から、`sourceHorseId → canonicalHorseId`の対応表を自動構築する。
- ある馬の全走で**一貫して同一の**sourceHorseIdが記録されている場合のみ登録する（走ごとに値が食い違う・記録が無い場合は登録しない＝安全側）。
- 手作業のハードコードは行っていない。

`src/ability/import/provisionalRunnerDiagnostic.ts`の`runProvisionalDiagnostic()`を修正し、`options.sourceHorseIdRegistry`省略時はこの自動構築registryを使うようにした（明示的に`{}`を渡せば、従来の「実データ対応表が無ければPriority 2を発火させない」挙動も再現可能、後方互換テストで確認済み）。

**Resolver Registry自体（canonicalHorseIds集合）は元々ロースター限定ではなく、data/horses全体を対象にしていた**（`buildCanonicalHorseRegistry()`が`getAllCanonicalHorseIds()`を使う設計、CHECKPOINT13.2Bから変更なし）。dataKindロールアップも同様に全馬対象（placeholder/fixtureはresolveできてもpredictionEligible=falseを維持する既存ロジックは無変更）。今回のギャップは実質的にPriority 2（sourceHorseId）が発火する材料が無かった点のみであり、そこを埋めた。

## 7. 新潟記念11頭 再Resolve

`npm run provisional:check`を再実行した結果:

```
Resolved:        11 / 11
Unresolved:       0 / 11
Ambiguous:        0 / 11
Prediction eligible: 7 / 11
```

CHECKPOINT13.3/13.4Bの0/11/11/0/0から大幅に改善。

## 8. 新潟記念11頭 Base Ability（診断値、PROVISIONAL DIAGNOSTIC）

正式経路（`data/horses`全体→`buildRaceHistory()`→`raceScore`→`baseAbility`、Runner Resolverでresolvedしたcanonical horseId経由）から算出:

| 馬名 | canonicalHorseId | baseAbility | predictionEligible | 理由（ineligibleの場合） |
|---|---|---|---|---|
| アーバンシック | 2021105436 | 71.9 | true | — |
| サヴォーナ | 2020100734 | 69.9 | true | — |
| ジュンブロッサム | 2019105118 | 72.7 | true | — |
| ステレンボッシュ | 2021105743 | 69.3 | true | — |
| ゾロアストロ | 2023106850 | 74.4 | **false** | memberLevelUnavailable |
| ダノンシーマ | 2022104645 | 77.1 | **false** | memberLevelUnavailable |
| チェルヴィニア | 2021105643 | 69.0 | true | — |
| ドゥレッツァ | 2020103650 | 66.0 | **false** | memberLevelUnavailable |
| バレエマスター | 2019104850 | 72.2 | true | — |
| ボーンディスウェイ | 2019104658 | 73.1 | true | — |
| ロデオドライブ | 2023107166 | 76.7 | **false** | insufficientRecentHistory, memberLevelUnavailable |

（金鯱賞の実データ追加等により、CHECKPOINT13.4Bで報告した診断値からわずかに変化した馬がいる。これはCHECKPOINT13.4Cで確認済みのBase Ability V1の設計通りの挙動であり、今回新たに発生した問題ではない。）

**これらは依然として診断値であり、正式Stage A Snapshotではない**（枠順・馬番・当日馬場・オッズは未確定のまま）。

## 9. ロデオドライブ: SPEC_DECISION_REQUIRED

ロデオドライブの実キャリアは今回も4走のまま（データ欠損ではないことを再確認）。`insufficientRecentHistory`フラグにより`predictionEligible=false`になっている。

**今回も5走minimumルールは変更していない。** CHECKPOINT13.4Bの結論と同じく、これは **SPEC_DECISION_REQUIRED**（DATA ISSUEではなくSPEC ISSUE）として報告する。真にキャリア4走の馬をどう扱うか（データ欠損と区別する新フラグを設ける等）は次回以降の判断事項。

## 10. memberLevel再監査（34行復元後）

11頭の直近走（baseAbility計算に使用された実際の走、合計54走）を再集計:

**実際計算=50走 / フォールバック=4走 / フォールバック率=7.4%**

CHECKPOINT13.4Bの7.4%から**変化なし**。34行の復元は、この11頭の各自の直近走に対しては影響しなかった（4走のフォールバックは各馬のキャリア最初期の走〈2歳新馬・2歳未勝利等〉に起因しており、今回復元した34行とは別のレースであるため）。

## 11. Production シェイクユアハート

```
productionBaseAbility: 70.9
modelVersion: BA-V1
datasetFingerprint: 447h-876r-e0d4c788
horseCount: 447
totalRaceCount: 876
maxRaceDate: 2026-08-08
```

**Benchmark（70.3、Dataset Freeze固定値）との違い: +0.6。** 理由はCHECKPOINT13.4Cで完全に特定済み（金鯱賞への直接データ追加＋宝塚記念/京都記念/中日新聞杯/アンドロメダへの間接波及、TYPE A、future leakageなし）。**70.3へ合わせようとする調整は一切行っていない。** 34行の復元・Identity修正はこの値に追加の影響を与えなかった（復元前後で70.9のまま不変。34行は彼女の5走の直接memberLevel候補プールには含まれないレースだったため）。

## 12. Dataset Version / Fingerprint 実装

1節参照。`src/ability/datasetVersion.ts`（新規、純粋関数・ブラウザ/Node双方で依存なく動作）と、`horseAbilityData.ts`への`getProductionDatasetVersionInfo()`追加（1行の新規export、既存コード無変更）。

## 13. Tests

- **Frozen Benchmark**（`abilityModelV1.frozenBenchmark.test.ts`）: PASS。70.3を完全再現。
- **Production Dataset**（`abilityModelV1.regression.test.ts`）: 70.3固定assertionを撤去し、`modelVersion`/`datasetFingerprint`付きで値を報告するのみに変更。PASS。
- **Full test suite**: **638 / 638 PASS**（lint: エラーなし、build: 成功）。
- **validate:data**: 検証成功（エラーなし）。函館記念・阪神大賞典・新潟大賞典の勝ち馬欠落警告は解消。他の警告（baseline未整備によるフォールバック等）は今回のスコープ外で無変化。
- **Suitability V1 regression**: full test suiteに含まれるSuitability関連テスト全件PASS（無変更ファイル、影響なし）。

以前（CHECKPOINT13.4Cの状態）は10件失敗していたが、今回の修正により全て解消した内訳:
- 9件: 70.3ハードコードリテラルを production-non-literal（正式経路との一致確認、または等価性確認）へ変更
- 1件: `memberLevelUnavailable`テストのSPARSE_HORSE_ID陳腐化を、現時点で条件を満たす別の実データ馬へ差し替え（コメントで陳腐化の経緯を明記）
- 3件（今回新規発生・即修正）: Runner Resolver ID-first対応により11頭がresolvedになったことで前提が変わった`provisionalRunnerDiagnostic.test.ts`の3テストを、新しい正しい状態（11/11 resolved、7/11 eligible）に更新

## 14. 判定

**A — Data/Identity stability修正完了。新潟記念11頭Base Abilityが正式経路で計算可能。枠順確定後Stage Aへ進める。**

根拠:
- Model Freeze（BA-V1数式）は完全に無変更のまま維持
- Dataset Freeze（CP12.6ベンチマーク70.3）を専用fixtureで恒久的に固定し、production datasetの増減から完全に独立させた
- Issue B（34行除外）を是正し、49レース全ての勝ち馬欠落を解消
- Issue C（Resolver SPEC ISSUE）を是正し、新潟記念11頭が実データ経路で100%resolveできるようになった
- 全638テストPASS、lint/build/validate:data全てクリーン
- Production Base Ability（70.9）はBenchmark（70.3）と意図的に分離され、両者の差異の理由（CHECKPOINT13.4Cのroot cause）は文書化済み

残る項目（B-SPEC相当、小さな仕様判断のみ）:
- ロデオドライブの4走キャリアと`insufficientRecentHistory`の扱い（9節、SPEC_DECISION_REQUIRED）
- 4頭（ゾロアストロ・ダノンシーマ・ドゥレッツァ・ロデオドライブ）のmemberLevelUnavailableは、当該馬の最初期走の対戦相手データがまだ不足していることが原因（新規データが得られれば解消しうる、DATA ISSUE）

無理にAを出したわけではない — 上記の通り、3つの基盤問題（A/B/C）はいずれも実装によって具体的に検証可能な形で解消されており、残るのは個別馬レベルの既知のデータ不足・仕様判断のみである。

## 15. 次にChatGPTと決める必要がある項目（優先順）

1. **ロデオドライブの「実キャリア4走」ケースの扱い**（9節）: `insufficientRecentHistory`と「データ欠損」を区別する新フラグを設けるか、5走ルールの意味論を明文化するか。
2. **`--alias-roster-names`フラグの運用ルール**: 今後、対象馬自身の外部ID体系CSVを取り込む場面（例: 新しいSapporo Kinenロースター馬の実データ化）で、いつ・誰がこのフラグを使うかの運用手順を文書化するか。
3. **ゾロアストロ・ダノンシーマ・ドゥレッツァの追加データ収集**: 各馬の最初期走（2歳戦等）の対戦相手データを追加すれば、memberLevelUnavailableが解消しうる。優先度は新潟記念の枠順確定タイミング次第。
4. **15頭のV0プレースホルダー馬の最終方針**（CHECKPOINT13.4Bから継続）: 実データ化するか、廃止するか。今回の34行復元は、これらのプレースホルダー馬とは別のcanonical horseId（実numeric ID）に安全に隔離されているため、この判断自体は緊急ではないが、いずれ整理が必要。
5. **正式Stage A / 枠順確定後の予想着手タイミング**: 今回の判定Aにより、技術的な基盤は整った。あとは新潟記念の正式枠順発表を待つのみ。

---

以上でCHECKPOINT13.4Dを完了する。**CHECKPOINT13.5・正式Stage A・CHECKPOINT14へは進まない。**

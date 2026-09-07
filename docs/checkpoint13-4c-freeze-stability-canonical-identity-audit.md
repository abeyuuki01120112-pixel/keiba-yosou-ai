# CHECKPOINT13.4C: Base Ability Freeze Stability / Canonical Identity Audit

日付: 2026-08-24
比較対象commit: `2f3c9a4`（Data Package Contract確定時）→ `994acc4`（実データImport後）
**本ラウンドはROOT CAUSE AUDITのみ。コード変更・ベンチマーク値更新・34行再Import・Resolver修正は一切行っていない。**

---

## 1. Base Ability drift summary（結論）

シェイクユアハートのbaseAbilityが70.3→70.9（+0.6）に変化した原因は、

**Base Ability V1の数式・重み・component weightは完全に無変更のまま、`buildRaceHistory()`が「その時点のdata/horses/全体」から動的にmemberLevel候補プールを構築する、というV1本来の設計が、実データ規模のImportで初めて可視化された結果**

である。ソースコードの非data差分は本レポート発行用のdocsファイル1件のみ（2節で確認）。数式バグ・IDコリジョンによる誤混入は確認されなかった（5節・7節）。

分類は **TYPE A（正当なData Completion。ただし通常想定より広い"transitive"な波及を含む）**。詳細は5節。

## 2. Git差分基準による検証

```
git diff 2f3c9a4 994acc4 --name-only | grep -v '^src/ability/data/horses/'
→ docs/checkpoint13-4b-niigata-kinen-real-data-integrity-audit.md のみ
```

**ソースロジック（`src/ability/*.ts`、`src/ability/import/*.ts`等）は1バイトも変更されていない。** 変更は`src/ability/data/horses/*.json`（407ファイル）と新規docsファイルのみ。「数式は無変更、データだけが変わった」という前提は構造的に確認済み。

## 3. Race-by-race delta（シェイクユアハート、直近5走全件）

commit 2f3c9a4のワークツリーと現行状態それぞれで、本番経路（`data/horses`全体→`buildRaceHistory()`→`loadHorseAbilityProfile("shakeyourheart")`）を実行し比較。

| raceId | raceName | raceDate | raceScore before | raceScore after | delta | memberLevel before | memberLevel after | 母集団(before→after) | winnerPresent |
|---|---|---|---|---|---|---|---|---|---|
| JRA-20251115-KYOTO-10 | アンドロメダS | 2025-11-15 | 70.6 | 70.7 | +0.1 | 66.6 | 66.8 | 6→6 | ×（両状態とも欠落・既知） |
| JRA-20251213-CHUKYO-11 | 中日新聞杯 | 2025-12-13 | 75.8 | 75.9 | +0.1 | 65.3 | 65.8 | 6→6 | ○ |
| JRA-20260215-KYOTO-11 | 京都記念 | 2026-02-15 | 67.8 | 68.0 | +0.2 | 66.7 | 67.4 | 5→5 | ○ |
| JRA-20260315-CHUKYO-11 | 金鯱賞 | 2026-03-15 | 74.6 | 76.5 | **+1.9** | 69.5 | 76.1 | 5→12 | ○ |
| JRA-20260614-HANSHIN-11 | 宝塚記念 | 2026-06-14 | 62.6 | 63.2 | +0.6 | 74.4 | 76.6 | 17→17 | ○ |
| **合計** | | | **351.4** | **354.3** | **+2.9** | | | | |

baseAbility = round(合計/5, 1) : before = round(70.28,1) = **70.3** / after = round(70.86,1) = **70.9**。完全に再現・一致した。

**重要な訂正**: CHECKPOINT13.4Bの調査では「京都記念・中日新聞杯・アンドロメダは変化なし」と報告していたが、これは誤りだった。実際は**5走全てが変化していた**（小さいものは0.1）。13.4Bの調査は金鯱賞・宝塚記念の大きな変化のみを追い、他3走の小さな変化を見落としていた。ここで訂正する。

final3FScore / raceTimeScore / timeGapScore / weightScoreは**5走とも完全に無変更**（次節で確認）。raceScoreのdeltaは100% memberLevelScoreAtRaceの変化のみに起因する。

## 4. Component delta（final3F/raceTime/timeGap/weight/memberLevel）

| raceId | final3FScore | raceTimeScore | timeGapScore | weightScore | memberLevelScoreAtRace |
|---|---|---|---|---|---|
| アンドロメダS | 無変更 | 無変更 | 無変更 | 無変更 | 66.6→66.8 |
| 中日新聞杯 | 無変更 | 無変更 | 無変更 | 無変更 | 65.3→65.8 |
| 京都記念 | 無変更 | 無変更 | 無変更 | 無変更 | 66.7→67.4 |
| 金鯱賞 | 無変更 | 無変更 | 無変更 | 無変更 | 69.5→**76.1** |
| 宝塚記念 | 無変更 | 無変更 | 無変更 | 無変更 | 74.4→76.6 |

raceScoreの重み（`RACE_SCORE_WEIGHTS`、`src/ability/raceScore.ts`、無変更）はmemberLevel=0.30。5走それぞれのmemberLevelScoreAtRace deltaに0.30を乗じた値が、raceScoreのdelta（丸め誤差内）と完全に一致する：

- アンドロメダ: (66.8-66.6)×0.30=+0.06 → raceScore +0.1（丸め）
- 中日新聞杯: (65.8-65.3)×0.30=+0.15 → raceScore +0.1（丸め）
- 京都記念: (67.4-66.7)×0.30=+0.21 → raceScore +0.2
- 金鯱賞: (76.1-69.5)×0.30=+1.98 → raceScore +1.9
- 宝塚記念: (76.6-74.4)×0.30=+0.66 → raceScore +0.6

**5走のraceScore変化は100% memberLevelScoreAtRaceの変化で説明できる。final3F/raceTime/timeGap/weightの4コンポーネントは寄与ゼロ。**

## 5. どのレースが+0.6を生んだか／新規データ行の影響

baseAbility寄与 = 各raceScore delta ÷ 5：

```
アンドロメダS   +0.1 raceScore → baseAbility +0.02
中日新聞杯     +0.1 raceScore → baseAbility +0.02
京都記念       +0.2 raceScore → baseAbility +0.04
金鯱賞         +1.9 raceScore → baseAbility +0.38
宝塚記念       +0.6 raceScore → baseAbility +0.12
合計                              +0.58 → 70.28→70.86（丸めで70.3→70.9）
```

100%説明済み。各レースについて、memberLevel Top5候補プールの中身を候補horseId単位でbefore/after diffし、原因を特定した。

### 5.1 金鯱賞（寄与+0.38、最大要因）

Top5候補が5件全て入れ替わった（母集団5→12、ZIP49レースのうち直接この日程の実対戦馬データが追加されたため）：

| addedHorseId | horseName | 寄与への経路 |
|---|---|---|
| 2019104828 | (不明・新規追加canonical) | 金鯱賞含む3走が新規追加、うち白富士S(2026-01-31)が本レース時点のability算出に使用 |
| 2021103975 | 同上 | 金鯱賞含む3走が新規追加、うちエリザベス女王杯(2025-11-16)が使用 |
| 2021104324 | 同上 | 金鯱賞含む5走が新規追加、うちアルゼンチン共和国杯(2025-11-09)・毎日王冠(2025-10-05)が使用 |
| 2021105414 | 同上 | 金鯱賞含む3走が新規追加、うち天皇賞秋(2025-11-02)が使用 |
| 2021106738 | 同上 | 金鯱賞含む2走が新規追加、うち白富士S(2026-01-31)が使用 |

除外された旧Top5候補（2019105556, 2021100913, 2021105541, 2022103995, **"shakeyourheart"自身**）は、実対戦馬データが不足していた旧状態で暫定的にTop5入りしていたに過ぎない（6節参照：memberLevel V1は自馬を含む全出走馬から候補を選ぶ設計であり、対戦相手が不足すると自馬自身が自分の候補に混入することがある。バグではなく既存の凍結仕様）。

**新規追加行はすべて金鯱賞の49レース中の1つであり、シェイクユアハートの対象過去レースと無関係なraceIdのデータではない。重大バグには該当しない。**

### 5.2 宝塚記念（寄与+0.12）

宝塚記念自体はZIPの49レースに含まれない。母集団も17→17で不変。しかしTop5候補の中身が変化：

- 追加: `2022105102`, `2021105829`
- 除外: `2022105081`, `2022106120`
- 能力値変化: `2021105898`（73.5→76.3）, `2021105143`（74.6→76.6, sampleCount増によりconfidence medium→high）, `2021103272`（74.7→76.3）

**メカニズム**: これらは宝塚記念の対戦馬自身。今回のZIP importで、これらの馬**自身の**別レースでの実績データが新規追加されたことで、各馬自身のabilityBeforeRace（宝塚記念時点で参照される値）が変化した。例：`2022105102`は今回ジャパンカップ(2025-11-30、宝塚記念より前)の実データが追加され、新たに宝塚記念のTop5候補として浮上した。

**追加行はすべて宝塚記念とは別の、これらの馬自身のraceId（ジャパンカップ・有馬記念など）であり、日付は全て宝塚記念(2026-06-14)より前。無関係raceIdの誤混入ではない。**

### 5.3 京都記念・中日新聞杯・アンドロメダS（合計寄与+0.08）

これら3走は母集団・Top5候補horseId自体は変化していない（変化したのは既存候補の能力値のみ）。メカニズムをさらに1段深く追跡した結果：

例：京都記念の候補`2020103025`の能力値が64.4→64.6に変化。この馬自身の直近走を調べると、**この馬自身の**チャレンジC(2025-09-13)・カシオペアS(2025-10-25)・アンドロメダS(2025-11-15)・日経新春杯(2026-01-18)のraceScoreが、京都記念(2026-02-15)より前の日付のまま、それぞれ僅かに変化していた（例: アンドロメダS 63.4→63.5）。これらは**さらにその前の**、この馬自身の対戦母集団の変化（別の連鎖）に起因する。

**これは「間接波及の連鎖（transitive ripple）」である**: あるレースXへの実データ追加 → Xに出走した馬HのraceScore変化 → Hが後日出走したレースYでのH自身のabilityBeforeRace変化 → Yのmember Level候補としてのHの寄与変化 → Yに出走した別の馬のraceScore変化 → ... という形で、時系列を厳密に遡らない範囲で、間接的に複数レース先まで波及しうる。

**全ての波及元行は日付が波及先レースより前であり、未来情報の参照は一件も確認されなかった（8節参照）。**

## 6. 正当な変化かバグかを分類

**TYPE A — 正当なData Completion**（ただし通常の定義より広い、"transitive"なケースを含む）と判定する。

理由：
- ソースロジック無変更（2節）
- 全raceScore変化は100% memberLevelScoreAtRaceの変化で説明可能（4節）
- 全ての新規追加行は、対象レース自身（金鯱賞）または対象レースの出走馬「自身の」別レース実績であり、無関係な馬・無関係なraceIdの混入は一件も確認できなかった（5節）
- 未来情報の参照は一件も確認されなかった（8節でPASS判定）
- horseId/horseNameの取り違え（Identity Collision）は5節で追跡した全ての候補馬について確認されなかった

一方で、TYPE A本来の定義（「同一レース対戦馬が追加された」）だけでは5.3節の間接波及を説明しきれない。これは**Base Ability V1の設計上の性質**であり、バグではないが、**「70.3という値は、対象馬自身のレース結果が一切変わらなくても、データセット全体のどこか（対象レースと直接関係のない箇所も含む）が変わるだけで動きうる」**という重大な特性を意味する。この特性自体は7節で正式に整理する。

TYPE B（Global Contamination Bug）・TYPE C（Identity Collision）には該当しない。無理にTYPE Aにしているわけではなく、5節の完全なトレースに基づく結論である。

## 7. 「70.3 Benchmark」の意味の整理

**Model Freeze**（凍結対象）: `raceScore.ts`・`baseAbility.ts`・`memberLevel.ts`・`memberLevelCandidates.ts`・`abilityBeforeRace.ts`等の**formula・weights・algorithm**。2節で無変更を確認済み。今回もこの意味でのFreezeは一切破られていない。

**Dataset Freeze**（今回破られたのはこちら）: CHECKPOINT12.6時点で70.3を再現していた**特定のdata/horsesスナップショット**。今回追加したProduction Canonical Data（新潟記念11頭関連の実データ）とは別概念。

質問への回答：

1. **CP12.6 dataset snapshotなら現在も70.3を再現できるか** → できる。commit `2f3c9a4`時点のワークツリー（CP13.4A時点、40ファイル）で計算した結果は70.3で完全一致した（3節）。
2. **994acc4 datasetでは70.9になるか** → なる。994acc4時点のワークツリー（436ファイル）で計算した結果は70.9で完全一致した（3節）。
3. **dataを増やすだけでbenchmarkが動く設計なのか** → **その通り。** `buildRaceHistory()`はdata/horses全体を毎回全走査してmemberLevel候補プールを動的構築するため、シェイクユアハート自身のデータが一切変わらなくても、共有される候補馬プール（直接・間接を問わず）にデータが追加されるだけでbaseAbilityは変動しうる。
4. **動く場合、それはどのcomponentの仕様によるものか** → **memberLevel V1の候補選定ロジック**（`buildMemberLevelResult()`, `raceHistoryPipeline.ts`）。対象レースの「出走馬全員」（自馬を含む、6節参照）のabilityBeforeRaceから動的にTop5候補を選び直す設計であり、`abilityBeforeRace`自体もその馬の過去走raceScoreに依存する再帰的構造のため、データセットが更新されるたびに再計算結果が変わりうる。final3F/raceTime/timeGap/weightの4コンポーネントは本件では無関与（4節）。

**結論**: 「70.3」はModel Freezeの検証には使えるが、Dataset Freeze（特定のdata/horsesスナップショット）を明示的に固定しない限り、実データが増えるたびに動く前提の値である。これはバグではなく、V1が「その時点で参照可能な実データに基づく相対評価」として設計されていることの必然的帰結。

## 8. Future leakage再監査

**判定: PASS**

構造的根拠: `buildRaceHistory()`（無変更、2節）はレースを日付昇順に処理し、`finalizedByHorseId`（処理済みレースのみを蓄積するmap）だけを参照してabilityBeforeRaceを計算する。未処理（future）のレースを参照する経路は存在しない。

実データでの追加検証: 5節で特定した全ての「新規追加行」について、日付を確認した：

- 金鯱賞(2026-03-15)の新規Top5候補5頭 → 各馬が寄与に使った自身の過去走は白富士S(2026-01-31)・エリザベス女王杯(2025-11-16)・アルゼンチン共和国杯(2025-11-09)・毎日王冠(2025-10-05)・天皇賞秋(2025-11-02) → **全て2026-03-15より前**
- 宝塚記念(2026-06-14)の新規候補2頭 → ジャパンカップ(2025-11-30)・ダイヤモンドS(2026-02-21)ほか → **全て2026-06-14より前**
- 京都記念(2026-02-15)の候補`2020103025`が変化に使った自身の過去走 → チャレンジC(2025-09-13)・カシオペアS(2025-10-25)・アンドロメダS(2025-11-15)・日経新春杯(2026-01-18) → **全て2026-02-15より前**

各馬について「対象レースより後の日付に追加された自身のレース」（例: 2019104828の目黒記念2026-05-31、2020103025の大阪―ハンブルクカップ2026-04-11）も確認したが、これらは対象レース時点のabilityBeforeRace計算には一切使われていない（処理順序上構造的に参照不可能なことを確認済み）。

future leakageは確認されなかった。

## 9. 34行除外の完全監査（全34行）

ZIP原本（`race_performances.csv`）を再展開し、ロースター16頭中11頭の馬名と一致する全行を再抽出した：

| # | horseId(CSV実値) | horseName | raceId | raceDate | finishPosition | source |
|---|---|---|---|---|---|---|
| 1 | 2017104756 | アラタ | JRA-20240310-CHUKYO-11 | 2024-03-10 | 5 | keibamar_public_dataset |
| 2 | 2020103941 | ホウオウビスケッツ | JRA-20240714-HAKODATE-11 | 2024-07-14 | 1（勝ち馬） | keibamar_public_dataset |
| 3 | 2019105302 | グランディア | JRA-20240714-HAKODATE-11 | 2024-07-14 | 2 | keibamar_public_dataset |
| 4 | 2019104756 | オニャンコポン | JRA-20240714-HAKODATE-11 | 2024-07-14 | 13 | keibamar_public_dataset |
| 5 | 2019105552 | ローシャムパーク | JRA-20241222-NAKAYAMA-11 | 2024-12-22 | 7 | keibamar_public_dataset |
| 6 | 2017104756 | アラタ | JRA-20250329-NAKAYAMA-11 | 2025-03-29 | 9 | keibamar_public_dataset |
| 7 | 2019105552 | ローシャムパーク | JRA-20250615-HANSHIN-11 | 2025-06-15 | 15 | keibamar_public_dataset |
| 8 | 2017104756 | アラタ | JRA-20250817-SAPPORO-11 | 2025-08-17 | 3 | keibamar_public_dataset |
| 9 | 2020103941 | ホウオウビスケッツ | JRA-20250817-SAPPORO-11 | 2025-08-17 | 7 | keibamar_public_dataset |
| 10 | 2021105369 | アドマイヤテラ | JRA-20251005-KYOTO-11 | 2025-10-05 | 4 | keibamar_public_dataset |
| 11 | 2020103941 | ホウオウビスケッツ | JRA-20251005-TOKYO-11 | 2025-10-05 | 2 | keibamar_public_dataset |
| 12 | 2022104772 | マジックサンズ | JRA-20251018-TOKYO-11 | 2025-10-18 | 10 | keibamar_public_dataset |
| 13 | 2021101436 | エコロヴァルツ | JRA-20251102-TOKYO-11 | 2025-11-02 | 11 | keibamar_public_dataset |
| 14 | 2020103941 | ホウオウビスケッツ | JRA-20251102-TOKYO-11 | 2025-11-02 | 13 | keibamar_public_dataset |
| 15 | 2019105552 | ローシャムパーク | JRA-20251109-TOKYO-11 | 2025-11-09 | 12 | keibamar_public_dataset |
| 16 | 2022104772 | マジックサンズ | JRA-20251123-KYOTO-11 | 2025-11-23 | 8 | keibamar_public_dataset |
| 17 | 2022104416 | レディネス | JRA-20260131-TOKYO-11 | 2026-01-31 | 4 | keibamar_public_dataset |
| 18 | 2020105749 | マイネルモーント | JRA-20260131-TOKYO-11 | 2026-01-31 | 8 | keibamar_public_dataset |
| 19 | 2021101436 | エコロヴァルツ | JRA-20260301-NAKAYAMA-11 | 2026-03-01 | 3 | keibamar_public_dataset |
| 20 | 2020105749 | マイネルモーント | JRA-20260301-NAKAYAMA-11 | 2026-03-01 | 4 | keibamar_public_dataset |
| 21 | 2022104772 | マジックサンズ | JRA-20260301-NAKAYAMA-11 | 2026-03-01 | 6 | keibamar_public_dataset |
| 22 | 2019104756 | オニャンコポン | JRA-20260301-NAKAYAMA-11 | 2026-03-01 | 11 | keibamar_public_dataset |
| 23 | 2017104756 | アラタ | JRA-20260315-CHUKYO-11 | 2026-03-15 | 10 | keibamar_public_dataset |
| 24 | 2020103941 | ホウオウビスケッツ | JRA-20260315-CHUKYO-11 | 2026-03-15 | 12 | keibamar_public_dataset |
| 25 | 2021105369 | アドマイヤテラ | JRA-20260322-HANSHIN-11 | 2026-03-22 | 1（勝ち馬） | keibamar_public_dataset |
| 26 | 2019104756 | オニャンコポン | JRA-20260329-HANSHIN-11 | 2026-03-29 | 11 | keibamar_public_dataset |
| 27 | 2020105749 | マイネルモーント | JRA-20260412-FUKUSHIMA-11 | 2026-04-12 | 4 | keibamar_public_dataset |
| 28 | 2022104772 | マジックサンズ | JRA-20260509-TOKYO-11 | 2026-05-09 | 4 | keibamar_public_dataset |
| 29 | 2022104094 | サクラファレル | JRA-20260509-TOKYO-11 | 2026-05-09 | 5 | keibamar_public_dataset |
| 30 | 2020105749 | マイネルモーント | JRA-20260509-TOKYO-11 | 2026-05-09 | 12 | keibamar_public_dataset |
| 31 | 2019104756 | オニャンコポン | JRA-20260509-TOKYO-11 | 2026-05-09 | 15 | keibamar_public_dataset |
| 32 | 2019105302 | グランディア | JRA-20260516-NIIGATA-11 | 2026-05-16 | 1（勝ち馬） | keibamar_public_dataset |
| 33 | 2020105749 | マイネルモーント | JRA-20260712-FUKUSHIMA-11 | 2026-07-12 | 2 | JRA_official_results |
| 34 | 2019104756 | オニャンコポン | JRA-20260712-FUKUSHIMA-11 | 2026-07-12 | 3 | JRA_official_results |

23節時点の除外理由（13.4Bで記載したもの）: 「horseNameがロースター16頭中の該当馬と完全一致するため、既存の`horseIdAliasesByName`機構により、CSVの実horseIdが無視されロースターのcanonical horseId（架空スラッグID）へ強制置換され、既存のプレースホルダー実績と時系列混在するリスクがあるため」。

## 10. 34行除外の正当性 — 分類結果

既存ロースターのcanonical horseId（`simulation/data/sapporoKinen.json`）を確認したところ、該当11頭はいずれも**架空のスラッグID**（`grandia`, `arata`, `houohbiscuits`, `onyankopon`, `roshampark`, `admireterra`, `magicsands`, `ecolowaltz`, `readiness`, `meinermount`, `sakurafarrell`）であり、CSVの実数値horseId（例: グランディア=2019105302）とは**全く異なる文字列**である（12節で詳述）。

**分類: 34行全て `VALID_OPPONENT_ROW`（IDENTITY_COLLISIONリスクは存在するが、除外自体は不当）**

理由：
- 34行は全て、実在するJRAレース（ZIPの49レースのいずれか）における実在の対戦馬の実績データであり、既存のプレースホルダーデータと**raceIdが一切重複しない**（TRUE_DUPLICATEには該当しない）
- 馬名は一致するが、CSVのhorseId（実数値）とロースターのhorseId（架空スラッグ）は文字列として完全に別物であり、`buildImportResult()`にそのまま渡せば**horseNameエイリアス機構を使わない限り自動的に別canonical識別子として扱われる**（`src/ability/import/buildImportResult.ts:100-101`参照）
- 問題は「馬名が同じであること」自体ではなく、`scripts/importRacePerformancesCsv.ts`が**常に無条件で**`buildHorseIdAliasesByName(rosterHorses)`を全16頭分構築し`buildImportResult`に渡す実装になっている点（12節）。この機構さえ介さなければ、34行は実数値horseIdのまま安全に独立した新規canonical識別子として取り込めた

**チェックポイントの指示通り、`VALID_OPPONENT_ROW`を馬名衝突"だけ"を理由に除外した13.4Bの処理は不正だったと認める。** 正しい対処は「除外」ではなく「エイリアス機構を経由させずに実数値horseIdのままインポートする」ことだった。この訂正は今回のAudit結果として記録するのみで、**再Importは行っていない**（11節の指示通り）。

なお、この34行除外が5節のraceScore変化に与えた影響は限定的かつ未確定である。金鯱賞の新Top5候補（5節5.1）は12頭中からの選出であり、もしアラタ・ホウオウビスケッツ（2件が金鯱賞に含まれる、#23・#24）が除外されず14頭中からの選出になっていた場合、Top5の構成が変わっていた可能性はゼロではない（未検証・未定量化）。この不確実性はIssue B固有の問題であり、Issue A（memberLevelの動的性質そのもの）とは区別して扱う。

## 11. 34行の削除/復元

**行っていない。** 994acc4は現状のまま維持。34行の再Importも行っていない。本ラウンドは監査のみ。

## 12. Canonical Identity設計監査

現状の関係:

```
horseId (canonical, data/horses/<horseId>.json のファイル名)
  ← CSVの実horseId列がそのまま使われる（通常経路）
  ← ただし horseIdAliasesByName[horseName] が存在する場合は強制上書きされる（例外経路、9-10節の原因）

horseName
  → 表示用途ではPrimary Identityとして扱われる箇所が複数存在するが、
    データ書き込み・グルーピングの「安全なキー」として使われているのは1箇所のみ

sourceHorseId
  → CSVのメタデータ列。canonical horseIdとは独立管理（CHECKPOINT13.2の設計）。
    ただし今回のZIP契約では sourceHorseId の値がそのままcanonical horseIdとしても使われる
    （新潟記念11頭の場合、この2つの値は偶然ではなく契約上一致している）

canonicalHorseId
  → 実質horseIdと同一概念（別名なし）
```

### horseNameをPrimary Identityとして扱っている箇所（要注意）

| ファイル | 箇所 | 危険度 | 備考 |
|---|---|---|---|
| `src/ability/import/horseIdAliases.ts` + `src/ability/import/buildImportResult.ts:100-101` | CSV取込時、horseName一致で**horseIdを強制的に書き換える** | **高（9-10節の実害）** | 曖昧性チェックなし。名前が1つでも一致すれば無条件で上書き。ambiguousという概念自体が存在しない |
| `src/ability/import/runnerResolver.ts` Priority 3 | horseName完全一致でcanonical horseIdを解決 | 低（安全設計） | 複数候補があれば`ambiguous`ステータスを返し、安全側にフォールバックする（116-141行）。**書き込みは一切発生しない、読み取り専用の解決ロジック** |

**結論**: 危険なのは`horseIdAliases.ts`の1箇所のみ。これは元々「同じ物理的な馬について、既存ロースター16頭のうちの1頭 が外部ソースの別ID体系で来た場合に、既存のプロフィールへ正しく接続する」ためのCHECKPOINT12.x由来の機構であり、**「ロースターに載っている対象馬自身のデータを取り込む」という用途に限っては安全**。しかし今回のように**ロースターに載っていない別レースの対戦馬データを取り込む**場合、この機構がそのまま適用されると、名前が偶然一致するだけで無関係な（かつ架空の）識別子へ誤爆する。**用途の異なる2つのインポートシナリオに同じ機構を無条件適用していたことが根本原因。**

異なるhorseId/sourceHorseIdを持つ別馬を安全に区別できるか: **できる（horseIdベースの経路は健全）。** 危険なのは「馬名だけで同一視してしまう`horseIdAliases.ts`の適用範囲がスコープ外まで及んでいたこと」であり、horseId自体の設計に欠陥はない。

## 13. Runner Resolver SPEC ISSUE

現状の解決順序（`runnerResolver.ts`）:

```
Priority 1: canonicalHorseIdHint一致
Priority 2: sourceHorseId → canonicalHorseIdRegistry対応（登録制、現状空）
Priority 3: horseName完全一致（正規化後）
  ↳ 参照する名前索引 buildCanonicalHorseRegistry() が
    simulation/data/sapporoKinen.json の16頭ロースターのみを名前ソースとしている
    （data/horses/全体を横断していない）
```

**理想との差分**: チェックポイントが示す理想形

```
all real data/horses
  ↓
canonical horse registry
  ↓
horseId / sourceHorseId primary
  ↓
horseName exact match fallback
```

に対し、現状は「horseId/sourceHorseId」の優先順位自体は正しく実装済み（Priority 1・2）だが、**Priority 1・2を実際に機能させるための入力（canonicalHorseIdHintまたはsourceHorseIdRegistryのエントリ）が、新潟記念11頭のケースでは一度も渡されていない**。`provisionalRunnerDiagnostic.ts`は`ProvisionalRegisteredRunner`（`horseName` + `sourceHorseId`のみ）から`resolveRunner()`を呼ぶ際、`sourceHorseId`を`RunnerResolveInput.sourceHorseId`としては渡すが、`context.sourceHorseIdRegistry`は空のまま（意図的:「sourceHorseIdからcanonicalHorseIdを勝手に推測しない」というCHECKPOINT13.2の設計）。したがってPriority 2は常にスキップされ、Priority 3（ロースター限定の名前索引）まで落ちて失敗する。

**まだ修正はしていない**（17節の指示通り）。次節に最小修正案のみ記載する。

## 14. sourceHorseId利用可能性

今回のZIP契約では、新潟記念11頭のsourceHorseId（netkeiba由来のユーザー提供値）が、実際のインポート結果として**そのままcanonical horseIdとしても使われている**ことを確認済み（例: アーバンシック sourceHorseId=2021105436 → `data/horses/2021105436.json`が実在）。

これは11頭全員について確認した（CHECKPOINT13.4Bの12節参照、本ラウンドでも2f3c9a4/994acc4双方で再確認）。

**ID-first設計は現行データで矛盾なく機能する条件が揃っている**: `sourceHorseIdRegistry`に「sourceHorseId → 同値のcanonicalHorseId」という恒等写像（identity mapping）を明示的に登録すれば、Priority 2だけで11頭全員がresolveできる。これは「horseNameからcanonicalHorseIdを勝手に推測する」のとは異なり、**「このImport契約では、sourceHorseIdとcanonicalHorseIdが同じ値になるよう意図的に設計されている」という既知の事実を明示的に登録する**行為であり、CHECKPOINT13.2の「勝手に推測しない」原則には抵触しない（推測ではなく契約上確定した事実の記録）。

馬名索引の拡張（ロースター限定を撤廃しdata/horses全体を名前ソースにする）は、9-10節で見たとおり別のリスク（無関係な同名馬の取り違え）を新たに生みうるため、**優先すべきはID-first（sourceHorseIdRegistryへの明示登録）であり、馬名索引拡張は最終手段とすべき**、というチェックポインの方針は妥当と判断する。

## 15. memberLevel fallback

CHECKPOINT13.4Bで報告された fallback rate = 7.4%（11頭・54走中4走）自体は、シェイクユアハートの70.3→70.9ドリフトには**直接関与していない**。

シェイクユアハート自身の5走について、`memberLevelBreakdown === null`（フォールバック発火）はbefore/after共に**5走とも1件も無し**（3節）。彼女の変化は全て「フォールバックの有無」ではなく、「実際に計算されたmemberLevelScoreAtRaceの値そのもの」が動いたことによる（5節の候補プール変化）。

したがって、11頭のmemberLevel fallback rate調査（13.4B）と、シェイクユアハートのbenchmark drift（本ラウンド）は**別々の事象**であり、混同すべきではない。

## 16. 問題を混ぜない（3種の整理）

| | A. Base Ability benchmark drift | B. 34-row identity/import exclusion | C. Runner Resolver roster-only SPEC ISSUE |
|---|---|---|---|
| 原因 | memberLevel V1の動的候補プール構築が実データ規模で可視化された、設計通りの挙動 | `horseIdAliasesByName`機構が用途外（ロースター外馬の同名対戦馬）にまで無条件適用され、`VALID_OPPONENT_ROW`が名前一致だけで除外された | `buildCanonicalHorseRegistry()`の名前ソースがsapporoKinen.json 16頭に限定されており、data/horses全体を横断しない |
| 影響 | 凍結ベンチマーク70.3が70.9に変化、関連テスト9件failure | 3レースが勝ち馬データを失った（函館記念・阪神大賞典・新潟大賞典）。金鯱賞のTop5候補構成に未定量の影響の可能性 | 新潟記念11頭は実データ投入後も一貫してResolved=0のまま |
| 修正案（次回以降） | 修正ではなく方針決定が必要（7節）: Dataset Freezeスナップショットを明示的に固定するか、70.9を新ベンチマークとして承認するか | `scripts/importRacePerformancesCsv.ts`で、対象インポートがロースター内対象馬向けか外部対戦馬向けかを区別し、後者では`horseIdAliasesByName`を適用しない（またはambiguity検出付きに強化する） | `sourceHorseIdRegistry`に新潟記念11頭のidentity mappingを明示登録する（14節） |
| 優先度 | 高（方針次第でCHECKPOINT14着手可否が変わる） | 中〜高（データ整合性に直接影響） | 中（実データはあるが活用できていない） |

**1つの修正で3つとも解決しようとしない。** 各々が独立した原因を持つ独立した問題である。

## 17. コード修正

行っていない。本ラウンドは診断script（vite-node経由の一時スクリプト、実行後削除済み）とgit worktreeによる比較のみを使用した。

## 18. 推奨修正順序（次回以降の判断用、今回は未実施）

1. **Issue B（34行問題）の是正方針決定**: `horseIdAliasesByName`の適用範囲をロースター内対象馬に限定する修正の承認可否
2. **Issue A（benchmark drift）の方針決定**: Dataset Freezeスナップショットの固定 vs 70.9への再ベンチマーク
3. **Issue C（Resolver SPEC ISSUE）の是正方針決定**: `sourceHorseIdRegistry`へのidentity mapping登録の承認可否
4. 3つの承認が揃った段階で、次回CHECKPOINTとして実装に着手

## 19. 判定

**C — 複数重大問題が絡み、Base Ability V1凍結を再開放する必要あり**

理由：
- Issue A（benchmark drift）はTYPE Aと判定されるが、「dataを増やすだけでbenchmarkが動く」という設計特性そのものが、Model FreezeとDataset Freezeの区別を今後常に明示しない限り、以後もあらゆる実データImportのたびに再燃する構造的な問題である
- Issue B（34行除外）は不当な処理と判定され、正しい対処法（エイリアス機構のスコープ限定）にはコード変更が必要
- Issue C（Resolver SPEC ISSUE）も同様にコード変更（registry登録）が必要
- 3つとも「Base Ability V1の数式」自体には触れないが、**その周辺の凍結されていないimport/resolver層**の設計判断が、V1のfreeze原則が期待する「再現可能なベンチマーク」を事実上崩している

無理にAとはしない。TYPE A判定（6節）はあくまで「今回の70.9への変化それ自体が数式バグでもIDコリジョンでもない」という技術的事実の分類であり、「CHECKPOINT14へ進んでよい」という判断とは別である。

---

以上でCHECKPOINT13.4Cを完了する。ベンチマークliteralは変更していない。34行の再Importは行っていない。Resolverの修正は行っていない。**CHECKPOINT13.5・Stage A・CHECKPOINT14へは進まない。**

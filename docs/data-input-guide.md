# 実データ投入ガイド

このドキュメントは、V0で使っている仮データを実際のJRA等のレース結果に
差し替えるための手順と、そのためのデータ構造をまとめたものです。

対象読者: このリポジトリにデータを投入する人（人間・ChatGPT問わず）。

## 1. 全体像

能力スコア（baseAbility）は、以下の3種類のデータから計算されます。

```
src/simulation/data/sapporoKinen.json   … 出走馬一覧（horseId・horseName・シミュレーション用の仮パラメータ）
        │ horseId で対応付け
        ▼
src/ability/data/horses/<horseId>.json  … その馬の直近走の生データ（1頭1ファイル）
        │
        ├── src/ability/data/courseTimeBaselines.json      … 5年基準タイム（条件ごと）
        ├── src/ability/data/courseFinal3FBaselines.json    … 5年上がり3F基準（条件ごと）
        │
        ▼
raceHistoryPipeline.buildRaceHistory()  … 実質メンバーレベル・タイム差・走破タイム・
                                           上がり3F・斤量の5項目を自動計算
        ▼
raceScore → 直近5走均等平均 → baseAbility
```

**`horseId` がすべてを繋ぐキー**です。`sapporoKinen.json` の `horseId` と
`data/horses/<horseId>.json` のファイル名が一致していないと、その馬の
基礎能力は空（データなし）になります。追加・削除は `data/horses/` に
ファイルを置く/消すだけで反映されます（コード変更不要）。

## 2. 必要入力項目一覧

### 2-1. `src/ability/data/horses/<horseId>.json`（1頭ぶんの配列。要素1つ=1走）

| フィールド | 型 | 説明 | 一般的なレース結果ページでの項目名の例 |
|---|---|---|---|
| `raceId` | string | レースの一意なID。同じレースに出た馬同士は同じ値にする（複数頭が同じレースを共有することで実質メンバーレベル等が計算できる） | レースID／race_id |
| `raceName` | string | レース名（表示用） | レース名 |
| `raceDate` | string (`YYYY-MM-DD`) | 開催日 | 開催日 |
| `racecourse` | string | 競馬場名 | 競馬場 |
| `surface` | `"turf"` \| `"dirt"` | 芝／ダート | 芝・ダ |
| `distance` | number（メートル） | 距離 | 距離 |
| `going` | string | 馬場状態（良・稍重・重・不良など、表記は自由） | 馬場状態 |
| `finishPosition` | number（1以上の整数） | 着順 | 着順 |
| `timeGap` | number（秒） | 勝ち馬とのタイム差。負けた馬は正の値。**勝った馬は2着馬につけた着差をマイナス値**（例: 0.2秒差で勝利→`-0.2`） | 着差（0.2秒差なら`0.2`、走破タイムから逆算してもよい） |
| `raceTime` | number（秒） | その馬の走破タイム（mm:ss.dはすべて秒に換算する。例: 1:59.8→`119.8`） | タイム |
| `final3F` | number（秒） | 上がり3F | 上り3F／上がり |
| `carriedWeight` | number（kg） | 斤量 | 斤量 |

**含めないもの**: `memberLevelScoreAtRace` `timeGapScore` `raceTimeScore`
`final3FScore` `weightScore` `raceScore` などのスコア系フィールドは
**一切書かないこと**。すべて`raceHistoryPipeline`が自動計算します
（誤って書いても無視されず検証エラーになるよう`npm run validate:data`で弾かれます）。

### 2-2. `src/ability/data/courseTimeBaselines.json`（過去5年基準タイム）

`{ "note": string, "baselines": CourseTimeBaseline[] }` の形。各要素:

| フィールド | 型 | 説明 |
|---|---|---|
| `racecourse` / `surface` / `distance` / `going` | 上と同じ | この条件に一致するレースにだけ適用される |
| `sampleYears` | number | 集計年数（通常5） |
| `sampleCount` | number | 集計サンプル数。`MIN_RELIABLE_SAMPLE_COUNT`（`src/ability/baselineLookup.ts`、既定15）未満だと検索時に信頼度「低」と判定される |
| `medianTimeSeconds` | number（秒） | 過去5年の**中央値**タイム |
| `source` | string | データの出典（自由記述。例:`"netkeiba 2021-2025集計"`）。V0仮データの場合はその旨を書く |

対応するレースが `data/horses/` 内に無い条件は用意しなくてOK（無駄になるだけ）。
逆に対応する条件が無いと、そのレースの`raceTimeScore`は中立値(70点)にフォールバックします
（`npm run validate:data`が不足条件を警告してくれます）。

条件（競馬場×surface×距離×馬場状態）が完全一致しない場合でも、競馬場×surface×距離が
一致すれば馬場状態を問わず`distanceFallback`として使われます（`raceTimeScore`・`final3FScore`の
計算式自体は変わらない。詳細は4章）。

### 2-3. `src/ability/data/courseFinal3FBaselines.json`（過去5年上がり3F基準）

構造は2-2と同じで、`medianTimeSeconds`の代わりに`medianFinal3FSeconds`（秒）を使います。

## 3. 手動での差し替え手順（V0の基本フロー）

1. 対象馬の`horseId`を`src/simulation/data/sapporoKinen.json`で確認する
   （無ければ馬を追加し、`horseId`を決める）。
2. `src/ability/data/horses/<horseId>.json`を実データで置き換える
   （直近5走、新しい順でも古い順でも可。並び順は`raceDate`から自動判定される）。
   同じレースに出走した他の馬がいる場合、その馬の該当走にも**同じ`raceId`**を
   使うこと（実質メンバーレベル等の計算に必要）。
3. 必要なら`courseTimeBaselines.json` / `courseFinal3FBaselines.json`に
   その条件（競馬場×芝ダート×距離×馬場状態）の基準を追加する。
4. `npm run validate:data` で構造チェック（型・必須項目・horseIdの整合性・
   基準データのカバレッジを確認できる。エラーがあれば具体的に指摘される）。
5. `npm test` でロジックのテストが通ることを確認。
6. `npm run dev` して馬詳細画面で実際の数値を目視確認する。

## 4. CSVからの取り込みフロー（V0の仮フロー）

JSONを直接手で書く代わりに、CSVから変換することもできます。
`templates/`配下にひな形があります。

```bash
# 1頭分のレース実績CSV → data/horses/<horseId>.json
node scripts/csvToHorseRaces.mjs <horseId> templates/race-performances-template.csv

# 変換後は必ず検証する
npm run validate:data
```

出力先を省略すると対応するJSONファイルを丸ごと置き換えます。別ファイルに
出力したい場合は3番目の引数でパスを指定できます。

基準タイム／上がり3F基準のCSV取り込みは、下記4-1のnpmスクリプトを使ってください
（`normalize → 検証 → JSON化`をTypeScriptで一元管理しており、CLIとアプリ本体で
判定ロジックが二重管理になりません）。

### 4-1. 基準タイム／上がり3F基準CSVの取り込み（第7実装）

**重要**: このCLIは「baselineの計算式を変えるのではなく、仮値を実データへ差し替える入口」
です。`raceTimeScore`・`final3FScore`・`trackAdjustment`等の計算式自体はここでは変更されません。

CSVの列: `racecourse,surface,distance,going,sampleYears,sampleCount,medianTimeSeconds,source`
（上がり3F用は`medianTimeSeconds`の代わりに`medianFinal3FSeconds`）。`source`は出典の自由記述で
**必須**です（空だとその行はエラーになり、書き込みされません）。

`baselineSource`・`isReliable`列をCSVに含めても構いませんが、これらは検索
（`lookupCourseTimeBaseline`/`lookupCourseFinal3FBaseline`）のたびに`sampleCount`と
`MIN_RELIABLE_SAMPLE_COUNT`から毎回自動計算される値のため、CSVにあっても**読み捨てられ、
保存はされません**（古い判定を誤って信用しないため）。テンプレートは
`templates/course-time-baselines-template.csv` / `templates/course-final3f-baselines-template.csv`。

```bash
# 変換内容を確認するだけ（ファイルには書き込まない）
npm run import:time-baselines -- --dry-run
npm run import:final3f-baselines -- --dry-run

# 別のCSVファイルを指定する場合
npm run import:time-baselines -- path/to/your.csv --dry-run

# 実際に src/ability/data/courseTimeBaselines.json / courseFinal3FBaselines.json へ書き込む
npm run import:time-baselines
npm run import:final3f-baselines

# 書き込み後は必ず確認する
npm run validate:data
npm test
```

引数省略時のデフォルト入力は`src/ability/data/import/course-time-baselines.csv` /
`course-final3f-baselines.csv`です。エラーが1件でもあれば書き込みは中止されます
（一部の行だけ差し替わる、といったことは起きません）。競馬場×surface×距離×馬場状態が
重複する行が複数あった場合もエラーになります。

### V0のCSVパーサの制約

`scripts/lib/csv.mjs`・`src/ability/import/csvParser.ts`は素朴な実装で、**フィールド内にカンマや
改行を含む値には対応していません**（`raceName`や`going`は短い日本語テキストである前提）。
Excel等でカンマを含むレース名を扱う必要が出てきたら、その時に専用のCSVパーサ導入を検討してください。

## 5. 複数馬・複数レースをまとめて取り込む（推奨: normalize層経由）

4章のCSVスクリプトは「1頭ぶん」「1つの基準テーブル」を個別に変換するものでした。
実際のレース結果は「1レースに複数頭が出走する」形で得られることが多いため、
**1つのCSVに複数レース・複数馬の行をまとめて**取り込める仕組みを別途用意しています。

```
src/ability/data/import/race-performances.csv   … 生データ（複数レース・複数馬をまとめて置ける）
        │
        ▼  parseCsv()
raw row（すべて文字列）
        │
        ▼  normalizeRacePerformance()  ※ src/ability/import/normalize.ts
検証済み RacePerformanceInput（raceId・horseIdで識別。欠損はnullを許容）
        │
        ▼  buildImportResult()  ※ src/ability/import/buildImportResult.ts
horseIdごとにグルーピング。欠損（finishPosition等がnull）の行は
能力計算対象から除外し、残りだけを RaceHistoryRawInput に変換
        │
        ▼
raceHistoryPipeline.buildRaceHistory()（変更なし。既存のロジックをそのまま使う）
```

**必須列**: `raceId, horseId, horseName, raceDate, racecourse, raceName, surface, distance, going`
（1つでも欠けている・形式が不正だとその行はエラー扱いになり、取り込まれない）。

**任意列（欠損可）**: `finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds`
（競走中止・タイム不明などで空欄にしてよい。**空欄はnullとして扱われ、0として計算されることはない**。
これらのうち1つでもnullだと、その行は能力計算の対象から安全に除外される）。

**参考列（保持のみ、計算には使わない）**: `raceNumber, gate, horseNumber, fieldSize`

サンプルとして、実際に使われている1レース分（東京特別戦、5頭）を
`src/ability/data/import/race-performances.csv` に置いています。

### 使い方

```bash
# 変換内容を確認するだけ（ファイルには書き込まない）
npm run import:csv -- --dry-run

# 別のCSVファイルを指定する場合
npm run import:csv -- path/to/your.csv --dry-run

# 実際に src/ability/data/horses/<horseId>.json へ書き込む
npm run import:csv

# 書き込み後は必ず確認する
npm run validate:data
npm test
```

`import:csv` は対象horseIdのファイルを**まるごと置き換える**（自動マージはしない）。
既存の過去走を残したまま追加したい場合は、CSVに既存分の行も含めてから実行すること。

### horseIdの差し替え（外部IDと内部ロスターの接続）

JRA公式IDなど、実データのCSVは既存ロスター（`sapporoKinen.json`）の内部horseId
（例: `"shakeyourheart"`）とは異なるIDを使っていることが多い。`npm run import:csv`は
`src/simulation/data/sapporoKinen.json`の馬名リストを自動的に読み込み、CSV行の
`horseName`が一致すればロスター側の内部horseIdへ差し替えてから書き込む
（`buildImportResult()`の`horseIdAliasesByName`オプション。予想ロジックには影響しない）。
一致しない馬（ロスター外の馬）はCSVのhorseIdをそのまま使う。

### アプリ上での確認

開発サーバー（`npm run dev`）の画面下部に「データ取り込み状況（サンプルCSV）」という
折りたたみパネルがある。これは`src/ability/data/import/race-performances.csv`を
同じnormalize層で処理した結果（読み込み件数・正常データ件数・除外データ件数・エラー件数）を
その場で確認できる、V0としての最小限のフィードバックUIです（巨大な管理画面ではない）。

## 6. 将来のスクレイピング拡張への接続点

今回スクレイピング自体は実装していませんが、拡張しやすいように
「CSVを共通の中間フォーマット」として設計しています。

- スクレイパーは、`templates/*.csv`と同じ列を持つCSVを吐き出すだけでよい
  （HTMLパース結果を直接JSONに変換するコードを書く必要はない）。
- 変換ロジック（型チェック・JSON化）は`scripts/csvToHorseRaces.mjs` /
  `scripts/importCourseTimeBaselinesCsv.ts` / `scripts/importCourseFinal3FBaselinesCsv.ts`に
  既にあるので、スクレイパー側は「対象ページから該当項目を抜き出してCSV行を1行作る」
  ことだけに集中できる。
- CSVを経由しない場合でも、スクレイパーが直接
  `RaceHistoryRawInput`（`src/ability/raceHistoryPipeline.ts`)の形の
  オブジェクト配列を作れるなら、`JSON.stringify`してそのまま
  `data/horses/<horseId>.json`に書き込んでも構わない。
- 5章のnormalize層（`src/ability/import/`）は将来的にAPI経由やDB経由のデータ取得に
  差し替わっても、「行データ（オブジェクト）を`normalizeRacePerformance()`に渡す」
  というインターフェースだけ守れば流用できるように作ってある。

## 7. 実装ファイル一覧

| ファイル | 役割 |
|---|---|
| `scripts/validateAbilityData.mjs` | データ構造の検証（`npm run validate:data`） |
| `scripts/csvToHorseRaces.mjs` | 1頭ぶんのレース実績CSV → 馬別JSON |
| `scripts/lib/csv.mjs` | 簡易CSVパーサ（CLIスクリプト用） |
| `scripts/importRacePerformancesCsv.ts` | 複数馬・複数レースまとめてCSV → 馬別JSON（`npm run import:csv`） |
| `scripts/importCourseTimeBaselinesCsv.ts` | 基準タイムCSV → `courseTimeBaselines.json`（`npm run import:time-baselines`） |
| `scripts/importCourseFinal3FBaselinesCsv.ts` | 上がり3F基準CSV → `courseFinal3FBaselines.json`（`npm run import:final3f-baselines`） |
| `templates/*.csv` | 4章のCSVスクリプト用ひな形 |
| `src/ability/import/types.ts` | `RacePerformanceInput`・`ImportError`等の型定義 |
| `src/ability/import/csvParser.ts` | 簡易CSVパーサ（アプリ本体・テスト用） |
| `src/ability/import/normalize.ts` | raw row → 検証済みデータへの正規化（`normalizeRacePerformance()`） |
| `src/ability/import/buildImportResult.ts` | CSV全体の取り込み・集計・ability計算用データへの変換 |
| `src/ability/import/normalizeBaseline.ts` | baseline raw row → 検証済みデータへの正規化（第7実装） |
| `src/ability/import/buildBaselineImportResult.ts` | baseline CSV全体の取り込み・集計（第7実装） |
| `src/ability/import/recentRaces.ts` | horseIdごとに直近N走を未来情報リーク無しで取得するユーティリティ |
| `src/ability/baselineLookup.ts` | baselineの3段階fallback検索・信頼度判定の共通ロジック（第7実装） |
| `src/components/ImportStatusPanel.tsx` | 取り込み状況の確認パネル（アプリ画面下部） |
| `src/ability/data/import/race-performances.csv` | 複数馬・複数レースまとめ取り込みのサンプル／雛形 |
| `src/ability/data/horses/*.json` | 馬別のレース実績生データ（正規化後の内部形式） |
| `src/ability/data/courseTimeBaselines.json` | 5年基準タイム |
| `src/ability/data/courseFinal3FBaselines.json` | 5年上がり3F基準 |

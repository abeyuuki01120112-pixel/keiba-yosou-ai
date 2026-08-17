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
| `sampleCount` | number | 集計サンプル数（参考値、計算には使わない） |
| `medianTimeSeconds` | number（秒） | 過去5年の**中央値**タイム |

対応するレースが `data/horses/` 内に無い条件は用意しなくてOK（無駄になるだけ）。
逆に対応する条件が無いと、そのレースの`raceTimeScore`は中立値(70点)にフォールバックします
（`npm run validate:data`が不足条件を警告してくれます）。

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

# 基準タイムCSV → courseTimeBaselines.json
node scripts/csvToBaselines.mjs time templates/course-time-baselines-template.csv

# 基準上がり3FCSV → courseFinal3FBaselines.json
node scripts/csvToBaselines.mjs final3f templates/course-final3f-baselines-template.csv

# 変換後は必ず検証する
npm run validate:data
```

出力先を省略すると対応するJSONファイルを丸ごと置き換えます。別ファイルに
出力したい場合は3番目の引数でパスを指定できます。

### V0のCSVパーサの制約

`scripts/lib/csv.mjs`は素朴な実装で、**フィールド内にカンマや改行を含む値には対応していません**
（`raceName`や`going`は短い日本語テキストである前提）。Excel等でカンマを含む
レース名を扱う必要が出てきたら、その時に専用のCSVパーサ導入を検討してください。

## 5. 将来のスクレイピング拡張への接続点

今回スクレイピング自体は実装していませんが、拡張しやすいように
「CSVを共通の中間フォーマット」として設計しています。

- スクレイパーは、`templates/*.csv`と同じ列を持つCSVを吐き出すだけでよい
  （HTMLパース結果を直接JSONに変換するコードを書く必要はない）。
- 変換ロジック（型チェック・JSON化）は`scripts/csvToHorseRaces.mjs` /
  `scripts/csvToBaselines.mjs`に既にあるので、スクレイパー側は
  「対象ページから該当項目を抜き出してCSV行を1行作る」ことだけに集中できる。
- CSVを経由しない場合でも、スクレイパーが直接
  `RaceHistoryRawInput`（`src/ability/raceHistoryPipeline.ts`)の形の
  オブジェクト配列を作れるなら、`JSON.stringify`してそのまま
  `data/horses/<horseId>.json`に書き込んでも構わない。

## 6. 実装ファイル一覧

| ファイル | 役割 |
|---|---|
| `scripts/validateAbilityData.mjs` | データ構造の検証（`npm run validate:data`） |
| `scripts/csvToHorseRaces.mjs` | レース実績CSV → 馬別JSON |
| `scripts/csvToBaselines.mjs` | 基準タイム／上がり3F CSV → JSON |
| `scripts/lib/csv.mjs` | 簡易CSVパーサ（共通） |
| `templates/*.csv` | 各CSVのひな形 |
| `src/ability/data/horses/*.json` | 馬別のレース実績生データ |
| `src/ability/data/courseTimeBaselines.json` | 5年基準タイム |
| `src/ability/data/courseFinal3FBaselines.json` | 5年上がり3F基準 |

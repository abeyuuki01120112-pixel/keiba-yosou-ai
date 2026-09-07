# CHECKPOINT 13.4A 新潟記念 Data Package Contract確定

2026-08-24実施。**本ラウンドはcontract確認のみ。コード変更は一切行っていない。**
実データ収集・外部アクセス・スクレイピングも一切行っていない。Base Ability V1・
Suitability V1の数式・仕様は無変更。既存の正式実データ（シェイクユアハート等）
が実際に正しく`data/horses/`→`buildRaceHistory()`→`baseAbility`まで再現できて
いる仕組みを基準に、ChatGPT側が次に作成する「2026新潟記念11頭 実データZIP」の
正確な受け取り形式を、実コードから確定した。

## 1. 推奨ZIP構造

**新しい複雑なimport方式は作らない。既存の`npm run import:csv`（CSV、
CHECKPOINT13.2のMerge/Upsert対応済み）をそのまま使う構成を推奨する。**
理由はSTEP7・STEP10で詳述。

```
niigata_kinen_2026_data_v1/
├── manifest.json              # 参考情報のみ（ZIP内容の要約、任意）
├── README.md                  # 出典・作成日・作成方法の説明（任意だが強く推奨）
└── race_performances.csv      # 実データ本体（必須）。既存importer形式そのまま
```

`horses/`ディレクトリに1頭1JSONを並べる構成やCSV3分割（horses.csv/races.csv/
race_results.csv）は**採用しない**。理由：
- 現在repositoryの唯一の実データ取り込み口（`src/ability/import/`一式、
  `scripts/importRacePerformancesCsv.ts`）は、**1行=1頭1走のフラットCSV**を
  前提に設計されており、CHECKPOINT13.2のMerge/Upsert・conflict検出・
  source/sourceRaceId/sourceHorseId保持・dataKind自動付与が全てこの形式に
  対して既に実装・テスト済み。
- 複数ファイル分割（horses.csv/races.csv/race_results.csv等の正規化スキーマ）
  は、それらを結合する新しいimporterコードが必要になり、「新しい複雑な
  import方式を作る必要はありません」という指示に反する。
- JSON形式（`horses/<slug>.json`を直接`data/horses/`へ置く）も技術的には
  可能だが、CHECKPOINT13.2のconflict検出・merge・source記録がすべてCSV
  importer経由の処理であるため、JSON直接投入だと二重登録・conflict見逃しの
  リスクが生じる。今回は不採用。

## 2. horse schema（`data/horses/<horseId>.json`の実体、コード上の正式field名）

`data/horses/<horseId>.json`は**1頭分の`RaceHistoryRawInput[]`（`raceHistoryPipeline.ts`
で定義）そのもの**。filenameルール: `<canonicalHorseId>.json`（拡張子含め
horseIdと完全一致、大文字小文字を含め既存の慣例に合わせる）。

`RaceHistoryRawInput`は`types.ts`の`RacePerformance`から計算済みフィールド
（`memberLevelScoreAtRace`等7項目）を除いたもの。horseId自体・horseName・
dataKindはファイル内の各要素（1走分のオブジェクト）が個別に持つのではなく、
**dataKindのみ1走ごとに持つ**（後述、STEP3参照）。horseName・horseId自体は
`RacePerformance`型に存在しない（ファイル名がcanonical horseId、馬名は
`simulation/data/sapporoKinen.json`ロースター側でのみ管理される既存の設計。
CHECKPOINT13.1で確認済み）。

## 3. race performance schema（1走分、正式field名・型・required/optional）

`src/ability/raceHistoryPipeline.ts`の`RaceHistoryRawInput`型（=`types.ts`の
`RacePerformance`から計算済み7項目を除いたもの）を実コードからそのまま列挙する。

### 必須（required、値が無いと`validate:data`でエラーになる）

| field | 型 | 説明 |
|---|---|---|
| `raceId` | string（空文字不可） | canonical raceId。既存慣例は`JRA-YYYYMMDD-COURSE-RACENUM`（例: `JRA-20260614-HANSHIN-11`） |
| `raceName` | string（空文字不可） | レース名 |
| `raceDate` | string（`YYYY-MM-DD`） | 出走日。future leakage判定に必須 |
| `racecourse` | string（空文字不可） | 競馬場名 |
| `surface` | `"turf"` \| `"dirt"` | 芝/ダート |
| `distance` | number（正の値） | メートル |
| `going` | string（空文字不可） | 馬場状態（「良」「稍重」「重」「不良」等） |
| `finishPosition` | number（1以上の整数） | 着順 |
| `timeGap` | number | 勝ち馬とのタイム差（秒）。勝ち馬は2着とのマイナス値 |
| `raceTime` | number（正の値） | 走破タイム（秒） |
| `final3F` | number（正の値） | 上がり3F（秒） |
| `carriedWeight` | number（40〜70の範囲） | 斤量（kg）。`normalize.ts`の`MIN_CARRIED_WEIGHT_KG`/`MAX_CARRIED_WEIGHT_KG`で範囲チェック |

### 任意（optional、無くても構造検証は通る。値があれば型チェックのみ行う）

| field | 型 | 説明 |
|---|---|---|
| `raceNumber` | number\|null | 第何レースか（1R,2R…） |
| `gate` | number\|null | 枠番。Base Ability V1計算には**使わない**（CoursePrior検証用の参考データ） |
| `horseNumber` | number\|null | 馬番。同上、計算には使わない |
| `fieldSize` | number\|null | 出走頭数。同上、計算には使わない（CHECKPOINT12.6のvalidate:data警告の判定には使う） |
| `passingPosition` | `PassingPositionData`\|null | 通過順位。Base Ability V1本体には未使用（脚質推定機能向け、今回不要） |
| `source` | string\|null | データ出所（CHECKPOINT13.2で追加）。ability計算には使わない |
| `sourceRaceId` | string\|null | 外部Source側のraceId（同上） |
| `sourceHorseId` | string\|null | 外部Source側のhorseId（同上、STEP8参照） |
| `importedAt` | string\|null | 取り込み時刻（同上） |
| `dataKind` | `"real"`\|`"placeholder"`\|`"fixture"`\|null | データ種別（CHECKPOINT13.2で追加）。**未指定はreal扱い**。今回のZIPでは全走で明示的に`"real"`を指定することを推奨（後続の`npm run import:csv`が自動付与するため、CSVに列を含めなくても実際にはreal固定になる） |

**「なんとなく必要」なfieldは一切含めていない**（例: 血統・調教・騎手データは
Base Ability V1が使わないため対象外。CLAUDE.md絶対原則1と整合）。

## 4. raceField schema（比較母集団に必要なfield）

**A. 各レース全出走馬のhorse fileが必要か → はい、これが正式な方法。**
`raceFieldAggregatesByRaceId`（`raceFieldAggregates.json`）は「対戦馬の
horseIdを持たない場合の集計値による上書き」という**フォールバック専用**の
仕組みであり（`types.ts`の`RaceFieldAggregate`定義コメント: 「対戦馬の
horseIdを持たない（ロスター外の）全出走馬データから算出した…」）、
**final3F・weightの中央値しかカバーしない**（`raceMedianWeightKg`・
`raceMedianFinal3FSeconds`の2項目のみ）。raceTimeScoreの勝ち馬タイム・
memberLevelの候補馬プールはこの仕組みではカバーされない。

したがって：**B. raceField専用データだけでは不十分。** 各対象レースについて、
出走していた馬（特に上位馬・勝ち馬）を、それぞれ独立した`horseId`を持つ
通常のhorse fileとして（対象11頭と同じ形式で）取り込むことを強く推奨する。

**C. 最低限必要な出走馬fieldは何か** → STEP3の必須フィールドと全く同じ
（`raceId`/`raceName`/`raceDate`/`racecourse`/`surface`/`distance`/`going`/
`finishPosition`/`timeGap`/`raceTime`/`final3F`/`carriedWeight`）。対戦馬にも
特別に軽量な形式は無い。

**D. 勝ち馬は必須か** → 実質必須。`raceHistoryPipeline.ts`の
`buildRaceHistory()`は`meta.officialTimeSeconds`を
`group.find((e) => e.raw.finishPosition === 1) ?? group[0]`で決定しており、
勝ち馬（`finishPosition===1`）のデータがgroup内に無い場合、**別の馬のタイムが
黙って「勝ち馬タイム」として代用され、raceTimeScoreが汚染される**
（CHECKPOINT12.6で確認済みの既知の危険挙動。`validate:data`が警告として検知
するが、正しい計算のためには最初から勝ち馬データを含めるべき）。

**E. 何頭以上必要というvalidationがあるか** → 明確な最小頭数の強制（エラー）
は無い。`scripts/validateAbilityData.mjs`（CHECKPOINT12.6追加）は、`fieldSize`
列に記録された頭数と実際にロードされた頭数を比較し、不足していれば**warning**
を出すのみ（エラーにはしない。除外・取消等の正当な差もありうるため）。
実務上は「そのレースの上位争いに関わった馬（できれば全頭、最低でも勝ち馬＋
着差の近い数頭）」を目安にすることを推奨する。

**F. memberLevel計算に追加で何が必要か** → **ここが最も見落とされやすい
点。** `buildRaceHistory()`のmemberLevel候補判定は、各対戦馬について
「そのレースより前の、その馬自身の過去走」から`calculateAbilityBeforeRace()`
（`abilityBeforeRace.ts`）を計算できて初めて候補になる。つまり**対戦馬の
「そのレース1走の行」だけでは、その対戦馬はmemberLevel候補になれない**
（`abilityBeforeRace`が計算不能＝候補から除外されるだけで、エラーにはならず
静かにスキップされる）。真にmemberLevelの精度を上げるには、対戦馬にも
**直近数走分**の過去走データが必要になる。ただし：
- これは「無いと壊れる」必須要件ではない（候補が0件ならFALLBACK_MEMBER_LEVEL_SCORE=50に
  安全にフォールバックするだけ）。
- 全対戦馬に何走分もの完全な経歴を求めるのは「過去データ全部ください」に
  等しく、STEP12の「必要最小限」の原則に反する。
- **今回のZIP作成では、対戦馬については「そのレース1走の行」だけで十分と
  する**（memberLevelはFALLBACK値または部分候補で計算され、正式な
  Suitability/baseAbility計算自体は成立する。final3F/weight/raceTimeの
  比較母集団としての役割の方が優先度が高い）。

## 5. memberLevel requirements（実コードの事実）

- 対象レースの`abilityCandidates`は、同一raceId groupの各エントリについて
  `calculateAbilityBeforeRace(そのエントリ自身の直近最大5走のraceScore)`が
  非nullなら候補になる（`memberLevelCandidates.ts`のTop5confidence加重平均、
  STEP4-Fで詳述）。
- 候補が1頭も無い場合、`memberLevelScoreAtRace`は`FALLBACK_MEMBER_LEVEL_SCORE=50`
  （`memberLevel.ts`）にフォールバックする。これは「レース格が低い」という
  意味ではなく「評価不能」を意味する既存の安全策。
- 凍結済み仕様（`docs/ability-model-v1.md`）のため、本ラウンドはこの仕様を
  変更する提案も行っていない。

## 6. recent races requirements（「直近5走」の意味、実コードの事実のみ）

- **Base Ability V1は5走を必須としない。** `calculateBaseAbility()`
  （`baseAbility.ts`）は`recentRaces.slice(0, RECENT_RACE_COUNT=5)`を取り、
  **その時点で存在する分だけ**の単純平均を返す（1〜5走のどれでも計算できる）。
  0走のみ計算不能（`0`を返すが、これは「能力0点」ではなく「データ不足」を
  意味する既知の仕様、`baseAbility.ts`のコメントに明記）。
- **5走未満でも計算は可能**（上記のとおり）。
- **何走からpredictionEligibleになるか**: これは Base Ability V1自体の仕様
  ではなく、CHECKPOINT13.2で`predictionSnapshot.ts`のSnapshot層に追加した
  `completenessFlags`の`insufficientRecentHistory`（実データ過去走が
  `RECENT_RACE_COUNT=5`未満の場合に付与）が、`raceCardBridge.ts`/
  `provisionalRunnerDiagnostic.ts`の`predictionEligible`判定で**事実上5走を
  要求する運用ルール**になっている。**Base Ability V1自体の計算式は1走でも
  動くが、CHECKPOINT13.2以降のSnapshot層の完全性チェックが5走を目安値として
  要求している**、という2層構造を混同しないこと。
- **race weightの適用**: 均等平均（20%ずつ）。「前走を特別に重くしない」と
  `baseAbility.ts`冒頭コメントに明記されている。凍結済み仕様のため今回変更
  していない。

## 7. ZIP構成の理由（STEP7の再確認）

CSVを1本のみ含む構成を推奨する理由をSTEP1で述べたとおり整理すると：
- 唯一の実データ取り込み口が`buildImportResult()`（CSVベース）であり、
  CHECKPOINT13.2のMerge/Upsert・conflict検出・source系フィールド対応が
  全てこの経路専用に実装・テスト済みだから。
- 複数ファイル形式・JSON直接投入は、今回のための新しいimporterコードを
  必要とし「新しい複雑なimport方式を作る必要はない」という指示に反する。

## 8. Source / Provenance

`RacePerformanceInput`（CSVの1行）・`RaceHistoryRawInput`（内部形式）
どちらも`source`/`sourceRaceId`/`sourceHorseId`をoptionalフィールドとして
既に持つ（CHECKPOINT13.2追加、CSV列名も同名）。`importedAt`はCSV列としては
存在せず、**`scripts/importRacePerformancesCsv.ts`が取り込み実行時刻を
自動的に付与する**（CSVに含める必要は無い）。

11頭の`sourceHorseId`（ユーザー提供のnetkeiba horse ID）は、CSVの
`sourceHorseId`列にそのまま入れる：

| horseName | sourceHorseId（CSV列にそのまま） |
|---|---|
| アーバンシック | 2021105436 |
| サヴォーナ | 2020100734 |
| ジュンブロッサム | 2019105118 |
| ステレンボッシュ | 2021105743 |
| ゾロアストロ | 2023106850 |
| ダノンシーマ | 2022104645 |
| チェルヴィニア | 2021105643 |
| ドゥレッツァ | 2020103650 |
| バレエマスター | 2019104850 |
| ボーンディスウェイ | 2019104658 |
| ロデオドライブ | 2023107166 |

`source`列には`user_provided_netkeiba_reference`を全行に入れることを推奨
（自由記述、ability計算には一切使わない）。

**canonicalHorseIdとの対応方法**: CSVの`horseId`列（＝canonical horseId、
STEP9で詳述）と`sourceHorseId`列は**別の列として両方入れる**。同一視しない
（`import/types.ts`のコメントに明記済みの既存原則: 「馬名・レース名ではなく
raceId/horseIdをキーにする」「canonical/sourceは別物」）。

## 9. canonical horseId生成ルール

既存repositoryの実際の運用実績を確認したところ、**新規の実データ馬には
「元Source（今回はnetkeiba）のIDをそのままcanonical horseIdとして使う」**
という前例が既に確立されている（現在`data/horses/`の22頭の数値ID馬は、
`buildImportResult.ts`のalias機構＝「馬名がロースターと一致すればロースター
側のID、一致しなければCSVのhorseId列の値をそのまま使う」という既存ロジック
により、実際にCSVのhorseId列の値がそのままcanonical horseIdになっている）。

**今回の11頭も同じ前例に従い、`sourceHorseId`の値をそのまま`horseId`列
（canonical horseId）としても使うことを推奨する**：

```csv
horseId,horseName,sourceHorseId,source,...
2021105436,アーバンシック,2021105436,user_provided_netkeiba_reference,...
```

これは「sourceHorseIdとcanonicalHorseIdを混同する」ことにはならない
——`sourceHorseId`列を明示的に別途保持しているため、値が数値として同じでも
概念的には分離されたまま記録される（将来別Sourceが同じ実馬に別のIDを
振っていた場合でも、`sourceHorseId`列を見れば由来を区別できる）。

**将来の衝突リスクについて（正直な報告）**: netkeibaの馬IDと、既存の22頭が
使っているJRA由来と思われる数値IDは、どちらも「生年+連番」に似た形式であり、
将来別のSourceが偶然同じ数値を別の実馬に割り当てる可能性はゼロではない
（既存の22頭についても同様のリスクは既に内在している、CHECKPOINT13.1で
指摘済みの既知の技術的負債）。今回はこのリスクを新たに悪化させるものでは
なく、既存の前例をそのまま踏襲するだけなので、今回のスコープでは追加の
対策を提案しない。

## 10. Validation / import command

**既存CLIで完全にカバーできる。新規スクリプトは不要。**

```bash
# 1. まずdry-runで確認する（一切書き込まない）
npm run import:csv -- path/to/niigata_kinen_2026_data_v1/race_performances.csv --dry-run

# 出力される内容：
#   - 読み込み件数・正常データ件数・除外データ件数・エラー件数
#   - 対象馬一覧
#   - Merge/Upsert方式での試算（馬ごとに既存○走→新規追加○走、
#     重複import（無視）、conflict（既存と食い違う場合、差分を表示）

# 2. dry-runの内容を確認し、問題無ければ実際に書き込む
npm run import:csv -- path/to/niigata_kinen_2026_data_v1/race_performances.csv

# 3. 構造検証・比較母集団完全性チェック
npm run validate:data

# 4. 既存テスト・ビルドの回帰確認
npm test
npm run build
```

これが指示の「ZIP → validate → Missing/Conflict Report → OK → Merge/Upsert」
の実装済みの形。`import:csv --dry-run`が「validate + Missing/Conflict Report」
の役割を果たし、conflictが1件でもあればその馬のファイルは書き込まれない
（安全側、CHECKPOINT13.2の既存仕様）。

**取り込み後の追加確認**: `npm run provisional:check -- <fixtureファイル>`
（CHECKPOINT13.3で追加）を使えば、11頭が実際に`resolved`・
`predictionEligible=true`になったか、Base Ability診断値が得られるかを
即座に確認できる（`src/ability/data/provisional/niigata-kinen-2026-registered.json`
を再利用可能）。

## 11. ZIP作成時の注意点

- CSVの`horseId`列は、対象11頭には`sourceHorseId`と同じ値（STEP9）、
  対戦馬（勝ち馬含む）には別途一意な値（同じくnetkeiba ID等があればそれを
  使う、無ければ他の既存IDと衝突しない値）を入れる。
- `raceDate`は必須・実際の日付のみ（未来日付や2026新潟記念当日以降の日付は
  入れない。future leakage防止、STEP12）。
- 空欄は「0」等で埋めず、本当に不明な場合は`finishPosition`等の一部任意
  フィールドのみ空欄可（`normalize.ts`が空欄をnullとして扱い、必須5項目
  いずれかが空なら能力計算対象から自動除外される。捏造データでの穴埋め禁止）。
- 1行=1頭の1走。同じ馬が複数レースに出ていれば複数行。
- ヘッダー行必須、カンマ区切り、フィールド内カンマ・改行は不可
  （`csvParser.ts`の既存制約）。

## 12. DATA COLLECTION CHECKLIST

ChatGPT側で実データを収集する際、馬ごとに以下を確認する：

- [ ] 対象馬の直近5走分の行（無理に5走無くても1走以上あれば投入可）
- [ ] 各行に`raceId`/`raceName`/`raceDate`/`racecourse`/`surface`/`distance`/
      `going`/`finishPosition`/`timeGap`/`raceTime`/`final3F`/`carriedWeight`
      が実データとして揃っている
- [ ] 各レースについて、少なくとも勝ち馬（`finishPosition=1`）の行を含む
      （STEP4-D）
- [ ] 各レースについて、可能な範囲で他の上位馬・実際の対戦馬の行も含む
      （STEP4-A/B、final3F/weightの比較母集団確保のため）
- [ ] `horseId`列に対象馬はsourceHorseId、対戦馬は一意なID（STEP9・STEP11）
- [ ] `sourceHorseId`・`source`列を対象馬の全行に設定（STEP8）
- [ ] raceDateが2026新潟記念のprediction cutoffより前であること（STEP12）
- [ ] 大量の全キャリア分データは不要（直近5走程度で十分、STEP4-F・STEP6）

## 13. 判定: A

**このcontractに従えば、ChatGPT側で実データZIPを作成できる。**

理由:
- 推奨形式（1本のCSV、既存`import:csv`のスキーマそのまま）は、
  CHECKPOINT13.2で既に実装・テスト済みの経路であり、新規のimport/validation
  コードを1行も必要としない。
- 必須/任意フィールド・raceField比較母集団の入れ方・source/provenanceの
  持たせ方・canonical horseId生成ルール・dedup・future leakage対策は、
  すべて実コードの事実（推測ではなく）から確定できた。
- 唯一の実務上の懸念（STEP4-Fのmemberlevel精度・STEP9の将来的なID衝突
  リスク）は、いずれも「無いと壊れる」必須要件ではなく、既存の安全な
  フォールバック（FALLBACK_MEMBER_LEVEL_SCORE等）で吸収される設計になって
  いることを確認済み。

## 遵守事項の確認

Base Ability V1・Suitability V1の数式・仕様・凍結対象ファイルは本ラウンドで
一切変更していない。外部データ取得・スクレイピング・実データ収集は行って
いない。コード変更も一切無し（本ラウンドは`docs/`ファイル1件の追加のみ）。

ここでSTOPします。ChatGPT側でこのcontractに従い実データZIPを作成し、
ユーザーが添付するのを待ちます。

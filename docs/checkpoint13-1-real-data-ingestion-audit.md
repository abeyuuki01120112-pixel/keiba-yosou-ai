# CHECKPOINT 13.1 実データ投入経路監査

2026-08-24実施。**監査専用ラウンド。コード変更は一切行っていない。**
Base Ability V1・Suitability V1の数式・component weight・凍結仕様は無変更。
CHECKPOINT13で実装した`predictionSnapshot.ts`等の本番コードにも一切手を
加えていない（読むだけ）。

## 1. 現在の実データ入力経路

実際に存在する経路は2種類あり、**互いに独立していて自動接続されていない**。

**経路A（既存・CSV手動投入、恒常データ用）**:
```
CSVファイル（手動作成）
→ parseCsv()（csvParser.ts、Raw）
→ normalizeRacePerformance()（normalize.ts、Normalize+Validate。raceId/horseId/
   horseName/raceDate/racecourse/raceName/surface/distance/goingは必須、
   finishPosition等5項目は欠損許容）
→ horseIdAliasesByName置換（buildImportResult.ts。馬名が
   simulation/data/sapporoKinen.json の16頭ロースターと完全一致する場合のみ
   内部horseIdへ差し替え）
→ toRaceHistoryRawInput()（能力計算必須5項目が1つでも欠損なら除外）
→ scripts/importRacePerformancesCsv.ts が data/horses/<horseId>.json へ
  「まるごと置き換え」で書き込み（npm run import:csv、--dry-run可）
→ （次回アプリ起動時）horseAbilityData.tsが起動時に一度だけdata/horses/全体を
  buildRaceHistory()へ投入 → historyByHorseId
```
この経路は「実績（過去走）データをdata/horses/へ足す」ための経路であり、
**「今週のレースの出走馬一覧を投入してStage A/Bを作る」という用途では
そのままは使えない**（詳細はSTEP8参照）。

**経路B（CHECKPOINT13新設・Snapshot生成）**:
```
RaceEntryInput[]（呼び出し側が用意する。horseId/horseName/frame/horseNumber/
  carriedWeight/scratchedを含む）
→ buildGateConfirmedSnapshot() / buildT2hSnapshot()（predictionSnapshot.ts）
→ 各horseIdについて getHorseRecentRaces(horseId)（horseAbilityData.tsの
  historyByHorseIdを参照するだけ）
→ calculateBaseAbility() / computeSuitabilityV1()（いずれも凍結済み・無変更）
→ PredictionSnapshot / AbilityBoardRow
```
**この経路には、実際のJRA 11Rの出走馬一覧を`RaceEntryInput[]`へ変換する
「Runner Resolve層」が存在しない。** `RaceEntryInput.horseId`は呼び出し側が
既に正しいhorseIdを知っている前提の入力であり、「馬名からhorseIdを引く」
「未登録なら報告する」処理はこの経路の外（呼び出し側の責任）になっている。

結論：**経路A→経路Bを接続する層、および「実際の11Rの出走馬名一覧」→
経路Aで使えるCSV/構造への変換層は、どちらも現状存在しない。**

## 2. Stage A 必須入力

`predictionSnapshot.ts`の型・関数から実コードベースで洗い出した。

| 項目 | 現状 |
|---|---|
| raceId | `SnapshotRaceTarget.raceId`（必須） |
| raceDate | `SnapshotRaceTarget.raceDate`（必須） |
| racecourse | `SnapshotRaceTarget.racecourse`（必須） |
| surface | `SnapshotRaceTarget.surface`（必須、"turf"\|"dirt"） |
| distance | `SnapshotRaceTarget.distance`（必須） |
| raceNumber | **型に存在しない**（`SnapshotRaceTarget`に無い。後述STEP8参照） |
| scheduledStartTime | `SnapshotRaceTarget.postTimeIso`として存在（発走予定時刻、T-2h算出に使用） |
| horseId | `RaceEntryInput.horseId`（必須。呼び出し側が既にresolve済みである前提） |
| horseName | `RaceEntryInput.horseName`（必須。表示・warning文言にのみ使用） |
| frame | `RaceEntryInput.frame`（nullable。gate Suitability・CoursePriorの入力） |
| horseNumber | `RaceEntryInput.horseNumber`（nullable。gate Suitabilityの入力） |
| assignedWeight | `RaceEntryInput.carriedWeight`として型には存在するが、
  **`buildHorseSnapshotEntry()`内でどこにも読み取られていない（未使用フィールド）**。
  現状のBase Ability V1/Suitability V1は「今回のレースで背負う斤量」を
  入力に取らない設計のため、これは意図的な仕様というより「型だけ用意して
  接続先が無い」状態。 |
| going | `SnapshotGoingInput`（`{evaluated:true, going:string}` \| `{evaluated:false}`）。
  Stage Aで未確定なら`evaluated:false`を渡す。 |
| 出走取消情報 | `RaceEntryInput.scratched: boolean`（必須） |

**その他、現状の型に存在しないが実運用で必要になりうる項目**:
- `raceNumber`（1R〜12Rの区別）: `SnapshotRaceTarget`に無い。ability層の
  `RacePerformance.raceNumber`（同日内trackAdjustmentのfuture leakage判定に
  使用）とは別物で、Stage A/B側では現状未使用・未収集。
- レースクラス/条件（重賞/平場等）: Base Ability V1・Suitability V1は
  レース格を直接使わない設計のため意図的に無い（CLAUDE.md絶対原則1と整合）。

## 3. Stage B 追加入力

`buildT2hSnapshot()`から確認した。

- `predictionCutoffAt`はStage Aと異なり`computeT2hCutoff(raceTarget.postTimeIso)`
  （発走予定時刻−2時間）で独立に算出される。Snapshotの実際の生成時刻
  （`generatedAt`）とは別物として扱われる。
- **公式馬場状態**: `going: {evaluated:true, going:"..."}`を渡せば、Stage Aで
  `evaluated:false`だったgoing適性が再評価される（同じ`buildHorseSnapshotEntry()`
  を再利用しているだけで、新しいロジックは無い）。
- **出走取消**: `RaceEntryInput.scratched`はStage A/B共通のフィールド。
  Stage Bで新たに取消が判明した場合は、その馬の`scratched`をtrueにした
  `entries`を渡すことで反映される（Stage Aの`entries`をそのまま使い回さず、
  呼び出し側が最新の`entries`を用意する必要がある）。
- **odds保存**: `BuildT2hSnapshotInput.odds?: OddsSnapshotEntry[] | null`。
  Stage Aには存在しない、Stage B専用フィールド。**`buildHorseSnapshotEntry()`
  のコード内にoddsを読み取る処理は一切無い**（CHECKPOINT13テストGで
  odds有無で結果が完全一致することを確認済み。今回grepでも再確認：
  `buildHorseSnapshotEntry`の関数本体に`odds`という文字列は出現しない）。
- **その他当日確定情報**: 斤量（`carriedWeight`）は型にはあるがSTEP2同様
  未使用。パドック情報・馬体重増減等の型は存在しない。

## 4. Runner Resolve

- **horseIdの一意性**: `data/horses/`はファイル名＝horseIdであり、
  ファイルシステムレベルで一意性が保証されている。ただし**IDの命名規則が
  2系統混在している**（実データ実証: 数値JRA的ID 22頭 `20xxNNNNNN`形式、
  英名スラッグ 18頭 `shakeyourheart`等）。
- **horseName fallback**: `buildHorseIdAliasesByName()`が唯一のfallbackで、
  `simulation/data/sapporoKinen.json`ロースター（現在16頭）の馬名と
  **完全一致**した場合のみ動作する。`data/horses/`には現在**40頭**分の
  ファイルがあるが、ロースターに登録されているのは16頭のみ。**残る24頭は
  馬名からのresolveができず、正しい数値horseIdを事前に知っている場合のみ
  参照可能**（実コマンドで確認: ロースター∩data/horses=16、
  data/horses−ロースター=24）。
- **同名馬問題**: `buildHorseIdAliasesByName`は`Record<horseName, horseId>`の
  単純な辞書であり、同名の異なる馬が2頭登録された場合は後勝ちで
  上書きされ、衝突検知は無い。現状のロースター規模（16頭、名前重複なし）
  では未発現だが、構造的な安全策は無い。
- **raceIdの形式**: `data/horses/*.json`内で**2つの形式が混在**している。
  (1) `JRA-YYYYMMDD-COURSE-RACENUM`形式（22頭の数値ID馬、および
  `shakeyourheart`が使用。実データ）。
  (2) `rN-gM`形式（18頭中15頭の英名スラッグ馬が使用）。**この`rN-gM`形式は
  CHECKPOINT12.2で「V0プレースホルダー・捏造データ」と確認済みのパターンと
  完全一致しており、実際に該当15ファイル（admireterra/arata/ecolowaltz/
  grandia/houohbiscuits/igacchi/magicsands/meinermount/onyankopon/pinkgin/
  readiness/roshampark/sakurafarrell/shohei/zendanhayabusa）は5走全てが
  この形式で、実レースのraceId・raceNameが1件も含まれていないことを本監査で
  確認した。** これらは実データではなくV0時代のプレースホルダーであり、
  CLAUDE.md絶対原則5（実データ以外を使わない）に照らして本来「実データ」と
  混同されてはならないが、**現状`data/horses/`ディレクトリ内で実データと
  プレースホルダーデータを区別するフィールド・フラグが一切無い**。
  （幸い、`rN-gM`形式のraceIdは数値ID馬のJRA-形式raceIdとは一切重複・共有
  しておらず、これらのプレースホルダー馬同士でのみraceIdグループを形成する
  ことを確認した。したがって現状、実データ馬のmemberLevel/final3F/weight
  計算にプレースホルダー馬が直接混入するリスクは無い。ただし、もし将来
  実際の週末レースの出走馬horseIdがこれら15頭のいずれかと一致してしまえば
  （例えば同じ馬名の馬が偶然存在する等）、検知なしにプレースホルダー履歴が
  baseAbility計算に使われてしまう）。
- **sourceごとのID差異**: 型システム上、`source`という概念そのものが
  存在しない（`RacePerformance`/`RacePerformanceInput`/`RaceHistoryRawInput`
  いずれにも`source`フィールドは無い）。CSVの`horseId`列がどのSourceの
  IDなのかを記録する場所が無く、複数Source統合時に「このIDはJRA公式、
  こちらはKaggle由来」と区別できない。
- **horseIdが外部データと一致しない場合の処理**: 経路A（CSV import）では
  「馬名がロースターと一致すればalias差し替え、一致しなければCSVの
  horseIdをそのまま新規ファイル名として書き込む」という挙動になる
  （`buildImportResult.ts`）。「未登録馬」を明示的にエラー/警告として
  分離報告する仕組みは無い（新規horseIdとして黙って書き込まれる）。
- **未登録馬の扱い**: Stage A/B側（経路B）では、`getHorseRecentRaces()`が
  空配列を返し、`buildHorseSnapshotEntry()`が
  「過去走データが無いためbaseAbility算出不能」warningを出してbaseAbility=null
  として扱う（CHECKPOINT13テスト済み）。**能力0点として扱われることは無く、
  データ不足として明示される**ことは確認済み。ただし「そもそもこの馬名は
  data/horses/に存在しない」のか「存在するが過去走が0件」なのかは、
  現在の`HorseSnapshotEntry`のwarning文言からは区別できない
  （どちらも同じ空配列として扱われる）。

## 5. ID / Source管理

**現在あるもの**:
- `raceId`（string、キーとして機能）
- `horseId`（string、`data/horses/`のファイル名として機能、一意性保証）
- `horseName`（表示用。resolveの補助にのみ使用）
- `raceDate`（future leakage判定・時系列ソートに必須。全経路で使用済み）

**不足しているもの**:
- `source`（"JRA公式"/"Kaggle"/"CSV手動" 等の由来タグ） — 型に存在しない。
- `sourceRaceId` / `sourceHorseId`（元Sourceでの識別子、canonicalなraceId/
  horseIdとの対応表） — 存在しない。
- データ由来を示す`isPlaceholder`/`dataQuality`のようなフラグ — 存在しない
  （前述の`rN-gM`プレースホルダー混入問題の根本原因）。
- horseName→horseIdの正式なresolveレジストリ（ロースター外の24頭を含む
  全馬対応、揺れ表記・別名への対応） — 存在しない
  （`horseIdAliasesByName`はロースター16頭限定）。

**複数Source統合時の二重登録リスク**: 上記の「sourceRaceId/sourceHorseIdが
無い」状態のままJRA公式データとKaggleデータを両方取り込むと、同一の実レース・
実馬が異なるraceId/horseIdの下で2つの別レコードとして登録される危険が
明確にある。現状の`validateAbilityData.mjs`は「同一馬の中でのraceId重複」
しか検知せず、「異なるhorseId間で同一実馬が二重登録されていないか」
「異なるraceId間で同一実レースが二重登録されていないか」を検知する仕組みは
無い。

## 6. Data Completeness

CHECKPOINT12.6で追加した`validate:data`の警告と、`predictionSnapshot.ts`の
`warnings`/`dataCompleteness`を突き合わせて、11項目を検知可能/不可能で分類した。

**検知できる**:
- **勝ち馬欠落**: `validate:data`（CHECKPOINT12.6追加、raceId単位で
  finishPosition=1の有無をチェック）。
- **raceField比較母集団不足**: `validate:data`（CHECKPOINT12.6追加、
  fieldSize vs 実データ頭数のチェック。ただし`fieldSize`が記録されている
  raceIdのみ有効）。
- **final3F不足**: `validate:data`既存warning（courseFinal3FBaselines条件
  カバレッジ、条件単位）。
- **raceTime不足**: `validate:data`既存warning（courseTimeBaselines条件
  カバレッジ、条件単位）。
- **weight不足**（過去走データの`carriedWeight`欠損）:
  `validate:data`のRACE_FIELDSスキーマで`carriedWeight`は必須・positive
  指定のため、欠損/不正値は**エラー**として弾かれる（警告より強い検知）。
- **horse未登録**（data/horses/に該当horseIdのファイルが無い）:
  `predictionSnapshot.ts`側で`getHorseRecentRaces()`が空配列を返し
  baseAbility=nullとして明示される（「能力0点」と混同しない設計、
  CHECKPOINT13テスト済み）。同一raceId内の重複（1頭の中の重複raceId）も
  `validate:data`が既存検知。

**検知できない（未検知）**:
- **過去走不足**（0件ではなく1〜2件など、算出はできるが信頼性が低いケース）:
  `calculateBaseAbility()`は1件でも平均を返し、Stage A/B側にもこれを
  明示的にwarningとして出す仕組みが無い（既存のbaseAbility算出ロジック
  そのものにも件数下限や confidence の概念が無い。これはBase Ability V1の
  既存仕様であり、本ラウンドで変更提案はしない）。
- **raceId不一致**（同一raceIdなのに馬ごとにracecourse/surface/distance/
  going/raceDateが食い違っている等のクロス馬整合性）: `validate:data`・
  `predictionSnapshot.ts`いずれにも該当チェックが無い。
- **同一race重複**（CSV1バッチ内で同じhorseId×raceIdの行が複数ある場合の
  取り込み時点での検知）: `buildImportResult.ts`はバッチ内重複を検知しない
  （書き込み後、`validate:data`の「同一馬内raceId重複」チェックで事後的に
  発覚するのみ）。異なるhorseId間での同一実レース二重登録は前述の通り
  検知手段が無い。
- **memberLevel計算不能**（その走の候補馬が0件でFALLBACK_MEMBER_LEVEL_SCORE
  にフォールバックしたこと）: `RacePerformance.memberLevelBreakdown`が
  nullになることで内部的には表現されているが、Stage A/B側の`warnings`配列
  には一切表出しない（baseAbilityの数値に静かに混ざるのみ）。
- **Suitability evidence不足**（4component中いくつが評価不能か）: これは
  厳密には「未検知」ではなく、`evaluatedComponentCount`フィールドとして
  **構造化データとしては既に取得可能**。ただし`HorseSnapshotEntry.warnings`
  配列には「4/4とも評価不能」の場合のみ文言化されており、「2/4のみ評価可能」
  等の中間ケースは`warnings`の自由文には出ず、フィールドを個別に見る必要が
  ある（設計上の欠落というより、UIでの表示方法が未設計という段階）。
- **プレースホルダーデータの混入**（STEP5で確認したrN-gM形式問題）:
  `validate:data`・`predictionSnapshot.ts`のいずれにも検知手段が無い
  （新規の重大な未検知項目としてSTEP5で確認）。

## 7. 外部データ投入時の理想経路に対するGap

理想形（`Raw → Normalize → Validate → Canonical Data → Ability`）に対して：

- **Raw→Normalize→Validate→Canonical**の骨格自体は、CSV経由に限れば
  **既に存在する**（`import/types.ts`冒頭のコメントに明文化された設計思想
  どおり、`csvParser.ts`→`normalize.ts`→`buildImportResult.ts`の3層構成）。
  `normalize.ts`は必須項目の型・範囲チェックを行い、`RacePerformanceInput`
  という中間形式（Canonical寄り）を経由してからでないと能力計算層
  （`RaceHistoryRawInput`）に渡らない。「外部データを直接ability engineへ
  渡さない」という設計原則自体は、この経路に関しては既に守られている。
- **不足している層**:
  1. **Source Adapter層が無い**: 現状「CSV」という1つの入力形式しか
     想定されておらず、JRA公式API・Kaggleデータセット・netkeiba等、
     形式が異なる複数Sourceを同じCanonical形式へ正規化する共通
     インターフェース（例: `SourceAdapter.toRacePerformanceInput(raw)`の
     ような抽象化）が存在しない。今回はSource Adapterの新規実装は行わない
     （指示どおり）。
  2. **Runner Resolve層が無い**（STEP1・STEP4で既述）: 実際のレース
     カードの馬名一覧→内部horseIdへの変換を、ロースター外の馬も含めて
     機械的に行い、未resolve分を明示的にレポートする専用の層が無い。
  3. **Source横断の重複検知層が無い**（STEP5・STEP6で既述）: 同一実データが
     複数Sourceから来た場合の突合・重複排除の仕組みが無い。
  4. **データ品質フラグ層が無い**: 「これはCSVから来た確定実データ」
     「これはV0プレースホルダー」を区別する構造が無く、STEP4で発見した
     15頭分のプレースホルダーデータが実データ用ディレクトリに紛れている。

## 8. 実際の11RをDry Runするために不足しているもの（優先順位順）

1. **【最優先・危険】`import:csv`は「まるごと置き換え」であり、今週のCSVを
   そのままそのコマンドで流すと、対象馬の既存の全過去走履歴が消える。**
   実際の11Rを投入する前に、必ず「対象馬の既存過去走＋今回の1走」を
   1つのCSVにまとめてから`import:csv`を実行する運用手順（または将来の
   マージモード実装）が必要。これを知らずに実行すると重大なデータ損失が
   起きる。
2. **Runner Resolve層**: 実際の出走馬名一覧から`RaceEntryInput[]`
  （特に正しい`horseId`）を作る手段が無い。特にロースター外の24頭は
  馬名からの自動resolveが利かない。
3. **プレースホルダーデータの隔離・除去**: 15頭のrN-gM形式データは、
   本番のdata/horses/ディレクトリに残したまま実運用を始めると、将来的な
   誤参照リスクになる。除去するか、明示的な隔離ディレクトリへ移すか、
   データ品質フラグを追加するかの方針決定が必要（今回は実施しない）。
4. **`SnapshotRaceTarget`への`raceNumber`追加要否の判断**: 現状Stage A/Bの
   計算には未使用だが、チェックポイント原文で明示的に要求されている項目
   であり、将来の運用ログ・レース識別のために追加すべきか判断が必要。
5. **Data Completeness未検知項目への対応方針**: STEP6の「未検知」リストの
   うち、少なくとも「raceId不一致」「同一race重複（バッチ内）」は
   実運用開始前に検知できないと事故りやすい。

## 9. 部分データ誤計算防止の再確認（最重要確認事項）

**結論: 「入力対象が1頭でも14頭でも、内部では必ず全体data/horsesを参照して
正式な同じBase Abilityが取得される」という意味で正しい。「部分データだけで
raceScoreを計算しても問題ない」という意味には全くなっていない。**

実コードで再確認した根拠：

1. `predictionSnapshot.ts`の`buildHorseSnapshotEntry()`は、対象馬の過去走を
   `getHorseRecentRaces(entry.horseId)`（`horseAbilityData.ts`）経由でのみ
   取得する。
2. `getHorseRecentRaces()`は`historyByHorseId[horseId] ?? []`を返すだけで、
   `historyByHorseId`は`horseAbilityData.ts`のモジュール読み込み時に
   **一度だけ**、`data/horses/*.json`の**全件**を`buildRaceHistory()`へ
   投入して計算される（`predictionSnapshot.ts`・`horseAbilityData.ts`の
   どちらにも、`entries`（Snapshotへ渡す出走馬一覧）の内容に応じて
   `buildRaceHistory()`を再実行するコードは存在しない）。
3. したがって、Stage A/BのSnapshotへ渡す`entries`（今回のレースの出走馬
   一覧）に何頭を含めるかは、各馬のbaseAbility・raceScoreの計算結果に
   **一切影響しない**。`entries`は「このレースで誰を評価対象にするか」
   という選択に過ぎず、raceScore自体の計算母集団（同一raceId内の実際の
   対戦相手データ）とは完全に独立している。
4. CHECKPOINT13のテストB（本ラウンドでもコードを変更していないため
   再現内容は同一）は、シェイクユアハート1頭のみを`entries`に含めた
   Snapshotと、ダミー馬13頭を追加した14頭編成のSnapshotとで、
   彼女のbaseAbility（70.3）・overallSuitabilityPercent・effectiveAbilityが
   完全に一致することを確認しており、これは上記1〜3の構造から論理的に
   導かれる帰結を実証したものである。

**もし「部分データだけでraceScoreを計算しても問題ない」という意味だったら
重大問題だったが、そのケースには該当しない**（そもそも
`predictionSnapshot.ts`はraceScoreを一切計算しておらず、既に完成した
raceScoreを含むRacePerformanceを読むだけであることが、上記2の事実から
構造的に保証されている）。

## 10. 次に必要な最小実装（提案のみ・未実装）

優先順位順。いずれも今回は実装していない。

1. **`import:csv`のマージモード追加**（STEP8-1の危険を解消）:
   既存ファイルの内容とCSVの新規行を合算してから書き込むオプション
   （`--merge`等）。既存の「まるごと置き換え」動作はデフォルトのまま
   残し、事故防止のための追加オプションとする案。
2. **Runner Resolve関数の新設**: 例えば
   `resolveRunners(entries: {horseName: string, ...}[]): {resolved: RaceEntryInput[], unresolved: {horseName: string, reason: string}[]}`
   のような、data/horses/の全horseId一覧＋ロースター外を含む
   horseName→horseId対応表を突き合わせ、未resolve分を明示的にリストアップ
   する関数。
3. **不足データレポート関数の新設**（STEP9で詳述）。
4. **データ品質フラグ**: `RacePerformance`または`data/horses/`のメタ情報
   （例: 別ファイル`data/horses/_meta.json`）に、プレースホルダー/実データの
   区別を持たせる設計。
5. **`source`/`sourceRaceId`/`sourceHorseId`フィールドの追加検討**:
   複数Source統合時の重複防止のため。ただし今回は設計要否の提起のみ。

## 11. 判定: B

**A（実データDry Runへ進める）ではない。無理にAを出さない。**

理由：
- Base Ability V1・Suitability V1本体、およびCHECKPOINT13で実装した
  Snapshot層自体（Stage A/B・future leakage対策・部分データ誤計算防止）は
  構造的に健全であり、STEP9で確認した通り「1頭でも14頭でも同じ結果」が
  保証されている。**モデル・Snapshot層自体には問題が無い。**
- しかし、実際のJRA 11Rを投入するために必要な**Input Layer（Runner Resolve・
  安全なデータ投入手順）が未整備**であり、特に「`import:csv`の破壊的な
  まるごと置き換え動作を知らずに使うと過去走データが消える」というのは
  実運用前に必ず解消すべき実務上のリスクである。
- さらに、本監査で新規に発見した「data/horses/内の15頭がV0プレースホルダー
  データのまま実データディレクトリに混在している」問題は、構造的な設計
  欠陥というよりデータ品質管理の欠落であり、CではなくBの範疇と判断した
  （現状これらのプレースホルダー馬同士でのみraceIdグループが閉じており、
  実データ馬への直接的な計算汚染は無いことを確認済みのため）。

以上より、**B：小さなInput Layer実装（Runner Resolve・安全な投入手順・
データ品質フラグ）が必要**と判定する。

## 遵守事項の確認

Base Ability V1・Suitability V1の数式・component weight・凍結仕様は本ラウンドで
一切変更していない。`predictionSnapshot.ts`を含む既存の本番コードにも一切
変更を加えていない（読むだけ）。Kaggle取り込み・netkeibaスクレイピング・
JRA大量収集・新Source Adapter実装・CHECKPOINT14着手のいずれも行っていない。

# Base Ability V1 検証データ完全性ガード・最終凍結（CHECKPOINT12.6）

2026-08-24実施。**Base Ability V1の正式数式・component weights・本番計算経路は
一切変更していない。** 本ラウンドで加えたのは (1) `scripts/validateAbilityData.mjs`
への警告（warning）追加のみ、(2) 検証スクリプト作成時の運用規約の文書化のみである。
`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`はコード1行も変更していない。

## 前提（CHECKPOINT12.5 B判定からの引き継ぎ）

CHECKPOINT12.5で、本番経路（`data/horses/`全体投入→`buildRaceHistory()`→
`raceFieldAggregatesByRaceId`適用）ではシェイクユアハートのbaseAbility=70.3が
正しく再現される一方、単独・部分的な出走馬データだけを使ったアドホック検証では
final3FScore/weightScoreの比較母集団が不足し、誤ったraceScore/baseAbilityを
算出しうることが判明した（実際にCHECKPOINT12.2でシュガークンの数値を誤報した
実例あり）。本ラウンドの目的は、この「不完全な比較母集団による誤検証」を
検知・防止する最小限の安全策を正式化し、Base Ability V1をA判定で凍結できる
状態に持っていくことである。

## STEP1: 比較母集団を必要とするcomponent一覧（実コードから確認）

`src/ability/raceHistoryPipeline.ts`の`buildRaceHistory()`を精読し、5成分それぞれが
「同一raceIdを共有する実データ（group）」にどう依存するかを確認した。

| component | 比較母集団への依存 | 実コード上の根拠 |
|---|---|---|
| **memberLevel** | **必要**（部分データでも動作はするが偏る） | `abilityCandidates`は`group`内の各エントリ自身のabilityBeforeRaceから構築（29行目付近）。候補馬が少ない/0だと`FALLBACK_MEMBER_LEVEL_SCORE=50`にフォールバックするか、真のTop5とは異なる偏ったTop5平均になる。 |
| **timeGapScore** | **不要**（raw入力値をそのまま使用） | `calculateTimeGapScore(entry.raw.timeGap, entry.raw.distance)` — `timeGap`はraw inputとして既に外部から与えられた値であり、`buildRaceHistory()`内でgroupから再計算されることはない。ただしそのraw値自体が正しく（勝ち馬とのタイム差として）記録されていることが前提。 |
| **raceTimeScore** | **必要、かつ最も危険** | `officialTimeSeconds = winner.raw.raceTime`（`winner = group.find((e) => e.raw.finishPosition === 1) ?? group[0]`）。**勝ち馬がgroupに含まれない場合、暗黙に`group[0]`（配列内の別の馬、多くの場合は対象馬自身）のタイムが「勝ち馬タイム」として代用される。final3F/weightの自己参照（検出しやすい0diff化）と異なり、こちらは"それらしい別の値"に静かに置き換わるため、誤りが視認しづらい。** |
| **final3FScore** | **必要** | `raceFinal3FMedianSeconds = fieldAggregate?.raceMedianFinal3FSeconds ?? median(group.map((e) => e.raw.final3F))`。groupが1件のみだと自己参照的中央値（`relativeDiffSeconds=0`への中立化）。 |
| **weightScore** | **必要** | `raceMedianWeight = fieldAggregate?.raceMedianWeightKg ?? calculateRaceMedianWeight(group.map((e) => e.raw.carriedWeight))`。同じく1件のみだと自己参照的中央値。 |

**新規判明事項（CHECKPOINT12.5では未指摘）**: raceTimeScoreの「勝ち馬代用」問題は、
final3F/weightの自己参照よりも本質的に危険である。final3F/weightは
「diff=0（中立）」という比較的無害で気づきやすい形に縮退するのに対し、
raceTimeScoreは「別の馬（多くの場合は対象馬自身）のタイムを勝ち馬タイムとして
誤用する」ため、値そのものが妥当に見えてしまい静かに汚染される。

## STEP2: 「完全なレース」の機械判定方法

推測ではなく、実際にRacePerformance/RaceHistoryRawInput型に存在するフィールドから
判定できる方法のみを採用した（`src/ability/types.ts`確認済み）。

- **利用可能**: `fieldSize`（optional、レース出走頭数）、`horseNumber`、
  `finishPosition`、raceId単位でロードされている実データの件数（＝実際に
  `data/horses/`内に存在するそのraceIdのエントリ数）。
- **利用不可**: `finishStatus`（除外/取消/中止）に相当するフィールドは
  `RacePerformance`/`RaceHistoryRawInput`型に存在しない。これはZIP形式のCSV
  取り込み段階でのみ扱われる概念であり、production data（`data/horses/*.json`）
  には「完走した馬の行」だけが反映される設計になっている。したがって
  「除外・取消・中止による正当な頭数差」をコード上で自動判別することはできず、
  警告止まりにする理由の一つとなる（後述STEP3）。

機械判定できる条件として以下2つを採用した：
1. **頭数不足判定**: `fieldSize`が分かっているraceIdについて、`data/horses/`内で
   実際にそのraceIdを持つ馬の数（horseIdの重複無し件数）が`fieldSize`未満なら
   「比較母集団が不足している可能性」と判定。
2. **勝ち馬欠落判定**: そのraceIdを持つどのエントリも`finishPosition === 1`で
   ない場合、「勝ち馬データが無い＝raceTimeScoreが別の馬のタイムを代用している
   可能性」と判定。`fieldSize`が無くても`finishPosition`だけで判定できるため、
   headcount判定より広く効く。

## STEP3: validate:data警告の実装

`scripts/validateAbilityData.mjs`に、raceId単位で上記2条件を集計する
`raceGroupInfoByRaceId`（`horseIds`・`maxFieldSize`・`hasWinner`）を追加し、
`raceFieldAggregates.json`で既に実データ中央値を上書き済みのraceId（＝
final3F/weightの自己参照リスクは既に回避済み）を除外した上で、2種類の警告を
出すようにした。

```javascript
for (const [raceId, info] of raceGroupInfoByRaceId.entries()) {
  if (raceFieldAggregateRaceIds.has(raceId)) continue; // 上書き済みは除外

  const loadedCount = info.horseIds.size;
  if (info.maxFieldSize !== null && loadedCount < info.maxFieldSize) {
    warn(`raceId "${raceId}": 実データ頭数(${loadedCount})がfieldSize(${info.maxFieldSize})より少ない可能性があります...`);
  }
  if (!info.hasWinner) {
    warn(`raceId "${raceId}": finishPosition=1（勝ち馬）のデータが見当たりません...`);
  }
}
```

**方針: 即エラーにはせず、常にwarningとした**（STEP3の指示どおり）。理由：
- 除外・取消・中止による正当な頭数差をコード上で判別できない（STEP2参照）。
- `data/horses/`の現行データの大半は「対象馬自身の過去走を1行だけ記録」する
  形で構築されており（対戦相手の全頭データまで集めているのは宝塚記念・大阪杯・
  有馬記念・日経賞・新潟大賞典など一部の重点検証レースのみ）、これは既存の
  意図的な設計・運用であって、直ちに「壊れている」わけではない。
- したがってエラー化すると`npm run validate:data`が常時失敗する状態になり、
  実運用が破綻する。警告として可視化し、個別に`raceFieldAggregates.json`での
  上書きを検討する材料として使うのが適切。

**実行結果**: 現行の`data/horses/`（40頭）に対して`npm run validate:data`を
実行したところ、頭数不足警告は0件（`fieldSize`がそもそも記録されている
raceIdが少ないため、未発火のケースが多い）、勝ち馬欠落警告は28件発生した
（既存データの大半が対象馬単独の過去走記録であるため）。**検証は
「検証成功（エラーなし）」のまま**であり、既存のtest/lint/build/
シェイクユアハートbaseAbility=70.3には一切影響しない。

## STEP4: 検証スクリプト正式規約（本ドキュメントで正式ルール化）

> **Base Ability V1／raceScoreを検証する際の正式ルール**
>
> 1. 必ず「`data/horses/`全体 → `buildRaceHistory()` → `raceFieldAggregatesByRaceId`
>    適用」という本番と同一の経路でRacePerformance全体を先に計算してから、
>    対象馬のIDで結果を抽出すること。
> 2. **特定の馬1頭だけを抽出して先にraceScoreを計算することは禁止。**
>    `buildRaceHistory()`に、検証対象馬だけの部分データや、検証対象馬集合だけの
>    部分データを渡してはならない（CHECKPOINT12.2の誤報の直接の原因であり、
>    CHECKPOINT12.5・12.6でも同じ誤りを再現できることが実証されている）。
> 3. 検証専用ZIPなど新規実データを追加した場合も、既存の`data/horses/`全体と
>    マージしてから`buildRaceHistory()`に渡すこと。ZIP単独データだけを渡すのは、
>    たとえZIP内に対象レースの全頭データが揃っていても、その馬の**過去の別の
>    レース**（例：宝塚記念）の比較母集団が失われるため不十分。
> 4. 検証結果に`npm run validate:data`の新規警告（頭数不足／勝ち馬欠落）が
>    出るraceIdが関わる場合、その結果を「本番相当の値」として報告書に記載する
>    前に、警告の原因（正当な除外・取消か、単純なデータ不足か）を確認すること。
> 5. 上記1〜3を守れない事情（対象馬の過去走の対戦相手データを実際に入手できない
>    等）がある場合は、その旨を明記した上で「参考値・単独計算」であることを
>    明示し、本番のBase Ability V1の値と混同されないようにすること。

このルールを本ドキュメントに正式記載し、以後のCHECKPOINTでの検証スクリプト
作成時に必ず参照する。

## STEP5: 単独計算の扱い（正式決定: 案A）

比較した3案：

- **案B（比較母集団不足componentを評価不能として扱う）は不採用**。これを実装
  するには`raceHistoryPipeline.ts`/`raceScore.ts`に新たな「evaluated」概念を
  組み込む必要があり、Base Ability V1の正式計算経路そのものに手を入れることに
  なる。本ラウンドの変更禁止事項（Base Ability V1正式数式・component weights）
  に抵触するため採用しない。
- **案C（Base Ability検証自体を拒否する）は不採用**。本番の`buildRaceHistory()`/
  `calculateBaseAbility()`は既にSTEP8で確認する通り安全（常に完全ロースターから
  1回だけ計算される）であり、実際にリスクがあるのはアドホック検証スクリプトの
  書き方だけである。共有の本番関数に新たな拒否（throw）ロジックを追加することは、
  リスクの所在（スクリプトの書き方）に対して過剰であり、かつ「正式数式・経路を
  変えない」という本ラウンドの最優先方針に反する。
- **案A（そのまま計算するがwarning）を採用**。実装は2段構え：
  1. データ層のwarning（STEP3で実装済み・`validate:data`）。
  2. 検証スクリプトを書く際の手続き的規約（STEP4で文書化）―― 部分データでの
     `buildRaceHistory()`呼び出しを禁止し、「全体計算→対象馬抽出」方式を必須とする。

正式数式を一切変えずに済み、かつ本番コードにもリスクが無いことが既に確認できて
いる（CHECKPOINT12.5 STEP7）ため、案Aが「検証・開発用途として最も安全」という
今回の判断基準に最も適合する。

## STEP6: シュガークン旧誤報の再現と検知確認

CHECKPOINT12.2の誤報時に実際に投入されていたデータ構成（シュガークン自身の
新潟大賞典1行のみ、他14頭無し）を、今回追加したvalidate:dataの検知ロジックと
同一のロジックで再現した（スクラッチ検証、実行後削除）。

- 旧誤報ケース（彼女の行のみ、fieldSize=15, finishPosition=15）:
  `loadedCount=1, maxFieldSize=15, hasWinner=false`
  → **頭数不足警告・勝ち馬欠落警告の両方が発火することを確認**。
- 参考: 実際の15頭全員を投入した正式ケース:
  `loadedCount=15, maxFieldSize=15, hasWinner=true`
  → 警告なし（正しく完全な比較母集団と判定される）。

raceScore自体は変更していないため、正式な値（実出走全頭投入時）は引き続き
raceScore=58.6（CHECKPOINT12.4で確定した正式値）のままであり、CHECKPOINT12.2の
誤報値raceScore=60.6は今回も「誤った検証データによる誤った結果」として
過去の記録どおり扱う（過去のCHECKPOINT文書は遡って修正しない、既存の
セッション方針を継続）。

## STEP7: シェイクユアハート単独計算の再現と誤認防止確認

同様に、シェイクユアハート単独計算ケース（宝塚記念、彼女の行のみ、
finishPosition=14）を検証したところ、`fieldSize`は記録されていない
（彼女の生データにfieldSizeフィールドが無い）ため頭数不足警告は発火しないが、
`hasWinner=false`（彼女は14着で勝ち馬ではない）により**勝ち馬欠落警告が発火する
ことを確認した**。

これにより、「単独計算のbaseAbility=68.3」を仮に検証スクリプトで得たとしても、
そのスクリプトが正式規約（STEP4）に従い`data/horses/`全体から計算していれば、
この単独計算パターン自体が発生しない。万一STEP4の規約を破って単独計算を
行った場合でも、その入力データに対して`validate:data`を実行すれば
（対象データが`data/horses/`に実際に含まれている場合）勝ち馬欠落警告が
発火するため、「68.3が公式な70.3相当の値である」という誤認をデータ層で
検知できる状態になっている。

**残る限界**: この警告は`data/horses/`に実際に保存されたファイルに対して
`npm run validate:data`を実行した場合にのみ機能する。検証スクリプトが
`data/horses/`とは別の一時的なin-memoryデータ（本ラウンドのスクラッチ検証や
zip:識別子のように）だけで完結する場合、validate:dataの警告経路には乗らない
ため、STEP4の手続き的規約（全体計算→対象馬抽出）の遵守が最終的な防波堤となる。
この限界は正直に報告する（無理に「完全に自動検知できる」とは言わない）。

## STEP8: 本番経路への非影響確認

- `scripts/validateAbilityData.mjs`は`data/horses/*.json`を独立に読み込んで
  検証するスクリプトであり、`src/ability/`配下の本番コード（`raceHistoryPipeline.ts`・
  `baseAbility.ts`・`horseAbilityData.ts`等）を一切importしていない。
  本番のビルド成果物（`npm run build`）にも含まれない（`scripts/`はViteの
  ビルド対象外）。
- Base Ability V1の数式ファイル（`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/
  `memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/
  `raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`）は本ラウンドで
  1行も変更していない（`git diff`で確認、変更ファイルは
  `scripts/validateAbilityData.mjs`と本ドキュメントのみ）。
- したがって本番の`data/horses → buildRaceHistory() → raceScore → baseAbility`
  パイプラインの計算結果・挙動は完全に無変更である。

## STEP9: 回帰確認

- `npm test`: 534/534件pass（既存の`abilityModelV1.regression.test.ts`含む）。
- `npm run lint`: エラーなし。
- `npm run build`: 型チェック・ビルドともに成功。
- `npm run validate:data`: 「検証成功（エラーなし）」。新規warning（頭数不足0件・
  勝ち馬欠落28件）が追加で出力されるが、いずれもwarningでありexit codeは0。
- シェイクユアハートbaseAbility=70.3: 正式経路（`data/horses/`全体投入）で
  引き続き再現されることを、既存の`abilityModelV1.regression.test.ts`の
  pass（534件に含まれる）で確認。

## STEP10/完了報告

1. **比較母集団を必要とするcomponent**: memberLevel（必要・偏りうる）、
   raceTimeScore（必要・最も危険＝勝ち馬代用リスク）、final3FScore（必要・
   自己参照中央値リスク）、weightScore（必要・自己参照中央値リスク）。
   timeGapScoreのみraw入力のため比較母集団不要。
2. **完全field判定方法**: `fieldSize`（optional）と実データ頭数の比較、および
   `finishPosition===1`（勝ち馬）の存在有無。`finishStatus`（除外/取消/中止）は
   型に存在せず自動判別不可、という限界も明記。
3. **validate:data追加内容**: raceId単位で「頭数不足」「勝ち馬欠落」の2種類の
   警告を追加（`raceFieldAggregates.json`で上書き済みのraceIdは除外）。
4. **warning/error方針**: 常にwarning。エラー化は正当な除外・取消・中止による
   差分を誤検知するため見送り、STEP3の指示どおりwarning優先とした。
5. **検証スクリプト正式規約**: 本ドキュメントSTEP4に明記（全体計算→対象馬抽出
   方式を必須化、部分データでの`buildRaceHistory()`呼び出しを禁止）。
6. **単独計算の正式扱い**: 案A（そのまま計算するがwarning）を採用。案B・Cは
   Base Ability V1正式数式・経路への変更を伴う／過剰であるため不採用。
7. **シュガークン旧誤報検知結果**: 旧誤報データ構成（彼女の行のみ）に対して
   頭数不足・勝ち馬欠落の両警告が発火することを確認。
8. **シェイクユアハート単独誤差検知結果**: 単独計算データ構成に対して勝ち馬
   欠落警告が発火することを確認（頭数不足警告はfieldSize未記録のため不発火、
   限界として明記）。
9. **production pipeline非影響**: `validateAbilityData.mjs`は本番コードを
   importせずビルド成果物にも含まれない。Base Ability V1数式ファイルは
   本ラウンドで無変更。
10. **baseAbility=70.3再現**: 正式経路（`data/horses/`全体投入）で維持を確認
    （regression test pass）。
11. **test/lint/build/validate:data**: 全て問題なし（534/534件pass、lint
    エラーなし、build成功、validate:data検証成功＝エラー0件）。
12. **technical debt**:
    (a) `finishStatus`（除外/取消/中止）情報が型に存在せず、頭数不足の原因が
        「正当な除外」か「単純なデータ不足」かをコード上で自動判別できない
        （引き続きwarningどまりとする理由）。
    (b) `fieldSize`が記録されていない過去走レコードが多く、頭数不足チェックが
        十分に機能していない（勝ち馬欠落チェックの方が現状広くカバーしている）。
    (c) 検証スクリプトが`data/horses/`に実際に書き込まれない一時データのみで
        完結する場合、validate:dataの警告経路に乗らない（STEP4の手続き規約が
        最終防波堤）。
13. **Base Ability V1 A/B/C最終判定**: **A**。理由：
    - 本番経路自体はCHECKPOINT12.5で構造的に安全と確認済み（historyByHorseIdは
      `data/horses/`全体から1回だけ計算、本ラウンドでも無変更）。
    - 不完全な比較母集団による誤検証は、data層（validate:data警告）と手続き層
      （STEP4規約）の2重の安全策で検知・防止できる状態になった。
    - CHECKPOINT12.2の実際の誤報ケースを含め、確認した全てのケースで新しい
      安全策が正しく検知することを実証した。
    - 残る限界（STEP7・technical debt）は、いずれも「本番の数値を誤らせる」
      ものではなく「検証プロセスの規律」に関するものであり、Base Ability V1
      自体の凍結判定を妨げるものではないと判断する。
14. **Base Ability V1を正式凍結してよいか**: **はい、正式凍結可能と判断する。**
    数式・component weights・本番計算経路は既に`docs/ability-model-v1.md`で
    凍結済みであり、今回追加した安全策により「凍結された数式が誤ったデータで
    誤検証される」リスクも実効的に低減された。
15. **次フェーズへ移行可能か**: 本ラウンドの指示どおりSTOPする。次フェーズ
    （新潟記念全頭展開等）への移行はChatGPT側の判断を待つ。
16. **次にChatGPTと決める必要がある項目**:
    - 新潟記念全頭展開に進むかどうか、進む場合のスコープ・順序。
    - `finishStatus`（除外/取消/中止）情報を型に追加するかどうか（technical
      debt (a)の解消要否）。追加する場合はBase Ability V1の数式には影響しない
      純粋なメタデータ拡張になる想定だが、正式着手はChatGPT承認後。
    - `fieldSize`の記録を既存データに遡って充実させるかどうか（technical
      debt (b)）。優先度・対象レースの選定が必要。

## 変更禁止の遵守確認

Base Ability V1正式数式・component weights・memberLevel数式・timeGapScore数式・
raceTimeScore数式・final3FScore数式・weightScore数式・HorseEvidence V1・
Suitability V1・RaceContext・trackBias・Race Review Engine・UI・オッズ・期待値
―― いずれも本ラウンドで一切変更していない。変更したファイルは
`scripts/validateAbilityData.mjs`（warning追加のみ）と本ドキュメントのみ。
スクラッチ検証コード（`/tmp`上の一時ファイル）は実行後すべて削除済み。

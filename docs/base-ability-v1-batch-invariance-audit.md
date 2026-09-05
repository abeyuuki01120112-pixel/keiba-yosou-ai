# Base Ability V1 バッチ不変性監査（CHECKPOINT12.5）

2026-08-24実施。**投資／実装ラウンドではなく、監査専用ラウンド。** 本ラウンドで
Ability Model V1の数式・定数は一切変更していない（`docs/ability-model-v1.md`の
凍結ルールに従い、変更禁止のまま）。

## 背景

CHECKPOINT12.4で、CHECKPOINT12.2が報告したシュガークンの新潟大賞典raceScore
（60.6）・baseAbility（59.5）が、検証スクリプトが「シュガークン自身の行のみ」を
投入し他14頭の実出走データを含めていなかったために生じた誤差であったと判明した
（正しい値: raceScore=58.6, baseAbility=58.5）。本ラウンドはこれを「一回限りの
スクリプトバグ」として片付けず、**Base Ability V1（およびその上流のraceScore／
buildRaceHistory）が『何頭同時に計算に投入するか』によって結果が変わる構造的な
問題を抱えていないか**を、推測ではなく実コードの実行結果によって確認することを
唯一の目的とする。

## STEP1/STEP2: シュガークン事象の完全再現とメカニズムの特定

`zzz_batchInvarianceAudit.test.ts`（スクラッチ、実行後削除）で、新潟大賞典
（raceId `202604010511`）を、(a) シュガークンの行のみを`buildRaceHistory()`に
投入した場合と、(b) 実際の15頭全出走データを投入した場合の2通りで再計算し、
`RacePerformance`の全内訳を比較した。

| 項目 | 単独（1頭のみ投入） | 実出走全頭（15頭投入） |
|---|---|---|
| raceScore | 60.6 | 58.6 |
| memberLevelScoreAtRace | 50（フォールバック） | 50（フォールバック） |
| timeGapScore | 56.4 | 56.4 |
| raceTimeScore | 70 | 70 |
| **final3FScore** | **70** | **54.1** |
| **weightScore** | **70** | **78** |
| raceFinal3FMedianSeconds | 35.2（=本馬自身の値） | 34.3（=実15頭の中央値） |
| relativeDiffSeconds（final3F） | 0 | -0.9 |
| raceMedianWeightKg | 58（=本馬自身の斤量） | 56（=実15頭の中央値） |
| weightDiffKg | 0 | 2 |

**メカニズムが実コードで確定した**: `raceHistoryPipeline.ts`の`buildRaceHistory()`
は、同一raceIdを共有する「group」（＝**今回のbuildRaceHistory()呼び出しに実際に
渡された入力データの中で**同じraceIdを持つエントリの集合）に対して、

```
raceFinal3FMedianSeconds = fieldAggregate?.raceMedianFinal3FSeconds
  ?? median(group.map((e) => e.raw.final3F))
raceMedianWeight = fieldAggregate?.raceMedianWeightKg
  ?? calculateRaceMedianWeight(group.map((e) => e.raw.carriedWeight))
```

を計算する。`raceFieldAggregatesByRaceId`（`raceFieldAggregates.json`由来の
上書き機構）にそのraceIdのエントリが無い場合、groupに1頭分の行しか無ければ
`median([35.2]) === 35.2`＝**本馬自身の値との自己参照中央値**となり、
`relativeDiffSeconds`が強制的に0になる（＝「相対的に平均的」という誤った
中立評価）。同じ理由でweightScoreも同様に自己参照によって中立化する。

memberLevelScoreAtRaceは今回どちらのケースでも50（`FALLBACK_MEMBER_LEVEL_SCORE`）
のまま変化しなかった。これは新潟大賞典の実15頭の大半がデビュー間もない馬で
`calculateAbilityBeforeRace`が計算不能（直近走データ不足）だったためであり、
「フォールバックが働かなかった」のではなく「フォールバックの結果が両ケースで
たまたま一致した」だけである点に注意（後述STEP4/5のシェイクユアハートの
ケースでは実際にmemberLevelScoreAtRaceが74.4→57.8と大きく変動しており、
memberLevel成分もこのバッチ依存性から無縁ではないことを別途確認済み）。

比較母集団は明確に「今回の`buildRaceHistory()`呼び出しの入力データの中で
同一raceIdを持つエントリ全体」であり、対象馬自身がgroupの唯一のメンバーで
あれば対象馬は必然的に自分自身とだけ比較される。同一レースの他馬データが
無い状態での相対評価が構造的に自己参照に陥ることが、実行結果によって確認された。

## STEP4/STEP5: CASE A（1頭のみ）／B（対象5頭のみ）／C（実出走全頭）比較

CHECKPOINT12.4で選定した5頭（2019104742、2021102224＝シュガークン、
zip:トラストモアリズム、zip:ミッドセンチュリー、zip:オプレントジュエル）について、
3パターンで`buildRaceHistory()`への入力データを構成し、baseAbilityを比較した。

| horseId | CASE A（自分のみ） | CASE B（対象5頭のみ） | CASE C（実出走全頭） |
|---|---|---|---|
| 2019104742 | 70.7 | 70.7 | 70.5 |
| 2021102224（シュガークン） | 53.7 | 53.7 | **58.5** |
| zip:トラストモアリズム | 66.8 | 67.1 | 67.2 |
| zip:ミッドセンチュリー | 69.1 | 69.5 | 70.6 |
| zip:オプレントジュエル | 68.1 | **67.6** | 68.8 |

観察された事実:
- 全馬でCASE A/B/C間に差が生じた（完全不変ではない）。
- 差の大きさはレースごとに異なる。5頭のうち互いに同一raceIdで対戦していた
  組（例: 「3歳以上1勝クラス」2026-08-09は3頭のzip:馬が共有）ではB/C間の
  差が比較的小さく、対象5頭以外の実際の対戦相手が多いレース（シュガークンの
  新潟大賞典＝実15頭立て）ではB→Cの差が大きい（53.7→58.5、4.8pt）。
- **単調増加ではない**（zip:オプレントジュエルはB=67.6がA=68.1より低い）。
  これは「馬を増やすほど高くなる／低くなる」という一方向のバイアスではなく、
  各レースの実際の相対的な立ち位置を正しく反映しようとした結果であることを
  示している。

### シェイクユアハート（凍結ベンチマーク値）自身での確認

**最重要の確認事項**として、凍結済みベンチマーク馬シェイクユアハートについて
同じ検証を行った（`zzz_shakeBreakdown.test.ts`、スクラッチ・実行後削除）。

| | 単独（自分の5走データのみ投入） | 実際の運用（`data/horses/`全体投入） |
|---|---|---|
| baseAbility | **68.3** | **70.3** |
| 直近5走raceScore | [53.8, 75, 68.7, 76.5, 67.6] | [62.6, 74.6, 67.8, 75.8, 70.6] |

宝塚記念（raceId `JRA-20260614-HANSHIN-11`）の内訳比較:

| 項目 | 単独 | 実際の運用（14頭対戦） |
|---|---|---|
| memberLevelScoreAtRace | 71.9（候補=自分のみ、participantCount=1） | 74.4（候補5頭、participantCount=14） |
| raceTimeScore | 54.1 | 93 |
| final3FScore | 70（自己参照中央値） | 58.7 |
| raceScore | 53.8 | 62.6 |

**結論**: baseAbility=70.3という凍結ベンチマーク値そのものが、`data/horses/`
ディレクトリ全体（＝シェイクユアハートの実際の対戦相手を含む完全なロースター）
を`buildRaceHistory()`に投入した場合にのみ再現される値であり、シェイクユアハート
1頭のみのデータを投入した場合は68.3という別の値になる。これは12.4のシュガークン
事象と全く同一のメカニズムであることが実行結果によって確定した。

## STEP3: 設計原則 — CASE A/B/Cは一致すべきか

**一致すべきではない、これは仕様どおりの挙動である**、というのが実コード調査
から導かれる結論。理由:

- `calculateBaseAbility()`自体は、既に計算済みのraceScore値の単純平均
  （直近最大5走、`roundToOneDecimal`）であり、**同一のraceScore入力に対しては
  純粋関数として完全に不変**（これはCHECKPOINT12.0で確認済みの事実で、今回も
  再確認され揺らいでいない）。
- 変動の実体は`buildRaceHistory()`が計算するraceScoreの上流成分
  （final3FScore・weightScore・memberLevelScoreAtRace）にある。これらは
  「そのレースで実際に何頭と戦ったか」という**本質的にレース相対的な情報**
  であり、真の対戦相手データを含まない入力からは正しい相対評価を導けない
  ―― これは欠陥ではなく、相対評価という設計思想そのものの必然的帰結である。
- したがって問うべき不変性は「同じ入力データセットに対して常に同じ結果を返すか」
  （＝purity）であって、これはYesである。「対戦相手データを恣意的に間引いた
  部分集合でも同じ結果を返すべきか」という問いにはNoと答えるのが正しい —
  部分集合は「異なる（より少ない）実データ」を表しており、異なる入力に異なる
  出力を返すのは当然である。

## STEP6: 「レース相対情報」と「馬の絶対能力」の分離

- final3FScore・weightScore・memberLevelScoreAtRaceは、あくまで「そのレースの
  実際の対戦相手集団の中での相対的な立ち位置」を測る成分であり、真の対戦相手
  データが揃っていることが前提となる。
- baseAbility（Base Ability V1）自体は、そうして計算済みのraceScoreを単純平均
  するだけの「馬個体の絶対能力の推定値」であり、`calculateBaseAbility()`の
  レベルでは「何頭同時にロードされたか」という**呼び出し側の恣意的な選択**に
  依存してはならない。
- `RacePerformance`型自体には、レースの真の完全フィールドを自律的に参照する
  仕組みは無い ―― 完全性は100%、`buildRaceHistory()`に何を渡すかという
  **呼び出し側の責任**に懸かっている。この構造的なギャップを埋めるために
  既に用意されているのが`raceFieldAggregates.json`（`RaceFieldAggregate`
  上書き機構）であり、`data/horses/`に真の全頭データが無いレースについて、
  実データに基づく`raceMedianFinal3FSeconds`／`raceMedianWeightKg`を直接
  供給することで、この自己参照中央値問題を回避する設計になっている
  （既存の設計、本ラウンドで新規追加したものではない）。

## STEP7: 本番到達可能性の再確認（`src/ability/horseAbilityData.ts`を本ラウンドで再読）

本番のエントリポイントである`loadHorseAbilityProfile(horseId)`と
`loadAllHorseAbilityProfiles()`のコードを本ラウンドで改めて読み直し、以下を
実コードで確認した（推測ではない）。

```typescript
// モジュール読み込み時に一度だけ全馬横断でパイプラインを実行する
const historyByHorseId = buildRaceHistory(
  typedRawData,              // ← import.meta.glob({eager:true}) で
                              //   data/horses/*.json を「全件」読み込んだもの
  typedTimeBaselines,
  typedFinal3FBaselines,
  raceFieldAggregatesByRaceId,
);

export function loadHorseAbilityProfile(horseId: string): HorseAbilityProfile | undefined {
  const recentRaces = historyByHorseId[horseId] ?? [];   // ← 上の1回計算済みmapから読むだけ
  return buildHorseAbilityProfile(horseId, horse.horseName, recentRaces);
}

export function loadAllHorseAbilityProfiles(): HorseAbilityProfile[] {
  return loadDefaultHorses().map((h) => {
    const recentRaces = historyByHorseId[h.horseId] ?? [];  // ← 同じmapから読むだけ
    return buildHorseAbilityProfile(h.horseId, h.horseName, recentRaces);
  });
}
```

**確認結果**:
- `historyByHorseId`はモジュール読み込み時に**1回だけ**、`data/horses/*.json`
  の**全件**を投入して`buildRaceHistory()`を実行した結果である。
- `loadHorseAbilityProfile`（1頭詳細画面が使用）と`loadAllHorseAbilityProfiles`
  （一覧画面が使用）は、**どちらも同じ1回計算済みの`historyByHorseId`を参照
  するだけ**であり、どちらも`buildRaceHistory()`を個別に・部分データで
  再実行することは一切ない。
- したがって、**本番のどのコードパス（1頭詳細画面・一覧画面を含む）も、
  STEP1/STEP2/STEP4/STEP5で実証した「部分ロースターによる自己参照中央値」の
  リスクに晒されない**。このリスクが実際に発現するのは、`buildRaceHistory()`
  を直接、部分データで呼び出すアドホックな検証スクリプト（CHECKPOINT12.2の
  誤ったスクリプト、および本ラウンドの`zzz_batchInvarianceAudit.test.ts`・
  `zzz_shakeBreakdown.test.ts`の「単独」ケース）に限られる。

**ただし残る別種の懸念**（新規発見ではなく、既存の別トラック技術的負債）:
`data/horses/*.json`という「本番の完全ロースター」自体が、ある実在のレースの
真の全出走馬を100%含んでいる保証は無い。含んでいない場合、本番のたった1回の
`buildRaceHistory()`呼び出しの中でも同じ自己参照中央値問題が発生しうる。
これは`raceFieldAggregates.json`が既にこの用途のために用意されている
（過去のCHECKPOINT8/9等で導入済み）が、**全レースを網羅的にカバーしている
保証は無く**、カバーされていないレースについては潜在的リスクが残る。これは
コードの欠陥ではなくデータ完全性の問題であり、既存の技術的負債として引き続き
個別管理する（本ラウンドで新規の修正対象にはしない）。

## STEP8: sparse data（0/1/2頭）での中央値の挙動

`median()`（`src/simulation/probability.ts`）と`calculateRaceMedianWeight()`
（`weightScore.ts`）を直接呼び出して確認した。

| 呼び出し | 結果 |
|---|---|
| `median([])` | `0` |
| `median([35.2])` | `35.2`（自己参照） |
| `median([35.2, 33.5])` | `34.35` |
| `calculateRaceMedianWeight([])` | `null` |
| `calculateRaceMedianWeight([58])` | `58`（自己参照） |
| `calculateRaceMedianWeight([58, 56])` | `57` |

- `NaN`は一切発生しない（STEP8の懸念どおり安全）。
- `median([])`は`0`を返し、`calculateRaceMedianWeight([])`は`null`を返す ―
  挙動に非対称性があるが、`buildRaceHistory()`内で`median()`に渡される
  `group`は必ず対象馬自身の1件を含むため、実際に空配列で`median()`が呼ばれる
  経路は存在しない（未到達コードパス、実害なし）。
- 1件のみの場合はどちらも「その1件の値をそのまま返す」という自己参照的挙動で
  一致しており、これがSTEP1/STEP2で確認したfinal3F/weight自己参照中央値問題の
  直接の実装上の原因である。

**memberLevelScoreAtRaceの「人工的な100点」懸念について**: コード全体を
`FALLBACK_MEMBER_LEVEL_SCORE`で検索した結果、フォールバック値は常に**50**
（`memberLevel.ts:46`、`raceHistoryPipeline.ts:107`の唯一の参照箇所）であり、
「候補馬が0件のとき100点が付与される」ような経路はコード上どこにも存在しない
ことを確認した。

## STEP9: 設計提案（本ラウンドでは実装しない）

STEP7の結論により、**本番コード（`horseAbilityData.ts`のエントリポイント）は
現状すでにこの自己参照中央値リスクから構造的に安全**であることが確認された
ため、本番コードへの緊急の修正は不要と判断する。

一方で、以下の2点は実在するリスクであり、今後の拡大（新潟記念全頭展開等）の
前に検討に値する設計案として提示する（**実装はしない、提案のみ**）。

1. **検証スクリプト規約の明文化**: `buildRaceHistory()`を直接・部分データで
   呼び出すアドホック検証は、必ず`data/horses/*.json`の全件（＋必要な実データ
   ZIP由来の対戦相手全件）を投入すること。1頭のみ・対象馬集合のみでの投入は
   使用禁止とする。これはCHECKPOINT12.2の実際の誤りの再発防止であり、本ラウンド
   でも同じ誤りを起こしうる構造であることが再確認された。
2. **`validate:data`への軽量な警告追加案**（設計のみ）: `data/horses/`内の
   各raceIdについて、そのraceIdを持つエントリの実際の件数と、エントリ内の
   `fieldSize`（実際のレース出走頭数）を比較し、大きく下回っている場合に
   警告（エラーにはしない）を出す仕組み。これにより「ロースターが不完全な
   まま自己参照中央値が発生している」レースを事前に可視化できる。
   `raceFieldAggregates.json`によるカバー範囲拡大の優先順位付けにも使える。

いずれも本ラウンドでは設計提案の提示に留め、実装は行っていない
（STEP9の「勝手に数式変更しないでください。実装が必要なら、まず設計案を
提示してSTOPしてください」に従う）。

## 完了報告（19項目）

1. **対象範囲**: Base Ability V1（`baseAbility.ts`）とその上流
   `buildRaceHistory()`（`raceHistoryPipeline.ts`）のバッチ不変性のみ。
   数式・定数の変更は一切なし。
2. **STEP1/STEP2結果**: シュガークン新潟大賞典で単独計算(raceScore=60.6)と
   実出走全頭計算(raceScore=58.6)が一致しないことを再現。原因はfinal3FScore
   （70→54.1）とweightScore（70→78）の自己参照中央値。上記STEP1/STEP2節参照。
3. **メカニズムの特定**: `raceFinal3FMedianSeconds`/`raceMedianWeight`が
   `raceFieldAggregatesByRaceId`に上書きが無い場合、同一raceId内の実際の
   投入データ件数（group.length）に依存した`median()`計算になり、1件のみ
   （対象馬自身のみ）だと自己参照的に0の相対差を返す。
4. **STEP3設計原則**: CASE A/B/Cは一致すべきではない ―― これは仕様どおりの
   挙動である。理由はSTEP3節参照（相対評価は真の対戦相手データを要する）。
5. **STEP4/STEP5結果**: 5頭（2019104742/シュガークン/zip:トラストモア
   リズム/zip:ミッドセンチュリー/zip:オプレントジュエル）全馬でCASE A/B/C
   間に差異あり。単調増加ではなく、実際の相対的立ち位置を反映した非線形な
   変動。上記表参照。
6. **シェイクユアハート自身での確認**: 凍結ベンチマーク値baseAbility=70.3も
   単独計算では68.3となり、同一メカニズムの影響を受けることを確認
   （宝塚記念raceScore: 単独53.8 vs 実際62.6）。
7. **STEP6結論**: `calculateBaseAbility()`自体は既計算raceScoreの単純平均で
   純粋関数として不変。変動源はraceScoreの上流成分（レース相対評価）にあり、
   これは設計上必然。`raceFieldAggregates.json`が既存の緩和機構。
8. **STEP7結論（本ラウンドで`horseAbilityData.ts`を再読して確認）**:
   `historyByHorseId`はモジュール読み込み時に`data/horses/*.json`全件を
   投入して1回だけ計算される。`loadHorseAbilityProfile`・
   `loadAllHorseAbilityProfiles`はどちらもこの1回計算済みmapを参照するのみで、
   `buildRaceHistory()`を個別・部分データで再実行することは無い。
9. **本番安全性の結論**: **本番のどのコードパスも部分ロースターによる自己
   参照中央値リスクに晒されない**。リスクはアドホック検証スクリプトの
   構築方法（12.2の実例、本ラウンドの検証スクリプト）に限定される。
10. **残存する別種の懸念**: `data/horses/`自体が特定レースの真の全出走馬を
    100%含む保証は無い（新規発見ではなく既存の技術的負債）。
    `raceFieldAggregates.json`で個別に緩和されているが網羅的カバーではない。
11. **STEP8結果**: `median([])=0`、`median([35.2])=35.2`（自己参照）、
    `calculateRaceMedianWeight([])=null`、`calculateRaceMedianWeight([58])=58`
    （自己参照）。NaN発生なし。`median([])`の空配列呼び出しは`group`が常に
    対象馬自身を含むため実際には未到達。
12. **人工的な100点の有無**: `FALLBACK_MEMBER_LEVEL_SCORE=50`のみが唯一の
    フォールバック値。「候補0件→100点」という経路はコード上存在しない。
13. **STEP9設計提案（未実装）**: (a)検証スクリプトは必ず全ロースターを投入する
    運用規約の明文化、(b)`validate:data`へのfieldSize不足検知警告の追加案。
    いずれも提案のみで実装せず。
14. **Base Ability V1数式への変更**: なし。`raceScore.ts`/`baseAbility.ts`/
    `memberLevel.ts`等、凍結対象ファイルは一切変更していない。
15. **HorseEvidence V1・Suitability V1への影響**: なし。本ラウンドは対象外
    （変更禁止項目として遵守）。
16. **シェイクユアハートbaseAbility=70.3の再現**: 本番の実データセット
    （`data/horses/`全体投入）では**70.3を維持**していることを確認
    （`abilityModelV1.regression.test.ts`含む既存534件のテストが全てpass）。
    単独計算時のみ68.3となる事実は上記の通り別途確認・報告済み。
17. **回帰確認**: `npm test`（534/534件pass）、`npm run lint`（エラーなし）、
    `npm run build`（型チェック+ビルド成功）、`npm run validate:data`
    （検証成功、既存の警告のみ・新規警告なし）全て問題なし。
18. **技術的負債**: (a)`data/horses/`の全レース網羅的完全性の保証が無い点
    （既存、継続追跡）、(b)アドホック検証スクリプトが同じ誤りを再発しうる点
    （本ラウンドで規約案を提示、未実装）。
19. **判定: B**。理由: 本番コード自体はSTEP7で構造的に安全と実コードで確認
    できたためA寄りの根拠は強い。しかし、(1)この自己参照中央値メカニズムが
    シェイクユアハートの凍結ベンチマーク値そのものに2.0pt（70.3→68.3）もの
    影響を与えるほど強力であること、(2)同じメカニズムが実際に一度、
    CHECKPOINT12.2で誤った公開数値を生んだ実例があること、(3)
    `validate:data`にはこのリスクを事前検知する仕組みが現状無いこと、
    の3点を踏まえ、「今のところ安全」で終わらせず、STEP9の設計提案
    （検証スクリプト規約の明文化・軽量警告の追加）を新潟記念全頭展開の
    前に検討することを推奨する、という意味でB判定とする
    （無理にA判定にしない）。

## 変更禁止の遵守確認

Base Ability V1（`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/
`memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`）、HorseEvidence V1
（`GATE_HORSE_EVIDENCE_SCALE=4.0`/`amplitude=5`/median集約/confidence shrink）、
Suitability V1、RaceContext、trackBias、Race Review Engine、新潟記念全頭展開、
オッズ、期待値計算 ―― いずれも本ラウンドで一切変更していない。スクラッチ
テストファイル（`zzz_batchInvarianceAudit.test.ts`／`zzz_shakeBreakdown.test.ts`）
は検証後に削除済み。

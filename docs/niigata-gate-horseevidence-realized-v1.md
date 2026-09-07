# 新潟芝2000m Gate HorseEvidence 実データ実証条件の確定＋既存データ最大活用監査（CHECKPOINT12.3）

CHECKPOINT12.2のB判定（gate component未実証）を受け、gate HorseEvidenceがevaluated=true
になるための正確な条件を実コードから完全抽出し、既存repo内（CHECKPOINT12.2の添付ZIPを含む）
で満たせるケースを最大限探索した。新規ZIPは要求せず、**既存データ（CHECKPOINT12.2で
既に監査済みのZIP自体）の中から、gate HorseEvidenceをfuture leakageなしで実証できる
実馬3頭を発見した。** Suitability V1数式・Gate数式・RaceContext・trackBias・新潟記念全頭
展開には進んでいない。本ラウンドはコード変更なし、検証のみ（一時スクリプトは確認後削除）。

---

## 1. gate evaluated=trueの完全条件

`collectGateHorseEvidenceDeltas()`（`suitabilityV1.ts`、無変更）を実コードから完全抽出。

```typescript
function collectGateHorseEvidenceDeltas(recentRaces, target) {
  const deltas = [];
  recentRaces.forEach((race, i) => {
    if (race.racecourse !== target.racecourse || race.surface !== target.surface || race.distance !== target.distance) return;
    const priorScoresNewestFirst = recentRaces.slice(i + 1).map((r) => r.raceScore);
    const abilityBeforeRace = calculateAbilityBeforeRace(priorScoresNewestFirst);
    if (abilityBeforeRace === null) return;
    deltas.push(race.raceScore - abilityBeforeRace);
  });
  return deltas;
}
```

gate componentが`evaluated=true`になるための条件（`deltas.length > 0`）を完全列挙する。

| 項目 | 必須/任意 | 内容 |
|---|---|---|
| horseId | 必須（監査用のみ） | `collectHorseGateEvidence`の戻り値に保持されるが、delta算出そのものには使わない |
| racecourse | **必須（完全一致）** | `recentRaces`中のある走が対象target.racecourseと一致すること |
| surface | **必須（完全一致）** | 同上、surfaceが一致 |
| distance | **必須（完全一致）** | 同上、distanceが一致（メートル単位の完全一致、距離帯の近さではない） |
| target race date | 直接参照なし | `recentRaces`配列自体が「対象レースより前」に既に絞り込まれている前提（呼び出し側の責務） |
| prior race date | **必須（間接的）** | 条件一致走より`recentRaces`配列内で後ろ側（＝日付が古い側）に、raceScoreを持つ走が最低1件存在すること |
| horseNumber | 任意 | `collectHorseGateEvidence`のrunsには保持されるが、delta算出には未使用（`relativeGatePosition`の算出のみに使う、gate percentには不使用） |
| fieldSize | 任意 | 同上 |
| relativeGatePosition | 任意（未使用） | `collectHorseGateEvidence`で算出されるが、gate percentの計算式には一切使われていない（監査用のメタ情報にとどまる、既存仕様） |
| finishPosition | 不要 | delta算出には一切使わない（raceScore自体が既にfinishPosition等から計算済みのため二重利用しない） |
| raceScore | **必須** | 条件一致走自身のraceScoreが必要（未計算だと算出不能） |
| abilityBeforeRace | **必須（≠null）** | `calculateAbilityBeforeRace(その走より後ろ側の全raceScore)`がnullでないこと（＝1件以上の後ろ側raceScoreが必要） |
| 最低sampleCount | **1（deltas.length>=1）** | 条件一致かつabilityBeforeRace算出可能な走が1件でもあればevaluated=true |

**要約**: 「対象条件（racecourse×surface×distance完全一致）に該当する走が`recentRaces`内に
1件以上あり、かつその走より`recentRaces`配列内でさらに古い側に、raceScoreを持つ走が
最低1件存在する」ことが、gate evaluated=trueの必要十分条件である。

---

## 2. future leakage防止条件

**実コードから確認した通りの構造で、future leakageは構造的に防止されている。**

`recentRaces`は`buildRaceHistory()`が返す「新しい順」配列であり、`slice(i + 1)`は
「配列内でインデックスiより後ろ＝日付が古い側」だけを取り出す。これにより、
ある走の`abilityBeforeRace`は必ず「その走より古い走のraceScore」だけから計算される。
本ラウンドで実際に検証した3頭（第4節）で、この動作を`race[i]`単位で逐次トレースした結果:

```
race[0](新しい走): priorRaces=[race[1]のraceId] → abilityBeforeRace算出可能
race[1](最も古い走): priorRaces=[]（recentRaces内にこれより古い走が無い） → abilityBeforeRace=null
```

3頭全てで、**最も古い走自身のdeltaは算出されず（abilityBeforeRace=null）、
新しい走のdeltaのみが算出された**（sampleCount=1）。これは「対象レース自身の結果、
対象レースより後の結果は絶対に使わない」という要求と一致する構造であることを
実コードのトレースで確認した。

---

## 3. repo内の新潟芝2000m複数走馬一覧

`data/horses/*.json`（既存37頭）・CHECKPOINT12.2で監査済みのZIP
（`niigata_turf2000_outer_real_races_2026.csv`、既に構造正常と確認済み、再監査不要）を
横断し、「新潟芝2000mを2回以上走っている同一馬」を機械的に探索した（結果を見て選ばず、
`horseName`の完全一致件数のみで抽出）。

**既存`data/horses/*.json`側には新潟芝2000mの実データが1件も無い**ため（CHECKPOINT12.1・
12.2で確認済み、今回再確認不要）、複数走候補はZIP自身の内部でのみ発見された。

| horseName | 該当走数 | raceId | date | frame | horseNumber | fieldSize | finishPosition |
|---|---|---|---|---|---|---|---|
| **トラストモアリズム** | 2 | 202604010607 | 2026-05-17 | 6 | 9 | 13 | 9 |
| | | 202604020610 | 2026-08-09 | 1 | 1 | 7 | 4 |
| **ミッドセンチュリー** | 2 | 202604010710 | 2026-05-23 | 5 | 8 | 15 | 3 |
| | | 202604020610 | 2026-08-09 | 2 | 2 | 7 | 5 |
| **オプレントジュエル** | 2 | 202604010710 | 2026-05-23 | 6 | 11 | 15 | 7 |
| | | 202604020610 | 2026-08-09 | 6 | 6 | 7 | 3 |

3頭とも「1勝クラス」の別開催日レース2走（2026-05-17または2026-05-23、および共通の
2026-08-09「3歳以上1勝クラス」）に出走していた。

---

## 4. 安全にhorseId照合できた頭数

**0頭（既存production canonical mappingへの接続という意味では）。** CHECKPOINT12.2の
時点で、この3頭の名前（トラストモアリズム・ミッドセンチュリー・オプレントジュエル）は
いずれも既存の安全なcanonical mapping（sapporoKinen.jsonロースター・既存インポート済み
CSV由来）に該当が見つからず、未紐付けのままだった（再確認済み、変化なし）。

**ただし、第3節の3頭はZIP自身の内部で完全一致するhorseNameが2回登場している
（同一ドキュメント内の同一表記どうしの突合であり、既存の別データセットへの
推測的な接続ではない）。** この2走を「同一の実馬」として扱うことは、
日本の中央競馬における馬名の一意性（同時期に同名の別馬が併存しない）という
現実の制約と、同一の監査済みZIP内での完全一致という条件から、安全な識別と判断した。
本番のcanonical horseIdへは一切接続せず、`zip:<horseName>`という検証専用の一時識別子
（本番未接続であることが名前から明確に分かる形式）のみを使用した。

---

## 5. gate実証可能馬数

**3頭。** トラストモアリズム・ミッドセンチュリー・オプレントジュエルの全頭で
gate componentがevaluated=trueになった。

---

## 6. gate実証結果

3頭全てで`evaluatedComponentCount=4`（distance・course・going・gate全て評価済み）を
達成した。本プロジェクトで初めて、新潟という別コース条件下で4component全評価に到達した。

| horseName | baseAbility | overallSuitabilityPercent | overallConfidence | effectiveAbility |
|---|---|---|---|---|
| トラストモアリズム | 67.2 | 100.4% | low | 67.5 |
| ミッドセンチュリー | 70.6 | 100.3% | low | 70.8 |
| オプレントジュエル | 68.8 | 100.4% | low | 69.1 |

---

## 7. prior sampleCount

3頭とも**gate HorseEvidence sampleCount=1**（対象条件一致走2件のうち、abilityBeforeRace
算出可能だったのは新しい方の1件のみ。古い方は`recentRaces`内にそれより前の走が無いため
delta算出不能、第2節参照）。

（`collectHorseGateEvidence`が返す`sampleCount`＝対象条件完全一致した走の総数は2だが、
これは監査用のfactCountsであり、実際にpercentへ使われるdelta数＝1とは区別される。
`gate.horseEvidence.sampleCount`は後者の1を指す。）

---

## 8. relativeGatePosition

`collectHorseGateEvidence()`（`horseGateEvidence.ts`、無変更）から実際に算出された値。
**gate percentの計算式には使われていない**（既存仕様、監査用メタ情報のみ）。

| horseName | 走 | frame | horseNumber | fieldSize | relativeGatePosition |
|---|---|---|---|---|---|
| トラストモアリズム | 2026-05-17 | 6 | 9 | 13 | 0.667 |
| | 2026-08-09 | 1 | 1 | 7 | 0.000 |
| ミッドセンチュリー | 2026-05-23 | 5 | 8 | 15 | 0.500 |
| | 2026-08-09 | 2 | 2 | 7 | 0.167 |
| オプレントジュエル | 2026-05-23 | 6 | 11 | 15 | 0.714 |
| | 2026-08-09 | 6 | 6 | 7 | 0.833 |

（`relativeGatePosition = (horseNumber-1)/(fieldSize-1)`、既存関数`calculateRelativeGatePosition`）

---

## 9. aggregatedDelta

| horseName | aggregatedDelta（=median of deltas、n=1のため単一値） |
|---|---|
| トラストモアリズム | **+7.8** |
| ミッドセンチュリー | **+3.0** |
| オプレントジュエル | **+4.8** |

---

## 10. evidenceDirection

**「evidenceDirection」という正式フィールドは現行コードに実装されていない**
（`horseEvidenceConfidence.ts`のコメントに「evidenceDirection/scoreの正式計算は
今回実装しない」とCHECKPOINT10.6の時点で明記されている、既存の未実装事項）。
ただし、既に計算済みの`aggregatedDelta`の符号から方向性を読み取ることはできる:
3頭とも**aggregatedDeltaが正**（トラストモアリズム+7.8、ミッドセンチュリー+3.0、
オプレントジュエル+4.8）——いずれも「対象条件（新潟芝2000m）での実際のraceScoreが、
その時点のabilityBeforeRace（それ以前の実力水準）を上回った」という、好走方向の
実績だった。これは3頭を「gate HorseEvidence実証」という機械的条件のみで選定した
結果であり、方向性を見て選んだものではない（第4節参照）。

---

## 11. confidence

3頭とも**"low"**（`resolveHorseEvidenceConfidence(1)` = 1〜2走→low、既存4段階閾値、
無変更）。

---

## 12. adjusted percent

| horseName | rawPercent | adjustedPercent（confidence=lowでshrinkTowardCenter適用後） |
|---|---|---|
| トラストモアリズム | 104.8% | **101.4%** |
| ミッドセンチュリー | 103.2% | **101.0%** |
| オプレントジュエル | 104.2% | **101.3%** |

（`rawPercent = 100 + 5×tanh(aggregatedDelta/4)`、`GATE_HORSE_EVIDENCE_AMPLITUDE=5`・
`GATE_HORSE_EVIDENCE_SCALE=4`とも今回変更なし。`adjustedPercent`は
`shrinkTowardCenter(rawPercent, "low")`＝weight0.3で100側へ縮小した値）

---

## 13. gateあり/なしのSuitability差

`aggregateSuitabilityComponents()`（既存関数、無変更）を、gateを含む4component配列と
含まない3component配列の両方に適用して比較した（比較専用の読み取り計算であり、
本番の`computeSuitabilityV1()`自体は変更していない）。

| horseName | overallSuitabilityPercent（gate込み） | overallSuitabilityPercent（gate除外） | 差分 |
|---|---|---|---|
| トラストモアリズム | 100.4% | 100.0% | **+0.4pt** |
| ミッドセンチュリー | 100.3% | 100.1% | **+0.2pt** |
| オプレントジュエル | 100.4% | 100.1% | **+0.3pt** |

---

## 14. effectiveAbility差

| horseName | effectiveAbility（gate込み） | effectiveAbility（gate除外） | 差分 |
|---|---|---|---|
| トラストモアリズム | 67.5 | 67.2 | **+0.3** |
| ミッドセンチュリー | 70.8 | 70.7 | **+0.1** |
| オプレントジュエル | 69.1 | 68.9 | **+0.2** |

---

## 15. 能力9割思想との整合

**整合している。** gate単独の影響は3頭とも+0.1〜+0.3ptというごく小さい範囲に収まり、
過大な変動は無い。理由は3つ重なっている: (1) aggregatedDeltaが+3.0〜+7.8と極端な
値ではない、(2) confidence=low（sampleCount=1）のため`shrinkTowardCenter`が
rawPercentの70%を中立側へ縮小している、(3) `aggregateSuitabilityComponents`が
4componentの単純平均を取るため、gate1つの影響は全体の1/4に希釈される。
「gateが主役になる」ような支配的影響は観測されなかった。

---

## 16. future leakage有無

**無い。** 第2節で実コードのトレースにより確認した通り、各馬の最も古い走
（2026-05-17または2026-05-23）自身のdeltaは算出されておらず（`priorRaces=[]`→
`abilityBeforeRace=null`）、新しい走（2026-08-09）のdeltaのみが、それより古い
実際の走のraceScoreを根拠に算出された。対象レース自身の結果や、対象レースより
未来の情報が混入する経路は存在しない。

---

## 17. 追加ZIP必要有無

**今回は不要だった。** CHECKPOINT12.2で既に監査済みのZIP自体の中に、gate実証に
必要な条件（同一馬が対象条件へ複数回出走した記録）を満たす馬が3頭存在しており、
新規のデータ収集なしで実証を完了できた。

---

## 18. 追加ZIP完全仕様（今回は不要だったが、将来の拡張のため記録）

今回は不要だったが、将来さらに多くの馬・より高いconfidence（sampleCount>=2以上）での
gate実証を目指す場合の仕様を、STEP10/11の要求に従い明示しておく（今回の判定には影響しない）。

- **最低頭数**: 3頭以上（結果を見て選ばないための最低ライン、既に確保済み）。
- **各馬最低走数**: 新潟芝2000mへの出走を**3走以上**（現状の2走ではsampleCount=1が
  上限。3走あれば、中間の走・最新の走の両方でdeltaが算出可能になりsampleCount=2、
  confidence=lowのまま変わらないが将来的な中央値の安定性が増す）。
- **必要なracecourse/surface/distance**: racecourse=新潟固定、surface=turf固定、
  distance=2000固定（対象条件の完全一致が必須のため、混在は不可）。
- **horseId必須か**: 必須ではない。今回同様、同一ZIP内で完全一致するhorseNameがあれば
  代替できる。ただし複数のZIPにまたがる場合はhorseId（または確実な識別子）が無いと
  安全な紐付けができない。
- **必要なframe/horseNumber/fieldSize**: 必須（gateコンポーネントの`relativeGatePosition`
  監査情報として、また将来のCoursePrior拡張時の枠番情報として必要）。
- **必要なraceScore関連項目**: finishPosition・raceTime（秒）・final3F（秒）・
  carriedWeightKg（既存スキーマ通り）。timeGap（着差秒）が直接無い場合は、
  同一レース内の勝ち馬raceTimeSecondsとの差分として算出可能（今回と同じ手法）。
- **必要な時系列期間**: 対象走より前に、最低1件（理想的には2件以上）の実データが
  存在する期間（同一コース内・他コースへの出走でも可、abilityBeforeRaceの計算には
  対象条件との一致を要求しないため）。
- **最低sampleCount**: 1（gate evaluated=trueの必要条件、既に達成）。
- **推奨sampleCount**: 3〜5（`resolveHorseEvidenceConfidence`の閾値でmedium
  （3〜4）・high（5+）に到達するため）。
- **推奨枠位置パターン数**: 内枠（frame1〜3）・中枠（4〜6）・外枠（7〜8）の
  3パターンをまんべんなく含むことが望ましい（gate補正の方向性に偏りが無いかを
  将来検証するため。今回の3頭はframe1,2,5,6,6,6とやや外枠寄り）。

---

## 19. CoursePrior technical debt

**維持している。今回もCoursePriorを新潟へ拡張していない。** CoursePrior
（`computeGateCoursePriorDetail`、無変更）の適用範囲は東京ダート1600m限定という
既存の凍結仕様のままであり、今回の3頭の新潟芝2000mのgate評価は全て
HorseEvidence経路のみで行われた（`source: "horseEvidence"`、`coursePrior: null`を
実際の出力で確認済み）。CoursePriorの新潟等への拡張は、別途明示的な承認が必要な
technical debtとして引き続き分離記録する。

---

## 20. baseAbility=70.3回帰

シェイクユアハートの`calculateBaseAbility`を、今回の3頭（`zip:トラストモアリズム`・
`zip:ミッドセンチュリー`・`zip:オプレントジュエル`）をin-memoryで追加した状態で実行し、
**70.3を完全再現した**（変化なし）。`abilityModelV1.regression.test.ts`も3件全て
パスした（コード変更していないため無変更のまま）。

---

## 21. test/lint/build/validate:data

- `npm test` — 534/534 pass（54 test files。CHECKPOINT12.2完了時点と同一件数、
  本ラウンドはコード変更が無いため変化なし）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 22. A/B/C判定

**A: 既存実データだけでgate HorseEvidenceを実証できた。**

CHECKPOINT12.2で既に監査済みのZIP自体の中から、新規のデータ収集なしで、
gate HorseEvidenceがfuture leakageなしでevaluated=trueになる実馬3頭を発見・実証した。
3頭とも4component（distance・course・going・gate）全評価に到達し、gateの影響は
+0.1〜+0.3ptという能力9割思想と整合する小さい範囲に収まった。future leakage・
Base Ability汚染・CoursePrior過大影響・gate過大影響のいずれも確認されなかった。

CHECKPOINT12.2のB判定（gate専用追加ZIPが必要）から一転してA判定となった理由:
CHECKPOINT12.2ではgate実証の対象を「既存repo horseIdに接続できる馬」に限定していたが
（グランディア・シュガークンの2頭のみ）、今回STEP4の指示に従い**添付ZIP自体の内部**
（複数レースにまたがる同一馬名の再登場）を機械的に探索した結果、既存repo接続を必要と
しない、より直接的な実証経路が見つかった。これはCHECKPOINT12.2の監査が誤っていた
わけではなく、探索範囲を「ZIP内部の重複馬」まで広げたことによる正当な追加発見である。

---

## 23. technical debt

- CoursePriorは引き続き東京ダート1600m限定であり、新潟を含む他コースでは
  構造的に検証不可能（第19節）。
- 3頭とも新潟芝2000mでの出走が2走のみのため、gate confidenceは"low"（sampleCount=1）に
  留まる。将来的な追加データ（第18節のスペック）でmedium/high水準まで引き上げる余地がある。
- `zip:<horseName>`という一時識別子は本ラウンドの検証専用であり、本番の
  `data/horses/`には一切反映していない。将来これらの馬を本番データとして正式採用する
  場合は、別途正規のhorseId命名・データ取り込み手順（CSV import等）を経る必要がある。
- CHECKPOINT12.2で発見した「`data/horses/grandia.json`等がV0プレースホルダーの
  可能性が高い」という技術的負債は未解決のまま継続する（今回のスコープ外）。

---

## 24. 次にChatGPTと決める必要がある項目

1. 今回発見した3頭（トラストモアリズム・ミッドセンチュリー・オプレントジュエル）を
   正式にhorseId付きで`data/horses/`へ取り込むかどうか（現状は検証専用のin-memory
   データのままで、本番未反映）。
2. Suitability V1のA判定を、新潟条件についても正式に確定するかどうか
   （今回はgate実証という個別要素のA判定であり、Suitability V1本体は
   CHECKPOINT11.17で既にA判定済み）。
3. `data/horses/grandia.json`等のV0プレースホルダー疑いファイル
   （CHECKPOINT12.2で発見、technical debt）の扱い。
4. 新潟記念全頭展開への着手タイミング（本ラウンドでは未着手）。
5. CoursePriorの東京ダート1600m以外への拡張を検討するかどうか（今回は
   technical debtとして維持のみ、実装は別途承認が必要）。

**ここでSTOPします。** A判定になりましたが、新潟記念全頭展開・RaceContext・trackBias・
オッズ・期待値計算にはChatGPT承認前に進みません。

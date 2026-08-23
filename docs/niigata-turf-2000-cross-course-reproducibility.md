# 新潟・芝・2000m 別コース再現性テスト（CHECKPOINT12.1）

CHECKPOINT12.0でシェイクユアハートのbaseAbility=70.3がA判定として確定した。今回は
完成したBase Ability→Suitability V1→effectiveAbilityの構造が、宝塚記念条件（阪神）
だけでなく別コース（新潟・芝・2000m）でも自然に再現できるかを、実馬2〜3頭限定で検証した。
新潟記念全頭予想ではない。本ラウンドはコード変更なし、検証のみ（一時スクリプトは確認後削除）。

検証は`buildRaceHistory()`（凍結パイプライン）＋`calculateBaseAbility`＋`computeSuitabilityV1`
（いずれも既存の凍結・本番接続済み実装、無変更）を直接呼び出す一時スクリプトで行った。

---

## 1. 対象馬2〜3頭

**選定は結果を見る前に固定した機械的条件のみで行った**: `data/horses/*.json`全馬
（37頭）から、(a) 直近5走以上の実データがある、(b) surface="turf"のレースが2走以上ある、
という条件を満たす馬を抽出し（該当29頭）、horseIdの辞書順で先頭3頭を選んだ
（結果内容に基づく選定は一切行っていない）。

- **2019104742**（horseName不明。既存のCSV由来の名前マップに該当なし）
- **2019105556**（同上）
- **2020103025**（同上）

いずれも新潟記念出走予定馬である必要はなく、モデル検証に適した実データの厚みだけで
選定した。

---

## 2. 各馬baseAbility

| horseId | 直近5走raceScore | baseAbility |
|---|---|---|
| 2019104742 | 72.6, 64.7, 74.6, 68.8, 71.6 | **70.5** |
| 2019105556 | 72.9, 73.6, 73.9, 75.6, 75.0 | **74.2** |
| 2020103025 | 61.2, 70.5, 63.5, 63.4, 68.5 | **65.4** |

`calculateBaseAbility()`（既存Base Ability V1、無変更）で算出。数式は一切変更していない。

---

## 3. distance

対象条件: racecourse=新潟, surface=turf, distance=2000, going=良（標準的な馬場状態、
今回のテストは実在しない仮想の新潟条件を検証する回のため標準値を採用。架空の実績データは
使っていない——historical evidenceは各馬の実過去走のみ）。

| horseId | evaluated | rawPercent | adjustedPercent | confidence | sampleCount |
|---|---|---|---|---|---|
| 2019104742 | true | 98.7 | 98.7 | high | 5 |
| 2019105556 | true | 100.0 | 100.0 | high | 5 |
| 2020103025 | true | 98.9 | 98.9 | high | 5 |

3頭とも直近5走（distance=2000mへの近さで重み付け）を使い評価できた。

---

## 4. course

| horseId | evaluated | rawPercent | adjustedPercent | confidence | sampleCount |
|---|---|---|---|---|---|
| 2019104742 | **false** | 100（中立プレースホルダー） | 100 | unknown | 0 |
| 2019105556 | **false** | 100（中立プレースホルダー） | 100 | unknown | 0 |
| 2020103025 | **false** | 100（中立プレースホルダー） | 100 | unknown | 0 |

**3頭とも評価不能。** 理由は第15節参照——`data/horses/*.json`全37ファイルに
「racecourse=新潟」の実レースが1件も存在しないため（機械確認済み、grep検索で0件）。
推測での埋め合わせは行っていない。

---

## 5. going

| horseId | evaluated | rawPercent | adjustedPercent | confidence | sampleCount |
|---|---|---|---|---|---|
| 2019104742 | true | 100.0 | 100.0 | high | 5 |
| 2019105556 | true | 99.9 | 99.9 | high | 5 |
| 2020103025 | true | 100.6 | 100.6 | high | 5 |

3頭とも直近5走が「良」馬場中心（実データ）で、going="良"との近さによる重み付け評価が
機能した。

---

## 6. gate

| horseId | evaluated | source | HorseEvidence使用 | CoursePrior使用 |
|---|---|---|---|---|
| 2019104742 | **false** | none | 無し（sampleCount=0） | 無し（対象コースが東京ダート1600mではない） |
| 2019105556 | **false** | none | 無し（sampleCount=0） | 無し（同上） |
| 2020103025 | **false** | none | 無し（sampleCount=0） | 無し（同上） |

**3頭とも評価不能。** HorseEvidence側は「新潟×turf×2000完全一致」の実績が無いため
sampleCount=0。CoursePrior側は対象コースが東京ダート1600m限定の適用範囲外のため
そもそも対象外（既存仕様、無変更）。gate/horseNumber/frameの実データも全ファイルで
0件（CHECKPOINT11.15〜11.16で確認済みの制約が今回も継続）。

---

## 7. evaluatedComponentCount / overallConfidence / overallSuitabilityPercent

| horseId | evaluatedComponentCount | overallConfidence | overallSuitabilityPercent |
|---|---|---|---|
| 2019104742 | 2（distance・going） | high | 99.4 |
| 2019105556 | 2（distance・going） | high | 100.0 |
| 2020103025 | 2（distance・going） | high | 99.8 |

**evaluated=false（course・gate）は平均計算から正しく除外されている。** `rawPercent=100`
という値はプレースホルダーであり平均には含まれない——3頭とも`evaluatedComponentCount=2`
（4ではない）がこれを裏付ける。仮に4つとも平均に含めていれば
（例: 2019104742で(98.7+100+100+100)/4=99.675）今回の実際の値（99.4、evaluated=trueの
distance98.7とgoing100.0のみの平均=(98.7+100)/2=99.35→99.4）とは異なる数値になっていたはずで、
除外ロジックが実データ上も機能していることを確認した。overallConfidenceはCHECKPOINT11.17で
正式化した仕様（evaluated=trueのみでweakest-link）通り、distance/going双方がconfidence=high
のため3頭とも"high"になった（旧仕様=案Aであれば、course/gateのunknownに支配され3頭とも
"unknown"になっていたはずで、この違いも実データで再確認できた）。

---

## 8. effectiveAbility

`effectiveAbility = roundToOneDecimal(baseAbility × overallSuitabilityPercent / 100)`
（正式式、無変更）。

| horseId | baseAbility | overallSuitabilityPercent | **effectiveAbility** |
|---|---|---|---|
| 2019104742 | 70.5 | 99.4% | **70.1** |
| 2019105556 | 74.2 | 100.0% | **74.2** |
| 2020103025 | 65.4 | 99.8% | **65.3** |

---

## 9. Base Ability順位

70.5(2019104742) 未満... 実際の順位: **2019105556(74.2) > 2019104742(70.5) > 2020103025(65.4)**

---

## 10. effectiveAbility順位

**2019105556(74.2) > 2019104742(70.1) > 2020103025(65.3)**

Base Ability順位と**完全に一致**（順位変動なし）。

---

## 11. 順位変動理由

新潟芝2000m条件下でのSuitability補正は3頭とも99.4〜100.0%という極めて中立に近い範囲に
収まった（course・gateが評価不能で平均に加わらず、distance・goingのみが実質的に効いたが、
その2つも中立からの乖離は最大でも-1.3pt程度）。このため、baseAbilityの差
（74.2/70.5/65.4という明確な序列）を覆すほどの補正は発生せず、Base Ability順位が
そのままeffectiveAbility順位として維持された。

「能力上位馬が適性で少し下がる」パターンは2019104742（70.5→70.1、-0.4）でわずかに見られ、
「能力下位馬が適性で少し上がる」パターンは2020103025（65.4→65.3で実際にはわずかに下降、
今回のサンプルではこのパターンは明確には観測されなかった）——ただしいずれも±1点未満の
微小な変動であり、「Suitabilityだけで極端な逆転を起こさない」という条件は3頭とも
満たしている。

---

## 12. 能力9割思想との整合

**整合している。** 3頭ともSuitability補正は±1点未満に収まり、Base Ability順位が
そのまま維持された。これは「馬の能力が9割」（オッズ・人気等を主要因にしないのと同様に、
条件適性だけで能力序列を覆さない）という設計思想と一致する結果である。ただし今回の
中立に近い結果は、course・gateという2componentが実データ不足で評価不能だったこと
（evaluatedComponentCount=2/4）の裏返しでもあり、「新潟固有の適性差」を積極的に検出できた
わけではない点は第13節で正直に報告する。

---

## 13. 新潟芝2000m固有情報の有無

**新潟という競馬場に固有の情報は、今回の3頭いずれについても一切持てていない。**
理由は明確: `data/horses/*.json`全37ファイルを機械確認したところ、
「racecourse=新潟」の実レースが1件も存在しない（grep検索で0件ヒット）。course
componentが評価不能（evaluated=false）なのはこの理由による——推測や代替値での
埋め合わせは行っていない。

今回actually評価できたのは「芝適性」（going component、馬場状態「良」との近さ）と
「距離適性」（distance component、2000m=middle帯との近さ）の2つのみであり、これらは
**新潟という特定コースに固有の情報ではなく、コース非依存の一般的な芝・距離適性**である。
したがって今回の検証結果は「Base Ability×Suitability構造が別コース条件でも構造的に
破綻せず動作する」ことは示せたが、「新潟固有の適性を正しく検出できる」ことまでは
示せていない（新潟の実データが無い以上、原理的に示しようがない）。新規データ収集は
本ラウンドでは行っていない。

---

## 14. 新潟記念条件変更の影響

新潟記念の斤量条件・施行条件（ハンデ戦か否か、賞金別定か等）の変更が、
Base Ability・Suitabilityのどちらに影響すべきかを整理する。

- **Base Abilityへの影響**: 無い。Base Ability V1は馬自身の過去5走のraceScore平均
  （第2節）であり、これから評価しようとしている「次走（新潟記念）」の施行条件は
  一切参照しない（future leakage防止の観点からも、対象レース自身の条件はBase Ability
  計算に混入させてはならない）。
- **Suitabilityへの影響**: 施行条件のうち「コース条件」（racecourse=新潟、surface=turf、
  distance=2000、going=当日馬場）はSuitability V1のtarget（`suitabilityTarget`）として
  正しく扱われる対象である（第3〜6節で実際に使用した通り）。
- **レース格・斤量条件そのものをSuitabilityへ直接入れてはいけない**: 今回の実装
  （`computeSuitabilityV1`）は`racecourse`/`surface`/`distance`/`going`/`gate`のみを
  入力として受け取り、レース名（"新潟記念"という文字列）や斤量条件（ハンデ/別定/馬齢等の
  区分）を直接の入力とする経路は存在しない（コード上のSuitabilityTargetRaceContext型・
  RaceGateInput型のいずれにもレース名・斤量区分フィールドは無い、実コード確認済み）。
  斤量そのものの影響はBase Ability側のraceScore構成要素の1つ・weightScore
  （その馬が過去走で実際に背負った斤量とレース中央値との差、CHECKPOINT12.0第13節）が
  担っており、これは「馬自身の過去の実斤量経験」を評価するものであって、次走
  （新潟記念）の斤量条件を予測的に反映するものではない。次走の斤量条件が変わった場合、
  それに対する評価はBase Ability・Suitabilityいずれの現行実装の範囲外であり、
  今回の変更禁止事項（RaceContext等）にも含まれない、将来の検討事項として位置づけられる。

---

## 15. データ不足箇所

- **course component**: 全37頭中、新潟の実レースを持つ馬が0頭。この条件下では
  Suitability V1のcourse componentは構造的にevaluated=falseにしかなり得ない。
- **gate component（HorseEvidence）**: 新潟×turf×2000への完全一致実績を持つ馬が0頭
  （course不足の直接的帰結）。
- **gate component（CoursePrior）**: 対象コースが東京ダート1600m限定のCoursePrior適用外。
- **horseName**: 選定された3頭（2019104742・2019105556・2020103025）は、既存の
  CSV由来の名前マップ（`data/import/samples/`配下のCSVから機械抽出）に該当エントリが
  見つからず、horseNameを本レポートで特定できなかった（horseIdでの報告に留める）。

---

## 16. 追加ZIPが必要か

**新潟の実レースデータ（`racecourse=新潟`のRacePerformance、対象馬を問わず）が
追加されない限り、course componentは原理的に評価不能なまま**である。今回のCHECKPOINTでは
新規データ収集は行っていないため、必要なZIPスペックの提案のみ記録する（実際の収集・
取り込みは次回以降の承認事項）:
- 新潟競馬場・芝・任意距離の実レース結果（対象は既存ロースターの馬に限らず、
  新潟のコース別基準タイム・上がり3F基準の構築にも使えるレース単位のCSV）。
- 必須列: raceId, raceDate, racecourse（"新潟"固定）, surface, distance, going,
  horseId, horseName, horseNumber, gate（枠番）, finishPosition, carriedWeightKg,
  actualRaceTimeSeconds, final3FSeconds, timeGapSeconds, fieldSize
  （既存のCSVインポート仕様と同じスキーマ、`docs/data-input-guide.md`参照）。
- gate（枠番）・horseNumber・fieldSizeが実際に埋まっているCSVであることが必須
  （現状の全データがこれらを欠いているため、gate component検証にはこの列の実データが
  不可欠）。

---

## 17. baseAbility=70.3回帰

`abilityModelV1.regression.test.ts`を単独実行し、3テストすべてパス。シェイクユアハートの
baseAbility=**70.3**を完全再現した。本ラウンドはコード変更を一切行っていない。

---

## 18. test/lint/build/validate:data

- `npm test` — 534/534 pass（54 test files。CHECKPOINT11.17完了時点と同一件数、
  本ラウンドはコード変更が無いため変化なし）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 19. A/B/C判定

**B: 構造は正しいが追加実データが必要。**

3頭とも、Base Ability→Suitability V1（evaluated/unevaluatedの正しい分岐、
evaluatedComponentCountによるcompleteness管理、overallConfidence新仕様の正しい動作）→
effectiveAbilityという計算パイプラインは、宝塚記念条件（阪神）と同様に新潟条件でも
一切のエラー・NaN・0点化・unknownの100埋め込みなく正しく動作した（第11節・第20節）。
これは「構造は正しい」ことの十分な証拠である。

しかし、A判定（コースを変えても自然に再現）とするには、今回evaluated=trueになったのが
distance・goingという**コース非依存の2componentのみ**であり、**新潟という特定コースに
固有の情報は一切評価できていない**（第13節）。course・gateの2componentが常に
evaluated=falseに固定されてしまうのは、モデルの欠陥ではなく実データの欠如
（第15節・第16節）が原因であるため「C: コースを変えると設計上の問題が出る」には
該当しない。しかし「新潟固有の適性差を検出できている」とまでは言えないため、
A判定も時期尚早と判断し、B判定とする。

---

## 20. technical debt

- 新潟の実レースデータが`data/horses/*.json`全体に0件（第13節・第15節）。
- gate/horseNumber/fieldSize（実際の枠番情報）が全実データファイルで0件という制約
  （CHECKPOINT11.15から継続、今回も新潟条件で再確認）。
- 選定した3頭（2019104742・2019105556・2020103025）のhorseNameが、既存のCSV由来
  名前マップでは特定できなかった（第15節）。

---

## 21. 次にChatGPTと決める必要がある項目

1. 新潟の実レースデータ（course component検証用）を追加ZIPで収集するかどうか
   （第16節のスペックを参考に）。
2. 新潟記念全頭予想への着手タイミング（本ラウンドでは着手していない）。
3. gate/horseNumber/fieldSizeの実データ収集を優先事項とするかどうか
   （新潟に限らず全コース共通の制約）。
4. 選定した3頭のhorseName特定（表示上の可読性のため）が必要かどうか。

**ここでSTOPします。** 判定はBとなりました。A判定になっても新潟記念全頭予想には
進まない予定でしたが、今回はB判定のため尚更、新潟記念全頭予想にはChatGPT承認前に
進みません。

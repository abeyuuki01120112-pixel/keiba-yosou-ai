# 新潟芝2000m Suitability V1 追加実データZIP投入・course/gate実証（CHECKPOINT12.2）

CHECKPOINT12.1のB判定（新潟の実レースデータがrepo内に0件）を受け、添付ZIP
（`niigata_turf2000_suitability_validation_v1.zip`）を監査・検証専用データとして
in-memoryでのみ取り込み、course/gate componentの実データ発火を検証した。モデル数式は
一切変更していない。`data/horses/`配下の既存ファイルは1件も書き換えていない
（検証専用データとして扱った）。

---

## 1. ZIP監査結果

**README.md・manifest.json・CSVすべて整合していた。**

- 収録: 2026年新潟芝2000m（左・外）の実レース5件、66行（manifest記載通り）。
- スコープ: 全66行が`racecourse=新潟, surface=turf, distance=2000, courseVariant=left_outer`
  で完全一致（不一致0件）。
- 各レースの`fieldSize`はレース内で単一値に統一されており、`horseNumber`は
  1〜fieldSizeの連番が過不足なく揃っていた（歯抜け・重複なし）。
- `frame`（枠番）は全行1〜8の範囲内（範囲外・非数値0件）。
- `horseNumber > fieldSize`となる行は0件。
- `finishPosition`は各レース内で1〜fieldSizeの連番が重複なく揃っていた（1件を除く）。
- **競走中止1件**（信濃川特別・タッチアンドムーブ）: `finishPosition`/`raceTimeSeconds`/
  `final3FSeconds`が空欄になっており、manifest/READMEの記載通り。0埋め等の推測補完は
  一切されていなかった。
- `carriedWeightKg`は全行正の妥当な範囲内。`final3FSeconds`も全行25〜45秒の妥当範囲内。
- `(raceId, horseName)`の重複行は0件。

**推測補完・不正値は検出されなかった。ZIPの構造・内容ともに信頼できる。**

---

## 2. 正常行数 / 除外行数

- 総行数: 66行
- 構造上問題のある行: 0件
- 能力計算に使える完走行: 65行
- 除外行（競走中止、finishPosition等が空欄のため能力計算対象外）: 1件
  （信濃川特別・タッチアンドムーブ）

---

## 3. horseId照合結果

ZIPのhorseIdはREADME記載通り全欄空。**repo内の既存canonical mapping
（sapporoKinen.jsonロースター16頭のhorseName→horseId、および既存インポート済み
CSV由来のhorseName→horseId、計約31件）と、ZIP内の66行から得た63件の重複除去済み
horseNameを、完全一致（推測・類似一致は一切行わない）でのみ照合した。**

**安全に照合できたのは2頭のみ**:

| ZIP内horseName | 一致したcanonical horseId | 一致元 |
|---|---|---|
| グランディア | `grandia` | sapporoKinen.jsonロースター |
| シュガークン | `2021102224` | 既存インポート済みCSV |

残り61頭は、既存の安全なマッピングに該当が見つからず**未紐付けのまま**とした
（名前の類似一致・手動推測・新規ID生成は一切行っていない）。

**重要な追加監査結果（グランディアについて）**: `data/horses/grandia.json`の既存内容を
確認したところ、そこに記録されている5走はraceId="r0-g2"〜"r4-g3"という
本プロジェクト初期のV0プレースホルダー実装（`docs/`記載のCHECKPOINT以前、
16頭サンプルデータ作成タスク由来）特有の合成IDパターンであり、raceNameも
「中山特別戦」「札幌重賞トライアル」等の実在しないJRA正式名称だった。
これは実データではなくプレースホルダー（架空）データである可能性が高いと判断した。
**CLAUDE.mdの絶対原則5（プレースホルダー・捏造データを実データとして混入させない）に
従い、グランディアの既存プロファイルへZIPの実データ行を接続することはしなかった。**
名前は安全に照合できたが、既存データの性質上「安全に接続できない」ケースとして扱い、
本ラウンドの実証には使用していない。

これに対し**シュガークン(2021102224)の既存プロファイル**は、raceId=
"JRA-20260614-HANSHIN-11"（宝塚記念、実際のJRA公式raceId形式）の1走のみで構成されており、
既存の数値ID馬（実CSVインポート由来）と同じ形式のため実データと判断できた。したがって
本ラウンドの実証は**シュガークン(2021102224)のみ**を対象に、in-memoryでのみZIPの
新潟大賞典行を追加する形で行った（`data/horses/2021102224.json`自体は無変更）。

---

## 4. course実証ケース

**シュガークン(2021102224)で、course componentが本プロジェクトで初めて
target=新潟に対しevaluated=trueになった。**

```json
{
  "horseName": "シュガークン",
  "evaluated": true,
  "rawPercent": 101.8,
  "adjustedPercent": 100.5,
  "confidence": "low",
  "sampleCount": 1,
  "source": "horseEvidence",
  "HorseEvidence使用": "有り（新潟大賞典1走、raceScore=60.6を全体平均raceScore=59.5と比較）",
  "CoursePrior使用": "無し（distance/course/going componentにCoursePrior相当の実装は無い、既存仕様）"
}
```

CHECKPOINT12.1で3頭全てcourse=evaluated=falseだった状態が、ZIPの実データ1行追加により
実際に改善したことを確認した。

---

## 5. Gate component実証

**evaluated=falseのまま（改善しなかった）。**

```json
{
  "horseName": "シュガークン",
  "frame": 8,
  "horseNumber": 15,
  "fieldSize": 15,
  "relativeGatePosition": "算出可能(HorseEvidenceSourceRace型は保持するが、gate percentの算出には未使用)",
  "HorseEvidence sampleCount": 0,
  "rawPercent": 100,
  "adjustedPercent": 100,
  "confidence": "unknown",
  "source": "none"
}
```

**理由（実コードから確認、構造的な制約）**: gate componentのHorseEvidence経路
（`collectGateHorseEvidenceDeltas`）は、対象条件（racecourse×surface×distance完全一致）に
該当する各走について、**その走より古い側の走からabilityBeforeRace（=直前までの
raceScore平均）を計算できて初めて、rawPerformanceDelta（=raceScore−abilityBeforeRace）が
算出できる**設計になっている。シュガークンにとって新潟大賞典（2026-05-16）は、
今回のin-memory追加後の2走中もっとも古い走（彼女の実データ上、最も過去の記録）であり、
**その走より前の実データが1件も存在しないため、abilityBeforeRaceが算出不能
（null）**——結果としてdeltaが1件も得られず、HorseEvidence sampleCount=0のまま
evaluated=falseとなった。これは推測を避ける既存仕様が正しく機能した結果であり、
バグではない。CoursePrior fallbackも、対象コースが東京ダート1600m限定の適用外
（新潟は対象外）のため発火しなかった——**優先順位（HorseEvidence優先・CoursePrior
フォールバック）を確認する以前に、CoursePriorの適用範囲自体が新潟を含んでいない**
（第13節で詳述）。

---

## 6. CoursePrior発火有無

**発火していない。今回のZIP追加によっても発火可能にはならない。**

理由は第5節・第13節の通り、CoursePrior（`computeGateCoursePriorDetail`）の適用範囲は
東京ダート1600m限定という既存の凍結仕様（CHECKPOINT8で確定、今回変更禁止）であり、
新潟という競馬場自体がそもそも対象外である。したがって、新潟の実データをどれだけ
追加してもCoursePriorは構造的に発火し得ない——これはデータ不足ではなく、
CoursePriorの適用範囲がそもそも新潟をカバーしていないという設計上の事実である。

---

## 7. 3component以上評価ケース

**シュガークン(2021102224)で3component（distance・course・going）がevaluated=true
になった。**

| component | evaluated | rawPercent | adjustedPercent | confidence | sampleCount | source |
|---|---|---|---|---|---|---|
| distance | true | 100.5 | 100.2 | low | 2 | horseEvidence |
| course | true | 101.8 | 100.5 | low | 1 | horseEvidence |
| going | true | 101.2 | 100.4 | low | 2 | horseEvidence |
| gate | false | 100（プレースホルダー） | 100 | unknown | 0 | none |

---

## 8. 4component評価ケース

**存在しない。** 今回安全に接続できた実データ馬は1頭（シュガークン）のみで、
その1頭でもgateはevaluated=falseに留まった（第5節）。第6節・第13節の通り
CoursePriorも新潟には適用不能なため、今回の実データ範囲では4component全評価の
実馬ケースを作ることは原理的にできない。距離／競馬場を問わず「対象条件より前に
その馬自身の対象条件完全一致走がもう1件ある」馬が実データとして追加されれば
gateもevaluated=trueになりうる（第26節「追加ZIPが必要か」参照）。

---

## 9. 各馬baseAbility

**シュガークン(2021102224)**: 直近2走（実データのみ、in-memory追加後）

| raceName | date | raceScore |
|---|---|---|
| 宝塚記念 | 2026-06-14 | 58.4 |
| 新潟大賞典 | 2026-05-16 | 60.6 |

`calculateBaseAbility()`（既存Base Ability V1、無変更）: **baseAbility = 59.5**
（(58.4+60.6)/2=59.5、2走のみのため既存仕様通り2走均等平均）。

（グランディアはbaseAbility算出対象から除外——第3節の理由により）

---

## 10. 各component詳細

第7節の表を参照。加えて、各componentの`reason`テキストを含む完全な出力:

- **distance**: 「直近2走のうち、距離2000m（middle帯）との近さに応じて重み付けした2走
  （重み付き平均raceScore=59.8）を、全体平均raceScore=59.5と比較。raw=100.5% →
  confidence(low)で縮小しadjusted=100.2%。」
- **course**: 「直近2走のうち競馬場「新潟」での1走（平均raceScore=60.6）を、
  全体平均raceScore=59.5と比較。raw=101.8% → confidence(low)で縮小しadjusted=100.5%。」
- **going**: 「直近2走のうち、馬場状態「良」との近さに応じて重み付けした2走
  （重み付き平均raceScore=60.2）を、全体平均raceScore=59.5と比較。raw=101.2% →
  confidence(low)で縮小しadjusted=100.4%。」
- **gate**: 「本人実績が無く、CoursePriorは東京ダート1600m限定のため対象コースでは
  評価不能（推測で埋めない）。」

---

## 11. evaluatedComponentCount

**3**（distance・course・going。gateは含まれない）。

---

## 12. overallConfidence

**"low"**。CHECKPOINT11.17で正式化した仕様（evaluated=trueのcomponentのみで
weakest-link）通り、distance/course/goingの3つ全てがconfidence=low
（sampleCount 1〜2の小サンプルのため）であることから、"low"となった。
evaluated=falseのgateはこの計算に含まれていない（新仕様が正しく機能）。

---

## 13. overallSuitabilityPercent

**100.4%**。evaluated=trueの3component（distance100.2・course100.5・going100.4）の
単純平均=(100.2+100.5+100.4)/3=100.37→100.4。gate（rawPercent=100のプレースホルダー）は
平均計算に含まれていない（含めていれば(100.2+100.5+100.4+100)/4=100.275となり、
実際の値100.4とは異なっていたはずで、除外ロジックが正しく機能していることを再確認した）。

---

## 14. effectiveAbility

```
effectiveAbility = roundToOneDecimal(59.5 × 100.4 / 100) = roundToOneDecimal(59.738) = 59.7
```

| baseAbility | overallSuitabilityPercent | effectiveAbility |
|---|---|---|
| 59.5 | 100.4% | **59.7** |

---

## 15. Base Ability順位

**比較不能（1頭のみ）。** 今回安全に実データで検証できたのはシュガークン1頭のみ
（第3節）であり、CHECKPOINT12.1のような複数頭の順位比較は行えなかった。

---

## 16. effectiveAbility順位

同上、比較不能（1頭のみ）。ただしBase Ability(59.5)とeffectiveAbility(59.7)の差は
+0.2にとどまり、Suitability補正による極端な変動は無いことは確認できた。

---

## 17. 新潟固有情報を検出できたか

**部分的に検出できた（course componentのみ）。** これがCHECKPOINT12.1からの
最も重要な進展である。

- **course component**: 「新潟」という特定競馬場での実績（新潟大賞典1走、
  raceScore=60.6）を根拠に、他の（新潟以外の）走の平均raceScore=59.5との比較で
  raw=101.8%というcourse固有の補正値を算出した。これはCHECKPOINT12.1では
  一切得られなかった、**新潟という競馬場に固有の情報**である。
- **distance/going component**: これらは前回同様、コース非依存の一般的な距離・
  馬場適性であり、新潟固有の情報ではない（第7節の通りsampleCount=2はいずれも
  彼女の直近2走全体を対象にした重み付け平均であり、新潟という条件自体を
  特別扱いしていない）。
- **gate component**: 新潟固有の枠番情報を評価するには至らなかった（第5節）。

**総合評価**: CHECKPOINT12.1で確認された「course/gateが構造的に評価不能」という
限界のうち、courseについては実データ追加で明確に解消できることを実証した
（データ不足が原因であって設計上の欠陥ではなかったことの直接証拠）。gateは
今回の1頭・1走の追加だけでは解消されなかったが、これも同じくデータ不足が原因
（「対象条件より前の走」が必要という構造的要件）であり、追加の実データがあれば
解消できる見込みが高い（第26節）。

---

## 18. CoursePrior過大影響有無

**該当なし（そもそも発火していない、第6節参照）。** 過大影響の評価対象自体が
存在しなかった。

---

## 19. gate過大影響有無

**該当なし。** gateはevaluated=falseのままで、overallSuitabilityPercentの平均計算
（第13節）に一切寄与していない。

---

## 20. future leakage有無

**無い。** ZIPの新潟大賞典（2026-05-16）は、シュガークンの既存の宝塚記念
（2026-06-14）より前の日付であり、`buildRaceHistory()`の日付昇順処理により
正しく「より古い走」として扱われた（実際の出力でも`recentRaces`が
[宝塚記念(新しい), 新潟大賞典(古い)]の順で並んでいることを確認済み）。
新潟大賞典を評価する時点で、それより未来の情報（宝塚記念の結果等）が
混入する余地は無い設計のまま変更していない。

---

## 21. Base Ability汚染有無

**無い。** シュガークンのbaseAbility=59.5は、彼女自身の実raceScore
（58.4・60.6）のみから計算されており（`calculateBaseAbility`、無変更）、
Suitability側の情報が逆流する経路は存在しない。またシェイクユアハートの
baseAbility=70.3も本ラウンドの変更（シュガークンのみへのin-memory追加）の
影響を受けず、完全に不変であることを確認した（第22節）。

---

## 22. シェイクユアハートbaseAbility=70.3回帰

今回のZIP検証（`2021102224`のみへのin-memory追加、`data/horses/`ファイル自体は
無変更）を行った状態で`calculateBaseAbility(historyByHorseId["shakeyourheart"])`を
実行し、**70.3を完全再現した**（変化なし）。`abilityModelV1.regression.test.ts`
（本番の回帰テスト、コード変更していないため無変更のまま）も3件全てパスした。

---

## 23. test/lint/build/validate:data

- `npm test` — 534/534 pass（54 test files。CHECKPOINT12.1完了時点と同一件数、
  本ラウンドはコード変更が無いため変化なし）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 24. technical debt

- `data/horses/grandia.json`（および同じくV0期由来と見られる他の「名前付き」
  ファイル: houohbiscuits・igacchi・magicsands・onyankopon・pinkgin・readiness・
  roshampark・sakurafarrell・admireterra・arata・ecolowaltz・zendanhayabusa・
  meinermount・shohei）は、raceIdパターン（"rN-gM"）・raceName
  （実在しないJRA正式名称）から、V0プレースホルダーデータである可能性が高いと
  今回新たに確認した。これらのファイルが実データとして本番のBase Ability/
  Suitability計算に使われ続けている場合、CLAUDE.md絶対原則5に抵触する
  リスクがある。**今回のCHECKPOINTのスコープ外だが、次回以降に精査・
  実データへの置き換えまたは除外を検討すべき重要な技術的負債として報告する。**
- ZIP内61頭が未紐付けのまま（第3節）。追加の安全なhorseId紐付け手段（例:
  既存の別ソースにJRA公式馬名マスタがある等）が無い限り、これらの馬の実データは
  本番のHorseEvidenceへ接続できない。
- gate componentのHorseEvidence実証は、新潟に限らず「対象条件より前の同条件走」を
  要求する構造上、初回の新条件挑戦馬では原理的に達成できない（第5節）。追加データは
  「同一馬が同一条件に複数回出走した記録」を含む必要がある。
- CoursePriorは新潟を含む東京ダート1600m以外の全コースで構造的に検証不可能
  （第6節・第13節、既存の凍結仕様）。

---

## 25. A/B/C判定

**B: 構造は正しいが、まだ追加データが必要。**

STEP17の「A判定の最低条件」（course実証・gate実証・新潟固有情報の反映・過補正なし・
Base Ability非汚染・future leakageなし）のうち、**gate実証が達成できなかった**
（第5節）ため、A判定の条件を満たさない。

- course実証: 達成（第4節）。
- gate実証: **未達成**（第5節、構造的な理由——初回条件走のため「前走」が無い）。
- 新潟固有情報の反映: 部分的に達成（course componentのみ、第17節）。
- 過補正なし: 確認済み（第18節・第19節、CoursePrior・gateともに影響ゼロ）。
- Base Ability非汚染: 確認済み（第21節・第22節）。
- future leakageなし: 確認済み（第20節）。

course実証という重要な前進があった一方、gate実証という明示的な必須条件を
満たせなかったため、A判定ではなくB判定とする。C判定（構造上の問題）には
該当しない——今回発見された制約（gate=evaluated=false、CoursePrior未発火）は
いずれも実データ不足に起因する既知の・説明可能な挙動であり、モデルの
バグ・欠陥ではない。

---

## 26. 追加ZIPが必要か

**必要。** 具体的には以下の条件を満たす追加データがあれば、次回gate実証にも
到達できる見込みが高い:

- 新潟芝2000mへの出走歴が**2走以上**ある馬（同一馬が新潟芝2000mへ複数回出走した
  記録、またはその馬が新潟芝2000m出走**より前**に何らかの実データ走を持っている馬）
  の実データ。
- 上記に加え、実際のfinishPosition・raceTime・final3F・carriedWeight・
  frame/horseNumber/fieldSizeが揃っていること（今回のZIPと同じ品質・スキーマ）。
- 可能であれば、今回未紐付けだった61頭のうち、既存のcanonical horseId
  マッピングを安全に拡張できる追加の実データソース（例: 別レースでの
  同一馬名の再登場や、既存CSVインポート済みデータとの重複馬）。
- `data/horses/grandia.json`等のV0プレースホルダー疑いファイルについて、
  実データでの置き換えまたは除外の判断材料（第24節の技術的負債）。

---

## 27. 次にChatGPTと決める必要がある項目

1. gate component実証のための追加ZIP（第26節のスペック）を用意するかどうか。
2. `data/horses/grandia.json`等のV0プレースホルダー疑いファイル（第24節）の
   扱い——実データへの置き換え、除外、または現状維持のいずれとするか。
3. ZIP内の未紐付け61頭について、追加の安全な照合手段があるかどうか。
4. 新潟記念全頭展開への着手タイミング（本ラウンドでは未着手）。
5. CoursePriorの適用範囲拡張（東京ダート1600m以外への拡張）を検討するかどうか
   （検討するとしても別ラウンドでの明示的な承認が必要、今回のCoursePrior数式変更禁止とは別軸の論点）。

**ここでSTOPします。** 判定はBとなりました。新潟記念全頭展開・RaceContext・
trackBias・オッズ・期待値計算にはChatGPT承認前に進みません。

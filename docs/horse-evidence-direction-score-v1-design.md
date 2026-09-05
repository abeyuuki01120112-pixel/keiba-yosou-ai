# HorseEvidence Direction / Score V1 設計比較（CHECKPOINT 10.7）

**作成日: 2026-08-22。ステータス: 設計比較・検証のみ。未承認・未実装。**

[`docs/horse-evidence-confidence-v1-design.md`](horse-evidence-confidence-v1-design.md)（CHECKPOINT10.5、
confidence V1）・[`docs/horse-evidence-confidence-v1-known-issues.md`](horse-evidence-confidence-v1-known-issues.md)
の下位文書。「本人実績をどれだけ信用するか」（confidence）に続き、「その条件で本人比どれだけ
能力を発揮できたか」（evidenceDirection/score）の測り方を検討する。**本文書は数式・スケール・
実装を確定するものではない。** `src/ability/horseGateEvidence.ts`（CHECKPOINT10.4）・
`src/ability/horseEvidenceConfidence.ts`（CHECKPOINT10.6）以外の本番コードは今回変更していない。

## 最重要思想の確認

**着順ではなく「その馬自身の通常能力と比較して、その条件でどれくらい能力を発揮できたか」を
評価する。** 実は、この点はAbility Model V1のraceScore自体が既に満たしている——raceScoreは
memberLevel×30%＋timeGap×25%＋raceTime×25%＋final3F×15%＋weight×5%の加重平均であり、
「着順」そのものは一切の入力に含まれない（`docs/ability-model-v1.md`凍結仕様）。したがって
「raceScoreを本人比で比較する」という設計は、着順評価を混入させない要件をAbility Model V1の
既存設計から無償で継承できる。これは今回のA/B/C全候補に共通する強みである。

## STEP1: 既存データで何が使えるか監査

| 項目 | 取得可否 | 詳細 |
|---|---|---|
| raceScore | ○ 直接取得可 | `RacePerformance.raceScore`。各過去走に既に算出済み |
| baseAbility | △ 用途注意 | `HorseAbilityProfile.baseAbility`は「現在時点」の単一値（直近5走平均）。過去の個々のレース時点のスナップショットではないため、古い過去走の評価基準に使うと**未来の情報で過去を評価する逆方向のリーク**になる。今回は不採用（後述STEP2） |
| abilityBeforeRace | ○ 再利用可（新規呼び出し方） | `calculateAbilityBeforeRace()`（`abilityBeforeRace.ts`、Ability Model V1凍結対象）は、現状「対象レースの出走馬（＝他馬）」に対してのみ呼ばれている（`memberLevelBreakdown.candidates[].ability`）。しかし関数自体は「raceScoreの配列を渡すと平均を返す」だけの純粋関数であり、**対象馬自身の過去raceScore配列に対して新たに呼び出すことができる**（関数の中身は一切変更しない、新しい呼び出し元を追加するだけ） |
| 対象条件での過去raceScore | ○ | `horseGateEvidence.ts`の`collectHorseGateEvidence()`が既に返す`runs[].raceId`等から、対応する`RacePerformance.raceScore`を突合できる（現状のHorseEvidence型自体はraceScoreを持たないため、突合は呼び出し側の責務） |
| 対象条件以外でのraceScore | ○ | `RacePerformance[]`から対象条件でフィルタされなかった残りを見ればよい |
| 日付・競馬場・surface・distance・going・frame | ○ | すべて`RacePerformance`に既存 |
| runningStyle | △ 限定的 | `passingPosition`（optional）がある過去走のみ、`classifyRunningStyleFromPositions()`で個別レースごとのスタイルを求められる。`passingPosition`が無い過去走が多く（多くの実データで未取得）、確実に使える入力ではない。`computeAutoRunningStyle()`/`computePassingPositionRunningStyle()`は複数走をまとめた「傾向」しか返さず、個々の過去走1件の値ではない |

**結論**: raceScore・abilityBeforeRace（新規呼び出しとして再利用）・条件マッチング・日付/競馬場/surface/distance/goingは今回のV1設計に使える。baseAbility（現在値）は過去走評価には使えない。runningStyleは部分的にしか使えず、今回の設計には組み込まない。

## STEP2: 適性評価の基準値候補A〜Cの比較

シェイクユアハートの実データ（`loadHorseAbilityProfile("shakeyourheart")`、5走・baseAbility=70.3）
を使い、中京・turf・2000mでの2走（2025-12-13: raceScore=75.8、2026-03-15: raceScore=74.6）に
対して実際に3案を計算した（読み取り専用のスクラッチテストで検証、本番コード未変更）。

| レース | raceScore | 案A: 全career平均比 | 案B: abilityBeforeRace比 | 案C: 対象条件以外平均比 |
|---|---:|---:|---:|---:|
| 2025-12-13（1回目の中京2000） | 75.8 | +5.52（対 70.28） | +5.2（対 70.6、前走1走のみ） | +8.80（対 66.99999…） |
| 2026-03-15（2回目の中京2000） | 74.6 | +4.32（対 70.28） | +3.2（対 71.4、前3走平均） | +7.60（対 66.99999…） |

| 観点 | 案A: 全career平均比 | 案B: abilityBeforeRace比 | 案C: 対象条件以外平均比 |
|---|---|---|---|
| future leakageが無いか | **危険**。「全career平均」に対象レースより後の未来走が含まれる。特に古い過去走を評価する際、まだ発生していない将来の好走/凡走の情報が基準値に混入する | **安全**。`calculateAbilityBeforeRace`は定義上「そのレースより前」の走だけを使う（Ability Model V1で既に確立された規律をそのまま再利用） | **危険**。Aと同様、「対象条件以外の平均」に未来走が含まれる |
| 1頭の能力成長を誤って適性と判定しないか | 弱い。career平均は成長期の低スコアと成熟期の高スコアを均してしまい、成長期の対象条件走は過大評価、成熟期の対象条件走は過小評価されうる | 比較的強い。各レースをその時点の直近実力と比較するため、単調な成長トレンドの影響を大きく減らせる。ただし完全ではない（後述CASE C） | Aと同様弱い。対象条件を除いた「その他」も career全体の平均であり、時間軸を考慮しない |
| キャリア初期の低スコアを引きずらないか | 引きずる（初期の低スコアが平均を押し下げ続ける） | 引きずらない（直近走だけを見るため） | 引きずる（Aと同じ理由） |
| 最近強くなった馬を正しく評価できるか | 弱い（career平均に古い低スコアが混ざる） | 強い（直近の実力水準と比較するため、最近の成長を正しく反映） | 弱い（Aと同じ） |
| 少ないサンプルでも使えるか | 使える（1走でも基準値は計算できる） | 使える。ただし対象条件の初回走がその馬のデビュー戦の場合、prior raceが0走でabilityBeforeRace=nullとなり、その1件はdelta算出不能（推測せず除外） | 使える（対象条件以外が1走でもあれば計算できる） |
| baseAbility V1思想との整合性 | 中立。baseAbility自体は直近5走平均という点でAと似た発想だが、Aは「対象条件走を含んだ自己参照平均」であり、対象条件走が多いほど基準値自体が対象条件側に引っ張られる（下記の実データでも実感、Cより小さいdeltaになっている） | **最も整合的**。abilityBeforeRace関数はAbility Model V1で既に凍結・確立された「過去だけを見る」規律をそのまま体現しており、新しい規律を追加で発明する必要が無い | 低い。対象条件走を「無かったこと」にして基準値を計算するため、基準値自体が人為的に引き下げられ、delta が実データ上も他案よりかなり大きく出た（+8.8・+7.6）。過大評価のリスクが高い |

### 推奨: 案B（abilityBeforeRace比）

理由:
1. **future leakageが構造的に発生しない**唯一の案。`calculateAbilityBeforeRace`はAbility Model V1で
   既に凍結された関数であり、新規実装なしにそのまま転用できる（「重複実装は禁止」の原則にも合致）。
2. 実データでも、案Aと案Cは対象条件走をどう基準値に含める/除外するかによって、同じ2走の delta が
   +5.5/+8.8のように大きくブレる（自己参照バイアス）のに対し、案Bは各走時点の実力を見るため
   より保守的で説明しやすい値（+5.2/+3.2）になった。
3. ただし案Bにも限界がある（STEP6のCASE C・D・E参照）。

## STEP3: evidenceDirectionの定義候補

最低限、`positive` / `neutral` / `negative` / `unknown` の4種を検討する。

- `rawPerformanceDelta > 0`（ある閾値超え） → `positive`
- `rawPerformanceDelta`がほぼ0（ある閾値内） → `neutral`
- `rawPerformanceDelta < 0`（ある閾値超え） → `negative`
- `sampleCount = 0`（または全runsでabilityBeforeRaceがnullでdelta算出不能） → `unknown`

**閾値（「ほぼ0」の範囲、正負判定の境界）は今回固定しない。** シェイクユアハートの実データでは
+3.2〜+5.5点の幅で観測されたが、これが「本当に条件による差」か「raceScore自体の自然なブレ」か
を判断する基準（例: raceScoreの標準的なブレ幅の実データ分析）が今回はまだ無いため、閾値の
数値化はSTEP8で「未確定事項」として持ち越す。

## STEP4: scoreのスケール候補A〜Dの比較

| 案 | 内容 | 説明しやすさ | 過剰補正の危険 | 将来effectiveAbilityへの接続しやすさ |
|---|---|---|---|---|
| A: -100〜+100 | rawPerformanceDeltaを大きく引き伸ばす | 低い（raceScore自体は0〜100点スケールなので、同じ数字で別スケールが並ぶと混乱を招く） | 高い（引き伸ばし率を決める時点で恣意性が入る） | 低い（percent変換前提を先取りしてしまう） |
| B: -20〜+20 | 同上、控えめな引き伸ばし | 中間 | 中間 | 低い（Aと同様の問題を軽度に持つ） |
| C: percent型（92〜108%等） | `courseSuitability.ts`と同じ「weightedRaceScoreAverage / overallRaceScoreAverage × 100」形式に寄せる | 高い（既存suitability.tsの表現と統一できる） | **既存のCHECKPOINT10.3の教訓と衝突するリスク**。MAX_WIDTH議論（`docs/gate-suitability-v1-decision.md`）で「%への変換は過剰補正リスクが高い」と既に結論づけている。percent化は将来の乗算接続を先取りする決定であり、今回のスコープ外の判断を暗黙に行うことになる | 高い（`baseAbility × suitability%`という既存の乗算モデルにそのまま合流できる） |
| **D: raw delta のまま保持（スケール変換なし）** | rawPerformanceDelta（raceScoreと同じ点数スケール）をそのまま`score`候補値とする、または`score`自体はV1では常にnull（`SuitabilityComponentV1`と同じ「score常にnull」規約を踏襲） | **最も高い**。raceScoreと同じ単位なので「この馬は東京ダ1600mで通常より本人比+3.2点発揮できている」とそのまま説明できる | **最小**。スケール変換という恣意的な意思決定を今回行わない | **どちらの接続方式（加算的にbaseAbilityへ足す／乗算的にsuitability%へ変換する）にも中立**。将来どちらのモデルを選んでも作り直しにならない |

### 推奨: 案D（raw deltaのまま、スケール変換しない）

理由:
- CHECKPOINT10.3のMAX_WIDTH判断（percent変換を正式採用しない）と一貫性がある。
- `SuitabilityComponentV1.score`が「V1では常にnull」という既存の規約（`suitabilityCoreV1Types.ts`）
  ともそのまま整合する。
- 将来baseAbilityへの接続方式（加算 vs 乗算）が未確定な現時点で、どちらの方式にもロックインしない。

**STEP9で明示的に禁止されている通り、今回はscoreの正式実装（本番コードへの追加）自体を行わない。**
この節はあくまで「実装するとしたらどのスケールが妥当か」という比較にとどまる。

## STEP5: 少数サンプルとconfidenceの組み合わせ方（設計のみ）

CHECKPOINT10.6で確定した`HorseEvidenceConfidence`（unknown/low/medium/high）は、
**directionを変えるものではなく、directionをどれだけ信じるかにのみ使う**、という要件を
以下のように設計上満たせることを確認した。

- `rawPerformanceDelta`・`evidenceDirection`は`sampleCount`（に基づくconfidence）と無関係に、
  常に観測されたraceScoreの差分から機械的に決まる（符号や大きさをconfidenceに応じて動かさない）。
- confidenceは、将来「このdirectionをどれだけ最終判断に効かせるか」という**重み**としてのみ
  使う想定（既存`suitabilityConfidence.ts`の`shrinkTowardCenter()`が同種の仕組みの先例——
  confidenceが低いほどraw値を中立側へ縮小する——であり、同じ考え方をHorseEvidenceにも
  将来適用できる余地がある）。
- **今回はこの重み付け・縮小処理を実装しない。** STEP7で型上の分離のみを確認する。

## STEP6: 異常ケースの検証

| ケース | 想定 | 案Bでの挙動 | 評価 |
|---|---|---|---|
| CASE A: 能力80・対象条件raceScore=75 | 1着でも本人比マイナスかもしれない | `delta = 75 - abilityBeforeRace(≈80) = -5` → `negative` | **正しく処理できる**。raceScore自体が着順を直接の入力にしていないため、1着でも相手が弱ければraceScoreが伸びず、本人比マイナスとして正しく検出される |
| CASE B: 能力60・対象条件raceScore=66 | 5着でも本人比プラスかもしれない | `delta = 66 - abilityBeforeRace(≈60) = +6` → `positive` | **正しく処理できる**。CASE Aと対称の理由 |
| CASE C: 55→60→65と成長中の馬が対象条件で70 | 単なる成長を適性と誤認しないか | `abilityBeforeRace = mean(55,60,65) = 60`、`delta = 70-60 = +10` → `positive`。**しかし**、単調に成長中の馬は、対象条件以外のどの次走でも同様にプラスのdeltaが出やすい（abilityBeforeRaceは過去の平均であり、常に「今の実力」より遅れて追従するため） | **案Bでも完全には解決しない**。これは今回のV1の既知の限界として記録する（STEP8） |
| CASE D: 対象条件72→71→73、その他条件70→69→71という小さいが一貫した差 | 小さい信号を拾えるか | シェイクユアハートの実データでも類似の効果を確認した：1回目の中京2000（delta=+5.2）より2回目（delta=+3.2）の方が小さい。これは、1回目の好走がその馬自身のabilityBeforeRace（3回目の基準値）を押し上げてしまい、2回目以降のdeltaを過小評価する方向に働くため | **案Bの既知の弱点**。持続的な条件優位性がある場合、その優位性自体が徐々に「新しい標準実力」としてabilityBeforeRaceに吸収され、繰り返すほど信号が薄まる（=一貫した適性ほど検出されにくくなるという逆説的な副作用） |
| CASE E: 対象条件80→62→76とバラつきが大きい | directionをどう扱うか | 単純平均なら`mean(delta)`はそこそこの正の値になりうるが、ばらつき自体（分散・標準偏差）は`rawPerformanceDelta`という1つの数値には現れない | **未解決**。CHECKPOINT10.6の技術的負債6「実績の一貫性」と同根の課題。今回は分散指標を別途持たせる設計まで踏み込まない |

## STEP7: rawPerformanceDelta / evidenceDirection / evidenceScore / confidenceの分離設計

4つの概念を型上・意味上、明確に分離した設計を示す（コード実装はしない。設計のみ）。

```
rawPerformanceDelta: number | null   // 例: +3.2。raceScore(対象条件) − abilityBeforeRace(その時点)の平均
evidenceDirection:    "positive" | "neutral" | "negative" | "unknown"  // rawPerformanceDeltaの符号から機械的に決まる
evidenceScore:        null           // V1では常にnull（STEP4案D、STEP9で正式実装しないため）
confidence:            "unknown" | "low" | "medium" | "high"           // CHECKPOINT10.6で確定済み。サンプル量のみを表す
```

例（シェイクユアハートの2回目の中京2000相当）:
```
rawPerformanceDelta = +3.2
evidenceDirection   = "positive"
evidenceScore        = null   // V1では未実装
confidence            = "low"  // 対象条件でのsampleCount=2 → CHECKPOINT10.6のB案でlow
```

`confidence=high`かつ`evidenceDirection=negative`（5走すべて安定して本人比マイナス）という
組み合わせも、上記の型定義上は何ら矛盾なく表現できる——4つの概念が独立したフィールドであり、
どれか1つの値が他のフィールドの意味を書き換えることが無い設計になっている。

## STEP8〜9: Base Ability完全保護・今回やらないこと

`raceScore.ts`・`baseAbility.ts`・`memberLevel.ts`・`timeGapScore.ts`・`raceTimeScore.ts`・
`final3FScore.ts`・`weightScore.ts`はいずれも今回変更していない（読み取り専用の
`loadHorseAbilityProfile()`呼び出しのみ）。HorseEvidence score正式実装・CoursePriorとの合成・
gate補正percent・MAX_WIDTH正式採用・Suitability V1最終統合・effectiveAbility・他コース展開・
Race Review Engine・大規模データ収集のいずれにも着手していない。

## 未確定事項（次にChatGPTと決める必要があること）

1. evidenceDirectionの閾値（「ほぼ0」＝neutralとみなす範囲）をどう決めるか
2. 案B（abilityBeforeRace比）を正式採用するか
3. CASE Cの「成長を適性と誤認するリスク」・CASE Dの「持続的優位性が薄まる副作用」への対処要否
4. CASE Eの「実績の一貫性・分散」を将来どう扱うか（別指標として持たせるか、V1では見送るか）
5. evidenceScore（STEP4案D=raw deltaのまま）をいつ・どう正式実装するか

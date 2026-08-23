# Suitability V1 → effectiveAbility 接続前 最終配線・旧経路監査（CHECKPOINT11.12・監査のみ）

**作成日: 2026-08-23。ステータス: 監査・設計のみ。コード変更なし。
Suitability V1は本番接続していない。effectiveAbilityの式も無変更。**

---

## STEP1: Suitability関連全経路監査

実際のimport文・関数呼び出しをすべて追跡した結果（推測なし）。

| 対象 | 定義ファイル | 呼び出し元 | 呼び出し先 | UI/本番到達可能か | test専用か | dead code扱い |
|---|---|---|---|---|---|---|
| `distanceSuitability.ts` | 同左 | `suitability.ts`、`suitabilityV1.ts`（両方から） | `distanceBands.ts`、`suitabilityConfidence.ts` | **不可**（下記STEP2参照） | いいえ（2箇所から実利用） | いいえ（生きたロジック、ただしUI未接続） |
| `courseSuitability.ts` | 同左 | `suitability.ts`、`suitabilityV1.ts` | `suitabilityConfidence.ts` | 不可 | いいえ | いいえ |
| `goingSuitability.ts` | 同左 | `suitability.ts`、`suitabilityV1.ts` | `suitabilityConfidence.ts` | 不可 | いいえ | いいえ |
| `suitability.ts`（旧、`computeSuitabilityBreakdown`/`computeEffectiveAbility`） | 同左 | **`finalRaceAbility.ts`のみ** | distance/course/goingSuitability | 不可（finalRaceAbility.ts自体が不可） | いいえ | 実質dead（呼び出し元が到達不能） |
| `suitabilityCoreV1.ts` | 同左 | **無し**（自身のtestのみ） | `courseContextPrior.ts` | 不可 | **実質はい**（自身のtest以外の呼び出し元ゼロ） | **はい**（本番からもSuitability V1からも一切参照されない） |
| `suitabilityV1.ts`（新、`computeSuitabilityV1`） | 同左 | **無し**（自身のtestのみ） | distance/course/goingSuitability、`courseContextPrior.ts`、`horseGateEvidence.ts`、`horseEvidenceConfidence.ts` | 不可 | **実質はい**（自身のtest以外の呼び出し元ゼロ） | いいえ（CHECKPOINT11.3〜11.11で継続開発中、次回接続予定） |
| `finalRaceAbility.ts`（`computeFinalRaceAbility`） | 同左 | 自身のtest、`raceOutcomeEvaluation.test.ts` | `suitability.ts`（**旧のみ、V1ではない**）、`runningStyle.ts`、`passingPositionRunningStyle.ts`、`predictedPace.ts`、`paceScenarioFactor.ts`、`trackBias.ts`、`trackBiasFactor.ts`、`raceContextFactor.ts` | **不可**（`.tsx`から一切参照されない） | 実質はい | 実質dead（本番到達不能） |
| `raceOutcomeEvaluation.ts`（STEP6） | 同左 | 自身のtestのみ | `stabilityFactor.ts`、`outcomeScore.ts`、`outcomeProbability.ts`、`finalRaceAbility.ts`の出力型 | 不可 | 実質はい | 実質dead |
| `computeSuitabilityV1` | `suitabilityV1.ts` | 自身のtestのみ | 上記 | 不可 | はい | 開発中（dead ではない、単に未接続） |
| `overallSuitability`（フィールド名） | `suitabilityTypes.ts`（旧`SuitabilityBreakdown`型） | `suitability.ts`、`finalRaceAbility.ts`、`raceOutcomeEvaluation.ts` | N/A | 不可 | — | — |
| `overallSuitabilityPercent`（フィールド名） | `suitabilityV1Types.ts`（新`SuitabilityV1Result`型） | `suitabilityV1.ts`のみ | N/A | 不可 | — | — |

**「UI/本番到達可能か」の判定根拠**: `src/**/*.tsx`を全検索した結果、
`src/ability/`配下から実際に参照されているのは`horseAbilityData.ts`の
`loadHorseAbilityProfile()`（`HorseDetailPanel.tsx`が使用、baseAbilityと
recentRacesのみを返す）と`buildImportResult.ts`（`ImportStatusPanel.tsx`が
使用、CSV取り込み状態表示のみ）の2経路のみ。Suitability・HorseEvidence・
CoursePrior・effectiveAbility・finalRaceAbility・raceOutcomeEvaluationの
いずれも、いかなる`.tsx`ファイルからも一切参照されていない。

---

## STEP2: 現在の本番経路（実コード追跡・推測なし）

```
data/horses/*.json（生データ）
  ↓ buildRaceHistory()  [raceHistoryPipeline.ts]
RacePerformance[]（raceScore・memberLevelScoreAtRace・timeGapScore・
                   raceTimeScore・final3FScore・weightScore すべて計算済み）
  ↓ buildHorseAbilityProfile()  [buildHorseAbilityProfile.ts]
  ↓   → calculateBaseAbility()  [baseAbility.ts]
HorseAbilityProfile { horseId, horseName, recentRaces, baseAbility }
  ↓ loadHorseAbilityProfile()  [horseAbilityData.ts]
HorseDetailPanel.tsx（画面表示。baseAbilityとrecentRacesの内訳のみ）
```

**これが実際に到達可能な本番経路の全てである。** Suitability（旧・新とも）・
effectiveAbility・finalRaceAbility・RaceContext・raceOutcomeEvaluationは
**この経路のどこにも登場しない**。UIはbaseAbilityより先の計算を一切表示・
使用していない。

---

## STEP3: Suitability A（旧）/ B（CoreV1）/ V1（新）の関係

| 系統 | 本番か | legacyか | 今後の正式経路か | 削除候補か | 残す必要があるか |
|---|---|---|---|---|---|
| 旧`suitability.ts`系（`distanceSuitability.ts`等の3コンポーネントを単純平均） | いいえ | **はい** | いいえ（CHECKPOINT11.1で案C採用済み、V1へ置き換える方針） | **将来的には候補**（ただし`finalRaceAbility.ts`が現状これに依存しているため、接続の切り替えが完了するまでは残す必要あり） | 現時点では残す必要あり（下記STEP9参照） |
| `suitabilityCoreV1.ts`系（7要素schema、score常にnull） | いいえ | **はい**（CHECKPOINT9時点の設計、CHECKPOINT11.1以降は案Cの型パーツとしてのみ位置づけ） | いいえ（型定義のみ`suitabilityV1Types.ts`が代替を持つ） | **削除候補（要検討）** | 型定義（`SuitabilityComponentKey`等）は`suitabilityV1Types.ts`が独自に持つため、実体としての価値は薄い。ただし今回は削除しない（指示通り） |
| **新`suitabilityV1.ts`**（distance/course/going/gateの4component、confidence統一済み） | いいえ（未接続） | いいえ | **はい**（CHECKPOINT11.3〜11.11で継続開発、次回接続予定） | いいえ | 残す（正式経路） |

**判定根拠**: 旧`suitability.ts`は3要素のみでCoursePrior/HorseEvidenceの区別が無く、
confidence閾値もCHECKPOINT11.11で統一されていない（旧3段階のまま）。新
`suitabilityV1.ts`はCHECKPOINT11.1（アーキテクチャ統一）・11.5〜11.10（gate
percent式確定）・11.11（confidence統一）を経て、4要素・HorseEvidence優先・
confidence統一済みの、より完成度の高い実装になっている。

---

## STEP4: 二重Suitabilityチェック

**現時点のコードには二重適用は存在しない。** `finalRaceAbility.ts`は
`suitability.ts`（旧）のみをimportしており、`suitabilityV1.ts`は一切
importしていない。`suitabilityV1.ts`も`finalRaceAbility.ts`を一切
importしていない。両者は完全に独立した経路であり、同一の`baseAbility`に
両方が掛かる経路は存在しない。

**ただし、distance/course/goingの「基礎計算関数」自体は共有されている。**
`distanceSuitability.ts`・`courseSuitability.ts`・`goingSuitability.ts`は、
旧`suitability.ts`と新`suitabilityV1.ts`の**両方から呼ばれている**（同じ
純関数を2つの異なる統合層がそれぞれ独立に呼び出している）。これは現状
問題を起こさない（それぞれが独立に計算し独立に結果を返すだけで、値が
合成されて二重計上されるわけではない）が、**将来の接続作業で「うっかり
両方の統合層を同時に呼んで乗算する」実装ミスをする可能性はゼロではない**
——これはSTEP8で明示的なリスクとして記録する。

---

## STEP5: Base Ability隔離確認

`raceScore.ts`・`memberLevel.ts`・`memberLevelCandidates.ts`・
`timeGapScore.ts`・`raceTimeScore.ts`・`final3FScore.ts`・`weightScore.ts`・
`abilityBeforeRace.ts`・`baseAbility.ts`・`raceHistoryPipeline.ts`・
`buildHorseAbilityProfile.ts`・`buildRacePerformance.ts`について、
`suitability`・`suitabilityV1`・`suitabilityCoreV1`・`courseContextPrior`・
`horseGateEvidence`・`horseEvidenceConfidence`・`finalRaceAbility`・
`raceContextFactor`・`paceScenarioFactor`・`trackBiasFactor`・`trackBias`・
`runningStyle`のいずれかをimportしているファイルが無いことを機械的に検索
（grep）で確認した。**該当ゼロ件。Base Ability V1は完全に独立している。**

---

## STEP6: effectiveAbility現在仕様（`suitability.ts`、旧系統）

```
overallSuitability = clamp(average(distanceSuitability.adjusted,
                                     goingSuitability.adjusted,
                                     courseSuitability.adjusted),
                             90, 110)
effectiveAbility = baseAbility × overallSuitability / 100
```

| 項目 | 内容 |
|---|---|
| 式 | `roundToOneDecimal((baseAbility * suitability.overallSuitability) / 100)` |
| 入力値 | `baseAbility: number`, `recentRaces: RacePerformance[]`, `target: SuitabilityTargetRaceContext` |
| range | `overallSuitability`は`clamp(90,110)`により**常に90〜110の範囲に収まる**（この範囲外の値はコード上発生し得ない） |
| clamp有無 | **あり**（`SUITABILITY_CLAMP_MIN=90`/`SUITABILITY_CLAMP_MAX=110`、`suitabilityConfidence.ts`定義） |
| null/unknown時挙動 | 各componentは該当走が無い場合でも常に`raw=100`（中立）を返す設計のため、`overallSuitability`が null/undefined になることはない。evidenceが皆無でも`effectiveAbility = baseAbility`（変化なし）になる |
| Suitability=100時 | `effectiveAbility = baseAbility`（不変） |
| Suitability=80時 | **現在の実装では発生し得ない**（clampの下限90により、平均計算結果が80であっても90へ強制的に引き上げられる）。仮にclampを無視した場合は`baseAbility × 0.8` |
| Suitability=120時 | **現在の実装では発生し得ない**（clampの上限110により、平均計算結果が120であっても110へ強制的に引き下げられる）。仮にclampを無視した場合は`baseAbility × 1.2` |

**注記**: CHECKPOINT11.2で、この`clamp(90,110)`は「最終出力レンジの強制制限」
であり「70%の適性」概念を表現できないという問題が指摘され、Suitability V1
（`suitabilityV1.ts`）では`SUITABILITY_V1_SAFETY_MIN/MAX=60/120`という
広い安全境界のみに置き換えられている。**旧`suitability.ts`のclamp(90,110)は
今回のCHECKPOINTでも変更していない**（`suitability.ts`自体は無変更）。

---

## STEP7: finalRaceAbility現在仕様

```
priorRaces = recentRaces（対象レース自身を除外、二重防御）
suitability = computeSuitabilityBreakdown(priorRaces, suitabilityTarget)  ← 旧suitability.ts
effectiveAbility = baseAbility × suitability.overallSuitability / 100

runningStyle = resolve(manualRunningStyle, passingPosition or final3F-proxy自動推定)
paceScenarioFactor = f(runningStyle, 想定ペース)      ← raw 95〜105, confidence shrink
trackBiasFactor    = f(runningStyle, trackBias観測)    ← raw 95〜105, confidence shrink
raceContext = clamp(paceScenarioFactor × trackBiasFactor / 100, 90, 110)

finalRaceAbility = effectiveAbility × raceContext.value / 100
```

**入力**: `baseAbility`、`recentRaces`、`suitabilityTarget`、
`raceContextTarget`（future leakage判定用）、`manualRunningStyle`、
`fieldRunningStyleDistributions`、`manualTrackBias`、`autoTrackBias`。

**出力**: `FinalRaceAbilityResult`（baseAbility・suitability breakdown・
effectiveAbility・runningStyle関連・predictedPace・raceContext・
finalRaceAbility）。

**騎手・調教の補正は存在しない**（この2つを扱う仕組み自体がプロジェクト内に
無く、`docs/prediction-philosophy.md`の思想通り能力評価の主要因にしていない）。
展開（`paceScenarioFactor`）・trackBias（`trackBiasFactor`）は存在するが、
**いずれも`runningStyle`（脚質推定、自己参照型で別途算出される馬固有の属性）を
入力にした「今回の展開/馬場との相性」であり、baseAbilityやSuitabilityの
値そのものには一切触れない**。`raceContext.value`は`effectiveAbility`に
乗算される**別の独立した乗数**として合成されるため、Base AbilityやSuitability
への二重加算・重複加算は確認されなかった。

`runningStyle`自体はSuitability breakdown（distance/going/course）には
一切含まれず、`raceContext`側でのみ使われる——CHECKPOINT11.1のSTEP4で
決定した「runningStyleはSuitabilityから除外しRaceContext側で扱う」という
方針が、`finalRaceAbility.ts`の実装上も一貫して守られていることを確認した。

---

## STEP8: 正式接続案（設計のみ、実装しない）

原則（`baseAbility × suitabilityV1/100 = effectiveAbility`）に基づく
最小変更接続案を検討したが、**現在の型定義には無視できない不整合がある**
ため、そのまま報告する。

### 発見した矛盾

1. **`SuitabilityV1Result`と旧`SuitabilityBreakdown`は構造が異なる**。
   旧: `{distanceSuitability, goingSuitability, courseSuitability, overallSuitability}`
   （componentは`{raw, adjusted, ...}`）。
   新: `{distance, course, going, gate, overallSuitabilityPercent, evaluatedComponentCount}`
   （componentは`{rawPercent, adjustedPercent, ...}`）。
   フィールド名が異なるため、`finalRaceAbility.ts`の
   `computeSuitabilityBreakdown` → `computeSuitabilityV1`への単純な
   関数差し替えでは済まない。
2. **`raceOutcomeEvaluation.ts`の`resolveEvaluationConfidence()`が旧型の
   フィールド名（`result.suitability.distanceSuitability.confidence`等）に
   直接依存している。** Suitability V1へ切り替える場合、この関数も
   合わせて更新する必要がある。
3. **`computeSuitabilityV1`は`horseId`と`gate`（RaceGateInput）を新たに
   必須入力として要求する。** 旧`computeSuitabilityBreakdown`はこれらを
   要求しない。`FinalRaceAbilityInput`に新しいフィールドを追加する必要がある。
4. **クランプ方式が異なる**（旧: `clamp(90,110)`を`overallSuitability`自体に
   適用／新: `SUITABILITY_V1_SAFETY_MIN/MAX=60,120`を`overallSuitabilityPercent`
   に適用）。接続後、`finalRaceAbility`が想定する`effectiveAbility`の
   値域も実質的に変わる（90-110ベース→60-120ベースへ）。これは
   CHECKPOINT11.2で意図的に決定された変更だが、`finalRaceAbility.ts`や
   `raceOutcomeEvaluation.ts`がこの新しい値域を前提に作られていないため、
   影響範囲の再点検が必要。

**これらの矛盾は勝手に解消せず、次回接続CHECKPOINTでの検討事項として
報告する。** 少なくとも、(a) `finalRaceAbility.ts`のimportを
`suitability.ts`から`suitabilityV1.ts`へ切り替える、(b) `FinalRaceAbilityInput`に
`horseId`/`gate`を追加する、(c) `FinalRaceAbilityResult`の`suitability`
フィールドの型を`SuitabilityV1Result`へ変更する、(d) `raceOutcomeEvaluation.ts`の
`resolveEvaluationConfidence()`を新フィールド名に対応させる、という
4点セットの変更が最小限必要になる見込みである。

---

## STEP9: 旧Suitabilityの扱い（3案比較）

| 案 | 安全性 | 二重計算リスク | rollback | コード複雑性 | 将来保守性 |
|---|---|---|---|---|---|
| A: 即置換（`suitability.ts`を削除しV1へ完全移行） | 低（`finalRaceAbility.ts`・`raceOutcomeEvaluation.ts`・関連testを同時に大量修正する必要があり、1回の変更が大きい） | 低（置換なので発生余地が無い） | 難しい（削除したコードの復元が必要） | 一時的に高い（型不整合の一括解消が必要） | 高い（長期的には最もクリーン） |
| **B: 旧をlegacyとして残し、接続時にV1へ切替（推奨）** | **高**（`suitability.ts`自体は無変更のまま、`finalRaceAbility.ts`側だけを段階的に更新できる） | 低（呼び出し元を切り替えるだけで、新旧が同時に呼ばれる経路を作らなければ二重計算は起きない） | **容易**（`finalRaceAbility.ts`のimportを元に戻すだけでrollback可能） | 低い（変更範囲を`finalRaceAbility.ts`とその直接の依存先に限定できる） | 中（`suitability.ts`が当面残り続けるが、テストがある限り実害は無い） |
| C: feature flagで一時並存 | 中 | **中**（flag分岐の実装ミスで両方が呼ばれる経路を作るリスクがある） | 容易 | 高い（分岐ロジックが増える） | 低い（現状UIすら無く、切り替えを可視化する対象が存在しないため、flagを導入する実益が無い） |

**推奨: 案B。** 現在Suitability関連のいかなる経路もUIから到達不能であり
（本番トラフィックが存在しない）、feature flag（案C）で保護すべき「稼働中の
利用者」がそもそも存在しない。案Aは一度に変更する範囲が大きく、STEP8で
発見した4点の型不整合を一括で解決する必要がありリスクが高い。**案Bが
「V1では最も単純で安全な案」という指示に最も合致する**——次回接続
CHECKPOINTでは`finalRaceAbility.ts`とその直接の依存関係（`raceOutcomeEvaluation.ts`
の型参照含む）だけを対象範囲とし、`suitability.ts`・`distanceSuitability.ts`
等は当面そのまま残す。

---

## 変更禁止・今回やらないことの遵守

`distance`/`course`/`going`へのHorseEvidence拡張、`surface`/`turn`実装、
他コース展開、`RaceContext`・`trackBias`再設計、Race Review Engine、
キーンランドC実戦投入、大規模データ収集、UI変更のいずれにも進んでいない。
Suitability V1の本番接続・`effectiveAbility`の式変更も行っていない。

---

## 完了報告（17項目）

1. **Suitability関連ファイル一覧**: STEP1の表参照（distance/course/going
   Suitability、旧suitability.ts、suitabilityCoreV1.ts、suitabilityV1.ts、
   finalRaceAbility.ts、raceOutcomeEvaluation.ts）。
2. **現在の本番計算経路**: STEP2参照——`baseAbility`までで止まっており、
   Suitability以降はUIに一切到達しない。
3. **legacy経路**: 旧`suitability.ts`系（`finalRaceAbility.ts`が依存する
   唯一の経路だが、その`finalRaceAbility.ts`自体が本番未接続）。
4. **dead code候補**: `suitabilityCoreV1.ts`（自身のtest以外からの参照が
   完全にゼロ、`suitabilityV1Types.ts`が同等の型定義を独自に持つため実体的な
   価値が薄い）。`finalRaceAbility.ts`・`raceOutcomeEvaluation.ts`も
   本番到達不能だが、次回接続の土台として引き続き必要。
5. **二重Suitabilityの有無**: 現状の呼び出し経路には無し（STEP4）。ただし
   distance/course/goingの基礎関数を旧・新両方の統合層が個別に呼んでいる
   構造は将来の接続ミスリスクとして記録した。
6. **Base Ability汚染の有無**: **無し**。grep監査で全Ability Model V1
   ファイルからSuitability/HorseEvidence/CoursePrior/RaceContext系への
   import が一切無いことを確認（STEP5）。
7. **effectiveAbility現在式**: `baseAbility × clamp(avg(distance/going/course
   .adjusted), 90, 110) / 100`（STEP6）。Suitability=80/120は現在の実装では
   clampにより発生し得ない。
8. **finalRaceAbility現在式**: `effectiveAbility × raceContext.value / 100`、
   `raceContext.value = clamp(paceScenarioFactor × trackBiasFactor / 100, 90, 110)`
   （STEP7）。
9. **RaceContext等の重複補正有無**: **無し**。runningStyleはSuitabilityに
   含まれず、raceContext側でのみ使用される設計が実装上も一貫していることを
   確認した（STEP7）。
10. **Suitability V1正式接続案**: 4点セットの変更（import切替・
    `FinalRaceAbilityInput`拡張・`FinalRaceAbilityResult`型変更・
    `raceOutcomeEvaluation.ts`更新）が必要（STEP8）。矛盾があるため
    今回は実装しない。
11. **旧Suitabilityの推奨扱い**: 案B（legacyとして残し、接続時に
    `finalRaceAbility.ts`側だけをV1へ切替）を推奨（STEP9）。
12. **必要最小限の変更ファイル候補**（次回接続時、今回は変更なし）:
    `finalRaceAbility.ts`、`raceContextTypes.ts`（`FinalRaceAbilityResult`型）、
    `raceOutcomeEvaluation.ts`、それぞれの既存テスト。
13. **baseAbility=70.3再現**: `abilityModelV1.regression.test.ts`で確認、
    変化なし。
14. **test/lint/build/validate:data**: 527/527成功・lint/build/validate:data
    すべて正常（コード変更を行っていないため回帰確認のみ）。
15. **technical debt**:
    1. `suitabilityCoreV1.ts`は実質的に価値を失っており、将来的な削除を
       検討すべき（今回は削除しない）。
    2. distance/course/goingの基礎関数が旧・新2つの統合層から呼ばれる
       構造は、接続作業時に「両方を誤って合成しない」という実装上の注意点
       として明示的に引き継ぐ必要がある。
    3. Suitability V1接続時、`raceOutcomeEvaluation.ts`・
       `raceContextTypes.ts`の型定義更新が必須になる（STEP8の4点）。
16. **A/B/C判定**: **A**——監査の目的（二重計算・旧ロジック混入・死んだ経路・
    自己参照・Base Ability汚染の有無を完全に把握する）は達成した。
    二重計算・Base Ability汚染は共に「無し」と確認でき、次回接続に向けた
    必要最小限の変更範囲（4点セット）も具体的に特定できた。
17. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. STEP8で発見した4点の型不整合をどう解決するか（`FinalRaceAbilityResult`
       型を新しいSuitability V1形状へ直接変更するか、アダプター層を挟むか）。
    2. `raceOutcomeEvaluation.ts`の`resolveEvaluationConfidence()`を
       新フィールド名へ対応させる方針。
    3. 接続後の`effectiveAbility`の値域が旧clamp(90,110)ベースから
       新60-120安全境界ベースへ変わることについて、`finalRaceAbility`・
       `raceOutcomeEvaluation`側でも追加の検討が必要か。
    4. `suitabilityCoreV1.ts`の削除タイミング（今回は削除見送り）。

## test/lint/build/validate:data

コード変更を行っていないため回帰確認のみ実施:

```
npm test              # 527/527成功
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

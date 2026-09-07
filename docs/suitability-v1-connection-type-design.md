# Suitability V1 接続前 型不整合・clamp方針 最終設計（CHECKPOINT11.13）

**設計・監査のみ。本ラウンドで本番コードへの変更は一切行っていない。**
Suitability V1のeffectiveAbility/finalRaceAbilityへの実接続は、本設計をChatGPTが
承認した次のCHECKPOINTで行う。

対象は CHECKPOINT11.12の監査で発見された4つの構造的不整合:
1. `SuitabilityBreakdown`（旧）と`SuitabilityV1Result`（新）のフィールド名・構造の不一致
2. `raceOutcomeEvaluation.ts`の旧Suitability型への依存
3. `FinalRaceAbilityInput`へのhorseId/gate追加要否
4. 旧clamp(90,110)と新Suitability V1の60-120 safety boundaryの意味の不一致

---

## STEP1: 現状の型の実態（コードから抽出、推測なし）

### `SuitabilityBreakdown`（旧・`suitability.ts`系、`suitabilityTypes.ts`）

現在 `finalRaceAbility.ts` が実際に使っている型。

| フィールド | 型 | nullable | 意味 | 使用箇所 |
|---|---|---|---|---|
| `distanceSuitability` | `DistanceSuitabilityComponent`（`SuitabilityComponent`+距離メタ） | 不可 | 距離適性 | `finalRaceAbility.ts`, `raceOutcomeEvaluation.ts` |
| `goingSuitability` | `SuitabilityComponent` | 不可 | 馬場適性 | 同上 |
| `courseSuitability` | `SuitabilityComponent` | 不可 | コース適性 | 同上 |
| `overallSuitability` | `number` | 不可 | 3項目adjustedの単純平均をclamp(90,110)した最終値 | `finalRaceAbility.ts`（effectiveAbility算出）, `raceOutcomeEvaluation.ts`（`HorseOutcomeResult.suitability`） |

`SuitabilityComponent`内訳: `raw`/`adjusted`/`sampleCount`/`confidence: "high"|"medium"|"low"`（3段階、`unknown`無し）/`evidence`/`basis`/`reason`。
gate要素は存在しない（3コンポーネントのみ）。`source`（情報源の種別）フィールドも無い。

### `SuitabilityV1Result`（新・`suitabilityV1.ts`系、`suitabilityV1Types.ts`）

CHECKPOINT11.3以降の新設層。現状どこからも本番接続されていない（`suitabilityV1.test.ts`のみが参照）。

| フィールド | 型 | nullable | 意味 |
|---|---|---|---|
| `distance`/`course`/`going`/`gate` | `SuitabilityComponentResultV1` | 不可 | 4コンポーネント |
| `overallSuitabilityPercent` | `number` | 不可 | evaluated=trueのみの単純平均をclampSafety(60,120) |
| `evaluatedComponentCount` | `number`(0〜4) | 不可 | 何個のcomponentが実際に評価されたか |

`SuitabilityComponentResultV1`内訳: `key`/`evaluated: boolean`/`rawPercent`/`adjustedPercent`/
`confidence: "unknown"|"low"|"medium"|"high"`（4段階）/`reason`/`horseEvidence: HorseEvidenceDetail|null`/
`coursePrior: CoursePriorDetail|null`。`source`フィールドは無い（CHECKPOINT11.3で意図的に不採用）。
`overallConfidence`のようなトップレベルconfidenceも無い。

参考: `suitabilityCoreV1Types.ts`の`SuitabilityComponentV1`（CHECKPOINT9、7要素、`score`は常にnull、
`source: "horseEvidence"|"coursePrior"|"both"|"none"`を持つ）は本番からもテストからも
（自身のテスト以外）参照されていない死蔵コード（CHECKPOINT11.12で確認済み、今回変更しない）。

### `FinalRaceAbilityInput`（`finalRaceAbility.ts`）

```
baseAbility: number
recentRaces: RacePerformance[]
suitabilityTarget: SuitabilityTargetRaceContext   // racecourse/surface/distance/going
raceContextTarget: RaceContextTargetInfo
manualRunningStyle: RunningStyleProfile | null
fieldRunningStyleDistributions: RunningStyleDistribution[]
manualTrackBias: TrackBiasObservation | null
autoTrackBias: TrackBiasObservation | null
```

`horseId`・`gate`（`RaceGateInput`）は存在しない。内部で`computeSuitabilityBreakdown(priorRaces, suitabilityTarget)`
（旧`suitability.ts`）を呼んでおり、この関数は`horseId`も`gate`も要求しないため、現状は不要で整合している。

### `FinalRaceAbilityResult`（`raceContextTypes.ts`）

`suitability: SuitabilityBreakdown`（旧型そのまま）を保持。`effectiveAbility = baseAbility × suitability.overallSuitability / 100`。

### `raceOutcomeEvaluation.ts`関連型

- `resolveEvaluationConfidence(result: FinalRaceAbilityResult): SuitabilityConfidence` は
  `result.suitability.distanceSuitability.confidence` / `.goingSuitability.confidence` /
  `.courseSuitability.confidence`（旧3コンポーネントのフィールド名に直接依存）に加え、
  `result.runningStyle.confidence` / `result.raceContext.paceScenarioFactor.confidence` /
  `result.raceContext.trackBiasFactor.confidence` の計6値からweakest-linkを取る。
- `HorseOutcomeResult.suitability: number`（`FinalRaceAbilityResult.suitability.overallSuitability`をそのまま採番）。
- `HorseOutcomeResult.evaluationConfidence: SuitabilityConfidence`（3段階、`unknown`無し）。

grep確認: `raceOutcomeEvaluation.ts`・`finalRaceAbility.ts`はいずれも自分自身のテストファイルと
互いの型ファイルからのみ参照されており、`.tsx`からの参照は0件（CHECKPOINT11.12の結論を今回も再確認）。

---

## STEP2: 提案する正式Suitability V1出力型（設計のみ・未実装）

将来の正式経路 `BaseAbility → SuitabilityV1 → effectiveAbility → finalRaceAbility` を前提に、
既存`SuitabilityComponentResultV1`/`SuitabilityV1Result`へ**追加のみ**を行う案。フィールド名変更・削除はしない
（既存18テスト・`wrapSystemAComponent`/`computeGateSuitabilityV1`の戻り値を壊さないため）。

```typescript
// suitabilityV1Types.ts への追加提案（未実装）
export type SuitabilitySourceV1 = "horseEvidence" | "coursePrior" | "both" | "none"; // 既存 suitabilityCoreV1Types.ts と同じ定義を再利用

export interface SuitabilityComponentResultV1 {
  key: SuitabilityV1ComponentKey;
  evaluated: boolean;
  rawPercent: number;
  adjustedPercent: number;
  confidence: SuitabilityConfidenceV1;
  reason: string;
  horseEvidence: HorseEvidenceDetail | null;
  coursePrior: CoursePriorDetail | null;
  source: SuitabilitySourceV1;        // ★追加: horseEvidence!=null && coursePrior!=null なら"both"、
                                       //   horseEvidenceのみなら"horseEvidence"、coursePriorのみなら"coursePrior"、
                                       //   両方null（evaluated=false）なら"none"
}

export interface SuitabilityV1Result {
  distance: SuitabilityComponentResultV1;
  course: SuitabilityComponentResultV1;
  going: SuitabilityComponentResultV1;
  gate: SuitabilityComponentResultV1;
  overallSuitabilityPercent: number;
  evaluatedComponentCount: number;
  overallConfidence: SuitabilityConfidenceV1;  // ★追加: 4componentのconfidenceのweakest-link
                                                //   （raceOutcomeEvaluation.tsのresolveEvaluationConfidenceと同じ考え方を
                                                //   Suitability V1自身の出力層に持たせる。evaluatedComponentCount=0なら"unknown"）
}
```

- `source`は`horseEvidence !== null`/`coursePrior !== null`という既存フィールドから機械的に導出できるため、
  新しい判定ロジックを持ち込む必要はない（純粋な派生値）。
- `overallConfidence`の算出も、既存の`CONFIDENCE_RANK`的な優先順位付け（`raceOutcomeEvaluation.ts`に
  既にある考え方）を再利用するだけであり、新しいconfidence定義を作らない。
- distance/course/goingは現状`coursePrior`が常にnullのため、`source`は必然的に
  `"horseEvidence"`（evaluated=true）または`"none"`（evaluated=false）のいずれかにしかならない。
  gateのみ`"both"`が起こりうる（HorseEvidence優先だが両方算出できる場合がある、CHECKPOINT11.5参照）。

---

## STEP3: 旧`SuitabilityBreakdown`の扱い — 3案比較と推奨

| 観点 | 案A: 即座に新型へ全面置換 | 案B: アダプタ層で変換 | 案C: 旧型を残し新型と並存（現状） |
|---|---|---|---|
| 安全性 | 一度に`finalRaceAbility.ts`・`raceOutcomeEvaluation.ts`両方を書き換える必要があり変更範囲が大きい | 旧型のシェイプを維持できるため呼び出し側の変更が少ない | 現状維持、リスクゼロ（ただし本題を先送り） |
| gate情報の扱い | gateComponentがそのまま最終結果に残る | **3コンポーネント形式へ戻す際、gateの情報（HorseEvidence/CoursePrior詳細含む）を捨てるか、無理に`courseSuitability`等へ押し込むかの二択になり、いずれも情報損失または意味の混同が発生する** | gate情報は新型のテストの中にしか存在せず、本番結果に一切現れない（現状通りの制約） |
| 移行コスト | 型定義変更1箇所＋呼び出し側2箇所（`finalRaceAbility.ts`, `raceOutcomeEvaluation.ts`）＋関連テスト更新 | 型定義変更1箇所＋アダプタ関数1つ新設＋呼び出し側は変更小 | 0（何もしない） |
| 将来の保守性 | 型が1本化され、以後の二重管理が消える | アダプタ関数がある限り「新→旧」の変換ロジックを恒久的に保守する必要がある。gate等コンポーネントが将来5つ目以降に増えると、アダプタの設計をその都度見直す必要がある | 2つの型・2つの計算系統が並存し続け、将来的な混同・二重計算リスクが残る（CHECKPOINT11.12で既に警戒された点） |
| ロールバック | `git revert`で型を元に戻せば旧経路に戻る（コードは元から旧経路のまま動くよう保たれている） | アダプタ層を外せば旧型に戻せるが、アダプタ自体の削除も必要 | 該当なし |

**推奨: 案A（新型への直接置換）。**
理由: 本プロジェクトの根幹方針（`docs/prediction-philosophy.md`・CLAUDE.md絶対原則5「データ不足を
勝手に埋めない」）に照らすと、gateという実在する第4のコンポーネント情報をアダプタで欠落させる案Bは
採用できない。案Cは今回の検討そのものを先送りするだけで、いずれ同じ決定が必要になる。
変更箇所は`finalRaceAbility.ts`の1関数（import切替＋関数呼び出し変更）と
`raceOutcomeEvaluation.ts`の1関数（`resolveEvaluationConfidence`のフィールド参照変更）に限定でき、
「最小限の変更」という各CHECKPOINTの一貫した方針とも整合する。

---

## STEP4: `raceOutcomeEvaluation.ts`の必要性判定

**判定: 現状は「非本番（テストのみ参照）」だが、Suitability V1接続後も引き続き必要な、削除候補ではないコード。**

- grep確認（本ラウンド実施）: `raceOutcomeEvaluation.ts`を実際にimportしているのは
  `raceOutcomeEvaluation.test.ts`のみ。`.tsx`からの参照は0件。CHECKPOINT11.12の結論と一致。
- ただし「production-essential / verification-only / legacy / dead-code候補」の4分類でいえば、
  **verification-only（現時点でUIに未接続だが、STEP6=第27実装として設計され将来UIに接続される想定の
  正規の計算レイヤー）**であり、「legacy」でも「dead-code候補」でもない。
  `suitabilityCoreV1Types.ts`（誰からも参照されず自己完結したまま放置されている真の死蔵コード）とは性質が異なる。
- したがって「新型に無理やり合わせる」のではなく、**型を切り替えれば必然的にビルドが壊れるため、
  最小限の追従修正が必要**という位置づけが正確。具体的には`resolveEvaluationConfidence()`内の
  `result.suitability.distanceSuitability.confidence` 等3行を、新型のconfidence値（例:
  `result.suitability.distance.confidence` / `.course.confidence` / `.going.confidence`、
  加えてgateも新たに追加するかは次回検討）に置き換えるだけで足りる想定。
- アダプタは不要（STEP3で案Aを推奨したことと整合）。

---

## STEP5: `horseId`/`gate`追加の要否

**判定: 追加が本当に必要（投機的な追加ではない）。**

根拠: `computeSuitabilityV1(input: SuitabilityV1Input)`は既存の実装（CHECKPOINT11.3、変更不要・既に確定済み）として
`horseId: string`と`gate: RaceGateInput`を必須フィールドとして要求する。`finalRaceAbility.ts`が
`computeSuitabilityBreakdown`の代わりに`computeSuitabilityV1`を呼ぶよう切り替える（STEP3の帰結）以上、
呼び出しに必要な引数を`FinalRaceAbilityInput`が持っていなければビルドが通らない。「あったら便利」ではなく
「接続の前提条件」。

- `horseId: string`（必須、nullable不要）— `HorseOutcomeInput.horseId`として既に呼び出し側
  （`raceOutcomeEvaluation.ts`を使うレイヤー）に存在する値であり、新規取得コストは無い。
- `gate: RaceGateInput`（必須フィールドとして持たせるが、型自体は`courseContextPrior.ts`で
  既に「不明な項目はnull」というnull-safe設計になっている——`RaceGateInput`の内訳を実際に確認したところ
  `frame`等の各項目がnullable。`FinalRaceAbilityInput.gate`自体をoptionalにする必要はなく、
  「値が無い場合は`RaceGateInput`内の各項目をnullにして渡す」という既存の型設計をそのまま踏襲すればよい。
- 呼び出し元への影響: 現在`FinalRaceAbilityInput`を実際に構築しているのは`finalRaceAbility.test.ts`のみ
  （本番コードからの呼び出し元は無い、STEP1で確認済み）。したがって型追加による実質的な破壊的変更の影響は
  テストファイル1つの更新のみに限定される。

---

## STEP6: clamp方針の正式化 — 3案比較と推奨

**前提の確認: 60-120は「通常運用域」ではなく異常値防止のsafety boundaryとして設計されている
（`suitabilityV1.ts`のコメント「通常はほぼ発動しない、異常値防止のための広い安全境界のみ」）。**
一方、旧clamp(90,110)は`overallSuitability`そのものの値域を強制的にこの範囲へ丸め込む「通常のclamp」であり、
70%のような値を原理的に表現できない。

| 観点 | 案A: 旧90-110を維持 | 案B: 60-120を通常運用域として採用 | 案C: overallSuitability自体はclampせず、最終出力にのみ60-120のsafety clamp（=`suitabilityV1.ts`の現行実装） |
|---|---|---|---|
| 能力9割思想との整合 | ✗ 「今回の条件でBase Abilityを何%発揮できるか」を80%や70%として表現できない | △ 60-120なら70%は表現できるが、「120」という強い上振れも通常域として許容してしまう | ◎ evaluatedComponentの実測値をそのまま反映でき、70%等の自然な値を歪めない |
| 70%適性の表現可能性 | ✗ 不可能（90に強制丸め） | ○ 可能 | ◎ 可能（元々clampしていないため） |
| 過補正防止 | ○ 強い制約で過補正を機械的に防ぐ | △ 60-120という広い枠自体は過補正防止として機能するが「通常域」と位置づけると効果が弱まる | ○ 各componentのconfidence shrink（`shrinkTowardCenter`）が主たる過補正防止機構であり、
60-120は「万一の異常値」に対する最終防波堤として機能を分離できる |
| 異常値防止 | 元々90-110自体が異常値防止を兼ねている（が値域が狭すぎて正常値まで潰す） | 60-120を通常域とすると「異常値防止」の意味が薄れる（そもそも滅多に到達しない前提が崩れる） | ◎ 60-120を「滅多に到達しない安全弁」として明確に位置づけられ、意味が最も明快 |
| 既存ロジックとの整合 | `suitability.ts`（旧系統、CHECKPOINT11.3以降凍結対象ではないが変更しない方針）とは整合するが、`suitabilityV1.ts`の設計思想（CHECKPOINT11.2で既に「90-110は能力9割思想と矛盾しうる」と指摘済み）とは矛盾する | `suitabilityV1.ts`は元々60-120を「安全境界であってclamp(90,110)の代替ではない」と明記しており、これを「通常域」に格上げすると既存コメント・設計意図と矛盾する | `suitabilityV1.ts`の現行実装・コメントとそのまま一致（変更不要） |
| 解釈可能性 | シンプルだが「なぜ90-110なのか」の根拠が本ラウンドまで示されていない仮パラメータ | 「60-120が通常」と「60-120が安全弁」の二重の意味を持たせると混乱する | 「evaluatedComponentの単純平均＝実測に基づく値」「60-120＝滅多に起きない異常防止」と役割が明確に分離され説明しやすい |

**推奨: 案C（`overallSuitability`自体はclampせず、最終出力にのみ60-120のsafety clampを適用）。**
これは新規の実装判断ではなく、`suitabilityV1.ts`の`aggregateSuitabilityComponents()`が
CHECKPOINT11.1〜11.3の段階で**既に実装済みの挙動**（`clampSafety(60,120)`のみを適用し、中間90-110 clampは
どこにも存在しない）と完全に一致する。したがって本STEPは新しい実装を必要とせず、
「この既に実装済みの挙動をSuitability V1の正式なclamp方針として追認・文書化する」という結論になる。

---

## STEP7: effectiveAbility候補式の監査（実装なし）

候補式: `effectiveAbility = baseAbility × overallSuitabilityPercent / 100`（現行`suitability.ts`の
`computeEffectiveAbility`と同一の乗算構造。分子をoverallSuitability→overallSuitabilityPercentへ
差し替えるだけで、式自体は変更しない）。

BaseAbility=70の場合の参考値（純粋な算術、実装・接続は行っていない）:

| overallSuitabilityPercent | 計算 | effectiveAbility |
|---|---|---|
| 100（中立） | 70 × 100/100 | 70.0 |
| 90 | 70 × 90/100 | 63.0 |
| 80 | 70 × 80/100 | 56.0 |
| 70 | 70 × 70/100 | 49.0 |
| 60（safety boundary下限） | 70 × 60/100 | 42.0 |
| 110 | 70 × 110/100 | 77.0 |
| 120（safety boundary上限） | 70 × 120/100 | 84.0 |

注: 60・120は「safety boundaryの理論上の限界値」であり、STEP6の結論通り通常はここまで到達しない
想定（`suitabilityV1.ts`のコメント通り）。70/80/90等はSTEP6で案Cを採用した場合に
実測ベースで自然に取りうる値として例示している。

---

## STEP8: 二重補正防止の確認（接続提案ベース、実装前の設計チェック）

STEP2〜STEP7の提案通りに接続した場合の乗算チェーンは以下の直列構造のみになる想定:

```
baseAbility（絶対能力、Ability Model V1、凍結）
  × overallSuitabilityPercent/100（Suitability V1: distance/course/going/gate、本人実績＋CoursePrior）
  = effectiveAbility
  × raceContextFactor/100（paceScenarioFactor × trackBiasFactor、runningStyle起因）
  = finalRaceAbility
```

- `runningStyle`（脚質）はSuitability V1の4コンポーネント（distance/course/going/gate）に
  含まれておらず、CHECKPOINT11.3のSTEP2以降一貫してSuitabilityの範囲外・`finalRaceAbility.ts`側の
  `raceContext`層のみで扱われている。二重評価は起きない。
- `gate`（枠番）はSuitability V1のcomponentとして評価される一方、`raceContext`層
  （`paceScenarioFactor`/`trackBiasFactor`）は`runningStyle`のみを入力としており、
  `gate`情報を参照する箇所は無い（`trackBiasFactor.ts`のコメントにも「枠番データを
  現状のRacePerformanceに無いため、V1のtrackBiasFactor算出には使わない」と明記されている）。
  したがってgateの二重補正も発生しない。
- distance/course/goingはSuitability V1側のみで評価され、`raceContext`層には距離・コース・
  馬場を直接の入力とする項目が無い。二重評価は無い。
- 以上より、接続提案は「baseAbilityに対しSuitability%とRaceContext%を直列に一度ずつ乗算する」
  という既存の`finalRaceAbility.ts`のアーキテクチャ（乗算対象がSuitabilityBreakdownからSuitabilityV1Resultに
  変わるだけ）を保っており、新たな二重計算経路を生まない。

---

## STEP9: 次回CHECKPOINT向け最小移行手順の提案（未実施）

1. `suitabilityV1Types.ts`に`source`（component単位）・`overallConfidence`（トップレベル）を追加
   （STEP2、既存フィールドは無変更）。
2. `suitabilityV1.ts`の`wrapSystemAComponent`/`computeGateSuitabilityV1`/`computeSuitabilityV1`を
   最小限拡張し、上記2フィールドを実際に埋める（既存の数値計算式・confidence判定・clamp方針は無変更）。
3. `raceContextTypes.ts`の`FinalRaceAbilityResult.suitability`の型を`SuitabilityBreakdown`から
   `SuitabilityV1Result`へ切替（STEP3案A）。
4. `finalRaceAbility.ts`のimportを`./suitability`から`./suitabilityV1`へ切替、
   `computeSuitabilityBreakdown`呼び出しを`computeSuitabilityV1`へ置換。`FinalRaceAbilityInput`へ
   `horseId: string`/`gate: RaceGateInput`を追加（STEP5）。`effectiveAbility`算出式は
   `suitability.overallSuitability`→`suitability.overallSuitabilityPercent`へ参照先変更のみ（式自体は不変）。
5. `raceOutcomeEvaluation.ts`の`resolveEvaluationConfidence()`内、旧3コンポーネントのフィールド参照
   （`distanceSuitability`/`goingSuitability`/`courseSuitability`）を新4コンポーネント
   （`distance`/`course`/`going`/`gate`）のフィールド参照へ更新（STEP4）。
6. 影響を受ける既存テスト（`finalRaceAbility.test.ts`・`raceOutcomeEvaluation.test.ts`・
   `suitabilityV1.test.ts`）を新しい入出力シェイプに合わせて更新。
7. 全体回帰: `npm test`/`npm run lint`/`npm run build`/`npm run validate:data`、
   シェイクユアハートbaseAbility=70.3の完全再現を確認。

この順序で最小限の変更ファイル数（型2ファイル・実装2ファイル・テスト3ファイル、計7ファイル程度）に
収まる見込みであり、Ability Model V1・HorseEvidence V1・GATE_HORSE_EVIDENCE_SCALE等の凍結対象には
一切触れない設計になっている。

---

## STEP10: 触っていないことの確認

本ラウンドで変更したファイルは本ドキュメント（`docs/suitability-v1-connection-type-design.md`）1件のみ。
以下は一切変更していない（コードレベルでも確認済み。git上変更ファイルなし）:

- Base Ability V1関連: `raceScore.ts`/`baseAbility.ts`/`abilityBeforeRace.ts`/`memberLevelCandidates.ts`/
  `memberLevel.ts`/`timeGapScore.ts`/`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`
- HorseEvidence V1: `horseGateEvidence.ts`/`horseEvidenceConfidence.ts`
- `GATE_HORSE_EVIDENCE_SCALE=4.0`・`GATE_HORSE_EVIDENCE_AMPLITUDE=5`・median集約・confidence shrink・
  CoursePrior方針（`suitabilityV1.ts`本体は今回未変更）
- `effectiveAbility`実装（`suitability.ts`）・`finalRaceAbility.ts`の本番接続処理
- `RaceContext`/`trackBias`/`paceScenarioFactor`
- Race Review Engine、その他UI

---

## STEP11: 回帰確認

- `npm test` — 527/527 pass（54 test files）。`abilityModelV1.regression.test.ts`含め全件パス、
  今回のドキュメントのみの変更のため計算結果への影響は無い。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ
  （sapporoKinenロースター外のhorseId 16件、courseTimeBaselines欠落25/48、courseFinal3FBaselines欠落28/48）。
- シェイクユアハートのbaseAbility = **70.3** を再現（回帰スイート内`abilityModelV1.regression.test.ts`で確認）。

---

## 完了報告（17項目）

1. **型差分一覧**: STEP1の表の通り。`SuitabilityBreakdown`(3component, `overallSuitability`, clamp90-110)
   vs `SuitabilityV1Result`(4component, `overallSuitabilityPercent`, clampSafety60-120)。
   `FinalRaceAbilityInput`にhorseId/gate無し。`raceOutcomeEvaluation.ts`は旧3componentのフィールド名に直接依存。
2. **正式V1型の提案**: STEP2の通り。`source`（component単位、既存フィールドからの機械的導出）と
   `overallConfidence`（トップレベル、weakest-link）を追加フィールドとして提案。既存フィールドは無変更。
3. **旧型の推奨対応**: 案A（新型へ直接置換）。理由はSTEP3参照（案Bはgate情報を損失させるため不採用）。
4. **raceOutcomeEvaluation.tsの推奨対応**: production-essentialではなくverification-onlyだが、
   legacy/dead-code候補でもない。型切替に伴い`resolveEvaluationConfidence()`のフィールド参照名のみ
   最小限追従修正が必要（アダプタ不要）。
5. **horseId/gate必要性判定**: 真に必要（`computeSuitabilityV1()`の既存シグネチャが要求するため）。
   投機的な追加ではない。呼び出し元への実質影響はテスト1ファイルのみ。
6. **clamp 90-110 vs 60-120比較**: STEP6の表の通り。60-120は「通常運用域」ではなく異常値防止の安全弁として設計されている。
7. **推奨clamp方針**: 案C（overallSuitability自体は非clamp、最終出力にのみ60-120 safety clamp）。
   これは`suitabilityV1.ts`の現行実装と完全一致しており、新規実装は不要。
8. **effectiveAbility式監査**: `effectiveAbility = baseAbility × overallSuitabilityPercent / 100`
   （現行`computeEffectiveAbility`と同一の乗算構造）。実装は行っていない。
9. **BaseAbility=70でのSuitability別結果**: 100→70.0 / 90→63.0 / 80→56.0 / 70→49.0 / 60→42.0 / 110→77.0 / 120→84.0。
10. **二重補正リスク**: 接続提案上、runningStyle/gate/distance/course/goingいずれもSuitability層と
    RaceContext層で重複評価される経路は無い（STEP8）。
11. **推奨移行順序**: STEP9の7ステップ（型拡張→実装拡張→型切替→finalRaceAbility切替→
    raceOutcomeEvaluation追従→テスト更新→全体回帰）。
12. **最小変更ファイル候補**: `suitabilityV1Types.ts`・`suitabilityV1.ts`・`raceContextTypes.ts`・
    `finalRaceAbility.ts`・`raceOutcomeEvaluation.ts`・`finalRaceAbility.test.ts`・
    `raceOutcomeEvaluation.test.ts`・`suitabilityV1.test.ts`（計8ファイル程度、次回実施時の見込み）。
13. **baseAbility=70.3再現**: 確認済み（`abilityModelV1.regression.test.ts`含む527/527件パス）。
14. **test/lint/build/validate:data結果**: 全て成功・クリーン（STEP11参照）。
15. **技術的負債**: `suitabilityCoreV1Types.ts`/`suitabilityCoreV1.ts`は自身のテスト以外から一切
    参照されない死蔵コードのまま（今回も削除せず、CHECKPOINT11.12からの既知の負債として維持）。
    移行完了後、旧`suitability.ts`系（`computeSuitabilityBreakdown`/`computeEffectiveAbility`）も
    使用箇所が無くなり削除候補になりうるが、今回は削除しない。
16. **A/B/C判定**: **A**。4つの不整合すべてについて実装コードの実態（推測なし）に基づく比較・
    決定根拠を提示でき、各提案は既存の凍結仕様（Ability Model V1・HorseEvidence V1・
    GATE_HORSE_EVIDENCE_SCALE=4.0）に一切抵触しない。clamp方針（STEP6/STEP7）は
    既存実装の追認であり新規リスクが無く、horseId/gate追加も投機的でない実装上の必然。
    二重補正の不在もSTEP8で具体的に確認できた。
17. **次回決定事項**: (a) 本設計のChatGPT承認、(b) STEP9移行手順に沿った実装の実施可否、
    (c) `source`/`overallConfidence`追加の実装詳細（confidence weakest-linkの具体的な優先順位表）の
    最終確認、(d) 旧`suitability.ts`系の削除タイミング（移行完了後の別ラウンドで検討）。

**ここでSTOPします。Suitability V1の本番接続（`finalRaceAbility.ts`の実装変更）は、
本設計結果をChatGPTが承認した次のCHECKPOINTで行います。**

# Suitability V1 A判定前: overallConfidence正式化 ＋ 未評価RaceContext補正の整理（CHECKPOINT11.17）

CHECKPOINT11.16のB判定を受け、Suitability V1をA判定へ上げる前の最後の「意味上の不整合」2点
（overallConfidenceの意味・evaluated=falseのRaceContextがfinalRaceAbilityを動かす問題）を
最小範囲で解消した。CoursePrior用の新規大規模データ収集・trackBias・Race Review Engine・
全頭展開には進んでいない。本ラウンドは実装変更を伴う（本ドキュメント末尾「実装変更内容」参照）。

---

## 1. overallConfidence旧仕様

`suitabilityV1.ts`の`computeOverallConfidence()`は、distance/course/going/gateの**4component全て**
（evaluated=falseも含む）のconfidenceでweakest-linkを取っていた。evaluated=falseのcomponentは
常にconfidence="unknown"を持つため、1つでも未評価componentがあればoverallConfidence全体が
"unknown"に支配されていた（CHECKPOINT11.16で確認済み。CHECKPOINT11.15の実例:
distance=medium・going=medium・course=unevaluated・gate=unevaluated → overallConfidence="unknown"）。

---

## 2. overallConfidence新仕様

CHECKPOINT11.16の推奨案Bを正式採用し、**evaluated=trueのcomponentのみ**を対象に
weakest-linkを取るよう変更した。evaluated=trueのcomponentが1つも無い場合のみ"unknown"を返す。

```typescript
export function computeOverallConfidence(components: SuitabilityComponentResultV1[]): SuitabilityConfidenceV1 {
  const evaluated = components.filter((c) => c.evaluated);
  if (evaluated.length === 0) return "unknown";
  return evaluated.reduce<SuitabilityConfidenceV1>(
    (weakest, c) => (CONFIDENCE_V1_RANK[c.confidence] < CONFIDENCE_V1_RANK[weakest] ? c.confidence : weakest),
    "high",
  );
}
```

新しいconfidence閾値・定義は一切作っていない（既存の`CONFIDENCE_V1_RANK`
`{unknown:0, low:1, medium:2, high:3}`をそのまま再利用）。変更は`computeOverallConfidence`の
フィルタ条件1行の追加のみ。

CHECKPOINT11.15の実例（シェイクユアハート×宝塚記念）は、この変更により
overallConfidence="unknown" → **"medium"**（distance=medium・going=medium・
evaluatedComponentCount=2のweakest-link）へ変わる（第10節で実データ再検証）。

---

## 3. evaluatedComponentCountとの役割分離

- **confidence**（`overallConfidence`）= 評価に使えた証拠の質・信頼度。**evaluated=trueの
  componentのみ**を対象とする。
- **evaluatedComponentCount** = 4component中いくつ評価できたか（completeness/coverage）。
  今回変更していない、既存フィールドがそのままこの役割を担う。
- **unknown** = データ不足等により評価不能（`evaluatedComponentCount=0`の場合の
  `overallConfidence`、または個別componentの`confidence`）。**「悪い適性」「低confidence」
  「100%相当」のいずれとも解釈しない。** `rawPercent`/`adjustedPercent`が100（中立値）に
  なっているのは、評価不能な場合の**単なるプレースホルダー**であり、平均計算には
  一切含まれない（`aggregateSuitabilityComponents`が`evaluated=true`のみでフィルタする、
  CHECKPOINT11.3から不変の既存仕様）。

`overallConfidence`と`evaluatedComponentCount`は独立した2つの軸として、常に両方を
セットで読む（`overallConfidence`だけを見て「一部しか評価していない」ことを見落とさない）
という設計原則を維持する（CHECKPOINT11.16の推奨に基づく）。

---

## 4. 境界値テスト

`computeOverallConfidence`のexportに伴い、`suitabilityV1.test.ts`へ4件の境界値テストを追加し、
全てCHECKPOINT11.17の指定通りの結果を確認した。

| CASE | 入力 | 結果 |
|---|---|---|
| A | 4/4 evaluated、high/high/medium/high | overallConfidence=**medium** |
| B | 2/4 evaluated(medium/medium)+2 unevaluated(unknown) | overallConfidence=**medium**（未評価componentがunknown化しない） |
| C | 1/4 evaluated(low)+3 unevaluated(unknown) | overallConfidence=**low** |
| D | 0/4 evaluated | overallConfidence=**unknown**、evaluatedComponentCount=**0** |

いずれもCHECKPOINT11.17 STEP5で指定された期待値と完全一致した。

---

## 5. RaceContext=99.3%の出所

CHECKPOINT11.15のシェイクユアハート×宝塚記念で`raceContext.value=99.3%`となった経路を
実コードから再確認した（本ラウンドの変更前の状態として）。

- `predictedPace = classifyPredictedPace([])`（`fieldRunningStyleDistributions=[]`、
  対戦馬データ無し）→ 既存の決定的ルール「逃げ候補・先行候補ともに0頭ならスロー」により
  `level="slow"`、`fieldSize=0`。
- `paceScenarioFactor = computePaceScenarioFactor(runningStyle, ..., predictedPace)`
  → `runningStyle`はシェイクユアハート自身の実データ（final3F相対値ベースのfallback、
  confidence=low）。`raw=100+5×(-1)×leanScore=97.8`、`adjusted=shrinkTowardCenter(97.8,"low")=99.3`。
- `trackBiasFactor`は`manualTrackBias=null`・`autoTrackBias=null`のため、既存フォールバック
  （`observation===null`分岐）により`raw=adjusted=100`・`usedSource="neutral"`。
- `raceContext.raw = 99.3 × 100 / 100 = 99.3`、`clamp(99.3, 90, 110) = 99.3`（旧`value`計算）。

**実データ由来かfallback由来か**: 両方の性質が混在している。`paceScenarioFactor`の`raw=97.8`は
「シェイクユアハート自身の実データ（fallback runningStyle）」と「対戦馬データ0頭という事実に
対する決定的ルールの適用結果（predictedPace=slow）」の掛け合わせであり、後者は実質的に
「情報が無いことへの規約上のデフォルト分類」である。`trackBiasFactor`は完全にfallback
（観測情報無し→中立100%）。

---

## 6. RaceContext evaluated状態

**変更前**: `RaceContextFactor`型に`evaluated`フィールドは存在しなかった（`paceScenarioFactor`/
`trackBiasFactor`のいずれも「評価しない」という状態を明示的に持たない設計だった）。

**変更後（本ラウンドで追加）**: `evaluated: boolean`を追加した。定義は
`predictedPace.fieldSize > 0 || trackBiasFactor.usedSource !== "neutral"`
（いずれか一方でも実データ由来の情報があればtrue）。シェイクユアハート×宝塚記念の場合
`fieldSize=0`かつ`trackBiasFactor.usedSource="neutral"`のため、`evaluated=false`となる。

**なぜevaluated=falseでもfinalRaceAbilityへ掛かっていたか（変更前の構造）**: `trackBiasFactor`は
観測が無い場合すでに自ら中立100を返す設計だったが、`paceScenarioFactor`には対戦馬データが
0頭でも`classifyPredictedPace`（既存・無変更）が決定的に"slow"等を返し、それがそのまま
`raw`/`value`へ反映される非対称な構造があった（CHECKPOINT11.16 STEP11で確認済みの論点）。
`RaceContextFactor`に「未評価」を判定する仕組みが無かったため、実質的に情報が無いにも
関わらず`raceContext.value`（99.3%）がそのまま`finalRaceAbility`の計算へ適用されていた。

---

## 7. 案A/B/C比較

| 比較軸 | 案A: 現状維持（evaluated=falseでもvalueを掛ける） | 案B: evaluated=falseならfinalRaceAbility=effectiveAbility（補正しない） | 案C: evaluated=falseならvalue=100として扱う |
|---|---|---|---|
| 説明可能性 | 「対戦馬データ0頭」という情報の不在が、99.3%という具体的な数値に化けて説明しづらい | 「評価できていないため補正なし」と明快に説明できる | 数値上は案Bと同じ（value=100）だが、「evaluate**した**結果たまたま中立だった」という誤解を招きうる |
| データ不足時の安全性 | 低い。ゼロ情報から非中立の補正（97.8%→99.3%）が生まれ、根拠なくfinalRaceAbilityを動かす | 高い。未評価要素はfinalRaceAbilityに影響しない | 数値としては安全（案Bと同じ）だが、「evaluated」というフラグ自体を持たないため将来の監査で「未評価だった」ことを追跡しにくい |
| 能力9割思想 | 対戦馬0頭という薄い前提から生じた補正がBase Ability由来のeffectiveAbilityを動かしてしまい、思想に反しうる | 「能力を9割主要因とし、根拠の無い补正で動かさない」という思想に最も忠実 | 数値上は案Bと同等だが、"evaluated"概念が無いままだと今後同種の問題を再発しやすい |
| Suitability V1のunknown処理との一貫性 | 不一致。Suitability V1はevaluated=falseのcomponentを平均から除外するが、RaceContextは除外せず適用していた | 一致。「評価できていない要素は能力を動かさない」という同じ原則をRaceContextにも適用する | 数値のみ一致。しかし`evaluated`という状態を型として持たないため、Suitability V1のように「除外した」という事実を結果に明示できない |
| 将来RaceContextを正式実装する際の拡張性 | 拡張時にこの非対称性を引きずったまま複雑化するリスク | `evaluated`フラグが既にあることで、将来paceScenario/trackBiasそれぞれに対する
より細かい評価可否判定（例: 対戦馬データが1頭のみの場合の扱い等）を拡張しやすい | `evaluated`概念が無いため、将来の拡張時に改めて同じ設計判断をやり直す必要がある |
| 隠れた補正の防止 | 防止できない（本ラウンドで発見された問題そのもの） | 防止できる。`raw`は監査用に保持したまま、`value`のみ中立化するため、隠さず・かつ影響も与えない | 数値上は防止できるが、`raw`と`value`の両方が同じ「evaluated無し」の状態を表現する型的裏付けが無い |

---

## 8. 未評価RaceContext正式推奨

**案B（evaluated=falseならfinalRaceAbility=effectiveAbility、RaceContext補正を適用しない）を採用した。**
ただし実装上は、`value`を直接無視するのではなく、`RaceContextFactor.evaluated`という明示的な
フラグを持たせた上で`value`をevaluated=falseの場合のみ中立100へ上書きする形にした
（`raw`は実際の計算結果のまま監査用に保持）。これは「評価できていない要素は能力を動かさない」
というSuitability V1の既存原則（`aggregateSuitabilityComponents`のevaluated=trueのみでの
平均化）と同じ思想をRaceContext層にも適用したものであり、案Bと案Cの「意味の違い」
（第7節参照）を踏まえ、`evaluated`という状態を型として明示する案B寄りの実装を選んだ。

---

## 9. 実装変更内容

本ラウンドはSTEP4・STEP9の許可範囲内で以下の最小限のコード変更を行った
（Suitability V1の4component式・effectiveAbility式・RaceContext本体数式・閾値・
GATE_HORSE_EVIDENCE_SCALE等はいずれも変更していない）。

**変更ファイル（6件、コード4件・テスト2件）**:

1. `src/ability/suitabilityV1.ts` — `computeOverallConfidence()`をevaluated=trueのみで
   weakest-linkを取るよう変更（第2節）。関数をexportに変更（テストからの直接検証のため）。
2. `src/ability/raceContextTypes.ts` — `RaceContextFactor`に`evaluated: boolean`フィールドを追加。
3. `src/ability/raceContextFactor.ts` — `computeRaceContextFactor()`に第3引数
   `predictedPace: PredictedPace`を追加し、`evaluated = predictedPace.fieldSize > 0 ||
   trackBiasFactor.usedSource !== "neutral"`を判定。evaluated=falseの場合のみ`value`を
   中立100へ上書き（`raw`は変更しない）。`paceScenarioFactor.ts`/`trackBiasFactor.ts`
   自体（RaceContext本体の数式・閾値）は一切変更していない。
4. `src/ability/finalRaceAbility.ts` — `computeRaceContextFactor`呼び出しに
   `predictedPace`を追加で渡す1行のみの変更。
5. `src/ability/__tests__/raceContextFactor.test.ts` — 既存5テストへ`predictedPace`引数を
   追加（既存の期待値・挙動は無変更）。新設した`evaluated`用describe blockに3テストを追加
   （fieldSize>0で評価される・trackBias実観測があれば評価される・両方無ければ評価されない）。
6. `src/ability/__tests__/suitabilityV1.test.ts` — `computeOverallConfidence`の境界値テスト
   （CASE A〜D、第4節）を4件追加。

**新規追加テスト数**: 7件（境界値4件＋RaceContext evaluated 3件）。既存527件は無変更のまま
全通過（既存テストの期待値・挙動に影響なし。理由: 既存テストは全て`fieldRunningStyleDistributions`
が非空、または`manualTrackBias`が実観測ありのケースのみを使っており、いずれも
`evaluated=true`側に該当するため）。

---

## 10. シェイクユアハート再計算

宝塚記念条件（阪神/turf/2200/重）で、本ラウンドの実装後に再計算した結果
（`loadHorseAbilityProfile`+`computeFinalRaceAbility`の実コードをそのまま呼び出す一時
スクリプトで確認、確認後削除）。

| 項目 | 値 |
|---|---|
| baseAbility | 70.3 |
| overallSuitabilityPercent | 99.8%（変更なし） |
| overallConfidence | **"medium"**（旧仕様では"unknown"、新仕様で変化） |
| evaluatedComponentCount | 2（distance・going。変更なし） |
| effectiveAbility | 70.2（変更なし） |
| RaceContext evaluated | **false**（fieldSize=0・trackBias観測なし） |
| RaceContext raw | 99.3%（監査用、実際の計算結果のまま保持） |
| RaceContext value | **100**（evaluated=falseのため中立へ上書き） |
| finalRaceAbility | **70.2**（旧仕様では69.7だった） |

**期待された意味の確認**: RaceContextが未評価（evaluated=false）のため、effectiveAbility(70.2)から
finalRaceAbility(70.2)へ理由なく変化しないことを確認した——`finalRaceAbility === effectiveAbility`
が成立している。

---

## 11. 4component実馬ケース検証

CHECKPOINT11.16で発見した4component全評価可能な実馬ケース（シェイクユアハート×金鯱賞、
中京/turf/2000/良）で、overallConfidence新仕様の動作を確認した（新規大規模データ収集は行っていない）。

```json
{
  "distance": { "evaluated": true, "confidence": "medium" },
  "course":   { "evaluated": true, "confidence": "low" },
  "going":    { "evaluated": true, "confidence": "medium" },
  "gate":     { "evaluated": true, "confidence": "low" },
  "evaluatedComponentCount": 4,
  "overallConfidence": "low",
  "overallSuitabilityPercent": 101.6
}
```

4component全てがevaluated=trueのため、旧仕様（案A、全component対象）でも新仕様
（案B、evaluated=trueのみ対象）でも対象集合が同一（4件とも含まれる）になり、
結果は変化しない（medium/low/medium/lowのweakest-link=low、CHECKPOINT11.16の第9節と一致）。
これは新仕様が「一部だけ評価できたケース」（第10節のシェイクユアハート×宝塚記念）でのみ
挙動を変え、「全部評価できたケース」では旧仕様と自然に一致するという、意図した設計通りの
振る舞いであることを実データで確認できたことを意味する。

---

## 12. CoursePrior technical debt判定

**判定: データ不足であり、Suitability V1本体のA判定を永久に阻害する仕様欠陥ではない。**

CHECKPOINT11.16で確認した通り、CoursePrior経路のgate evaluated=trueが検証できないのは、
(1) `data/horses/*.json`全37ファイルに東京ダート1600mの実レースが1件も存在しない、
(2) `gate`/`horseNumber`/`fieldSize`（実際の枠番情報）を保持する実データファイルが0件、
という2つの独立した実データ欠如が原因であり、`computeGateCoursePriorDetail()`
（CoursePriorのロジック自体、本ラウンドも変更していない）に欠陥は見つかっていない。
ロジックは「東京ダート1600m×frame既知」という条件が揃えば正しく発動する設計になっており
（CHECKPOINT8〜11.5で実装・検証済み）、単に**その条件を満たす実データがrepoに搭載されて
いないだけ**である。したがって、これはSuitability V1の4component構造・計算ロジックの
健全性とは独立した「特定の1経路（CoursePrior）についての実データ収集待ち」の技術的負債
として、Suitability V1本体のA判定とは切り離して管理する。

---

## 13. baseAbility=70.3再現

`abilityModelV1.regression.test.ts`を単独実行し、3テストすべてパス。シェイクユアハートの
baseAbility=**70.3**を完全再現した。本ラウンドの変更ファイル（第9節）はいずれも
Base Ability V1関連ファイル（raceScore.ts/memberLevel.ts/timeGapScore.ts/raceTimeScore.ts/
final3FScore.ts/weightScore.ts/abilityBeforeRace.ts/baseAbility.ts）に含まれない。

---

## 14. test/lint/build/validate:data

- `npm test` — **534/534 pass**（54 test files、既存527件+新規7件）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 15. Suitability V1 A/B/C判定

- **A. Suitability V1本体**: CHECKPOINT11.16で構造欠陥なしと確認済み（STEP1で固定・再研究せず）。
  本ラウンドでoverallConfidenceの意味整理を実装・境界値テストで検証し、既知の不整合を解消した。
- **B. RaceContext未評価ガード**: 実コード監査により「根拠なしにfinalRaceAbilityを変動させる
  構造」を確認し（第5節・第6節）、最小修正（RaceContext本体の数式・閾値は無変更、適用ガードの
  追加のみ）で解消した。単体テスト3件（fieldSize>0で評価／trackBias実観測で評価／両方無しで
  非評価）と実データ1件（シェイクユアハート×宝塚記念）で動作を確認した。
- **C. CoursePrior technical debt**: データ不足に起因する既知の制約であり、Suitability V1本体の
  健全性やA判定を妨げる仕様欠陥ではないと判定した（第12節）。

**総合判定: A。Suitability V1は正式にA判定として凍結できる状態にあると判断する。**

根拠: 4component構造は複数馬・複数条件の実データで健全動作が確認済み（CHECKPOINT11.16）。
overallConfidenceの意味上の不整合（未評価と低confidenceの混同）を本ラウンドで解消した。
RaceContextの「根拠なき補正」問題も本ラウンドで解消した。残るCoursePriorの制約は
「本体の欠陥」ではなく「特定経路の実データ待ち」であり、A判定を妨げない。回帰
（test/lint/build/validate:data、baseAbility=70.3）はすべてクリーン。

---

## 16. technical debt

- CoursePrior経路のgate evaluated=trueは、東京ダート1600mの実レースデータ・実gate/frame
  データのいずれもrepo内に存在しないため、実データでの検証が引き続き構造的に不可能
  （第12節、A判定を妨げないと判定済みの既知の制約として維持）。
- CHECKPOINT11.15で報告した「distance/going component等のreason文言がconfidence再判定後の
  値と食い違う」既知の非整合は未修正のまま（`wrapSystemAComponent`の`component.reason`
  流用に起因、数値自体は正しいが説明可能性に軽微な欠陥が残る）。
- RaceContextの`evaluated`ガードは、`paceScenarioFactor`と`trackBiasFactor`をまとめて
  「どちらかに実データがあればevaluated=true」という粗い粒度で判定している（Suitability V1の
  component単位の粒度より粗い）。より細かい粒度（例: paceScenarioFactor単独の評価可否）への
  拡張は今回のスコープ外。
- 旧`suitability.ts`系・`suitabilityCoreV1Types.ts`系はCHECKPOINT11.14時点から未削除のまま
  （継続する技術的負債）。
- Suitability V1パイプライン（`computeFinalRaceAbility`/`evaluateRaceOutcomes`）は依然として
  UI・呼び出し先から到達不能（CHECKPOINT11.14〜11.15から継続）。

---

## 17. 次にChatGPTと決める必要がある項目

1. Suitability V1がA判定として正式凍結された前提で、次フェーズ（全頭展開・RaceContext正式実装・
   trackBias・キーンランドC実戦投入等）のうち、どれから着手するか。
2. CoursePrior経路の実データ収集（東京ダート1600mの実レースデータ・実gate/frame情報）を
   優先事項とするかどうか、するならどのようなZIPスペックが必要か。
3. RaceContextの`evaluated`ガードをより細かい粒度（pace/trackBias個別）へ拡張するかどうか。
4. reason文言の非整合（第16節）を修正するかどうか。
5. 旧`suitability.ts`系・`suitabilityCoreV1Types.ts`系の削除タイミング。

**ここでSTOPします。** Suitability V1がA判定になりましたが、次のフェーズへはChatGPT承認後に進みます。

# 東京ダート1600m 枠適性（gate suitability）V1 方針決定（CHECKPOINT 10.3）

**確定日: 2026-08-22。ステータス: 方針確定・数式は未実装。**

[`docs/ability-model-v1.md`](ability-model-v1.md)（Ability Model V1、凍結済み）とは独立したレイヤー。
本文書はSuitability V1の一部である「枠適性（gate suitability）」について、CHECKPOINT 6〜10.2の
一連の実データ検証（コースカルテ監査→設計比較→東京ダート1600m実データ10レース→30レース検証）
を踏まえた方針を記録する。**この文書は数式・percent・重みを確定するものではない。**

## 背景（CHECKPOINT 6〜10.2の要約）

1. コースカルテ（`data/courseKarte/tokyoDirt1600.json`）は、JRA-VAN・競馬ラボ等の複数ソースが
   「芝スタートで外側ほど芝区間が約30m長い」という構造的根拠に基づき、東京ダート1600mの
   `gateBias.level = "high"`（外枠有利）と記述している。
2. CHECKPOINT8で`courseContextPrior.ts`を実装し、枠(frame)ごとの実測複勝率差から正規化した
   `gateCoefficient`（-1〜+1、unitless）を導入。この時点ではeffectiveAbilityへの接続は行っていない。
3. CHECKPOINT10.1で東京ダート1600m実レース10戦・157頭を検証：frame-finishPosition相関係数
   -0.1267（外枠有利の方向とは一致）。ただし枠別成績は非単調（frame3が最下位、frame4/8が同率首位）。
4. CHECKPOINT10.2で追加20戦・294頭（計30戦・451頭）を検証：相関係数は**+0.0081**（ほぼゼロ、
   符号も反転）。going別（良/稍重/重/不良）でも方向が一貫しない（不良は+0.1117と明確に逆方向）。

## STEP1: CoursePriorとHorseEvidenceの優先順位

以下の優先順位をV1の正式方針とする（`courseContextPrior.ts`の`combineConfidence`が
`min(horseEvidenceConfidence, coursePriorConfidence)`を採用していることと整合）。

1. **HorseEvidence（優先度1）**: 対象馬自身が同条件・類似条件で実際に走った実績。十分にあれば
   CoursePriorより優先する。
2. **CoursePrior（優先度2）**: コース構造・長期統計・複数ソースからの一般的傾向。本人データが
   無いからといって、これだけで大きな数値補正を行ってはならない。
3. **unknown / neutral（優先度3）**: 本人実績が薄く、実測データも安定しない場合。無理に補正せず
   中立・評価不能として扱う。

## STEP2: 東京ダート1600m CoursePrior再評価（A〜E比較）

| 案 | 30レース整合性 | 芝スタート構造根拠 | 複数ソース整合性 | 能力9割思想との整合性 | 過剰補正リスク |
|---|---|---|---|---|---|
| A: highのまま維持 | 悪い（相関ほぼゼロ・方向不安定） | 維持 | 維持 | 悪い（実測不支持のまま強補正） | 高い |
| B: mediumへ下げる | 部分的（妥協的） | 維持 | 弱まる（恣意的な格下げ） | 中間 | 中程度 |
| C: lowへ下げる | やや近い | 維持されるが説明力を過小評価 | 既存記述と矛盾（複数ソースはhighと言っている） | 良い | 低い |
| **D: 方向情報のみ保持、数値補正には使わない** | **良い（数値補正しないため実害なし）** | **維持** | **維持（記述自体は否定しない）** | **最良** | **最小** |
| E: neutral/uncertainにする | 良い | 失われる（構造的事実まで捨てる） | 悪い（複数ソースの記述を無視） | 良いが情報損失 | 最小だが将来の再評価材料も失う |

### 採用: 案D

**「方向情報（gateBiasLevel・gateCoefficientの符号）は保持するが、強い数値補正の根拠には使わない」**
を正式採用する。理由：
- 芝スタート30m差という物理的構造は今回の検証で否定されていない（否定されたのは
  「その構造が着順にどれだけ強く・安定して影響するか」という点）
- 複数ソースの記述自体を書き換える理由が無い（30レースは「一般的傾向の記述」を反証するには
  規模も検証設計も不十分）
- E（neutral化）は構造的事実まで削除することになり、将来HorseEvidenceが蓄積された際の
  再評価材料を失う

### 実装

`courseContextPrior.ts`に`EmpiricalValidationStatus`（`"supported" | "weakOrUnstable" | "notEvaluated"`）
を追加し、東京ダート1600mは`"weakOrUnstable"`とした。`gateBiasLevel`（出典の記述としての確信度）・
`gateCoefficient`の値自体は変更していない。両者を同じ`CourseContextPrior`型の別フィールドとして
明示的に分離することで、「出典は強く言っているが、実測はまだ弱い」という状態を型レベルで表現する。

## STEP3: MAX_WIDTH比較（正式採用しない、結果のみ保存）

baseAbility=70、frame1(gateCoefficient=-0.409) vs frame8(gateCoefficient=+1.0)での
シミュレーション結果（`gateValidationV1.ts`の`simulatePercentFixedWidth`/`simulatePercentConfidenceWeighted`
で再現可能）：

| MAX_WIDTH | CASE-A frame1 | CASE-A frame8 | 内外差(A) | CASE-B(low) frame1 | CASE-B(low) frame8 | 内外差(B) |
|---|---|---|---|---|---|---|
| 1% | 69.7 | 70.7 | 1.0 | 69.9 | 70.2 | 0.3 |
| 2% | 69.4 | 71.4 | 2.0 | 69.8 | 70.4 | 0.6 |
| 3% | 69.1 | 72.1 | 3.0 | 69.7 | 70.6 | 0.9 |
| 5% | 68.6 | 73.5 | 4.9 | 69.6 | 71.1 | 1.5 |
| 8% | 67.7 | 75.6 | 7.9 | 69.3 | 71.7 | 2.4 |

**MAX_WIDTHは正式採用しない。** CASE A（CoursePriorのみ）はMAX_WIDTH=5%以上で内外差が
baseAbility差5点近くに達し、「能力が9割、枠は微調整」という思想と矛盾するリスクが高い。
CASE B（confidence連動）は自動的に圧縮される（8%でも内外差2.4点）が、そもそも実測方向が
不安定な現状ではMAX_WIDTHの値そのものを議論する前提が整っていない。

## STEP4: HorseEvidence n=3候補（保存のみ・補正式化しない）

`findRepeatedHorses(ALL_GATE_VALIDATION_ROWS)`で機械抽出（結果を見た選定なし）。3回以上出走：

| 馬名 | 出走回数 |
|---|---:|
| ファンタイムギフト | 3 |
| マリンバンカー | 3 |
| エドワードバローズ | 3 |
| スパークインザアイ | 3 |
| ヒロピアーナ | 3 |
| サムワンライクユー | 3 |

n=2は34頭。いずれも正式なHorseEvidence補正式は作成していない（クラス・馬場状態・脚質・
相手関係を分離できるサンプルではないため）。正式補正は後続CHECKPOINTで扱う。

## STEP5: Suitability V1構造

```
Base Ability → Suitability → Effective Ability
```
の順序を維持。`suitabilityCoreV1Types.ts`のdistance/course/surface/turn/going/gate/runningStyleの
7独立componentのうち、gateは`suitabilityCoreV1.ts`の`buildTokyoDirt1600GateComponent()`で
CourseContextPriorを反映するデモ実装のみ存在する。**scoreは常にnull**（今回も最終計算式・
重み・effectiveAbilityへの接続は未実装）。gateを特別扱いしてBase Abilityへ直接加点・減点する
経路は存在しない（`data/horses/*.json`・`RaceHistoryRawInput`・`RacePerformance`のいずれも
本ラウンドで変更していない）。

## STEP6: confidence設計（案のみ、閾値は未確定）

| 本人実績 | confidence候補 |
|---|---|
| CoursePriorのみ（本人実績0走） | low |
| 本人実績1〜2走 | low |
| 本人実績3〜4走 | medium候補 |
| 本人実績5走以上 | high候補 |

閾値は今回正式決定しない。重要なのは「本人データが薄いときにCoursePriorだけで強い補正を
掛けない」という原則であり、これは既存の`combineConfidence = min(...)`によって既に
アーキテクチャ上担保されている（horseEvidenceConfidenceを集計する仕組み自体は
CHECKPOINT9/10.1で指摘された既知の制約として引き続き未実装）。

## 結論（CHECKPOINT10.3時点のV1方針）

- 東京ダート1600mのgateBiasLevel = **highのまま維持**（出典の記述として）
- ただし`empiricalValidationStatus = "weakOrUnstable"`により、**強い数値補正の根拠としては
  使わない**
- HorseEvidenceがCoursePriorより優先されるアーキテクチャ（`combineConfidence`のmin方式）は
  維持
- MAX_WIDTH・Suitability最終計算式・effectiveAbilityへの接続は、いずれも次のCHECKPOINT以降の
  判断事項として保留する

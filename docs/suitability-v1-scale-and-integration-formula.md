# Suitability V1 数値スケール・統合式 最終確定（CHECKPOINT11.2・設計のみ、実装なし）

**作成日: 2026-08-23。ステータス: 設計文書のみ。本番コード変更なし。**

`docs/suitability-v1-architecture-unification.md`（CHECKPOINT11.1）の案C方針を
前提に、`clamp(90,110)`が現在の思想（「今回の条件でBase Abilityを何%発揮できるか」＝
70%・105%等の値を理論上取り得る）と整合するかを再検討する。**今回も実装・接続は
行わない。**

---

## STEP1: clamp(90,110)の意味を再確認

既存コード（`suitabilityConfidence.ts`・`suitability.ts`）を精査すると、実は
**AとCの両方が既に別々の場所で実施されている**ことが分かった。

- **C（confidenceが低い時だけ100へshrink）**: 各component（`distanceSuitability.ts`
  等）が`shrinkTowardCenter(raw, confidence)`を通す。式は
  `adjusted = 100 + (raw - 100) × confidenceWeight`
  （`CONFIDENCE_SHRINK_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 }`）。
  confidence=highなら`adjusted = raw`（縮小なし）、confidence=lowなら100に大きく
  近づく。これは**証拠の強さに応じた縮小**であり、思想と矛盾しない。
- **A（overallSuitabilityPercentそのものを90〜110に制限）**: `suitability.ts`の
  `computeSuitabilityBreakdown()`が、3コンポーネントの`adjusted`平均を
  **`clamp(..., SUITABILITY_CLAMP_MIN=90, SUITABILITY_CLAMP_MAX=110)`で強制的に
  丸めている**。これは証拠の強さと無関係に、**最終出力のレンジ自体を狭く固定する**
  処理である。
- **B（各componentが与えられる補正幅だけを制限）**: 現状どこにも実装されていない
  （CoursePrior側の最大影響幅を制限する仕組みは無い。STEP3で新規に検討する）。
- **D（組み合わせ）**: 現状の実装はまさに「C（component単位のconfidence shrink）
  ＋A（最終出力の強制clamp）」の組み合わせになっている。

### 問題点

CとAは**目的が異なる**。Cは「証拠が弱い時に信じすぎない」ための縮小であり、
証拠が強ければ（confidence=high）そのまま`raw`を通す設計である。一方Aは
「証拠の強さに関係なく、最終値を90〜110の帯域に押し込める」処理であり、
**confidence=highで複数componentが一致して低い値を示した場合でも、その正当な
シグナルを潰してしまう**。STEP8の具体例（CASE C・confidence=high）で、
この矛盾が実際に発生することを示す。

**結論**: A（最終出力の強制clamp）とC（component単位のconfidence shrink）を
混同しない。Cは維持すべき正しい仕組み。Aは「70%の適性」という概念そのものを
表現不能にするため、**通常運用の制約としては使わない**方向で再設計する
（STEP7で詳述）。

---

## STEP2:「能力9割」と「能力発揮率」を混同しない

- **「能力9割」の意味**: Base Ability評価を最優先し、Suitability・展開・枠順等に
  よって**馬同士の能力比較そのものを安易に逆転させない**こと。CHECKPOINT11.2の
  例（baseAbility80×suitability70%=56 > baseAbility50×suitability100%=50）が
  まさにこれを示している——**suitabilityが70%という広いレンジを取っても**、
  能力差（80 vs 50）が結果を支配している。つまり「能力9割」は**Suitabilityの
  値域を狭くすること**では担保されない。
- **「能力発揮率」の意味**: Suitabilityは「その馬が今回どれだけ自分の力を出せるか」
  という**連続的な%**であり、70%・105%等、状況に応じて広く動いてよい概念である。

**したがって、`clamp(90,110)`という値域制限そのものは「能力9割」の実装ではない。**
「能力9割」を守るための本当のガードレールは、
1. confidence shrink（弱い証拠は100へ寄せる、STEP1のC）、
2. CoursePriorの最大影響幅の制限（STEP3、弱い補助情報が単独で暴走しない）、
3. 大きな乖離には複数componentの一致・高confidenceのHorseEvidenceという
   相応の根拠を要求すること、

の3点であり、**「最終値のレンジを狭める」ことではない**。この区別を今回の
再設計の中心原則とする。

---

## STEP3: 弱いCoursePriorによる暴走防止

CoursePriorは「弱い補助情報」であるため、**HorseEvidenceとは別に、それ自身の
最大影響幅を持たせる**設計にする。これはSTEP1のB（componentが与えられる補正幅の
制限）に相当し、STEP1のA（最終出力レンジの制限）とは別の仕組みである。

### 設計方針

- CoursePrior単独（HorseEvidenceが無い/薄い場合）がcomponentのraw%を動かせる幅は、
  `courseContextPrior.ts`の`gateCoefficient`（-1〜+1のunitless値）に、**小さい
  固定振幅**（例: 東京ダート1600m gateのように±10ポイント未満）を掛けた範囲に
  限定する。この振幅自体は今回は正式決定しない（STEP9で「次の決定事項」として
  記録）。
- HorseEvidence単独（本人実績が十分にある場合）は、CoursePriorより**大きな
  最大影響幅**を持ちうる（対象馬自身の直近raceScoreという直接的な証拠のため）。
  ただしこれもconfidence shrink（STEP1のC）を必ず経由する。
- **CoursePriorの`empiricalValidationStatus`が`"weakOrUnstable"`または
  `"notEvaluated"`の場合、影響幅をさらに縮小する（あるいはゼロにする）**。
  東京ダート1600mの実例（出典側`gateBiasLevel="high"`だが実測相関はほぼゼロ）が
  示す通り、出典の主張の強さと実測の裏付けは別物であり、裏付けの弱いCoursePriorを
  そのまま大きく反映させない設計は既存方針（`docs/gate-suitability-v1-decision.md`）
  と一貫している。

**重要な区別（CHECKPOINT11.2の指摘通り）**: 「最終Suitabilityの可動域を狭くする
こと」（STEP1のA、今回は不採用の方向）と、「弱い証拠（CoursePrior）の影響力を
小さくすること」（STEP3、今回提案するB）は別問題であり、後者だけを採用する。

---

## STEP4: component値の意味を決める

`100 = 中立`とするpercent表現を基本候補とする。distance/course/going/gateの
4componentすべてに共通のスケールを採用する（例: distance=95, course=102,
going=88, gate=100）。

### HorseEvidence/CoursePriorの有無によるshrink設計

| 状況 | 挙動 |
|---|---|
| HorseEvidenceが十分（confidence=medium以上） | HorseEvidence由来のraw%を主とし、confidence shrink（STEP1のC）を適用した`adjusted`を採用 |
| HorseEvidenceが薄い（confidence=low）＋CoursePriorあり | HorseEvidenceのconfidence shrinkで100寄りになった値に対し、CoursePriorがSTEP3の小さい最大影響幅の範囲内で補助的に微調整する（優先順位: HorseEvidence＞CoursePrior、既存の`gate-suitability-v1-decision.md`通り） |
| HorseEvidenceが無い（sampleCount=0）＋CoursePriorあり | CoursePriorのみでcomponentを算出するが、STEP3の小さい最大影響幅でしか動かさない。CoursePrior自身の`sourceConfidence`でもshrinkする（二重の慎重さ） |
| 両方とも無い | **component = 100（完全中立）、confidence="unknown"、`evaluated=false`。** これは既存の`buildNotEvaluatedComponent()`パターンと同じであり、「データが無い」ことを「平均的」と混同しないという既存原則（`docs/horse-evidence-v1.md`のunknownの扱い）をそのまま踏襲する |

---

## STEP5: confidenceによるshrink

CHECKPOINT11.2が提示した式
`adjusted = 100 + (raw - 100) × confidenceWeight`（例: raw=80, confidenceWeight=0.3
→ adjusted=94）は、**既に`suitabilityConfidence.ts`の`shrinkTowardCenter()`として
本番コードに実装済みの式そのもの**である。

```
SUITABILITY_CENTER = 100
CONFIDENCE_SHRINK_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 }
adjusted = 100 + (raw - 100) × CONFIDENCE_SHRINK_WEIGHTS[confidence]
```

### HorseEvidence Confidence思想との整合性

- **整合している点**: 「confidenceは証拠のデータ量を表すだけで、証拠の方向性
  （好走/凡走）を変えない」という原則は、`shrinkTowardCenter`が`raw`の符号・
  相対的な大小関係を変えずに大きさだけを縮小する設計と一致する
  （`docs/horse-evidence-v1.md`の「confidenceは予測値を変えない」原則、
  `CLAUDE.md`の絶対原則3と同一）。
- **未整合・要調整の点**: confidence自体の閾値テーブルが2系統で**食い違って
  いる**。
  - Suitability側（`baseConfidenceFromSampleCount`）: high=4走以上 /
    medium=2〜3走 / low=0〜1走（3段階、"unknown"無し）。
  - HorseEvidence側（`resolveHorseEvidenceConfidence`）: unknown=0走 /
    low=1〜2走 / medium=3〜4走 / high=5走以上（4段階）。

  将来HorseEvidenceのconfidenceをcomponent内へ接続する際、**どちらの閾値表を
  正式採用するかが未決定**である。今回は決定しない（STEP9・次の決定事項に記録）。

---

## STEP6: overallSuitability統合式候補

| 候補 | 内容 | 評価 |
|---|---|---|
| A. component単純平均（raw） | confidence shrink前のrawをそのまま平均 | 不採用。弱い証拠がそのまま最終値に反映され、STEP1のCを迂回してしまう |
| **B. confidence補正後単純平均（adjusted）** | 各componentの`adjusted`（shrink済み）を単純平均 | **現行`suitability.ts`が既に採用**。confidence shrinkは各component内で1回のみ適用され、二重加重が無い |
| C. confidence補正後重み付き平均 | Bに加え、統合段階でさらにconfidenceを重みとして使う | 不採用。`adjusted`は既にconfidenceで縮小済みのため、統合段階でも重みに使うと**confidenceを二重適用**することになる（CHECKPOINT11.1のSTEP7で「F. confidence連動平均」として既に同じ理由で不採用と結論済み） |
| D. 幾何平均 | `adjusted`の幾何平均 | 将来の校正候補として保持。乗算的な性質を持つため「弱点が響きやすい」が、最低値方式ほど極端ではない |
| E. その他（重要度に基づく重み付き平均） | distance/course等の重要度で重み付け | 重みの根拠となる校正データが現状無いため保留 |

**最低値方式（不得意要素1つで全体が決まる方式）は指示通り不採用。** 同じ情報の
二重評価（例: HorseEvidenceとCoursePriorを両方フルに合算する、runningStyleを
Suitabilityにも残しつつRaceContextにも残す等）も避ける（STEP3・
CHECKPOINT11.1のSTEP4で既に対処済み）。

**推奨: B（confidence補正後単純平均、現行実装のまま）。** Dは将来のバックテスト
校正候補として記録するが、今回は正式決定しない。

---

## STEP7: 最終Suitabilityの理論レンジ

| 候補 | 評価 |
|---|---|
| A. 0〜∞% | 不採用。`effectiveAbility = baseAbility × suitability / 100`が乗算式のため、上限が無いと極端な入力ミスがそのままeffectiveAbilityへ跳ね返る。下限0も、Suitability=0でeffectiveAbility=0（能力が完全に消える）となり、「能力9割」の思想（Suitabilityが能力そのものを消し去ってはならない）に反する |
| B. 0〜120% | 不採用。下限0の問題はAと同じ |
| C. 50〜120% | 候補。下限50%は「どれだけ条件が合わなくても、馬本来の力の半分は出る」という直感に近い |
| **D. 60〜120%** | **推奨**。下限60%はCよりやや保守的（極端な条件不一致でも能力の6割は残る、という前提） |
| E. その他 | 今回は具体的な代案なし |

**推奨: D（60〜120%）を、通常運用の制約ではなく"退化防止のための外側の安全境界"
として採用する。** 具体的には:

- STEP1で整理した通り、この境界は**滅多に発動しないことを意図する**。実際の
  値の散らばりは、STEP1のC（confidence shrink）とSTEP3（CoursePriorの小さい
  最大影響幅）によって自然に100近辺へ寄る設計であり、60〜120という広い帯域は
  「計算ミス・異常入力による暴走を止める最終防波堤」としてのみ機能する。
- 現行の`SUITABILITY_CLAMP_MIN=90`/`MAX=110`は、**この安全境界としては狭すぎ、
  かつ通常運用でも頻繁に発動してしまう**（STEP8のCASE Cで実証）。これを
  そのまま「最終Suitabilityの正式レンジ」として使い続けることは、
  CHECKPOINT11.2の懸念（「70%の適性」を表現できない）と一致するため、
  次回以降の実装では60〜120（またはそれに準ずる広いレンジ）へ置き換えることを
  推奨する。**今回はこの置き換え自体も実施しない**（設計提案のみ）。

---

## STEP8: 具体例で比較（参考計算のみ、本番コード接続なし）

`baseAbility = 80`。各CASEのcomponent raw値に対し、`shrinkTowardCenter`
（`adjusted = 100 + (raw - 100) × confidenceWeight`、weight: high=1.0/
medium=0.6/low=0.3）を適用し、**推奨統合式（STEP6のB: adjustedの単純平均）**で
`overallSuitability`を算出。`effectiveAbility = baseAbility × overallSuitability / 100`
も参考値として示す（クランプなし＝STEP7推奨のD案の下で、いずれの値も60〜120の
範囲内に収まるためクランプは発動しない）。

### CASE A: distance100 / course100 / going100 / gate100

全raw=100のため、confidenceに関わらず`adjusted`=100（`100+(100-100)×w=100`）。

| confidence | overallSuitability | effectiveAbility |
|---|---|---|
| high | 100.0 | 80.0 |
| medium | 100.0 | 80.0 |
| low | 100.0 | 80.0 |

### CASE B: distance90 / course95 / going100 / gate100

| confidence | adjusted (distance/course/going/gate) | overallSuitability | effectiveAbility |
|---|---|---|---|
| high (w=1.0) | 90 / 95 / 100 / 100 | 96.25 | 77.0 |
| medium (w=0.6) | 94 / 97 / 100 / 100 | 97.75 | 78.2 |
| low (w=0.3) | 97 / 98.5 / 100 / 100 | 98.9 | 79.1 |

### CASE C: distance70 / course90 / going80 / gate100

| confidence | adjusted (distance/course/going/gate) | overallSuitability | effectiveAbility |
|---|---|---|---|
| high (w=1.0) | 70 / 90 / 80 / 100 | **85.0** | **68.0** |
| medium (w=0.6) | 82 / 94 / 88 / 100 | 91.0 | 72.8 |
| low (w=0.3) | 91 / 97 / 94 / 100 | 95.5 | 76.4 |

**このCASE C・confidence=highが、STEP1で指摘した矛盾の実例である。**
現行の`clamp(90,110)`をそのまま適用すると、85.0 → **強制的に90.0へ引き上げ
られ**、effectiveAbilityは68.0ではなく72.0（80×90/100）になる。これは
「4要素のうち3要素が中程度〜大きく不利、しかもconfidence=high（証拠十分）」
という**正当なシグナルを、クランプが機械的に打ち消してしまう**具体例である。
STEP7推奨のD案（60〜120の安全境界）であれば85.0はそのまま採用され、
`effectiveAbility=68.0`が保たれる。

### CASE D: distance105 / course105 / going100 / gate102

| confidence | adjusted (distance/course/going/gate) | overallSuitability | effectiveAbility |
|---|---|---|---|
| high (w=1.0) | 105 / 105 / 100 / 102 | 103.0 | 82.4 |
| medium (w=0.6) | 103 / 103 / 100 / 101.2 | 101.8 | 81.4 |
| low (w=0.3) | 101.5 / 101.5 / 100 / 100.6 | 100.9 | 80.7 |

CASE A/B/Dはいずれも90〜110の範囲内に収まるため、現行clampの有無で結果は
変わらない。**問題が顕在化するのはCASE Cのような「複数componentが揃って
不利＋confidence=high」という、まさに実データで意味のあるはずの局面のみ**
である。

---

## STEP9: 今回決めたいこと（推奨案）

1. **componentのpercent定義**: `100=中立`の連続%（現行のdistance/going/course
   各componentの定義をそのまま踏襲、gateにも同じスケールを適用）。
2. **100の意味**: 「今回の条件で自分の通常能力をちょうど100%発揮する」中立点。
   HorseEvidence/CoursePriorとも無い場合は必ず100（`evaluated=false`）。
3. **confidence shrink方式**: 現行`shrinkTowardCenter`
   （`adjusted = 100 + (raw-100) × weight`、weight: high=1.0/medium=0.6/
   low=0.3）をそのまま正式採用。ただしHorseEvidence Confidence（4段階）と
   Suitability Confidence（3段階）の閾値統一は次回決定事項。
4. **CoursePrior最大影響の考え方**: HorseEvidenceより小さい固定振幅で
   componentのraw%を動かす上限を設ける（STEP3）。具体的な振幅値は今回未決定。
   `empiricalValidationStatus`が弱い場合はさらに縮小。
5. **HorseEvidence最大影響の考え方**: CoursePriorより大きな振幅を許容するが、
   必ずconfidence shrinkを経由する。HorseEvidence優先度1・CoursePrior優先度2の
   既存原則を維持。
6. **overallSuitability統合方式**: confidence補正後（adjusted）の単純平均
   （STEP6のB、現行実装のまま）。幾何平均は将来の校正候補。
7. **最終Suitabilityレンジ**: 60〜120%を「安全境界」として採用（STEP7のD）。
   通常運用の制約ではなく、異常値防止のための外側の防波堤として位置づける。
8. **clampをどこに使うか**: **STEP1のA（最終出力への強制clamp）としては
   使わない**。現行`SUITABILITY_CLAMP_MIN/MAX=90/110`は狭すぎ、通常運用でも
   正当なシグナルを打ち消しうる（STEP8のCASE C実証）。将来実装時は、
   (a) component単位のconfidence shrink（STEP1のC、維持）、
   (b) CoursePriorの小さい最大影響幅（STEP3、新規）、
   (c) 最終出力への広い安全境界60〜120（STEP7、現行90〜110から拡張）、
   の3層構造に置き換えることを推奨する。
9. **effectiveAbility式**: `effectiveAbility = baseAbility ×
   overallSuitabilityPercent / 100`（CHECKPOINT11.2提示の式、既存
   `suitability.ts`の`computeEffectiveAbility()`と同一）。今回も接続しない。

---

## 変更禁止・STOP条件の遵守

Base Ability V1・HorseEvidence V1・memberLevel V1・raceScore・`suitability.ts`・
`suitabilityCoreV1.ts`・`finalRaceAbility.ts`・`CourseContextPrior`・
`RaceContext`・`trackBias`はいずれも今回変更していない（Readと設計文書作成のみ）。
Suitability V1本実装・effectiveAbility接続変更・キーンランドC実戦投入・
他コース展開・Race Review Engine・大規模データ収集のいずれにも進んでいない。

---

## 完了報告（16項目）

1. **clamp(90,110)再評価**: 現行実装はA（最終出力への強制clamp）とC
   （component単位のconfidence shrink）を混同しており、Aは「70%の適性」概念と
   矛盾しうる（STEP1・STEP8のCASE Cで実証）。
2. **最終Suitabilityと補正幅の違い**: 前者は出力レンジそのものの制約
   （今回不採用の方向）、後者は個々の証拠源（CoursePrior等）が動かせる幅の制約
   （今回新規提案）。両者は別問題として扱う（STEP1・STEP3）。
3. **推奨component percent定義**: 100=中立の連続%、4component
   （distance/course/going/gate）共通スケール（STEP4）。
4. **confidence shrink推奨方式**: 現行`shrinkTowardCenter`をそのまま正式採用
   （STEP5）。ただしHorseEvidence/Suitability間のconfidence閾値統一は未決定。
5. **CoursePriorの影響制限方法**: HorseEvidenceより小さい固定振幅の上限＋
   `empiricalValidationStatus`が弱い場合の追加縮小（STEP3）。
6. **HorseEvidenceの影響方法**: CoursePriorより大きな振幅を許容しつつ、必ず
   confidence shrinkを経由。優先順位（HorseEvidence＞CoursePrior）は既存方針を
   維持（STEP3・STEP4）。
7. **overallSuitability統合式候補比較**: STEP6の表（A単純平均/B confidence補正後
   単純平均/C confidence補正後重み付き平均/D幾何平均/Eその他）参照。
8. **推奨統合式**: B（confidence補正後の単純平均、現行`suitability.ts`のまま）。
9. **推奨理論レンジ**: 60〜120%を「安全境界」として採用。通常運用の制約には
   しない（STEP7）。
10. **CASE A〜D比較**: STEP8参照。CASE C・confidence=highで現行clamp(90,110)が
    正当なシグナル（overallSuitability=85.0）を90.0へ歪める矛盾を実証した。
11. **effectiveAbility参考結果**: STEP8の表参照（本番コードには未接続）。
12. **「能力9割」との整合性**: 「能力9割」はSuitabilityの値域を狭めることでは
    なく、Base Ability評価を最優先し弱い証拠で安易に逆転させないことで担保される
    （STEP2）。CASE C・confidence=high（baseAbility80×overallSuitability85%
    =effectiveAbility68.0）でも、baseAbility50の馬がsuitability100%だとしても
    effectiveAbility=50であり、なお80の馬が優位——値域を広げても「能力9割」の
    実質は損なわれないことを確認した。
13. **Base Abilityへの影響0確認**: Ability Model V1ファイル群は今回一切変更
    していない（Readのみ）。
14. **baseAbility=70.3再現確認**: `abilityModelV1.regression.test.ts`で再確認、
    変化なし。
15. **test/lint/build/validate:data**: 下記参照。
16. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. CoursePrior最大影響幅の具体的な数値（STEP3で振幅値は未決定のまま）。
    2. HorseEvidence ConfidenceとSuitability Confidenceの閾値統一
       （4段階/3段階の食い違い、STEP5）。
    3. 60〜120%という安全境界の具体的な数値の妥当性検証（実データでの校正）。
    4. 現行`SUITABILITY_CLAMP_MIN/MAX=90/110`を実際にいつ・どう置き換えるか
       （CHECKPOINT11.1のSTEP2で決めた新統合層の実装タイミングと合わせて検討）。
    5. 幾何平均（統合式D）への将来移行要否の実データ比較。

## test/lint/build/validate:data

コード変更を行っていないため回帰確認のみ実施:

```
npm test              # 509/509成功、変化なし
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

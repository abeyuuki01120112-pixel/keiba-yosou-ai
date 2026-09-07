# Suitability V1 接続設計（CHECKPOINT11・設計のみ、実装なし）

**作成日: 2026-08-23。ステータス: 設計文書のみ。本番コード変更なし。**

Base Ability V1（凍結済み、`docs/ability-model-v1.md`）とHorseEvidence V1（凍結済み、
`docs/horse-evidence-v1.md`）を土台に、既存のSuitability/RaceContext/CoursePrior関連
コードを監査し、「Base Ability → HorseEvidence → Suitability → effectiveAbility」を
将来どう接続すべきかを設計する。**本ラウンドでは一切のコード変更・接続を行わない。**

前提思想（確認）:

> 能力を先に決め、その後、「今回の条件でその能力を何％出せるか」をSuitabilityとして
> 評価する。baseAbility 80 × suitability 70% = effectiveAbility 56 /
> baseAbility 50 × suitability 100% = effectiveAbility 50 でも、能力80の馬が上回る。
> Suitability・枠順・展開・馬場等がBase Abilityそのものを書き換えてはならない。

既存コードは全て `baseAbility × suitability% = effectiveAbility` という乗算モデルを
採用しており、Base Abilityを直接書き換える箇所はどこにも無いことを確認した
（STEP1〜STEP6で個別に示す）。

---

## STEP1: 現行Suitability関連コード監査

### 発見した最重要事項（監査全体の結論を先出し）

**Suitability〜effectiveAbilityの実装は「未着手」ではなく、既に2系統・部分的に
完成した実装が並存している。** ただしどちらも本番UI（`.tsx`）には一切接続されて
いない（`grep`で`finalRaceAbility|effectiveAbility|suitabilityBreakdown`を
`src/**/*.tsx`から検索した結果、ヒット0件）。参照元はテストファイルと
`ability/`内部の他モジュールのみ。

1. **系統A（第22〜24実装、`suitability.ts`系）**: distance/going/courseの3要素のみを
   対象にした、自己参照型（対象馬自身の直近5走 vs 自身の直近5走全体平均）の
   Suitability。`suitability.ts` → `finalRaceAbility.ts`（STEP5でpaceScenario/
   trackBiasを追加合成）まで**実際に動くコードとして完成しており、テストも存在する**
   （`suitability.test.ts`・`finalRaceAbility.test.ts`）。
2. **系統B（第25実装/CHECKPOINT9、`suitabilityCoreV1.ts`系）**: distance/course/
   surface/turn/going/gate/runningStyleの7要素すべてを型として持つが、
   **`score`は常にnull**（CHECKPOINT9の明示的な凍結ルール）。実際に値が入るのは
   `gate`要素のみ（東京ダート1600m限定、`courseContextPrior.ts`経由）。

この2系統は**互いに接続されておらず、要素の粒度も異なる**（Aは3要素、Bは7要素）。
CHECKPOINT11のSTEP2〜6では、この2系統をどう統合するかを設計の中心課題として扱う。

### ファイル別監査表

| ファイル | 分類 |
|---|---|
| `distanceSuitability.ts` | (1)実装済み (3)自己参照型 (4)実データ根拠あり |
| `goingSuitability.ts` | (1)実装済み (3)自己参照型 (4)実データ根拠あり |
| `courseSuitability.ts` | (1)実装済み (3)自己参照型 (4)実データ根拠あり |
| `suitability.ts`（統合＋effectiveAbility） | (1)実装済みだが未接続 (3)自己参照型3要素の単純平均 |
| `suitabilityConfidence.ts` | (1)実装済み・A系統全体の共通confidence/shrink基盤 |
| `suitabilityCoreV1.ts` / `suitabilityCoreV1Types.ts` | (2)仮実装（score常にnull） (5)gate要素のみCoursePriorで実値あり |
| `courseContextPrior.ts` | (1)実装済みだが東京ダート1600m限定 (5)CoursePriorのみ（非自己参照） (4)実データ検証済み（30レース・451頭、ただしweakOrUnstable） |
| `horseGateEvidence.ts` / `horseEvidenceConfidence.ts` | (1)実装済み (6)HorseEvidenceを使える（gate/frame特化のfact collector） |
| `gateValidationV1.ts` | (4)実データ根拠あり・検証専用（production使用禁止と明記） |
| `raceContextTypes.ts` / `raceContextFactor.ts` / `paceScenarioFactor.ts` / `trackBiasFactor.ts` / `trackBias.ts` / `raceContextLeakageGuard.ts` | (1)実装済み (7)RaceContext側（馬固有ではなく当日固有の情報） |
| `runningStyle.ts` / `passingPositionRunningStyle.ts` | (1)実装済み (3)自己参照型（脚質そのものの推定） |
| `finalRaceAbility.ts` | (1)実装済み・オーケストレーター（baseAbility→suitability→effectiveAbility→raceContext→finalRaceAbility）だが未接続 |

### 重要な補足知見

- **HorseEvidence V1（`rawPerformanceDelta = raceScore - abilityBeforeRace`、median集約）
  には、実は再利用可能な本番コードが存在しない。** `docs/horse-evidence-v1.md`は
  正式な仕様書だが、その計算ロジック自体はCHECKPOINT10.4〜10.15の各ラウンドで
  `zzz_*.test.ts`（読み取り専用スクラッチファイル）として実行され、報告後に**必ず
  削除されてきた**（セッション全体の既定運用）。したがって「HorseEvidence V1を
  Suitabilityへ接続する」ためには、まず`rawPerformanceDelta`/median集約/
  `evidenceDirection`/`consistency`を計算する**新規の本番モジュール**を書く必要が
  あり、これは今回のSTEP7で明示的に禁止されている「Suitability V1本実装」の範囲に
  含まれる。
- `horseGateEvidence.ts`の`HorseEvidence`型は、HorseEvidence V1と`sampleCount`の
  定義（racecourse×surface×distance完全一致）・confidence閾値（0=unknown/1-2=low/
  3-4=medium/5+=high）は完全に一致するが、**中身がraceScoreやdeltaを持たず、
  gate/frame位置の事実（`relativeGatePosition`・`finishPosition`）のみを保持する**、
  gate専用の別モジュールである。名前が同じ「HorseEvidence」でも指しているものが
  異なる点に注意（STEP3で詳述）。
- `suitabilityCoreV1.ts`の`buildTokyoDirt1600GateComponent()`内コメント
  「枠別の本人実績を集計する仕組みが現状無い」は**古くなっている**。
  `horseGateEvidence.ts`（CHECKPOINT10.4）がまさにその仕組みだが、まだ
  `suitabilityCoreV1.ts`側から呼ばれていない（接続待ちの状態）。

---

## STEP2: 7要素のA/B/C分類

`suitabilityCoreV1Types.ts`が定義する7キー（distance/course/surface/turn/going/
gate/runningStyle）を、「A. 自己参照型Suitability」「B. CoursePrior」
「C. RaceContext」に分類する。

| 要素 | 分類 | 根拠・現状 |
|---|---|---|
| distance | **A** | `distanceSuitability.ts`で実装済み。対象馬自身の距離帯別raceScoreを自身の平均と比較。 |
| course（競馬場） | **A** | `courseSuitability.ts`で実装済み。同様に自己参照。 |
| surface（芝/ダート） | **A（未実装）** | 現状は独立したcomponentではなく、distance/going/course各コンポーネント内の絞り込み条件（`r.surface === target.surface`）としてのみ存在。芝→ダート転向馬等の評価に単独componentが必要になった場合はAに追加する形が自然（自己参照で計算可能なため）。 |
| turn（右回り/左回り） | **未実装・分類保留** | 現状データに右左回りの区別を持つフィールドが無い（`RacePerformance`型に無い）。データが追加されればAとして自己参照的に計算可能。それまでは評価不能（`notEvaluated`のまま）とすべきで、Cへ逃がす理由も無い。 |
| going（馬場状態） | **A** | `goingSuitability.ts`で実装済み。 |
| gate（枠順） | **A + B 併存** | `horseGateEvidence.ts`（A・本人実績、未接続）と`courseContextPrior.ts`（B・構造事前分布、東京ダート1600m限定で実装済み）の両方が既にコードとして存在。優先順位は`docs/gate-suitability-v1-decision.md`で決定済み（HorseEvidence＞CoursePrior＞neutral）。 |
| runningStyle（脚質） | **実装はCだが、本来の役割はAに近い・要整理** | 詳細を下記に記す。 |

### runningStyleの分類における矛盾（今回発見した論点）

`suitabilityCoreV1Types.ts`は`runningStyle`を7要素の1つ（Suitability componentの
候補）として型定義している。しかし実際の実装（`runningStyle.ts`・
`paceScenarioFactor.ts`・`trackBiasFactor.ts`）を見ると：

- 脚質**そのものの推定**（nige/senko/sashi/oikomiの分布）は自己参照型（A的）で、
  対象馬自身の過去走（final3F相対値、または通過順位データ）から求める。
- しかしその脚質が**effectiveAbilityにどう影響するか**は、Suitability層
  （`suitability.ts`のoverallSuitability）を一切経由せず、**RaceContext層
  （`paceScenarioFactor`・`trackBiasFactor`）でのみ反映される**。すなわち
  「今回の想定ペース」「今回のトラックバイアス」という**今回のレース固有の条件**
  との相性としてのみ評価され、「馬自身の脚質的な得意不得意」という汎用的な
  Suitability percentは現状どこにも存在しない。

**したがってrunningStyleは「推定はA的、効果への反映はC」という二重構造になっており、
これは意図的な設計というより、STEP4/STEP5（系統A）とSTEP5.1/STEP5（系統C）が別々の
CHECKPOINTで作られたことによる構造的な重複・未整理である。** 今回はコード変更を
行わないため、この重複の解消（`suitabilityCoreV1Types.ts`の`runningStyle`キーを
廃止してCへ一本化するか、逆にRaceContext側のpaceScenario/trackBias係数とは別に
「得意脚質%」を新設してAにも持たせるか）は、次回以降の決定事項としてSTEP15に記載する。

---

## STEP3: HorseEvidence ↔ CoursePrior の境界

### 既に確立されている境界（変更不要）

`docs/gate-suitability-v1-decision.md`（CHECKPOINT10.3）で、gate要素について
以下が既に正式決定済み：

- 優先順位: **HorseEvidence（優先度1）＞ CoursePrior（優先度2）＞ unknown/neutral（優先度3）**
- `combineConfidence = min(horseEvidenceConfidence, coursePriorConfidence)`
- `suitabilityCoreV1Types.ts`の`SuitabilityComponentV1`は`horseEvidence`と
  `coursePrior`を**別フィールドとして分離保持**し、1つの数値へ混ぜて合成する式は
  V1では未確定のまま（`score`は常にnull）。

この設計は「同じ意味の情報を二重計上しない」というCHECKPOINT11の要求を既に
満たしている。具体例（東京ダート1600m外枠有利）で言えば：

- CoursePrior = 「東京ダート1600mは構造上、外枠ほど有利」という**馬に依存しない
  一般的傾向**（`courseContextPrior.ts`、ただし実データ検証ではweakOrUnstable）。
- HorseEvidence = 「その馬自身が過去、外枠でどう走ったか」という**個体の事実**
  （`horseGateEvidence.ts`）。

両者は算出方法・入力データが完全に独立しており、片方の値がもう片方の計算に
混入することはない（コード上、`courseContextPrior.ts`は`horseGateEvidence.ts`を
参照せず、逆も同様）。

### 今回新たに認識した境界上の課題（distance/going/courseにも同じ論点がある）

gate要素以外（distance/going/course）については、CoursePrior側の実装が
**存在しない**。現状の`distanceSuitability.ts`・`goingSuitability.ts`・
`courseSuitability.ts`はすべて自己参照型（HorseEvidence的な位置づけ）のみで、
「そのコース・距離が一般的にどういう傾向を持つか」という構造的事前分布
（CoursePrior）は未実装である。

これは実害があるわけではない（現状は二重計上しようがない＝CoursePrior側が
存在しないため）が、**将来CoursePriorをdistance/going/courseにも拡張する場合は、
gate要素と同じ「HorseEvidence優先・CoursePriorは補完」という優先順位を踏襲すべき**
であり、既存の自己参照型component（系統A）をCoursePrior的な値で上書き・平均する
設計は避けるべきである（本人実績の方が情報量として直接的であるため）。

---

## STEP4: 枠順補正の正しい配置

`courseContextPrior.ts`が既に実例として示している設計方針をそのまま今後の
指針とする：

1. **一律の「内枠+○%/外枠-○%」という固定ルールは採用しない**（CHECKPOINT7〜8で
   既に明示的に否定済み。`docs/gate-suitability-v1-decision.md`でも再確認）。
2. コースごとに**実測データによる検証（`empiricalValidationStatus`）を必須とし、
   検証結果が出典の主張（`gateBiasLevel`）を裏付けない場合は数値補正の根拠として
   使わない**。東京ダート1600mの実例（gateBiasLevel="high"という出典側の記述に反し、
   実測相関はほぼゼロ）がまさにこのパターンであり、`empiricalValidationStatus=
   "weakOrUnstable"`のまま強い補正をかけない、という既存の判断はSTEP4の要求
   （中山芝2500mは中程度、統計的にフラットなコースは補正ゼロ、という段階的扱い）
   と整合する。
3. **コース×パラメータ単位で個別に実測検証を行い、検証が済んでいないコースは
   `notEvaluated`（＝補正なし＝neutral）とする**。東京ダート1600m以外のコースに
   ついては、現状すべて`notEvaluated`相当（`courseContextPrior.ts`が
   `TOKYO_DIRT_1600`のみを対象としているため、他コースのgate入力は評価不能として
   扱われる。これは意図した挙動であり、今回もそのまま維持する）。
4. 中山芝2500mのような「中程度の影響」を表現する場合も、東京ダート1600mと同じ
   `EmpiricalValidationStatus`の枠組み（"supported" / "weakOrUnstable" /
   "notEvaluated"）で表現でき、"supported"かつ相関の絶対値が大きいコースほど
   `gateCoefficient`の実効範囲（-1〜+1のunitless値をどれだけpercentへ反映するか）
   を広げる、という段階的設計が可能である。ただし具体的な変換式・係数は
   今回設計しない（STEP7のSuitability V1本実装で扱う）。

---

## STEP5: overallSuitabilityPercent統合式の候補比較（実装しない）

現行の系統A（`suitability.ts`）は「単純平均」を採用済みだが、CHECKPOINT11の
要求に従い4方式を比較する。

| 候補 | 長所 | 短所 |
|---|---|---|
| **単純平均**（現行`suitability.ts`が採用） | 実装済み・説明が容易・各componentのconfidence縮小（Design-2）が既に個別適用済みなので二重加重にならない | 要素間の重要度差（例: distanceの方がgoingより効きやすい等）を一切表現できない。全要素を機械的に等分するため、要素数が増えるほど1要素あたりの影響が薄まる |
| **重み付き平均** | 経験的に重要な要素（distance/course等）へ重みを配分できる | 重みの根拠になる校正データが現状無く、恣意的な数値を導入すると`CLAUDE.md`の「係数の無断調整禁止」原則に抵触するリスクがある。将来バックテストでの校正が前提になる |
| **乗算型**（各component/100の積） | 「弱点条件が1つでもあれば全体を強く下げる」という直感に合う | component数が増えるほど100%からの乖離が指数的に効きすぎる。7要素すべてを乗算すると、個々のcomponentのわずかなブレでoverallが過度に変動するリスクがある |
| **最低値制約型**（min(components)を採用、またはfloorとして使う） | 「最も苦手な条件がボトルネックになる」という直感を反映できる | 他の得意条件の情報を完全に無視する。1要素だけconfidence=lowでノイズが大きい場合、それがそのままoverallを決定してしまう |

**現時点での作業メモ（決定ではない）**: 単純平均は実装済みで安全側（confidence
縮小により極端な値が出にくい）だが、7要素すべてが有効になった場合に
「1つの致命的な弱点」を過小評価するリスクがある。乗算型または最低値制約型は
その逆を担保できるが、校正なしでは過剰反応のリスクがある。**どの案を採るかは
今回決定しない**（STEP7の明示的な禁止事項）。

---

## STEP6: effectiveAbilityへの接続方法（接続はしない）

既存コードが既に示す通り、接続方法自体はシンプルで一意に決まる：

```
effectiveAbility = baseAbility × overallSuitabilityPercent / 100
```

これは`suitability.ts`の`computeEffectiveAbility()`が既に実装済みであり
（`finalRaceAbility.ts`ではさらに`raceContextFactor`を掛けて`finalRaceAbility`まで
算出する）、CHECKPOINT11のSTEP6が求める式とビット単位で一致する。

**ただし、`docs/horse-evidence-v1.md`が指摘する通り、HorseEvidence V1の
`aggregatedDelta`をこの式にどう組み込むか（`overallSuitabilityPercent`の一構成要素
として加算的/乗算的に変換するか）はまだ未確定である。** 現行の系統Aは
`raceScore`の相対比較（自己参照）で直接percentを作っているため、HorseEvidence V1の
`aggregatedDelta`（raceScore点差、単位はraceScoreと同じ）をそのまま使うのか、
それとも現行の`distanceSuitability.ts`等を`abilityBeforeRace`基準に置き換えて
HorseEvidence V1と統一するのかも、STEP5の統合式選定と合わせて次回以降の決定事項
とする。

**CHECKPOINT11の指示通り、今回はいかなる接続も行っていない。**
`suitability.ts`・`finalRaceAbility.ts`・`suitabilityCoreV1.ts`はいずれも
今回変更していない。

---

## STEP7: STOP条件の遵守

以下はいずれも実施していない（設計文書の作成のみ）:

- Suitability V1本実装（`score`への実数値変換、HorseEvidence V1の
  rawPerformanceDelta計算モジュールの新規実装を含む）
- effectiveAbility本接続（`suitabilityCoreV1.ts`と`suitability.ts`の統合、
  UI/`.tsx`への接続を含む）
- キーンランドC実戦投入
- 他コースへのCourseContextPrior大量追加
- Race Review Engine
- 大規模データ収集
- Base Ability V1・HorseEvidence V1の変更

---

## 完了報告（15項目）

1. **Suitability関連既存実装一覧**: STEP1の表を参照。系統A
   （distance/going/course、自己参照型、実装済み・未接続）と系統B
   （7要素schema、score常にnull、gateのみ実値あり）の2系統が並存。
2. **各要素の責務**: distance/going/course=自己参照型Suitability（本人実績と
   自分の平均の比較）。gate=HorseEvidence（本人実績）＋CoursePrior（構造事前分布）
   の併存、優先順位決定済み。surface/turn=未実装。runningStyle=推定はA的だが
   効果反映はC（RaceContext）という二重構造（STEP2で詳述、要整理）。
3. **HorseEvidenceとの境界**: gateについては`docs/gate-suitability-v1-decision.md`
   で優先順位・confidence合成式まで決定済みで、二重計上の余地は無い。
   distance/going/courseにはCoursePrior相当の実装が無いため境界問題自体が
   まだ発生していない。また「HorseEvidence V1」（rawPerformanceDelta/median）の
   計算ロジック自体が本番コードとして存在しない点も判明（STEP1参照）。
4. **CoursePriorとの境界**: gateのみ実装（東京ダート1600m限定、実データ検証で
   weakOrUnstable）。他要素は未実装のため境界設計はまだ不要。
5. **RaceContextとの境界**: paceScenarioFactor/trackBiasFactorは「馬固有の脚質×
   今回のレース固有条件」という掛け算構造で、Suitability（馬固有の条件適性）とは
   独立した乗数として`raceContextFactor`に集約済み。future leakageガード
   （`raceContextLeakageGuard.ts`）も既存。
6. **枠順補正の正しい配置**: コース×パラメータ単位の実測検証必須、検証結果が
   出典の主張を裏付けない場合は数値補正を使わない、という既存方針
   （`empiricalValidationStatus`）をそのまま今後の指針とする。一律%補正は不採用。
7. **7要素のうちV1に残すべきもの**: distance/going/course（実装済み・実データ
   根拠あり）、gate（HorseEvidence＋CoursePrior併存、優先順位決定済み）。
8. **V1から外すべきもの**: surface（現状componentとして未独立、必要になれば
   容易に追加可能）、turn（データ自体が無い）。runningStyleはA/Cどちらに
   統一するか要決定のため、現状のまま次回に持ち越し。
9. **overallSuitabilityPercent統合式の候補**: 単純平均（現行採用）／重み付き平均／
   乗算型／最低値制約型の4案。STEP5参照。
10. **各候補の長所・短所**: STEP5の表を参照。単純平均は実装済み・安全だが要素間
    重要度を無視。重み付き平均は校正データ待ち。乗算型・最低値制約型は「弱点が
    響く」直感に合うが過剰反応リスクがある。
11. **effectiveAbilityへの接続方法**: `effectiveAbility = baseAbility ×
    overallSuitabilityPercent / 100`。既存の`suitability.ts`
    `computeEffectiveAbility()`がビット単位で同じ式を実装済み（未接続のまま）。
    HorseEvidence V1の`aggregatedDelta`をこの式へどう組み込むかは未確定。
12. **future leakageリスク**: 監査した全モジュール（`suitability.ts`系、
    `raceContextTypes.ts`系）は直近5走ベース（baseAbilityと同じ母集団）または
    明示的なleakageガード（`raceContextLeakageGuard.ts`）を持ち、新たなリスクは
    発見しなかった。ただしHorseEvidence V1のrawPerformanceDelta計算ロジックを
    本番コード化する際は、`abilityBeforeRace`の既存leakage防止規律
    （日付昇順処理）をそのまま継承する必要がある（新規実装時の注意点として記録）。
13. **Base Abilityへの影響が完全0であることの確認**: `raceScore.ts`・
    `baseAbility.ts`・`memberLevel.ts`・`abilityBeforeRace.ts`等のAbility Model V1
    ファイルは今回一切変更していない（Readのみ）。`suitability.ts`・
    `suitabilityCoreV1.ts`・`finalRaceAbility.ts`等も含め、コード変更は0件。
14. **test/lint/build/validate:data**: 下記参照。
15. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. **系統A（distance/going/course自己参照型percent）と系統B
       （7要素schema、score常にnull）をどちらの設計に統一するか。** 現状2つの
       並行実装があり、どちらを正式採用するか未決定。
    2. **runningStyleをSuitability（A）とRaceContext（C）のどちらに一本化するか**
       （STEP2で発見した二重構造）。
    3. **HorseEvidence V1（rawPerformanceDelta/median集約）を計算する本番モジュールを
       新規実装するか、それとも既存の系統Aの自己参照型ロジック
       （raceScore vs 自分の直近5走平均）で代用するか。** 両者は基準
       （abilityBeforeRace vs 直近5走平均）が異なるため、混在させると二重計上に
       なりうる。
    4. **overallSuitabilityPercentの統合式**（STEP5の4候補からの選定、または
       校正が必要な重み付き平均を採用するかの判断）。
    5. **gate以外（distance/going/course/surface/turn）へのCoursePrior拡張要否**
       （現状はgateのみ実装、他要素はHorseEvidence一本）。
    6. **surface・turn要素の実装要否とデータ収集要否**（現状データフィールド自体が
       無い）。

## test/lint/build/validate:data

コード変更を行っていないため回帰確認のみ実施:

```
npm test              # 全件成功（既存件数のまま、変化なし）
npm run lint           # 既存の警告のみ、新規エラーなし
npm run build           # 型チェック+ビルド成功
npm run validate:data    # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

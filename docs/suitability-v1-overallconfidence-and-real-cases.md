# Suitability V1 overallConfidence意味整理 ＋ course/gate 実データケース探索（CHECKPOINT11.16）

CHECKPOINT11.15のB判定を受け、(1) `overallConfidence`の意味を「評価済みcomponentの信頼度」と
「4component全体の充足度」のどちらとして定義すべきか整理し、(2) CHECKPOINT11.15で実証できな
かったcourse/gate componentを実際にevaluated=trueにする実データケースを機械探索した。
Suitability V1式・effectiveAbility式・RaceContext・trackBias・全頭展開には進んでいない。
本ラウンドは監査・探索のみで、本番コードは無変更（設計変更は推奨案として提示するのみ）。

探索は`buildRaceHistory()`（既存の凍結パイプライン）と`computeSuitabilityV1()`（CHECKPOINT11.14で
本番接続済み、無変更）を直接呼び出す一時スクリプト（`zzz_courseGateRealDataScan.test.ts`・
`zzz_fourComponentCase.test.ts`、確認後削除）で行い、`data/horses/*.json`全37頭
（`loadAllHorseAbilityProfiles()`が使う16頭ロースターに限定せず、CHECKPOINT11.7と同じ技法で
全データを対象にした）×各馬の実過去走全件をcandidate targetとして機械的に走査した
（候補を選ばず、条件一致のみで抽出）。

---

## 1. overallConfidence現在仕様

`suitabilityV1.ts`の`computeOverallConfidence()`は、distance/course/going/gateの**4component全て**
（evaluatedの真偽を問わない）の`confidence`フィールドを対象に、`unknown=0/low=1/medium=2/high=3`の
ランクでweakest-linkを取る（`raceOutcomeEvaluation.ts`の`resolveEvaluationConfidence`と同じ
パターンの再利用、CHECKPOINT11.14で追加、今回変更なし）。

```typescript
function computeOverallConfidence(components: SuitabilityComponentResultV1[]): SuitabilityConfidenceV1 {
  return components.reduce<SuitabilityConfidenceV1>(
    (weakest, c) => (CONFIDENCE_V1_RANK[c.confidence] < CONFIDENCE_V1_RANK[weakest] ? c.confidence : weakest),
    "high",
  );
}
// 呼び出し側: computeOverallConfidence([distance, course, going, gate])
```

---

## 2. evaluated=falseがweakest-linkへ入るか

**入る。** `wrapSystemAComponent()`（distance/course/going）は`evaluated=false`のとき常に
`confidence = resolveHorseEvidenceConfidence(0) = "unknown"`を設定する。gate側
（`computeGateSuitabilityV1()`）も、HorseEvidence・CoursePriorのいずれも無い場合は常に
`confidence: "unknown"`を返す。したがって`evaluated=false`のcomponentは必ず`confidence="unknown"`
という形で`computeOverallConfidence`の入力配列にそのまま含まれ、ランク0（最弱）として
weakest-link判定を支配する。CHECKPOINT11.15の実例（シェイクユアハート×宝塚記念、
distance=medium・going=medium・course=unknown・gate=unknown → overallConfidence="unknown"）は
まさにこの挙動の実測結果である。

---

## 3. 案A/案B比較

シェイクユアハートの実例（distance=medium、going=medium、course=evaluated=false、
gate=evaluated=false、evaluatedComponentCount=2）を題材に比較する。

| 比較軸 | 案A（現行）: overallConfidence=unknown | 案B: overallConfidence=medium（evaluated=trueのみでweakest-link） |
|---|---|---|
| **意味の明確さ** | 「未評価component」と「評価済みcomponentの信頼度」を1つの値に混在させる。unknownを見ても「全く評価していない」のか「一部だけ評価していて残りは低信頼」なのか区別できない | overallConfidenceは常に「評価できた範囲の信頼度」だけを表す、意味が単一で明確。ただし`evaluatedComponentCount`と必ずセットで読まないと「一部しか評価していない」ことを見落とすリスクがある |
| **UIでの説明可能性** | `overallSuitabilityPercent=99.8%`という具体的な数値の隣に`confidence=unknown`が並ぶと、「数値があるのになぜunknownなのか」という一見矛盾した表示になり得る | `confidence=medium`＋`evaluatedComponentCount=2/4`のペア表示は、「2つのcomponentを中程度の根拠で評価した」という自然な説明になる |
| **過信防止** | 安全側に強い：1つでも未評価componentがあれば必ずunknownへ落ちるため、実際より高く見せることは無い | `evaluatedComponentCount`を見ずに`overallConfidence`だけを見た場合、2/4のみの評価であることを見落とし、必要以上に信頼してしまうリスクがある（＝`evaluatedComponentCount`との必須ペア表示が前提になる） |
| **unknownの意味** | HorseEvidence V1（`resolveHorseEvidenceConfidence`）の"unknown"は本来「その1項目の証拠が0件」という**component単位**の定義。それをaggregateレベルの「4つのうち1つでも0件がある」という別の意味へ横流用しており、HorseEvidence V1が定義した本来の意味とは異なる使われ方になっている | component単位の"unknown"の意味（証拠0件）をaggregateレベルへ持ち込まず、"evaluatedComponentCount=0の場合のみoverallConfidence=unknown"という素直な対応になる（HorseEvidence V1の定義と整合） |
| **将来の全頭比較での使いやすさ** | 実データ探索の結果（第6〜9節）、4component全部が揃うケースは稀（多くの馬は3/4どまり）であるため、案Aのままでは大多数の馬のoverallConfidenceが"unknown"に収束し、馬同士の比較指標として機能しにくい | 評価できた範囲でconfidenceの高低差が数値として現れるため、複数馬を並べたときの相対比較に使いやすい |

---

## 4. 推奨overallConfidence仕様

**「未評価」と「低confidence」を混同しない」という本ラウンドの最優先原則に照らすと、実は
案Aにも案Bにも単独では同じ問題が残る**——案Aは「未評価」と「低confidence」の両方を
"unknown"という同一値に押し込めてしまう点で、区別すべき2つの状態を1つの値に混同している。
案Bは"evaluatedComponentCount"という別フィールドの参照を前提にしないと「未評価component」の
存在を見落とすリスクがある。

そのため、単純に案A→案Bへ切り替えるのではなく、以下を推奨する（**設計提案のみ。今回は
実装しない**）。

1. `overallConfidence`の定義を**案B（evaluatedComponentCount>=1の場合、evaluated=trueの
   componentのみでweakest-linkを取る。evaluatedComponentCount=0の場合のみoverallConfidence=
   "unknown"）へ変更する**。これは「confidenceは証拠の量を表し、評価の質を表さない」という
   HorseEvidence V1の既存原則（CHECKPOINT11.11 STEP4）を、aggregateレベルでも一貫させる
   ことになる。
2. `evaluatedComponentCount`（既存フィールド、変更不要）を**completeness（充足度）を表す
   唯一の情報源として引き続き使用し、overallConfidenceとは独立した別概念として位置づける**
   （第5節参照）。
3. 将来UI等で表示する場合は、`overallConfidence`単独では表示せず、必ず
   `evaluatedComponentCount`（または「4component中n個を評価」という文言）とペアで表示する
   ことを設計原則として明記する（例: 「confidence: medium（2/4 componentを評価）」）。

これはconfidence（B）とcompleteness（A）を明確に分離する提案であり、STEP3の
「未評価と低confidenceを混同しない」という要求を、単一フィールドの二択ではなく
「2つの独立した情報を両方とも欠落させずに提示する」という形で満たす。

---

## 5. completenessを別管理すべきか

**すべき、かつ現状すでにそうなっている。** `evaluatedComponentCount`（CHECKPOINT11.3から
既存）が完成度（0〜4）を表す独立フィールドとしてすでに存在しており、変更は不要。今回の
論点は「`overallConfidence`にcompletenessの意味を混ぜてよいか」であり、第4節の推奨案は
「混ぜない（confidenceは証拠の質のみ、completenessは既存のevaluatedComponentCountに任せる）」
という結論である。

---

## 6. course実データ候補（機械抽出）

37頭×各馬の実過去走183件をtargetとして機械走査した結果、course component（対象条件と同じ
racecourseでの実績）がevaluated=trueになった候補は多数存在した。代表例（horseNameが
判明しているもののみ抜粋。全候補は探索スクリプトのログに記録、コミットには含まれない）:

| horseName | horseId | targetRaceId | racecourse/surface/distance | sampleCount | confidence | raw% | adjusted% |
|---|---|---|---|---|---|---|---|
| ミステリーウェイ | 2018104638 | JRA-20260328-NAKAYAMA-11 | 中山/turf/2500 | 1 | low | 105.1 | 101.5 |
| ジューンテイク | 2021100913 | JRA-20260614-HANSHIN-11 | 阪神/turf/2200 | 1 | low | 91.8 | 97.5 |
| タガノデュード | 2021106548 | JRA-20251214-HANSHIN-9 | 阪神/turf/2200 | 1 | low | 101.8 | 100.5 |
| ミクニインスパイア | 2022106120 | JRA-20260328-NAKAYAMA-11 | 中山/turf/2500 | 2 | low | 103.4 | 101.0 |
| （horseName不明） | 2020103025 | JRA-20260215-KYOTO-11 | 京都/turf/2200 | 3 | medium | 104.8 | 102.9 |

horseId 2020103025のケースはsampleCount=3でconfidence="medium"に達しており、course component
単体で見ても実データに基づく非中立な補正（+2.9pt）が観測された。シェイクユアハート自身も、
対象を宝塚記念（阪神）以外——金鯱賞（中京）や中日新聞杯（中京）——にすればcourse component
がevaluated=trueになる（第9節参照）。

---

## 7. gate実データ候補（機械抽出）

**HorseEvidence由来**: 27件のevaluated=trueケースを検出（horseName判明分を抜粋）。

| horseName | horseId | targetRaceId | racecourse/surface/distance | HorseEvidence sampleCount | raw% | adjusted% | confidence |
|---|---|---|---|---|---|---|---|
| ジューンテイク | 2021100913 | JRA-20260614-HANSHIN-11 | 阪神/turf/2200 | 1 | 100.4 | 100.1 | low |
| メイショウタバル | 2021103272 | JRA-20250615-HANSHIN-11 | 阪神/turf/2200 | 1 | 105.0 | 101.5 | low |
| レガレイラ | 2021105898 | JRA-20260614-HANSHIN-11 | 阪神/turf/2200 | 1 | 97.3 | 99.2 | low |
| タガノデュード | 2021106548 | JRA-20251214-HANSHIN-9 | 阪神/turf/2200 | 1 | 101.8 | 100.5 | low |
| ミクニインスパイア | 2022106120 | JRA-20260328-NAKAYAMA-11 | 中山/turf/2500 | 2 | 103.4 | 101.0 | low |
| （シェイクユアハート） | shakeyourheart | JRA-20260315-CHUKYO-11 | 中京/turf/2000 | 1 | 104.3 | 101.3 | low |
| （シェイクユアハート） | shakeyourheart | JRA-20251213-CHUKYO-11 | 中京/turf/2000 | 1 | 104.4 | 101.3 | low |

**CoursePrior由来**: **0件（構造的に検出不可能）。** 理由は2点、いずれも機械確認済み。

1. 全`data/horses/*.json`（37ファイル）を走査したが、`racecourse=東京 かつ surface=dirt`の
   実レースが**1件も存在しない**（distance問わず）。CoursePriorが適用可能な唯一の対象条件
   （東京ダート1600m）自体が、今回のtarget候補（各馬自身の実過去走）の中に一度も現れない。
2. CHECKPOINT11.15で確認済みの通り、`data/horses/*.json`全体に`gate`/`horseNumber`/`fieldSize`
   （実際の枠番情報）を保持するファイルは0件。CoursePriorの発動には`RaceGateInput.frame`が
   実測値として必要だが、これを実データから得る手段が現状の`data/horses/`には存在しない。

したがって、CoursePrior経路のgate evaluated=trueは「探索して見つからなかった」というより、
現在のrepo構造では**そもそも検証しようがない**（東京ダート1600mを対象条件とする実馬も、
実gate/frame値そのものも、repo内に存在しない）というのが正確な結論である。

---

## 8. 3component以上評価可能な候補

37頭×183 targetのうち、**3component以上がevaluated=trueになったのは合計約60ケース**
（distance+course+goingの3component評価が大半、distance+course+going+gateの4component評価も
複数馬で確認）。シェイクユアハート自身も対象を金鯱賞・中日新聞杯（いずれも中京、
過去に2回訪問済み）にすれば3〜4component評価に達する（第9節参照）。

---

## 9. 4component評価可能な候補

**存在する。優先ケースとしてシェイクユアハート自身の実データで確認できた。**

`shakeyourheart` / target=`JRA-20260315-CHUKYO-11`（金鯱賞、中京/turf/2000/良）:

```json
{
  "distance":  { "evaluated": true, "rawPercent": 101.4, "adjustedPercent": 100.8, "confidence": "medium", "source": "horseEvidence", "sampleCount": 4 },
  "course":    { "evaluated": true, "rawPercent": 109.5, "adjustedPercent": 102.9, "confidence": "low",    "source": "horseEvidence", "sampleCount": 1 },
  "going":     { "evaluated": true, "rawPercent": 102.5, "adjustedPercent": 101.5, "confidence": "medium", "source": "horseEvidence", "sampleCount": 4 },
  "gate":      { "evaluated": true, "rawPercent": 104.3, "adjustedPercent": 101.3, "confidence": "low",    "source": "horseEvidence", "sampleCount": 1 },
  "overallSuitabilityPercent": 101.6,
  "evaluatedComponentCount": 4,
  "overallConfidence": "low"
}
```

CHECKPOINT11.15で使った「宝塚記念（阪神）」ではなく「金鯱賞（中京）」を対象条件にすると、
シェイクユアハートの他4走中2走が同じ中京（うち1走が中京×turf×2000完全一致で、course・gateの
HorseEvidenceを構成する）に該当するため、4componentすべてが実データで評価可能になった。
これは「宝塚記念1件だけを見ると評価不能に見えたcourse/gateが、対象条件を変えれば実際には
評価可能である」ことを示す重要な確認であり、Suitability V1の設計・実装そのものに欠陥は無く、
**CHECKPOINT11.15の限定的な結果は「シェイクユアハート×宝塚記念という特定の1組み合わせにおける
データ不足」であって、「Suitability V1が構造的にcourse/gateを評価できない」という意味ではなかった**
ことが今回の探索で確認された。

overallConfidence（現行仕様）はここでも"low"（distance=medium/course=low/going=medium/gate=low
のweakest-link）となり、第4節で推奨した案B（evaluated=trueのみでweakest-link）を適用しても
同じく"low"になる（今回のケースでは案A・案B双方で結果が一致する。両者の差が表れるのは
シェイクユアハート×宝塚記念のような「一部componentのみevaluated=false」のケースである）。

---

## 10. データ不足か仕様問題か

**データ不足であり、仕様上の欠陥ではない。**

- distance/course/going/gateすべてについて、「同じcondition（特にracecourse、gateはracecourse×
  surface×distance完全一致）へ複数回訪問した実過去走がある馬」であれば普通にevaluated=trueに
  なることを、37頭183ケースの機械走査で確認した（第6〜9節）。
- evaluated=falseが発生するのは、その馬がその特定条件（course単体ならracecourse、gateなら
  racecourse×surface×distance完全一致）を対象条件より前に一度も経験していない場合であり、
  これは「Suitability V1のロジックが正しく機能した結果」（推測せず正直にunknownを返した）
  である。
- CoursePrior経路のみ、東京ダート1600mという対象条件自体・gate/frameという実データ項目自体が
  repo内に存在しないため、**「仕様が厳しすぎる」のではなく「該当する実データがそもそも
  収集されていない」**という真のデータ不足に該当する（第7節）。CoursePriorのロジック自体
  （`computeGateCoursePriorDetail`）は変更していない。

---

## 11. RaceContext=99.3%適用理由

CHECKPOINT11.15のシェイクユアハート×宝塚記念で`raceContext.value=99.3%`
（`effectiveAbility=70.2 → finalRaceAbility=69.7`）となった経路を実コードから再確認した。

**判定: 「既存仕様として正しく適用された」。「未評価情報なのに適用された」わけではない。**

理由: Suitability V1のcomponentには「evaluated」という明示的な未評価フラグがあり、
証拠が無ければアグリゲート対象から除外する設計になっている。一方、RaceContext層
（`paceScenarioFactor`/`trackBiasFactor`）にはそのような「evaluated」フラグは存在せず、
**常に何らかの値を計算して返す**設計になっている（既存STEP5仕様、今回変更していない）。

- `predictedPace`は`fieldRunningStyleDistributions=[]`（対戦馬データ無し）という実際の入力を
  受け取り、既存の決定的ルール（「逃げ候補・先行候補ともに0頭ならスローペース想定」）に
  従って`level="slow"`という値を返した。これは「未評価」ではなく、「与えられた実データ
  （0頭という事実）に基づき、既定のルールが一意に決定した結果」である。
- `paceScenarioFactor`はシェイクユアハート自身の実データ（final3F相対値ベースのfallback
  runningStyle）を使って計算されており、confidence="low"がその根拠の薄さを正しく反映している。
- `trackBiasFactor`はmanual/auto双方の観測情報が無いため、既存仕様通り中立100%
  （`usedSource="neutral"`）にフォールバックした。これも「未評価データを勝手に補正へ
  使った」のではなく、「情報が無い場合は中立値を返す」という既存の明示的なフォールバック
  ルールが正しく発動した結果である。

したがって、RaceContextはSuitability V1とは異なる設計思想（「evaluated/unevaluatedで
分岐する」のではなく「常に値を返しつつconfidenceで信頼度を示す」）を持つ既存レイヤーであり、
今回のケースではその設計通りに正しく動作した。**この設計思想の違い自体
（Suitability V1は"評価しない"という選択肢を持つが、RaceContextは持たない）は、
両レイヤー間の一貫性という観点で今後検討の余地がある論点として第15節に記載するが、
今回はRaceContextの数式・実装を変更していない。**

---

## 12. baseAbility=70.3再現

`abilityModelV1.regression.test.ts`を単独実行し、3テストすべてパス。シェイクユアハートの
baseAbility=**70.3**を完全再現した（探索スクリプトの実行内容には`baseAbility.ts`等の
Base Ability V1計算経路への変更は一切含まれない）。

---

## 13. test/lint/build/validate:data

- `npm test` — 527/527 pass（54 test files。本ラウンドはコード変更が無いため件数は
  CHECKPOINT11.15完了時点と同一）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 14. A/B/C判定

**B（構造は正しいが追加検証必要）。**

overallConfidenceの意味整理については明確な推奨案（第4節）を提示できたが、これは**設計提案
のみで未実装**のため、実装後の再検証が必要という意味でBとする。course/gate実データ探索は
「データ不足ではなく設計問題」という懸念を払拭し（第10節）、4component評価可能な実ケースを
シェイクユアハート自身のデータで確認できた（第9節）という点は前進だが、CoursePrior経路は
依然としてrepo内に検証可能な実データが皆無（第7節）という制約が残っている。またRaceContext層
とSuitability V1層で「未評価」の扱いに設計思想の差があること（第11節・第15節）も、
今回は監査のみで解消していない未決着の論点である。これらの理由から、Suitability V1の
実馬計算は引き続き「構造は正しいが、次回以降の実装・検証を経てA判定に至る」段階にあると判断する。

---

## 15. technical debt

- `overallConfidence`の意味整理（第4節の推奨案=案B＋evaluatedComponentCountとの必須ペア表示）は
  未実装。実装する場合は`suitabilityV1.ts`の`computeOverallConfidence()`変更が必要
  （Suitability V1計算式の変更に該当するため、次回以降の明示的な承認が必要）。
- CoursePrior経路のgate evaluated=trueは、東京ダート1600mの実レースデータ・実gate/frame
  データのいずれもrepo内に存在しないため、実データでの検証が構造的に不可能なまま
  （CHECKPOINT11.15から継続する既知の制約）。
- RaceContext層（evaluated概念を持たず常に値を返す）とSuitability V1層（evaluated/unevaluatedで
  明示的に分岐する）の間で、「未評価」の扱いに関する設計思想の一貫性が取れていない
  （第11節）。統一するかどうかは今回検討していない。
- CHECKPOINT11.15で報告した「reason文言がconfidence再判定後の値と食い違う」既知の非整合は
  未修正のまま（第7節・第9節の候補例でも同様の文言パターンが再現している）。
- 旧`suitability.ts`系・`suitabilityCoreV1Types.ts`系はCHECKPOINT11.14時点から未削除のまま
  （継続する技術的負債）。

---

## 16. 次にChatGPTと決める必要がある項目

1. `overallConfidence`の定義を第4節の推奨案（案B＋evaluatedComponentCountとの必須ペア表示）へ
   変更するかどうか。承認されれば`suitabilityV1.ts`の`computeOverallConfidence()`の
   最小限の変更として次回実装できる。
2. RaceContext層とSuitability V1層の「未評価」の扱いに関する設計思想の統一を、
   将来どのタイミングで検討するか（今回はRaceContext変更禁止のため監査のみ）。
3. CoursePrior経路の実データ検証（東京ダート1600mの実レースデータ・実gate/frame情報の
   追加取り込み）を今後の優先事項とするかどうか。
4. 複数馬（例: 今回発見した4component評価可能な候補馬）を使った比較検証を次のCHECKPOINTで
   行うかどうか。
5. 全頭展開・RaceContext改修・trackBias・キーンランドC実戦投入への着手タイミング。

**ここでSTOPします。** 全頭展開、RaceContext改修、trackBiasにはまだ進みません。

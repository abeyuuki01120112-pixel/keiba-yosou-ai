# Base Ability V1 シェイクユアハート70.3 最終信頼性検証（CHECKPOINT12.0）

Suitability V1はCHECKPOINT11.17で総合A判定として確定した。今回はSuitability側には一切
触れず、Base Ability V1本体——シェイクユアハートのbaseAbility=70.3——が「コード上で
再現できる」というだけでなく「競馬運用モデルの基準値として本当に信用してよいか」を
最終検証した。新潟芝2000m・新潟記念全頭・Suitability再設計・RaceContext・trackBias・
Race Review Engineには進んでいない。本ラウンドはコード変更なし、検証のみ（一時スクリプトは
確認後削除）。

検証は`loadHorseAbilityProfile("shakeyourheart")`（実データを読み込む本番の唯一の入口）と
`calculateBaseAbility`（凍結済みBase Ability V1の実装そのもの）を直接呼び出す一時スクリプトで
行った。

---

## 1. 5走一覧

| # | raceId | date | raceName | racecourse/surface/distance/going | finishPosition | carriedWeight | raceTime | final3F | timeGap |
|---|---|---|---|---|---|---|---|---|---|
| 1(前走) | JRA-20260614-HANSHIN-11 | 2026-06-14 | 宝塚記念 | 阪神/turf/2200/重 | 14 | 58.0kg | 134.9s | 36.9s | 2.8s |
| 2 | JRA-20260315-CHUKYO-11 | 2026-03-15 | 金鯱賞 | 中京/turf/2000/良 | 1 | 57.0kg | 118.1s | 33.5s | 0.0s |
| 3 | JRA-20260215-KYOTO-11 | 2026-02-15 | 京都記念 | 京都/turf/2200/良 | 4 | 57.0kg | 133.1s | 33.7s | 0.4s |
| 4 | JRA-20251213-CHUKYO-11 | 2025-12-13 | 中日新聞杯 | 中京/turf/2000/良 | 1 | 56.5kg | 117.6s | 33.2s | 0.0s |
| 5 | JRA-20251115-KYOTO-10 | 2025-11-15 | アンドロメダS | 京都/turf/2000/良 | 2 | 58.0kg | 119.0s | 34.6s | 0.1s |

---

## 2. 各走raceScore

| # | raceName | memberLevelScoreAtRace | timeGapScore | raceTimeScore | final3FScore | weightScore | **raceScore** |
|---|---|---|---|---|---|---|---|
| 1 | 宝塚記念 | 74.4 | 18.7 | 93.0 | 58.7 | 70.0 | **62.6** |
| 2 | 金鯱賞 | 69.5 | 90.0 | 60.1 | 84.5 | 70.0 | **74.6** |
| 3 | 京都記念 | 66.7 | 79.8 | 51.9 | 75.8 | 70.0 | **67.8** |
| 4 | 中日新聞杯 | 65.3 | 90.0 | 70.0 | 82.7 | 76.1 | **75.8** |
| 5 | アンドロメダS | 66.6 | 87.2 | 51.4 | 81.7 | 74.1 | **70.6** |

---

## 3. 各走raceScore完全分解

`raceScore = memberLevelScoreAtRace×30% + timeGapScore×25% + raceTimeScore×25% + final3FScore×15% + weightScore×5%`
（`RACE_SCORE_WEIGHTS`、`raceScore.ts`、凍結済み・無変更）に基づく、素点→寄与点の完全分解。

**① 宝塚記念（raceScore=62.6）**
- memberLevel: 74.4×0.30=**22.3点**（実質メンバーレベル、他馬5頭の実データ加重平均）
- timeGap: 18.7×0.25=**4.7点**（着差2.8秒、距離補正済み: 2.8×(2000/2200)=2.55秒相当 → `90-28×2.55=18.7`）
- raceTime: 93.0×0.25=**23.3点**（基準タイム134.0秒に対し実質1.9秒速い、trackAdjustedDiff=+1.9秒 → tanh変換で高得点）
- final3F: 58.7×0.15=**8.8点**（レース内相対でメンバー中央値より0.6秒遅い上がり、絶対評価もマイナス方向）
- weight: 70.0×0.05=**3.5点**（斤量差0kg、中立）
- 合計raw=62.6（0-100clampの範囲内、丸め処理なし）

**② 金鯱賞（raceScore=74.6、1着）**
- memberLevel: 69.5×0.30=**20.8点**
- timeGap: 90.0×0.25=**22.5点**（timeGap=0秒＝勝ち馬本人、`90-28×0=90`が理論上限に近い高得点）
- raceTime: 60.1×0.25=**15.0点**（基準タイム117.6秒に対し実質0.5秒遅い、trackAdjustedDiff=-0.5秒）
- final3F: 84.5×0.15=**12.7点**（レース内相対でメンバー中央値より0.8秒速い上がり）
- weight: 70.0×0.05=**3.5点**（斤量差0kg）

**③ 京都記念（raceScore=67.8、4着）**
- memberLevel: 66.7×0.30=**20.0点**
- timeGap: 79.8×0.25=**20.0点**（着差0.4秒、距離補正2200m: 0.4×(2000/2200)=0.36秒 → `90-28×0.36=79.8`）
- raceTime: 51.9×0.25=**13.0点**（基準タイム131.6秒に対し実質1.1秒遅い、trackAdjustedDiff=-1.1秒）
- final3F: 75.8×0.15=**11.4点**（レース内相対で中央値より0.3秒速い上がり）
- weight: 70.0×0.05=**3.5点**（斤量差0kg）

**④ 中日新聞杯（raceScore=75.8、1着）**
- memberLevel: 65.3×0.30=**19.6点**
- timeGap: 90.0×0.25=**22.5点**（勝ち馬本人）
- raceTime: 70.0×0.25=**17.5点**（基準タイム117.6秒と完全一致、trackAdjustedDiff=0秒→中立70点）
- final3F: 82.7×0.15=**12.4点**（レース内相対で中央値より0.6秒速い上がり）
- weight: 76.1×0.05=**3.8点**（斤量差+1.5kg=中央値55.0kgに対し56.5kgを背負い出走、加重評価でプラス）

**⑤ アンドロメダS（raceScore=70.6、2着）**
- memberLevel: 66.6×0.30=**20.0点**
- timeGap: 87.2×0.25=**21.8点**（着差0.1秒、`90-28×0.1=87.2`）
- raceTime: 51.4×0.25=**12.9点**（基準タイム118.45秒に対し実質1.1秒遅い）
- final3F: 81.7×0.15=**12.3点**（レース内相対で中央値より0.6秒速い上がり）
- weight: 74.1×0.05=**3.7点**（斤量差+1.0kg）

「最終raceScoreだけ」ではなく、raw値→各補正→raceScoreの経路をすべて実データの数値で追える形で確認した。

---

## 4. 70.3集約式

`calculateBaseAbility()`（`baseAbility.ts`、凍結済み）を実コードから抽出。

```typescript
export function calculateBaseAbility(recentRaces: RacePerformance[]): number {
  const races = recentRaces.slice(0, RECENT_RACE_COUNT); // RECENT_RACE_COUNT=5
  if (races.length === 0) return 0;
  const total = races.reduce((sum, race) => sum + race.raceScore, 0);
  return roundToOneDecimal(total / races.length);
}
```

**5走を均等（各20%）で単純平均する**方式であり、前走を特別に重く扱う仕組みは無い
（推測ではなく、実装コードそのものから確認した事実）。「30/25/20/15/10」等の傾斜重みは
このステップには存在しない（それは`RACE_SCORE_WEIGHTS`＝1走内部の5要素配分であり、
baseAbility集約式とは別のステップ）。

```
raceScores = [62.6, 74.6, 67.8, 75.8, 70.6]
各重み = 1/5 = 0.20（均等）
合計 = 351.4
baseAbility = 351.4 / 5 = 70.28 → 丸めて 70.3
```

---

## 5. 各走weight

| # | raceName | raceScore | weight | weighted contribution |
|---|---|---|---|---|
| 1 | 宝塚記念 | 62.6 | 0.20 | 12.52 |
| 2 | 金鯱賞 | 74.6 | 0.20 | 14.92 |
| 3 | 京都記念 | 67.8 | 0.20 | 13.56 |
| 4 | 中日新聞杯 | 75.8 | 0.20 | 15.16 |
| 5 | アンドロメダS | 70.6 | 0.20 | 14.12 |
| | **合計** | 351.4 | 1.00 | **70.28 → 70.3** |

---

## 6. leave-one-race-out結果

`calculateBaseAbility()`を実際に4走のみで再計算した（本番仕様は変更せず読み取り専用）。

| 除外したレース | 再計算baseAbility | 70.3との差 |
|---|---|---|
| 宝塚記念を除外 | 72.2 | **+1.9** |
| 金鯱賞を除外 | 69.2 | -1.1 |
| 京都記念を除外 | 70.9 | +0.6 |
| 中日新聞杯を除外 | 68.9 | **-1.4** |
| アンドロメダSを除外 | 70.2 | -0.1 |

**判定: 特定1走への過度な依存は無い。** 最大の変動は宝塚記念（最も評価が低い走、除外で+1.9）と
中日新聞杯（最も評価が高い走、除外で-1.4）で、いずれも70.3から±2点以内に収まる。5走全体が
バランス良く寄与しており、1走の除外で崩壊するような脆い数値ではない。

---

## 7. 均等重み比較

| 方式 | baseAbility |
|---|---|
| **A: 現在の正式仕様（5走均等平均）** | 70.3 |
| **B: 5走均等重み** | 70.3 |
| C: 直近3走のみ均等（参考値） | 68.3 |

**重要な確認事項**: A（現在の正式仕様）とB（5走均等重み）は**同一の数値**になった。
これは偶然の一致ではなく、`calculateBaseAbility()`の実装自体がすでに「5走を均等20%ずつ
平均する」方式そのものであるため（第4節参照、`baseAbility.ts`のドキュメントコメントにも
明記されている既存仕様）。したがって「70.3が特殊な傾斜重み付けの産物」という懸念は
そもそも成立しない——70.3は単純平均という最も解釈しやすい集約方式で得られた値である。

---

## 8. 直近3走参考値

**68.3**（宝塚記念62.6・金鯱賞74.6・京都記念67.8の3走平均）。70.3との差は-2.0。
直近3走には彼女の2つの好走（中日新聞杯75.8・アンドロメダS70.6）が含まれないため、
5走平均よりやや低く出る。この差は「重み付けの偶然」ではなく、単純に集計対象レース数の
違いによる自然な変動であり、70.3が極端な外れ値でないことの参考的な裏付けとなる
（正式仕様は変更していない）。

---

## 9. component支配性

5走合計での各要素の寄与とraceScore全体（351.4点）に対する比率。

| component | 5走合計寄与 | 最大1走寄与 | raceScore全体に対する比率 | 設計上のweight |
|---|---|---|---|---|
| memberLevel | 102.7 | 22.3（宝塚記念） | **29.2%** | 30% |
| timeGap | 91.5 | 22.5（金鯱賞・中日新聞杯） | **26.0%** | 25% |
| raceTime | 81.7 | 23.3（宝塚記念） | **23.2%** | 25% |
| final3F | 57.6 | 12.7（金鯱賞） | **16.4%** | 15% |
| weight | 18.0 | 3.8（中日新聞杯） | **5.1%** | 5% |

**判定: 過剰な支配は無い。** 実測比率（29.2/26.0/23.2/16.4/5.1%）は設計上のweight
（30/25/25/15/5%）とほぼ一致しており、いずれの要素も自身の設計配分を大きく超えて
raceScoreを支配していない。最大1走寄与も各要素の理論上限（memberLevel30点/timeGap25点/
raceTime25点/final3F15点/weight5点）に対して余裕があり、1走の極端な値がraceScore全体を
単独で決定する構造にはなっていない。

---

## 10. memberLevel監査

`calculateTopNConfidenceWeightedMean`（`memberLevelCandidates.ts`、memberLevel V1本番実装、
凍結済み）を使い、Top5候補（他馬の`abilityBeforeRace`をconfidence加重平均）で算出される。

| raceName | memberLevelScoreAtRace | participantCount(実データロースター内) | 候補中の対象馬自身 |
|---|---|---|---|
| 宝塚記念 | 74.4 | 14 | 含まれない（ability≈72.2でTop5圏外） |
| 金鯱賞 | 69.5 | 5 | **含まれる**（ability=71.4, weight=0.6, sampleCount=3, confidence=medium） |
| 京都記念 | 66.7 | 5 | **含まれる**（ability=73.2, weight=0.6, sampleCount=2, confidence=medium） |
| 中日新聞杯 | 65.3 | 5 | **含まれる**（ability=70.6, weight=0.3, sampleCount=1, confidence=low） |
| アンドロメダS | 66.6 | 5 | 含まれない（この時点で対象馬自身の過去走データが1走も無くability算出不能） |

- **レース格そのものを直接点数化していない**: G1（宝塚記念・14頭実データ）でも重賞未満クラス
  （金鯱賞等・5頭実データ）でも、同じ「他馬のabilityBeforeRace加重平均」というロジックで
  算出されており、レース名・グレードを直接参照するコードは無い（`memberLevelCandidates.ts`・
  `raceHistoryPipeline.ts`いずれにもraceGrade等の入力は存在しない）。
- **実質メンバーレベルとして算出されている**: 各候補は「レースより前に確定していたその馬自身の
  raceScore」から求めたability（`abilityBeforeRace`相当）であり、当日の結果や格付けは使っていない。
- **自己参照について（詳細な確認結果）**: シェイクユアハート自身が、金鯱賞・京都記念・
  中日新聞杯の3レースで自分自身のmemberLevel候補プールに含まれている
  （`raceHistoryPipeline.ts`の`for (const entry of group)`ループが、その馬自身も含めた
  出走馬全員をability候補として扱う設計のため）。これは**「対象レース自身の結果」を使う
  循環参照ではない**（使っているのはあくまで「そのレースより前に確定していた、自分自身の
  過去走の平均」であり、future leakageには該当しない）。ただし、実データロースターが小さい
  レース（候補5頭中1頭が本人）では、対象馬自身の過去実績がその走のmemberLevelScoreへ
  一定の重みで反映される: 金鯱賞13.0%（weight 0.6/合計4.6）、京都記念13.0%（同）、
  中日新聞杯7.0%（weight 0.3/合計4.3）。これは「実データロースターのサイズに応じて
  自己影響の比率が変わる」という実データ制約に起因する特性であり、memberLevel V1の設計
  そのもの（フィールド強度は自分自身を含む出走馬全体の強さを表す、という前提）に反するもの
  ではないが、**限定的な実データロースター下での既知の特性**として明記する（凍結仕様は
  変更していない・今回も変更しない）。
- **未来データ混入なし**: 5レースとも、候補として使われた他馬のabilityは全て「対象レースより
  前の日付」に確定していたraceScoreのみから計算されており（`raceHistoryPipeline.ts`の日付
  昇順処理・`calculateAbilityBeforeRace`の厳格な「対象レースより前」制約）、未来情報は
  混入していない。
- **1〜2頭の異常値で大きく変わらないか**: 5頭中1頭（自分自身、weight 0.3〜0.6）が異常値
  だったとしても、`calculateTopNConfidenceWeightedMean`は加重平均であり、他4頭（weight=1.0が
  多数）が主導権を持つため、1頭の極端な値だけでmemberLevelScoreが崩壊する構造にはなっていない。

---

## 11. final3F監査

`combineFinal3FValue()`（`final3FScore.ts`、凍結済み）を実コードから確認。

- **単純な上がり順位のみの評価ではない**: `relativeDiffSeconds = raceFinal3FMedianSeconds -
  horseFinal3FSeconds`（レース内の実際の秒差、順位ではない連続量）を使っており、
  「上がり1位だから高得点」という順位ベースの評価は行っていない（コード上のドキュメント
  コメントにも明記）。
- **絶対上がり・馬場・距離・レース全体水準の扱い**: `relativeDiffSeconds`（レース内相対、
  重み60%）と`absoluteDiffSeconds`（5年基準タイム＋当日上がり補正との差、重み40%×
  `sampleReliabilityWeight`）を合成している。5走とも`sampleReliabilityWeight=0.1`
  （baselineの`sampleCount`が1〜2レースと少なく、低信頼と判定されたため）と非常に低く、
  実効的な絶対評価の重みは`0.4×0.1=0.04`（4%）程度まで縮小され、相対評価が実質96%を占める
  結果になっている。これは「低信頼なexact baselineを100%信じない」という既存の設計意図
  （`final3FScore.ts`のコメント）通りの正しい挙動であり、宝塚記念用に進めてきた
  final3F絶対評価思想（絶対値も加味する）と矛盾していない——絶対評価という**枠組み自体**は
  常に機能しているが、baselineのサンプル数が少ない現状のデータでは、その**実効的な影響力が
  適切に自動縮小されている**、という関係にある。
- **ペースとの関係**: final3FScore自体はペース（想定ペース・実際の道中ペース）を直接の
  入力にしていない。これはfinal3FScore.ts側の既存スコープ外（RaceContextの
  `paceScenarioFactor`が別途、脚質×想定ペースの相性を扱う——今回のBase Ability V1の
  範囲外であり、変更していない）。

---

## 12. raceTime/timeGap監査

**timeGapScore**（`timeGapScore.ts`、凍結済み）:
```typescript
const adjustedTimeGap = timeGap * (REFERENCE_DISTANCE(2000) / distance);
const score = BASE_SCORE(90) - SECONDS_PENALTY_PER_UNIT(28) * adjustedTimeGap;
```
**「補正着差 = 実着差秒 × (2000 / 距離m)」という既存仕様は、まさにこの`adjustedTimeGap`の
計算式そのもの**（実コードから確認、推測ではない）。距離が長いほど同じ着差秒が軽く評価される
仕組み（例: 京都記念2200mの0.4秒差は`0.4×2000/2200=0.36秒`相当に補正）。

**raceTimeScore**（`raceTimeScore.ts`＋`raceHistoryPipeline.ts`の`buildRaceTimeEvaluation`）:
- 距離差: `courseTimeBaseline`（5年基準タイム、コース×surface×distance×going別）の
  ルックアップキーに距離が含まれ、異なる距離のレース間で直接比較しない設計。
- 馬場差: `trackAdjustment`（同日開催の他レースから求める当日馬場補正、`calculateTrackAdjustment`）。
  5走とも`trackAdjustment.adjustmentSeconds=0`・`sampleCount=0`（同日プールに使える実データが
  無かったため補正なしにフォールバック、実データの制約であり計算ロジックの欠陥ではない）。
- レース水準: `raceScore`自体のmemberLevel要素（30%）が別途担っており、raceTimeScoreは
  「純粋な走破タイムの評価」に専念する設計（役割分離）。
- 着差秒: raceTimeScoreは着差ではなく**勝ち馬の確定タイムそのもの**（`officialTimeSeconds`）と
  基準タイムの差を評価する（timeGapScoreとは独立した別の評価軸）。
- 補正着差の式`実着差秒×(2000/距離m)`はtimeGapScore側の仕組みであり、raceTimeScore側では
  使われていない（役割が異なることを実コードで確認）。

---

## 13. weightScore監査

`buildWeightEvaluation()`（`weightScore.ts`）を実コードから確認。

- **1kg差の影響**: `secondsPerKg = 0.2 × (distance/2000)`（2000mで1kg=0.2秒相当、距離が
  長いほど影響がわずかに増加）。中日新聞杯（2000m、+1.5kg）の例では
  `weightAdjustmentSeconds = 1.5 × 0.2 = 0.3秒` → `calculateWeightScore(0.3)` →
  tanh変換で`weightScore=76.1`（中立70点から+6.1点）。
- **「1kg≒1馬身」思想との整合**: `BASE_SECONDS_PER_KG_AT_2000M=0.2`（コード内の定数名・
  コメントに「1kg≒約1馬身≒約0.2秒を基準とする」と明記）と一致する。
- **過大補正になっていないか**: weightScoreはraceScore全体のわずか5%（`RACE_SCORE_WEIGHTS.weight`）
  であり、5走中の最大寄与も3.8点（理論上限5点に対し余裕あり、第9節）。かつtanh関数による
  飽和カーブのため、大きな斤量差でも点数の伸びが鈍化する設計になっている。5走とも
  斤量差は0〜1.5kgの範囲に収まっており、過大補正は観測されなかった。

---

## 14. future leakage有無

**無い。** `raceHistoryPipeline.ts`は全馬・全レースを日付の**昇順（古い順）**で処理し、
memberLevelの候補（他馬のability）は「そのレースより厳密に前の日付ですでに確定済み」の
raceScoreのみから計算する（`calculateAbilityBeforeRace`が対象レースより前の走だけを
受け取る構造）。これにより「馬AのraceScore→memberLevelScore→同じレースの馬BのraceScore」
のような循環は構造的に発生しない（コードコメントにも明記、かつ`abilityModelV1.regression.test.ts`
の決定性テストでも回帰確認済み）。

**当日馬場補正（raceTimeScore/final3FScoreのtrackAdjustment）についての補足**: これらは
日付の前後を問わず全レースからプールを作る設計だが、これは「他馬の能力評価（raceScore等）」
ではなく「その開催日に確定していた客観的な馬場条件（タイム・上がりの実測値）」という、
未来のレース結果とは独立した事実データを参照しているため、future leakageには該当しない
（コード自体のコメントで明示的にこの区別が説明されている。以前のCHECKPOINTで既に監査済みの
論点であり、本ラウンドで再確認したが変更・新規発見はない）。

---

## 15. 自己参照有無

第10節で詳述した通り、**「対象レース自身の結果」を使う意味での自己参照（future leakage・
循環参照）は存在しない**。ただし、memberLevelの候補プールに「対象馬自身の過去走
（そのレースより前に確定済み）」が含まれるケースが3/5レースで確認された（金鯱賞・京都記念・
中日新聞杯、weight比率7.0〜13.0%）。これは仕様上想定された「フィールド強度は自分自身を
含む」という設計の自然な帰結であり、禁止されている自己参照（同一レースの結果の使い回し）
とは性質が異なる。

---

## 16. 人間向け70.3説明

シェイクユアハートのbaseAbility=70.3は、直近5走（宝塚記念62.6・金鯱賞74.6・京都記念67.8・
中日新聞杯75.8・アンドロメダS70.6）の単純平均から成り立っている。

- **5走のうち2走（金鯱賞・中日新聞杯）が高水準（raceScore 74点台後半）で、いずれも1着**。
  中日新聞杯（75.8）が最も強い内容——タイムが基準ぴったり（trackAdjustedDiff=0秒）で
  raceTimeScoreは中立の70点だが、上がり3F(final3FScore=82.7)とtimeGap（勝ち馬本人で90点）
  が高く評価に効いている。
- **金鯱賞（74.6）は僅差の1着で、raceTimeScore(60.1)はやや平凡（実質0.5秒遅い）だが、
  final3F(84.5)が5走中最高**——上がりの脚が最も評価された一戦。
- **宝塚記念（62.6）は5走中最低評価**——14着大敗（着差2.8秒）でtimeGapScoreが18.7点まで
  下落。ただしraceTimeScore自体は93.0点と高い（基準タイムに対し実質1.9秒速い＝メンバー
  全体のレベルが高かったG1で、絶対的な走破タイムそのものは悪くなかったことを示す）。
  memberLevelも74.4点とG1らしく高水準——このレースは「着順は大敗だが、格の高いメンバーの
  中で走ったこと自体」が一定評価されている。
- **京都記念（67.8）・アンドロメダS（70.6）は中間的な内容**。京都記念は4着で着差0.4秒と
  接戦だったがraceTimeScore(51.9)がやや低め（基準より実質1.1秒遅い）。アンドロメダSは
  2着惜敗で各要素とも標準〜やや上（final3F81.7が目立つ）。
- **memberLevel（実質メンバーレベル）は5走とも65〜74点台で、raceScoreの寄与としては
  各走19〜22点程度（raceScore全体の約3割）を占め、最も重い単一要素**。特に宝塚記念は
  実データロースター中14頭という最も厚みのあるフィールドで、この一戦のmemberLevel(74.4)が
  5走中最高。
- **final3F（上がり3F）はraceScoreの寄与として各走9〜13点程度（約15〜17%）**。金鯱賞・
  中日新聞杯・アンドロメダSの3走で相対的に高評価（上がりでメンバー中央値より速かった）。
- **斤量（weightScore）の影響は小さい**——5走とも寄与は3.5〜3.8点（raceScore全体の5%枠内）
  にとどまり、順位を左右するような要素にはなっていない。

総じて、70.3は「G1（宝塚記念）での着順以上に評価されるべき内容（高いraceTimeScore・
memberLevel）」と「重賞未満クラスでの2勝（金鯱賞・中日新聞杯）の安定した好内容」が
バランス良く合算された数値であり、特定の1走・1要素だけで作られた数字ではない。

---

## 17. baseAbility=70.3再現

`abilityModelV1.regression.test.ts`を単独実行し、3テストすべてパス。シェイクユアハートの
baseAbility=**70.3**を完全再現した。本ラウンドは検証のみでコード変更を一切行っていない。

---

## 18. test/lint/build/validate:data

- `npm test` — 534/534 pass（54 test files。CHECKPOINT11.17完了時点と同一件数、
  本ラウンドはコード変更が無いため変化なし）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 19. technical debt

- memberLevelの候補プールに対象馬自身が含まれる特性（第10節・第15節、金鯱賞13.0%・
  京都記念13.0%・中日新聞杯7.0%）は、実データロースターが5頭程度と小さいレースで
  顕著になる。将来ロースターを拡充すれば自然に希釈される見込みだが、現時点では
  「実データ制約下の既知の特性」として記録する（memberLevel V1の凍結仕様は変更していない）。
- raceTimeScore/final3FScoreのtrackAdjustment（当日馬場補正）は5走とも`sampleCount=0`
  （同日プールに使える実データが無い）でフォールバックしており、実質的に機能していない
  （既知の制約、過去のCHECKPOINTから継続）。
- final3FScoreのabsolute評価は、baselineのサンプル数不足により`sampleReliabilityWeight=0.1`
  程度まで縮小され、実質的にrelative評価（96%）が支配的になっている（第11節、設計通りの
  縮小だが、絶対評価の実効影響力は現状のデータでは小さい）。
- courseTimeBaselines/courseFinal3FBaselinesの多くが`isReliable: false`
  （`baselineMeta`内、暫定candidateの表記）——既存の既知の制約（validate:dataの警告と一致）。

---

## 20. A/B/C判定

**A: 70.3をBase Ability V1の正式基準値として信用可能。**

CHECKPOINT12.0 STEP13の条件に照らして判定する。

- **1走依存が過大でない**: leave-one-race-out（第6節）で最大変動±1.9点、70.3周辺に
  安定して収束することを確認した。
- **特定component支配が過大でない**: 実測比率（29.2/26.0/23.2/16.4/5.1%）が設計上の
  重み（30/25/25/15/5%）とほぼ一致し、いずれの要素も突出していない（第9節）。
- **未来リークなし**: 日付昇順処理・厳格な「対象レースより前」制約をコードレベルで確認した
  （第14節）。
- **自己参照（禁止されている意味での循環参照）なし**: 対象レース自身の結果を使う経路は
  存在しない。memberLevel候補プールへの自分自身の過去実績の混入（3/5レース、7〜13%）は
  設計通りの「フィールド強度は自分自身を含む」という性質であり、future leakageや循環参照
  とは異なる（第10節・第15節で明確に区別して確認した）。
- **5走分解が説明可能**: raw値→各補正→raceScoreの経路をすべての要素について実データの
  数値で追跡し、人間が理解できる形で説明できた（第3節・第16節）。
- **重み変更で極端に崩れない**: 均等重み（現行仕様そのもの）・直近3走参考値（68.3）いずれも
  70.3から大きく乖離しない（第7節・第8節）。

以上の全条件を満たすため、A判定とする。

---

## 21. 次にChatGPTと決める必要がある項目

1. 新潟芝2000m・新潟記念全頭展開へ進むかどうか（本ラウンドでは着手していない）。
2. memberLevel候補プールへの自己参照的な特性（第10節・第19節）について、将来ロースター
   拡充以外に対応が必要かどうか。
3. Suitability再設計・RaceContext・trackBias・Race Review Engineへの着手タイミング
   （本CHECKPOINTの範囲外）。
4. courseTimeBaselines/courseFinal3FBaselinesの信頼性向上（追加実データ収集）を
   優先事項とするかどうか。

**ここでSTOPします。** baseAbility=70.3はA判定となりましたが、新潟芝2000m・新潟記念・
他馬展開にはChatGPT承認前に進みません。

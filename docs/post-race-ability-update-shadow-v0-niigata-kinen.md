# POST-RACE ABILITY UPDATE SHADOW V0 — 2026新潟記念

**作成日**: 2026-09-03

**結論を先に明記する**: 2026新潟記念を「新しい能力証拠」としてBase Ability V1へ
追加するShadow計算は、**11頭中どの馬についても最後まで実行できなかった。**
理由は着順への合わせ込みではなく、**Base Ability V1が要求する必須項目
（`final3F`＝上がり3F、および4着以降10頭分の`timeGap`／`actualRaceTimeSeconds`）が、
現在このプロジェクトが保有する実データの中に一件も存在しないため**である。
推測・平均値・都合のよい値で埋めることは行わず、欠損はすべて
`missing`/`unavailable`として報告する（CLAUDE.md絶対原則5、ユーザー指示のSTEP2）。

その一方で、**着順に一切依存しない「このレースの参加メンバーがどれだけ強かったか」
（memberLevelScoreAtRace）だけは、既存の凍結済み関数を使い実データのみで
完全に算出できた**（後述STEP3）。これはBase Ability更新パイプラインの
一部が実際に機能することを示す一方、raceScore全体（延いてはBase Ability更新）は
着順以外の実測タイムデータが揃わない限り実行できないという、
このプロジェクトのデータ収集状況に関する重要な発見である。

production dataは一切変更していない（Shadow計算のみ、`data/horses/`無変更）。
Base Ability V1・Suitability V1・memberLevel仕様・final3F仕様・Temperature・
Plackett-Luce・finalRaceAbility・prediction parameterは一切変更していない。

---

## STEP1. 現在のPost-Race → Base Ability更新経路の監査

コードを実際に読んで追跡した（推測ではなく、以下すべて実ファイル・実行番号を
引用する）。

### 経路全体

```
新しいRacePerformance（1レース分）
  ↓ src/ability/raceHistoryPipeline.ts の buildRaceHistory()
    ├─ memberLevelScoreAtRace（レース単位・全出走馬共通値）
    ├─ raceTimeScore（レース単位・全出走馬共通値）
    ├─ final3FScore（馬ごとの個別値）
    ├─ timeGapScore（馬ごとの個別値）
    ├─ weightScore（馬ごとの個別値）
    └─ raceScore = calculateRaceScore(...)（5項目の加重和）
  ↓ getHorseRecentRaces()（production data/horses/、既存・無変更）で
    馬ごとのRacePerformance[]に反映される
  ↓ src/ability/baseAbility.ts の calculateBaseAbility(recentRaces)
    直近RECENT_RACE_COUNT=5走（無ければ有る分だけ）のraceScoreの
    単純平均（加重無し、直近優先なし）
  = baseAbility（更新後）
```

### 各要素の役割（実コード確認済み）

| 要素 | raceScoreへの寄与 | 根拠 |
|---|---|---|
| `memberLevelScoreAtRace` | 30%（`RACE_SCORE_WEIGHTS.memberLevel=0.30`、`raceScore.ts`） | `raceHistoryPipeline.ts`で対象レースの全出走馬の`abilityBeforeRace`（=そのレース以前の各馬自身のbaseAbility相当値）から`buildMemberLevelResult()`経由で算出。**このレース自身の結果（着順・タイム）は一切使わない**——事前の実力だけで「今回のメンバーがどれだけ強かったか」を評価する値。レース単位で全馬共通。 |
| `timeGapScore` | 25%（`RACE_SCORE_WEIGHTS.timeGap=0.25`） | `calculateTimeGapScore(timeGap, distance)`（`timeGapScore.ts`）。`timeGap`＝勝ち馬とのタイム差（**秒**、連続値）。**着順（1着・2着…という順位）そのものは一切引数に含まれない。** |
| `raceTimeScore` | 25% | `buildRaceTimeEvaluation()`（`raceHistoryPipeline.ts`）。レース単位・全出走馬共通値。勝ち馬の走破タイムとコース基準タイム（`courseTimeBaselines`）との差分＋トラック補正から算出。 |
| `final3FScore` | 15% | `calculateFinal3FScore()`（`final3FScore.ts`）。馬ごとの上がり3F（秒）を、レース内相対評価＋絶対評価（基準タイム比）でブレンド。 |
| `weightScore` | 5% | `calculateWeightScore()`（`weightScore.ts`）。馬自身の斤量とそのレースの斤量中央値の差を秒換算。 |

### 「着順がBase Abilityへどう影響するか」の明確な結論

**`finishPosition`自体は、`raceScore`計算のいかなる項目にも直接の重みとして
使われていない。** `finishPosition`が実コード中で参照される唯一の箇所は
`raceHistoryPipeline.ts`の

```ts
const winner = group.find((e) => e.raw.finishPosition === 1) ?? group[0];
```

——**「誰が勝ち馬か」を特定するためだけ**であり、この特定結果は
`raceTimeScore`（勝ち馬の走破タイムを基準にする）と`timeGap`
（各馬の勝ち馬とのタイム差）の算出に間接的に使われる。

つまり、**「1着だから加点・10着だから減点」という直接の着順合わせ込みは
既存コードに一切存在しない。** 実際に効いているのは「勝ち馬とのタイム差
（秒、連続値）」であり、これは同着・僅差クラスタでは着順が離れていても
ほぼ同じ評価になりうる（例: タイム差0.1秒なら2着でも5着でもtimeGapScoreは
ほぼ同じ）。ただし、通常はレース終盤で差が開くほど着順とタイム差は強く
相関するため、結果として「着順が悪い馬ほど評価が下がりやすい」という
**間接的な傾向**は生じる——これは着順を直接使っているからではなく、
タイム差という連続変数を使った結果としての相関である、という区別が重要。

### `calculateBaseAbility`（Before→After更新の仕組み）

`baseAbility.ts`の`calculateBaseAbility(recentRaces)`は、直近
`RECENT_RACE_COUNT=5`走（無ければ有る分だけ）の`raceScore`の**単純平均**。
新しいレースを1件追加すると、6走目以降は古い方から1走ずつ押し出される
（直近5走のスライディングウィンドウ）。**直近優先の重み付けは無い**
——新しい1走は「5分の1」としてしか反映されず、既存5走のうち最も低い
raceScoreが押し出される馬ほど、新しい1走の影響（Delta）が大きくなる
構造である。

---

## STEP2. 新潟記念RacePerformanceのShadow構築（結果: 大部分がmissing）

Base Ability V1の生入力型`RaceHistoryRawInput`（`raceHistoryPipeline.ts`、
`RacePerformance`から派生値を除いた型）は、以下を**すべて必須**とする:
`raceId, raceName, raceDate, racecourse, surface, distance, going,
finishPosition, timeGap, raceTime, final3F, carriedWeight`
（1つでも欠ければ有効なRacePerformanceを構築できない）。

11頭それぞれについて、実際に確認できた項目・できなかった項目を以下に示す
（`実データのみ`を対象に確認。推測・補完は一切行っていない）:

| 馬名 | finishPosition | carriedWeight | timeGap | raceTime | final3F |
|---|---|---|---|---|---|
| ゾロアストロ | 1（実） | 55kg（実、assignedWeight） | 0秒（実、1〜3着同タイム） | 119.6秒（実、勝ち時計） | **missing** |
| ロデオドライブ | 2（実） | 57kg（実） | 0秒（実） | 119.6秒（実） | **missing** |
| ダノンシーマ | 3（実） | 57kg（実） | 0秒（実） | 119.6秒（実） | **missing** |
| サヴォーナ | 4（実） | 57kg（実） | **missing** | **missing** | **missing** |
| アーバンシック | 5（実） | 59kg（実） | **missing** | **missing** | **missing** |
| ドゥレッツァ | 6（実） | 59kg（実） | **missing** | **missing** | **missing** |
| ボーンディスウェイ | 7（実） | 57kg（実） | **missing** | **missing** | **missing** |
| チェルヴィニア | 8（実） | 56kg（実） | **missing** | **missing** | **missing** |
| ジュンブロッサム | 9（実） | 58kg（実） | **missing** | **missing** | **missing** |
| バレエマスター | 10（実） | 57kg（実） | **missing** | **missing** | **missing** |
| ステレンボッシュ | 11（実） | 56kg（実） | **missing** | **missing** | **missing** |

**carriedWeightについての注記**: 上記は`assignedWeight`（Formal Snapshot
に保存された発走前の想定斤量）を代用している。実際の確定馬体重超過等が
無かったかは別途確認していない（通常は一致するはずだが、100%確定した
実測値ではない点を明記する）。

**final3Fが11頭全員でmissingな理由**: このプロジェクトのdocs（
`docs/2026-niigata-kinen-race-retrospective-20260830.md`ほか）に記録されている
実データは、レース全体の勝ち時計・馬場状態・ペース区分・上位3頭の着差という
**レース単位の集約情報のみ**であり、馬ごとの上がり3F・通過順位は記録されて
いない（`docs/checkpoint14d4-preliminary-stage-b-niigata-kinen.md`の
「通過4-4 上がり34.3」等の記述は、**新潟記念本体ではなく前日の同条件参考レース
（赤倉特別）の診断データ**であり、新潟記念自体の実測値ではないことを
本ラウンドで確認した——過去の報告で誤って混同されないよう明記する）。

**結論**: `RaceHistoryRawInput`を有効に構築できた馬は**0頭**。
1〜3着ですら`final3F`が無いため、単独では構築できない。

---

## STEP3. memberLevelを新潟記念として再評価（実データのみで完全算出できた）

`memberLevelScoreAtRace`は対象レース自身の結果を一切使わず、**全出走馬の
事前実力（baseAbility、Formal Snapshotに実際に保存されている値）だけ**
から算出できる。これは実データのみで完全に計算できた。

使用した実関数: `calculateTopNConfidenceWeightedMean()`・
`selectTopNCandidates()`（`memberLevelCandidates.ts`、既存・無変更、
`MEMBER_LEVEL_TOP_N=5`固定）。入力は各馬の`baseAbility`
（Formal Snapshotの実際値）と`abilityEvidenceCount`（同、実際値、
過去走本数）。

### Top5候補（ability降順）

| 馬名 | baseAbility（Before） | sampleCount | confidence | weight |
|---|---|---|---|---|
| ダノンシーマ | 78.3 | 5 | high | 1.00 |
| ロデオドライブ | 76.7 | 4 | high | 1.00 |
| ゾロアストロ | 74.8 | 5 | high | 1.00 |
| ボーンディスウェイ | 73.1 | 5 | high | 1.00 |
| ジュンブロッサム | 72.7 | 5 | high | 1.00 |

**memberLevelScoreAtRace（Shadow）= 75.1**（confidence考慮加重平均、
`weightedMean`）。Top5全馬がconfidence=high（weight=1.00）だったため、
今回はたまたま単純平均（`simpleTop5Average=75.1`）と完全に一致した
——confidence差による重み付け効果が今回のメンバー構成では現れなかった、
という事実。

**この75.1という値の意味**: 「2026新潟記念に出走した11頭は、事前実力から
見て、直近のこのクラスの重賞としては相応に強いメンバーだった」という
定量評価。**結果を見てから決めた値ではなく、結果を一切参照せずに算出した
値である**（着順情報を一切引数に渡していない）。

---

## STEP4. Race Score分解（結果: 算出不能）

STEP2の通り、11頭全員で`final3F`が欠損しているため、`calculateFinal3FScore()`
を呼び出せる馬が1頭も無い。8頭（4着以降）は`timeGap`・`raceTime`も欠損して
いるため`calculateTimeGapScore()`・`buildRaceTimeEvaluation()`も呼べない。

**唯一算出できたのはmemberLevelScoreAtRace（30%）のみ**（STEP3）。
残り70%（timeGapScore 25%＋raceTimeScore 25%＋final3FScore 15%＋
weightScore 5%）は算出不能——**raceScore自体を`missing`として報告する。**

---

## STEP5. Before / After Base Ability Shadow計算（結果: 実行不能）

`raceScore`が算出できないため、`calculateBaseAbility()`（直近5走の単純平均）
に新潟記念を追加することができない。**11頭全馬について、After Base Ability
（Shadow）は`unavailable`として報告する。**

| 馬名 | Before Base Ability | Niigata raceScore | After Base Ability（Shadow） | Delta |
|---|---|---|---|---|
| ダノンシーマ | 78.3 | missing | unavailable | unavailable |
| ロデオドライブ | 76.7 | missing | unavailable | unavailable |
| ゾロアストロ | 74.8 | missing | unavailable | unavailable |
| バレエマスター | 72.4 | missing | unavailable | unavailable |
| ジュンブロッサム | 72.7 | missing | unavailable | unavailable |
| サヴォーナ | 70.2 | missing | unavailable | unavailable |
| アーバンシック | 72.1 | missing | unavailable | unavailable |
| ドゥレッツァ | 67.4 | missing | unavailable | unavailable |
| ボーンディスウェイ | 73.1 | missing | unavailable | unavailable |
| チェルヴィニア | 69.1 | missing | unavailable | unavailable |
| ステレンボッシュ | 69.4 | missing | unavailable | unavailable |

**これは「大きな変動が無かった」という結論ではなく、「変動を計算する
ための入力が無い」という、質の異なる結論である。** 両者を混同しないこと。

---

## STEP6〜8. 更新量妥当性監査・上位3頭比較・下位着順馬確認（実行不能）

STEP5でAfter Base Abilityが算出できなかったため、Delta・順位変化を
実測できない。**ダノンシーマ・ロデオドライブ・ゾロアストロの3頭を含め、
今回のShadow計算では「更新量が過大かどうか」を数値で確認することは
できなかった。**

ただし、STEP1で確認した構造（`calculateBaseAbility`が直近5走の**単純
平均**であること）から、**構造的なリスクは推測ではなく理論的に指摘できる**:

- 新しい1走は常に「5分の1」の重みで反映される。5走のうち最も低い
  raceScoreが押し出される馬ほど、新しい1走のBase Abilityへの影響
  （絶対値としてのDelta）は大きくなりうる（既存5走の分散が大きい馬ほど
  新規1走の影響を受けやすい構造）。
- これは今回の11頭に限らず、Base Ability V1全体に共通する構造的性質
  であり、新潟記念1レースの結果を理由に変更すべきものではない
  （既存の凍結方針通り）。
- **この構造的リスクを定量的に検証するには、実際にraceScoreが計算できる
  状態（final3F等が揃った状態）で、複数レース・複数馬のBefore/After
  Deltaを実測する必要がある**——今回のような不完全なデータでは検証
  できない。

バレエマスター（AI4位→10着）・ジュンブロッサム（AI5位→9着）・
サヴォーナ（AI8位→4着）についても同様に、raceScoreが算出できないため
「1回負けたことで急落する構造になっていないか」「4着だけで急上昇して
いないか」を今回は実測で確認できなかった。

---

## STEP9. 「能力更新」と「予想誤差修正」の分離

- **A（能力更新、今回のShadow研究の対象）**: 新潟記念を「新しい1つの
  観測データ」としてBase Abilityへ追加する。過去5走同様、機械的に
  raceScoreを算出し、単純平均へ組み込むだけ——「今回の予想が当たったか
  外れたか」は一切問わない。仮にダノンシーマが3着だったとしても、それは
  「3着相当の点数を機械的に与える」のではなく、「timeGap・final3F・
  raceTime等の実測値から算出されたraceScoreを機械的に与える」だけである。
- **B（予想誤差修正、今回は対象外）**: `docs/2026-niigata-kinen-prediction-error-analysis.md`・
  `docs/2026-niigata-kinen-stage-a-internal-decomposition.md`で既に
  実施済みの「なぜAIの予測順位と実際の結果がズレたのか」を分析し、
  複数レースの検証を経てモデル（Suitability component構造・weight・
  Temperature等）を改善する作業。**今回のShadow研究はこれを一切行って
  いない**（絶対に変更禁止のリストにも明記済み）。

この2つを混同すると、「3着だったから能力を下げる」「1着だったから
能力を上げる」という着順合わせ込みに陥る——これがユーザーの最重要思想
「絶対に着順合わせを行わない」の意味であり、今回のShadow研究は
（データ欠損により結果的にではあるが）この原則を機械的に満たした
（raceScoreが計算できないため、着順に基づく点数の付けようが無かった）。

---

## STEP10. Future Weekly Loop設計（設計のみ、production書き込みなし）

```
Prediction（Stage A確定、既存buildGateConfirmedSnapshot()）
  ↓
Race Result取得（Windows/JRA-VAN到着後: RealJraVanProviderが
  finishPosition・actualRaceTimeSeconds・final3FSeconds・timeGapSeconds・
  carriedWeightKg・passingPositionを取得——STEP2で判明した通り、
  「finishPositionと勝ち時計だけ」では不十分。全出走馬の個別タイム・
  上がり3Fが必須）
  ↓
RacePerformance候補生成（新規モジュール、仮称
  buildShadowRacePerformance()——既存raceHistoryPipeline.tsのロジックを
  流用し、対象1レースだけを閉じたデータセットとして処理する。
  niigataGateHistoryV1.ts（CHECKPOINT14D.1D）と同じIsolation
  Architectureパターンを踏襲する）
  ↓
Base Ability更新候補生成（calculateBaseAbility()を実行、Shadow値として
  保持。**production data/horses/への自動書き込みはまだ行わない**——
  人間が確認してから正式反映する運用を当面維持することを推奨）
  ↓
次走で使用（次回Stage A生成時、更新済みBase Abilityを参照）
```

### 自動化に向けた設計上の要点

1. **Collector V0（PRE-WINDOWS INTEGRATION）のBridge（`requestBridge.ts`）
   をそのまま再利用できる。** `requestedDataTypes`に`"result"`を追加し、
   Windows側（`RealJraVanProvider`）が結果確定後に`RawRaceBundle`を
   `finishPosition`・`actualRaceTimeSeconds`・`final3FSeconds`・
   `timeGapSeconds`まで含めて完全な形で返すよう拡張する必要がある
   （現状のCollector V0は既にこれらのフィールドを型として持っている
   ——`RawRunnerRow`、`src/collector/types.ts`——実装済みのスキーマは
   変更不要、実際にJV-Linkから埋まった値が来るかどうかだけが課題）。
2. Base Ability更新候補は、既存のFormal Prediction Snapshotの不変性
   契約（`predictionSnapshotStore.ts`）とは別の、新しい「Shadow候補
   ストア」として設計するのが安全——production`data/horses/`への書き込みは
   人間承認を経た別のステップとして明確に分離する。

---

## UIとの接続

**今回は見送った。** 既存UI（PRE-WINDOWS INTEGRATION + UI V0）は静的JSON
読み込み方式であり、今回のShadow研究の結果自体が「11頭中0頭で計算できた」
という否定的な結果になったため、Before/After/Delta表示を追加しても
空欄ばかりになり価値が薄い。**raceScoreが実際に算出できるデータが揃った
時点で、Race Detail画面に「Shadow Base Ability」列を追加することを
次回以降の候補として提案する**（研究の本体を邪魔しない範囲で）。

---

## 最終成果物（14項目）

1. **新潟記念11頭のBefore Base Ability**: STEP3表の通り（ダノンシーマ
   78.3〜ステレンボッシュ69.4、全馬実データ）。
2. **新潟記念raceScore**: **11頭全馬でmissing**（final3F欠損のため算出不能）。
3. **After Base Ability（Shadow）**: **11頭全馬でunavailable**。
4. **Delta**: **11頭全馬でunavailable**。
5. **Before / After Ability順位**: Beforeは算出可能（1位ダノンシーマ〜
   11位ドゥレッツァ、baseAbility降順）。Afterは算出不能。
6. **上位3頭の変化**: 算出不能（STEP6〜8参照）。
7. **最大上昇馬**: 該当なし（算出不能）。
8. **最大下降馬**: 該当なし（算出不能）。
9. **不自然な更新が存在したか**: 判定不能（更新自体が実行できなかった）。
10. **欠損データ**: 11頭全馬の`final3F`、8頭（4着以降）の`timeGap`・
    `actualRaceTimeSeconds`・`passingPosition`。`carriedWeight`は
    assignedWeightで代用（実測値ではない可能性がある注記付き）。
11. **Base Ability V1の更新構造に問題候補があるか**: STEP6で理論的に
    指摘した「直近5走単純平均のため、既存5走の分散が大きい馬ほど新規
    1走の影響を受けやすい」という構造は、実測での検証待ち
    （今回は検証できなかった）。memberLevelScoreAtRace自体
    （STEP3、confidence考慮top5加重平均）は実データのみで問題なく
    機能することを確認した。
12. **この方式を毎週使えるか**: **現状のデータ収集レベルでは使えない。**
    finishPositionと勝ち時計（レース単位）だけでは、Base Ability更新に
    必要な個別final3F・timeGapが決定的に不足する。JV-Link/JRA-VAN
    導入後、全出走馬の個別タイム・上がり3Fが取得できて初めて
    実用化できる。
13. **自動化する際に追加で必要なデータ**: 全出走馬（勝ち馬に限らない）の
    `actualRaceTimeSeconds`・`final3FSeconds`・`timeGapSeconds`・
    `passingPosition`・確定`carriedWeightKg`。これは今回のようなdocs記録
    （レース単位の集約情報）では代替できず、JV-Link等の構造化された
    per-runner結果データが必須である。
14. **productionへ正式反映して安全そうか、それとも追加検証が必要か**:
    **反映するデータ自体が今回は存在しないため、判断材料が無い。**
    まず全出走馬の個別タイムデータを取得したうえで、改めてShadow計算を
    やり直す必要がある。

---

## Regression

本ラウンドは読み取り専用のスクラッチスクリプト（既存の凍結済み関数の
呼び出しのみ、実行後削除）による研究のみ。新規production code・
production dataの追加・変更は無い。

```
git status --short → docs/post-race-ability-update-shadow-v0-niigata-kinen.md のみ
npm test            → 既存822件、回帰なし
npm run lint         → PASS
npm run build         → PASS
npm run validate:data → 検証成功（既存warningのみ）
```

---

以上、Shadow計算（研究）の範囲でSTOPします。production `data/horses/`への
新潟記念の正式追加は行っていません。

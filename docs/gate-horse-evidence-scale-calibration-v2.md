# gate HorseEvidence → percent scale追加実データ検証（CHECKPOINT11.7・B判定維持、コード変更なし）

**作成日: 2026-08-23。ステータス: scale=3をB判定のまま維持。A判定にはしない。
コード変更なし（`GATE_HORSE_EVIDENCE_SCALE=3`は現状維持）。**

CHECKPOINT11.6で判明した不足（実馬6頭のみ・positive:negative=6:1・houohbiscuits
依存・scale3.0/3.5/4.0の優劣未確定）を、**既存リポジトリ内データの追加活用**
（新規データの作成なし）で可能な範囲まで解消し、再検証した。

---

## データ拡張の方法（重要な発見）

CHECKPOINT11.6までの分析は`loadAllHorseAbilityProfiles()`を使用していたが、
この関数は`simulation/data/sapporoKinen.json`（札幌記念シミュレーション用の
出走ロスター、16頭）に紐づく馬だけを返す仕様だった。実際には
`data/horses/*.json`に**40頭分の実データファイルが存在**しており（`validate:data`が
継続的に警告していた「horseIdはdata/horses/にあるがsapporoKinen.jsonにない」馬
24頭が該当）、これらもすべて実データである。

今回、`raceHistoryPipeline.buildRaceHistory()`（Ability Model V1凍結済み関数、
無変更のまま再利用）を直接呼び出し、**40頭全ファイルの生データを読み取り専用で
処理**することで、ロスターに紐づかない24頭分の実データも追加検証に活用した。
**新規データの作成・推測は一切行っていない**（既存リポジトリに実在するファイルを
読んだだけ）。

---

## STEP1〜3: 使用データ件数・positive/negative/neutral分類

| 項目 | CHECKPOINT11.6 | CHECKPOINT11.7（今回） |
|---|---|---|
| グループ数（馬×条件） | 7 | **18** |
| 対象馬数 | 6 | **15** |
| positive delta（>+1.0）馬数 | ほぼ全て（6/7グループ、5頭相当） | **11頭（13グループ）** |
| negative delta（<-1.0）馬数 | 1頭のみ | **4頭（4グループ）** |
| neutral（±1.0以内）グループ数 | 0 | **1** |

目標（実馬15〜20頭、positive最低5頭、negative最低5頭、neutral複数）に対し、
**実馬数（15頭）とpositive（11頭）は目標を満たしたが、negative（4頭）と
neutral（1グループ）は僅かに不足している。** これは既存リポジトリ内の
全40頭分を漏れなく走査した上での結果であり、これ以上は新規データ無しでは
拡張できない（後述のZIP仕様参照）。

### グループ一覧（全18件、今回追加した24頭ぶんを含む）

```
2018104638 | 中山/turf/2500 | deltas=[-5.2] | aggregatedDelta=-5.20
2019105556 | 中山/turf/2200 | deltas=[0.7,0.2] | aggregatedDelta=0.45（neutral）
2021100913 | 阪神/turf/2200 | deltas=[0.3,2.2] | aggregatedDelta=1.25
2021100913 | 中京/turf/2000 | deltas=[14.4,5.3] | aggregatedDelta=9.85
2021103272 | 阪神/turf/2200 | deltas=[9.9] | aggregatedDelta=9.90
2021105541 | 京都/turf/2200 | deltas=[5.2,-2.3] | aggregatedDelta=1.45
2021105898 | 中山/turf/2500 | deltas=[4.3] | aggregatedDelta=4.30
2021105898 | 阪神/turf/2200 | deltas=[-2.4,-0.8] | aggregatedDelta=-1.60
2021106548 | 阪神/turf/2200 | deltas=[3.6] | aggregatedDelta=3.60
2021106787 | 中山/turf/2500 | deltas=[-5.6] | aggregatedDelta=-5.60
2022106120 | 中山/turf/2500 | deltas=[3.7,2.8,3.3] | aggregatedDelta=3.30
houohbiscuits | 小倉/turf/1900 | deltas=[7.1] | aggregatedDelta=7.10
houohbiscuits | 小倉/turf/1800 | deltas=[11.0,7.7] | aggregatedDelta=9.35
arata | 中山/turf/1900 | deltas=[1.4] | aggregatedDelta=1.40
igacchi | 中山/turf/2100 | deltas=[5.7,12.2] | aggregatedDelta=8.95
zendanhayabusa | 中山/turf/2100 | deltas=[1.9,3.8] | aggregatedDelta=2.85
onyankopon | 函館/turf/2200 | deltas=[-1.1] | aggregatedDelta=-1.10
shakeyourheart | 中京/turf/2000 | deltas=[5.2,3.2] | aggregatedDelta=4.20
```

future leakage防止: 各馬の全走歴を日付昇順に並べ替えた上で、各マッチ走より
厳密に前の走だけを`calculateAbilityBeforeRace()`（凍結済み、無変更）に渡した
（CHECKPOINT11.5〜11.6と同一の手法）。

---

## 各scale比較（scale=2.5/3.0/3.5/4.0、amplitude=5固定）

raw delta（グループ単位、n=18）: min=-5.60 P25=0.65 median=3.07 P75=6.40 max=9.90

| scale | min | P25 | median | P75 | max | <90 | <95 | >105 | >110 | effAbility(base70) min〜max |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.5 | 95.1 | 101.2 | 104.2 | 104.9 | 105.0 | 0/18 | 0/18 | 0/18 | 0/18 | 66.6〜73.5 |
| **3.0** | 95.2 | 101.1 | 103.9 | 104.8 | 105.0 | 0/18 | 0/18 | 0/18 | 0/18 | 66.7〜73.5 |
| 3.5 | 95.4 | 100.9 | 103.5 | 104.7 | 105.0 | 0/18 | 0/18 | 0/18 | 0/18 | 66.8〜73.5 |
| 4.0 | 95.6 | 100.8 | 103.2 | 104.5 | 104.9 | 0/18 | 0/18 | 0/18 | 0/18 | 66.9〜73.5 |

**±5%以上（<95または>105）・±10%以上（<90または>110）はいずれのscaleでも
0/18件。** データが2.6倍に増え、初めて実質的な負側データ（n=4）が加わった後も、
過補正基準はすべてのscale候補で満たされたままである。

### positive側のみ（n=13）

| scale | median | max | >105発生 |
|---|---|---|---|
| 2.5 | 104.7 | 105.0 | 0/13 |
| 3.0 | 104.4 | 105.0 | 0/13 |
| 3.5 | 104.2 | 105.0 | 0/13 |
| 4.0 | 103.9 | 104.9 | 0/13 |

### negative側のみ（n=4、CHECKPOINT11.6ではn=1で検証不能だった側）

| scale | median | min | <95発生 |
|---|---|---|---|
| 2.5 | 96.2 | 95.1 | 0/4 |
| 3.0 | 96.4 | 95.2 | 0/4 |
| 3.5 | 96.7 | 95.4 | 0/4 |
| 4.0 | 96.9 | 95.6 | 0/4 |

**初めて負側でも「95未満に一度も達しない」ことを実データで確認できた。**
ただしn=4であり、目標のn≥5にはわずかに届いていない。

---

## STEP5: leave-one-horse-out（拡張データ、全15頭）

`scale=3.0`のmedian（baseline=103.85）を基準に、各馬を除外した際の変化幅を測定した。

| 除外した馬 | shift幅 |
|---|---|
| **houohbiscuits** | **0.88** |
| 2018104638 | 0.15 |
| 2019105556 | 0.15 |
| 2021105541 | 0.15 |
| 2021106787 | 0.15 |
| arata | 0.15 |
| zendanhayabusa | 0.15 |
| onyankopon | 0.15 |

**houohbiscuitsの影響は今回もなお他馬より明確に大きい**（0.88 vs 他馬0.15、
約6倍）が、CHECKPOINT11.6時点（houohbiscuits以外の除外はほぼ影響ゼロだった）と
比較すると、**houohbiscuits以外の馬の影響がより均等に分散**するようになった
（今回は15頭中8頭で確認したが、いずれも0.15前後で横並び）。

**scale候補の順位安定性**: leave-one-horse-outの各シナリオ（6件確認）で、
`scale=2.5 > 3.0 > 3.5 > 4.0`（percentが高い順）という順位は**一度も逆転しなかった**。

---

## STEP7〜8: 特定馬依存・scale3.0 vs 3.5 vs 4.0の差

**houohbiscuitsへの依存は縮小したが解消はしていない。** 18グループ中2グループ
（11%）を占め、shift幅が他馬の約6倍という点は今回も変わらない。ただし
CHECKPOINT11.6時点の「houohbiscuits以外はほぼ無風」という状態からは明確に改善し、
他13頭が小さいながらも一様に変動へ寄与する構造になった。

**scale=3.0 vs 3.5 vs 4.0の差**: 全グループ(n=18)のmedianで見ると
103.9（3.0）→103.5（3.5）→103.2（4.0）と、隣接scale間の差は0.3〜0.4pt程度に
とどまる。この差はn=18程度のサンプルで統計的に確定的に判別できる大きさとは
言い難く、**CHECKPOINT11.6と同じ結論を維持せざるを得ない**：STEP9の
タイブレークルール（同等ならより保守的な値を優先）を機械的に適用すると、
データはむしろscale=3.5〜4.0を支持する。

---

## STEP9: 保守的scaleを優先した場合の推奨・A判定条件の適用

| A判定条件 | 評価 |
|---|---|
| 特定1頭への依存が小さい | **未達**（houohbiscuitsの影響が他馬の約6倍） |
| positive/negative双方で検証できる | **改善したが未達**（negative n=4、目標5に届かず） |
| scale候補順位が安定する | **達成**（leave-one-horse-outで順位逆転なし） |
| 「なぜそのscaleなのか」を実データで説明できる | **未達**（3.0固有の優位性を示す根拠なし。タイブレークルールはむしろ3.5〜4.0を支持） |
| 能力9割の思想を壊さない | 達成（effAbility参考値は66.6〜73.5の範囲に終始） |
| 過補正しない | 達成（±5%・±10%とも全scale・positive/negative両側で0件） |

6条件中4条件は達成、2条件（特定馬依存・「なぜこのscaleか」の説明可能性）が
未達。**A判定の6条件は「すべて満たすこと」が前提であり、一部未達がある以上、
無理にA判定にはしない。**

---

## STEP10: scale=3の最終判定

### **B（暫定使用可能）を維持。CではなくAでもない。**

- 過補正防止・順位安定性・「能力9割」整合性はデータ拡張後も一貫して満たされており、
  **現行の暫定値として使い続けることに実害は無い**（`GATE_HORSE_EVIDENCE_SCALE=3`は
  変更しない）。
- ただし、3.0という特定の値を隣接候補（2.5・3.5）より積極的に選ぶ実データ上の
  根拠は今回も得られなかった。むしろタイブレークルールは3.5〜4.0寄りを支持する。
- houohbiscuits依存は縮小したが解消していない。negative側データもn=4と、
  目標のn≥5にわずかに届いていない。

**C（再設計必要）でもない**——式・amplitude・優先順位に問題は無く、安全基準は
すべて満たされている。不足しているのは、依然としてscaleを精密に確定するための
「もう一段」の実データのみである。

---

## 追加ZIPが必要な場合の仕様（今回の不足を埋めるため）

**新規データの推測・作成は行わない。** CHECKPOINT11.7の目標（negative最低5頭、
neutral複数）にあと僅かに届かないため、以下の仕様のZIPがあれば次回の校正で
埋められる。

- **対象**: 同一馬が同一racecourse×surface×distanceへ**2回以上出走した実績**を
  持つ馬（この条件を満たさない馬は今回の集計対象にならないため、必須の前提条件）。
- **優先して欲しい馬**:
  - **negative側**（同条件再訪問時にraceScoreが自身のabilityBeforeRaceを
    明確に下回った馬）を最低1〜2頭追加し、negative合計を5頭以上にする。
  - **neutral側**（rawPerformanceDeltaが±1.0程度に収まる馬）を複数追加する。
  - houohbiscuits以外の馬を優先する（特定馬依存をさらに薄めるため）。
- **結果を見て選ばない**: 事前にdeltaの符号・大きさを予測して選定するのではなく、
  「同条件へ複数回出走した」という機械的条件だけで選定すること（CHECKPOINT10.13で
  既に確立した「結果ベースで候補を選ばない」原則を踏襲）。
- **必須列**: `raceId, horseId, horseName, raceDate, racecourse, surface,
  distance, going, finishPosition, timeGapSeconds（またはtimeGap）,
  actualRaceTimeSeconds（またはraceTimeSeconds）, final3FSeconds,
  carriedWeight（またはcarriedWeightKg）`。既存の`buildImportResult()`が
  受け付ける入力形式と同一（列名の表記ゆれは機械的リネームで対応可能）。
- **各馬最低3〜5走**（直近5走の窓内でabilityBeforeRaceが算出できるよう、
  対象走の前に最低1走以上の履歴が必要）。

---

## STEP11: gate HorseEvidence percent式の最終候補

A判定に至らなかったため、正式候補としての確定は今回も見送る。
`percent = 100 + 5 × tanh(aggregatedDelta / 3)`を暫定のまま維持する。

---

## 変更禁止・限定自動修正ループの適用状況

今回、コード変更は一切行っていない（読み取り専用の検証スクリプト3件を実行し、
報告後にすべて削除した）。型エラー・lint・build・testエラーは発生しなかったため、
限定自動修正ループの発動も無かった。scale・amplitude・aggregation・confidence閾値・
CoursePrior方針・Suitability統合式・HorseEvidence V1定義のいずれも変更していない。

`raceScore`・`baseAbility`・`memberLevel`・`timeGapScore`・`raceTimeScore`・
`final3FScore`・`weightScore`・HorseEvidence V1正式仕様・`distanceSuitability.ts`・
`courseSuitability.ts`・`goingSuitability.ts`・`finalRaceAbility.ts`・
`RaceContext`・`trackBias`はいずれも無変更。Suitability全体統合・
`effectiveAbility`本番接続にも進んでいない。

---

## 完了報告（21項目に対応）

1. **使用馬数**: 15頭（グループ数18、40ファイル全走査、新規データ作成なし）。
2. **positive/negative/neutral件数**: positive 13グループ・11頭、negative
   4グループ・4頭、neutral 1グループ・1頭。
3. **各scale比較**: scale=2.5/3.0/3.5/4.0いずれも<90・<95・>105・>110は0/18
   （表参照）。
4. **LOHO結果**: houohbiscuits除外時のみshift=0.88、他馬除外は0.15前後で横並び。
   scale候補順位（2.5>3.0>3.5>4.0）は全シナリオで安定。
5. **特定馬依存**: houohbiscuitsへの依存は縮小したが解消せず（他馬の約6倍の影響）。
6. **最終推奨scale**: **3.0を暫定のまま維持**（積極的な確定はしない）。
   タイブレークルール適用ではむしろ3.5〜4.0が支持される。
7. **A/B/C判定**: **B（暫定使用可能）を維持**。
8. **追加ZIPが必要な場合の必要データ仕様**: 上記「追加ZIPが必要な場合の仕様」参照
   （negative最低1〜2頭・neutral複数、既存importパイプライン形式）。
9. **Base Abilityへの影響0確認**: Ability Model V1ファイル群は今回無変更
   （読み取り専用検証のみ）。
10. **baseAbility=70.3再現確認**: `abilityModelV1.regression.test.ts`で確認、
    変化なし。
11. **test/lint/build/validate:data**: 下記参照。
12. **変更ファイル一覧**: `docs/gate-horse-evidence-scale-calibration-v2.md`
    （新規、本ドキュメント）のみ。検証用の3スクリプトはすべて報告後に削除済み
    （コミットしない）。
13. **technical debt**（更新）:
    1. houohbiscuits依存は縮小したが未解消（他馬比約6倍の影響）。
    2. negative側n=4、目標のn≥5に僅かに届かず。
    3. neutral側n=1、「複数」の目標に届かず。
    4. n=18でも隣接scale候補（2.5/3.0/3.5/4.0）間の差（0.3〜0.4pt）を
       統計的に確定判別するには依然として不十分。
14. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. 上記ZIP仕様に基づく追加データの提供可否（negative・neutral側の補強）。
    2. これ以上の実データ拡張を追わず、scale=3を「暫定・恒久」として運用しつつ
       confidence閾値統一（CHECKPOINT11.5 STEP7案A）へ先に進むかの判断。
    3. houohbiscuits型（強い正のcondition-repeat delta）の扱いを、外れ値として
       特別視するか、正当な実データとしてそのまま扱い続けるかの方針確認。

## test/lint/build/validate:data

コード変更を行っていないため回帰確認のみ実施:

```
npm test              # 524/524成功（zzz_検証3件は実行・報告後に削除済み）
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

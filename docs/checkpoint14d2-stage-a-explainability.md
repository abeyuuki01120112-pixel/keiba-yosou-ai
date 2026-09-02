# CHECKPOINT 14D.2 — Stage A Explainability / Freeze Readiness

> **【正誤表・2026-08-30追記】** 6節「ゾロアストロ」カードの「プラス要因: course
> （n=1,+微増）」および説明文「新潟での1走実績...によりcourse適性がわずかに
> プラス（99.6%）」は**誤り。** 実コード出力は`adjustedPercent=99.6%`であり、
> これは中立100%を**下回る値（マイナス）**である。正しくは「distance・course
> 両方がマイナスのネットマイナス補正（overallSuitabilityPercent=99.4%）」。
> 詳細な訂正・再分析は`docs/2026-niigata-kinen-prediction-error-analysis.md`
> 2-2節を参照。本文（以下）は当時の記録としてそのまま残す。

2026新潟記念のGate追加研究（30レース拡張・Historical Ability Support）は
一旦DEFER。本ラウンドは**既存のProvisional Stage Aを一切変更せず**、
production codeを実際に実行して11頭全馬の点数・順位を完全にトレース・説明
可能にすることだけを目的とする。**Stage Aの数値・順位は本ラウンドで一切
変更していない。** Gate研究再開・Stage B計算・Weather/Track Bias・Odds/EV/
BET・Umapro・本格UI実装のいずれも行っていない。

**再確認: Stage A = Base Ability × Suitability（新潟芝2000mで能力を発揮
できるか）の純粋な事前能力比較。当日天気・馬場状態・風・Track Bias・オッズ・
人気・馬体重は一切含まない。**

---

## 1. Stage A Definition

Stage Aは「現在分かっている静的条件下で、オッズや当日の馬場を見ずに、
新潟芝2000mを走らせた場合の事前能力比較」である。**Stage A 1位＝買う馬では
ない。** Stage A・Stage Bの境界は16節で明文化する。

---

## 2. Calculation Path Audit（実コード追跡）

`src/ability/predictionSnapshot.ts`の`buildHorseSnapshotEntry()`を実行時の
本番コードとして直接呼び出し（推測・再実装は一切せず、既存の凍結関数を
そのまま使用）、11頭全馬について以下の式を実データで再現した:

```
1. priorRaces = getHorseRecentRaces(horseId)
                  .filter(raceDate < predictionCutoffAt)  // future leakage防止
                  → excludeNonRealData()                   // dataKind=real以外を除外
2. baseAbility = calculateBaseAbility(priorRaces)          // Ability Model V1、凍結
3. suitability = computeSuitabilityV1({horseId, recentRaces: priorRaces,
                   target: {racecourse:"新潟", surface:"turf", distance:2000,
                            going: GOING_UNKNOWN_SENTINEL},  // 馬場未確定→常にsentinel
                   gate: {horseNumber, fieldSize:11, frame}})
4. effectiveAbility = roundToOneDecimal(baseAbility × suitability.overallSuitabilityPercent / 100)
5. rankByEffectiveAbility = computeDescendingRanks(全11頭のeffectiveAbility)
```

`predictionCutoffAt = "2026-08-28T03:03:03.357Z"`（実際の永続化済みSnapshotと
完全同一の値）で再実行した結果、**11頭全馬のbaseAbility・effectiveAbility・
rankByEffectiveAbilityが、永続化済みSnapshot（`src/ability/data/predictionSnapshots/
JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z.json`）の値と
完全一致することを確認した。** これにより、11頭全馬のStage A Scoreが
「おそらく」ではなく実コード・実データのみから再現可能であることを実証した。

---

## 3. Base Ability Board

| horseName | horseId | baseAbility | baseAbilityEvidenceCount | baseAbilityConfidence | shortCareer | memberLevelEvidenceStatus |
|---|---|---|---|---|---|---|
| ダノンシーマ | 2022104645 | 78.3 | 5 | high | false | available |
| ロデオドライブ | 2023107166 | 76.7 | 4 | medium | **true** | structural_no_prior_history |
| ゾロアストロ | 2023106850 | 74.8 | 5 | high | false | available |
| バレエマスター | 2019104850 | 72.4 | 5 | high | false | available |
| ジュンブロッサム | 2019105118 | 72.7 | 5 | high | false | available |
| ボーンディスウェイ | 2019104658 | 73.1 | 5 | high | false | available |
| アーバンシック | 2021105436 | 72.1 | 5 | high | false | available |
| サヴォーナ | 2020100734 | 70.2 | 5 | high | false | available |
| ドゥレッツァ | 2020103650 | 67.4 | 5 | high | false | available |
| チェルヴィニア | 2021105643 | 69.1 | 5 | high | false | available |
| ステレンボッシュ | 2021105743 | 69.4 | 5 | high | false | available |

**ロデオドライブのみshortCareer=true（4走のみ、キャリア全体を把握済みの
短キャリア馬として扱う——baseAbility数値自体は減点していない）かつ
memberLevelEvidenceStatus=structural_no_prior_history**（使用した過去走の
うち1走が対戦馬全員キャリア初戦だったため、memberLevelがフォールバック値。
データ欠損ではなく構造的にevidenceが存在しないケース）。他10頭は全て
5走・historyConfidence=high・memberLevel evidence=available。

**重要: この表はbaseAbility単体の説明であり、Stage A Score（=baseAbility×
Suitability）そのものではない。** 4節・5節でSuitabilityを分離して示す。

---

## 4. Suitability Board（4component、実データのみ）

Suitability V1が実装しているcomponentは**distance・course・going・gateの
4つのみ**。枠・雨・風・脚質・直線長・左回り外回り等の新規componentは
一切存在しない（5節で個別にNOT_EVALUATEDと明記）。

| horseName | distance | course | going | gate | overall% | evaluated数 | overallConfidence |
|---|---|---|---|---|---|---|---|
| ダノンシーマ | 101.9%(medium,n=4) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 101.9 | 1/4 | medium |
| ロデオドライブ | 100%(medium,n=4) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 100 | 1/4 | medium |
| ゾロアストロ | 99.2%(high,n=5) | 99.6%(low,n=1) | NOT_EVALUATED | NOT_EVALUATED | 99.4 | 2/4 | low |
| バレエマスター | 101.8%(high,n=5) | 102%(low,n=1) | NOT_EVALUATED | 101.4%(low,n=1) | 101.7 | 3/4 | low |
| ジュンブロッサム | 100.4%(high,n=5) | 100.7%(low,n=1) | NOT_EVALUATED | NOT_EVALUATED | 100.6 | 2/4 | low |
| ボーンディスウェイ | 99.9%(medium,n=4) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 99.9 | 1/4 | medium |
| アーバンシック | 100.1%(high,n=5) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 100.1 | 1/4 | high |
| サヴォーナ | 99.6%(high,n=5) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 99.6 | 1/4 | high |
| ドゥレッツァ | 103.7%(medium,n=4) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 103.7 | 1/4 | medium |
| チェルヴィニア | 100.9%(high,n=5) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 100.9 | 1/4 | high |
| ステレンボッシュ | 98.3%(high,n=5) | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | 98.3 | 1/4 | high |

**going componentは11頭全馬でNOT_EVALUATED。** 理由: 2026新潟記念の当日
馬場状態が未確定のため、target.going=`GOING_UNKNOWN_SENTINEL`という
実在のJRA馬場表記と衝突しない特殊値が使われ、`goingSuitability.ts`の
`GOING_ORDER=["良","稍重","重","不良"]`のいずれとも一致せずweight=0に構造的に
帰着する（推測で「良」等を補完していない、CLAUDE.md絶対原則5準拠）。

**course・gateがevaluated=trueなのはバレエマスター（新潟実績1走、かつその
1走がracecourse×surface×distance完全一致=2000m turfのためgateも評価）と
ゾロアストロ・ジュンブロッサム（新潟実績1走はあるがdistance不一致のため
courseのみ評価、gateはNOT_EVALUATED）のみ。** 残り8頭は新潟での実績が直近
5走に無いため、course/gateともにNOT_EVALUATED。

**【reason文字列の既知の注意点】** 一部horseのcomponent.reason文字列
（例: ドゥレッツァのdistance）には、`suitabilityV1.ts`の設計上（109〜133行の
コメントに明記済み）、系統A自身の3段階confidence（`baseConfidenceFromSampleCount`）
で計算された「元の」adjustedPercent・confidence表現がそのまま残っており、
Suitability V1が実際に採用する4段階confidence（`resolveHorseEvidenceConfidence`）
再計算後のadjustedPercent・confidenceと数値が一致しない場合がある
（例: ドゥレッツァのdistance reasonは「adjusted=106.2%」「confidence(high)」と
書かれているが、実際にStage Aで使われる値はadjustedPercent=103.7%・
confidence=mediumである）。**これはバグではなく、コード自身のコメントに
明記された既知の設計上の分離**（系統Aの`component.adjusted`はテスト・内部計算用、
V1の`adjustedPercent`がStage Aの正式採用値）。本レポート・Explainability
Data Contractでは、reason文字列を鵜呑みにせず、常に authoritative field
（`adjustedPercent`/`confidence`）を主として使用した。

---

## 5. Stage A Explainability Board

| Rank | Horse | Stage A | Base Ability | Suitability | Confidence | 主要プラス | 主要マイナス | 未評価項目 |
|---|---|---|---|---|---|---|---|---|
| 1 | ダノンシーマ | 80 | 78.3 | 101.9% | medium | distance(n=4,+1.9%) | なし | course/going/gate |
| 2 | ロデオドライブ | 77 | 76.7 | 100% | medium | なし（中立） | なし | course/going/gate |
| 3 | ゾロアストロ | 74 | 74.8 | 99.4% | low | course(n=1,+微増) | distance(n=5,-0.8%) | going/gate |
| 4 | バレエマスター | 74 | 72.4 | 101.7% | low | distance/course/gate全てプラス | なし | going |
| 5 | ジュンブロッサム | 73 | 72.7 | 100.6% | low | distance/course共にプラス | なし | going/gate |
| 6 | ボーンディスウェイ | 73 | 73.1 | 99.9% | medium | なし（ほぼ中立） | distance(n=4,-0.1%) | course/going/gate |
| 7 | アーバンシック | 72 | 72.1 | 100.1% | high | distance(n=5,+微増) | なし | course/going/gate |
| 8 | サヴォーナ | 70 | 70.2 | 99.6% | high | なし | distance(n=5,-0.4%) | course/going/gate |
| 9 | ドゥレッツァ | 70 | 67.4 | 103.7% | medium | distance(n=4,+3.7%、11頭中最大の押し上げ) | なし | course/going/gate |
| 10 | チェルヴィニア | 70 | 69.1 | 100.9% | high | distance(n=5,+0.9%) | なし | course/going/gate |
| 11 | ステレンボッシュ | 68 | 69.4 | 98.3% | high | なし | distance(n=5,-1.7%、11頭中最大の押し下げ) | course/going/gate |

---

## 6. 11頭 Explainability Card

### 馬名：ダノンシーマ
**Stage A Score：80（内部値79.8）　Stage A順位：1位**
**Base Ability：78.3（evidence5走、confidence=high）**
**Suitability：101.9%（distanceのみ評価、n=4、confidence=medium）**

プラス要因：
- 直近5走で3勝（白富士S・比叡S・兵庫特別）を含む高いraceScore平均がbaseAbility=78.3（11頭中1位）に直結
- 距離2000mに近い4走の重み付き平均がbaseAbility全体平均を上回り、distance適性+1.9%

マイナス要因：
- 特になし

未評価：
- course（新潟実績なし）・going（馬場未確定）・gate（新潟実績なし）

Confidence：medium（distance component、n=4のためHorseEvidence 4段階基準でmedium）

なぜこの順位なのか：baseAbilityが11頭中最高（78.3）であることに加え、
直近成績が2000m前後の距離に偏っていたためdistance適性もプラス評価となり、
両方の要因が同方向に働いた結果、Stage A Score=79.8（表示80）で圧倒的1位。

---

### 馬名：ロデオドライブ
**Stage A Score：77（内部値76.7）　Stage A順位：2位**
**Base Ability：76.7（evidence4走、confidence=medium、shortCareer=true）**
**Suitability：100%（distanceのみ評価、n=4、confidence=medium）**

プラス要因：
- 4戦4連対（1着3回・2着1回）のキャリア実績がbaseAbility=76.7（11頭中2位）に直結

マイナス要因：
- 特になし（distance適性は中立、加点も減点もされていない）

未評価：
- course（新潟実績なし）・going（馬場未確定）・gate（新潟実績なし）

Confidence：medium

なぜこの順位なのか：4戦全て1600m戦のため、Suitabilityは新潟芝2000mへの
補正材料をほぼ持たない（distance重み付き平均が全体平均と一致し中立100%）。
純粋にbaseAbilityの高さだけでStage A Score=76.7（表示77）となり2位。

---

### 馬名：ゾロアストロ
**Stage A Score：74（内部値74.4）　Stage A順位：3位**
**Base Ability：74.8（evidence5走、confidence=high）**
**Suitability：99.4%（distance+course評価、n=5/n=1、confidence=low）**

プラス要因：
- 新潟での1走実績（2025-07-27新潟2歳未勝利）によりcourse適性がわずかにプラス（99.6%）

マイナス要因：
- distance重み付き平均が全体平均をわずかに下回り-0.8%（confidence=high、5サンプル）

未評価：
- going（馬場未確定）・gate（新潟実績はあるが距離1800mのため不一致）

Confidence：low（course componentがn=1のため弱いエビデンス、weakest-linkで全体もlow）

なぜこの順位なのか：baseAbility=74.8は11頭中3位で、Suitabilityはdistance
のマイナスとcourseのプラスがほぼ相殺してoverall99.4%とほぼ中立。結果として
baseAbilityの順位がそのままStage A順位に反映され3位。

---

### 馬名：バレエマスター
**Stage A Score：74（内部値73.6）　Stage A順位：4位**
**Base Ability：72.4（evidence5走、confidence=high）**
**Suitability：101.7%（distance+course+gate評価、11頭中最多の3component、confidence=low）**

プラス要因：
- 2026新潟大賞典（新潟・turf・2000m、完全一致）出走実績（2着、raceScore=77.3）が、
  distance（+1.8%）・course（+2%）・gate（+1.4%）の3つを同時にプラス評価させた
  ——11頭中唯一、新潟芝2000mでの実走実績を持つ馬

マイナス要因：
- 特になし

未評価：
- going（馬場未確定）のみ

Confidence：low（course/gate各component n=1のため弱いエビデンス）

なぜこの順位なのか：baseAbility自体は11頭中6位（72.4）とやや低いが、
対象条件（新潟芝2000m）にドンピシャの実走実績を持つのがこの馬だけという
事実が、11頭中最多の3component評価とプラス補正の連続を生み、baseAbility
順位を2つ上回る4位まで押し上げた。

---

### 馬名：ジュンブロッサム
**Stage A Score：73（内部値73.1）　Stage A順位：5位**
**Base Ability：72.7（evidence5走、confidence=high）**
**Suitability：100.6%（distance+course評価、confidence=low）**

プラス要因：
- 2026-08-08関越ステークス（新潟・turf・1800m）実績によりcourse適性がプラス（100.7%）
  ——distanceは1800mで2000mと不一致のためgateは評価対象外

マイナス要因：
- 特になし

未評価：
- going（馬場未確定）・gate（新潟実績はあるが距離1800mのため不一致）

Confidence：low（course componentがn=1）

なぜこの順位なのか：baseAbilityでは73.1のボーンディスウェイに0.4点差で
劣るが（11頭中5位）、新潟実績によるcourse適性プラスがボーンディスウェイの
持たないアドバンテージとなり、Stage A Scoreで0.1点差の逆転（73.1 vs
73.0）が生じ、5位となった。

---

### 馬名：ボーンディスウェイ
**Stage A：73（内部値73.0）　順位：6位**
Base Ability：73.1（baseAbilityEvidenceCount=5走、confidence=high。ただし
distance component自体のsampleCountは4——重み付き平均の対象から外れた
走が1つある） /
Suitability：99.9%（distanceのみ、n=4、confidence=medium）

プラス要因：なし　マイナス要因：distance-0.1%（ごく僅か）
未評価：course/going/gate（新潟実績なし）
Confidence：medium
なぜこの順位か：baseAbility自体は11頭中4位（73.1）とやや高いが、
Suitabilityの補正材料が無く（新潟実績なし）ほぼそのままの数値が
Stage A Scoreとなり、新潟実績を持つジュンブロッサムに0.1点差で
逆転され6位となった。

---

### 馬名：アーバンシック
**Stage A：72（内部値72.2）　順位：7位**
Base Ability：72.1（evidence5走、confidence=high） /
Suitability：100.1%（distanceのみ、n=5、confidence=high）

プラス要因：distance+0.1%（ごく僅か）　マイナス要因：なし
未評価：course/going/gate（新潟実績なし）
Confidence：high（5サンプル、weakest-linkでも高信頼度）
なぜこの順位か：baseAbility・Suitability双方ともほぼ中立で、
11頭中7位のbaseAbility順位がそのままStage A順位となった。

---

### 馬名：サヴォーナ
**Stage A：70（内部値69.9）　順位：8位（ドゥレッツァとfull precisionで同値、11節参照）**
Base Ability：70.2（evidence5走、confidence=high） /
Suitability：99.6%（distanceのみ、n=5、confidence=high）

プラス要因：なし　マイナス要因：distance-0.4%（5サンプルの高信頼度評価）
未評価：course/going/gate（新潟実績なし）
Confidence：high
なぜこの順位か：baseAbility=70.2に、5走の高信頼度評価に基づく僅かな
マイナス補正が乗り、Stage A Score=69.9。ドゥレッツァと内部値で完全同値。

---

### 馬名：ドゥレッツァ
**Stage A：70（内部値69.9）　順位：9位（サヴォーナとfull precisionで同値、11節参照）**
Base Ability：67.4（11頭中最下位） /
Suitability：103.7%（distanceのみ、n=4、confidence=medium、11頭中最大のプラス補正）

プラス要因：distance+3.7%（11頭中最大）——2000mに近い4走
（宝塚記念9着・ジャパンC2着・金鯱賞2着等）の重み付き平均（71.6）が、
3200m天皇賞(春)15着という大敗（raceScore=48.8）を含む全体平均（67.4）を
大きく上回った
マイナス要因：baseAbility自体は11頭中最下位
未評価：course/going/gate（新潟実績なし）
Confidence：medium
なぜこの順位か：baseAbilityは11頭最下位だが、対象距離（2000m前後）に
限定すると実力はむしろ平均以上であることをdistance適性が明確に示し、
11頭中最大のプラス補正（+3.7%）でbaseAbility最下位から中位（9位、
サヴォーナと同値）まで押し上げられた。

---

### 馬名：チェルヴィニア
**Stage A：70（内部値69.7）　順位：10位**
Base Ability：69.1（evidence5走、confidence=high） /
Suitability：100.9%（distanceのみ、n=5、confidence=high）

プラス要因：distance+0.9%　マイナス要因：なし
未評価：course/going/gate（新潟実績なし）
Confidence：high
なぜこの順位か：baseAbilityは11頭中10位で、Suitabilityのプラス補正
（+0.9%）を加えても、サヴォーナ・ドゥレッツァ（共に69.9）には0.2点届かず、
表示上は同じ「70」だが内部順位では10位。

---

### 馬名：ステレンボッシュ（9節で別途詳細監査）
**Stage A：68（内部値68.2）　順位：11位（最下位）**
Base Ability：69.4（11頭中9位、能力自体は中位） /
Suitability：98.3%（distanceのみ、n=5、confidence=high、11頭中最大のマイナス補正）

プラス要因：なし
マイナス要因：distance-1.7%（11頭中最大のマイナス、5サンプルの高信頼度評価）
未評価：course/going/gate（新潟実績なし）
Confidence：high
なぜこの順位か：9節で詳述。

---

## 7. Top 5 Deep Dive

**なぜダノンシーマが80で1位なのか**: 直近5走の平均raceScore（78.3）が
11頭中最高。3勝（白富士S1着・比叡S1着・兵庫特別1着）を含む安定した高水準の
成績がbaseAbilityに直結し、さらに距離2000m前後の4走の重み付き平均が
全体平均を上回ったためdistance適性も+1.9%とプラス評価。能力・適性どちらも
トップクラスという二重の優位性が80という圧倒的スコアを生んだ。

**なぜロデオドライブが77なのか**: 4戦4連対（うち1着3回）というキャリア
実績がbaseAbility=76.7という高い値を生んだ。ただし全戦1600m戦のため
Suitabilityの補正材料が乏しく（distance中立100%）、能力の高さのみで
Stage A Scoreがほぼそのまま決まった。ダノンシーマとの1.5点差（80 vs 77）は、
Suitabilityの押し上げ（+1.9% vs 0%）の有無がそのまま反映されている。

**なぜゾロアストロとバレエマスターが同じ74なのか**: **内部値では74.4 vs
73.6と0.8点の実差があり、真の同点ではない（表示の整数丸めが偶然一致した
だけ）。** ゾロアストロはbaseAbility自体が高い（74.8、バレエマスターより
2.4点高い）ことが優位の源泉。バレエマスターはbaseAbilityでは劣るが、
新潟芝2000m実走実績（唯一の該当馬）による3component同時プラス評価
（distance/course/gate）でSuitability=101.7%まで押し上げ、baseAbilityの
差を大きく縮めた（が逆転はしていない）。

**なぜジュンブロッサムが73なのか**: baseAbility=72.7は11頭中5位だが、
新潟実績（2026関越ステークス、1800m）によるcourse適性プラス（+0.7%）が、
新潟実績を持たないボーンディスウェイ（baseAbility=73.1、6位）を0.1点差で
逆転する決め手となった。距離が2000mと一致しないためgateは評価対象外
（courseのみプラス）という点で、バレエマスター（distance/course/gate全て
プラス）とは適性評価の厚みが異なる。

---

## 8. Adjacent Rank Comparison

**1位 vs 2位（ダノンシーマ80 vs ロデオドライブ77）**: baseAbility差
78.3-76.7=1.6点。加えてダノンシーマのみdistance適性+1.9%のプラス補正あり
（ロデオドライブは中立0%）。能力差とSuitability補正差が同方向に重なり、
内部値で3.1点差（79.8 vs 76.7）に拡大した。

**3位 vs 4位（ゾロアストロ74 vs バレエマスター74）**: baseAbility差
74.8-72.4=+2.4点でゾロアストロ優位。Suitability差は99.4%対101.7%で
-2.3ポイント分バレエマスターが有利——ほぼ相殺し合うが完全には逆転せず、
最終的にゾロアストロが0.8点差（74.4 vs 73.6）で上回る。差を決めたのは
「baseAbilityの絶対差」対「新潟実績による複数component同時プラス」の
綱引き。

**5位 vs 6位（ジュンブロッサム73 vs ボーンディスウェイ73）**: baseAbility
差は72.7 vs 73.1でボーンディスウェイが+0.4点優位。しかしジュンブロッサムの
course適性プラス（+0.7%相当）がこれを上回り、0.1点差（73.1 vs 73.0）で
逆転した。数値上は僅差だが、決め手は「新潟実績の有無」という単一要因。

**8〜10位（サヴォーナ70・ドゥレッツァ70・チェルヴィニア70）**: 3頭とも
表示上は同じ70だが、内部値はサヴォーナ69.9・ドゥレッツァ69.9・
チェルヴィニア69.7で、後者2頭は真の同点ではない（11節参照）。
サヴォーナとドゥレッツァはbaseAbilityで2.8点差（70.2 vs 67.4）があるが、
ドゥレッツァのdistance適性+3.7%（11頭中最大の補正）がこの差をほぼ完全に
埋め、full precisionで完全同値に到達した。チェルヴィニアはbaseAbility
69.1・distance+0.9%で、両者に僅かに届かず69.7で最も近いが別順位。

---

## 9. ステレンボッシュ監査

**Stage A Score = 68（内部値68.2）、11位（最下位）。**

| 項目 | 値 |
|---|---|
| baseAbility | 69.4（11頭中9位、能力自体は中位） |
| baseAbilityEvidenceCount | 5走 |
| historyConfidence | **high** |
| shortCareer | false |
| memberLevelEvidenceStatus | available |
| distance component evaluated | **true** |
| distance sampleCount | **5**（欠損なし） |
| distance confidence | **high** |
| distance adjustedPercent | 98.3%（11頭中最大のマイナス補正） |
| course/going/gate | NOT_EVALUATED（新潟実績なし） |
| overallConfidence | high |

**知名度・G1実績・一般的評価による補正は一切行っていない。** 68という
数値は、以下の実データ2要素の掛け算のみから機械的に導かれている:

1. baseAbility=69.4（直近5走の均等平均: 安田記念10着68.1／エプソムC2着
   76.8／中山牝馬S7着71.6／エリザベス女王杯10着71.2／札幌記念15着59.2）。
   最低値は札幌記念15着の59.2で、これも含めた5走平均。
2. distance適性=98.3%（distance2000mに最も近い実績——2025-08-17札幌記念
   [2000m turf、15着、raceScore=59.2]——が重み付き平均で最も高い重みを
   持ち、この不振な結果が重み付き平均を全体平均より下に押し下げた）。

**データ欠損や低confidenceが理由ではない。** evidenceCount=5（満数）・
historyConfidence=high・distance component confidence=highと、11頭の中でも
最も充実したエビデンスに基づく評価であり、「証拠不足だから低評価」では
なく「証拠が十分にある上で、対象距離帯（2000m前後）での実績が相対的に
振るわなかった」という、能力評価と証拠量を混同しない形での正当な結果
である。

---

## 10. Confidence Audit

| Horse | overallConfidence | 決定要因（weakest-link） |
|---|---|---|
| ダノンシーマ | medium | distance（n=4） |
| ロデオドライブ | medium | distance（n=4、short career） |
| ゾロアストロ | low | course（n=1） |
| バレエマスター | low | course・gate（各n=1） |
| ジュンブロッサム | low | course（n=1） |
| ボーンディスウェイ | medium | distance（n=4） |
| アーバンシック | high | distance（n=5） |
| サヴォーナ | high | distance（n=5） |
| ドゥレッツァ | medium | distance（n=4） |
| チェルヴィニア | high | distance（n=5） |
| ステレンボッシュ | high | distance（n=5） |

`computeOverallConfidence()`はevaluated=trueのcomponentのみを対象とした
weakest-link方式（`suitabilityV1.ts` 381-388行）。**confidenceはあくまで
「証拠の質」を表し、Stage A Scoreそのものを一切変更・縮小しない**
（13節で再確認）。例えばバレエマスターはconfidence=lowだが、Stage A
Score=74という数値自体は評価済みcomponentの実測値をそのまま使っている
（lowだからといって74を下方修正していない）。

---

## 11. Tie Handling（同点処理）

`computeDescendingRanks()`（`predictionSnapshot.ts` 490-501行）は
`Array.prototype.sort((a,b) => b.v - a.v)`を使用しており、JavaScriptの
`sort`はES2019以降stable（安定ソート）と規定されているため、**値が
完全に同じ場合は元の配列順（=出走馬エントリ順=馬番昇順）が保たれる。**
これは意図して設計されたtie-break規則ではなく、実装上の付随的な挙動
である。

full precision（internal effectiveAbility値）で実際に確認した結果:

| 表示上の同点ペア/グループ | internal値 | 真のTIEDか |
|---|---|---|
| ゾロアストロ74 / バレエマスター74 | 74.4 / 73.6 | **TIEDではない**（0.8点差、表示丸めの偶然） |
| ジュンブロッサム73 / ボーンディスウェイ73 | 73.1 / 73.0 | **TIEDではない**（0.1点差） |
| サヴォーナ70 / ドゥレッツァ70 | 69.9 / 69.9 | **TIED**（full precisionで完全同値） |
| （チェルヴィニア70） | 69.7 | 上記2頭とはTIEDではない（0.2点低い、表示丸めの偶然） |

**正式なtie-break規則はコード上に存在しない。** サヴォーナ（8位）と
ドゥレッツァ（9位）はfull precisionで完全に同じ69.9であり、両者の間の
順位（8位/9位）は「馬番が若い方が先」という配列の安定ソート由来の
副作用であって、能力的な優劣を意味する正式な根拠ではない。**この2頭は
TIEDとして扱う。** 架空の差は付けていない。

---

## 12. Not Evaluated Factors（未評価要因の一覧）

Suitability V1に実装されているcomponentはdistance/course/going/gateの
4つのみ。以下は**Suitability V1に存在しないため、今回もいかなる形でも
点数化・補正していない**要因（発明禁止、5節参照）:

```
枠（frame）そのものの点数化 → NOT_EVALUATED（frameはRaceGateInputとして
  渡されるが、gate componentのHorseEvidence計算では現在の枠番を一切参照
  しない。CoursePrior側は東京ダート1600m限定のため新潟には適用されない。
  結果として今回の枠順はStage A Scoreに一切影響していない——CHECKPOINT
  14D.1の既存監査結果を本ラウンドでも再確認した）
雨・風・当日Track Bias → NOT_EVALUATED（Stage B以降のスコープ）
脚質（先行/差し等） → NOT_EVALUATED（Suitability V1に実装無し）
直線長・左回り/外回り → NOT_EVALUATED（Suitability V1に実装無し）
```

going componentは実装は存在するが、11頭全馬でNOT_EVALUATED（4節参照、
target.goingが未確定のため構造的にevaluated=falseへ帰着）。

---

## 13. Score / Confidence 分離の確認

全11頭について、Stage A Score（表示値）は評価済みcomponentの実測値の
単純平均から機械的に算出されており、confidenceラベル（low/medium/high）
によってその後Scoreを縮小・調整する処理はコード上に存在しない
（`aggregateSuitabilityComponents()`はconfidence非依存、`roundToOneDecimal`
のみ適用）。例:

- バレエマスター: Score=74 / confidence=low（このまま——confidenceが
  低いからといって74を下方修正していない）
- サヴォーナ: Score=70 / confidence=high（このまま）

能力評価（Score）と証拠量（Confidence）は明確に分離されている。

---

## 14. Stage A / Stage B の境界（明文化）

**Stage A に含まれるもの（今回計算済み・凍結）:**
Base Ability V1（直近5走均等平均）、Suitability V1（distance/course/going/
gateの4component、新潟芝2000mという静的条件のみ）。

**Stage B 以降に後から追加する予定の情報（今回は一切計算していない）:**
```
当日天気・実馬場状態・雨量・含水率等（取得可能なら）
風向・風速
当日Track Bias
実際の想定展開・Post-Frame Position
馬体重・直前状態
```

**その後さらに先（Stage B完成後）:**
```
AI勝率・連対率・複勝率の生成
↓
Odds・EV・BET/PASS判断
```

**OddsはStage BのRace Strength順位そのものを作るためには使用しない**
——この境界は今回変更していない。

---

## 15. Explainability Data Contract

次にUIへ接続できるよう、Stage A Explainabilityのmachine-readable contractを
`docs/checkpoint14d2-stage-a-explainability-contract.json`として本ラウンドで
新規作成した（既存計算ロジックは一切変更していない、実測値のみを整形した
出力）。フィールド構成:

```json
{
  "horseId": "2022104645",
  "horseName": "ダノンシーマ",
  "rank": 1,
  "stageAScore": 80,
  "stageAScoreInternal": 79.8,
  "baseAbility": 78.3,
  "suitabilityScore": 101.9,
  "confidence": "medium",
  "positiveFactors": ["距離適性: adjustedPercent=101.9%（sampleCount=4, confidence=medium）"],
  "negativeFactors": [],
  "notEvaluatedFactors": ["コース(新潟)適性（NOT_EVALUATED、...）", "..."],
  "evidenceSummary": "baseAbilityEvidenceCount=5走、historyConfidence=high、...",
  "explanation": "baseAbility=78.3は11頭中1位。..."
}
```

11頭全馬分をこのcontract形式で`docs/checkpoint14d2-stage-a-explainability-contract.json`
に格納した（5節・6節の内容と完全対応、実データのみ）。

---

## 16. Regression

本ラウンドは`docs/`配下2ファイル（本報告書＋Explainability Data Contract
JSON）の新規追加、および監査用の一時スクリプト（削除済み）のみで、
コード・実データ・永続化済みSnapshotは一切変更していない。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Base Ability drift    → 0（2節で完全一致を実証済み）
Suitability drift     → 0
Stage A Score drift   → 0
Stage A Rank drift    → 0
Frozen Benchmark      → 70.3（変更なし）
Provisional Stage A   → 不変（1位ダノンシーマ80〜11位ステレンボッシュ68）
```

---

## 17. 判定

**A-FREEZE-READY**

全11頭のStage A Score・順位が、実際に永続化されたProduction Snapshotと
完全一致する形でproduction codeのみから再現可能であることを2節で実証した。
各馬について:

- baseAbilityの根拠（直近走のraceScore・evidenceCount・confidence・
  shortCareer・memberLevel evidence status）を実データで完全に説明できる
- Suitabilityの4componentそれぞれについて、evaluated true/false・
  rawEvidence（sampleCount）・confidence・fallback有無・Stage Aへの実際の
  影響を実コードの出力からすべて説明できる
- 同点に見えるペア（表示上の整数丸め）とfull precisionでの真の同点
  （TIED、正式tie-break無し）を明確に区別できる
- 最下位ステレンボッシュの理由が、データ欠損・低confidenceではなく
  「証拠が十分にある上での正当な低評価」であることを明示的に確認した

唯一の留保事項は4節末尾で述べた**reason文字列の表現不一致**（系統Aの内部
3段階confidenceに基づく自己記述テキストが、V1の4段階confidenceに基づく
authoritative値と数値的に食い違う場合がある）——ただしこれはコード自身の
コメントで説明済みの既知の設計上の分離であり、authoritative field
（adjustedPercent/confidence）を使う限りScore自体の説明可能性には影響しない。
UI実装時はreason文字列をそのまま表示せず、authoritative fieldから
Explanation文を生成することを推奨する（15節のcontractは既にこの方針で
作成済み）。

---

## 18. 次にChatGPTと決める必要がある項目（優先順位）

1. Formal Stage A Freeze
2. Stage B Input Contract
3. 新潟記念Stage B実行
4. Probability / Simulation
5. Odds / EV / BET-PASS
6. Minimal Prediction UI

STOP。Stage A Score変更・Gate研究再開・Stage B計算・Weather取得・
Track Bias計算・Wind/Rain補正・Odds/EV/BET/Monte Carlo/Probability・
Umapro・本格UI実装のいずれも、次のCHECKPOINTでの明示的な指示を待つ。

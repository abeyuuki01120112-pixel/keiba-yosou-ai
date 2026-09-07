# HorseEvidence V1 最終追加検証データ設計（CHECKPOINT 10.9C）

**作成日: 2026-08-23。ステータス: データ設計のみ。実データ未収集・ロジック未実装。**

[`docs/horse-evidence-v1-small-validation-results.md`](horse-evidence-v1-small-validation-results.md)
（CHECKPOINT10.9B）で残った5つの未解決問題（CASE C・CASE D・confidence=high検証不足・
consistency×confidence組み合わせ検証不足・memberLevel自己参照の影響）だけを解消するための、
次回追加実データZIPの最小仕様を設計する。**本文書は設計のみであり、新しいデータ収集・
ロジック実装・Suitability統合のいずれも行っていない。** 本番コードは今回変更していない。

## STEP1: CHECKPOINT10.9Bまでの結果の再整理

| 対象 | 判定 | 根拠 |
|---|---|---|
| rawPerformanceDelta（計算メカニズム自体） | **A（支持）** | future leakage無し・初回走の安全な除外を2ラウンド（`data/horses/`全体・famous5頭ZIP）で確認 |
| rawPerformanceDeltaの絶対値の信頼性 | **B（暫定支持）** | 自己参照的memberLevelの影響を受けるため、絶対値は要注意（STEP5参照） |
| future leakage | **A（支持）** | 全19+29+186件規模の実データで一度も発生せず |
| neutral閾値 | **B（暫定支持）** | ±0.5〜±1.5でほぼ分類が安定という傾向が2つの独立データセットで再現されたが、正式な閾値決定には未達 |
| aggregation（単純平均vs中央値vs trimmed/winsorized） | **B（暫定支持）** | 「trimmed/winsorizedはn<5では中央値と実質同一」「単純平均は外れ値に弱い」は2ラウンドで再確認。中央値優先の方向性は強まったが正式決定はまだ |
| confidence | **B（暫定支持）** | 設計原則（データ量のみを表す）は実データで支持されたが、high境界はn=1でしか確認できていない |
| consistency | **A（支持、ただし指標は未確定）** | 「符号一致率だけでは大きさの暴れを検出できない」は2ラウンドで確認。加えて「境界値のneutral化が一致率を過大評価させる」という新たな問題も発見（STEP1で使う指標自体はC=未確定） |
| CASE A（入力順序・future leakage） | **A（支持）** | 2ラウンドで確認済み |
| CASE B（abilityBeforeRace比較の安全性） | **A（支持）** | 2ラウンドで確認済み |
| CASE C（成長誤認） | **C（未検証）** | 該当する成長期の馬の実データが一度も無い |
| CASE D（少数サンプルの外れ値耐性） | **D（問題確認）** | ゴールドシップの実例でn=2では中央値も無力、外れ値耐性が無いことを確認 |
| CASE E（符号一致だが振れ幅大） | **D（問題確認）** | キセキの実例で確認、かつ符号一致率算出方法自体の弱点も新たに発見 |

## STEP2: CASE C検証に必要な馬の条件（機械的選定基準）

「結果を見て都合の良い馬を選ぶ」ことを避けるため、選定条件は**対象条件（target condition）の
raceScoreそのものを一切参照せず**、対象条件以外の実績だけから機械的に判定できる形にする。

**機械的抽出条件（すべて満たす馬を対象とする。恣意的な追加選別はしない）**:

1. 対象馬の総レース数が6走以上（対象条件以外のトレンドを判定するのに十分な母数を確保するため）
2. 対象条件（racecourse×surface×distance完全一致）が3走以上ある（HorseEvidence基本要件）
3. 対象条件の初回走が、その馬のキャリア3走目以降に発生している（対象条件に入る「前」の
   実績が最低2走以上存在すること）
4. **対象条件を除いた残りの全走**について、レース順序（時系列インデックス）とraceScoreの
   順位相関（Spearman）を計算し、相関係数が**+0.5以上**の馬を「成長トレンドあり」として
   抽出する。この計算は対象条件のraceScoreを一切使わないため、「対象条件でどう出るか」を
   見てから選ぶことにはならない。

この条件を満たす馬が実データに存在すれば、CASE C（成長を適性と誤認するリスク）を
検証できる。存在するかどうか自体は今回のCHECKPOINTでは確認していない（次回ZIP収集時に
この基準で候補を探す）。

## STEP3: CASE D検証に必要な馬の条件

n=3・n=4・n=5以上を分けて集める（STEP4のconfidence境界検証とn=5以上の部分は重複してよい）。

| ティア | 目的 | 必要頭数目安 |
|---|---|---:|
| n=3 | trimmed/winsorizedが理論上機能しない下限を再確認 | 2頭以上 |
| n=4 | trimmed/winsorized（両端1件ずつ）が辛うじて成立する境界 | 2頭以上 |
| n=5以上 | trimmed/winsorizedが意味を持ち始める最小規模、かつconfidence=high検証と兼用 | 2頭以上 |

**外れ値の機械的検出方法（人間が結果を見て選ばない）**: 各馬の`rawDeltas`に対し、
**中央値からのMAD基準修正Zスコア**を用いる。

```
修正Zスコア(i) = (delta[i] - median(deltas)) / (1.4826 × MAD(deltas))
```

`|修正Zスコア| >= 2`（目安）を「外れ値候補」として機械的にフラグする。**この閾値自体は
今回正式決定しない**（STEP3の指示通り）。この方法の既知の限界: n=2〜3ではMADが0や
極端に小さい値になりやすく、修正Zスコアが不安定・過敏（わずかな差でも「外れ値」と
判定されがち）になる。CHECKPOINT10.9Bのゴールドシップ（n=2, deltas=+5.7,-4.0）で試算すると、
median=0.85, MAD=4.85となり、修正Zスコア=±1.0程度に留まり「外れ値」としては検出されない
（n=2ではMAD自体が両極端な値の影響を強く受け、外れ値検出の感度が実質的に失われるため）。
**この限界自体がCASE Dの核心的な問題**（n=2〜3では統計的な外れ値検出そのものが機能しない）
であり、次回ZIPでn=4以上のデータを増やす動機になっている。

## STEP4: confidence=high検証条件

**現実的な最小頭数として、n>=5（raw sampleCount）の馬を最低3頭、推奨5頭**を提案する。

理由: 統計的に「傾向」と呼べる最低限として3件、ばらつき（高confidenceでもconsistencyが
低い例・高い例の両方を確認できる可能性を上げるため）を見るなら5件が望ましい。理想的な
統計的検出力（例えば10件以上）を要求すると「大規模収集」に該当してしまうため、
今回の目的（V1完成判定の材料集め）としては3〜5件を現実的な下限・上限とする。

**「high confidenceだが不安定」という状態を許容する設計は妥当と判断する。** 理由:
- confidence（データ量）とconsistency（安定性）を完全に分離するという設計原則
  （CHECKPOINT10.6・10.8で確定済み）に照らせば、「データは十分あるが、その中身は
  安定していない」という組み合わせは矛盾ではなく、**むしろ正確な状態表現**である
  （「5走分のデータはある。ただしその5走の結果は一貫していない」という事実を
  正直に表すことがconsistency指標の存在意義そのものである）。
- CHECKPOINT10.9Bのキセキ（sampleCount=4=medium、符号一致率100%だがstdev=3.01）は
  まさに「confidence相応にデータはあるが、consistencyは低め」の実例であり、
  この組み合わせ自体は既に実データで自然に発生している。high帯で同様の組み合わせが
  出ても、設計上・運用上とくに問題は無いと判断する。

## STEP5: memberLevel自己参照問題の監査（コード変更なし）

**確認したい問い（循環参照の有無ではなく、自己強化バイアスの構造の有無）に対して、
数式レベルで検証した。**

対象馬1頭分の行しかない場合、2走目以降のraceScoreは:

```
raceScore(t) = 0.30 × abilityBeforeRace(t) + 0.70 × otherComponents(t)
```

（`otherComponents` = timeGapScore/raceTimeScore/final3FScore/weightScoreの加重和。これら
4つはいずれもcourseTimeBaselines・courseFinal3FBaselines・当日馬体重中央値などの**外部の
絶対基準**から算出されており、abilityBeforeRace・memberLevelScoreAtRace・raceScoreの
いずれも参照しない独立した計算である。この依存関係は`timeGapScore.ts`・`raceTimeScore.ts`・
`final3FScore.ts`・`weightScore.ts`のいずれにも読み取れる。）

abilityBeforeRace(t+1)は、この馬自身の直近最大5走分のraceScoreの平均であるため、
以下の再帰関係が成立する:

```
rawPerformanceDelta(t) = raceScore(t) - abilityBeforeRace(t)
                        = 0.70 × (otherComponents(t) - abilityBeforeRace(t))
```

**実際の依存関係**: abilityBeforeRace(t)はraceScore(t-1..t-5)から作られ、raceScore(t-1)は
さらにabilityBeforeRace(t-1)（30%）とotherComponents(t-1)（70%、外部基準のみ）から
作られる、という時系列の再帰構造になっている。

**直接循環の有無**: 無い。同一レースの`abilityBeforeRace(t)`が`raceScore(t)`自身を
参照することは無く、必ず「そのレースより前」のデータだけを使う（既存のfuture leakage
防止仕様のまま）。

**間接循環の有無**: ある。ただしこれは「対象馬自身の過去の実績から現在の実力を推定する」
という、Ability Model V1の基本設計そのもの（abilityBeforeRaceの定義）であり、
HorseEvidenceが新たに持ち込んだ構造ではない。

**自己強化バイアスの可能性**: 上記の再帰式を手計算で追跡すると、otherComponents(t)が
真の実力Vにほぼ一定して近い値を返す馬を仮定した場合、abilityBeforeRace(t)は世代を
経るごとに真の実力Vへ収束し、rawPerformanceDelta(t)=0.70×(V-AB(t))は**時間とともに
縮小していく**（AB(t)がVに近づくにつれてdeltaが0へ近づく）。これは**増幅（自己強化）
ではなく減衰（自己収束）**の方向であり、CHECKPOINT10.7〜10.9Bで繰り返し観測されてきた
「同条件を繰り返すほどdeltaが小さくなる」現象（シェイクユアハート5.2→3.2、
2021100913の14.4→5.3等）と整合する。otherComponents（70%）が常に外部の絶対基準に
アンカーされているため、AB自体が「事実と無関係に自己言及だけで増幅していく」という
危険な閉ループにはなっていない。

**現状許容可能か**: **許容可能と判断する。** 増幅方向のバイアスは確認されず、
むしろ保守的（過小評価）に働く方向の既知の限界（catch-up効果）として既に記録済み
（`docs/horse-evidence-aggregation-v1-design.md`STEP5・`docs/horse-evidence-v1-small-validation-results.md`）。

**V1で対処が必要か**: 不要と判断する。増幅リスクが無いため、V1の閾値・集約方式の
検討を止める理由にはならない。

**将来課題でよいか**: 良い。将来的な改善余地として、(a) 対象馬1頭分だけでなく相手馬の
実データも収集しmemberLevelScoreAtRaceを非自己参照化する、(b) abilityBeforeRaceの
移動平均窓（現在最大5走）をより長期化・トレンド考慮型にする、の2方向が考えられるが、
いずれも今回のV1確定作業の前提条件ではない。

## STEP6: 次回ZIP最小仕様

### 同一条件の定義（変更なし）

racecourse × surface × distance の完全一致（既存定義のまま。goingは一致条件に含めない）。

### 必要CSVフィールド（CHECKPOINT10.9Aと同一、変更なし）

`raceId,horseId,horseName,raceDate,racecourse,raceNumber,raceName,surface,distance,going,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,gate,horseNumber,fieldSize,source,sourceUrl`
（既存の`normalizeRacePerformance()`とそのまま互換）

**CHECKPOINT10.9Bで判明した改善点を1つ追加で依頼する**: 各対象馬について、対象条件の
初回走よりも前に、その馬自身の他の実績を**最低1〜2走**含めること。前回のZIPは対象条件の
走だけで構成されていたため、各馬の初回走が必ずabilityBeforeRace算出不能（=delta欠損）に
なった（19行中5行が欠損）。対象条件に入る前の実績を1〜2走加えるだけで、この欠損を
大幅に減らせる（大規模なフルキャリア収集は不要）。

### future leakage防止条件（変更なし）

実際の日付（推測・後付けでない）、時系列で処理する（既存パイプラインが自動で行うため
データ提供側での特別な処理は不要）、対象レースの結果に基づいて後から都合よく数値を
調整しないこと。

### 候補馬の機械的選定条件

| 検証目的 | 選定条件 |
|---|---|
| CASE C | STEP2の機械的条件（総走数6+、対象条件3走+、対象条件初回が3走目以降、対象条件以外のraceScore-順序相関+0.5以上） |
| CASE D | 単に n=3/n=4/n=5以上の3ティアが揃うこと（結果の中身による事前選別はしない） |
| confidence=high | raw sampleCount>=5（結果の良し悪しでは選ばない） |

### 頭数・走数（最低ライン／推奨ライン）

| 項目 | 最低ライン | 推奨ライン |
|---|---:|---:|
| CASE C該当馬 | 3頭 | 5頭 |
| CASE D: n=3ティア | 2頭 | 3頭 |
| CASE D: n=4ティア | 2頭 | 3頭 |
| CASE D: n=5以上ティア | 2頭（confidence=high検証と兼用可） | 3頭（同左） |
| confidence=high該当馬（n>=5） | 3頭（上記n=5以上ティアと重複可） | 5頭（同左） |
| **重複を踏まえた合計頭数目安** | **6〜7頭** | **9〜10頭** |
| 1頭あたり最低走数 | 3走 | 3〜5走 |
| **合計最低レース数** | **約20走**（対象条件のみ。前段の1〜2走を含めるとやや増える） | **約30〜35走** |

これはCHECKPOINT10.9Aで確認済みの「8〜10頭×3〜5走、総30〜40走」という規模感を
超えない範囲であり、大規模収集には該当しない。

## STEP7: 次回データ取得後の自動検証計画

次回ZIP到着後、以下をユーザー確認を挟まず自律実行する（既存関数を再利用し、新規実装は
一切行わない）。

1. **ZIP監査**（schema/重複/horseId整合性/README・manifestとの整合、CHECKPOINT10.9Bと同じ手順）
2. **対象馬抽出**（racecourse×surface×distance完全一致でグルーピング）
3. **rawPerformanceDelta再計算**（`buildRaceHistory()`→`calculateAbilityBeforeRace()`を
   読み取り専用で使用。定義変更が必要になった場合は即STOP）
4. **CASE C検証**（STEP2条件に該当する馬について、対象条件のdeltaが実際に正の値へ
   偏っているかを確認。仮に偏っていた場合、それが「成長」由来か「条件適性」由来かを
   対象条件以外のraceScoreトレンドと比較して評価する）
5. **CASE D検証**（STEP3のMAD基準修正Zスコアで外れ値候補を機械抽出し、mean/median/
   trimmed/winsorizedがどう反応するかをn=3/4/5+ティアごとに比較）
6. **neutral閾値再確認**（±0.5〜±2.0、CHECKPOINT10.8・10.9Bと同じ6候補で再比較）
7. **aggregation比較**（同上、trimmed/winsorizedがn=5以上でどこまで意味を持ち始めるか）
8. **confidence/consistency比較**（high帯での「高confidence×低consistency」事例の有無を
   含めて確認）
9. **HorseEvidence V1完成判定候補の提示**（A/B/Cの判定と根拠）
10. **baseAbility=70.3再確認・必須テスト**（`npm test`/`lint`/`build`/`validate:data`）

**正式採用（HorseEvidence V1としての実装・Suitability統合）の直前で必ずSTOPする。**
判定がAであっても、ユーザー・ChatGPTの承認を経てから別ラウンドで実装する。

## 完了報告

**1. 現在HorseEvidence V1は何%程度完成していると判断するか**

**約70%。** rawPerformanceDeltaの計算メカニズム・future leakage防止・neutral閾値の
おおまかな妥当性・aggregation方式の絞り込み（中央値優先）・confidence/consistencyの
概念分離は実データ2ラウンドで裏付けられた。一方、CASE C（未検証）・CASE D（未解決）・
confidence=highの実データ検証不足（n=1のみ）という、V1の「完成」を名乗るには
無視できない3つのギャップが残っている。

**2. 残る最大のリスク3つ**

1. CASE D：少数サンプル（n=2〜3）では外れ値耐性が原理的に存在しない
   （median/trimmed/winsorizedいずれも機能しない）ため、この帯のconfidence
   （low〜medium）でHorseEvidenceを将来利用する際、1回の極端な結果がそのまま
   evidenceDirectionを左右してしまうリスク
2. CASE C：成長中の馬を「この条件が苦手」と誤認するリスクが理論的には指摘されている
   ものの、実データで一度も検証できていない
3. 自己参照的memberLevelの影響が「減衰方向」であることは数式上確認したが、
   実データ（相手馬データ込み）での定量的な検証はまだ行っていない

**3. CASE C検証条件**：STEP2参照（総走数6+、対象条件3走+、対象条件初回が3走目以降、
対象条件を除く実績のraceScore-時系列順位相関が+0.5以上）

**4. CASE D検証条件**：STEP3参照（n=3/4/5+の3ティア、各2〜3頭。外れ値検出はMAD基準
修正Zスコア|score|>=2目安、n=2〜3では検出力が実質失われることを確認済み）

**5. high confidence検証条件**：STEP4参照（raw sampleCount>=5の馬を最低3頭・推奨5頭。
「高confidence×低consistency」の組み合わせは矛盾ではなく許容する設計としている）

**6. memberLevel自己参照監査結果**：直接循環は無し。間接循環（時系列の自己言及）は
Ability Model V1本来の設計として存在するが、otherComponents（70%）が外部絶対基準に
アンカーされているため数式上は自己収束（減衰）方向であり、自己強化的な増幅バイアスは
確認されなかった。V1確定の妨げにはならないと判断し、対処は将来課題とする。

**7. 次回ZIP最低ライン**：6〜7頭・約20走（CASE C用3頭・CASE D各ティア2頭・
confidence=high用3頭、重複込み）

**8. 次回ZIP推奨ライン**：9〜10頭・約30〜35走（同上、各枠を1〜2頭ずつ拡大）

**9. 次回ZIP必須CSV項目**：CHECKPOINT10.9Aと同一の18列（+source/sourceUrl）。
追加依頼: 各馬について対象条件の初回走より前の実績を最低1〜2走含める
（abilityBeforeRace算出不能による欠損を減らすため）

**10. データ到着後に自律実行するチェックポイント**：STEP7の10項目（ZIP監査→対象馬抽出→
delta再計算→CASE C検証→CASE D検証→neutral再確認→aggregation比較→confidence/consistency
比較→V1完成判定候補提示→baseAbility再確認・必須テスト）。正式採用直前で必ずSTOP。

**11. HorseEvidence V1正式確定まであと何回のCHECKPOINTが必要そうか**：
**あと2回程度**を見込む（1回: 次回ZIPでの検証実行・CASE C/D解消の確認、1回: 
neutral閾値・aggregation方式・confidence閾値の正式決定と最終報告）。ただしCASE Cに
該当する実馬が見つからない場合は追加ラウンドが必要になる可能性がある。

**12. 次にChatGPTと決める必要がある項目（優先順位順、最大5件）**

1. 次回ZIP（6〜7頭〜9〜10頭規模）を準備できるか、CASE C該当馬（成長トレンドのある馬）が
   実在データとして見つかるか
2. CASE D（少数サンプルの外れ値耐性欠如）を、V1では「confidence=low/mediumでは
   evidenceDirectionを参考情報に留める」という運用ルールで許容するか、それとも
   別の技術的対処を検討するか
3. 「高confidence×低consistency」を許容する設計方針（STEP4）に異論が無いか
4. 次回ZIPでも見つからなかった場合（CASE C該当馬が実在しない等）、HorseEvidence V1を
   「CASE Cは将来課題として残したまま」確定してよいか
5. memberLevel自己参照問題（STEP5）を将来課題のまま据え置くか、それとも次回以降で
   相手馬データの収集を検討するか

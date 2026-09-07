# HorseEvidence Confidence V1 設計比較（CHECKPOINT 10.5）

**作成日: 2026-08-22。ステータス: 設計比較・Claude推奨案の提示。**

**追記（CHECKPOINT10.6, 2026-08-22）: 本文書STEP8で推奨したB案がユーザー承認により正式採用され、
`src/ability/horseEvidenceConfidence.ts`の`resolveHorseEvidenceConfidence()`として実装済み。
STEP4で列挙した注意項目は[`docs/horse-evidence-confidence-v1-known-issues.md`](horse-evidence-confidence-v1-known-issues.md)
に技術的負債として正式記録した。**

[`docs/ability-model-v1.md`](ability-model-v1.md)（Ability Model V1、凍結済み）とは独立したレイヤー。
[`docs/gate-suitability-v1-decision.md`](gate-suitability-v1-decision.md)（CHECKPOINT10.3）で確定した
「HorseEvidence（優先度1）> CoursePrior（優先度2）> unknown/neutral（優先度3）」という優先順位を
実際に運用するために必要な、「HorseEvidenceをどの程度信用するか」というconfidence設計を検討する。

**本文書はconfidenceのしきい値・補正係数への変換式を正式決定するものではない。** ChatGPTとユーザーの
承認を経て、別ラウンドで実装する。

## STEP1: 既存HorseEvidence collector監査

`src/ability/horseGateEvidence.ts`（CHECKPOINT10.4）の`collectHorseGateEvidence()`が返す
`HorseEvidence`型は、以下をすべて安定して取得できることを確認した（追加実装は不要）。

| 項目 | 取得元 | 定義 |
|---|---|---|
| `sampleCount` | `runs.length` | `targetCondition`（racecourse×surface×distance完全一致）に該当した走数 |
| `factCounts.sameCourseCount` | `HorseEvidenceFactCounts` | racecourseのみ一致（surface/distance不問） |
| `factCounts.sameDistanceCount` | 同上 | distanceのみ一致（racecourse/surface不問） |
| `factCounts.sameSurfaceCount` | 同上 | surfaceのみ一致（racecourse/distance不問） |
| `factCounts.sameCourseDistanceCount` | 同上 | racecourse×distanceが一致（surface不問） |

いずれもCHECKPOINT10.4で既に実装済み。raceScore等のAbility Model V1側には一切触れていない
（`collectHorseGateEvidence`の入力型`HorseEvidenceSourceRace`はraceScore等のフィールドを
そもそも要求しない設計のため、参照のしようがない）。**今回のconfidence設計のために追加実装した
ものはない。**

## STEP2: confidence候補A〜Dの比較

| 案 | 閾値 | 長所 | 短所 | 過学習リスク | データ不足リスク | 実務での使いやすさ |
|---|---|---|---|---|---|---|
| **A** | 0=unknown, 1=low, 2〜3=medium, 4+=high | シンプル。2走あればmediumに到達でき、実データ（東京ダ1600mでn=2が34頭）を早めに活用できる | n=2の少数サンプルでmediumに格上げするのはやや楽観的。CHECKPOINT10.3で30レース・451頭の集団統計ですら方向が不安定だったことを踏まえると、個体n=2はさらに不安定なはずで、それをmedium扱いするのは過大評価の恐れ | 中〜高（n=2の偶然の傾向を拾いやすい） | 低（早期にmedium/highへ到達できる） | 高（データが少ないコースでも早く使える） |
| **B** | 0=unknown, 1〜2=low, 3〜4=medium, 5+=high | n=1,2をどちらもlowに留めるため、少数サンプルの過大評価を避けやすい。STEP7の「1走だけで適性を決めない」という要請とも整合しやすい | 現在の実データ（東京ダ1600m・30レース）ではn>=4の馬が1頭も存在しないため、"high"が事実上到達不能なカテゴリになる（後述STEP5参照） | 低〜中 | 高（highに到達する馬がほぼいない＝実質使われない区分になる） | 中（保守的すぎて実質medium止まりの馬ばかりになる） |
| **C** | `sampleCount`ではなく`sameCourseDistanceCount`（surface不問）を優先 | dirt/turfの区別をせず「同じ競馬場×同じ距離」の経験値を広く拾えるため、サンプル数を稼ぎやすい | **危険**。ダートと芝は走破性能・脚質適性が大きく異なるため、「東京1600mを3回走った」がダート2回＋芝1回のような場合、実質的に異なる競技の実績を混ぜてconfidenceを底上げしてしまう。CoursePrior自体もsurface別に定義されている（東京ダート1600m固有）ため、surfaceを跨いだ実績をそのconfidenceの根拠にするのは設計として矛盾する | 高（性質の異なる実績を同一視する） | 低（見かけ上のサンプル数は増える） | 低〜中（一見良さそうだが実務的には誤解を招きやすい） |
| **D（Claude提案）** | 0=unknown, 1=low, 2=medium, 3+=high（Aよりさらに早くhighに到達／Bよりmediumの到達が早い） | 実データの分布（後述STEP5: n=1が365頭・n=2が34頭・n=3以上が6頭という強い右肩下がりの分布）に照らすと、"high"を4走・5走に置くこと自体が現実離れしている可能性がある。3走という基準なら実データにも該当馬が存在し、区分として機能する | n=2→mediumはAと同じ過大評価リスクを持つ。加えて「3走でhigh」は依然として「その3走がどれだけ多様な条件だったか」（STEP4の懸念）を無視している | 中〜高 | 低 | 高 |

### 比較から見える論点

- **A/DはCの持つ「早くconfidenceが上がる」利点を、surfaceを跨がず安全な形で得ようとする方向**。
  C自体は不採用が妥当（surfaceを跨ぐこと自体がリスク）。
- **B**は最も保守的だが、現在の実データでは"high"が空集合になる。これは「本人実績だけで
  強く信用してよい状況は現状ほぼ存在しない」という誠実な表現でもあり、悪いことではない
  （CoursePriorも`empiricalValidationStatus=weakOrUnstable`である以上、どちらの情報源も
  強い確信度に達しにくいのはむしろ整合的）。
- **A/D**は実務上"medium"/"high"に早く到達できる一方、CHECKPOINT10.3の「30レースでも
  方向が安定しなかった」という教訓を踏まえると、n=2〜3程度の個体差を安易に「信用できる」と
  格上げするのは正当化しづらい。

## STEP3: 「同じコース」の定義確認

`collectHorseGateEvidence()`の`targetCondition`（`HorseEvidenceCourseCondition`）は既に

```
racecourse（venue）× surface × distance の完全一致
```

を`sampleCount`／`runs`の絞り込み条件として使っている（`horseGateEvidence.ts`の`matchesTarget`）。
例えば「東京ダ1600」「東京ダ1400」「東京芝1600」「中山ダ1800」はいずれも別条件として扱われ、
互いのサンプルを混同しない。**going（馬場状態）はこの一致条件に含めていない**——goingは
STEP4の「注意項目」として別途扱う（一致条件に含めると、ただでさえ少ないサンプルがさらに
細分化されてしまうため）。

`factCounts.sameCourseDistanceCount`は上記の完全一致より緩い「racecourse×distanceのみ一致
（surface不問）」であり、STEP2で述べた通りconfidenceの主根拠には使わない方針を提案する
（Cを不採用とする理由と同じ）。

## STEP4: sampleCountだけでは危険なケース（今回は補正実装しない、注意項目としての整理）

実データ（東京ダ1600m・n=3以上の6頭のうち`ファンタイムギフト`）で実際に確認できた例を含め、
将来confidenceに影響しうる注意項目を整理する。

| 注意項目 | 実データでの具体例 | なぜ危険か |
|---|---|---|
| 毎回似た枠に入っている | ファンタイムギフト: 3走とも3枠または4枠（horseNumber 4/7/7） | 「枠適性」ではなく「その馬・厩舎が毎回近い馬番に収まりやすい」という別の交絡要因を、枠実績と誤認する可能性 |
| 馬場状態が偏っている／様々 | ファンタイムギフト: 良・重・良と混在 | 単純平均すると、良馬場実績と重馬場実績を同列に扱ってしまう（本来は馬場別に分けて見るべき） |
| クラスが極端に違う | 東京ダ1600mの検証データはおおむね1勝クラス中心だが、将来的にG1級馬とのデータが混ざる可能性がある | 相手関係の強さが違うレースの着順を同列に比較できない（クラス補正なしでは着順の意味が変わる） |
| 頭数が毎回大きく違う | ファンタイムギフト: fieldSize 16/15/13と変動 | `relativeGatePosition`の意味合いが変わる（同じ馬番でも頭数が違えば相対位置は変わる。ただし本collector自体は毎走ごとに正しく再計算しているため、この点自体は既に安全） |
| 極端に古いデータ | 現行データセットには該当例なし（2025年のみ） | 馬場改修・馬自身の成長/衰えを反映していない実績を「現在の適性」として扱ってしまう |
| surfaceを跨いだ経験の混入 | STEP2のCで指摘した通り | ダートと芝の実績を同一視すると、性質の異なる走りを1つのconfidenceに集約してしまう |

これらはいずれも**今回は補正を実装しない**。将来、confidenceをより精緻化する際の検討材料として
記録するのみ。

## STEP5: 東京ダ1600mでの実例（CHECKPOINT10.1〜10.4データより機械抽出）

`ALL_GATE_VALIDATION_ROWS`（30レース・451頭）を馬名で集計すると、東京ダート1600mでの
sampleCount分布は次の通り（機械集計、結果を見た選定なし）。

| sampleCount | 該当頭数 |
|---|---:|
| 1 | 365 |
| 2 | 34 |
| 3以上 | 6（最大3。4以上は0頭） |

各バケットの先頭馬（配列順で機械抽出）にA〜Dを適用した結果:

| 馬名 | sampleCount | 案A | 案B | 案C（参考・不採用方針） | 案D |
|---|---:|---|---|---|---|
| ヴォンフレ | 1 | low | low | low相当 | low |
| ジェイエルマスター | 2 | medium | low | medium相当 | medium |
| ファンタイムギフト | 3 | medium | medium | medium相当 | high |

**重要**: この結果を見てから閾値を選び直すことはしていない（STEP2の比較・STEP4の懸念は
この実例を見る前に整理済み）。この表はあくまで各案の挙動を確認するための例示であり、
確認した範囲では「n=3を見てB/Aが妥当かDが妥当か」を判断する決め手にはならなかった
（4走以上のサンプルが1頭も存在しないため、"high"の到達しやすさの違いを実データで検証できない）。

## STEP6: confidenceの役割（今回は補正係数への変換をしない）

CHECKPOINT10.3の`combineConfidence = min(...)`の設計思想と整合させ、confidenceは将来
「HorseEvidenceをどれだけ強く効かせるか」という重みの土台としてのみ使う想定を確認した。

| confidence | 想定される将来の役割 |
|---|---|
| high | 本人実績を比較的強く信用する候補 |
| medium | 中程度に信用する候補 |
| low | CoursePrior等の一般情報を優先する候補 |
| unknown | 本人実績は使わない（0点扱いではなく「評価不能」） |

**今回はこの役割から具体的な補正係数・percentへの変換式は一切実装しない。**

## STEP7: 0走・1走の扱い

- **0走 = unknown**（0点扱いにしない。「能力が低い」ではなく「本人実績が無いため評価不能」）。
- **1走だけで適性を決めない**——A・B・D案いずれも1走は"low"（またはlow相当）に留めており、
  この原則をすべての候補案が満たしている。この点は案によらず今回のV1設計の共通前提とする。

## STEP8: Claude推奨案

**B案（0=unknown, 1〜2=low, 3〜4=medium, 5+=high）を推奨する。** 理由:

1. STEP7の「1走で決めない」だけでなく「2走でも医学的に強い確信を持たない」という、より保守的な
   立場を取れる。CHECKPOINT10.3で明らかになった「30レース・451頭という集団統計でも
   frame-finishPosition相関がほぼゼロ・方向不安定だった」という事実を踏まえると、個体の
   n=2程度の実績にmedium（≒ある程度信用してよい水準）を与えるA/D案は、根拠に対してやや
   楽観的すぎると判断する。
2. 現状の実データでは"high"に到達する馬が1頭もいないが、これは設計の欠陥ではなく、
   「本人実績だけで強く信用してよい状況は現時点でほぼ存在しない」という実態を正直に
   反映した結果と捉える。CoursePrior側も`empiricalValidationStatus=weakOrUnstable`である以上、
   HorseEvidence側だけが安易に"high"へ到達しやすい設計にする理由が無い。
3. C案（sameCourseDistanceCountをsurface不問で優先する）は明確に不採用とする。ダート/芝を
   跨いだ実績を同一視するリスクが、サンプル数を稼げる利点を上回る。

ただし以下は留保する（B案を機械的に確定とはしない）:
- 5走という"high"の到達点が、他コースを含めた将来のより大きなデータセットでも同様に
  「事実上到達不能」であり続けるなら、5走という基準自体を見直す余地がある
  （4走 vs 5走の妥当性は、現状のデータでは検証不能）。
- STEP4で挙げた「毎回似た枠」「馬場状態の偏り」等の懸念は、B案のような単純カウント方式では
  一切考慮されない。将来これらを取り込むかどうかは別途の判断が必要。

**この推奨案はまだ実装しない。** ChatGPTとユーザーの承認を得てから、別ラウンドで
confidence算出関数として実装する。

## 未確定事項（次にChatGPTと決める必要があること）

1. B案（またはA/D案）を正式採用するか
2. "high"の閾値を4走・5走のどちらにするか（現状データでは検証不能）
3. STEP4で列挙した注意項目（枠の偏り・馬場状態・クラス差・頭数変動・surface混入）を
   将来どこまで補正に取り込むか、あるいは取り込まずconfidenceは単純カウントのままとするか
4. goingを一致条件に含めない設計（STEP3）のまま進めるか、将来的にgoing別のconfidenceを
   別途設計するか

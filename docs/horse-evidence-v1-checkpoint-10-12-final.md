# HorseEvidence V1 最終A判定検証（CHECKPOINT 10.12）

**作成日: 2026-08-23。ステータス: 検証のみ。最終判定=B（Aに極めて近いB）。**

`horse_evidence_casec_highconfidence_validation_v2_8horses.zip`（8頭・123走）を使い、
CHECKPOINT10.11で残った2つのギャップ（CASE C・confidence=high）を最終検証した。
**本番コードは変更していない**（読み取り専用の既存関数呼び出しのみ）。

## STEP1: ZIP監査結果

- schema不一致（`carriedWeight`/`raceTimeSeconds`/`frame`、CHECKPOINT10.10と同型のズレ）を
  検証スクリプト内でのみ機械的にリネームして対処（値は変更していない、本番コード無変更）。
- リネーム後: 123行すべて正常（エラー0件・除外0件）、`qa_summary.json`のtotalRows
  （15/18/17/20/18/7/14/14=123）と完全一致。
- raceId+horseId重複0件。horseId↔horseName整合性、全8頭で矛盾なし。
- 初回走のabilityBeforeRace算出不能による除外は正しく機能（グランアレグリア・アーモンド
  アイの初回対象走がnull delta扱いで除外されることを確認、後述）。
- future leakage: 発生なし（`buildRaceHistory()`の日付昇順処理で全件確認）。

## STEP2: 対象馬の分類

| 馬名 | 分類 | careerRaceCount | rawSampleCount | usableDelta数 |
|---|---|---:|---:|---:|
| ウオッカ | A（CASE C該当） | 15 | 4 | 4 |
| ゴールドシップ | A候補（非該当） | 18 | 4 | 4 |
| ジェンティルドンナ | A候補（非該当） | 17 | 4 | 4 |
| キタサンブラック | A候補（非該当） | 20 | 3 | 3 |
| アーモンドアイ | A候補（非該当） | 7 | 3 | 2 |
| グランアレグリア | C（両方候補、confidence=high側で該当） | 14 | 6 | 5 |
| ソングライン | B（confidence=high該当） | 14 | 7 | 7 |
| アエロリット | B（confidence=high該当） | 18 | 6 | 6 |

## STEP3: confidence=high実データ検証（3頭）

| 馬名 | rawSampleCount | usableDelta | rawDeltas | aggregatedDelta（中央値） | confidence | signAgreement |
|---|---:|---:|---|---:|---|---:|
| ソングライン | 7 | 7 | 10.3,5.2,3.5,2.9,3.6,4.4,6.2 | 4.4 | high | 100% |
| アエロリット | 6 | 6 | 1.3,3.7,0.3,1.1,-2.6,1.4 | 1.2 | high | 80% |
| グランアレグリア | 6 | 5 | 6.5,-1.9,2.3,2.5,-0.5 | 2.3 | high | 75% |

**確認1: 5走以上でhighとすることが不自然でないか** — 不自然ではない。3頭とも実際に
5走以上の実績を持ち、confidenceの定義（データ量）通りの状態を表している。

**確認2・3: medium→high境界での不自然な跳ね上がりが無いか** — rolling median（n=3から
最大走数まで1走ずつ増やしたときのaggregatedDelta推移）で検証した。

| n | ソングライン median | アエロリット median | グランアレグリア median |
|---:|---:|---:|---:|
| 3 (medium) | 5.2 | 1.3 | 2.3 |
| 4 (medium) | 4.35 | 1.2 | 2.4 |
| **5 (→high)** | **3.6** | **1.1** | **2.3** |
| 6 (high) | 4.0 | 1.2 | — |
| 7 (high) | 4.4 | — | — |

3頭とも、medium→highの境界（n=4→5）で他のnの推移幅と比べて特段大きな変化は無い
（例: ソングラインはn=3→4で-0.85、n=4→5で-0.75と、境界をまたいでも変化幅は同程度）。
**confidenceの区分変更それ自体がevidenceDirection/scoreの値を跳ね上げる/跳ね下げる
仕組みには一切なっていないことを実データで確認した。**

**確認4: confidenceがdirection/scoreを直接変更していないか** — 確認済み。confidenceは
`rawSampleCount`のみから決まる独立変数であり、`aggregatedDelta`の計算式（中央値）は
confidenceの値を一切参照しない（型・実装いずれのレベルでも分離されている）。

**確認5: consistencyが低い馬でもconfidence=highとなり得るか** — **グランアレグリアが
まさにこのケース**（confidence=high、signAgreement=75%、5値中2値が中立〜負）。
「high confidence＝良い評価」ではなく「high confidence＝データ量が十分」であることが、
この3頭の比較（ソングライン=安定、アエロリット=中程度、グランアレグリア=やや不安定）
によって実データ上で明確に示された。

## STEP4: CASE C成長誤認検証

機械基準（career6走以上・対象条件3走以上・対象条件初回がcareer3走目以降・対象条件を
除くraceScoreの時系列順位とのSpearman相関>=+0.5）を6頭のCASE C候補すべてに再適用した。

| 馬名 | 非対象条件Spearman | firstTargetIdx | CASE_C_candidate | 判定 |
|---|---:|---:|---|---|
| **ウオッカ** | **+0.773** | 6 | **true** | **判定C（成長誤認リスクあり）** |
| アーモンドアイ | +0.400 | 0 | false（初回条件不成立） | 判定B寄り（成長傾向はやや見えるが判定基盤自体が不成立） |
| キタサンブラック | +0.284 | 7 | false | 判定A（弱い上昇傾向、基準未満） |
| ゴールドシップ | +0.216 | 9 | false | 判定A（単なる実力変動） |
| ジェンティルドンナ | -0.050 | 5 | false | 判定A（ブレ、トレンドなし） |
| グランアレグリア | -0.571 | 0 | false | 判定A（このデータ区間ではむしろ下降傾向。成長誤認とは逆方向のため懸念なし） |

**該当馬は今回もウオッカ1頭のみ。** CHECKPOINT10.10・10.11との比較: このZIPの
CASE C候補6頭は10.10で使用した6頭と**同一の馬**であり、独立した新規サンプルではない
（confidence=high用に新規追加されたのはソングライン・アエロリットの2頭のみで、
いずれもCASE C機械基準では非該当）。したがって「複数ラウンドで確認した」とは言えるが、
「独立した複数サンプルで確認した」とは言えない——**依然としてCASE C該当馬は
全データソースを通じてウオッカ1例のみ**である。

ウオッカの詳細（CHECKPOINT10.10で実施済み、今回同一データで再現確認のみ）:
対象条件4走のうち1・2回目（+4.3, +6.5）は同時期の非対象条件レースも同程度好調で
成長期との混同が確認された。3・4回目（+3.8, +1.3）は同時期の非対象条件成績が
下降していたにもかかわらず正のdeltaを維持しており、条件固有の信号が残っていた。

## STEP5: CASE C対策の必要性判定

**判断: 今回は対策不要（現状維持）と結論する。** 理由:
- 実証されたCASE C事例が1件のみであり、対策を設計するための統計的根拠が不足している
  （1件の事例に最適化した対策は過学習のリスクがある）。
- 候補比較（今回は実装しない、判断のみ）:
  - **A（現状維持）**: 採用可能。事例が少なすぎて他案を正当化できない。
  - **B（直近N走方式）**: 実質的に既に採用済み——`calculateAbilityBeforeRace`は
    既に`MAX_PRIOR_RACES_FOR_ABILITY=5`で直近5走に限定しており、新規の対策としては
    提案の余地が無い。
  - **C（時間減衰方式）**: `abilityBeforeRace`の計算式自体（Ability Model V1凍結対象）を
    変更する必要があり、**今回のSTOP条件「Ability Model V1変更が必要」に抵触するため
    不採用**。
  - **D（growthWarningフラグのみ付与）**: 将来、CASE C候補が複数見つかった場合の
    次善の対策として妥当。ただし今回は実装しない（指示通り）。
  - **E（その他）**: 対象条件delta と同時期の非対象条件deltaを自動比較する仕組み
    （STEP4で手動実施した比較の自動化）も将来案として考えられるが、今回は設計のみに
    留め、実装は行わない。
- **二重の成長補正を避けるという最優先事項は完全に守られている**（今回、Ability Model
  V1側にもHorseEvidence側にも、いかなる補正ロジックも追加していない）。

## STEP6: aggregation再確認

CHECKPOINT10.11で発見したゴールドシップ有馬記念の実例（単純平均-0.95 vs 中央値+0.6）に
加え、今回さらに2つの実例で確認した。

| 馬名 | deltas | mean | median | trimmed(1) | winsor(1) |
|---|---|---:|---:|---:|---:|
| アエロリット（n=6、外れ値-2.6あり） | 1.3,3.7,0.3,1.1,-2.6,1.4 | 0.87 | **1.2** | 1.03 | 0.97 |
| グランアレグリア（n=5） | 6.5,-1.9,2.3,2.5,-0.5 | 1.78 | **2.3** | 1.43 | 1.26 |

**新たな知見**: グランアレグリアの例では、中央値（2.3）がtrimmed（1.43）・winsorized
（1.26）よりもむしろ高い値になった。これは中央値がn=5のうち中央の1点だけを採用する
のに対し、trimmed/winsorizedは両端を除去・丸めた上でなお複数点の平均を取るため、
中央値の方が「データの大部分を捨てる」形で頑健性を得ていることを意味する。**この違いは
どちらが優れているかを意味しない**（外れ値耐性という目的においてはどちらも単純平均より
明確に優れている）。

**結論**: 前回の暫定推奨「中央値」は今回の追加データでも妥当であり、**変更しない**
（指示通り）。中央値はn=2でも定義可能・計算が最も単純という利点を維持している。

## STEP7: neutral閾値±1.0再確認

今回の8頭・usableDelta合計35件を対象に集計した。

| 閾値 | positive | neutral | negative |
|---|---:|---:|---:|
| ±0.5 | 26 | 5 | 4 |
| ±0.75 | 25 | 6 | 4 |
| **±1.0** | **24** | **7** | **4** |
| ±1.25 | 22 | 9 | 4 |
| ±1.5 | 19 | 12 | 4 |
| ±2.0 | 19 | 13 | 3 |

±0.5〜±1.25の範囲では分類の変化が小さく、±1.5以降でより多くの値がneutralへ吸収され
始める。**分類が頻繁に反転する様子は見られず、明確な好走・凡走をneutralに押し込めている
兆候も無い。** CHECKPOINT10.9B（14件）・10.11（26件）と合わせて計75件規模の実データで
一貫した傾向が確認できたため、**±1.0を正式値として提案する**（暫定から格上げ）。

## STEP8: confidence × consistency 最終確認（4パターン）

| パターン | 実例 |
|---|---|
| high confidence × high consistency | **ソングライン**（confidence=high、signAgreement=100%） |
| **high confidence × low consistency** | **グランアレグリア**（confidence=high、signAgreement=75%）——「データ量は十分だが結果が安定しない馬」として正しく表現できている |
| low confidence × high consistency | **キタサンブラック**（confidence=medium、signAgreement=100%）※medium=lowではないが、低confidence帯の代表としてゴールドシップ有馬記念（confidence=medium、外れ値1件を除けば概ね安定）も参考になる |
| low confidence × low consistency | **ゴールドシップ有馬記念**（confidence=medium、signAgreement=50%） |

4パターンすべてが実データ上で矛盾なく存在することを確認した。**「high confidence＝良い
評価」ではなく「high confidence＝データ量が十分」という設計が、実データによって
裏付けられた。**

## STEP9: HorseEvidence V1最終仕様候補

| 項目 | 仕様 |
|---|---|
| rawPerformanceDelta計算基準 | `raceScore - abilityBeforeRace`（案B、CHECKPOINT10.7で確定）。`abilityBeforeRace`は対象走より前の直近最大5走のraceScore平均（既存`calculateAbilityBeforeRace`をそのまま再利用） |
| evidenceDirection | `rawPerformanceDelta > +1.0` → positive、`-1.0〜+1.0` → neutral、`< -1.0` → negative |
| neutral閾値 | **±1.0（正式値として提案）** |
| aggregation方式 | **中央値**（単純平均は外れ値1件で符号反転するリスクが実データで確認されたため不採用） |
| sampleCount | 対象条件（racecourse×surface×distance完全一致）に該当した走数（`HorseEvidence.sampleCount`、CHECKPOINT10.4） |
| confidence境界 | 0走=unknown、1〜2走=low、3〜4走=medium、5走以上=high（CHECKPOINT10.6のB案を維持） |
| consistency | 符号一致率（neutral値は分母から除外）。ただし「大きさの暴れ」「成長トレンドとの混同」は検出しない既知の限界あり |
| CASE Cへの対応 | 現時点では対応しない（technical debtとして記録）。実データでの該当例は1件のみ、部分的な混入にとどまる |
| CASE Dへの対応 | 中央値の採用により実用上ほぼ解消 |
| future leakage防止 | `abilityBeforeRace`は対象走より前の確定済みraceScoreのみを使用（既存Ability Model V1の規律をそのまま継承、新規実装なし） |
| 0走の扱い | confidence=unknown。neutral・0点・50%等への変換は行わない |
| scoreの表現方法 | `rawPerformanceDelta`をそのままの点数スケール（raceScoreと同じ0〜100点相当の単位）で保持。percent・-100〜100等への変換は行わない（V1では常にscore=raw delta、追加のスケール変換なし） |
| Base Abilityとの関係 | **完全分離**。HorseEvidenceは`RacePerformance`を読み取るのみで、`raceScore.ts`/`baseAbility.ts`等のAbility Model V1本体を一切変更・参照しない設計（CHECKPOINT10.4以降一貫）。「馬そのものの能力」ではなく「同条件で、その馬が自身の通常能力よりどの程度走れているか」を表す補助証拠として位置づける |

## STEP10: A/B/C最終判定

**判定: B（概念・ロジックは使えるが、追加検証が必要）**

STEP1（CHECKPOINT10.11で固定したA判定基準）との照合:

| 基準 | 判定 |
|---|---|
| future leakageなし | ✓ 達成 |
| CASE D耐性確認 | ✓ 達成 |
| **CASE C重大問題なし、または安全な対処方針確立** | **△ 未達成** |
| confidence=high実データ確認 | ✓ 達成（3頭、high×high/high×低の両方を実証） |
| aggregation妥当 | ✓ 達成 |
| neutral閾値妥当 | ✓ 達成（±1.0を正式値提案） |
| confidence/consistency分離妥当 | ✓ 達成 |
| Base Abilityへの影響0 | ✓ 達成 |
| test/lint/build/validate:data全通過 | ✓ 達成 |

**Aに届かなかった唯一の理由**: CASE C該当馬が全データソースを通じて**依然として
ウオッカ1頭のみ**である。今回のZIPで新たに検証したCASE C候補6頭は、CHECKPOINT10.10と
**同一の馬**（独立した新規サンプルではない）であり、複数ラウンドにわたって確認しては
いるが、独立した複数サンプルでの確認には至っていない。ウオッカの1例では「成長誤認が
どの程度一般的に発生するか」を統計的に主張できず、「安全な対処方針の確立」（STEP5で
判断した「現状は対策不要」という結論も、n=1の証拠に基づく暫定的な判断にとどまる）も
厳密には未完了と判断する。**A判定条件を厳格に適用した結果、この1点だけでB判定とした。**

confidence=highについては、今回3頭の独立した実例（ソングライン・アエロリット・
グランアレグリア）が得られたことで、CHECKPOINT10.11時点の課題は**解消**したと判断する。

## STEP11: baseAbility再現確認

`raceScore.ts`・`memberLevel.ts`・`baseAbility.ts`・`abilityBeforeRace.ts`・
`timeGapScore.ts`・`raceTimeScore.ts`・`final3FScore.ts`・`weightScore.ts`はいずれも
今回変更していない。シェイクユアハート baseAbility = **70.3**を
`abilityModelV1.regression.test.ts`で再確認、変化なし。

## 完了報告

**1. ZIP監査結果**: 8頭・123行すべて正常（schema列名のズレは検証スクリプト内で機械的に
リネームして対処、本番コード無変更）。重複・整合性の問題なし。

**2. 対象馬数・総レース数**: 8頭・123走（対象条件走は37走）。

**3. 各馬sampleCount**: STEP2の表参照（rawSampleCount 3〜7）。

**4. confidence=high実データ検証結果**: 3頭（ソングライン=high×high consistency、
アエロリット=high×medium consistency、グランアレグリア=high×low consistency）を確認。
medium→high境界での不自然な跳ね上がりは無いことをrolling median分析で確認。
**CHECKPOINT10.11の課題を解消。**

**5. CASE C該当馬**: ウオッカ1頭のみ（今回のCASE C候補6頭はCHECKPOINT10.10と同一馬）。

**6. CASE Cの深刻度**: 部分的（対象条件4走中2走に成長期との混同の疑いあり、残り2走は
条件固有の信号が残存）。1例のみのため一般化不可。

**7. aggregation比較**: 中央値が単純平均より明確に頑健（ゴールドシップ有馬記念で
符号反転を確認済み、今回さらに2例で追認）。**中央値を正式推奨として維持。**

**8. neutral閾値比較**: ±1.0を正式値として提案（3ラウンド・約75件のdeltaで一貫した
傾向を確認）。

**9. confidence×consistency検証**: high×high、high×low、medium×high、medium×lowの
4パターンすべてが実データ上で自然に存在することを確認。

**10. HorseEvidence V1正式仕様候補**: STEP9の表参照。

**11. A/B/C判定**: **B**（唯一の理由: CASE C該当馬が1頭のみで一般化できないため）。

**12. baseAbility=70.3再現確認**: 確認済み、変化なし。

**13. test/lint/build/validate:data**: 509/509成功、lint・build・validate:dataすべて
クリーン。

**14. 変更ファイル一覧**: `docs/horse-evidence-v1-checkpoint-10-12-final.md`（新規）のみ。
本番コード無変更。

**15. 残るtechnical debt**:
- CASE C対策なし（STEP5で「現状は対策不要」と判断したが、n=1の証拠に基づく暫定判断）
- consistency（符号一致率）は「大きさの暴れ」「成長トレンドとの混同」を検出しない
- HorseEvidenceのraceScoreが自己参照的memberLevelの影響を受ける可能性（CHECKPOINT10.9C
  で数式上は減衰方向・許容可能と判断済み、対処不要のまま）

**16. 次にChatGPTと決める必要がある項目（優先順位順、最大5件）**

1. CASE C該当馬を増やすため、**今回の6頭（ゴールドシップ・グランアレグリア・ウオッカ・
   ジェンティルドンナ・キタサンブラック・アーモンドアイ）とは重複しない新規の馬**を
   追加投入するか。それとも、ウオッカ1例＋「対策不要」という暫定判断のままA判定へ
   格上げするという政策判断を今回下すか
2. neutral閾値±1.0・aggregation=中央値・confidence B案を、この時点で正式凍結するか
3. CASE C対策（STEP5のD案：growthWarningフラグ）を、今回は見送ったまま次フェーズに
   進めてよいか、それとも先に実装しておくべきか
4. HorseEvidence V1がB判定のまま、Suitability V1統合の設計だけを並行して進めてよいか
   （実装はまだしない前提で）
5. キーンランドC実戦投入（CHECKPOINT10.10で指摘した実データ・コース構造データの不足）を
   別トラックとして進めるか、HorseEvidence V1の完全A化を待つか

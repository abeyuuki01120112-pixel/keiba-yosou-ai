# STEP6 V1 正式決定事項（2026-08-19）

`docs/prediction-philosophy.md`（根幹思想）の下位文書。STEP6実装（`outcomeProbability.ts`
`outcomeScore.ts`／`stabilityFactor.ts`／`raceOutcomeEvaluation.ts`）に対する正式な
V1確定事項を記録する。**この文書に基づくコード変更（係数の再調整等）は今回一切行っていない。**

## 1-1. T=10以外の係数（仮パラメータとして固定）

以下は現時点では「正しい係数」として扱わない。V1の仮パラメータとして固定する。

| 定数 | 現在値 | 定義場所 |
|---|---|---|
| `WIN_MARGIN_WEIGHT` / `TOP2_MARGIN_WEIGHT` / `TOP3_MARGIN_WEIGHT` | 0.3 | `outcomeScore.ts` |
| `STABILITY_WEIGHT_WIN` / `STABILITY_WEIGHT_2` / `STABILITY_WEIGHT_3` | 0 / 0.2 / 0.35 | `outcomeScore.ts` |
| `OUTCOME_SCORE_CENTER` / `OUTCOME_SCORE_AMPLITUDE` / `OUTCOME_SCORE_SCALE` | 70 / 28 / 15 | `outcomeScore.ts` |
| `STABILITY_FACTOR_CENTER` / `AMPLITUDE` / `SCALE` / `NEUTRAL` | 70 / 25 / 10 / 65 | `stabilityFactor.ts` |

**特定の1レース（宝塚記念・札幌記念等）の結果に合わせてこれらの係数を調整することは
絶対に行わない。** 将来、十分な数の過去レースを用いたバックテストを行い、その結果に
基づいてのみ校正する。

`PLACKETT_LUCE_TEMPERATURE = 10`（`outcomeProbability.ts`）は、将来バックテストの
対象になり得るという点では上記と同様だが、**現時点のV1では正式採用の確定値**として扱う
（仮パラメータではなく、正式な初期値）。

## 1-2. evaluationConfidence（Design A・weakest-link）

Design A、weakest-link方式（`raceOutcomeEvaluation.ts` の `resolveEvaluationConfidence`）を
V1として正式採用する。

**最重要原則: confidenceは予測値を変えるものではない。**

confidenceとは「その予測・能力評価をどれだけ信用してよいか」を表す独立した情報である。
同じfinalRaceAbilityであれば、confidenceが異なってもwinProbability・winScore等を
直接変更してはいけない。confidenceを能力・確率・scoreへ混入させることは、STEP6に限らず
本プロジェクト全体で禁止する。

（現状のコードはこの原則を満たしている。`evaluateRaceOutcomes`のテスト
「confidenceはprobabilityを直接変えない（Design A）」で確認済み。）

## 1-3. stabilityConfidence（閾値維持）

現在の閾値・仕様（`baseConfidenceFromSampleCount`: 4走以上=high／2〜3走=medium／
0〜1走=low、STEP4 `suitabilityConfidence.ts` を流用）をV1では維持する。

今回のSTEP6実装時に検証した宝塚記念17頭の分布（多くがlow/medium寄りになった）**だけを
理由に閾値を変更しない。** 将来、複数レースを用いたバックテストで分布・精度を検証してから
校正する。

## 1-4. データ不足馬（baseAbility=0の意味）

`calculateBaseAbility`（`baseAbility.ts`）は、対象馬の過去走データが0件のとき、
やむを得ず数値として`0`を返す（既存ロジック。今回変更していない）。

**この`0`を「能力0点」という意味で扱ってはいけない。** 正しい意味は
「評価不能／データ不足」である。内部計算上やむを得ず0を使用する場合でも、
意味を明確に分離すること。

将来UIへ統合する際は、`baseAbility`（および連動する`finalRaceAbility`・
`winScore`／`top2Score`／`top3Score`）が0（またはそれに由来する値）である馬について、
「能力が0の馬」とユーザーに誤認させない表示にする。表示候補:

- 「—」
- 「データ不足」
- 「評価不能」

また、将来的にはデータ不足を検知した際に「どのデータが不足しているのか」
「どのデータソースから取得可能なのか」を判定できる構造を検討する。JRA-VAN Data Lab. /
JV-Link等を利用した自動データ収集についても、別STEPで検証を予定する。
**現時点ではいずれも実装しない。**

## 現状の実装とこの思想の衝突点（変更せず一覧化）

以下は`docs/prediction-philosophy.md`制定にあたり洗い出した、現状実装との差分。
**今回はいずれも変更しない。** 対応要否・優先度は次回以降ユーザーと相談する。

1. **baseAbility=0の意味論的な区別が型・出力に存在しない（思想1-4との明確な衝突）**
   `calculateBaseAbility`は「データ0件」と「本当に極端に低い実績しかない馬」を
   同じ`number`型の値として返し、`HorseOutcomeResult`にもそれを区別するフィールドが無い。
   呼び出し側が`recentRaces.length===0`を別途チェックしない限り、両者を区別できない。

2. **raceScoreが加重平均（線形結合）であり、思想4「着差×相手レベル×レース内容」が
   文字通りの乗算的評価にはなっていない**
   `RACE_SCORE_WEIGHTS`（memberLevel30%／timeGap25%／raceTime25%／final3F15%／weight5%）は
   独立5項目の加重平均。相手レベルが低い時に着差の価値を割り引く、といった項目間の
   相互作用（掛け算的な文脈評価）は現状無い。

3. **馬場の「開催中の変化」（思想6）のうち、開幕週/最終週・コース替わり・
   クッション値・含水率・天候は未接続**
   現状のtrackAdjustmentは「同日・同競馬場・同芝ダートの他レースとの上がり／タイム差」
   のみを使う統計的補正であり、開催週・コース替わり等の構造的要因は入力に無い。

4. **不利（トラブル）の定量評価（思想7）が完全に未実装**
   進路ロス・接触・砂被り等を検知・補正する仕組みは現状存在しない。

5. **展開・位置取り由来の過大/過小評価の補正（思想8）は統計的な近似のみ**
   STEP5の`paceScenarioFactor`／`trackBiasFactor`は脚質×想定ペース／トラックバイアスの
   相性を±5%ずつ（合計90〜110%）で近似するのみで、個別レースの具体的な展開
   （何番手を追走した、何秒何馬身のロスがあった等）を直接評価する機構ではない。

上記1は思想の明文化により新たに顕在化した**明確な衝突**、2〜5は現時点の設計が
思想を部分的にしか実現できていない**既知の未実装領域**として区別して報告する。

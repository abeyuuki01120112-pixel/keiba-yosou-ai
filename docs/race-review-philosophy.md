# Race Review Engine 設計思想（将来構想・未実装）

**ステータス: 思想のみ保存。CHECKPOINT 9（2026-08-22）時点で実装は一切行っていない。**

[`docs/prediction-philosophy.md`](prediction-philosophy.md)・[`docs/ability-model-v1.md`](ability-model-v1.md)の
下位に位置する将来構想文書。Ability Model V1・Suitability V1のいずれとも独立した、
別の将来レイヤーとして構想している。

## 目的

**「着順」ではなく「レース内容」を評価すること。**

着順は結果の要約に過ぎず、そのレースで実際に何が起きたか（展開・トラックバイアス・不利・
恵まれ）を反映しない。同じ4着でも「展開が向いて甘い4着」と「大きな不利を受けての4着」では
次走以降の評価が全く異なるべきだが、raceScore/baseAbility/suitabilityのどの既存レイヤーも
finishPosition（着順）とtimeGap（タイム差）以上の「レース内容」そのものを直接は評価していない。

### 具体例

前残り決着のレースで：
- A馬：逃げて1着
- B馬：後方から追い込んで4着

単純な着順評価ではA馬が上だが、Race Reviewでは次のように再評価しうる：
- A馬 = 展開利あり。能力通り、またはペースに恵まれての勝利
- B馬 = 展開不利。着順以上の内容で、次走注目に値する

## 位置づけ（他レイヤーとの関係）

```
Base Ability      = 馬そのものの絶対能力（Ability Model V1、凍結済み）
Suitability       = 今回の条件でBase Abilityを何%発揮できるか（Suitability V1、CHECKPOINT9で器を設計）
RaceContext       = 今回のレース固有の状況（当日展開・トラックバイアス）
CourseContextPrior = コース構造・統計から得た事前情報
Race Review Engine = 過去走1走ごとの「内容」評価（新設予定・将来レイヤー）
```

Race Reviewは対象馬自身の**過去走**を事後的に評価するレイヤーであり、baseAbility/raceScoreの
計算式には直接混入させない。Race Reviewの評価結果は、あくまで将来のsuitability/confidence判定の
「参照材料（evidence）」として使う候補であり、raceScoreを事後的に書き換える機能ではない
（future leakage禁止・結果逆算禁止の原則をここでも維持する）。

## 将来のreasonCode候補

以下はあくまで候補であり、V1では未確定・未実装：

**展開系**: `paceAdvantage` / `paceDisadvantage`
**トラックバイアス系**: `trackBiasAdvantage` / `trackBiasDisadvantage`
**枠順系**: `gateAdvantage` / `gateDisadvantage`
**トラブル系**: `slowStart` / `blocked` / `wideTrip` / `traffic` / `badPosition` / `forcedMove`
**内容系**: `strongFinish` / `weakFinish` / `hadMore`
**総合評価系**: `betterThanResult` / `equalToResult` / `worseThanResult`
**次走指標**: `nextRaceWatchLevel`

## AI review と USER review の分離

Race Reviewは将来、次の2種類を**別々に、削除・上書きせず**保存する設計とする：

- `aiReview`: AIが自動算出したレース内容評価
- `userReview`: 人間（ユーザー・ウマプロ）が入力した回顧コメント

### USER review の例

> 「直線で前が完全に詰まった。最後はほとんど追えていない。次走人気が落ちるなら要注意。」

この情報は削除・上書きせず保存し、次走の評価時に参照できる構造を将来的に作る。

### 重要な制約（将来実装時も必ず守ること）

- **USER reviewをBase Abilityへ直接加点してはならない。** あくまで「次走評価時に参照する
  Evidence」として扱う。
- AI reviewとUSER reviewは常に別フィールドとして保持し、人間の入力がAIの算出結果を
  上書き・削除することはない（`raceContextTypes.ts`のmanual/auto分離パターンを踏襲する）。
- 対象レース自身の回顧を、そのレース自身の予測に使わない（future leakage禁止はここでも
  絶対原則）。過去走の回顧は、あくまで「それより後のレース」の評価にのみ使える。

## 将来のバックテスト構想

AI review・USER review・実際のレースデータ（次走以降の実績）の3つを比較し、
「どの情報が実際に次走予測へ有効だったか」を将来バックテスト可能にする構想。
これも今回のCHECKPOINT 9では設計のみで、実装・検証は行わない。

## 今回のスコープ外であることの確認

このドキュメントはCHECKPOINT 9の指示に基づき、**思想の保存のみ**を目的として作成した。
以下はいずれも今回実装していない：

- Race Review Engine本体のコード
- aiReview/userReviewのデータ構造（型定義含む）
- reasonCode候補の実際の判定ロジック
- バックテスト機構

これらの着手には、別途ユーザーの明示的な指示が必要。

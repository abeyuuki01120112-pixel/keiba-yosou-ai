# HorseEvidence V1 正式仕様（確定・凍結）

**確定日: 2026-08-23（CHECKPOINT10.4〜10.15）。ステータス: A判定・正式採用可能。**

[`docs/ability-model-v1.md`](ability-model-v1.md)（Ability Model V1、凍結済み）とは
独立したレイヤー。HorseEvidenceはAbility Model V1の計算結果（`RacePerformance`）を
**読み取るだけ**で、`raceScore`/`baseAbility`/`memberLevel`/`abilityBeforeRace`等の
計算式を一切変更・参照し直さない。

## 目的

**HorseEvidenceは「馬そのものの能力」ではなく、「同条件で、その馬が自身の通常能力より
どの程度走れているか」を表す補助証拠である。** Base Ability（Ability Model V1）を
直接加点・減点することはなく、将来Suitability層へ接続する際の「本人実績」情報源として
設計されている（CHECKPOINT9〜）。

## 入力

`RacePerformance[]`（対象馬自身の過去走履歴。他馬のデータは混入させない）と、
絞り込み条件`{racecourse, surface, distance}`（racecourse×surface×distanceの完全一致）。
`going`（馬場状態）は一致条件には含めず、別情報として保持する（将来、going別の
分解が必要になった際に備えるため）。

## rawPerformanceDelta

```
rawPerformanceDelta = raceScore - abilityBeforeRace
```

- `raceScore`: その走のAbility Model V1算出値（既存、無変更）。
- `abilityBeforeRace`: そのレースより前の直近最大5走のraceScore平均
  （`calculateAbilityBeforeRace()`、Ability Model V1凍結済み関数をそのまま再利用。
  対象馬自身の履歴に対して新たに呼び出すだけで、関数自体は変更しない）。
- 対象走に**過去走が1走も無い場合**（多くはその条件での初回走）、
  `abilityBeforeRace=null`となり、rawPerformanceDeltaは**算出不能として除外する**
  （推測で埋めない。0点・neutral・50%等への変換もしない）。

**選定した理由（CHECKPOINT10.7）**: career全体平均（案A）や対象条件以外の平均（案C）は
対象走の前後関係を無視するため、future leakageのリスクや自己参照バイアスを持つ。
abilityBeforeRace基準（案B）は、Ability Model V1で既に確立された「過去だけを見る」
規律をそのまま継承でき、かつ実データで最も予測力が高いことを確認した。

## aggregation（集約方式）

**中央値（median）を正式採用とする。**

- 単純平均は1走の外れ値で結論の符号が反転するリスクが実データで確認された
  （CHECKPOINT10.11、ゴールドシップ有馬記念n=4: 単純平均-0.95 vs 中央値+0.6）。
- trimmed mean・winsorized meanは中央値と同等の頑健性を持つが、n<5では機能しない
  （両端を除去/丸める対象が無くなるため）。中央値はn>=1で常に定義でき、より単純。
- 単発の不振・単発の好走が集約値を過剰に振れさせないことを、CHECKPOINT10.11〜10.15の
  複数実例（ゴールドシップ有馬記念、ジェンティルドンナ東京芝2400m等）で確認した。

## neutral閾値・evidenceDirection

```
rawPerformanceDelta > +1.0  → positive
-1.0 <= rawPerformanceDelta <= +1.0 → neutral
rawPerformanceDelta < -1.0  → negative
sampleCount = 0             → unknown
```

**±1.0を正式値とする。** CHECKPOINT10.8〜10.12にわたり、3つの独立した実データ
セット（合計約90件のdelta）で、±0.5〜±1.5の範囲では分類がほぼ安定するという傾向を
確認した。

`aggregatedDelta`（集約値）に対してこの閾値を適用したものを最終的な
`evidenceDirection`とする。個々の走ごとのdeltaにも同じ閾値を適用でき、
両者を比較することで「単発の変化」と「集約された傾向」を区別できる
（CHECKPOINT10.15参照）。

## confidence（データ量）

```
0走      → unknown
1〜2走   → low
3〜4走   → medium
5走以上  → high
```

sampleCountは`HorseEvidence.sampleCount`（対象条件に該当した走数、CHECKPOINT10.4）。
**confidenceは「本人実績をどれだけ信用できるか」というデータ量の指標であり、評価の
方向性（好走/凡走）を一切表さない。** 0走を「neutral」「50点」「0点」等の中立値に
変換することは絶対に禁止する（CHECKPOINT10.6）。

「high confidence」＝「良い評価」ではない。5走以上あっても内容が不安定な馬は
`confidence=high`かつ`consistency`が低い、という組み合わせが正しい表現である
（CHECKPOINT10.12で実データにより確認済み：グランアレグリア、ソングライン、
アエロリットの3例でconfidence=highのまま consistency が高/中/低とばらつくことを確認）。

## consistency（実績の一貫性）

符号一致率（`rawPerformanceDelta`をneutral閾値で分類した後、非neutral値のうち
多数派の符号が占める割合）を採用する。

- **confidenceとは完全に独立した概念**として扱う（CHECKPOINT10.6〜10.15）。
  confidence=データ量、consistency=結果の安定性。
- 既知の限界（technical debt）: (a) 符号は一致していても大きさが大きくばらつく
  ケースを検出できない（CHECKPOINT10.12、キセキの例：符号一致率100%だが
  stdev=3.01）。(b) 境界値がneutral扱いされることで一致率の分母が減り、実態より
  高い一致率が算出されることがある。

## future leakage防止

`abilityBeforeRace`は常に「対象走より前に確定していた」raceScoreのみを使用する
（`raceHistoryPipeline.buildRaceHistory()`の日付昇順処理をそのまま継承）。対象走
より後のデータ・最終career平均・全期間平均は一切使用しない。CHECKPOINT10.7〜10.15の
全ラウンド・全実データセット（`data/horses/`全体＋複数の検証用ZIP、延べ200走以上）で
future leakageは一度も確認されなかった。

## unknownの扱い

- `sampleCount=0`（対象条件での実績が1走も無い）→ `confidence=unknown`。
- `abilityBeforeRace`が算出不能（過去走が1走も無い）→ その走のdeltaは算出せず除外
  （集計対象外。0点扱いにしない）。
- いずれの場合も、「データが無い」ことと「適性が平均的である」ことを混同しない
  （CHECKPOINT10.6の原則をそのまま継承）。

## 実データ検証の要約（CHECKPOINT10.4〜10.15）

| 論点 | 結論 | 根拠ラウンド |
|---|---|---|
| future leakage | 発生なし | 全ラウンド |
| neutral閾値 | ±1.0 | 10.8, 10.9B, 10.12 |
| aggregation | 中央値 | 10.11（決定的実例）, 10.12（追認） |
| confidence/consistency分離 | 妥当・矛盾なし | 10.6, 10.9B, 10.12 |
| confidence=high実データ | 3例で確認（high×高/中/低consistency） | 10.12 |
| CASE C（成長を条件適性と誤認） | ウオッカ1例で部分的混入を確認（残存technical debt） | 10.7, 10.10 |
| CASE C（成長型・別方向：古い低実績が現在を過小評価） | 3例（ウオッカ・ジェンティルドンナ早期・アーモンドアイ）でいずれも問題なし | 10.13, 10.14 |
| 低下型逆CASE（古い高実績が現在を過大評価） | ジェンティルドンナ後期の事例を再評価し、単発不振への過剰反応ではないことを確認 | 10.14, 10.15 |
| CASE D（少数サンプルの外れ値耐性） | 中央値の採用で実用上解消 | 10.11 |

## technical debt（残存する既知の限界）

1. **継続的低下（2走以上連続でnegative）の実データ確認が未了。** 中央値の数学的
   性質上、検出可能であることは保証されているが、実例による直接確認はまだ無い
   （CHECKPOINT10.15）。
2. **回復パターン（低下からpositive/neutralへの回復）の実データ確認が未了。**
3. **CASE C（成長を条件適性と誤認する方向）の残存リスク。** ウオッカの東京芝1600m
   実績（CHECKPOINT10.10）で、対象条件初回・2回目のdeltaに一般的な成長期との
   混同が部分的に確認されている。confidence/consistencyのいずれもこの種の
   時間的トレンドとの混同を検出する仕組みを持たない。
4. **1走での劇的な跳躍パターンの正式な取り扱い方針が未確定。** キタサンブラック
   の実例（+17.4という極端なdelta）は、CASE C候補選定から除外する運用で対応した
   が、evidenceDirection/aggregatedDeltaの計算自体には特別な処理を行っていない
   （既存の中央値集約がそのまま適用される）。
5. **memberLevelScoreAtRaceの自己参照的影響。** 検証用ZIPのように対象馬1頭分の
   行しか無いデータでは、そのレースの`memberLevelScoreAtRace`が自己参照的に
   なる（＝`abilityBeforeRace`と一致する）。数式上は自己収束（減衰）方向であり
   増幅バイアスは無いと判断済み（CHECKPOINT10.9C）だが、相手馬データを含む
   実データでの定量的な検証はまだ行っていない。

## Suitabilityへの将来接続点

HorseEvidenceは現時点で`Suitability V1`（`suitabilityCoreV1.ts`/
`suitabilityCoreV1Types.ts`、CHECKPOINT9）へは未接続である。将来の接続を見据えた
設計上の整合点:

- `SuitabilityComponentV1.horseEvidence`（`HorseEvidenceDetail`型、`sampleCount`・
  `confidence`・`reason`を持つ）は、本ドキュメントのHorseEvidence出力
  （`sampleCount`・`confidence`）と自然に対応する。`evidenceDirection`・
  `aggregatedDelta`・`consistency`を`SuitabilityComponentV1`へどう反映するかは
  未設計（`score`は現状常にnull、CHECKPOINT9の凍結ルールのまま）。
- CoursePrior（`courseContextPrior.ts`、東京ダート1600m限定）とHorseEvidenceの
  優先順位は`docs/gate-suitability-v1-decision.md`で「HorseEvidence（優先度1）>
  CoursePrior（優先度2）> unknown/neutral（優先度3）」と既に定めてあるが、
  実際の合成式（両者をどう1つの数値に統合するか）は未確定。
- `effectiveAbility = baseAbility × suitability / 100`という既存の乗算モデル
  （`suitability.ts`）に、HorseEvidenceの`aggregatedDelta`をどう接続するか
  （加算的に反映するか、乗算的なsuitability%へ変換するか）は、
  CHECKPOINT10.7 STEP4で意図的に未確定のまま残してある（V1では`score`を
  スケール変換しないという判断、技術的負債ではなく意図的な保留）。

**これらの接続作業（Suitability V1本統合）は、本ドキュメントのスコープ外であり、
別のCHECKPOINTで扱う。**

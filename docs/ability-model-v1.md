# Ability Model V1（正式確定・凍結仕様）

**確定日: 2026-08-22（CHECKPOINT 5）**
**ステータス: 確定・凍結。計算式の変更にはV2への明示的な切り出しが必要（本文末尾「凍結ルール」参照）。**

本ドキュメントは、馬そのものの絶対能力（baseAbility）を算出する「能力測定器」の
確定仕様をまとめた正式文書である。[`docs/prediction-philosophy.md`](prediction-philosophy.md)
（プロジェクト全体の思想）・[`docs/step6-decisions.md`](step6-decisions.md)（STEP6固有の決定）・
[`docs/memberlevel-v1-decision.md`](memberlevel-v1-decision.md)（memberLevel V1の検証経緯）の
下位に位置し、それらの内容を重複記載せず要点のみ引用する。実装の正本は常にソースコード
（`src/ability/`配下）であり、本文書とソースコードが食い違う場合はソースコードを正としつつ、
食い違いを見つけ次第この文書を修正すること。

## 1. 目的

「馬の能力が9割」という本プロジェクトの根幹思想（`prediction-philosophy.md`）に基づき、
オッズ・人気・騎手・調教・血統・枠順を一切使わず、その馬自身の過去raceScore（直近5走）
だけから**baseAbility（絶対能力・0〜100点）**を算出する。適性・展開・トラックバイアス等
「その能力を今回の条件で何%発揮できるか」は別レイヤー（STEP4以降）であり、Ability Model V1
のスコープには含まない。

シェイクユアハート1頭を基準馬として、直近5走の実データからbaseAbility V1が安定して
約70点前後で再現されることを検証し（CHECKPOINT 1〜4.1）、2026-08-22付けで
**A：完成版として採用可能**と正式判定した（baseAbility = 70.3。感度分析68.9〜72.2、
単一レース依存なし）。

## 2. 入力データ

`src/ability/data/horses/<horseId>.json`（1頭1ファイル、実績生データのみ）。各エントリは
`RaceHistoryRawInput`型（`raceHistoryPipeline.ts`）：raceId・raceName・raceDate・racecourse・
surface・distance・going・finishPosition・timeGap（勝ち馬とのタイム差秒）・raceTime（走破タイム秒）・
final3F（上がり3F秒）・carriedWeight（斤量kg）。すべて実データのみで、推測値・平均値による
補完は禁止（`prediction-philosophy.md`思想5）。

補助データ：`courseTimeBaselines.json`（競馬場×surface×距離×馬場状態ごとの過去5年基準タイム
中央値）、`courseFinal3FBaselines.json`（同条件の上がり3F基準）、`raceFieldAggregates.json`
（ロスター外含む対戦馬全体の実データ中央値上書き）。

## 3. raceScore計算（`raceScore.ts`）

1走ごとのスコア（0〜100）。5コンポーネントの加重平均：

```
raceScore = memberLevelScoreAtRace × 0.30
          + timeGapScore           × 0.25
          + raceTimeScore          × 0.25
          + final3FScore           × 0.15
          + weightScore            × 0.05
```

0〜100にclamp、小数第1位に丸め。5項目は独立加重平均（掛け算的な文脈評価はしていない。
既知の制約として§10に記録）。

- **timeGapScore**（`timeGapScore.ts`）: 勝ち馬とのタイム差を距離2000m基準に補正し、
  `90 - 28×adjustedTimeGap` を0〜100にclamp。
- **raceTimeScore**（`raceTimeScore.ts`）: 5年基準タイムとの差（当日馬場補正込み）を
  tanh飽和カーブで0〜100へ変換（center=70, amplitude=25, scale=1.2秒）。該当基準が無い場合は
  中立値70にフォールバック（§8）。
- **final3FScore**（`final3FScore.ts`）: レース内相対評価60% + 絶対評価（5年基準＋当日補正）40%
  を合成し、同じtanh変換。絶対評価側はbaselineのsampleReliabilityWeightに応じて重みを縮小し、
  縮小分は相対評価へ振り戻す（relative+absolute=1.0を維持）。5年基準が無い場合は相対評価100%
  にフォールバック（§8）。
- **weightScore**（`weightScore.ts`）: 出走馬斤量中央値との差を距離に応じた秒換算し、同じtanh変換
  （center=70, amplitude=25, scale=1.2秒）。中央値算出不能の場合は中立値70にフォールバック（§8）。

## 4. memberLevel V1計算（`memberLevelCandidates.ts`・`raceHistoryPipeline.ts`）

**確定方式：confidence考慮Top5重み付き平均**（`docs/memberlevel-v1-decision.md`で正式決定、
2026-08-22に`raceHistoryPipeline.ts`へ本番実装）。

```
memberLevelScoreAtRace = Σ(ability_i × confidenceWeight_i) / Σ confidenceWeight_i
                          （対象レース出走馬のうちability降順Top5のみ）
```

- `ability_i` = その馬の`abilityBeforeRace`（対象レースより厳密に前の確定済み最大5走の
  raceScore平均。`abilityBeforeRace.ts`）。
- `MEMBER_LEVEL_TOP_N = 5`（V1の正式確定値）。
- 候補が5頭未満でもパディングしない（存在する分だけで加重平均）。
- 候補が0頭（出走馬全員がability算出不能）の場合のみ`FALLBACK_MEMBER_LEVEL_SCORE = 50`へ
  フォールバックし、`memberLevelBreakdown = null`（§9「評価不能」）。
- Top5単純平均（`simpleTop5Average`）は監査・参考値としてbreakdownに保持するが、
  memberLevelScoreAtRaceの算出には使わない。

旧方式（top3Average×0.4+top5Average×0.3+fieldAverage×0.2+depthScore×0.1、`memberLevel.ts`の
`calculateMemberLevel()`）は本番からは呼ばれなくなったが、比較・監査用にファイルとして残している。

## 5. confidenceの扱い

`baseConfidenceFromSampleCount`（`suitabilityConfidence.ts`、STEP4で確定・memberLevel V1が
再利用）: サンプル数（≒過去走数）から3段階のconfidenceを判定する。

| sampleCount | confidence | confidenceWeight |
|---:|---|---:|
| 4以上 | high | 1.0 |
| 2〜3 | medium | 0.6 |
| 0〜1 | low | 0.3 |

**confidenceはmemberLevel V1候補の重み付け（§4の数式内）にのみ使う。** baseAbility・raceScore
自体を後から縮小・修正する用途には使わない（`prediction-philosophy.md`思想3
「confidenceは予測値を変えない」）。STEP4のsuitability（適性）レイヤーにも別のconfidence運用
（shrinkTowardCenter）があるが、これはeffectiveAbility算出時にsuitability側にのみ適用され、
baseAbility自体には一切波及しない（§6・§10参照）。

## 6. baseAbility計算（`baseAbility.ts`）

```
baseAbility = mean(直近最大5走のraceScore)   // 均等20%ずつ。前走を特別扱いしない
```

直近走が0件の場合は`0`を返すが、**この0は「能力0点」ではなく「評価不能／データ不足」を意味する**
（`prediction-philosophy.md`思想4）。呼び出し側でこの区別を明示的に扱えない既知の課題は
`step6-decisions.md`に記録済み。

baseAbilityはSTEP4以降（suitability・展開等）の影響を一切受けない。
`effectiveAbility = baseAbility × overallSuitability / 100`（`finalRaceAbility.ts`、
既存STEP5実装）という掛け算レイヤーが既にあり、baseAbilityとsuitabilityの分離は
アーキテクチャ上すでに担保されている（§凍結ルール参照）。

## 7. future leakage防止

`raceHistoryPipeline.ts`の`buildRaceHistory()`が、全馬・全レースをレース日付の**昇順（古い順）**
に処理する。あるレースのmemberLevelScoreAtRaceを計算するときは、そのレースより**厳密に前の日付**
で確定済みの各出走馬のabilityBeforeRaceだけを参照し、同日の他レース・未処理の将来レースは
一切参照しない。これにより「馬AのraceScore→memberLevelScore→同レース馬BのraceScore→…」の
ような循環参照は構造的に発生しない。当日馬場補正（trackAdjustment）のプールは対象レース自身を
除いた全レースから作るが、これは「開催日時点で確定している客観的事実」であり他馬の能力評価とは
独立しているため、future leakageに該当しない。

`finalRaceAbility.ts`（STEP5オーケストレーター）側にも、`recentRaces`から対象レース自身を
除外する安全網が二重に入っている。

## 8. fallback条件（データ不足時に中立値へ逃がす箇所）

| コンポーネント | 条件 | フォールバック値 |
|---|---|---|
| raceTimeScore | 該当する`courseTimeBaselines`が無い | 中立値70（`RACE_TIME_SCORE_CENTER`）、`raceTimeBreakdown = null` |
| final3FScore | 該当する`courseFinal3FBaselines`が無い | レース内相対評価100%（絶対評価0%） |
| weightScore | 出走馬全頭の斤量が不明でレース中央値を算出できない | 中立値70、`isReliable = false` |
| memberLevelScoreAtRace | 出走馬全員のabilityBeforeRaceが算出不能（候補0頭） | `FALLBACK_MEMBER_LEVEL_SCORE = 50`、`memberLevelBreakdown = null` |

いずれも「推測で埋める」のではなく、あらかじめ決めた中立値への逃避であり、`【暫定】`表示等で
UI上も実データと区別できるようにしている（`HorseDetailPanel.tsx`）。

## 9. 評価不能条件

- `abilityBeforeRace`: 対象レースより前の確定済み過去走が0走の場合は`null`（集計対象から除外。
  0点として扱わない）。
- `baseAbility`: 直近走が0件の場合は`0`（§6の通り「能力0点」ではなく「評価不能」の意味）。
- `memberLevelBreakdown`: 候補馬が1頭も無い場合のみ`null`（§8のfallbackと連動）。

## 10. 現在判明している制約（V1のスコープ内で解消済みではない既知の限界）

- raceScoreの5コンポーネントは線形加重平均であり、「相手レベルが低い時は着差の価値を割り引く」
  ような項目間の掛け算的な文脈評価にはなっていない（`raceScore.ts`冒頭コメント）。
- `calculateBaseAbility`が返す`0`（評価不能）を、呼び出し側（STEP6のstabilityFactor.ts等）が
  「本当に能力の低い馬」と区別できていない（`step6-decisions.md`既知の課題）。
- 対象馬自身のconfidenceが低い（デビュー直後で過去走が少ない）場合、memberLevel算出の分母
  としての影響は小さくなる（weight=0.3）が、対象馬自身のconfidence自体はデータ増加を待つ以外
  に改善できない本質的な制約（CHECKPOINT4.1報告）。
- technical debt（§詳細は`docs/ability-model-v1-known-issues.md`）: courseTimeBaselines/
  courseFinal3FBaselinesの未カバー条件、誤日付疑義の残存3件など。

## 凍結ルール（今後の適性・展開・トラックバイアス開発から守るべき境界）

1. 本文書§3〜§9の数式・定数・fallback条件（`raceScore.ts`・`baseAbility.ts`・
   `abilityBeforeRace.ts`・`memberLevelCandidates.ts`・`memberLevel.ts`・`timeGapScore.ts`・
   `raceTimeScore.ts`・`final3FScore.ts`・`weightScore.ts`・`raceHistoryPipeline.ts`が実装する
   計算）は、CLAUDE.md「絶対に守ること」の対象として凍結する。特定レースの結果に合わせた
   調整は禁止。将来のバックテストでのみ校正する。
2. 適性・展開・トラックバイアス等の新レイヤーは、baseAbilityの値を直接書き換えたり
   raceScore/memberLevelの計算に混入させたりしてはならない。必ず
   `effectiveAbility = baseAbility × suitability / 100`のような**掛け算の別レイヤー**として
   追加すること（既存の`finalRaceAbility.ts`のパターンに従う）。
3. Ability Model V1の計算式そのものを変更する必要が生じた場合は、既存ファイルを黙って
   書き換えるのではなく、**Ability Model V2**として明示的に新しいモジュール・新しい決定文書
   （`docs/ability-model-v2-decision.md`等）に切り出し、V1との違いを文書化すること。
4. 回帰検知として`src/ability/__tests__/abilityModelV1.regression.test.ts`
   （シェイクユアハートを基準馬とするゴールデンマスターテスト）を用意している。このテストが
   失敗した場合、まず「V1の式を変えていないか」「入力データを変えていないか」を確認すること。
   意図した変更であれば、期待値と本文書のバージョン情報を明示的に更新してよい。

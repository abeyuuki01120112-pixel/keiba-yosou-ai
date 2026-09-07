# 2026新潟記念 暫定最終予想（2026-08-29時点、ユーザー直接指示による実行）

CHECKPOINT形式ではなく、ユーザーからの直接指示（「現時点での暫定最終予想を出してください」）により
実行した記録。新機能実装は行っていない。既存の凍結ロジックのみを使用した。

**目的は「当てるための数字調整」ではなく、2026-08-29時点で完成している競馬予想AIが
実戦の新潟記念に対してどこまで判断できるかを記録すること。**

## 使用した既存ロジック（新規実装ゼロ）

- Base Ability V1（`baseAbility.ts`、直近5走均等平均）
- Suitability V1（`suitabilityV1.ts`、distance/course/going/gate 4component）
- Stage A effectiveAbility（`predictionSnapshot.ts`）— CHECKPOINT14D.2でA-FREEZE-READY、完全固定
- STEP5 finalRaceAbility（`finalRaceAbility.ts`、paceScenarioFactor×trackBiasFactor）— CHECKPOINT14D.4のPreliminary Stage Bと同一計算
- STEP6 raceOutcomeEvaluation（`raceOutcomeEvaluation.ts`）— stabilityFactor + Plackett-Luce win/top2/top3確率（`outcomeProbability.ts`、PLACKETT_LUCE_TEMPERATURE=10固定）+ evaluationConfidence（weakest-link）
- V0 expectedValue.ts（`fairOdds`/`expectedValue`/`isPositiveExpectedValue`）— 単勝EV算出

**いずれも既存・凍結済みの関数をそのまま実行しただけであり、新しい数式・重み・閾値は一切発明していない。**

## 入力データ

- Stage A：CHECKPOINT14D.2でFREEZE済みの11頭ボード（変更なし）
- 予測cutoff：`2026-08-28T03:03:03.357Z`（Formal Stage A Snapshotと同一）
- オッズ：ユーザー提供の2026-08-30 15:03時点単勝オッズスナップショット
- officialGoing/当日Track Bias/馬体重：**未確定のままnull**（CHECKPOINT14D.4のPreliminary Stage B状態を維持、推測補完なし）

## 結果サマリー

全11頭で `finalRaceAbility = effectiveAbility`（Stage Aと完全一致、CHECKPOINT14D.4で判明した通り
predictedPace=average・trackBias未観測のため両ファクターが中立100%）。したがって
**AI最終順位はStage A順位と完全一致**。win確率（Plackett-Luce）もこの並びをそのまま反映する
（strength=exp(finalRaceAbility/10)が単調増加関数のため、順位が入れ替わることは数学的にない）。

**evaluationConfidence（weakest-link）は11頭全馬で"unknown"。** 理由：Suitability V1の
going componentが11頭全馬でNOT_EVALUATED（officialGoing未確定のため）であり、weakest-link方式で
これが必ず最弱項目として全体confidenceを決定するため。これは計算ミスではなく、
「馬場が確定していない現時点では、評価全体の確信度も構造的にunknownである」という
モデルの正直な自己申告である。

完全な数値表はユーザーへのチャット回答本文に記載した（このファイルには重複掲載しない）。

## 判定

**PASS（BET候補なし）を正式結論とした。**

理由：
1. evaluationConfidenceが11頭全馬でunknown（official going未確定によるweakest-link）
2. Stage B（Preliminary）が今回のフィールド構成では実質的に無補正（raceContextFactor=100%固定）
3. 当日は降雨リスクが高く（予報、rainIntensityUncertain=true）、Track Biasは同条件の
   前日レース（赤倉特別）から見てもMIXED/INCONCLUSIVE
4. Wind・馬体重・正式馬場は未確定のまま

positive EVの馬（ボーンディスウェイ・ジュンブロッサム・バレエマスター・サヴォーナ・
アーバンシック）は存在するが、上記の構造的な情報不足を踏まえ、「今買うべき馬」としての
正式推奨はしていない（ユーザー指示8節「無理に買い目を作らずPASSを正式な結論として認める」に従う）。

## 未完成・データ不足で使用できなかったロジック

- Official Going評価（構造的にNOT_EVALUATED、推測禁止）
- Weather/Wind の数値Score反映（validated path無し、Diagnostic専用）
- Track Bias の数値Score反映（auto検出未実装、当日実測不足）
- 馬体重・増減（当日未発表）
- Gate Effect補正（新潟芝2000mでINSUFFICIENT、CHECKPOINT14D.1C、未実装のまま）
- Odds/人気によるモデル調整（絶対禁止、実施せず）
- Umapro等外部予想情報（未使用）

## Regression

本ラウンドはコード・実データの変更を一切行っていない（既存関数の実行のみ）。
検証用の一時スクリプトは削除済み。`git status`はdocs新規ファイル1件のみ。

# 東京ダート1600m gate suitability 実データ検証セット（CHECKPOINT 10.1）

**このデータはAbility Model V1の一部ではない。** `data/horses/*.json`とは完全に独立した、
CourseContextPrior / gate suitability の実データ検証専用データセットであり、
baseAbility/raceScore/memberLevel等の能力計算には一切使われない
（`gateValidationV1.ts`参照）。

- 出典: `tokyo_dirt1600_gate_validation_v1_10races.zip`（ユーザー提供、2026-08-22）
- 10レース・157スターター。venue=東京・surface=dirt・distance=1600mのみ
- 一次ソース: netkeiba（db.netkeiba.com）／競馬ラボ（keibalab.jp）の個別レース結果ページ
- `horseName`はJRA/netkeiba公式horseIdではない一時的な照合キー。既存の`data/horses/*.json`の
  horseIdへは変換・統合していない（このデータセット内でのみ、同一馬判定の補助に使用）
- オッズ・人気は収集条件にも評価にも使用していない
- 2025-11-02 東京7Rはfinishpositionが確認できた実スターター15頭のみ（fieldSize=15）
- 2025-11-16のレース（raceId 202505050406）には3着同着（finishPosition=3が2頭）が実在する
  （データ不整合ではなく実際のレース結果）

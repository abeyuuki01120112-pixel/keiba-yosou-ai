# 東京ダート1600m gate suitability 実データ検証セット（CHECKPOINT 10.1〜10.2）

**このデータはAbility Model V1の一部ではない。** `data/horses/*.json`とは完全に独立した、
CourseContextPrior / gate suitability の実データ検証専用データセットであり、
baseAbility/raceScore/memberLevel等の能力計算には一切使われない
（`gateValidationV1.ts`参照）。

## tokyoDirt1600RealRaces10.json（CHECKPOINT 10.1）

- 出典: `tokyo_dirt1600_gate_validation_v1_10races.zip`（ユーザー提供、2026-08-22）
- 10レース・157スターター。venue=東京・surface=dirt・distance=1600mのみ
- 一次ソース: netkeiba（db.netkeiba.com）／競馬ラボ（keibalab.jp）の個別レース結果ページ
- `horseName`はJRA/netkeiba公式horseIdではない一時的な照合キー。既存の`data/horses/*.json`の
  horseIdへは変換・統合していない（このデータセット内でのみ、同一馬判定の補助に使用）
- オッズ・人気は収集条件にも評価にも使用していない
- 2025-11-02 東京7Rはfinishpositionが確認できた実スターター15頭のみ（fieldSize=15）
- 2025-11-16のレース（raceId 202505050406）には3着同着（finishPosition=3が2頭）が実在する
  （データ不整合ではなく実際のレース結果）

## tokyoDirt1600Add20.json（CHECKPOINT 10.2）

- 出典: `tokyo_dirt1600_checkpoint10_2_add20_v2.zip`（ユーザー提供、2026-08-22。fieldSize定義修正版）
- 20レース・294スターター。venue=東京・surface=dirt・distance=1600mのみ。期間2025-05-04〜2025-06-01
- 一次ソース: netkeiba（race.netkeiba.com）の個別レース結果ページ
- `fieldSize`の定義は10races版と同一（数値のfinishPositionを持つ実フィニッシャー数）。
  初版ZIPでは4レース（202505020608/202505020712/202505020901/202505020906）のfieldSizeが
  「除外・取消・中止馬を含む出馬表頭数（declared field size）」になっており、10races版との
  定義不一致でSTOPしたのち、v2で実フィニッシャー数へ修正されたものを採用
- 上記4レースは、除外・取消・中止馬自身の行をCSVから除いた上でfieldSizeを実フィニッシャー数に
  修正しているため、除外・取消・中止された馬以外の1頭がhorseNumber > fieldSizeになる
  （出馬時のhorseNumberは除外後に詰め直されないため）。この場合`calculateRelativeGatePosition`は
  推測せず安全にnullを返す（CHECKPOINT10.1のエーデル同様の既知の構造的パターン）
- `horseName`は10races版と同じく一時的な照合キー。既存`data/horses/*.json`のhorseIdへは
  変換・統合していない

# Gate Suitability 実データ検証セット（CHECKPOINT 10.1〜14D.1D）

**このディレクトリ配下のデータはAbility Model V1の一部ではない。** `data/horses/*.json`
とは完全に独立した、CourseContextPrior / gate suitability の実データ検証専用データセットで
あり、baseAbility/raceScore/memberLevel等のproduction能力計算には一切使われない。
`horseAbilityData.ts`のproduction glob（`import.meta.glob("./data/horses/*.json")`）は
このディレクトリを走査しないため、混入する経路は構造的に存在しない。

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

## niigataTurf2000GateHistoryV1.json（CHECKPOINT 14D.1C〜14D.1D）

- 出典: `niigata_turf2000_gate_history_v1.zip`（ユーザー提供、2026-08-29。checksum検証済み）
- 10レース・153スターター。racecourse=新潟・surface=turf・distance=2000m・
  courseLayout=outerのみ（2021〜2025年の新潟大賞典・新潟記念、各年2レース）
- 一次ソース: netkeiba（db.netkeiba.com）の個別レース結果ページ
- **`horseId`は実在するproduction canonical horseId**（東京ダート1600m版と異なり、
  horseName一時照合キーではない）。ただしこのファイル自体は`data/horses/*.json`へは
  一切merge/importされていない（`niigataGateHistoryV1.ts`のみが読み込む）
- courseVariant（A/Bコース区分）は、過去各レースのA/B使用が信頼できるソースから
  独立確認できていないため全行null（推測補完なし）
- 出走取消2頭（2025新潟記念クイーンズウォーク・2024新潟記念ライトバック）はCSV本体から
  除外済み。この結果、該当2レースで1頭ずつhorseNumber > fieldSizeになるが、これは
  JRAが出走取消後に馬番を振り直さない実務上の帰結であり、データ欠陥ではない
  （CHECKPOINT14D.1Cで検証済み）
- **CHECKPOINT14D.1Cで一度production `data/horses/`へ実際にimportしたところ、
  MemberLevel機構経由でCURRENT TARGET（2026新潟記念）11頭中9頭のbaseAbilityが
  変動する（Stage A Rank入れ替え・整数表示変化を伴う）ことが判明し、即座にrevertした。**
  CHECKPOINT14D.1Dで`niigataGateHistoryV1.ts`による構造的分離
  （production glob対象外ディレクトリ＋isolated `buildRaceHistory()`実行＋
  production read-only参照によるAbility Control）を実装し、Zero Drift Contract
  （テストで検証済み）を満たすようにした

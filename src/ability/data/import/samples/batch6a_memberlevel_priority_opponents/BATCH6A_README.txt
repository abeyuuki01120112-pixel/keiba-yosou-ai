Batch6A / memberLevel abilityBeforeRace backfill - priority opponents

目的:
memberLevelScore(30%)を改善するため、まず top3/top5に効きやすい主要対戦馬8頭について、
対象レース「以前」の直近5走メタデータをJRA競走馬情報から確定。

対象馬:
メイショウタバル / クロワデュノール / ダノンデサイル
ジューンテイク / エリキング / エコロディノス
ジョバンニ / クイーンズウォーク

重要:
- このCSVはまだ abilityBeforeRace の完成値ではない。
- horse pageには上がり3Fやレース内中央値等がないため、各過去レースのraceScoreを完全計算するには
  対象レース結果ページから full-field 情報を追加収集する必要がある。
- jraRatingRt は検証参考列。baseAbility/memberLevel数式に代入禁止。
- 海外レースもJRA horse pageに掲載された公式成績を保持しているが、
  国内baselineが適用できない場合は勝手に補完しない。
- targetRaceより後の成績は絶対に能力計算へ使わない(no future leakage)。

今回Claudeに期待する作業:
1. 既存horseIdと馬名を照合
2. この8頭の targetRaceごとのlookback5をbackfill queueとして登録/確認
3. 既存データ内に同一レースfull-fieldがあるものは再利用
4. 不足する過去レースを重複除去して「次の収集対象レース一覧」にする
5. まだabilityBeforeRaceを推測値で埋めない

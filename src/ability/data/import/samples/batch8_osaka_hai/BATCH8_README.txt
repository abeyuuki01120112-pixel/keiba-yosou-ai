Batch8 / STEP2 memberLevel small-scope test

ゴール:
シェイクユアハート1頭の能力モデルV1検証。
memberLevelScoreだけが大きな残課題なので、
宝塚記念の上位3頭（クロワデュノール、メイショウタバル、ダノンデサイル）について
まず1走だけ abilityBeforeRace を作る感度テストを行う。

今回使うのは 2026-04-05 大阪杯 full-field 15頭のみ。
3頭全員が同じレースに出走しているため、最小データで3頭を同時に前進できる。

重要:
- 3頭の完全な直近5走 abilityBeforeRace を作るのではない。
- 大阪杯1走だけを使った「低信頼・暫定 abilityBeforeRace」。
- 大阪杯自体のmemberLevelがfallback/低信頼でも、勝手に補完しない。
- JRA Rating(Rt)は参考列のみ。能力数式に代入禁止。
- 数式・重み・no future leakage・MIN_RELIABLE_SAMPLE_COUNTは変更禁止。

確認したいこと:
宝塚記念のmemberLevelScoreが、
シェイクユアハート自身だけ参照 → 上位3頭を1走ずつ追加
でどの程度動くか。

この変化が小さければ大量backfillは後回し。
大きければmemberLevelの追加収集価値が高いと判断する。

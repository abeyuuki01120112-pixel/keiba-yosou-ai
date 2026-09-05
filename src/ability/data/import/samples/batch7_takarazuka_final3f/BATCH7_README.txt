Batch7 / 宝塚記念 final3F fallback解消用

現在のSTEP2ゴール:
シェイクユアハート1頭の能力モデル検証。
今回は範囲を広げず、宝塚記念の唯一残るfinal3F絶対評価fallbackだけを処理する。

JRA公式確認済み:
2022-11-13 エリザベス女王杯
阪神 turf 2200m 重
全18完走馬の推定上り3Fを収集。
レース内中央値 = 36.85秒。

扱い:
- 阪神 turf 2200 重 の exact courseFinal3FBaseline候補。
- sampleCount=1なので isReliable=false を必ず維持。
- 過去5年全レース網羅ではない。
- 数式・重み・MIN_RELIABLE_SAMPLE_COUNTは変更しない。

今回の目的:
2026宝塚記念シェイクユアハートのfinal3FScore絶対評価をdefaultFallbackから
「低信頼exact実データ」へ置換したときの影響だけを見る。

今回はmemberLevel / 30レースbackfill / 新規大規模収集には進まない。

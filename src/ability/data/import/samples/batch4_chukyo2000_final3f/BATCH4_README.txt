Batch4 / courseFinal3F baseline definition correction

目的:
Batch3で誤って「勝ち馬の上がり3F」だけを使っていたため、
JRA公式結果から「全完走馬」の推定上り3Fを収集し、
各レースの上がり3F中央値を作り直した。

今回の範囲:
- 2023 金鯱賞 中京芝2000 良
- 2024 金鯱賞 中京芝2000 良
- 2025 金鯱賞 中京芝2000 重

計算:
1. 各レースで全完走馬の final3FSeconds の中央値を算出。
2. courseFinal3FBaseline候補は「レース中央値の中央値」とした。
   馬数の多い1レースだけが過大に効かないよう、レースを等重みにする。
3. sampleCount は馬頭数ではなく「使用したレース数」。
4. sampleCount<15なので isReliable=false を維持すること。

重要:
- これは中京芝2000だけの第一弾。
- 2021/2022および他の中京2000レースをまだ完全網羅していない。
- 京都2000/2200も別Batchで続ける。
- 数式・重み・MIN_RELIABLE_SAMPLE_COUNTは変更しない。

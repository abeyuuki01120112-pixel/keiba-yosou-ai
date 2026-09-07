Batch5 / 京都 turf 2000・2200 full-field final3F

JRA公式レース結果から全完走馬の「推定上り」を収集。

対象:
- 2024 京都記念 京都芝2200 良
- 2025 京都記念 京都芝2200 稍重
- 2024 アンドロメダS 京都芝2000 良
- 2025 アンドロメダS 京都芝2000 良

計算:
- 各レース内で全完走馬final3Fの中央値を算出。
- courseFinal3FBaseline候補は「レース中央値の中央値」。
- sampleCountはレース数。
- sampleCount<15のため isReliable=false 維持。

目的:
- 京都記念（2026）のfinal3FScore絶対評価部分
- アンドロメダS（2025）のfinal3FScore絶対評価部分
を低信頼実データで置換できるか検証。

注意:
- 5年全レース完全網羅ではない。
- 数式・重み・MIN_RELIABLE_SAMPLE_COUNTは変更しない。
- exactが存在すれば現行ロジック通り採用されるか確認。

# Ability Model V1 既知の技術的負債（Technical Debt）

[`docs/ability-model-v1.md`](ability-model-v1.md)の下位文書。V1の完成判定（A：完成版として採用可能、
2026-08-22）を妨げるものではないが、将来の改善候補として記録する。**今回は修正しない。**

## 1. courseTimeBaselines fallback

競馬場×surface×距離×馬場状態の組み合わせのうち、多数（validate:data実行時点で48条件中25件）に
実データの5年基準タイムが無く、raceTimeScoreが中立値70点にフォールバックしている。該当レースの
raceScoreはraceTimeScore成分のみ実データを反映できていない。

## 2. courseFinal3FBaselines fallback

同様に、48条件中28件に上がり3F基準が無く、final3FScoreがレース内相対評価100%（絶対評価0%）で
算出されている。

## 3. 誤日付疑義の残存3件

`courseTimeBaselines.json`の阪神ターフ関連baselineのうち、2025-06-15同日開催の3レース
（武庫川特別・花のみちS・メイクデビュー阪神）が過去のある回で「誤日付データ」として集計から
除外された経緯がある。宝塚記念2025分については実データで是正済みだが、残り3件は元の個別raceの
生値をgit履歴から復元できず、未是正のまま残っている（集計後の中央値だけが残存し、個別値が
欠損）。

## 4. データ不足時のconfidence

対象馬自身がデビュー直後で過去走が少ない場合（例: シェイクユアハートの中日新聞杯時点、
sampleCount=1・confidence=low）、memberLevel算出における重みは小さくなる（weight=0.3）ものの、
対象馬自身のconfidence自体はデータの蓄積を待つ以外に改善する手段がない。これは実データ不足の
問題ではなく、対象馬のキャリア段階そのものに起因する本質的な制約であり、無理に埋めるべきでは
ない。

## 5. raceScoreの線形加重平均という制約

`raceScore.ts`の5コンポーネントは独立加重平均であり、「相手レベルが低いレースでの着差は
価値を割り引く」のような項目間の掛け算的な文脈評価にはなっていない（`docs/prediction-philosophy.md`
思想4・`docs/step6-decisions.md`衝突点2）。V1では変更しないことを確認済み。

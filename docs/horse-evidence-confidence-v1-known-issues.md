# HorseEvidence Confidence V1 既知の技術的負債（Technical Debt）

[`docs/horse-evidence-confidence-v1-design.md`](horse-evidence-confidence-v1-design.md)（CHECKPOINT10.5、
B案採用）・CHECKPOINT10.6実装の下位文書。V1（`resolveHorseEvidenceConfidence`）の正式採用を
妨げるものではないが、将来の改善候補として記録する。**今回はいずれも補正ロジックとして実装しない。**

HorseEvidence Confidence V1は`sampleCount`（該当条件での本人実績の走数）のみを根拠にしており、
以下の要因を一切考慮しない。

## 1. 枠位置の偏り

サンプルの走がすべて似た枠・馬番に集中している場合（例: CHECKPOINT10.5報告の
ファンタイムギフト、3走とも3〜4枠）、それは「枠適性の実証」ではなく「その馬・厩舎が
たまたま近い枠に収まりやすい」という別の交絡要因の可能性がある。現在のconfidenceは
枠の分散を見ない。

## 2. 馬場状態の偏り

3〜5走あっても、良馬場ばかり・重馬場ばかりのように偏っている場合、稍重・不良条件での
適性については実質的にサンプル不足のままである（STEP2で確定した通り、goingは
HorseEvidenceの完全一致条件に含めていないため、この偏りはconfidenceの値に反映されない）。

## 3. クラス差

1勝クラスでの実績とG1級での実績を同列に扱っている。相手関係の強さが大きく異なる
レースでの着順を、同じ「1走」としてsampleCountに数えている。

## 4. 頭数差

フルゲート（16頭）と少頭数（11〜13頭）のレースでは、同じ相対枠位置でも意味合いが
異なりうる。`relativeGatePosition`自体は毎走ごとに正しく再計算されるため数値としては
安全だが、confidenceの側でこの差を評価してはいない。

## 5. 古いデータ

現行データセット（`ALL_GATE_VALIDATION_ROWS`、2025年のみ）には該当例が無いが、
将来的に古い走のデータが混ざった場合、馬場改修・馬自身の成長/衰えを反映していない
実績まで「新しい実績と同じ重み」でsampleCountに数える設計になっている。

## 6. 実績の一貫性

5走すべて好走・5走すべて凡走・5走の内容がバラバラ、のいずれも現行V1では
同じ`confidence=high`になる（CHECKPOINT10.6の設計方針: confidenceはデータ量のみを表し、
質・方向性は`evidenceDirection`/`score`という別軸として将来分離する想定。今回は
`evidenceDirection`/`score`のいずれも未実装）。一貫性そのものをconfidenceに反映するか、
別途「安定性指標」として扱うかは未決定。

## 7. going別confidence

現行のconfidenceは対象条件（racecourse×surface×distance）全体で1つの値だが、
将来的に「良馬場での実績」「重馬場での実績」のようにgoing別へ分割したconfidenceを
別途設計する可能性がある。今回はそのような分割を行わず、goingは完全一致条件にも
confidence計算にも含めていない。

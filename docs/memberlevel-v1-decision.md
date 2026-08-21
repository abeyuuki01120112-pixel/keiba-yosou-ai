# memberLevel V1 正式決定（2026-08-21）

`docs/prediction-philosophy.md`・`docs/step6-decisions.md`の下位文書。宝塚記念2026を
題材にした一連の実データ検証（STEP5.2、複数回のZIPデータ補完ラウンド）の結果を受けて、
memberLevel V1として正式に決定した内容を記録する。

## 決定事項

**memberLevel V1の算出方式として「confidence考慮Top5（重み付き平均）」を正式採用する。**

```
memberLevel = Σ(ability_i × confidenceWeight_i) / Σ confidenceWeight_i   （Top5候補のみ）
confidenceWeight_i = CONFIDENCE_SHRINK_WEIGHTS[baseConfidenceFromSampleCount(n_i)]
```

実装は `src/ability/memberLevelCandidates.ts` の `calculateTopNConfidenceWeightedMean(candidates, 5)`。
`confidenceWeightFromSampleCount`／`baseConfidenceFromSampleCount`／`CONFIDENCE_SHRINK_WEIGHTS`は
STEP4/STEP6で確定済みの定義をそのまま再利用しており、今回新しい閾値・重みを作っていない。

宝塚記念2026における実測値: **confidence考慮Top5 = 75.4**。単純Top5平均(75.5)は比較・監査用の
参考値として引き続き保持する（V1の正式値としては採用しない）。

## 採用に至った検証根拠

複数回のZIPデータ補完（クロワデュノール・ダノンデサイル・ジューンテイク・メイショウタバル→
タガノデュード・ミクニインスパイア→ミュージアムマイル・レガレイラ）を経て、最終的なTop5候補
（宝塚記念2026より前のabilityBeforeRace降順）が下記の検証基準を満たしたことを確認した。

**検証基準**: 「Top5全頭が n≥3、またはconfidence=medium以上」

| 順位 | 馬名 | ability | n | confidence |
|---|---|---:|---:|---|
| 1 | メイショウタバル | 76.6 | 3 | medium |
| 2 | ミュージアムマイル | 75.6 | 5 | high |
| 3 | ダノンデサイル | 75.5 | 3 | medium |
| 4 | ミクニインスパイア | 75.2 | 5 | high |
| 5 | レガレイラ | 74.5 | 5 | high |

この基準を満たしたことを根拠に、これ以上Top5候補馬の追加データ収集は行わずmemberLevel V1を
確定した。

## 【重要・現状の実装との関係】

**`src/ability/memberLevel.ts`の`calculateMemberLevel()`（top3Average×0.4 + top5Average×0.3 +
fieldAverage×0.2 + depthScore×0.1）は、この決定を受けても本番の`raceHistoryPipeline.ts`内では
変更していない。** `raceHistoryPipeline.ts`が実際に呼び出す関数は引き続き`calculateMemberLevel()`
であり、`memberLevelScoreAtRace`は全レース・全馬について従来どおりのtop3/top5/field/depth方式で
算出され続ける。

今回の「V1正式決定」は、①宝塚記念2026という個別レースについて、confidence考慮Top5方式で
算出した値（75.4）を用いた場合の影響を監査用に再計算すること、②将来`memberLevel.ts`を
書き換える際の正式仕様を文書として確定すること、の2点を指す。**`raceHistoryPipeline.ts`への
実装への組み込み（`calculateMemberLevel()`の置き換え）は本ラウンドでは行っていない。** 実装の
組み込みは、影響範囲が全レース・全馬に及ぶ大きな変更であり、既存テスト（`memberLevel.test.ts`
等）の大幅な更新を伴うため、別途明示的な実装指示があった時点で着手する。

## 今後の運用

- 新しいレースのmemberLevel検証を行う際は、この文書のconfidence考慮Top5方式を正式仕様として
  参照する。
- Top5候補馬のうちn<3かつconfidence<mediumの馬が新たに浮上した場合、この決定の再検討が必要な
  場合がある（現時点では発生していない）。
- `calculateMemberLevel()`の実装置き換えに着手する場合は、影響範囲（全レース・全馬の
  raceScore・baseAbility）を事前に見積もり、既存テストへの影響を洗い出したうえで、別ラウンドの
  明示的な指示のもとで行う。

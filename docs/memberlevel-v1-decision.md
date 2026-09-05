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

## 【重要・現状の実装との関係】（2026-08-22 更新：本番実装完了）

**本番の`raceHistoryPipeline.ts`は、memberLevel V1（confidence考慮Top5重み付き平均）へ
移行済み。** `memberLevelScoreAtRace`は全レース・全馬について
`calculateTopNConfidenceWeightedMean(candidates, MEMBER_LEVEL_TOP_N=5)`
（`src/ability/memberLevelCandidates.ts`）で算出される。

旧方式（`src/ability/memberLevel.ts`の`calculateMemberLevel()`。top3Average×0.4 +
top5Average×0.3 + fieldAverage×0.2 + depthScore×0.1）は本番からは呼ばれなくなったが、
旧方式との比較・監査用にファイルとして残している。戻り値の型は新方式の
`MemberLevelBreakdown`（`types.ts`）と衝突しないよう、`memberLevel.ts`側に
`LegacyMemberLevelBreakdown`として独立させた。

`RacePerformance.memberLevelBreakdown`（`types.ts`の`MemberLevelBreakdown`）は、
候補馬が1頭も無い場合のみnull（フォールバック発動のシグナル）というトリガー条件を
旧方式のときと完全に維持したまま、非null時の内訳をTop5候補一覧
（horseId・ability・sampleCount・confidence・weight）＋weightedMean＋
simpleTop5Average（監査用参考値）＋participantCountへ置き換えた。
候補馬が5頭未満の場合も、存在する分だけで重み付き平均を計算し（パディングなし）、
候補が0頭の場合のみ既存のFALLBACK_MEMBER_LEVEL_SCORE（=50）にフォールバックする
（フォールバックのトリガー条件・値とも変更していない）。

## 今後の運用

- `memberLevelScoreAtRace`の算出は、今後もこの文書のconfidence考慮Top5方式
  （`calculateTopNConfidenceWeightedMean`）を正式仕様として参照する。
- Top5候補馬のうちn<3かつconfidence<mediumの馬が新たに浮上した場合、この決定の再検討が必要な
  場合がある（現時点では発生していない）。
- 旧方式（`memberLevel.ts`の`calculateMemberLevel()`）は比較・監査専用として残しており、
  本番計算には使わない。削除する場合は別途明示的な指示のもとで行う。

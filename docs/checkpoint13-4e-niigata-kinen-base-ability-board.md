# CHECKPOINT13.4E: 新潟記念11頭 Base Ability Board / B-SPEC整理

日付: 2026-08-24
**本ラウンドは報告・可視化・判断材料整理のみ。実装変更なし。**（`npm run provisional:check`の既存経路を実行して結果を収集しただけで、コード・データは一切変更していない）

---

## 1. Summary

| 指標 | 値 |
|---|---|
| Resolved | 11 / 11 |
| Unresolved | 0 / 11 |
| Ambiguous | 0 / 11 |
| Prediction Eligible | 7 / 11 |
| baseAbilityAvailable | **11 / 11**（全馬で数式上は算出可能） |
| Ineligible count | 4 / 11 |

**baseAbilityAvailable（数式上計算可能）とpredictionEligible（正式採用可能）は一致しない。** 11頭全員がbaseAbilityAvailable=trueだが、うち4頭はpredictionEligible=falseである。

## 2. Horse-by-Horse Base Ability Board（全11頭）

| # | horseName | canonicalHorseId | sourceHorseId | resolverStatus | predictionEligible | recentRaceCount | baseAbilityAvailable | baseAbility | memberLevelFallbackCount | ineligibleReasons |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | アーバンシック | 2021105436 | 2021105436 | resolved | **true** | 5 | true | 71.9 | 0 | — |
| 2 | サヴォーナ | 2020100734 | 2020100734 | resolved | **true** | 6 | true | 69.9 | 0 | — |
| 3 | ジュンブロッサム | 2019105118 | 2019105118 | resolved | **true** | 5 | true | 72.7 | 0 | — |
| 4 | ステレンボッシュ | 2021105743 | 2021105743 | resolved | **true** | 5 | true | 69.3 | 0 | — |
| 5 | ゾロアストロ | 2023106850 | 2023106850 | resolved | **false** | 5 | true | 74.4 | 1 | memberLevelUnavailable |
| 6 | ダノンシーマ | 2022104645 | 2022104645 | resolved | **false** | 5 | true | 77.1 | 1 | memberLevelUnavailable |
| 7 | チェルヴィニア | 2021105643 | 2021105643 | resolved | **true** | 6 | true | 69.0 | 0 | — |
| 8 | ドゥレッツァ | 2020103650 | 2020103650 | resolved | **false** | 5 | true | 66.0 | 1 | memberLevelUnavailable |
| 9 | バレエマスター | 2019104850 | 2019104850 | resolved | **true** | 5 | true | 72.2 | 0 | — |
| 10 | ボーンディスウェイ | 2019104658 | 2019104658 | resolved | **true** | 6 | true | 73.1 | 0 | — |
| 11 | ロデオドライブ | 2023107166 | 2023107166 | resolved | **false** | **4** | true | 76.7 | 1 | insufficientRecentHistory, memberLevelUnavailable |

`recentRaceCount`は`getHorseRecentRaces()`が返す全走数（6走の馬はキャリア6走以上、直近5走のみbaseAbility算出に使用）。`baseAbilityAvailable=true`の馬は全員、`predictionEligible=false`であってもbaseAbility値そのものは上表に記載済み（4節で明確に理由を分解する）。

全11頭とも`resolverStatus=resolved`（CHECKPOINT13.4Dで達成した状態が維持されている）。warnings欄には全馬共通で「馬場状態が未確定のためgoing適性はevaluated=false」が含まれる（推測補完なし、正常な状態）。

## 3. Ineligible Horses Detail（4頭）

| 馬名 | ineligible理由 | データ不足か仕様閾値か | 追加データで解消可能か |
|---|---|---|---|
| **ゾロアストロ** | memberLevelUnavailable | データ不足（当時の対戦相手データ未収集） | **可能性あり（DATA-FIXABLE）** |
| **ダノンシーマ** | memberLevelUnavailable | データ不足（当時の対戦相手データ未収集） | **可能性あり（DATA-FIXABLE）** |
| **ドゥレッツァ** | memberLevelUnavailable | データ不足（当時の対戦相手データ未収集） | **可能性あり（DATA-FIXABLE）** |
| **ロデオドライブ** | insufficientRecentHistory **+** memberLevelUnavailable | **仕様閾値問題（実キャリア4走のみ）** + データ不足の複合 | **insufficientRecentHistory側は解消不能（SPEC-DECISION-REQUIRED）**。memberLevelUnavailable側は理論上DATA-FIXABLEだが、解消してもinsufficientRecentHistoryが残る限りpredictionEligibleはfalseのまま |

各馬の具体的なフォールバック発生走（memberLevelBreakdown===nullとなった走）:

- ゾロアストロ: 2歳未勝利（2025-07-27、JRA-20250727-NIIGATA-02）。彼女のキャリア最初期の走で、当時の対戦馬の実データがまだ乏しかったための候補プール0件フォールバック。
- ダノンシーマ: 兵庫特別（2025-09-28、JRA-20250928-HANSHIN-09）。同様にキャリア初期の走。
- ドゥレッツァ: 金鯱賞（2024-03-10、JRA-20240310-CHUKYO-11）。5走中最も古い走。
- ロデオドライブ: 2歳新馬（2025-12-21、JRA-20251221-NAKAYAMA-05）。彼女の**実キャリア最初の走**（デビュー戦）。

いずれも「その馬自身の最も古い（または最初期の）走」でフォールバックが起きている点が共通している。これはBase Ability V1の構造上自然な現象であり（デビュー間もない時期は対戦相手の過去データもまだ薄いため）、特定のバグではない。

## 4. Rodeo Drive Audit（ロデオドライブ個別監査）

| 項目 | 値 |
|---|---|
| actual career race count（実キャリア総レース数） | **4走**（CHECKPOINT13.4B/13.4Cで確認済みのCSV実データと完全一致） |
| recognized race count（`getHorseRecentRaces()`が認識する走数） | 4走 |
| baseAbilityAvailable | **true** |
| baseAbility | **76.7**（4走の均等平均） |
| predictionEligible | **false** |
| ineligible reason | `insufficientRecentHistory`（4走 < RECENT_RACE_COUNT=5）、`memberLevelUnavailable`（デビュー戦がフォールバック） |
| missing dataの有無 | **無し。** 彼女の4走は全て実データとして正しく記録されており、データが欠損しているわけではない |

**5走目が存在しないのは「データが集められていない」からではなく、「彼女がまだ5回もレースに出走していない」という競走馬としての客観的事実そのものである。**

したがって、この状態は事実上：

> **`data missing`（データ欠損）ではなく、`spec threshold issue`（RECENT_RACE_COUNT=5という閾値の運用仕様問題）である。**

今回この閾値・仕様は一切変更していない（CHECKPOINT13.4B・13.4Dの結論を踏襲）。

## 5. insufficientRecentHistory Audit（現行コード上の発火条件）

`src/ability/predictionSnapshot.ts`の`buildHorseSnapshotEntry()`（`RECENT_RACE_COUNT=5`、`baseAbility.ts`で定義、無変更）を直接確認した、事実ベースの整理:

```
1. predictionCutoffAtより前の実データ過去走（priorRaces）が0件の場合
   → insufficientRecentHistoryが発火
   → baseAbility = null（baseAbilityAvailable=false）
   → 「能力0点」ではなく「算出不能」として扱われる（既存仕様通り）

2. priorRacesが1件以上あれば、その時点でbaseAbility = calculateBaseAbility(priorRaces)が
   必ず計算される（1走でも計算される。0走の場合のみnull）
   → baseAbilityAvailable=true

3. さらに、priorRaces.length < RECENT_RACE_COUNT（5未満）の場合、
   baseAbilityが計算済みであっても追加でinsufficientRecentHistoryが発火する
   → つまり「1走でもbaseAbility計算は可能だが、5走に満たなければ
     insufficientRecentHistoryフラグは必ず立つ」という状態が現行コードの実態
   → 4走でも、3走でも、1走でも同様に発火する（0走の場合と発火条件は同じフラグ名だが、
     baseAbilityがnullかどうかで意味合いが異なる。0走時はbaseAbility自体が無い「算出不能」、
     1〜4走時はbaseAbilityは有るが「不完全な標本数での算出」という別の状態）

4. memberLevelUnavailableは独立した別条件: baseAbility算出に使った直近最大5走のうち、
   1走でもmemberLevelBreakdown===null（当時の候補プール0件によるフォールバック）が
   あれば発火する。recentRaceCountとは無関係に判定される。
```

**まとめ**: `insufficientRecentHistory`は「5走未満なら常に発火」という単純な閾値判定であり、0走（baseAbility自体が無い）と1〜4走（baseAbilityはあるが標本不足）を同じフラグ名で表現している点が、今回のロデオドライブのケースのように「データ欠損なのか仕様閾値問題なのか」を外形的に区別しにくくしている一因である（4節参照）。

## 6. Data-fixable vs Spec-decision-required（分類まとめ）

| 馬名 | 分類 | 理由 |
|---|---|---|
| ゾロアストロ | **DATA-FIXABLE** | デビュー戦の対戦相手実データが追加されればmemberLevelUnavailableは解消しうる |
| ダノンシーマ | **DATA-FIXABLE** | 同上 |
| ドゥレッツァ | **DATA-FIXABLE** | 同上 |
| ロデオドライブ | **SPEC-DECISION-REQUIRED** | insufficientRecentHistoryは「実キャリア4走」という客観的事実に起因し、追加データでは解消不能。memberLevelUnavailable側は理論上DATA-FIXABLEだが、insufficientRecentHistoryが残る限りeligible化しない |

## 7. memberLevel Fallback Board（馬ごと）

| horseName | recentRaceCount(使用分) | memberLevelActualCount | memberLevelFallbackCount |
|---|---|---|---|
| アーバンシック | 5 | 5 | 0 |
| サヴォーナ | 5 | 5 | 0 |
| ジュンブロッサム | 5 | 5 | 0 |
| ステレンボッシュ | 5 | 5 | 0 |
| ゾロアストロ | 5 | 4 | 1 |
| ダノンシーマ | 5 | 4 | 1 |
| チェルヴィニア | 5 | 5 | 0 |
| ドゥレッツァ | 5 | 4 | 1 |
| バレエマスター | 5 | 5 | 0 |
| ボーンディスウェイ | 5 | 5 | 0 |
| ロデオドライブ | 4 | 3 | 1 |
| **合計** | **54** | **50** | **4** |

フォールバック率 = 4/54 = **7.4%**（CHECKPOINT13.4B/13.4Dから不変）。

## 8. Rank by Base Ability（単純順位、参考値）

| rank | horseName | baseAbility | predictionEligible |
|---|---|---|---|
| 1 | ダノンシーマ | 77.1 | false |
| 2 | ロデオドライブ | 76.7 | false |
| 3 | ゾロアストロ | 74.4 | false |
| 4 | ボーンディスウェイ | 73.1 | true |
| 5 | ジュンブロッサム | 72.7 | true |
| 6 | バレエマスター | 72.2 | true |
| 7 | アーバンシック | 71.9 | true |
| 8 | サヴォーナ | 69.9 | true |
| 9 | ステレンボッシュ | 69.3 | true |
| 10 | チェルヴィニア | 69.0 | true |
| 11 | ドゥレッツァ | 66.0 | false |

**これは単純なbaseAbility順位に過ぎない。** Final Race Ability・Field Score・勝率/連対率/複勝率のいずれでもない。上位3頭（ダノンシーマ・ロデオドライブ・ゾロアストロ）がpredictionEligible=falseである点は特に注意が必要（baseAbility自体は高くても、正式採用にはまだ使えない）。

## 9. Stage A前に決める必要がある仕様項目（優先順位順）

1. **ロデオドライブの「実キャリア4走」ケースの扱い**（4節・6節）: `insufficientRecentHistory`を「データ欠損」と「仕様閾値」に分離する新フラグを設けるか、あるいは現行のまま「5走ルールは一律」とするか。彼女が正式に出走する場合、この判断がなければpredictionEligible=falseのまま除外され続ける。
2. **ゾロアストロ・ダノンシーマ・ドゥレッツァのmemberLevelUnavailable解消のためのデータ収集要否**: 各馬のデビュー戦（または最初期走）時点の対戦相手実データを追加収集するか、それとも「初期走のフォールバックは許容する」という運用方針にするか。
3. **`insufficientRecentHistory`という1つのフラグが0走ケースと1〜4走ケースを混在させている点**（5節）の整理要否。将来的に「完全にデータが無い」と「データはあるが標本数が閾値未満」を区別する必要があるか。
4. **これら4頭のうち、新潟記念の枠順発表までにどこまで仕様判断を確定させるか**のスケジュール調整。

## 10. 判定

**A — Stage A前の仕様論点が十分整理された。枠順確定まで待ちながら、ChatGPTとB-SPEC判断へ進める。**

根拠:
- 11頭全員のBase Ability Boardを完全に可視化した（漏れなし）
- baseAbilityAvailableとpredictionEligibleを明確に分離して報告した
- 4頭のineligible理由を1頭ずつ完全分解し、DATA-FIXABLE/SPEC-DECISION-REQUIREDに分類した
- ロデオドライブについて「data missingではなくspec threshold issue」であることを明記した（仕様変更はしていない）
- insufficientRecentHistoryの発火条件をコード上の事実として正確に整理した
- memberLevel fallback board・単純順位も揃え、Stage A前に必要な判断材料は出揃った

無理にAを出したわけではない — 今回は新しい計算・新しい判定ロジックを一切追加しておらず、既存の正式経路（`runProvisionalDiagnostic` → `getHorseRecentRaces`）の出力をそのまま可視化しただけであり、Board自体に矛盾や欠落は見つからなかった（C判定に該当する材料はない）。残るのは9節の仕様判断のみであり、これは意図的にこのラウンドのスコープ外としている。

---

以上でCHECKPOINT13.4Eを完了する。実装変更は行っていない。**CHECKPOINT13.5・正式Stage A・CHECKPOINT14へは進まない。**

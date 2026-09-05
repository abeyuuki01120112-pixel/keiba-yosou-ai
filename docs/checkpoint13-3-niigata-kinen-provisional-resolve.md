# CHECKPOINT 13.3 新潟記念 Provisional Runner Resolve / Data Gap Audit

2026-08-24実施。2026年新潟記念の出走予定馬11頭（ユーザー提供、正式枠順・馬番・
馬場・オッズ未確定）を、既存のRunner Resolver → Prediction Eligibility →
Base Ability診断 → Missing Data Report → DATA REQUEST MANIFESTまで通した。
**正式Stage A / Prediction Snapshotは今回生成・保存していない。** Base Ability
V1・Suitability V1の数式・仕様は本ラウンドも一切変更していない。

## 1. Registered Runners（11頭）

| # | horseName | sourceHorseId |
|---|---|---|
| 1 | アーバンシック | 2021105436 |
| 2 | サヴォーナ | 2020100734 |
| 3 | ジュンブロッサム | 2019105118 |
| 4 | ステレンボッシュ | 2021105743 |
| 5 | ゾロアストロ | 2023106850 |
| 6 | ダノンシーマ | 2022104645 |
| 7 | チェルヴィニア | 2021105643 |
| 8 | ドゥレッツァ | 2020103650 |
| 9 | バレエマスター | 2019104850 |
| 10 | ボーンディスウェイ | 2019104658 |
| 11 | ロデオドライブ | 2023107166 |

`sourceHorseId`はユーザー提供のnetkeiba由来ID（`source = user_provided_netkeiba_reference`）
として保持し、canonical horseId（当システム内部ID）とは明確に分離した
（`ProvisionalRegisteredRunner`型に`canonicalHorseId`フィールドは存在せず、
Runner Resolverの出力としてのみ得られる設計）。今回、netkeibaへのアクセス・
スクレイピングは一切行っていない。

## 2. Resolve Summary

```
Resolved:      0 / 11
Unresolved:   11 / 11
Ambiguous:     0 / 11
Prediction eligible: 0 / 11
```

事前調査（`data/horses/`内の全40頭のファイル名・`simulation/data/sapporoKinen.json`
ロースター16頭の馬名）で、11頭のいずれの馬名・sourceHorseIdも既存canonicalデータ
と一致しないことを確認済み。**これは実際に`npm run provisional:check`を実行して
得られた正直な結果であり、想定どおり**（現在のcanonicalデータに2026新潟記念の
出走予定馬は1頭も含まれていない）。

## 3. Horse-by-Horse Report

11頭全馬が同一の結果になった（`npm run provisional:check -- src/ability/data/provisional/niigata-kinen-2026-registered.json`の実行結果より）：

| horseName | sourceHorseId | canonicalHorseId | resolverStatus | predictionEligible | dataKind | baseAbilityAvailable | warnings |
|---|---|---|---|---|---|---|---|
| アーバンシック | 2021105436 | (none) | unresolved | false | (unknown) | false | - |
| サヴォーナ | 2020100734 | (none) | unresolved | false | (unknown) | false | - |
| ジュンブロッサム | 2019105118 | (none) | unresolved | false | (unknown) | false | - |
| ステレンボッシュ | 2021105743 | (none) | unresolved | false | (unknown) | false | - |
| ゾロアストロ | 2023106850 | (none) | unresolved | false | (unknown) | false | - |
| ダノンシーマ | 2022104645 | (none) | unresolved | false | (unknown) | false | - |
| チェルヴィニア | 2021105643 | (none) | unresolved | false | (unknown) | false | - |
| ドゥレッツァ | 2020103650 | (none) | unresolved | false | (unknown) | false | - |
| バレエマスター | 2019104850 | (none) | unresolved | false | (unknown) | false | - |
| ボーンディスウェイ | 2019104658 | (none) | unresolved | false | (unknown) | false | - |
| ロデオドライブ | 2023107166 | (none) | unresolved | false | (unknown) | false | - |

全馬`reason: canonical horse not found`（Runner ResolverのPriority 1〜3いずれも
不一致。Priority 2＝`sourceHorseIdRegistry`は今回意図的に空のまま使用し、
netkeiba IDから当システムのcanonicalHorseIdを推測することは一切していない）。

## 4. Suitability Diagnostic

11頭とも`resolverStatus=unresolved`のため、canonicalHorseIdが無くSuitability
自体を計算するデータが存在しない（`suitabilityPreview: null`）。もし将来
いずれかの馬がresolveされた場合の挙動は、シェイクユアハート（既存の実データ、
テストで確認済み）で代わりに検証した：
- `going=null`（未確定）→ `going.evaluated=false`（100%と誤認させない）。
- `frame=null`/`horseNumber=null`（未確定）→ `gate.evaluated=false`。
- `going="重"`を明示的に与えた場合 → `going.evaluated=true`（実績に応じて
  正しく更新される）。

いずれもCHECKPOINT13/13.2の既存仕様どおりであり、`unknown`を100%として
埋める挙動は一切発生しないことを確認した。

## 5. Missing Data Summary

11頭全馬について、現在の`data/horses/`にレース実績データが1件も存在しない
（canonicalHorseId自体が無い＝過去走0件と同義）。これはBase Ability V1の
既存仕様上「能力0点」ではなく「評価不能・データ不足」を意味する
（`baseAbilityAvailable=false`、CLAUDE.md絶対原則4どおり）。

全体としての不足は単純明快: **11頭全員分の実際の過去走データが、当システムの
`data/horses/`に1件も投入されていない。** これは「一部データが古い」
「一部項目が欠けている」といった部分的な不足ではなく、完全な未投入状態である。

## 6. DATA REQUEST MANIFEST

11頭全員について、以下の最小限のデータを要求する（`npm run provisional:check`の
実行結果より、各馬共通の内容）：

```
<horseName> (sourceHorseId: <netkeiba ID>)

requiredRaces:
  - 直近5走程度（Base Ability V1の既存仕様の窓。それ以上の大量データは不要）
  - raceDate（実際の出走日。推測不可）
  - raceId（分かれば）
  - racecourse
  - raceName（分かれば）

requiredFields:
  - finishPosition
  - raceTime
  - timeGap
  - final3F
  - carriedWeight
  - passingPositions（可能なら）
  - 同レースの勝ち馬データ（raceTimeScoreの基準タイムに必要。勝ち馬欠落を防ぐため）
  - 同レースの実際の対戦馬データ（final3FScore/weightScore/memberLevelの
    比較母集団を成立させるため。対象馬の行だけでは自己参照的に中立化してしまう
    ——CHECKPOINT12.5/12.6で確認済みのメカニズム）
```

**重要（STEP13との整合）**: 対象馬11頭それぞれの直近走だけでなく、その
各レースに実際に出走していた他の馬（勝ち馬を含む）の実データも合わせて
必要である。対象馬の行だけを投入すると、final3FScore/weightScore/raceTimeScore/
memberLevelが比較母集団不足により自己参照的に中立化・誤評価されるリスクが
あることを、既にCHECKPOINT12.5/12.6/13.1で確認済み。今回のManifestはこの
教訓を反映し、対象馬の行だけを要求する内容にはしていない。

「過去データ全部ください」のような大量要求はしていない（各馬「直近5走程度」に
限定、既存Base Ability V1の`RECENT_RACE_COUNT=5`をそのまま参照しただけで
新しい数値を作っていない）。実際のraceId・raceDate・final3F等の具体的な値は
一切捏造していない（当方はこれらの実際の値を確認済みのデータとして持っていない
ため）。

全11頭分の詳細なManifest出力は`npm run provisional:check -- src/ability/data/provisional/niigata-kinen-2026-registered.json`
で再現可能（本ラウンドで新規追加したCLI）。

## 7. Prediction Output Contract V1（docs固定・型は今回未実装）

CHECKPOINT13.3 STEP14の指示どおり、将来の最終出力概念を文書として固定する
（ロジック・TypeScript型としての実装は行っていない。理由: 未実装のcomponentを
表す空のフィールドを持つ型を先に作ると「半端な実装」になり、CLAUDE.mdの
「no half-finished implementations」原則に反するため、今回はdocsのみとした）。

| 区分 | フィールド | 意味 | 今回の実装状況 |
|---|---|---|---|
| A. Absolute Ability | `baseAbility` | 馬そのものの絶対能力 | **実装済み**（Base Ability V1、凍結） |
| B. Suitability / Effective Ability | `distanceSuitability`/`courseSuitability`/`goingSuitability`/`gateSuitability`/`overallSuitabilityPercent`/`effectiveAbility` | 馬の能力×今回条件 | **実装済み**（Suitability V1、凍結） |
| C. Final Race Ability | `finalRaceAbility` | 展開・Track Bias・RaceContext等を加味した最終能力 | 未実装（`finalRaceAbility.ts`に骨格はあるが、Snapshot層からは呼ばない方針を維持） |
| D. Field Comparison | `fieldRank`/`fieldScore` | 出走馬内での横比較。Field Scoreは20〜90程度に広く分散しうる | 未実装 |
| E. Probability | `winProbability`/`top2Probability`/`top3Probability` | 確率出力 | 未実装 |
| F. Market / Value | `odds`/`fairOdds`/`expectedValue`/`buyScore` | 市場・期待値 | 未実装。オッズは能力計算へ逆流させない原則を維持 |

**点数の意味の混同禁止**（STEP15）: `baseAbility ≠ effectiveAbility ≠
finalRaceAbility ≠ fieldScore ≠ buyScore ≠ PRPS`。特にField Scoreが低い
（例:25）ことは「絶対能力が低い」ことを意味しない、という原則を明文化した。

**予想一貫性の将来原則**（STEP16、docsで確認のみ・ロジック未実装）: 将来、
展開予測で「差し・追込有利」等と判定した場合、人気馬だからという理由だけで
先行馬を上方修正しない。全出走馬へ同一のRace Scenarioを一貫して適用する。
市場人気・オッズは予測能力に影響させず、期待値判断にのみ使用する。

## 8. Test Results

- 新規テスト: `provisionalRunnerDiagnostic.test.ts`（17件）。
- **`npm test`（全体）: 635/635件pass**（CHECKPOINT13.2B時点618件から17件追加）。
- **`npm run lint`: エラーなし**。
- **`npm run build`: 型チェック・ビルドとも成功**。
- **`npm run validate:data`: 「検証成功（エラーなし）」**。`data/horses/`は
  本ラウンドで一切変更していないため警告内容も無変更。
- **実際のCLI実行**（`npm run provisional:check -- src/ability/data/provisional/niigata-kinen-2026-registered.json`）
  で11頭全員の診断結果・DATA REQUEST MANIFESTを確認し、実行前後で
  `data/horses/`のファイル一覧が完全に不変であることを確認した
  （`git status --short src/ability/data/horses/`で0件を確認）。

## 9. Base Ability V1への影響

**無変更**。`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/
`memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`/`raceHistoryPipeline.ts`は
1行も変更していない。`horseAbilityData.ts`も本ラウンドは無変更（CHECKPOINT13.2Bの
`getAllCanonicalHorseIds()`追加以降、変更なし）。診断用baseAbility算出は
`predictionSnapshot.ts`の`buildHorseSnapshotEntry()`（CHECKPOINT13、無変更）を
そのまま再利用しており、`buildRaceHistory()`を対象11頭の部分データで
再実行することは無い（テストTest6・Test7で確認済み。シェイクユアハートの
baseAbility=70.3が正式経路のまま再現されることも確認済み）。

## 10. Suitability V1への影響

**無変更**。`suitabilityV1.ts`/`distanceSuitability.ts`/`courseSuitability.ts`/
`goingSuitability.ts`/`courseContextPrior.ts`/`horseGateEvidence.ts`/
`suitabilityConfidence.ts`は1行も変更していない。`predictionSnapshot.ts`
（CHECKPOINT13、無変更）の既存sentinel機構をそのまま利用し、going/frame/
horseNumber未確定時にevaluated=falseへ構造的に帰着させているだけで、
Suitability V1自体には一切手を加えていない。

## 11. 判定: B

**A（必要データが揃っており、正式枠順確定後Stage Aへ進める）ではない。
無理にAは出さない。**

理由:
- **resolver / canonical data構造自体には問題が無い**（Cではない）。
  Runner Resolver・Prediction Eligibility判定・Missing Data Report・
  DATA REQUEST MANIFESTはすべて設計どおり正しく機能し、11頭全員について
  正直で一貫した診断結果を出力できた。
- しかし、**2026新潟記念の出走予定馬11頭のうち、正式Base Ability/Suitability
  計算に必要な実データが現時点で1頭も投入されていない**（Prediction eligible:
  0/11）。これは正式枠順確定を待つ以前の問題であり、実データの追加投入が
  必須。したがってB判定（追加データZIPが必要）とする。

## 12. 次にChatGPTと決める必要がある項目（優先順位順）

1. 上記DATA REQUEST MANIFESTに基づき、11頭分の実データZIPを準備できるか
   （直近5走程度＋各レースの比較母集団データ）。11頭全頭は負荷が大きい場合、
   優先順位（人気想定馬から等）を絞ってよいか。
2. 正式枠順確定のタイミングで、Race Card Input V1（CHECKPOINT13.2B）の
   frame/horseNumber/goingを正式投入し、Stage Aへ進める運用フローの確認。
3. `sourceHorseId`（netkeiba ID）→ canonicalHorseIdの正式な対応表を
   将来作るかどうか（今回は意図的に未投入のまま）。
4. Prediction Output Contract（STEP14）のC〜Fフェーズ着手の優先順位・時期。

ここでSTOPします。不足データがあるため、DATA REQUEST MANIFESTを提示した状態で
待機します。自動収集・スクレイピング・CHECKPOINT14へは進みません。

# HorseEvidence V1 成長型/低下型検証ZIP監査 — STEP1でSTOP（CHECKPOINT 10.14再送分）

**作成日: 2026-08-23。ステータス: STEP1のZIP監査でSTOP。本番コード変更なし。**

`horse_evidence_growth_validation_v1.zip`（6頭・18行、成長型候補4頭＋低下型候補2頭）を
受領した。**STEP1のZIP監査で必須列の欠損が確認されたため、STEP2以降には進んでいない。**

## STEP1: ZIP監査結果 — STOP

### 確認できた項目

- CSVの構造自体（ヘッダー行＋18データ行）は正常にパースできた。
- `raceId`・`horseId`・`horseName`・`raceNumber`・`horseNumber`・`finishPosition`・
  `fieldSize`・`final3FSeconds`・`timeGapSeconds`・`source`は値が入っており、
  明らかな異常値は見られなかった。
- 各馬の行は日付順に矛盾なく並んでいた（future leakageを起こす時系列の乱れは無かった）。
- `horseNumber`が`fieldSize`を超える行は無かった。

### 発見した問題（列名の不一致・値の表記違い）

以下は**値そのものは正しく、列名や表記が既存importパイプラインと異なるだけ**のため、
検証スクリプト内で機械的に対応できた（値の変更・推測は無し、本番コード無変更）。

- `date` → 既存の`raceDate`に相当（単純リネーム）
- `carriedWeight` → 既存の`carriedWeightKg`に相当（単純リネーム）
- `gateNumber` → 既存の`gate`に相当（単純リネーム）
- `surface`が`"芝"`/`"ダート"`という日本語表記（既存は`"turf"`/`"dirt"`という英語区分）
  → `"芝"`→`"turf"`、`"ダート"`→`"dirt"`の1対1翻訳で対応可能

### STOP条件に該当した問題（対応不可）

**`actualRaceTimeSeconds`（走破タイム・秒）に相当する列がCSVに一切存在しない。**
`final3FSeconds`（上がり3F）はあるが、これは走破タイム全体とは別の指標であり
代用できない。上記のリネーム・翻訳をすべて適用した上で既存の`buildImportResult()`
（本番と同じ関数、読み取り専用で呼び出し）に通した結果、**18行すべてが
`excludedFromScoringCount`（欠損のためraceScore算出対象外）となり、正常データは
0件だった。**

```
totalRows: 18, normalizedCount: 18, excludedFromScoringCount: 18, errorCount: 0
```

`raceScore`は`memberLevelScoreAtRace`・`timeGapScore`・`raceTimeScore`・
`final3FScore`・`weightScore`の5要素の加重平均であり、`raceTimeScore`の算出には
走破タイムが必須（`toRaceHistoryRawInput()`の既存仕様：finishPosition・
carriedWeightKg・actualRaceTimeSeconds・final3FSeconds・timeGapSecondsの
いずれか1つでも欠けるとその行はraceScore算出対象から安全に除外される）。
**したがって、今回のZIPのままでは6頭のうち1頭たりともrawPerformanceDeltaを
算出できない。** 走破タイムを推測・代入することは「実データ以外を使わない」
という絶対原則に反するため行っていない。

**STEP1の明示的なSTOP条件「必須列欠損...があればSTOP」に該当するため、
STEP2（時系列ルール）以降には一切進んでいない。**

## Base Ability V1への影響

今回はZIP監査のみで、いかなる計算も実行していない。`raceScore.ts`・`baseAbility.ts`・
`memberLevel.ts`・`abilityBeforeRace.ts`・`timeGapScore.ts`・`raceTimeScore.ts`・
`final3FScore.ts`・`weightScore.ts`はいずれも今回変更していない。シェイクユアハート
baseAbility=70.3も影響を受けていない（`abilityModelV1.regression.test.ts`で再確認、
変化なし）。

## test/lint/build/validate:data

本番コードを変更していないため、念のための確認のみ実施: `npm test` 509/509成功、
`abilityModelV1.regression.test.ts` 3件成功（変化なし）。

## 次にChatGPTと決める必要がある項目（優先順位順）

1. **走破タイム（actualRaceTimeSeconds、秒単位）列を追加した修正版ZIPの再提供を
   お願いします。** 対象は今回と同じ6頭・18行（キタサンブラック・ジェンティルドンナ・
   アーモンドアイ・ドウデュース・ウオッカ・ゴールドシップ、各3走）のままで構いません。
   列名は`raceTimeSeconds`または`actualRaceTimeSeconds`のいずれでも、検証スクリプト側で
   機械的に吸収できます（今回同様、値の翻訳・リネームのみで対応し、本番コードは
   変更しません）。
2. あわせて、`surface`列は`"turf"`/`"dirt"`の英語表記、`date`は`raceDate`、
   `carriedWeight`は`carriedWeightKg`、`gateNumber`は`gate`という正式列名で
   提供いただけると、監査の手間が減ります（今回のような表記違いでも対応は
   可能なため、必須ではありません）。
3. CHECKPOINT10.14既報の残課題（成長型CASE Cはウオッカ1例のまま未解決、低下型逆CASEは
   ジェンティルドンナ1例でC水準を確認済みだがn=2で構造的か未判定）は、今回のZIPが
   修正版として再提供され次第、続けて検証します。

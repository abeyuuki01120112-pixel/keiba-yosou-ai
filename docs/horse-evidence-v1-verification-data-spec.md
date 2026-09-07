# HorseEvidence V1 検証用実データ収集仕様（CHECKPOINT 10.9A）

**作成日: 2026-08-22。ステータス: 仕様確定・データ未受領。ロジック実装は行っていない。**

CHECKPOINT10.9で「同条件3走以上の馬が1頭しか確保できない」ためSTOPした結果を受け、
HorseEvidence V1（neutral閾値・aggregatedDelta・consistency・confidence・外れ値耐性・
成長/衰えとの混同リスク）を実データで検証するための、最小限の追加データセット仕様を確定する。
**本文書はデータ仕様の確定のみであり、新しいロジックの実装は行っていない。**

## STEP1: 1走あたりの必須データ項目

既存の実装（`src/ability/import/normalize.ts`の`normalizeRacePerformance()`、
`src/ability/import/types.ts`の`RacePerformanceInput`）をそのまま流用する
（重複実装なし）。normalize.tsが実際に読む列名をそのまま採用する。

| 項目 | 必須/任意 | 用途 |
|---|---|---|
| `raceId` | 必須 | レース識別（同一レースの複数馬を束ねるキー） |
| `horseId` | 必須 | 馬識別（このデータセット専用の一時ID可。ロスターの内部IDと一致させる必要はない） |
| `horseName` | 必須 | 表示・監査用 |
| `raceDate` | 必須（YYYY-MM-DD） | 時系列処理（future leakage防止）の基準 |
| `racecourse` | 必須 | HorseEvidence条件（racecourse×surface×distance）の一部 |
| `raceName` | 必須 | normalize.tsの必須項目（レース格付けとしては使わない） |
| `raceNumber` | 任意 | 同日レースのfuture leakage判定に使用（無くても動作する） |
| `surface` | 必須（"turf"/"dirt"） | HorseEvidence条件の一部 |
| `distance` | 必須（メートル） | HorseEvidence条件の一部 |
| `going` | 必須 | 一致条件には使わないが保持（後で分解可能にするため） |
| `finishPosition` | 任意（nullなら能力計算対象外） | raceScore算出に必要 |
| `carriedWeightKg` | 任意（同上、40〜70kg想定） | raceScore算出に必要 |
| `actualRaceTimeSeconds` | 任意（同上） | raceScore算出に必要 |
| `final3FSeconds` | 任意（同上） | raceScore算出に必要 |
| `timeGapSeconds` | 任意（同上。勝ち馬は負値可） | raceScore算出に必要 |
| `gate` | 任意 | 枠番（1〜8）。HorseEvidenceの付随情報 |
| `horseNumber` | 任意 | 馬番 |
| `fieldSize` | 任意 | 出走頭数 |

**重要な補足**: `finishPosition`〜`timeGapSeconds`の5項目は1つでも欠けるとその走のraceScoreが
算出できず、その走は集計対象から安全に除外される（`toRaceHistoryRawInput()`の既存仕様）。
**HorseEvidence検証のためには、対象条件の3走以上だけでなく、rawPerformanceDelta算出に必要な
abilityBeforeRace（各走の直前最大5走の平均）を計算するため、対象馬の直前の他条件レースも
含めた、実質的な連続履歴が必要。** 対象条件の走だけを抜き出して提供すると、その馬の最初の
対象条件走でabilityBeforeRaceが算出不能（prior races不足）になる可能性が高い。

**既知の制約（新規に発見したものではなく、既存の`data/horses/`データにも共通する制約）**:
`raceHistoryPipeline.buildRaceHistory()`は同一`raceId`を共有する全行を「そのレースの出走馬全員」
として扱い、`memberLevelScoreAtRace`（レースの相手関係の強さ）をその全員のabilityBeforeRaceから
算出する。**対象馬1頭分の行しか提供しない場合、そのレースの「相手」は対象馬自身1頭だけになり、
memberLevelScoreAtRaceが自己参照的な値になる**（実際の相手関係を反映しない）。これは今回新たに
課す制約ではなく、既存の`data/horses/`データの大半も同じ前提で作られている（相手馬全員のデータを
毎回添えているわけではない）。したがって**今回は対象馬1頭分の行のみで問題ない**（既存データとの
一貫性を優先）。ただし、この制約はrawPerformanceDeltaの解釈上の限界として記録する
（下記「Base Abilityへの影響」の次に補足）。

## STEP2: 対象条件（変更なし）

CHECKPOINT10.9Aで指示された条件をそのまま採用する。

- 同一馬・同一`racecourse`・同一`surface`・同一`distance`で3走以上（可能なら4〜5走以上）
- 結果の良し悪し・人気・オッズを選定基準にしない
- 最低5頭、推奨8〜10頭
- 総対象走数：最低15走以上、推奨30〜40走程度

## STEP3: CSV schema（既存importとの互換性を最優先）

1行=1馬1走。**既存の`normalizeRacePerformance()`が読む列名をそのまま使う**ため、
`npm run import:csv`と全く同じ形式で受け取れる（新しいパーサ・変換層は不要）。

```
raceId,horseId,horseName,raceDate,racecourse,raceName,raceNumber,surface,distance,going,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,gate,horseNumber,fieldSize,source,sourceUrl
```

| 列 | 型 | nullable | 備考 |
|---|---|---|---|
| raceId | string | 不可 | |
| horseId | string | 不可 | このデータセット専用の一時ID可 |
| horseName | string | 不可 | |
| raceDate | string(YYYY-MM-DD) | 不可 | |
| racecourse | string | 不可 | 例: "東京"（既存データの表記に合わせる） |
| raceName | string | 不可 | カンマを含まないこと（CSVパーサがカンマ区切り固定のため） |
| raceNumber | number | 可 | |
| surface | "turf"\|"dirt" | 不可 | |
| distance | number | 不可 | メートル |
| going | string | 不可 | 例: "良"/"稍重"/"重"/"不良" |
| finishPosition | number(>=1) | 可 | 空欄可（除外扱いになる） |
| carriedWeightKg | number(40-70) | 可 | 同上 |
| actualRaceTimeSeconds | number(>0) | 可 | 同上 |
| final3FSeconds | number(>0) | 可 | 同上 |
| timeGapSeconds | number | 可 | 勝ち馬は負値可。同上 |
| gate | number(1-8) | 可 | |
| horseNumber | number | 可 | |
| fieldSize | number | 可 | |
| source | string | 可 | 出典（provenance用。import処理では無視される列） |
| sourceUrl | string | 可 | 出典URL（同上） |

**注意**: CSVパーサ（`csvParser.ts`）はカンマ区切り固定で、フィールド内カンマ・改行に対応しない。
`raceName`・`racecourse`等にカンマを含めないこと。`#`で始まる行はコメントとして無視される。

## STEP4: ZIP受領後にClaudeが自立実行する処理（今回は実装しない、計画のみ）

ZIP受領後、以下をCHECKPOINTまで確認を挟まず自立実行する。

1. **ZIP監査**: ファイル構成・CSVの存在確認
2. **schema確認**: 上記列名・型が揃っているか（`parseCsv`→`normalizeRacePerformance`をそのまま
   利用して検証。新しいバリデータは作らない）
3. **重複確認**: `raceId`×`horseId`の重複行が無いか
4. **future leakage確認**: 提供された各馬の履歴が時系列として矛盾していないか
   （同日複数レース等の異常も含む）
5. **horseId/raceId整合性確認**: 同一`raceId`内で`racecourse`/`surface`/`distance`/`raceDate`が
   行によって食い違っていないか
6. **同条件グループ生成**: `racecourse`×`surface`×`distance`完全一致でグルーピング
   （`horseGateEvidence.ts`の`collectHorseGateEvidence`と同じロジックをテストコード内で再利用）
7. **rawPerformanceDelta再計算**: `buildRaceHistory()`→`calculateAbilityBeforeRace()`
   （CHECKPOINT10.7で確立した方法をそのまま使用。**ここで定義変更が必要になった場合はSTOP**）
8. **neutral閾値比較**: ±0.5/0.75/1.0/1.25/1.5/2.0（CHECKPOINT10.8の分析を拡張データで再実施）
9. **平均/中央値/trimmed/winsorized比較**: サンプル数に応じて適用可能な方式のみ比較
10. **consistency比較**: 符号一致率を中心に、必要なら分散指標も併記
11. **CASE A〜F検証**: 継続positive/継続negative/混在/外れ値/改善/悪化の6パターンを実データから探索
12. **HorseEvidence V1最終判定**: A（正式採用可能）/B（ほぼ完成）/C（まだデータ不足）を提示
13. **baseAbility=70.3維持確認**: `abilityModelV1.regression.test.ts`実行
14. **必須テスト**: `npm test` / `npm run lint` / `npm run build` / `npm run validate:data`

**データの保存場所**: このデータセットはCHECKPOINT10.4〜10.6の`data/gateValidation/`と同様、
**本番`data/horses/`とは独立した検証専用ディレクトリ**（例: `data/horseEvidenceValidation/`）に
配置し、production dataへは混入させない。読み込みは`buildRaceHistory()`を検証テスト内で
直接呼び出す方式とし、`horseAbilityData.ts`（本番ロスターの読み込み経路）は変更しない。

### STOP条件（今回指示された条件をそのまま採用）

- 必須項目欠損
- 推測補完が必要
- 同条件3走以上の馬が5頭未満
- future leakageの疑い
- Ability Model V1の変更が必要
- Suitability V1統合判断が必要

## STEP5: 収集量の推奨

**B（8〜10頭×3〜5走程度）を推奨する。**

理由:
- A（5頭×3〜5走）はSTOP条件を形式的に満たすだけで、CHECKPOINT10.8で確認した通り
  「confidence=high（5走以上）」の実例がこれまで一度も無く、trimmed/winsorized平均も
  n>=5でなければ機能しない。5頭ちりぎりでは、これらの検証がまた「実例0件」で終わる
  リスクが高い。
- B（8〜10頭×3〜5走）であれば、複数頭がn=4・n=5に届く可能性が上がり、
  CHECKPOINT10.8で「未検証」のまま残った項目（trimmed/winsorized、confidence=high、
  ±1.25/±1.5等の閾値の効き方）を実際に検証できる見込みが高まる。
- C（それ以上）はユーザー自身が「大規模収集は不要」と明示しており、HorseEvidence V1の
  検証という今回の目的に対して過剰。

## Base Abilityへの影響

`raceScore.ts`・`baseAbility.ts`・`memberLevel.ts`・`timeGapScore.ts`・`raceTimeScore.ts`・
`final3FScore.ts`・`weightScore.ts`は今回変更していない。新しいロジックの実装も行っていない
（既存関数の読み方を確認しただけ）。

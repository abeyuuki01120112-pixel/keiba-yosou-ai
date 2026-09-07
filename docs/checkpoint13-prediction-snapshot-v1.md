# CHECKPOINT 13 — 実戦適用基盤 V1（Prediction Snapshot）

2026-08-24実施。凍結済みのBase Ability V1（`docs/ability-model-v1.md`）・
Suitability V1（`docs/suitability-v1-*.md`）の数式・component weight・
confidence/coverage分離仕様は一切変更していない。今回追加したのは
「実際のレース出走馬全頭へ、レース結果を見る前の時点で同一ルールを適用し、
再現可能な形で固定するSnapshot層」のみである。

## 事前調査（STEP14）で確認した既存資産・不足・危険箇所

- **再利用**: `computeSuitabilityV1()`（`suitabilityV1.ts`、無変更）、
  `calculateBaseAbility()`（`baseAbility.ts`、無変更）、`RaceGateInput`型
  （`courseContextPrior.ts`）、`SuitabilityTargetRaceContext`型
  （`suitabilityTypes.ts`）、`SuitabilityV1Result`型（`suitabilityV1Types.ts`）
  ―― いずれも無変更のまま直接呼び出す。
- **危険箇所として特定**: `finalRaceAbility.ts`の`computeFinalRaceAbility()`は
  `effectiveAbility`だけでなく`RaceContext`/`trackBias`/`paceScenario`/
  `finalRaceAbility`まで計算してしまう。CHECKPOINT13は「まだ触らないもの」に
  RaceContext本格設計・展開予測・Track Bias・Final Race Abilityを明記しているため、
  この関数は**呼び出さず**、`effectiveAbility = baseAbility × overallSuitabilityPercent / 100`
  という同じ式をSnapshot層内で直接計算するに留めた。
- **危険箇所として特定**: `SuitabilityTargetRaceContext.going`は`string`必須型で
  「不明」を表現できない。仮に「良」等をプレースホルダーとして渡すと、その馬が
  過去に本当に「良」馬場を走っていた場合に誤ってevaluated=trueになってしまう
  （推測データの混入）。`goingSuitability.ts`の`goingIndex()`が
  `GOING_ORDER.indexOf()`で未知の文字列に対し常に-1を返す（＝重み0＝
  sampleCount=0＝evaluated:false に構造的に帰着する）という**既存コードの
  挙動をそのまま利用し**、実在するJRA馬場状態表記と衝突しない
  sentinel文字列（`GOING_UNKNOWN_SENTINEL = "unknown"`）を用意することで、
  `goingSuitability.ts`・`suitabilityV1.ts`を一切変更せずに「going未確定→
  evaluated:false」を実現した。
- **不足**: `horseAbilityData.ts`の既存2関数（`loadHorseAbilityProfile`/
  `loadAllHorseAbilityProfiles`）は、いずれも`loadDefaultHorses()`
  （`simulation/data/sapporoKinen.json`のロースター）に登録済みのhorseIdしか
  扱えない。毎週の実戦レースは任意のhorseIdを含みうるため、sapporoKinen.json
  登録有無を問わず`data/horses/`の実データから直接引ける新しいアクセサが必要
  だった。
- **既存テストへの影響**: ゼロ。`horseAbilityData.ts`への変更は新規exportの
  追加のみで、既存2関数・`historyByHorseId`の計算方法は無変更。

## 1. 変更内容

| ファイル | 内容 |
|---|---|
| `src/ability/horseAbilityData.ts` | `export function getHorseRecentRaces(horseId): RacePerformance[]` を追加（既存の`historyByHorseId`を参照するだけの薄いアクセサ。既存2関数・既存の計算方法は無変更） |
| `src/ability/predictionSnapshot.ts` | 新規。Stage A/B Snapshotビルダー、Ability Board構築関数、`race_not_held`状態の型 |
| `src/ability/raceResultTypes.ts` | 新規。レース後データ・PRPSの型のみ（採点ロジックは未実装） |
| `src/ability/__tests__/predictionSnapshot.test.ts` | 新規。STEP13 A〜I全項目＋future leakage＋race_not_held＋T-2h算出のテスト（19件） |

Base Ability V1・Suitability V1関連ファイル（`raceScore.ts`/`baseAbility.ts`/
`memberLevel.ts`/`suitabilityV1.ts`/`goingSuitability.ts`/`distanceSuitability.ts`/
`courseSuitability.ts`/`courseContextPrior.ts`/`horseGateEvidence.ts`等）は
1行も変更していない。

## 2. Stage A（Gate Confirmed Snapshot）

`buildGateConfirmedSnapshot(input)`を実装した。トリガーは「正式な枠順確定後」。
`predictionCutoffAt`は`generatedAt`（Snapshot生成時刻）をそのまま使う。

- 全馬について baseAbility / distance・course・going・gate Suitability /
  overallSuitabilityPercent / effectiveAbility / overallConfidence /
  evaluatedComponentCount を保存する（`HorseSnapshotEntry`）。
- goingが未確定の場合は`{ evaluated: false }`を渡すことで、
  `suitability.going.evaluated === false`・`adjustedPercent === 100`
  （中立、推測補完なし）を構造的に保証する。
- 出走取消（`scratched: true`）の馬はbaseAbility等を算出せず、
  warningsにその旨を記録する。

## 3. Stage B（T-2h Snapshot）

`buildT2hSnapshot(input)`を実装した。`predictionCutoffAt`は
`computeT2hCutoff(raceTarget.postTimeIso)`（発走予定時刻−2時間）で算出し、
Snapshotの実際の生成時刻（`generatedAt`）とは独立して固定する。

- Stage Aと同じ`buildHorseSnapshotEntry()`を再利用し、goingが確定していれば
  `{ evaluated: true, going: "..." }`を渡すことで4/4 component evaluated:true
  も自然に得られる状態にした（新しい評価ロジックは追加していない）。
- Stage Bでのみ`odds: OddsSnapshotEntry[] | null`フィールドを用意した（STEP7）。
  `buildHorseSnapshotEntry()`の内部にはoddsを読み取るコードが一切無いため、
  oddsを渡しても渡さなくてもbaseAbility/suitability/effectiveAbilityは
  常に完全一致する（テストG参照）。

## 4. Ability Board

`buildAbilityBoard(snapshot): AbilityBoardRow[]`を実装した。1行の内容：

```
horseId, horseName, frame, horseNumber, scratched,
baseAbility, distanceSuitability, courseSuitability, goingSuitability, gateSuitability,
overallSuitabilityPercent, effectiveAbility, overallConfidence, evaluatedComponentCount,
warnings, rankByBaseAbility, rankByEffectiveAbility
```

サンプル（テストHで使用したフィクスチャの結果、抜粋）：

| horseName | baseAbility | overallSuitabilityPercent | effectiveAbility | rankByBaseAbility | rankByEffectiveAbility |
|---|---|---|---|---|---|
| シェイクユアハート | 70.3 | (goingUnknownのため2/4評価) | baseAbility×overallSuitabilityPercent/100 | 1 | 1 |
| データ無し馬 | null（データ不足） | null | null | null | null |
| 取消馬（出走取消） | null | null | null | null | null |

`rankByBaseAbility`と`rankByEffectiveAbility`は独立に算出され、両方を保持する
ため、適性によって誰が上がり誰が下がったかを比較できる。ランクは降順
（1位が最大値）で、出走取消・データ不足馬は`null`（ランク対象外、0点として
数えない）。

## 5. Snapshot / future leakage対策

- `predictionCutoffAt`は各Snapshotに保存され、`buildHorseSnapshotEntry()`は
  `getHorseRecentRaces(horseId)`（対象馬の全履歴、新しい順）を
  `raceDate < predictionCutoffAt`でフィルタしてから`calculateBaseAbility()`/
  `computeSuitabilityV1()`に渡す。cutoff以降の日付の走は構造的に使われない
  （テスト「future leakage防止」で、cutoffを彼女の最新走当日に設定すると
  baseAbilityが70.3から変化することを確認済み）。
- `buildGateConfirmedSnapshot`/`buildT2hSnapshot`はいずれも純粋関数で、
  呼び出しのたびに新しいオブジェクト（`runners`配列含む）を返す。共有状態を
  一切持たないため、Stage B生成がStage Aオブジェクトを書き換えることは
  構造的に不可能（テストFで、Stage A生成→Stage B生成後もStage Aの
  JSON表現が完全に不変であることを確認）。
- レース中止・開催不成立は`buildRaceNotHeldSnapshot(raceId, reason, recordedAt)`
  で、通常のpredictionとは別の`raceStatus: "raceNotHeld"`型として保存する
  （代替レースへの差し替えという概念自体が無い設計）。
- `raceId`/`stage`/`predictionCutoffAt`/`generatedAt`/`runners`/
  `inputVersion`/`modelVersion`/`dataCompleteness`/`warnings`を
  `PredictionSnapshot`型の必須フィールドとして保存する。

## 6. Test Results

- `npx vitest run src/ability/__tests__/predictionSnapshot.test.ts`:
  **19/19件pass**（STEP13 A〜I全項目＋future leakage＋race_not_held＋
  computeT2hCutoff）。
- `npm test`（全体）: **553/553件pass**（既存534件＋新規19件、既存テストへの
  回帰なし）。
- `npm run lint`: エラーなし。
- `npm run build`: 型チェック・ビルドとも成功。
- `npm run validate:data`: 「検証成功（エラーなし）」。CHECKPOINT12.6で追加した
  頭数不足・勝ち馬欠落警告も変化なし（本ラウンドでdata/horses/を一切変更して
  いないため）。

## 7. Base Ability V1への影響

**無変更**。`raceScore.ts`/`baseAbility.ts`/`memberLevel.ts`/
`memberLevelCandidates.ts`/`abilityBeforeRace.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`は1行も変更していない。
`horseAbilityData.ts`への変更も、既存の`historyByHorseId`計算方法・既存2関数の
挙動を変えない新規exportの追加のみ。「対象レース出走馬だけを抜き出して
Base Abilityを再計算する」実装は行っていない（テストB・「対象レース出走馬
だけの部分データでraceScoreを誤計算しないこと」で、entriesに1頭だけを渡した
場合と14頭に増やした場合とでbaseAbilityが完全に一致することを確認済み）。
シェイクユアハートのbaseAbility=70.3もSnapshot経由で再現された（テストA）。

## 8. Suitability V1への影響

**無変更**。`suitabilityV1.ts`/`distanceSuitability.ts`/`courseSuitability.ts`/
`goingSuitability.ts`/`courseContextPrior.ts`/`horseGateEvidence.ts`/
`suitabilityConfidence.ts`は1行も変更していない。going未確定時の
evaluated:false化は、既存の`goingSuitability.ts`のマッチングロジックが
未知の文字列に対して既に持っていた「一致件数0」という挙動を、sentinel値を
選んで利用しただけであり、`goingSuitability.ts`自体には手を加えていない。
`overallConfidence`（evaluated=trueのみでweakest-link）・
`evaluatedComponentCount`（coverage、confidenceとは別軸）の仕様もそのまま
再利用している。

## 9. 判定: A

理由：
- Base Ability V1・Suitability V1の数式・仕様を一切変更せずに、Stage A/B
  Snapshot・Ability Board・future leakage対策・race_not_held状態・odds分離・
  レース後データ/PRPS構造の準備を実装できた。
- STEP13で要求された9項目（A〜I）すべてを実コードでテストし、全てpassした。
- 「対象レース出走馬だけを抜き出してBase Abilityを再計算する」ことを構造的に
  禁止できていることを、静的チェック（import文にbuildRaceHistory/
  raceHistoryPipelineが無いこと）と機能テスト（1頭のみ投入と14頭投入で
  結果が一致すること）の両方で確認した。
- 既存534件のテスト・lint・build・validate:dataに回帰無し。

判定Aだが、これは「未来の実戦レースへ正しく適用できる基盤ができた」という
意味であり、CHECKPOINT13冒頭の注記どおり「勝ち馬を当てること」の評価は
含んでいない。

## 10. 次にChatGPTと決める必要がある項目（優先順位順）

1. **実データ投入方法**: 毎週のJRA各場11R出走馬一覧（frame/horseNumber/
   carriedWeight/馬場状態等）を、どの経路でこのSnapshot層に投入するか
   （CSV取り込みか、手動入力か、外部データ連携か）。本ラウンドはSnapshot層の
   実装のみで、実データ取得パイプラインの設計・実装は含んでいない。
2. **odds保存の運用**: `OddsSnapshotEntry`のフィールド自体は用意したが、
   実際にStage B時点でオッズをどう取得・記録するかの運用フローは未設計。
3. **PRPS採点ロジックの着手可否**: `raceResultTypes.ts`は構造のみで、
   採点ロジック（Start Loss等）は今回一切実装していない。着手は次CHECKPOINT
   以降、ChatGPTの明示的な指示を待つ。
4. **Field Score（20〜90の横比較スコア）の設計**: 今回は未実装のまま
   （内部数値をそのまま保存する方針を維持）。表示用レイヤーとして別途設計が
   必要。
5. **CHECKPOINT14（展開・位置取り予測）着手の可否**: 本ラウンドの指示どおり
   進めていない。

ここでSTOPします。CHECKPOINT14（展開・位置取り予測）以降には進みません。

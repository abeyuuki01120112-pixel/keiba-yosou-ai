# Suitability V1 本番接続・effectiveAbility/finalRaceAbility統合実装（CHECKPOINT11.14）

CHECKPOINT11.13の設計（`docs/suitability-v1-connection-type-design.md`）に従い、
Suitability V1をBase Ability→Suitability V1→effectiveAbility→finalRaceAbilityの
1本の計算パイプラインへ正式に本番接続した。RaceContext/trackBias/Race Review Engine/
distance・course・goingへのHorseEvidence拡張には進んでいない。

---

## 1. 変更ファイル一覧

**型・実装（6ファイル）**
- `src/ability/suitabilityV1Types.ts` — `source`（component）・`overallConfidence`（トップレベル）追加
- `src/ability/suitabilityV1.ts` — 上記2フィールドの算出ロジック追加（既存の数値計算式・定数は無変更）
- `src/ability/raceContextTypes.ts` — `FinalRaceAbilityResult.suitability`の型を`SuitabilityBreakdown`→`SuitabilityV1Result`へ切替
- `src/ability/finalRaceAbility.ts` — `computeSuitabilityBreakdown`→`computeSuitabilityV1`へ切替、`horseId`/`gate`をInputへ追加
- `src/ability/raceOutcomeEvaluation.ts` — `resolveEvaluationConfidence()`のフィールド参照を新型へ更新
- `src/ability/raceOutcomeTypes.ts` — `HorseOutcomeResult.evaluationConfidence`の型を4段階へ拡張

**テスト（3ファイル、既存テストの入出力シェイプ追従のみ。新規テストケース追加なし）**
- `src/ability/__tests__/finalRaceAbility.test.ts`
- `src/ability/__tests__/raceOutcomeEvaluation.test.ts`
- `src/ability/__tests__/suitabilityV1.test.ts`（テスト用フィクスチャに`source`フィールド追加のみ）

**scratchテスト（STEP7検証用、確認後に削除済み・コミットに含まれない）**
- `zzz_step7RepresentativeValues.test.ts`

---

## 2. 型統一結果

`FinalRaceAbilityResult.suitability`は旧`SuitabilityBreakdown`（3component）から
`SuitabilityV1Result`（4component）へ完全に置換した。旧3component型は本線（production-adjacent
経路）に一切残していない。

```typescript
export interface SuitabilityV1Result {
  distance: SuitabilityComponentResultV1;
  course: SuitabilityComponentResultV1;
  going: SuitabilityComponentResultV1;
  gate: SuitabilityComponentResultV1;
  overallSuitabilityPercent: number;
  evaluatedComponentCount: number;
  overallConfidence: SuitabilityConfidenceV1;   // ★今回追加
}

export interface SuitabilityComponentResultV1 {
  key; evaluated; rawPercent; adjustedPercent; confidence; reason;
  horseEvidence: HorseEvidenceDetail | null;
  coursePrior: CoursePriorDetail | null;
  source: SuitabilitySourceV1;                  // ★今回追加
}
```

- `source`は`horseEvidence`/`coursePrior`の非null判定から機械的に導出する派生値
  （新しい判定ロジックの追加ではない）。distance/course/goingは`evaluated`に応じて
  `"horseEvidence"`|`"none"`のいずれか（coursePriorが常にnullのため`"both"`にはならない）。
  gateのみ`"horseEvidence"`|`"coursePrior"`|`"both"`|`"none"`の4通りを取りうる
  （既存のHorseEvidence優先・CoursePriorフォールバックロジックそのまま）。
- `overallConfidence`は4componentの`confidence`のweakest-link（unknown=0/low=1/medium=2/high=3の
  ランクで最弱を採用）。`raceOutcomeEvaluation.ts`の`resolveEvaluationConfidence`と同じ考え方を
  再利用しただけで、新しいconfidence定義・閾値は作っていない。evaluated=falseのcomponentは
  常にconfidence="unknown"（既存仕様）のため、1つでも未評価componentがあれば
  `overallConfidence`も自動的に"unknown"になる。

---

## 3. raceOutcomeEvaluation.ts変更内容

`resolveEvaluationConfidence()`内の旧フィールド参照
（`result.suitability.distanceSuitability.confidence`等）を新フィールド
（`result.suitability.distance.confidence`/`.course.confidence`/`.going.confidence`）へ
置き換えた。**gateのconfidenceはweakest-linkの対象に追加していない**
（「新しい評価ロジックは追加禁止」という今回のSTEP2の指示に従い、既存3項目からの
フィールド名対応のみに限定したため）。

型面で1点、単純なリネームを超える必然的な修正が必要だった: distance/course/goingの
confidenceは旧システムでは"high"|"medium"|"low"の3段階のみだったが、Suitability V1では
evaluated=falseの場合に"unknown"を取りうる（実際に起こりうる値）。旧`CONFIDENCE_RANK`
（3段階のみ）のままだと"unknown"が未定義キーとなり、weakest-link判定が静かに壊れるバグに
つながるため、`CONFIDENCE_RANK`を4段階（`Record<SuitabilityConfidenceV1, number>`、
unknown=0/low=1/medium=2/high=3）へ拡張し、戻り値の型も`SuitabilityConfidenceV1`へ変更した。
これはフィールド参照の型的な整合性を保つために必然的な最小限の対応であり、評価ロジック
（weakest-linkの考え方自体）は変更していない。

`evaluateRaceOutcomes()`内の`suitability: h.finalRaceAbilityResult.suitability.overallSuitability`も
新フィールド名`overallSuitabilityPercent`へ更新した（値の算出方法自体は変更なし）。

---

## 4. FinalRaceAbilityInput変更内容

```typescript
export interface FinalRaceAbilityInput {
  baseAbility: number;
  horseId: string;              // ★追加
  recentRaces: RacePerformance[];
  suitabilityTarget: SuitabilityTargetRaceContext;
  gate: RaceGateInput;           // ★追加（courseContextPrior.tsの既存型、null-safe設計）
  raceContextTarget: RaceContextTargetInfo;
  manualRunningStyle: RunningStyleProfile | null;
  fieldRunningStyleDistributions: RunningStyleDistribution[];
  manualTrackBias: TrackBiasObservation | null;
  autoTrackBias: TrackBiasObservation | null;
}
```

**call site全監査結果**: `computeFinalRaceAbility`を実際に呼んでいるのは
`finalRaceAbility.test.ts`と`raceOutcomeEvaluation.test.ts`（内部の`buildFinalRaceAbility`
ヘルパー経由）の2ファイルのみで、本番コード（`.ts`/`.tsx`）からの呼び出しは0件だった
（grep確認済み）。したがって型追加による実質的な影響範囲はこの2テストファイルに限定された。

**値の補完方針**: どちらのテストも枠番を検証対象にしていないため、`gate`には
`RaceGateInput`が元々持つnull-safe設計（`horseNumber`/`fieldSize`/`frame`いずれもnullable）を
使い、`{ horseNumber: null, fieldSize: null, frame: null }`（＝「不明」の明示）を渡した。
これは推測値の補完ではなく、型が本来表現できる「情報が無い」状態をそのまま渡しただけである。
`horseId`は固定のテスト用ID文字列（`"test-horse"`）を使用した——`collectHorseGateEvidence()`の
実装を確認したところ、`horseId`は戻り値に監査情報として保持されるのみで、渡された
`recentRaces`配列を内部でhorseIdと突合・フィルタする処理は無い（呼び出し側が既に
「対象馬自身の過去走」に絞り込んだ配列を渡す前提の設計）ため、テスト間の相互汚染は発生しない。

取得不能な値をnull以外で推測補完した箇所は無い。

---

## 5. Suitability V1本番接続結果

`finalRaceAbility.ts`のimportを`./suitability`（旧）から`./suitabilityV1`（新）へ切替、
`computeSuitabilityBreakdown`の呼び出しを`computeSuitabilityV1`へ置換した。

```typescript
const suitability = computeSuitabilityV1({
  horseId: input.horseId,
  recentRaces: priorRaces,
  target: input.suitabilityTarget,
  gate: input.gate,
});
const effectiveAbility = roundToOneDecimal((input.baseAbility * suitability.overallSuitabilityPercent) / 100);
```

**旧SuitabilityとV1の二重呼び出しは無い**: grep確認により、`computeSuitabilityBreakdown`/
`computeEffectiveAbility`（旧`suitability.ts`）を実際に呼び出しているのは`suitability.ts`
自身と`suitability.test.ts`のみになった（`finalRaceAbility.ts`は完全にSuitability V1のみを
呼ぶよう切り替わっている）。`gateValidationV1.ts`内の「computeEffectiveAbility」という文字列は
コメント内の言及のみで実際の呼び出しではない（確認済み）。

**distance/course/goingの二重評価は無い**: Suitability V1側（`wrapSystemAComponent`経由で
`distanceSuitability.ts`/`courseSuitability.ts`/`goingSuitability.ts`の既存関数を再利用）のみが
これらを評価しており、旧`suitability.ts`側の同名関数は`finalRaceAbility.ts`から呼ばれなくなった
ため、同一のdistance/course/going評価が2箇所から行われる経路は存在しない。

---

## 6. effectiveAbility正式式

```
effectiveAbility = roundToOneDecimal(baseAbility × overallSuitabilityPercent / 100)
```

`overallSuitabilityPercent`はSuitability V1の最終出力値をそのまま使用（追加の変換・補正なし）。
`overallSuitability`本体への90〜110 clampは戻していない。Suitability V1内部の
`aggregateSuitabilityComponents()`が適用する60〜120の安全境界（`clampSafety`、
`SUITABILITY_V1_SAFETY_MIN=60`/`SUITABILITY_V1_SAFETY_MAX=120`、CHECKPOINT11.3以降の既存実装、
今回変更なし）のみが最終出力時の異常値防止として機能する。70台・80台等の通常値はclampされず
そのまま表現される。

---

## 7. BaseAbility=70代表値テスト

本番の`roundToOneDecimal`（`raceScore.ts`）を直接呼び出す一時テスト
（`zzz_step7RepresentativeValues.test.ts`、確認後削除）で以下を検証し、**完全一致を確認した**。

| overallSuitabilityPercent | effectiveAbility |
|---|---|
| 100 | 70.0 |
| 90 | 63.0 |
| 80 | 56.0 |
| 70 | 49.0 |
| 60 | 42.0 |
| 110 | 77.0 |
| 120 | 84.0 |

---

## 8. 4component動作確認

`suitabilityV1.test.ts`の既存18テスト（本ラウンドでは`source`フィールド追加に伴うフィクスチャ
更新のみ、テストケース自体は無変更）が全て回帰なくパスした。具体的に以下を再確認:

- 過去走が1件も無い場合、distance/course/goingはすべて`evaluated=false`・`confidence="unknown"`。
- `evaluated=false`のcomponent（今回のケースではdistance/course/going/gateいずれも該当しうる）は
  `aggregateSuitabilityComponents()`で平均対象から除外される（100として埋めない、
  CHECKPOINT11.3 STEP6の既存方針を維持）。
- 4component全てunknownの場合は`overallSuitabilityPercent=100`（中立固定）・
  `evaluatedComponentCount=0`（既存動作、今回変更なし）。

---

## 9. gate正式仕様回帰

以下の固定パラメータ・方針はすべて無変更のまま動作を再確認した（`suitabilityV1.test.ts`の
既存の異常系テストが全てパス）。

- `GATE_HORSE_EVIDENCE_SCALE = 4`
- `GATE_HORSE_EVIDENCE_AMPLITUDE = 5`
- aggregation = median
- confidence shrink方式A（rawPercent算出後にshrinkTowardCenterを適用）
- HorseEvidence優先・HorseEvidence 0件時のみCoursePriorフォールバック
- `GATE_COURSE_PRIOR_AMPLITUDE = 5`（CoursePrior最大影響幅）

positive（極端な正のaggregatedDelta）・negative（極端な負のaggregatedDelta）・neutral
（HorseEvidenceとCoursePriorが両方利用可能でHorseEvidence優先）・HorseEvidence 0件
（sampleCount=0・CoursePriorも無い場合にconfidence=unknown・rawPercent=100）の
いずれのケースも既存テストのまま回帰なく通過した。

---

## 10. 二重Suitabilityの有無

**無し。** 第3節・第5節のgrep監査の通り、`finalRaceAbility.ts`は現在Suitability V1のみを
呼び出しており、旧`suitability.ts`はこの経路から切り離されている。

---

## 11. Base Ability汚染の有無

**無し。** 本ラウンドで変更した9ファイルはいずれも
`raceScore.ts`/`memberLevel.ts`/`memberLevelCandidates.ts`/`timeGapScore.ts`/
`raceTimeScore.ts`/`final3FScore.ts`/`weightScore.ts`/`abilityBeforeRace.ts`/`baseAbility.ts`の
いずれにも含まれない（git差分ファイル一覧で確認済み）。Suitability V1・finalRaceAbility側は
これらのBase Ability計算結果（`RacePerformance.raceScore`等）を読み取るのみで、書き換える経路は
無い（既存アーキテクチャのまま）。

---

## 12. baseAbility=70.3再現

`abilityModelV1.regression.test.ts`を単独実行し、3テストすべてパス（シェイクユアハートの
baseAbility V1が現在確定値から変化しないこと、直近5走それぞれのraceScore/
memberLevelScoreAtRaceが変化しないこと、buildRaceHistoryが決定的であることを確認）。
baseAbility = **70.3** を完全再現した。

---

## 13. 本番計算経路

STEP4の接続により、コードレベルでは以下が1本のパイプラインとして到達可能になった。

```
data/horses/*.json
  ↓ buildRaceHistory()
baseAbility（Ability Model V1、凍結・無変更）
  ↓ computeSuitabilityV1()（Suitability V1、CHECKPOINT11.3〜11.11実装、今回本番接続）
overallSuitabilityPercent
  ↓ effectiveAbility = baseAbility × overallSuitabilityPercent / 100
effectiveAbility
  ↓ raceContext（paceScenarioFactor × trackBiasFactor、STEP5、無変更）
finalRaceAbility
```

`computeFinalRaceAbility()`（`finalRaceAbility.ts`）と`evaluateRaceOutcomes()`
（`raceOutcomeEvaluation.ts`）の2関数がこのパイプラインの入口として実装上は完成している。

---

## 14. UIまで到達しているか

**到達していない。** 第12節と同じ手法（`.tsx`ファイル全件へのgrep）で再確認したところ、
`finalRaceAbility`/`raceOutcomeEvaluation`/`suitabilityV1`/`computeSuitabilityV1`/
`evaluateRaceOutcomes`のいずれも`.tsx`ファイルからは一切参照されていない（0件）。
UIから実際に参照されているのは従来通り`loadHorseAbilityProfile()`（`HorseDetailPanel.tsx`が
使用、baseAbility等のみを返す）と`buildImportResult()`（`ImportStatusPanel.tsx`、CSV状況表示のみ）
の2つに限られる。したがって本パイプラインはコードレベルでは完成しているが、
**呼び出し先（UIや上位オーケストレーター）が存在せず、実行時には到達しない**状態が続いている。
これは今回のCHECKPOINTの範囲外（UIの新規設計は変更禁止事項）であり、次のCHECKPOINTでの
判断事項として残る。

---

## 15. test/lint/build/validate:data

- `npm test` — 527/527 pass（54 test files）。新規テストケースは追加していない
  （既存テストの入出力シェイプ追従のみ）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ
  （sapporoKinenロースター外のhorseId 16件、courseTimeBaselines欠落25/48、
  courseFinal3FBaselines欠落28/48）。

---

## 16. technical debt

- 旧`suitability.ts`（`computeSuitabilityBreakdown`/`computeEffectiveAbility`）と
  `suitabilityTypes.ts`の`SuitabilityBreakdown`/`EffectiveAbilityResult`/`SuitabilityComponent`は、
  もはや`suitability.test.ts`以外から参照されない実質的な死蔵コードになった。今回は削除しない
  （CHECKPOINT11.13の推奨移行手順では別ラウンドでの検討事項としている）。
- `suitabilityCoreV1Types.ts`/`suitabilityCoreV1.ts`（CHECKPOINT9、7要素スキーマ、`score`常にnull）は
  引き続き自身のテスト以外から一切参照されない死蔵コードのまま（CHECKPOINT11.12から継続）。
- gateのconfidenceは`resolveEvaluationConfidence()`のweakest-link判定に含めていない
  （第3節参照）。distance/course/goingとの整合を取るかどうかは次回検討事項。
- Suitability V1本番接続はコードレベルで完成したが、UI・呼び出し先が無いため実行時には
  到達しない（第14節）。

---

## 17. A/B/C判定

**A。** 型統一・raceOutcomeEvaluation.ts追従・horseId/gate追加・Suitability V1本番接続・
effectiveAbility正式式・clamp方針（safety boundary 60-120のみ）のすべてをCHECKPOINT11.13の
設計通りに実装し、全17項目を実コードの実態に基づいて確認できた。二重Suitability・
Base Ability汚染はいずれも実コード経路のgrep監査で不在を確認。baseAbility=70.3の完全再現、
BaseAbility=70代表値の完全一致、gate回帰・4component動作の全既存テスト通過、
test/lint/build/validate:dataすべてクリーンを確認済み。変更ファイル数も
CHECKPOINT11.13が見積もった規模（8ファイル程度）と一致する最小限の範囲に収まった。

---

## 18. 次にChatGPTと決める必要がある項目

1. Suitability V1パイプライン（`computeFinalRaceAbility`/`evaluateRaceOutcomes`）を
   実際にUI・呼び出し先へ接続するかどうか（現状は到達不能なまま、第14節）。
2. 旧`suitability.ts`系（`computeSuitabilityBreakdown`/`computeEffectiveAbility`/
   `SuitabilityBreakdown`/`EffectiveAbilityResult`）の削除タイミング。
3. `suitabilityCoreV1Types.ts`/`suitabilityCoreV1.ts`（死蔵コード）の削除タイミング。
4. `resolveEvaluationConfidence()`のweakest-link判定にgateのconfidenceを含めるかどうか
   （含める場合は「新しい評価ロジックの追加」に該当するため、別途承認が必要）。
5. 本CHECKPOINTで禁止されているRaceContext/trackBias再設計・distance/course/goingへの
   HorseEvidence拡張・Race Review Engine・キーンランドC実戦投入への着手タイミング。

**ここでSTOPします。** A判定になりましたが、RaceContext/trackBias/Race Review Engine/
キーンランドC実戦投入にはまだ進みません。

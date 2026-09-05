# Suitability V1 confidence閾値統一（CHECKPOINT11.11・A判定・実装済み）

**作成日: 2026-08-23。ステータス: 実装済み・A判定。**
**重要な発見: 直接的な閾値統一（案A/案B）はいずれも安全ではなく、
Suitability V1の出力層のみで解消する第三の方式を採用した。**

---

## STEP1: confidence定義の全監査

| # | 定義ファイル | 閾値 | sampleCountとの対応 | enum/type | 主な使用箇所 | shrinkへの影響 |
|---|---|---|---|---|---|---|
| 1 | `suitabilityConfidence.ts`<br>`baseConfidenceFromSampleCount` | 3段階 | 0-1=low / 2-3=medium / 4+=high | `SuitabilityConfidence`（`suitabilityTypes.ts`、"high"\|"medium"\|"low"） | `distanceSuitability.ts`・`courseSuitability.ts`・`goingSuitability.ts`（系統A自身の内部計算）、`passingPositionRunningStyle.ts`、**`stabilityFactor.ts`**、**`memberLevelCandidates.ts`** | `CONFIDENCE_SHRINK_WEIGHTS`（high=1.0/medium=0.6/low=0.3）で`shrinkTowardCenter`に使用 |
| 2 | `horseEvidenceConfidence.ts`<br>`resolveHorseEvidenceConfidence` | 4段階 | 0=unknown / 1-2=low / 3-4=medium / 5+=high | `HorseEvidenceConfidence`（"unknown"\|"low"\|"medium"\|"high"） | `horseGateEvidence.ts`の`HorseEvidence`から呼ぶ既存呼び出し口、`suitabilityV1.ts`のgate component | 同じ`CONFIDENCE_SHRINK_WEIGHTS`テーブル（`suitabilityV1.ts`の`toShrinkConfidence`で"unknown"→"low"読み替え後）を再利用 |
| 3 | `courseContextPrior.ts`<br>courseKarte JSON由来 | カテゴリ値（sampleCount非依存） | N/A（出典の記述としての確信度） | `SuitabilityConfidence` | gate componentのCoursePriorフォールバック経路 | 同上 |
| 4 | `suitabilityCoreV1Types.ts`<br>`SuitabilityConfidenceV1` | 型のみ（閾値関数なし） | N/A | `SuitabilityConfidence \| "unknown"`（1・2の型を包含する上位型） | `suitabilityCoreV1.ts`（score常にnullのschema）、`suitabilityV1Types.ts`が再利用 | N/A（型のみ、計算ロジックは持たない） |

**重要な発見**: `suitabilityConfidence.ts`の`baseConfidenceFromSampleCount`は
distance/course/goingのSuitability計算だけでなく、**`memberLevelCandidates.ts`
（Ability Model V1・memberLevel V1の本番計算関数`calculateTopNConfidenceWeightedMean()`
が直接呼び出す。`raceHistoryPipeline.ts`の本番`memberLevelScoreAtRace`計算は
この関数の結果をそのまま使う）と、`stabilityFactor.ts`（docs/step6-decisions.mdで
「閾値を変更しない」と明示的に決定済み）からも共有参照されている。**

---

## STEP2: 現在の不一致（sampleCount別、修正前）

| sampleCount | Suitability側（`baseConfidenceFromSampleCount`） | HorseEvidence側（`resolveHorseEvidenceConfidence`） | 一致 |
|---|---|---|---|
| 0 | low（"評価不能"の概念自体が無い） | unknown | ✗（ただし`suitabilityV1.ts`の旧`wrapSystemAComponent`が0件時のみ"unknown"へ上書きしていたため、Suitability V1の出力上は一致していた） |
| 1 | low | low | ✓ |
| **2** | **medium** | **low** | **✗** |
| 3 | medium | medium | ✓ |
| **4** | **high** | **medium** | **✗** |
| 5+ | high | high | ✓ |

**不一致はsampleCount=2とsampleCount=4の2点で発生する。** これはCHECKPOINT11.4〜
11.10で繰り返し指摘してきた既知の問題であり、今回初めて全ファイルを対象に
影響範囲を精査した。

---

## STEP3: V1統一案比較（実装前提での安全性を含む）

| 案 | 内容 | HorseEvidence V1との整合 | Suitabilityとの整合 | データ量への意味 | 過信防止 | unknown分離 | shrinkとの相性 | 既存テストへの影響 | 将来拡張性 | **安全性（新発見）** |
|---|---|---|---|---|---|---|---|---|---|---|
| **案A** | `suitabilityConfidence.ts`の閾値をHorseEvidence側（0=unknown/1-2=low/3-4=medium/5+=high）へ変更 | 完全一致 | 系統A側が変わる | 妥当 | 妥当 | 分離できる | 良好 | **`memberLevelCandidates.test.ts`・`stabilityFactor.test.ts`等、frozen計算に依存するテストが破綻するリスク大** | 高い | **✗ 不採用**——`memberLevelCandidates.ts`経由でAbility Model V1本番計算（memberLevelScoreAtRace）に影響し、`raceScore`・`baseAbility`が変化する可能性が高い。CLAUDE.mdの凍結原則、`docs/step6-decisions.md`のstabilityFactor閾値凍結にも抵触する |
| 案B | `horseEvidenceConfidence.ts`をSuitability側（0-1=low/2-3=medium/4+=high、unknown概念廃止）へ変更 | HorseEvidence V1凍結仕様に反する | 系統Aと一致 | 妥当 | 妥当 | **unknown概念が失われる** | 良好 | HorseEvidence V1関連テスト（`horseEvidenceConfidence.test.ts`等）が破綻 | 低い | **✗ 不採用**——`docs/horse-evidence-v1.md`の凍結済みconfidence仕様（CHECKPOINT10.5で正式決定）を変更することになり、STOP条件に抵触（CHECKPOINT11.5 STEP7で既に不採用と結論済み） |
| **案D（新規提案、今回採用）** | `suitabilityConfidence.ts`・`horseEvidenceConfidence.ts`のいずれも変更しない。Suitability V1の出力層（`suitabilityV1.ts`の`wrapSystemAComponent`）でのみ、系統Aの`raw`値を受け取った後に**既存の`resolveHorseEvidenceConfidence`を再利用してconfidenceを再判定し、`adjustedPercent`を独自に再計算**する | 完全一致（同じ関数を再利用） | 系統A自身の内部計算・テストは無変更 | 妥当 | 妥当 | 分離できる | 良好 | **ゼロ**（系統Aのソース・テストに触れない） | 高い（Suitability V1が新設レイヤーである限り自由に拡張できる） | **✓ 安全**——凍結対象のファイルを一切変更しない |

**新しい閾値や重みは作っていない**（STEP4選択原則5）。既存の`resolveHorseEvidenceConfidence`
と`shrinkTowardCenter`をそのまま再利用しているだけであり、案Dは「第3の閾値定義」
ではなく「既存2つのうち、より厳格な方（HorseEvidence側）をSuitability V1の
出力層だけに適用する」という選択である。

---

## STEP4: 選択原則の適用確認

1. **データが少ないのにhighへ上げない**: 案Dはより厳格なHorseEvidence側の閾値
   （5+でhigh）を採用するため、この原則に最も合致する。
2. **0件は必ずunknown**: `resolveHorseEvidenceConfidence(0)`が保証する。
3. **confidenceは「評価の良し悪し」ではなくデータ量・信頼度**: 変更なし
   （両閾値定義ともこの原則を既に満たしている）。
4. **HorseEvidence V1で実データ検証済みの設計を尊重**: 案Dはまさにこれを
   実行している（HorseEvidence V1側の閾値をそのまま拡張利用）。
5. **不要な新しい閾値や重みを作らない**: 満たす（新規定義ゼロ）。
6. **V1では単純で説明可能な定義を優先**: 満たす（「Suitability V1の出力は
   すべてHorseEvidence側の閾値で統一」という単純な説明が可能）。

---

## STEP5: 正式推奨・STOP判断

**閾値変更（案A・案B）はSuitability V1・HorseEvidence V1双方のA判定を実質的に
壊すリスクがあるため、いずれも実施しない（STOPに相当する判断）。**

その上で、**「既存仕様を壊さず統一可能」な案D（Suitability V1出力層限定の
再判定）を必要最小限の実装として採用した。**

---

## STEP6: 必要最小限の修正内容

`src/ability/suitabilityV1.ts`の`wrapSystemAComponent()`関数のみを変更した。

- 変更前: `component.confidence`（系統Aが`baseConfidenceFromSampleCount`で
  算出した3段階の値）と`component.adjusted`（系統A自身が計算した縮小値）を
  そのまま転記していた。
- 変更後: `resolveHorseEvidenceConfidence(component.sampleCount)`（既存関数、
  `horseEvidenceConfidence.ts`からimport済み、CHECKPOINT11.5から再利用）で
  confidenceを再判定し、`shrinkTowardCenter(component.raw, ...)`
  （既存関数）で`adjustedPercent`を独自に再計算する。

`toShrinkConfidence()`（HorseEvidenceConfidenceの"unknown"をshrink計算用に
"low"へ読み替えるヘルパー、CHECKPOINT11.5でgate用に実装済み）をそのまま
再利用し、新しいヘルパー関数は追加していない。

**同じ閾値を複数ファイルへコピペする構造は作っていない**——distance/course/
goingの4component全てが、gateと同じ`resolveHorseEvidenceConfidence`という
単一の関数を参照する構造になった（一本化）。

---

## STEP7: sampleCount 0〜6境界値テスト

`suitabilityV1.test.ts`に3件追加した。

| sampleCount | 統一後confidence | shrink weight | 検証内容 |
|---|---|---|---|
| 0 | unknown | N/A（raw=100固定） | `evaluated=false`・`rawPercent=adjustedPercent=100` |
| 1 | low | 0.3 | distance componentで確認 |
| 2 | **low**（旧: medium） | **0.3**（旧: 0.6） | 明示的に旧定義との差分を検証 |
| 3 | medium | 0.6 | distance componentで確認 |
| 4 | **medium**（旧: high） | **0.6**（旧: 1.0） | 明示的に旧定義との差分を検証 |
| 5 | high | 1.0 | distance componentで確認（RECENT_RACE_COUNT上限） |
| 6 | high | 1.0 | gate componentで確認（gateはRECENT_RACE_COUNT非依存のため6走が可能） |

全ケースで期待通りの結果を確認した（`adjustedPercent`が
`shrinkTowardCenter(rawPercent, confidence)`と一致すること、および
sampleCount=2/4で旧定義と異なる結果になることを明示的にアサートした）。

---

## STEP8: gate再回帰

gateのpercent式（`scale=4.0`・`amplitude=5`・median aggregation・HorseEvidence
優先・CoursePriorフォールバック）は**変更していない**。gate自体は元々
`resolveHorseEvidenceConfidence`を使っていたため、今回の統一による直接の
影響は無い。既存のgate関連テスト11件（positive/negative/neutral相当のケース、
CoursePriorフォールバック、異常系4件）はすべて無変更で成功を確認した。
加えてsampleCount=6の境界値テスト（STEP7）でgateの動作を再確認した。

---

## STEP9: Base Ability非影響確認

`raceScore.ts`・`baseAbility.ts`・`memberLevel.ts`・`memberLevelCandidates.ts`・
`abilityBeforeRace.ts`・`timeGapScore.ts`・`raceTimeScore.ts`・`final3FScore.ts`・
`weightScore.ts`・`stabilityFactor.ts`・`suitabilityConfidence.ts`・
`horseEvidenceConfidence.ts`はいずれも今回変更していない（STEP5でこれらへの
変更が不要な案Dを選んだため）。`abilityModelV1.regression.test.ts`で
シェイクユアハートのbaseAbility=70.3が変化していないことを確認した。

---

## 変更禁止の遵守

`distance`/`course`/`going`へのHorseEvidence方式導入、`surface`/`turn`実装、
`effectiveAbility`接続、Suitability V1全体本番接続、他コース展開、
Race Review Engine、大規模データ収集のいずれにも進んでいない。今回変更した
ファイルは`suitabilityV1.ts`（Suitability V1新設レイヤー、凍結対象外）と
そのテストのみ。

---

## 完了報告（16項目）

1. **現在のconfidence定義一覧**: STEP1の表参照（4種類の定義を確認）。
2. **不一致箇所**: `suitabilityConfidence.ts`（3段階）と`horseEvidenceConfidence.ts`
   （4段階）の間、sampleCount=2/4で発生（STEP2）。
3. **sampleCount 0〜6の現状表**: STEP2参照（統一前）。
4. **比較した統一案**: 案A（Suitability→HorseEvidence直接変更）・案B
   （HorseEvidence→Suitability直接変更）・案D（Suitability V1出力層限定の
   再判定、新規提案）の3案（STEP3）。
5. **推奨案**: 案D。
6. **採用理由**: 案A・案Bはいずれも凍結済みシステム（Ability Model V1の
   memberLevel計算・HorseEvidence V1仕様）に直接影響するため不採用。案Dは
   既存関数の再利用のみでSuitability V1（凍結対象外の新設レイヤー）の
   出力層だけを統一でき、frozen systemに一切触れない（STEP3・STEP5）。
7. **実装した場合の変更ファイル**: `src/ability/suitabilityV1.ts`
   （`wrapSystemAComponent`関数のみ）、`src/ability/__tests__/suitabilityV1.test.ts`
   （境界値テスト3件追加）。
8. **sampleCount 0〜6境界値テスト**: 全件成功、sampleCount=2/4で統一後の
   値（low/medium）が旧定義（medium/high）と異なることを明示的に確認（STEP7）。
9. **gate回帰結果**: 全11件無変更で成功、影響なし（STEP8）。
10. **scale=4.0維持確認**: `GATE_HORSE_EVIDENCE_SCALE = 4`のまま変更なし。
11. **Base Abilityへの影響0**: Ability Model V1関連ファイル・
    `suitabilityConfidence.ts`・`horseEvidenceConfidence.ts`はいずれも無変更。
12. **baseAbility=70.3再現**: `abilityModelV1.regression.test.ts`で確認、
    変化なし。
13. **test/lint/build/validate:data**: 下記参照（527/527成功）。
14. **technical debt**:
    1. distance/course/going自身（`distanceSuitability.ts`等）の内部
       `adjusted`フィールドは旧3段階のままであり、Suitability V1経由でない
       直接呼び出し（`suitability.ts`・旧`computeSuitabilityBreakdown`経由）
       ではこの統一は適用されない（`suitability.ts`はCHECKPOINT11.1で
       「未接続の旧系統」と位置づけられており、今回スコープ外）。
    2. `suitabilityConfidence.ts`・`horseEvidenceConfidence.ts`という
       2つの閾値定義自体は引き続き併存する（統一したのはSuitability V1の
       出力表現のみ）。将来Ability Model V1側の閾値を正式に見直す機会が
       あれば、根本的な一本化を再検討できる。
15. **A/B/C判定**: **A**。既存仕様（Ability Model V1・HorseEvidence V1）を
    一切壊さずに、Suitability V1という単一レイヤー内でconfidence判定を
    完全に統一できた。sampleCount 0〜6の境界値もすべて意図通り動作する
    ことを確認済み。
16. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. `suitability.ts`（旧系統、未接続）にも同様の統一を適用するか、
       それとも案C（CHECKPOINT11.1）の通りSuitability V1へ完全移行する
       前提で`suitability.ts`自体を将来的に廃止するか。
    2. distance/course/goingにもgateと同じHorseEvidence方式
       （`abilityBeforeRace`基準のrawPerformanceDelta）を将来適用するかの
       検討（CHECKPOINT11.5以来の継続課題）。
    3. これでSuitability V1の主要な構造的不整合（アーキテクチャ統一・
       gate scale確定・confidence統一）がすべて解消されたため、
       Suitability V1全体統合・`effectiveAbility`接続へ進む準備が整ったと
       言えるか、次回改めて確認する。

## test/lint/build/validate:data

```
npm test              # 527/527成功（新規3件含む）
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

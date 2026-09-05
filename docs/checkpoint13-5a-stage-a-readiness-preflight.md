# CHECKPOINT13.5A — 新潟記念 Stage A Readiness Preflight

監査＋テンプレート作成ラウンド。**正式Stage Aは生成していない。** 新しい予想ロジック・
新しいField Score・新しいSnapshot永続化機構は一切追加していない。既存の
Race Card Input Bridge V1（CHECKPOINT13.2B）・Prediction Snapshot（CHECKPOINT13）・
Suitability V1・Base Ability V1・MemberLevel Evidence V1（CHECKPOINT13.4J）を
そのまま確認・使用しただけ。

## 1. 新潟記念 Base Ability Board

Production Dataset / BA-V1正式経路（`data/horses/`全体 → `buildRaceHistory()` →
`raceFieldAggregatesByRaceId` → `raceScore` → `baseAbility`。`getHorseRecentRaces()`
経由、11頭だけの部分データから直接再計算していない）から算出。

| horseName | canonicalHorseId | baseAbility | rankByBaseAbility | recentRaceCount | abilityEvidenceCount | knownCareerRaceCount | shortCareer | historyCompleteness | historyConfidence | memberLevelEvidenceStatus | memberLevelFallbackCount | predictionEligible |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ダノンシーマ | 2022104645 | 78.3 | 1 | 5 | 5 | null | false | complete | high | available | 0 | true |
| ロデオドライブ | 2023107166 | 76.7 | 2 | 4 | 4 | 4 | true | complete | medium | structural_no_prior_history | 1 | true |
| ゾロアストロ | 2023106850 | 74.8 | 3 | 5 | 5 | null | false | complete | high | available | 0 | true |
| ボーンディスウェイ | 2019104658 | 73.1 | 4 | 6 | 5 | null | false | complete | high | available | 0 | true |
| ジュンブロッサム | 2019105118 | 72.7 | 5 | 5 | 5 | null | false | complete | high | available | 0 | true |
| バレエマスター | 2019104850 | 72.3 | 6 | 5 | 5 | null | false | complete | high | available | 0 | true |
| アーバンシック | 2021105436 | 72.1 | 7 | 5 | 5 | null | false | complete | high | available | 0 | true |
| サヴォーナ | 2020100734 | 70.2 | 8 | 6 | 5 | null | false | complete | high | available | 0 | true |
| ステレンボッシュ | 2021105743 | 69.4 | 9 | 5 | 5 | null | false | complete | high | available | 0 | true |
| チェルヴィニア | 2021105643 | 69.1 | 10 | 6 | 5 | null | false | complete | high | available | 0 | true |
| ドゥレッツァ | 2020103650 | 67.4 | 11 | 5 | 5 | null | false | complete | high | available | 0 | true |

**重要（チェックポイント本文の再確認）**: これはまだ「Base Abilityの絶対能力順位」で
あり、Final Race AbilityでもField Scoreでもない。適性を掛けた後のEffective Ability
順位は枠順確定後、正式Stage A生成時に別途算出する（本ラウンドでは計算していない。
2節参照の理由により参考計算はしたが、これは監査目的の一時計算であり保存していない）。

warnings: 全馬共通で「馬場状態が未確定のため、going適性はevaluated=falseとして扱って
います」の注記のみ。ロデオドライブのみ追加でShort Career注記・Structural注記
（CHECKPOINT13.4G/13.4J、値の補正は無し）。

## 2. Evidence / Eligibility Board

上表の `abilityEvidenceCount`〜`predictionEligible` 列がそのままEvidence /
Eligibility Boardを兼ねる（1節の表と統合、CHECKPOINT13.4Jで確定した3値区分
`available` / `missing_data` / `structural_no_prior_history` を使用）。

**resolved = 11/11、predictionEligible = 11/11**（CHECKPOINT13.4J終了時点から変化なし。
本ラウンドはdata/horses/を一切変更していない）。

## 3. 現在未確定なStage A入力

`src/ability/import/raceCardTypes.ts`の`normalizeRaceCard()`を実際に動かして確認した
（推測ではなくコード実行結果）。

### Stage A生成をblockしている項目（正式Race Card Inputとして必須・未確定）

| 項目 | 現状 | 備考 |
|---|---|---|
| raceId | 未確定 | JRA公式のraceId表記が未取得 |
| raceDate | 未確定 | 過去のCHECKPOINT13.3〜13.4Jで使ったテスト用の日付（例: 2026-09-06）は、いずれも監査・テスト目的の仮値であり、公式発表された日付ではない |
| raceNumber | 未確定 | 新潟記念は例年メインレース（多くは11R）だが、確定情報としては未取得 |
| scheduledStartTime | 未確定 | raceDate/raceNumber同様 |
| runners[].frame（11頭全員） | 未確定 | 枠順発表待ち |
| runners[].horseNumber（11頭全員） | 未確定 | 同上 |

これら6項目のいずれか1つでも欠けると、`normalizeRaceCard()`はエラーを返し、
`runRaceCardBridge()`まで到達できない（実測: 3節下部の検証結果参照）。

### blockしていない項目（既存仕様で安全に扱える）

| 項目 | 現状 | 扱い |
|---|---|---|
| going（馬場状態） | 未確定 | `going: null`のままRace Card Input として有効。Suitability V1のgoing componentがevaluated:falseに構造的に帰着するだけで、Formal Gateはblockしない（5節で実測確認） |
| runners[].assignedWeight（斤量） | 未確定 | nullable。baseAbility/Suitability計算には未使用（今回のレースが未来走のため）。Stage A生成自体はblockしない |
| runners[].scratched（出走取消） | 未確定 | スキーマ上は必須boolean。テンプレートでは暫定的に全馬`false`（「現時点で取消の発表なし」という前提であり、出走確定を意味しない）。正式発表待ち |
| racecourse / surface / distance | 確定 | 新潟・turf・2000m（CHECKPOINT13.3のprovisional fixture以来一貫、新潟記念の恒常的な開催条件） |
| runners[].horseName / horseId(=canonicalHorseId) / sourceHorseId（11頭） | 確定 | CHECKPOINT13.3〜13.4Jでresolved=11/11・predictionEligible=11/11まで確認済み |

## 4. Stage A Formal Gate

`src/ability/import/raceCardBridge.ts`の`RaceCardBridgeGate.formal`が、既にこの
ゲート判定を実装している（`gateReasons.length === 0`）。実際にコードを動かして
確認した条件は：

```
gate.formal = true  ⟺  unresolved === 0 かつ ambiguous === 0 かつ predictionIneligible === 0
```

`predictionIneligible`は`RunnerBridgeResult.predictionEligible`（resolverStatus=resolved
かつ scratched=false かつ baseAbility≠null かつ completenessFlagsが空）がfalseの頭数。

チェックポイント本文の最低条件との対応:

| チェックポイントの条件 | 現在コードでの対応 |
|---|---|
| Runner 11頭が正式確定 | Race Card Inputのrunners配列に11件、かつ全員resolverStatus=resolved |
| resolved | `summary.unresolved === 0` |
| predictionEligible | `summary.predictionIneligible === 0` |
| frame / horseNumber available | `normalizeRaceCard()`スキーマが必須項目としており、無ければそもそもRace Card自体が無効（3節） |
| placeholderなし | `predictionEligible`算出に`reasonsFromSnapshotEntry()`経由で`placeholder_data`が含まれる（既存） |
| critical data missingなし | `completenessFlags`（insufficientRecentHistory/insufficient_evidence/career_history_completeness_unknown/incomplete_recent_history/memberLevelUnavailable）が空であることが`predictionEligible`の条件に含まれる（既存） |
| predictionCutoffAt valid | `buildGateConfirmedSnapshot()`は`generatedAt`をそのまま`predictionCutoffAt`として使う（既存、無変更） |
| future leakageなし | `buildHorseSnapshotEntry()`が`predictionCutoffAt`より前の過去走のみを使う（既存、無変更） |

## 5. going unknownの扱い

**実測結果: going未確定はFormal Gateをblockしない。**

`going: null`のまま、frame/horseNumber等を全て埋めたRace Card Inputで
`runRaceCardBridge()`を実行し、`gate.formal === true`になることを確認した
（`src/ability/import/__tests__/raceCardTemplate.test.ts`の
「frame/horseNumber等が揃っていれば〜」テストとして固定）。

既存仕様（無変更）:
- `going.evaluated = false`のまま`computeSuitabilityV1()`へ渡され、goingSuitability
  componentは`evaluated: false`になる。
- `evaluatedComponentCount`からgoingが除外され、`overallSuitabilityPercent`は
  distance/course/gateのうちevaluated済みのものだけの平均になる（「unknownを100%として
  混ぜる」方式ではない。全4component未評価の場合のみ中立値100%固定、これは既存の
  意図的な仕様）。
- 「良」等の仮置き・天気予報からの確定は一切行っていない（コード上もそのような
  ロジックは存在しない）。

Stage Bで公式馬場状態が取得できた時点で、`buildT2hSnapshot()`（既存、無変更）に
その時点のgoingを渡せば再評価される。

## 6. Race Card Template

- path: `src/ability/data/racecards/niigata-kinen-2026-stage-a.template.json`
  （チェックポイント本文の例path `data/racecards/...` ではなく、本プロジェクトの
  既存データ配置規約`src/ability/data/`配下に合わせた。トップレベル`data/`は
  本プロジェクトでは未使用）。
- schema: `src/ability/import/raceCardTypes.ts`の`RaceCardInput`（無変更）。
- 内容: raceId/raceDate/raceNumber/scheduledStartTime/goingはnull（未確定）、
  racecourse="新潟"/surface="turf"/distance=2000（確定済み）、runners 11件は
  horseName/horseId(=canonicalHorseId)/sourceHorseIdを事前登録、frame/horseNumber/
  assignedWeightはnull、scratchedは暫定false（3節参照）。架空値は一切含まない。
- **現状このテンプレートのままでは`normalizeRaceCard()`の検証を通らない**
  （実測: 26件のエラー。raceId/raceDate/raceNumber/scheduledStartTime各1件＋
  runners 11頭×2項目=22件）。これは意図した挙動であり、誤って未確定のまま
  正式Stage Aとして生成されることを防ぐ安全装置として機能している
  （テストで固定済み、8節参照）。

## 7. 枠順確定後の入力項目

正式発表され次第、テンプレートの以下のフィールドを埋める：

| フィールド | 発表元の例 |
|---|---|
| raceId | JRA公式レースID |
| raceDate | 開催日 |
| raceNumber | レース番号 |
| scheduledStartTime | 発走予定時刻 |
| going（可能であれば） | 馬場発表（無ければnullのまま） |
| runners[].frame | 枠順発表 |
| runners[].horseNumber | 枠順発表 |
| runners[].assignedWeight | 斤量発表（任意項目、無くても生成可） |
| runners[].scratched | 出走取消発表があった馬のみtrueへ変更 |

horseName/horseId/sourceHorseIdは既に確定済みのため変更不要。

## 8. 枠順確定後の実行手順

```
1. src/ability/data/racecards/niigata-kinen-2026-stage-a.template.json を編集
   （7節の項目を実際の値で埋める。ファイル名はそのままでも、確定版として
   別名保存してもよい）

2. npm run racecard:check -- src/ability/data/racecards/niigata-kinen-2026-stage-a.template.json --board
   → normalizeRaceCard()によるスキーマ検証 + runRaceCardBridge()による
     Runner Resolve + Completeness Gate判定 + Ability Board表示を1コマンドで実行

3. 出力の "Gate: FORMAL（正式Snapshotとして扱えます）" / "DIAGNOSTIC ONLY" を確認
   （4節のgate.formal判定。DIAGNOSTIC ONLYの場合はreasonsを確認し、
   unresolved/ambiguous/predictionIneligibleのいずれかを解消してから再実行）

4. npm test / npm run lint / npm run build / npm run validate:data で
   既存回帰が無いことを確認（データを変更していなくても、テンプレートの
   実値化そのものはdata/horses/を書き換えないため、通常は無回帰のはず）

5. gate.formal=true になった時点のPredictionSnapshot
   （runRaceCardBridge()の戻り値のdiagnosticSnapshot。gate.formal=trueの場合は
   これがそのまま正式Stage A Snapshotの内容と一致する）を、正式記録として
   保存する

   【未解決】この保存先・保存形式・不変性（immutable）の担保方法は、
   本プロジェクトにまだ存在しない（12節参照）。ChatGPTとの仕様決定が必要。
```

step5に永続化コマンドが無いのは省略ではなく、現状その機能自体が未実装であるため
（12節で詳述）。

## 9. CHECKPOINT13完全A条件

Stage A完了後にCHECKPOINT13を完全Aとして閉じるための条件（現状の到達状況付き）:

| 条件 | 現状 |
|---|---|
| 11/11 formal runner | 未達（枠順未確定のため） |
| Base Ability formal path | 達成済み（本ラウンド1節で確認、11/11算出可能） |
| Suitability V1 | 実装済み・凍結済み（枠順確定後にgate componentが有効化されるのみ） |
| Effective Ability 11/11 | 未達（枠順・goingが無いと`effectiveAbility`はgate/going分がneutral固定のまま。枠順確定後は即座に算出可能） |
| Confidence / Coverage | Suitability V1のoverallConfidence/evaluatedComponentCountとして既に実装済み |
| Snapshot immutable | **未設計**（12節）。CHECKPOINT13完全Aの前提条件として最優先で決定が必要 |
| future leakage PASS | 既存の`predictionCutoffAt`ベースのフィルタで保証済み（無変更） |
| Base / Effective ranking | `buildAbilityBoard()`で両方保持済み（rankByBaseAbility/rankByEffectiveAbility）。ランク変化量（Rank Change）自体は専用フィールドとして未追加、呼び出し側で差分計算すれば求まる状態（12節・10節参照） |
| tests clean | 669/669 pass（本ラウンド追加5件含む）、lint/build/validate:data clean |

## 10. Tests

- `npx tsc -b`: エラーなし。
- `npm test`: **669 / 669 pass**（新規追加: `raceCardTemplate.test.ts` 5件。
  既存664件は無変更・無回帰）。
  - 11/11 resolver: 既存`raceCardBridge.test.ts`・`provisionalRunnerDiagnostic.test.ts`で確認済み（無変更、無回帰）。
  - 11/11 predictionEligible: 同上。
  - template validation: 新規テスト（テンプレートが現状`normalizeRaceCard()`を通らないことを固定）。
  - unknown frame/gateでformal Stage Aを誤生成しない: 上記template validationテスト、および実際のCLI実行（`npm run racecard:check`が終了コード1でエラー表示）で確認。
  - going unknownを100%扱いしない: 新規テスト（evaluatedComponentCountがgoingを除外すること・adjustedPercentが単純100%固定にならないことを確認）+ 既存`suitabilityV1.test.ts`の回帰。
  - Frozen Benchmark 70.3: `abilityModelV1.frozenBenchmark.test.ts`、3 pass。
  - Production data regression: シェイクユアハート70.9（本ラウンドdata/horses無変更のため構造的に不変、実測でも確認）。
  - Base Ability V1 / Suitability V1: 既存テスト群、無回帰。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存の警告（courseTimeBaselines不足等）は本ラウンド無関係の既存事項。

## 11. 判定

**B-SPEC**。

理由（無理にAを出していない根拠）:
- 計算パイプライン自体（Base Ability・Suitability V1・MemberLevel Evidence・Short
  Career・Runner Resolver・Formal Gate判定）は、枠順発表後にコード変更なしで
  そのまま動く状態にあることを実測で確認した（8節の手順1〜3だけで、追加実装
  無しに正しいAbility Boardが出る）。
- しかし、**「正式Stage A Snapshotをどこに・どの形式で・不変性を担保して保存するか」
  が本プロジェクトに一切存在しない**（`buildGateConfirmedSnapshot()`はメモリ上の
  オブジェクトを返すだけで、ファイル書き込み等の永続化コードはどこにも無い。
  9節/12節参照）。これは「計算はできるが、記録として確定・固定する手段が無い」
  という状態であり、CHECKPOINT13完全A条件の「Snapshot immutable」を満たせない。
- 「Rank Change（Base→Effective順位変化）」も、専用フィールドとしては未実装
  （両ランクは保持済みなので差分計算は呼び出し側で可能だが、構造化された
  出力契約としては未決定）。

以上2点は「仕様判断が残っている」ものであり、データ不足でも重大なロジック不備でも
ないため、B-SPEC（Stage A前に仕様判断が残る）と判定する。

## 12. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Formal Stage A Snapshotの永続化設計（最優先）**: 保存先（例: `src/ability/data/snapshots/`
   配下にraceId＋generatedAtでファイル名を構成するJSON）、フォーマット
   （`PredictionSnapshot`型をそのままシリアライズでよいか）、そして「immutable」を
   どう技術的に担保するか（上書き禁止の運用ルールのみか、書き込み時のハッシュ記録か、
   一度保存したファイルを検知して二重保存をエラーにするCLIガードを作るか）。
2. **Rank Change（Base Ability順位→Effective Ability順位の変化量）を`AbilityBoardRow`の
   専用フィールドとして追加するか**。現状は`rankByBaseAbility`と
   `rankByEffectiveAbility`の差分として呼び出し側で計算可能だが、構造化された
   出力契約として固定するかどうかは未決定。
3. **raceId/raceNumberの命名規約**: これまでdata/horses内の実データraceId
   （例: `JRA-20260510-TOKYO-11`）と一致する形式を、新潟記念本番でもそのまま
   採用するかどうかの確認（テンプレートは`null`のままで対応済みだが、
   実データ投入時のcanonical raceId命名は要確認）。
4. **枠順発表のデータ取得経路**: 手動でテンプレートJSONへ転記するか、CSV経由か、
   外部ソース連携かは、CHECKPOINT13完了時点から未決定のまま持ち越されている項目
   （`docs/checkpoint13-prediction-snapshot-v1.md` 10節、項目1と同一の未解決事項）。

以上、CHECKPOINT13.5A完了。正式Stage A・CHECKPOINT14へは進まず、ここでSTOPする。

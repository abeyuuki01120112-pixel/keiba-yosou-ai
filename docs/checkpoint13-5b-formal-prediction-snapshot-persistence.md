# CHECKPOINT13.5B — Formal Prediction Snapshot Persistence / Immutable V1

CHECKPOINT13.5Aで唯一残っていたGap（「正式Stage A Snapshotを、変更不能な正式記録として
永続保存する仕組みが存在しない」）だけを埋める実装ラウンド。**実新潟記念の正式Stage Aは
まだ生成していない。** fixture/test dataでのみ保存経路を完成させた。Base Ability V1・
Suitability V1・MemberLevel Evidence V1・Short Career V1・Runner Resolver・Formal Gateの
意味は一切変更していない。

## 1. Persistence設計

DB等の新規基盤は導入せず、file-basedで実装した。

- 追加ファイル: `src/ability/import/formalPredictionSnapshot.ts`
  （既存の`RaceCardBridgeResult`を、正式保存用の平坦なレコードへ変換するだけの層。
  計算は一切行わない）
- 追加ファイル: `src/ability/import/predictionSnapshotStore.ts`
  （`node:fs`によるJSON読み書きのみ。計算ロジックは一切無い）
- 既定の保存先: `src/ability/data/predictionSnapshots/`
  （`src/ability/data/`配下の既存規約(`provisional/`・`racecards/`)に合わせた。
  本ラウンドではテストのみでこのディレクトリを使い、実ファイルはまだ1件も
  作成していない — commit差分にも本ディレクトリは含まれない）
- 1 snapshot = 1 JSONファイル（`<snapshotId>.json`）。deterministic・testable・
  versionable・immutableの4条件を、ファイル単位のno-overwrite保証（3節）と
  決定的なID設計（4節）で満たす。

## 2. Snapshot Schema

`FormalPredictionSnapshotRecord`（新規型、`formalPredictionSnapshot.ts`）:

```
snapshotId
raceId / raceDate / raceNumber / racecourse / surface / distance / scheduledStartTime
stage / formal（常にtrue）
predictionCutoffAt / generatedAt
modelVersion / inputVersion / datasetVersion（DatasetVersionInfo、datasetFingerprint等を含む）
going（evaluated / going）
raceCardInput（RaceCardInputそのもの、深いコピー）
raceCardFingerprint
runners[]（後述）
totalRunners / predictionEligibleCount
warnings
schemaVersion
```

`runners[]`の1頭ぶん（`FormalSnapshotRunnerRecord`）:

```
horseId / sourceHorseId / horseName / frame / horseNumber / assignedWeight / scratched
baseAbility / rankByBaseAbility
distanceSuitability / courseSuitability / goingSuitability / gateSuitability
overallSuitabilityPercent / overallConfidence / evaluatedComponentCount
effectiveAbility / rankByEffectiveAbility
predictionEligible / warnings
abilityEvidenceCount / knownCareerRaceCount / historyCompleteness / historyConfidence / shortCareer
memberLevelEvidenceStatus
```

チェックポイント本文3節の要求項目を全て含む。既存型（`AbilityBoardRow`・
`HorseSnapshotEntry`・`AbilityEvidence`・`MemberLevelEvidence`）のフィールド名を
そのまま踏襲し、意味は変えていない。

## 3. Immutable保証

`persistPredictionSnapshot()`の挙動:

| 状況 | 挙動 |
|---|---|
| 既存snapshotIdが無い | 新規作成（`status: "created"`） |
| 既存snapshotIdがあり内容が完全一致 | no-op（`status: "duplicate"`）。ファイルは書き換えない |
| 既存snapshotIdがあり内容が異なる | 拒否（`status: "rejected"`）。ファイルは書き換えない |

内容比較はJSON文字列の単純比較ではなく、キー順に依存しない再帰的な構造比較
（`deepEqualJsonValue()`）で行う。silent overwriteは発生しない
（Test C、8節Test Results参照）。update/delete APIはV1では提供していない
（13節の指示どおり）。

## 4. Snapshot ID / Idempotency

`buildFormalSnapshotId(raceId, stage, predictionCutoffAt)` =
`${sanitize(raceId)}__${stage}__${sanitize(predictionCutoffAt)}`
（`sanitize`はファイル名に不安全な文字を`-`へ置換するだけ）。

- 同一raceId・同一stage・同一predictionCutoffAtなら常に同じID → 誤って2回保存しようと
  しても3節の重複判定でno-opになる（idempotent）。
- stageが異なれば（Stage A=`gateConfirmed` vs Stage B=`t2h`）別ID → 7節。
- 将来同一レースを再生成する場合も、predictionCutoffAt（実質的に生成時刻）が変われば
  別IDとなり、過去recordを破壊しない。

## 5. Dataset / Model Traceability

- `modelVersion`: 既存`PREDICTION_SNAPSHOT_MODEL_VERSION`
  （`"ability-model-v1+suitability-v1"`、無変更）をそのまま保存。
- `datasetVersion`: 既存`getProductionDatasetVersionInfo()`
  （CHECKPOINT13.4C/Dで導入、無変更）の戻り値をそのまま保存。内部に
  Base Ability V1 formulaのバージョン（`"BA-V1"`）・`datasetFingerprint`・
  `horseCount`・`totalRaceCount`・`maxRaceDate`を含む。
- これにより「このPredictionはどのModelとどのDatasetで作られたか」を、
  保存済みrecordだけから完全に確認できる。

## 6. Input Traceability

- `raceCardInput`: 正式Predictionに使用した`RaceCardInput`（frame/horseNumber/
  assignedWeight/scratched/going等を含む全体）を、JSON往復による深いコピーで
  保存（呼び出し側が後から参照を書き換えても、保存済みrecordは影響を受けない）。
- `raceCardFingerprint`: `RaceCardInput`の内容から`fnv1a`（`datasetFingerprint`と
  同じ方式、`datasetVersion.ts`から共用のためexport化）で決定的に算出した
  ハッシュ値。同一内容なら常に同じ値、1件でも異なれば別の値になることをTest Hで
  確認した。複雑な新規基盤（暗号学的ハッシュ・署名等）は導入していない（8節の指示どおり）。

## 7. Stage A / Stage B分離

snapshotIdに`stage`が組み込まれているため、同一raceIdでもStage A
（`stage: "gateConfirmed"`）とStage B（`stage: "t2h"`）は別ファイルとして保存される。
Test Dで、Stage B保存後もStage Aの内容（`baseAbility`含む）が変化しないことを確認した。
`listPredictionSnapshots({raceId})`でraceId単位に両方を横断的に一覧できる。

なお、Stage B用の正式な「Race Card → Runner Resolve → Formal Gate」橋渡し関数
（`runRaceCardBridge()`のStage B版）はまだ存在しない。テストでは既存の
`buildT2hSnapshot()`（無変更）を直接呼び、Stage Aの`RaceCardBridgeResult`から
`diagnosticSnapshot`だけを差し替える形でStage B用recordを構築した（12節参照）。

## 8. Diagnostic / Formal分離

2段階で防御している。

1. `buildFormalPredictionSnapshotRecord(bridgeResult)`は、
   `bridgeResult.gate.formal !== true`の場合に例外を投げ、そもそも
   `FormalPredictionSnapshotRecord`を構築しない。
2. `persistPredictionSnapshot(record)`も、`record.formal !== true`の場合に
   例外を投げる（型を迂回して不正なオブジェクトを直接渡した場合への念のための防御）。

diagnostic専用の別namespace（別ディレクトリ）は用意していない
（そもそも1.の時点でformal=falseのrecordを作れないため、namespace分離は不要と判断した）。

## 9. 保存 / 読込方法

```typescript
import { runRaceCardBridge } from "./src/ability/import/raceCardBridge";
import { buildFormalPredictionSnapshotRecord } from "./src/ability/import/formalPredictionSnapshot";
import { persistPredictionSnapshot, loadPredictionSnapshot, listPredictionSnapshots } from "./src/ability/import/predictionSnapshotStore";

const bridgeResult = runRaceCardBridge(raceCardInput);
if (!bridgeResult.gate.formal) {
  // まだ正式保存できない（reasonsを確認）
} else {
  const record = buildFormalPredictionSnapshotRecord(bridgeResult);
  const result = persistPredictionSnapshot(record); // dirを省略すると既定の保存先
  // result.status: "created" | "duplicate" | "rejected"
}

const loaded = loadPredictionSnapshot(snapshotId); // 見つからなければnull
const all = listPredictionSnapshots({ raceId }); // フィルタ省略可
```

CLIラッパー（`npm run snapshot:persist`相当）は今回作成していない
（12節・14節、次の決定事項として残す）。

## 10. Test Results

新規テストファイル: `src/ability/import/__tests__/predictionSnapshotStore.test.ts`
（13件、保存先はすべて`os.tmpdir()`配下の一時ディレクトリ。本番の
`src/ability/data/predictionSnapshots/`は今回1件も作成していない）。

| チェックポイントのTest | 対応するテスト | 結果 |
|---|---|---|
| Test A: Formal Stage A Snapshotを保存できる | 「Test A」describe | pass |
| Test B: 保存後にdata/horsesを変更しても値が変わらない | 「Test B」describe（loadPredictionSnapshot()が再計算しないことを直接確認） | pass |
| Test C: 同じsnapshotIdを別内容で上書きできない | 「Test C」describe（reject確認＋完全一致はduplicate確認） | pass |
| Test D: Stage A保存後にStage Bを保存してもStage Aは変化しない | 「Test D」describe | pass |
| Test E: diagnostic/formal=falseは保存されない | 「Test E」describe（builder例外＋persist側の防御の両方） | pass |
| Test F: going evaluated=falseが保存後も維持される | 「Test F」describe | pass |
| Test G: modelVersion/datasetFingerprintが保存される | 「Test G」describe | pass |
| Test H: Race Card input値が追跡可能 | 「Test H」describe（frame/horseNumber等の追跡＋fingerprintの決定性） | pass |
| Test I: Frozen Benchmark シェイクユアハート=70.3 | 既存`abilityModelV1.frozenBenchmark.test.ts`（無変更） | pass |
| Test J: Production Base Ability regressionなし | 既存回帰テスト群（`predictionSnapshot.test.ts`等、無変更） | pass |

- `npx tsc -b`: エラーなし。
- `npm test`: **682 / 682 pass**（新規13件、既存669件は無変更・無回帰）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし（transformされたmodule数502で本ラウンド前と同一 —
  新規persistence関連ファイルはApp.tsx（ブラウザバンドル）から到達不能であることを確認済み。
  `node:fs`を使うファイルをブラウザバンドルへ混入させていない）。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告は本ラウンド無関係の既存事項。

## 11. Regression

- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更）。
- **Production Base Ability**: 本ラウンドは`data/horses/`を一切変更していない
  （コードのみの変更）。既存の回帰テスト（`predictionSnapshot.test.ts`・
  `shortCareerEligibility.integration.test.ts`・`memberLevelEvidence.test.ts`・
  `provisionalRunnerDiagnostic.test.ts`）が無回帰で通過。
- **Suitability V1**: `suitabilityV1.ts`・`goingSuitability.ts`・
  `courseContextPrior.ts`等は一切変更していない。既存テスト無回帰。

## 12. CHECKPOINT13残課題

CHECKPOINT13.5Aで挙げた項目の更新版:

- ~~Formal Stage A Snapshotの永続化設計~~ → **本ラウンドで解消**。
- Rank Change（Base→Effective順位変化）を`AbilityBoardRow`の専用フィールドとして
  追加するか → 未決定のまま持ち越し。
- 実データ投入経路（枠順発表の取得元） → 未決定のまま持ち越し
  （`docs/checkpoint13-prediction-snapshot-v1.md`以来の既知の未解決事項）。
- Stage B用の正式なRace Card Bridge（`runRaceCardBridge()`のStage B版） → 未着手
  （7節参照。現状は`buildT2hSnapshot()`を直接呼ぶ想定）。
- 保存済みSnapshotをCLIから作成・一覧するラッパースクリプト → 未着手（14節）。

## 13. 判定

**A**。

枠順確定後、既存の計算経路（Race Card → normalizeRaceCard() → runRaceCardBridge() →
gate.formal確認 → buildFormalPredictionSnapshotRecord() → persistPredictionSnapshot()）を
そのまま呼ぶだけで、正式Stage A Snapshotを変更不能な記録として生成・保存できる状態に
なった。追加のコード変更・仕様判断は不要（CLIラッパーの有無は利便性の問題であり、
API自体は完成している）。

無理にAを出していない根拠:
- Test A〜Hすべてを、実際のRace Card Bridgeの出力（fixtureのシェイクユアハート、
  実データ）に対して実行し、期待どおりの挙動を確認した（モックや仮定のみに頼っていない）。
- Immutable性（Test C）・idempotency（Test C後半）・Formal/Diagnostic分離（Test E）・
  Stage分離（Test D）を、いずれも「値が同じなら何が起きるか」「値が違えば何が起きるか」
  の両方向で確認した。
- CHECKPOINT13.4J以来一貫している既存フリーズ制約（Base Ability/memberLevel/
  Suitability V1/Runner Resolver/Formal Gateの意味）を数式レベルで無変更のまま確認。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **CLIラッパースクリプトの要否**: `npm run racecard:check`の延長として、
   gate.formal=true時に自動でFormal Snapshotを保存する`npm run snapshot:persist`
   相当のCLIを作るかどうか。現状はプログラムAPI（`persistPredictionSnapshot()`等）
   のみ提供。
2. **Rank Change専用フィールド化**: CP13.5Aから持ち越し。
3. **実データ投入経路**: CHECKPOINT13から持ち越しの未解決事項（枠順発表の
   取得元・転記方法）。
4. **Stage B用Race Card Bridgeの正式実装**: 現状`buildT2hSnapshot()`を直接呼ぶ
   想定のみで、Runner Resolve〜Formal Gateまで含めたStage B版の橋渡し関数は無い。
5. **Snapshotディレクトリの長期運用方針**: 保持期間・アーカイブ・UI表示等は
   本ラウンドのスコープ外のまま。

以上、CHECKPOINT13.5B完了。正式Stage A・CHECKPOINT14へは進まず、ここでSTOPする。

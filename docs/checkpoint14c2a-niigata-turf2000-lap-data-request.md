# CHECKPOINT14C.2A — 新潟芝2000m Lap Data Request Manifest / Pilot Baseline Plan

ChatGPT側でLap実データを収集する前に、対象Historical Raceを**結果を見る前に機械的に
固定**し、必要なData Manifestを確定する。外部Web検索・Lap Data投入・Pace Engine変更は
一切行っていない。新規コード変更は`racePaceValidationTypes.ts`への
provenance/courseLayout/raceClassフィールド追加のみ（CHECKPOINT14C.1で確定した
Actual Pace Data Contract自体の拡充であり、CHECKPOINT14CのPace Engine
（`racePacePrediction.ts`・`racePacePredictionTypes.ts`）は`git diff`で無変更を確認済み）。

## 1. Deterministic Race Selection Rule

以下の8条件をそのまま適用した（結果非依存、着順・lap内容を見ずに機械的に決定）:

```
1. racecourse == 新潟
2. surface == turf
3. distance == 2000
4. raceDateが（現時点で未公式発表の）2026新潟記念より前
5. 同一course layoutを優先
6. raceDate新しい順
7. 最大8レース
8. 最低5レース
```

**repository/course schemaとの整合性監査**: 条件1〜3・6〜8はrepositoryのデータ構造
（`racecourse`/`surface`/`distance`/`raceDate`はいずれも100%populated、1節参照）と
問題無く整合する。条件4は、2026新潟記念の公式`raceDate`自体が`data/racecards/
niigata-kinen-2026-stage-a.template.json`内で依然`null`（未確定）のため、直接の日付
比較はできない。ただし`data/horses/`に記録されている全レースは定義上「既に実施済みの
過去走」であり、まだ開催されていない新潟記念より論理的に前であることは自明なので、
**この条件は実質的に自動的に満たされる**（矛盾は無い）。条件5については2節を参照
（repository上判定不能）。**ルール自体を勝手に変更する必要のある問題は見つからなかった。**

## 2. Course Layout Audit

`RacePerformance`（`src/ability/types.ts`）・`courseKarte/`のいずれにも、内回り/外回り
等の構造化された`courseLayout`区別フィールドは**存在しない**。`courseKarte/
tokyoDirt1600.json`にある`"layout"`キーは、ダートコースの自由記述説明文
（"2コーナー奥の芝ポケットからスタートしダートへ合流。"）であり、機械判定に使える
構造化情報ではない。

**したがって`courseLayout = unknown`として明示する。** 推測は行っていない
（`racePaceValidationTypes.ts`の`RaceLapSequenceRecord.courseLayout: string | null`に
新設し、null=unknownを既存コードベースの規約通りに割り当てた）。

## 3. Existing Candidate Races

`data/horses/`全447ファイル・891レコード（unique raceId 127件）を再走査した結果:

**新潟・芝（全distance）: 3件**

| raceId | raceDate | raceName | distance | raceNumber | going | fieldSize |
|---|---|---|---|---|---|---|
| JRA-20260808-NIIGATA-07 | 2026-08-08 | 関越ステークス | 1800m | 7 | 良 | null |
| JRA-20260516-NIIGATA-11 | 2026-05-16 | 新潟大賞典 | 2000m | 11 | 良 | null |
| JRA-20250727-NIIGATA-02 | 2025-07-27 | 2歳未勝利 | 1800m | 2 | 良 | null |

**新潟・芝・2000m（選定条件に完全一致）: 1件のみ**

このデータセット（`data/horses/`）は「追跡対象馬の過去走履歴」の集合であり、JRAの
全レース結果を網羅した独立データベースではない点に留意（8節）。

## 4. TARGET_PILOT_RACES

最大8件を目標としたが、**repository内には1件しか候補が存在せず、最低5件を下回った**。
`racecourse+surface+distance`条件を緩めず、結果を見て別のcourse/distanceへ都合よく
切り替えることも行っていない（指示通りルールを固定したまま）。

```
selectionOrder: 1
raceId:         JRA-20260516-NIIGATA-11
raceDate:       2026-05-16
raceName:       新潟大賞典
raceNumber:     11
racecourse:     新潟
surface:        turf
distance:       2000
going:          良
fieldSize:      null
courseLayout:   unknown
selectionReason: "same course/surface/distance, most-recent-first deterministic
                  selection; 現時点でrepository内に存在する新潟・芝・2000mの唯一の候補"
```

**ステータス: `EXTERNAL_DISCOVERY_REQUIRED`**（5件未満のため、無理に推測せず外部
特定が必要と判定。8節の指示通り）。

## 5. RaceLapSequenceRecord正式Schema

`src/ability/racePaceValidationTypes.ts`のコードをそのまま転記（コードがsource of
truth）。CHECKPOINT14C.2Aで、監査結果（2〜3節）を踏まえ、`raceNumber`・
`courseLayout`・`raceClass`・`sourceRaceId`・`importedAt`を追加し、`fieldSize`を
`number`から`number | null`へ変更した（3節の通り、既知の1件が`fieldSize:null`だった
ため、既存`RacePerformance.fieldSize`と同じnullable規約に合わせた）:

```typescript
export interface RaceLapSequenceRecord {
  raceId: string;
  raceDate: string;
  raceName: string;
  raceNumber: number | null;
  racecourse: string;
  surface: "turf" | "dirt";
  distance: number;
  going: string;
  fieldSize: number | null;
  courseLayout: string | null;   // 判定不能ならnull（=unknown）
  raceClass: string | null;      // metadataのみ、baseline keyには使わない
  segmentMeters: number;
  lapSequence: number[];
  source: string;
  sourceRaceId?: string | null;
  importedAt?: string | null;
}
```

## 6. lapSequence Validation Contract

- **形式**: `[12.7, 11.3, 11.8, ...]`（スタートから順の区間タイム、秒）。
- **区間距離**: `segmentMeters`で明示必須（推測しない。JRA公表ラップは通常200m区間だが
  決め打ちにしない）。
- **整合性チェック**: `lapSequence.length × segmentMeters`が`distance`と
  `segmentMeters`超の差で食い違う場合は警告（`racePaceValidation.ts`の
  `checkLapSequenceCoverage`、block はしない、末尾半端区間は許容）。
- **不完全データ**: 欠けている区間を0埋め等で補完しない。分かる区間だけを配列に入れる
  （配列を短くする）。

## 7. first600 / first1000 Derivation

新潟芝2000m（例: 10区間×200m）を入力した場合の動作:

- `first600mSeconds`: `distance>=600` かつ `600 % segmentMeters==0` かつ
  `lapSequence.length>=600/segmentMeters`の場合のみ、先頭`600/segmentMeters`区間
  （200m区間なら3区間）を合計。
- `first1000mSeconds`: 同様に`1000/segmentMeters`区間（200m区間なら5区間）を合計。
  `distance<1000m`の場合は常にnull。

**ChatGPT側はfirst600/first1000を手計算する必要は無い。** `lapSequence`だけを渡せば、
`src/ability/racePaceValidation.ts`の`deriveFirst600mSeconds`/
`deriveFirst1000mSeconds`が機械的に導出する（既存実装、無変更）。

## 8. Race-level Architecture

`src/ability/data/raceLapData.json`（`{note, laps: RaceLapSequenceRecord[]}`、
CHECKPOINT14C.1で新設、既存`raceFieldAggregates.json`と同じraceIdキーの別ファイル
方式）をそのまま使う。`race_performances.csv`・`data/horses/*.json`への重複保存は
行わない。`raceHistoryPipeline.ts`等の本番読み込み経路へはまだ接続していない
（今回もこれを維持）。

## 9. Provenance

既存`RacePerformance`の`source`/`sourceRaceId`/`importedAt`という追跡情報の規約と
整合させるため、`RaceLapSequenceRecord`に`sourceRaceId?: string | null`・
`importedAt?: string | null`を追加した（5節）。`source`は既存通り必須のまま。

## 10. Leave-One-Race-Out Baseline案（仕様提案のみ）

8レースを検証する場合、レースAのActual Pace baselineを計算する際は、レースA自身を
baseline sample集合から除外する（自己参照回避）方式を提案する。実装は、baseline実
データが十分な件数揃った段階（V1.1）で検討する。**今回はPace Engine自体を変更して
いない**（仕様提案のみ）。

## 11. Future Leakage Safety

各Historical RaceのPrediction入力には、そのraceDateより前に存在した馬履歴のみを使う
という既存規約（`getHorseRecentRaces()`経由、baseAbility.ts等と同じ）をそのまま適用する。
Actual Lap Dataは答え合わせ専用であり、`racePacePrediction.ts`は
`racePaceValidationTypes.ts`・`racePaceValidation.ts`のいずれも一切importしていない
ことをコード上確認済み（CHECKPOINT14C.1から無変更）。

## 12. Pilot Validation Metrics（再確認）

Pilotで確認予定の指標は3点に限定する: Pace Class Accuracy、Confusion Matrix、
continuousPacePressure vs continuousActualPaceの相関。sample数が少ないため相関係数の
過大解釈はしない。first600/first1000の秒数MAEはPrediction側未実装のため今回は
主要指標に含めない（CHECKPOINT14C.1から変更無し）。

## 13. Machine-readable Manifest

`docs/checkpoint14c2a-niigata-turf2000-lap-data-request.json`として出力した
（selectionRule・repositoryAudit・targetPilotRaces・dataSchema・
lapSequenceValidationContract・derivationContract・raceLevelArchitecture・
leaveOneRaceOutBaselineProposal・pilotValidationMetrics・
explicitlyOutOfScopeThisRoundを含む）。外部取得は行っていない。

## 14. 判定

**B-DATA-DISCOVERY**。

Deterministic Selection Rule・Schema・Validation Contract・Race-level
Architectureはいずれも確定し、ChatGPT側でそのままLap Data Packageを作成できる状態に
ある（5〜13節）。しかし、repository内で確実に特定できた新潟・芝・2000mのHistorical
Raceは**1件のみ**であり、目標（最低5件、理想8件）を下回った。無理に他course・他
distanceへ条件を緩めたり、`data/horses/`に無いレースIDを推測で埋めたりしていない。
したがって「Contract/Schemaは確定したが、対象race identityの追加特定に外部情報が
必要」という状態を正確に表すB-DATA-DISCOVERYと判定する。無理にA-DATAとはしない。

## 15. 次にChatGPTと決める必要がある項目（優先順位順）

1. **新潟・芝・2000mの追加候補（4〜7件）の外部特定**: JRA公式レース結果等、
   repository外の情報から、`data/horses/`に無い新潟・芝・2000mレースのrace identity
   （raceId相当・raceDate・raceName・raceNumber・going・fieldSize）を追加できるか。
2. **1件のみでPilotを開始するか、追加特定を待つか**: 5件未満での試験投入は
   Pilotとしても統計的意味が乏しいため、追加特定を待つことを推奨するが、最終判断は
   ChatGPT側で。
3. **courseLayout=unknownのまま進めるか**: 内外回りの区別が付かない前提で
   baselineをプールしてよいか、それとも判明するまで待つか。
4. **raceClassの扱い**: `raceName`から人間が読み取ったraceClassを、metadataとして
   手動で補完する運用にするか（機械的には捏造しない方針を維持）。

以上、CHECKPOINT14C.2A完了。Lap Data取得・Import・CHECKPOINT14C.2Bへは進まず、
ここでSTOPする。

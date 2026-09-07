# CHECKPOINT 14D.1B — Niigata Turf 2000 Gate Data Contract Final Export

CHECKPOINT14D.1A（B-NEW-DATA判定）を受け、ChatGPT側が**次のターンで迷わず
実データZIPを作れる**よう、DATA REQUEST CONTRACTを本回答へ完全展開する。
**今回はデータ取得・Import・Gate実装・Stage A再計算は一切行っていない
（audit/spec-onlyラウンド、コード・データ変更なし）。**

---

## 1. 推奨ZIP名

**`niigata_turf2000_gate_history_v1.zip`**

既存の命名規則（`niigata_turf2000_suitability_validation_v1.zip`、
`niigata_daishoten_phase1_position_identity_v1.zip`等）と整合する
`<競馬場>_<コース条件>_<用途>_v1.zip`パターンを踏襲した正式名称として確定する。

---

## 2. ZIP内部構成

既存Importer（`buildImportResult`/`scripts/importRacePerformancesCsv.ts`）は
固定の21列CSVスキーマのみを読む設計であり、新規列（courseLayout/
courseVariant）を追加しても**無視されるだけで消費されない**（`normalizeRacePerformance`
は`row.xxx`という決め打ちの列名しか参照しない）。この制約を踏まえ、以下の構成を
指定する:

| filename | purpose | required/optional |
|---|---|---|
| `race_gate_history.csv` | 出走馬単位の実データ本体。既存21列契約＋新規2列
  （courseLayout・courseVariant）。**required** |
| `PACKAGE_MANIFEST.json` | レース件数・行数・courseVariant分布等の集計値
  （既存ZIP群と同じ慣行）。**required** |
| `SOURCE_MANIFEST.csv` | raceIdごとの出典（人手確認可能な形、
  CHECKPOINT14C.2C以降で毎回使っている形式）。**required** |
| `README.md` | 収録内容の概要、既知の欠損（競走中止等）の明記。**required** |

4節の通り、courseLayout/courseVariantは`race_gate_history.csv`の追加2列として
統合する（別ファイルに分離しない）——理由は10節で説明する。

---

## 3. CSV正式Header（1行で完全表示）

```
raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId
```

既存の21列公式契約（`raceId,raceDate,racecourse,raceNumber,raceName,surface,
distance,going,horseId,horseName,horseNumber,gate,finishPosition,
carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,
passingPosition,source,sourceRaceId,sourceHorseId`）の列名・順序をそのまま
維持し、`courseLayout`・`courseVariant`を`going`の直後に挿入した（CHECKPOINT14D.1Aと
同一の位置、変更なし）。**旧エイリアス（`timeGap`/`raceTime`/`final3F`/
`carriedWeight`）は使用禁止。**

---

## 4. Required Fields

`src/ability/import/normalize.ts`の`normalizeRacePerformance()`を実コード監査した
結果、以下が**必須（空だとエラーで行全体がreject）**:

```
raceId, horseId, horseName, raceDate（YYYY-MM-DD形式）, racecourse,
raceName, going, surface（turf/dirt）, distance（正の数値）
```

`courseLayout`・`courseVariant`は既存importerが読まない新規列のため、
このバリデーションの対象外——空でも既存importer自体はエラーにしない
（ただし今回のGate用途では実質必須、6節参照）。

---

## 5. Optional Fields

同じく実コード監査により、以下は**任意（空セル=null許容）**:

```
raceNumber, gate（枠番）, horseNumber（馬番）, finishPosition, fieldSize,
carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds,
passingPosition, source, sourceRaceId, sourceHorseId
```

ただし`passingPosition`を指定する行は、**同じ行に`fieldSize`も必須**
（`normalize.ts` 162-176行、通過順位の相対化に使うため）。

---

## 6. horseId Contract

**`horseId`は必須（required = true）。**

理由: 既存importer（`normalize.ts` 100-103行）は、既にhorseId空文字を
`errors.push("horseId が空です")`として**無条件にreject**する設計になっている
——これは今回新しく決める規則ではなく、**既存の凍結済み挙動そのもの**。

旧ZIP（`niigata_turf2000_suitability_validation_v1.zip`）でhorseId欄が
全て空だったため、66行中64行（グランディア以外）が事実上「照合不能」に
なった反省を踏まえ、**今回のZIPでは必ずcanonical horseIdを埋めてもらう**。

horseId不明のrunnerの扱い:

| 状況 | 扱い |
|---|---|
| 既存`data/horses/`に該当馬が実在する | horseIdをそのまま使用（**必須**） |
| 新規馬（`data/horses/`未収録） | **reject**（既存importerの既定動作、
  今回新たに緩和しない）。ただし別途、その馬自身の直近走データ（標準の
  race_performances.csv契約）を提供してもらえれば、新規horseId採番の上で
  取り込み可能——それは今回のGate専用ZIPのスコープ外として別リクエストにする。 |

`allowed_with_warning`（horseId不明のまま警告付きで許容）は**採用しない**
——既存importerの安全設計（silent overwrite禁止と同じ思想）を緩めることに
なるため。

---

## 7. raceId Contract

正式形式: **`JRA-YYYYMMDD-NIIGATA-RR`**（例: `JRA-20260516-NIIGATA-11`、
既存productionデータの新潟大賞典と同一形式）。`RR`はレース番号を2桁ゼロ埋め。

架空IDは禁止。整合ルール:

- `raceId`中の`YYYYMMDD`部分は`raceDate`列と一致すること。
- `raceId`中の`NIIGATA`は`racecourse`列（"新潟"）と対応すること。
- `raceId`中の`RR`は`raceNumber`列と一致すること（例: raceNumber=11なら`RR=11`）。

この整合はClaude側のDry Run（21節）で機械チェックする。

---

## 8. courseLayout / courseVariant Contract

固定条件（変更不可）:

```
racecourse = 新潟
surface = turf
distance = 2000
```

`courseLayout`・`courseVariant`の扱い:

- **`courseLayout`**: 値`"outer"`（外回り）を正式値として使用する（9節でleft_outer/outer
  問題を判定）。内回りのレースは**対象外**（CURRENT TARGETが外回りのため）。
- **`courseVariant`**: A/B/C等のコース使用区分。10節の通り、Historical Dataから
  確認できない場合は**null許容**（推測で"A"等を埋めない）。

---

## 9. left_outer / outer判定

**判定: A（`left_outer`と`outer`は意味的に同じ新潟芝2000m外回りを指す）。**

根拠（repository内の事実に基づく）:

1. `raceLapData.json`の`courseLayout`フィールドの型コメント
   （`racePaceValidationTypes.ts` 44行）は「内回り/外回り等のコース形状バリアント」
   とのみ記載しており、**左右の回り方向を別軸として扱う設計にはなっていない**
   ——コードの型定義自体が方向情報を持たない。
2. JRA新潟競馬場の芝コースは、構造上**左回り以外の設定が存在しない**（右回り新潟芝
   コースというもの自体が実在しない）——これは本プロジェクトのdocs内で明示的に
   確認された記述ではなく、一般的な競馬知識に基づく推論であることを明記する
   （repository内で検証済みの事実ではない）。
3. 1と2を合わせると、新潟という単一競馬場に限れば「左回り」は常に自明な定数であり、
   `left_outer`という表記の`left_`部分は冗長な情報——`outer`のみで実質的に
   同じコース状態を指していると判断できる。

**canonical value: `courseLayout = "outer"`**（`raceLapData.json`と同じ語彙、
`left_`prefixは付けない）を新ZIPの正式値として採用する。

`courseLayout`と`courseVariant`の役割分離:

```
courseLayout = "outer"   （内回り/外回りの区別。今回は外回りのみ収集）
courseVariant = "A" | "B" | null   （A/Bコース区分。10節参照）
```

---

## 10. A/Bコース扱い

**Historical DataからA/B区分を信頼できるソースで確認できない場合は
`null`を正式に許容する。** 推測での"A"補完は禁止。

現状: `raceLapData.json`（`JRA-20260516-NIIGATA-11`）にも`courseVariant`に
相当するフィールドは存在せず、`left_outer`（旧ZIP）にもA/B情報は含まれて
いなかった——**repository内のいかなるソースにもA/B区分の確定情報は無い**
（CHECKPOINT14D.1で確認済み、変化なし）。

したがって、新ZIPのHistorical raceについては`courseVariant`列を**空欄
（null）のまま提出してよい**——分かる場合のみ記入。CURRENT TARGET
（2026新潟記念）自体の`courseVariant = "A"`は、checkpoint本文でユーザーから
明示された値であり、Historical Datasetの不明値と混同しない。

---

## 11. Historical Selection Rule（決定的ルール、旧5レースとの関係を含む）

### 旧5レース66行との関係（12節相当）

3節の通り、`niigata_turf2000_suitability_validation_v1.zip`の元データ66行は
repository内に現存せず、5レース中3レースのraceId/raceDateの断片のみ復元可能
（CHECKPOINT14D.1Aで確認済み）:

| raceId | raceDate |
|---|---|
| 202604010607 | 2026-05-17 |
| 202604010710 | 2026-05-23 |
| 202604020610 | 2026-08-09 |

**この3レースは、上記raceId形式（`202604010607`等）が7節の正式raceId形式
（`JRA-YYYYMMDD-NIIGATA-RR`）と一致しない**（旧ZIP独自の内部ID体系だった
可能性が高い）。したがって、たとえChatGPT側にこの3レースの元データが
残っていても、**新ZIPへ含める際は7節の正式raceId形式へ変換して
提出してもらう必要がある**（架空IDのまま流用しない）。

**旧5レースの完全再現は必須要件ではない。** 新しい十分なHistorical Dataset
（新ZIPで新規収集する分）だけでGate Suitability検証は可能——旧データは
「もし残っていれば」追加してもらうボーナス（16節の優先確認事項）であり、
無ければ無いで新規収集のみで進めてよい。

### 新規収集Race Selection Rule（決定的、repositoryの正式仕様に整合）

```
1. racecourse == "新潟"
2. surface == "turf"
3. distance == 2000
4. courseLayout == "outer"（9節のcanonical value）
5. raceDate < 2026-08-30（CURRENT TARGET、12節）
6. raceDate降順（新しい順）で収集
7. 13節（レース格）・15節（going）の条件を満たす限り、
   到達可能な最大数まで収集（固定件数で打ち切らない）
```

---

## 12. Minimum Sample

`minimumRaceCount`・`minimumRunnerCount`は根拠なく発明しない。既存プロジェクトで
唯一の直接的な先例は、東京ダート1600m CoursePriorの検証がSTEP1として
**10戦157頭**から開始されたこと（`docs/gate-suitability-v1-decision.md`）。
この前例に基づき:

```
minimumRaceCount: 10（東京ダート1600m STEP1の先例に基づく参考値。
                       「10が正解」という意味ではない）
minimumRunnerCount: 130（10レース×平均13頭、現状唯一のproduction 新潟芝2000m
                          レース（新潟大賞典）のfieldSize=15人に近い想定）
```

**この最低ラインに満たない場合は、無理にGate Effectを算出しない**
（28節、evaluated=falseのまま据え置く既存パターンを踏襲）。

---

## 13. Recommended Sample

東京ダート1600mのCoursePrior検証は、STEP1(10戦)→STEP2(追加20戦、計30戦)へ
拡張された経緯がある（`docs/gate-suitability-v1-decision.md`）。この前例に
基づき:

```
recommendedRaceCount: 30（東京ダート1600m最終検証規模と同数値。
                           これも「30が正解」という意味ではなく、
                           本プロジェクトで唯一実績のあるCoursePrior
                           検証の規模を参考値とした）
recommendedRunnerCount: 400前後（30レース×平均13〜15頭）
```

レース格を条件戦〜重賞まで幅広く含める前提（14節）であれば、この規模は
新潟開催（年数回、1開催あたり複数日）の**数年分**に相当する見込みだが、
「何年分必要か」を年数で決め打ちすることはしない（14D.1の既定方針を維持）。

---

## 14. Ability Control Contract

### ABILITY_CONTROL_RECONSTRUCTABLE = true（条件付き）の条件

`collectGateHorseEvidenceDeltas()`（`suitabilityV1.ts`、既存・凍結）が
既に実装しているのと同じ機構——**horseIdさえ正しく提供されれば、
repository側で以下を機械的に再構築できる**:

1. 対象horseIdが`data/horses/<horseId>.json`に実データとして既に存在する
   （または今回のZIPで新規行として追加される）。
2. `getHorseRecentRaces(horseId)`で全走を取得し、対象走（新潟芝2000m出走）より
   `raceDate`が古い側の走だけを使い`calculateAbilityBeforeRace()`
   （既存・凍結、Ability Model V1）でpre-race能力水準を算出。
3. 対象走の`raceScore`（既存パイプラインで自動計算済み）との差分
   （`raceScore − abilityBeforeRace`）が「能力を統制した残差」となる。

**future leakage禁止**: 上記2は対象走より古い走のみを使う（`recentRaces`が
新しい順配列である前提で`slice(i+1)`する既存実装、CHECKPOINT12.3で
実コードトレース済み）。この仕組みは既に存在し検証済みであり、**新規実装は
不要**。

**preRaceBaseAbility列はZIPに含めなくてよい**——上記の再構築が可能なため。

---

## 15. Frame / Horse Number Contract

`frame`（枠番）と`horseNumber`（馬番）は明確に別概念として収集する。
CSVでは既存契約通り`gate`列が枠番、`horseNumber`列が馬番を表す
（`RacePerformance`型のフィールド名は`gate`だが意味は「枠番」、
コード上のコメント「枠番」で確認済み）。

**両方とも収集する**（11頭が枠番と馬番が近い値になる今回のCURRENT TARGETの
ような偶然があっても、Historical Dataでは両方を独立記録し混同しない）。

`fieldSize`は必須（19節）——`normalizedGatePosition = (horseNumber-1)/(fieldSize-1)`
の算出に必要（`calculateRelativeGatePosition`、既存関数、無変更）。

**算出はClaude側で行う。** ZIP側はraw dataのみ（frame, horseNumber, fieldSize）を
提出し、`normalizedGatePosition`はimport後にClaude側で計算する
——既存の`collectHorseGateEvidence()`が既にこのパターンを採用している
（`relativeGatePosition`をraw dataから都度算出、ZIP側に事前計算値を要求しない）。

---

## 16. Finish Position Contract

正式型: `finishPosition`は**1以上の整数、または空欄（null）**
（`normalize.ts` 128-130行、既存仕様）。

取消・除外・中止・失格等の非通常結果:

- 既存契約には「取消」等を区別する専用のstatus列は無い。
- **`finishPosition`を空欄にする**（null）ことで、既存importerが
  `toRaceHistoryRawInput()`（`buildImportResult.ts` 39-48行）で
  当該行を**能力計算対象から自動的に除外**する（`excludedFromScoringCount`
  として集計される、既存の確認済み挙動）。
- 行自体はCSVに残してよい（監査・完全性のため）——ただし取り込み時は
  スコアリング対象外になる。
- 特別なstatus文字列（"scratched"等）は既存契約に存在しないため、
  **新規に発明しない**。空欄=対象外、という既存の二値ルールをそのまま使う。

---

## 17. Passing Position Contract

**Gate Suitability V1の初期実装に必須ではない**（gate componentの
HorseEvidence計算式`collectGateHorseEvidenceDeltas`はraceScoreのみを
使い、passingPositionを一切参照しない、`suitabilityV1.ts`確認済み）。

ただし、Historical Position Profile V1（既存、CHECKPOINT14B系列）等
他の分析に転用可能なため、**optional・可能なら提供**とする。

正式文字列形式（既存契約、`normalize.ts` 61-87行）:

```
"3-3"（2コーナーのみのコース）
"5-5-4-3"（4コーナーあるコース）
```

ハイフン区切り、1以上の整数のみ。**この行にpassingPositionを含める場合は
同じ行にfieldSizeも必須**（5節）。

---

## 18. Provenance Contract

`source`・`sourceRaceId`・`sourceHorseId`はいずれも既存契約通り**任意**
（空文字→null、既存挙動）。

- `sourceRaceId`/`sourceHorseId`が取得不能でも、**raceId/horseIdがcanonical
  （7節・6節の正式ルールに従っている）であれば許容可能**——既存の
  CHECKPOINT14C.2x系列のImportでも同じ扱いを繰り返してきた（例:
  `sourceRaceId=null`のまま多数のraceを正常Import済み）。
- `source`列には出典の自由記述（例: `"JRA official race results"`、
  既存raceLapData.jsonと同じ慣行）を推奨する。

---

## 19. Dedup Rule

**正式dedup key: `(horseId, raceId)`のペア。**

根拠（既存コード監査、`mergeHorseHistory.ts`）: `mergeHorseRaceHistory()`は
1頭（1 horseId）単位で呼び出され、その中で`raceId`をキーにした
`Map<string, RaceHistoryRawInput>`で重複判定する。`buildImportResult`側も
`byHorseId`でhorseIdごとに行を集約してから、同一horseId内の`raceId`重複
（`seenIncomingRaceIds`）を検出する設計。**`raceId`単独は複数頭が同じ
レースに出るため一意キーにならない**——必ず`horseId`との組み合わせで
判定する。

---

## 20. DATA REQUEST MANIFEST全文（再掲・完全展開）

CHECKPOINT14D.1で作成した
`docs/checkpoint14d1-niigata-turf2000-gate-data-request-manifest.json`/`.md`の
内容を、本ラウンドの決定（3〜19節）で更新・確定した最終版として再掲する。

```json
{
  "manifestId": "NIIGATA_TURF_2000_GATE_DATA_REQUEST",
  "packageName": "niigata_turf2000_gate_history_v1.zip",
  "targetCondition": {
    "racecourse": "新潟",
    "surface": "turf",
    "distance": 2000,
    "courseLayout": "outer",
    "courseVariant": "Historical: null許容（不明可）。CURRENT TARGETのみ'A'（別レコード）"
  },
  "csvHeader": "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId",
  "requiredFields": ["raceId","horseId","horseName","raceDate","racecourse","raceName","going","surface","distance"],
  "requiredForThisRequest": ["courseLayout","frame(gate)","horseNumber","fieldSize"],
  "optionalFields": ["raceNumber","finishPosition","carriedWeightKg","actualRaceTimeSeconds","final3FSeconds","timeGapSeconds","passingPosition","source","sourceRaceId","sourceHorseId","courseVariant"],
  "raceIdFormat": "JRA-YYYYMMDD-NIIGATA-RR",
  "dedupKey": "(horseId, raceId)",
  "futureLeakageRule": "raceDate < 2026-08-30 のみ許容",
  "minimumRaceCount": 10,
  "recommendedRaceCount": 30,
  "raceClassScope": "条件戦・OP・重賞いずれも可（14節）",
  "goingScope": "良・稍重・重・不良いずれも収集可、分割はしない（15節）",
  "preRaceBaseAbilityRequired": false,
  "notes": [
    "旧niigata_turf2000_suitability_validation_v1.zip（5レース・66行）の元データが残っていれば、horseId付きで再送してもらうのが最優先（11節・24節）。",
    "新潟のコース改修履歴が分かれば教えてほしい（未確認事項として継続）。"
  ]
}
```

---

## 21. ZIP到着後のImport手順（今回は実行しない）

```
1. Integrity Check       — ZIP構造・README/MANIFEST/CSVの整合性確認
2. Schema Check           — 3節のCSVヘッダーと完全一致するか、必須列が
                             埋まっているか（4節）
3. Future Leakage Check   — 全行 raceDate < 2026-08-30 か
4. Dry Run                — npm run import:csv -- <path> --dry-run で
                             conflicts/enrichmentCandidates/新規行数を確認
5. Dedup Check             — (horseId, raceId)の重複が無いか（19節）
6. Conflict Check          — 既存data/horses/との食い違い（CP14C.2G/Hで
                             確立した「per-horse-fileブロック、real core
                             conflictのみ弾く」設計をそのまま踏襲）
7. Import                  — conflict無しの行のみ実書き込み
8. Cold Reload              — 新プロセスでディスク永続化を確認
9. Gate Dataset Build       — courseLayout/courseVariant込みのGate専用
                              データセットを構築（data/horses/には
                              courseLayout/courseVariant自体は保存しない、
                              既存スキーマを変更しないため——別途Gate検証用
                              の一時集計として扱う）
10. Gate Suitability Validation — 22節の検証項目を実施
```

---

## 22. Gate Validation Plan（データ到着後、今回は未実施）

```
- Raw frame stats（frame別 starts/wins/winRate/top2Rate/top3Rate）
- Raw horseNumber stats（同上、horseNumber別）
- normalizedGatePosition分布（15節の計算式）
- Expected vs Actual（14節のAbility Control、raceScore−abilityBeforeRace残差）
- サンプルサイズ・confidence（既存resolveHorseEvidenceConfidence閾値の再利用）
- shrinkage適用後の最終値（既存shrinkTowardCenter、無変更）
```

**単純勝率だけでGate Scoreを作らない**（checkpoint本文の明示的な指示、
27節）。Ability-adjusted残差が主指標。

---

## 23. 判定

**A-CONTRACT-READY**

3〜20節でZIP名・内部構成・CSVヘッダー・必須/任意フィールド・horseId/raceId
契約・courseLayout/courseVariant判定・A/Bコース扱い・Selection Rule・
Sample数の参考値・Ability Control条件・Frame/HorseNumber/FinishPosition/
PassingPosition/Provenance/Dedupの各契約を、いずれも既存repository仕様の
実コード監査に基づき確定した。ChatGPT側は本報告のみで
`niigata_turf2000_gate_history_v1.zip`を作成できる状態にある。

---

## 24. 次にChatGPTが行う作業（優先順位順）

1. **最優先確認**: `niigata_turf2000_suitability_validation_v1.zip`
   （CHECKPOINT12.2、5レース・66行、courseVariant=left_outer）の元データが
   まだ手元に残っているか確認する。残っていれば、horseId列を埋めた上で
   （11節の通りraceIdは`JRA-YYYYMMDD-NIIGATA-RR`形式へ変換して）
   `niigata_turf2000_gate_history_v1.zip`へ含める。
2. 上記が無い、または不十分な場合、11節のSelection Ruleに従い新規に
   新潟芝2000m外回りの実レースを収集する（`raceDate < 2026-08-30`、
   最低10レース・目標30レース、レース格・going条件を問わず）。
3. 3節のCSVヘッダーをそのまま使い`race_gate_history.csv`を作成する。
   全出走馬に**canonical horseIdを必ず付与**する（6節）。
4. `PACKAGE_MANIFEST.json`・`SOURCE_MANIFEST.csv`・`README.md`を
   標準構成（2節）で添付する。
5. 新潟のコース改修履歴について分かる情報があれば`README.md`に明記する
   （未確認事項、14D.1Aから継続）。
6. ZIPを`niigata_turf2000_gate_history_v1.zip`として提出する。

---

## Regression（コード・データ変更なし）

```
Frozen Benchmark          → 70.3（変更なし、再確認済み）
Base Ability V1            → 不変
Suitability V1              → 不変
Provisional Stage A Board  → 不変（1位ダノンシーマ80〜11位ステレンボッシュ68）
Race Pace Prediction V1     → 不変
```

以上、CHECKPOINT14D.1Bの範囲でSTOPします。Gate実装・Formal Stage A Freeze・
Stage Bへは着手していません。

# CHECKPOINT 14D.1A — Niigata Turf 2000 Existing Data Discovery / Gate Data Package Contract Finalization

CHECKPOINT14D.1（B-DATA判定）を受け、新規ZIPを要求する前に**既存資産を完全監査**した
記録。**コード・production dataは無変更**（audit-onlyラウンド）。

---

## 1. Existing Data Packages（全探索結果）

repository内に`.zip`ファイルは1件も存在しない（ZIPはセッション毎の一時
scratchpadに展開されるだけで、gitにコミットされない運用のため）。ただし、
**過去のCHECKPOINTでZIPを監査した際の「監査記録（doc）」は残っている。** 特に
重要な発見:

| ドキュメント | CHECKPOINT | 内容 |
|---|---|---|
| `docs/niigata-turf-2000-zip-validation-v1.md` | 12.2 | **新潟芝2000mの実レース5件・66行を含むZIP
  （`niigata_turf2000_suitability_validation_v1.zip`）を監査済み** |
| `docs/niigata-gate-horseevidence-realized-v1.md` | 12.3 | 上記ZIP内部から、gate HorseEvidence実証に
  使える3頭（複数走馬）を発見 |
| `docs/niigata-turf-2000-pretest-5horses.md` | 12.4 | 上記で発見した馬を使った5頭限定の
  パイプライン動作確認（新データではない） |
| `docs/niigata-turf-2000-cross-course-reproducibility.md` | 12.1 | 新潟データが0件だった時点の
  監査（このZIP発見前） |
| `docs/gate-suitability-v1-decision.md` | 10.3 | 東京ダート1600m CoursePrior方針決定
  （新潟データとは無関係） |
| `src/ability/data/gateValidation/` | 8, 10.1-10.2 | 東京ダート1600m実データ30戦
  （`tokyoDirt1600RealRaces10.json`+`tokyoDirt1600Add20.json`）。新潟データは含まない |
| `src/ability/data/courseKarte/tokyoDirt1600.json` | 6, 8 | 東京ダート1600mのみ。他4コースの
  Course Karte（「5コースZIP」）は未取り込み |

**新潟専用データは`niigata_turf2000_suitability_validation_v1.zip`のみ。**

---

## 2. 5コースZIP監査

`docs/gate-suitability-v1-decision.md`の脚注が言及する
「`course_karte_v1_5courses.zip`（CHECKPOINT 6で監査済み）」について:

- repository内のどのdocs・commit履歴にも、この5コースのうち残り4コースが
  具体的にどのコースだったかという記録は**見つからなかった（unknown）**。
- `src/ability/data/courseKarte/`には`tokyoDirt1600.json`のみ存在——他4コース分は
  **一切取り込まれていない**（「CHECKPOINT8で東京ダート1600mのみrepoへ正式取り込み。
  他4コースは未取り込み（スコープ外）」と当該JSONの`_source`フィールドに明記あり）。
- **したがって、この5コースZIPに新潟が含まれていたかどうかは、repository内の
  情報だけでは判定不能。** 推測しない。ChatGPT側に確認が必要（16節）。

**このZIPと、1節で発見した`niigata_turf2000_suitability_validation_v1.zip`は
別物**（後者はCHECKPOINT12.2で新規に受領したZIPであり、CHECKPOINT6の
5コースZIPとは無関係）。

---

## 3. Existing Niigata Turf 2000 Races（発見内容の完全展開）

`niigata_turf2000_suitability_validation_v1.zip`（CHECKPOINT12.2で監査、
`docs/niigata-turf-2000-zip-validation-v1.md`に記録）:

| 項目 | 値 |
|---|---|
| レース件数 | 5件 |
| 総行数 | 66行 |
| courseVariant | 全66行が`left_outer`（左・外回り）で完全一致、不一致0件 |
| horseId | **全欄空**（README記載通り。horseNameのみでの照合が必要だった） |
| 構造品質 | fieldSize統一・horseNumber連番・finishPosition連番、いずれも整合
  （信濃川特別の1頭・タッチアンドムーブが競走中止で該当フィールド空欄という
  正当な例外のみ） |

**個別レースの詳細（raceId/raceDate/raceName）は、CHECKPOINT12.2のdoc自体には
一覧表として保存されておらず**、後続のCHECKPOINT12.3（`niigata-gate-horseevidence-
realized-v1.md`）が個別馬の実例を引用した際に、副次的に3レース分の断片情報が
記録に残っていた:

| raceId | raceDate | fieldSize（該当行から） | 備考 |
|---|---|---|---|
| 202604010607 | 2026-05-17 | 13 | トラストモアリズムが出走（9着） |
| 202604010710 | 2026-05-23 | 15 | ミッドセンチュリー(3着)・オプレントジュエル(7着)が出走 |
| 202604020610 | 2026-08-09 | 7 | トラストモアリズム(4着)・ミッドセンチュリー(5着)・
  オプレントジュエル(3着)が出走。**"3歳以上1勝クラス"というraceClass名がCHECKPOINT12.3の
  文脈で言及されている** |
| 不明（信濃川特別） | 不明 | 不明 | 競走中止馬タッチアンドムーブが出走。raceId・raceDateとも
  未記録 |
| 不明（5件目） | 不明 | 不明 | repository内のいかなるdocにも情報が残っていない |

**重要な結論**: **元のZIPファイル自体は現在のrepositoryには存在しない**
（ZIPはCHECKPOINT12.2実施時点のセッション一時領域にのみ存在し、恒久的に
保存されていない）。上記の5レースのうち3件は他CHECKPOINTでの引用により
raceId/raceDateの断片が復元できたが、**66行フルセットの再構築はできない**
（例えば信濃川特別の全出走馬・各馬のfinishPosition等はdoc化されていない）。
これは「データが既にrepositoryにあるので再利用できる」状態ではなく、
「過去に存在が確認されたデータの一部が、断片的な監査記録としてのみ残っている」
状態である。

---

## 4. Existing Runner Coverage

### 4-A. `niigata_turf2000_suitability_validation_v1.zip`（CHECKPOINT12.2、非production）

| 項目 | 値 |
|---|---|
| totalRaces | 5 |
| totalRunners | 66行（重複除去後horseName 63件） |
| frameCoverage | 全行1〜8の範囲内（100%、構造監査済み） |
| horseNumberCoverage | 100%（1〜fieldSizeの連番、歯抜け・重複無し） |
| finishPositionCoverage | ほぼ100%（65/66、競走中止1件のみ空欄） |
| fieldSizeCoverage | 100%（レース内で単一値に統一） |
| passingPositionCoverage | **repository内のdocに記載無し（unknown）**——ZIP監査doc
  （`niigata-turf-2000-zip-validation-v1.md`）にはpassingPosition列の記載自体が
  見当たらない |
| horseId解決率 | **2/63のみ**（グランディア・シュガークン、いずれも安全な
  完全一致のみ）。うちグランディアはV0プレースホルダー疑いのため接続を見送り。
  実際に接続できたのは**シュガークン1頭のみ**。 |

### 4-B. Production `data/horses/*.json`（CHECKPOINT14D.1と同じ監査を再実行、無変更を確認）

| 項目 | 値 |
|---|---|
| totalRaces（新潟×turf×2000） | 1（`JRA-20260516-NIIGATA-11`、新潟大賞典） |
| totalRunners | 13 |
| frameCoverage | 13/13 |
| horseNumberCoverage | 13/13 |
| finishPositionCoverage | 13/13 |
| fieldSizeCoverage | 1/13（レース側メタデータとして`raceLapData.json`に別途15と記録） |
| passingPositionCoverage | 1/13 |

CHECKPOINT14D.1時点から**変化なし**（本ラウンドはコード・データとも
無変更のため、当然の結果）。

---

## 5. Course Layout Coverage

| データソース | courseLayout表現 | 値 |
|---|---|---|
| `niigata_turf2000_suitability_validation_v1.zip`（3節） | `courseVariant` | `left_outer`（左・外回り、単一の複合文字列） |
| `raceLapData.json`のJRA-20260516-NIIGATA-11 | `courseLayout` | `outer`（外回り。ただし左右方向・A/B区分の情報は無い） |
| `data/horses/*.json`（Suitability V1の入力型） | — | **フィールド自体が存在しない**（`RacePerformance`/
  `RaceHistoryRawInput`型にcourseLayout/courseVariantは無い） |

**「Aコース」という区分自体は、上記いずれのデータソースにも存在しない。**
`left_outer`と`outer`は同じ実体（外回り）を指している可能性が高いが、
**A/B/Cコース区分までは一致するかどうか確認できない**（推測しない）。

CURRENT TARGET（2026新潟記念、左・外回り・Aコース）と、過去に発見した
5レース（`left_outer`）・現行1レース（`outer`）が本当に同一コース設定
（同じAコース使用期間）だったかどうかは、**repository内の情報だけでは
断定できない**。

---

## 6. Ability Control可否

**ABILITY_CONTROL_RECONSTRUCTABLE = 条件付きtrue**

- 対象馬が既に`data/horses/`へcanonical horseIdで実データとして存在する場合
  （＝新規ZIPの馬名がrepositoryの既存馬と安全に一致する場合）:
  **true**。`calculateAbilityBeforeRace`（既存・凍結、Ability Model V1）を使い、
  raceScore−abilityBeforeRaceのdeltaをrepository側で再計算できる
  （`collectGateHorseEvidenceDeltas`が既にこの方式を実装済み、CHECKPOINT12.3で
  実コードトレース済み）。**この場合ZIPへpreRaceBaseAbilityを含める必要は無い。**
- 対象馬がrepositoryに存在しない新規馬の場合: **false（追加fieldが必要）**。
  その馬自身の直近走データ（標準の`race_performances.csv`契約、horseId必須）が
  別途無いと、abilityBeforeRace自体が算出不能。

3節の教訓（horseId欄が全て空だったため63頭中61頭が未接続に終わった）を踏まえ、
**今回のZIPには必ずhorseIdを含めてもらう**——安全な既存canonical horseIdとの
接続（Priority 1、`runnerResolver.ts`の既存優先順位）が無いと、Ability Controlの
土台自体が成立しない。

---

## 7. DATA REQUEST MANIFEST全文（source of truth、完全展開）

以下は`docs/checkpoint14d1-niigata-turf2000-gate-data-request-manifest.json`/
`.md`（CHECKPOINT14D.1で作成、無変更）の内容をそのまま完全展開したものである。
ChatGPT側はこのセクションだけを読めば次のターンでZIPを作成できる。

### manifestId

`NIIGATA_TURF_2000_GATE_DATA_REQUEST`

### 現状のrepositoryカバレッジ（再掲）

```
matchingRaces: 1
raceIds: ["JRA-20260516-NIIGATA-11"]
uniqueRunners: 13
dateRange: 2026-05-16 〜 2026-05-16
goingObserved: ["良"]
gateAvailableRate: 13/13
horseNumberAvailableRate: 13/13
passingPositionAvailableRateForThisRaceItself: 1/13
```

### targetCondition

```
racecourse: 新潟
surface: turf
distance: 2000
courseLayout: outer（外回り、raceLapData.jsonでの唯一の裏付け）
courseVariant: A（checkpoint本文の指定。repository内で検証済みの情報ではない）
```

### 必須Race-Level列

```
raceId, raceDate, racecourse, raceNumber, raceName, surface, distance,
going, fieldSize, courseLayout, courseVariant
```

### 必須Runner-Level列

```
horseId, horseName, frame, horseNumber, finishPosition, carriedWeightKg,
actualRaceTimeSeconds, final3FSeconds, timeGapSeconds, passingPosition,
source, sourceRaceId, sourceHorseId
```

### 列に関する注記

- `courseLayout`・`courseVariant`: 既存の`race_performances.csv`正式契約
  （21列）には無い新規列。`raceLapData.json`（CHECKPOINT14C.1）で使われているのと
  同じ語彙（例: `"outer"`）を想定。
- `actualRaceTimeSeconds`/`final3FSeconds`/`timeGapSeconds`: raceScore/
  baseAbilityの再計算（Ability Control）に必須。finishPositionだけでは
  能力を統制した分析ができない。
- `preRaceBaseAbility`は**要求しない**（6節参照。対象馬が既にrepository内に
  実データとして存在する場合、再現可能なため）。ただし新規馬の場合は、
  当該馬自身の直近走データ（別途通常の`race_performances.csv`契約）が必要。

### 必要件数（決め打ちしない）

固定年数・固定レース数を決め打ちしない。実測可能な新潟芝2000m外回りAコースの
全レースをできる限り多く提供してほしい。参考情報として、既存プロジェクトの
近縁事例（`courseTimeBaselines.json`・`courseFinal3FBaselines.json`）は
「通常5年」分のデータを目安にしているが（`docs/data-input-guide.md`）、
これは「5年が正しい」という結論ではなく、近縁の既存事例の参考値に過ぎない。

### 未確認事項（open question）

新潟競馬場のコース改修履歴（もしあれば）。改修前後でコース構造が変わっている
場合、時代を分けて集計する必要がある。repository内にはこの情報が無いため、
分かれば教えてほしい（13節でも改めて確認）。

### 今回のリクエストに含まないもの

- オッズ・人気
- 天候・馬場含水率・クッション値
- 騎手ごとの補正係数
- レース結果に基づくmagic weightの提案

---

## 8. 必須Race Fields（再確認）

`raceId / raceDate / racecourse / raceNumber / raceName / surface / distance /
courseLayout / courseVariant / going / fieldSize` — 7節で確認済み、追加項目無し。

---

## 9. 必須Runner Fields（再確認）

`horseId / horseName / frame / horseNumber / finishPosition / fieldSize` に加え、
Manifestでは以下も必須として追加要求している（7節）:
`carriedWeightKg / actualRaceTimeSeconds / final3FSeconds / timeGapSeconds /
passingPosition / source / sourceRaceId / sourceHorseId`

（fieldSizeはrace-level列としても要求しているが、runnerごとの行にも
含めてよい——既存の`race_performances.csv`契約と同じ形式）。

---

## 10. CSV正式Header（1行で完全表示）

既存の21列契約（`race_performances.csv`公式契約）に、新規2列
（`courseLayout`, `courseVariant`）を追加した形を提案する:

```
raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId
```

（既存契約の列名・順序をそのまま維持し、`courseLayout`/`courseVariant`を
`going`の直後に挿入。既存importerとの親和性を優先し、列名は変更していない。
非推奨エイリアス`timeGap`/`raceTime`/`final3F`/`carriedWeight`は今回も
使用しない。）

---

## 11. 推奨ZIP Structure

推奨ZIP名: `niigata_turf2000_gate_history_v1.zip`

```
niigata_turf2000_gate_history_v1.zip
├── README.md                              … 収録内容の概要、既知の欠損（競走中止等）
├── PACKAGE_MANIFEST.json                  … レース件数・行数・courseVariant等の集計値
├── SOURCE_MANIFEST.csv                    … raceIdごとの出典（人手確認可能な形）
└── race_gate_history.csv                  … 10節のヘッダーに従う本体CSV
```

これは既存Importer（`buildImportResult` / `scripts/importRacePerformancesCsv.ts`）
が読める形式（CSVヘッダーの完全一致が必須）に最も適合する構造——過去の
バッチZIP（`batch3`〜`batch9`、`src/ability/data/import/samples/`配下）と
同じパターンを踏襲した。

---

## 12. Minimum / Recommended Data Requirement

- **minimum useful sample**: 既存repository内(1レース)に対して、統計的に
  「複数の異なるレース・複数の異なる枠パターン」が最低限必要——目安として
  **10レース以上**（東京ダート1600mのCoursePrior検証がSTEP1として10戦から
  始まった、`docs/gate-suitability-v1-decision.md`の前例に基づく参考値。
  これも「10が正解」という意味ではなく、過去の類似検証の出発点の目安）。
- **recommended sample**: confidence=medium/high水準（`resolveHorseEvidenceConfidence`
  の既存閾値、3〜4走でmedium・5走以上でhigh）に到達する馬を複数確保するには、
  同一馬の複数回出走データも有用（3節で発見したトラストモアリズム等のパターン）。
  提案は**新規thresholdの即時実装ではなく、既存確認済みの閾値の再利用のみ**。

---

## 13. 新潟コース改修監査

`src/ability/data/courseKarte/`・`docs/`配下のいずれにも、新潟競馬場の
コース改修・レイアウト変更・スタート地点変更・芝コース構造変更に関する記録は
**見つからなかった（unknown）**。5節で述べた通り、`left_outer`（過去ZIP）と
`outer`（`raceLapData.json`）という2つの異なる語彙が同一コース状態を
指しているかどうかも確認できていない。**推測での判断は行わない。**
14節のopen questionとして、ChatGPT側に確認を依頼する。

---

## 14. Future Leakage Rule

CURRENT TARGET: 2026-08-30 新潟記念。したがってHistorical Gate Datasetは
原則として`raceDate < 2026-08-30`のみを使用する。3節で確認した既存発見データ
（2026-05-17・2026-05-23・2026-08-09、いずれもこの条件を満たす）は問題ない。
新規ZIPについても同じ制約を要求する。Historical Method Validation目的の
別datasetを作る場合は、既存のHistorical Validationレイヤー
（`racePaceValidationExecution.ts`等、CHECKPOINT14C系列）と同様に完全分離する
方針を維持する。

---

## 15. Existing Data Sufficiency

**A-REUSEではない。** 3節・4節の通り、CHECKPOINT12.2で監査したZIPの存在は
確認できたが、**元ファイル自体はrepositoryに現存せず**、後続CHECKPOINTからの
引用により5レース中3レースの断片情報（raceId/raceDate、一部runnerの
frame/horseNumber/finishPosition）のみが復元できた。66行フルセットの
再構築は不可能であり、これを「既存資産の再利用」として扱うのは不正確——
実質的にはrepositoryの記録から発掘した「参考情報」であり、統計的検証に
使える完全なデータセットではない。

---

## 16. 判定

**B-NEW-DATA**

既存資産（`niigata_turf2000_suitability_validation_v1.zip`の監査記録）は、
「そのようなデータが過去に存在した」という事実と、5レース中3レースの
断片的な手がかり（raceId/raceDate）を提供したが、**統計的検証に使える
完全な形では再利用できない**。加えて、production data（1レース13頭）と
合わせても対象条件のレース数は依然として少数（既知だけで4〜5件相当）に
留まり、Gate Suitabilityの統計的検証には不十分。7〜12節のManifestに従い、
ChatGPT側で新規ZIP（`niigata_turf2000_gate_history_v1.zip`）を作成してほしい。

**ChatGPTへの重要な提案（優先確認事項）**: 3節で発見した
`niigata_turf2000_suitability_validation_v1.zip`の元データ（5レース・66行、
courseVariant=left_outer）に**horseIdを付与した形で再送**してもらえれば、
それだけでも既存repository（1レース）の5倍規模のデータが即座に得られる。
もしChatGPT側にこのZIPの元データがまだ残っていれば、新規収集より優先度が
高い可能性がある。

---

## 17. Provisional Stage A / Explainability結果の維持確認

本ラウンドはコード・データとも無変更のため、CHECKPOINT14Dの
Provisional Stage A Board（1位ダノンシーマ80〜11位ステレンボッシュ68）・
CHECKPOINT14D.1のExplainability結果（ダノンシーマ80・ステレンボッシュ68
いずれもdata missing/fallbackではなく実データに基づく算出であることの確認）は
**そのまま維持**されている。数値・判定内容の変更は一切無い。

---

## 18. Regression

```
Frozen Benchmark          → 70.3（abilityModelV1.frozenBenchmark.test.ts 3 passed）
npm run validate:data     → 検証成功（エラーなし、既存の警告のみ）
```

`git status --short`で確認: 本ラウンドで変更されたファイルは本報告書のみ
（新規docファイル1件の追加）。Base Ability V1・Suitability V1・
Provisional Stage A Snapshot・Pace Prediction V1はいずれも無変更。

---

## 19. 次にChatGPTと決める必要がある項目（優先順位順）

1. **`niigata_turf2000_suitability_validation_v1.zip`（CHECKPOINT12.2で監査済み、
   5レース・66行）の元データがChatGPT側にまだ残っているか**——残っていれば
   horseId付きで再送してもらうのが最優先（16節）。新規収集より効率的な
   可能性が高い。
2. **`niigata_turf2000_gate_history_v1.zip`（新規、11〜12節の仕様）の作成**——
   上記1が無い/不十分な場合の本命ルート。10節のCSVヘッダーをそのまま使用可能。
3. **新潟競馬場のコース改修履歴の有無**（13節のopen question）——時代を
   分けて集計する必要があるかどうかに影響する。
4. **CHECKPOINT6の5コースZIPに新潟が含まれていたか**（2節）——含まれていれば
   別ルートでCourse Karte級の構造情報が得られる可能性がある。
5. **`left_outer`（過去ZIP）と`outer`（raceLapData.json）が同一コース設定
   （同じAコース使用期間）を指すかどうかの確認**（5節）。

以上、CHECKPOINT14D.1Aの範囲でSTOPします。Gate実装・Formal Stage A Freeze・
Stage Bへは着手していません。

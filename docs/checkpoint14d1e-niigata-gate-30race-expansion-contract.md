# CHECKPOINT 14D.1E — Niigata Turf 2000 Gate 30-Race Expansion Data Contract / Ability Coverage Design

CHECKPOINT14D.1D（A-ISOLATED）を受け、30レースへのHistorical Gate Dataset
拡張に向けたDATA REQUEST CONTRACTを作成した。**今回はWeb取得・ZIP作成・
Import・Gate実装・Stage A変更のいずれも行っていない（設計・監査のみ）。**

---

## 1. Current Ability Coverage Failure Breakdown（現行10レース153行）

`niigataGateHistoryV1.ts`（既存・無変更）と production `data/horses/`の
実状態を突き合わせ、153行を機械的に分類した:

| 分類 | 行数 | 一意horseId数 | 内容 |
|---|---|---|---|
| **Controlled**（Ability Control可能） | 10 | 10 | production側にtarget raceより前の実データが1走以上ある |
| **A. horseId file自体が無い** | 93 | 78 | `data/horses/<horseId>.json`がrepositoryに存在しない |
| **B. fileはあるがtarget race以前の履歴が無い** | 50 | 41 | ファイルはあるが、全実データがtarget raceの日付**以降**（future data、prior未確定） |
| 合計 | 153 | 129 | |

**checkpoint本文が提示したA〜Fの6分類は、実コード（`calculateAbilityBeforeRace`、
`abilityBeforeRace.ts`）の実際の条件とは一致しなかったため、上記2分類（A/B）へ
整理し直した。** 理由: `calculateAbilityBeforeRace()`は「1走でも過去走があれば
算出可能・0走ならnull」という二値判定のみで実装されており、
「evidence不足（C）」「Short Career（D）」という中間状態は存在しない
（Short Careerは既存のFormal Snapshot側のconfidence表示にのみ影響し、
abilityBeforeRace自体の可否には無関係）。「identity mismatch（E）」も、
今回のCSVはhorseId列が全行production canonical horseIdそのものであり
（CHECKPOINT14D.1C確認済み）、horseName類似照合を経由しないため発生しない。
推測でカテゴリを埋めず、実コード動作に基づいて2分類とした。

**B分類41頭の内訳を個別確認したところ、その大半（サンプル確認した8頭全て）で
共通パターンが見られた: production側の実データは2025〜2026年（このプロジェクトの
実データ収集が集中している時期）のみで構成されており、2021〜2025年の
Historical Gate Race自体より古い実データが1件も無い。** つまり「レース数を
増やす」だけでは、これら41頭のAbility Control可否は改善しない——**その馬自身の
target race以前の実績データを別途収集する必要がある**（13〜14節で設計）。

---

## 2. Historical Runner Ability Control 正式条件

`abilityBeforeRace.ts`（Ability Model V1、凍結）を実コードのsource of truthとして:

```
Ability Controlled ⟺
  horseId が production data/horses/<horseId>.json として存在する
  AND
  その馬の実データ（RacePerformance）のうち、raceDate < 対象Historical Race raceDate
  を満たす走が1件以上ある
```

必要走数の閾値は無い（1走で可）。5走ある方がconfidence（既存の
`resolveHorseEvidenceConfidence`、0=unknown/1-2=low/3-4=medium/5+=high）は
上がるが、これは既存Evidence Contractであり新規thresholdは発明していない。

---

## 3. 30-Race Selection Rule（最終推奨）

### 必須条件（Gate outcome非依存、絶対固定）

```
1. racecourse = 新潟
2. surface = turf
3. distance = 2000
4. courseLayout = outer
5. raceDate < 2026-08-30
6. 既存10レース（raceId、4節）を除外（重複禁止）
7. race classを理由なく限定しない（G1/G2/G3/Listed/OP/条件戦いずれも対象）
```

### 推奨タイブレークルール（Ability Coverage改善目的、Gate outcome非依存）

単純な「raceDate新しい順」だけでなく、**候補レースの出走馬が既存production
horseIdとどれだけ重複するか（`known horse overlap`）を優先基準に加える**ことを
推奨する。理由と正当性は11節・10節で詳述するが、要点は:

- これは「枠順の結果（finishPosition）」や「外枠が勝ったかどうか」には
  一切依存しない、純粋に**識別子の重複度**という無関係な基準であるため、
  「Gate Effect結果が良くなるように選ぶ」ことには該当しない
  （checkpoint本文11節の禁止事項に抵触しない）。
- Ability Control coverageを直接改善する、最も効果の高いレバーである
  （1節の通り、現状のボトルネックは「horseIdが未知」であるため）。

**最終推奨ルール（決定的・再現可能）**:

```
1〜7（上記必須条件）を満たす候補レースを全て列挙
8. 各候補レースについて、10節のsourceHorseIdクロスリファレンスを使い、
   「production側に既知のsourceHorseIdを持つ出走馬の数」を機械的に数える
9. この既知馬数が多い順にソート
10. 同数の場合はraceDate新しい順でタイブレーク
11. 上位20レースを選択
```

結果を見てから選ぶことはしていない——8節の集計は候補レース内の出走馬
**identity**のみに基づき、finishPosition等のGate結果を一切参照しない
決定的な手順である。

---

## 4. Existing 10 Races（変更なし）

CHECKPOINT14D.1C/Dで監査済みのA級品質10レースをそのまま維持する。
再収集しない。既存raceId（重複除外用）:

```
JRA-20250517-NIIGATA-11, JRA-20250831-NIIGATA-11, JRA-20240505-NIIGATA-11,
JRA-20240901-NIIGATA-11, JRA-20230507-NIIGATA-11, JRA-20230903-NIIGATA-11,
JRA-20220508-NIIGATA-11, JRA-20220904-NIIGATA-11, JRA-20210509-NIIGATA-11,
JRA-20210905-NIIGATA-11
```

---

## 5. Additional 20-Race Selection Contract

3節の必須条件7項目＋推奨タイブレークルールをそのまま適用する。目標
raceCount=20（既存10と合わせて30）。**有効な同条件レースが20に満たない場合、
無理に30へ合わせず、実際に収集できた件数をそのまま報告すること**
（checkpoint本文4節の明示的な指示）。

---

## 6. Gate Race CSV Contract

**既存24列契約を変更なしで維持する**（CHECKPOINT14D.1Bで確定、CHECKPOINT14D.1Cで
実証済みの契約と完全同一）:

```
raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId
```

変更理由は無い——1〜5節の拡張はレース選定方針の変更であり、行データの
スキーマ自体には影響しない。

**取消・除外馬**: 本体CSVから除外（実際の出走馬のみ収録、既存方針）。
**中止・失格等、スタートしたがfinishPositionが通常でないケース**:
`finishPosition`列を空欄（null）にする——既存`normalize.ts`の仕様通り、
空欄はAbility計算対象から自動除外される（推測での順位補完は禁止）。

---

## 7. Historical Ability Support Dataが必要か

**YES。**

1節の通り、現行10レースの41頭（B分類）はレース数を増やすだけでは
Ability Control可能にならない——その馬自身の実績データがproduction側に
一切無い、または全て2025〜2026年（historical raceより後）に偏っているため。
30レースへ拡張しても同じ構造的制約が発生する可能性が高い（新規追加候補馬の
多くも、production未収録またはtarget raceより後のデータしか無いと予想される）。

したがって、Ability Coverageを実質的に改善するには、**Gate Race参加馬自身の
target race以前の実績データ**を別途収集する必要がある。

---

## 8. Prior History CSV 正式Header

**新規スキーマは作らず、既存の`race_performances.csv`公式契約（21列）を
そのまま使う**（`docs/data-input-guide.md`記載の既存契約と完全同一）:

```
raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId
```

（`courseLayout`/`courseVariant`は不要——このデータはGate Race自体の情報では
なく、対象馬の「別の過去のレース」の実績データであり、新潟以外・芝以外・
2000m以外のレースも正当に含まれうるため）。

### 必須フィールド

`raceId, horseId, horseName, raceDate, racecourse, raceName, surface, distance,
going`（既存`normalize.ts`の必須項目と同一）。

### 任意フィールド

`finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds,
timeGapSeconds`（ただしAbility Control用のraceScore算出にはこれら5項目が
揃っている必要がある——空欄の行はその走がAbility Control計算から
自動除外される、既存`toRaceHistoryRawInput()`の挙動）、`gate, horseNumber,
fieldSize, passingPosition, source, sourceRaceId, sourceHorseId`。

**推奨対象馬**: 1節のB分類41頭（および30レース拡張で新たに判明する同様の馬）を
優先。各馬、target raceより前の直近走を可能な範囲で（最大5走、Base Ability V1の
既存RECENT_RACE_COUNT仕様に合わせる。新規magic numberは発明しない）。

---

## 9. Prior Race Collection Rule

対象は「Gate Race参加馬**自身**の、target raceより前の実際のレース」であり、
新潟・芝・2000mに限定しない（対象馬がどこで走っていたかという事実をそのまま
収集する）。target raceが複数ある場合（同じ馬が複数のHistorical Gate行を
持つ場合）、**最も古いtarget raceを基準に**、それより前の走を収集すれば
（新しい方のtarget raceにも自動的に使える——ただしfuture leakageは
target raceごとに個別判定する、16節）。

---

## 10. Future Leakage Rule（二重チェック）

**2層で独立にチェックする**:

1. **Gate Race自体**: `raceDate < 2026-08-30`（CURRENT TARGET基準、既存契約通り）。
2. **Prior History行**: `priorRaceDate < 対象Gate Race raceDate`
   （**Gate Race個別の日付が基準——2026-08-30固定ではない**）。例:
   2023-05-07新潟大賞典の出走馬について集める場合、prior historyは
   2023-05-07より前のみ許可。2023-05-07以降・2026-08-30未満の走は、
   この馬**にとってはfuture leakage**（Gate Race自体としては許可される
   日付範囲でも、その馬のability-before-race計算には使えない）。

`niigataGateHistoryV1.ts`の`computeAbilityAdjustedResiduals()`は既にこの
ルールをコードレベルで実装済み（`cutoffMs = Date.parse(row.raceDate)`を
各行ごとに個別算出）——Prior History Datasetを追加する場合も、同じ
per-row cutoffロジックを流用する設計とする。

---

## 11. Expected Ability Coverage

**正確な数値は予測できない（unknown）。** 理由: 30レースの具体的な出走馬構成が
ChatGPT側の収集結果に依存するため、Claude側からは事前に確定できない。

**構造的な見立てのみ提示する**:
- 追加20レースの新規出走馬のうち、10節のsourceHorseIdクロスリファレンス
  （406件、`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`として
  本ラウンドで生成）と一致する馬は、既にproduction側に実データがある
  可能性が高い——ただし1節の教訓通り、production側の実データが
  「target raceより後」に偏っている場合はそれでもAbility Control不能
  のままである。
- Prior History Dataset（7〜9節）を実際にどれだけ収集するかによって、
  最終的なcoverageは大きく変動する——この設計だけでは数値予測できない。

**確定しているのはコード上の下限**: 既存10レースの10/153（6.5%）は
30レースへ拡張しても最低限維持される（既存データは変更しないため）。

---

## 12. Minimum Ability Coverage Rule

**既存threshold は無い（未確定）。** repository内を監査したが、「Gate Effectを
正式評価するために必要な最低coverage率」という数値基準はどこにも存在しない
（`resolveHorseEvidenceConfidence`は個々の馬のconfidence段階を扱うのみで、
データセット全体のcoverage率という概念自体を扱っていない）。

新規thresholdを発明する代わりに、CHECKPOINT14D.1C/Dで実際に使った
**Diagnostic的な扱い**（sample size・standard error・frame別/バケット別nを
明示した上で、平均値が標準誤差1個分以内に収まるかどうかで判断する）を
今後も踏襲することを推奨する。固定の「%以上ならOK」という基準は導入しない。

---

## 13. ZIP推奨名

**`niigata_turf2000_gate_history_v2_30r.zip`**

（既存`niigata_turf2000_gate_history_v1.zip`のv2、30レース版であることを
明示する命名。Prior History Datasetを同梱する場合も同じZIP内に含める、
14節参照）。

---

## 14. ZIP内部構成

| filename | purpose | required/optional |
|---|---|---|
| `race_gate_history.csv` | 30レース分のGate Race runner-levelデータ（既存10レース＋新規20レース、6節のスキーマ） | **required** |
| `runner_prior_history.csv` | Ability Control用の対象馬prior race data（8〜9節のスキーマ） | **optional（推奨）**——7節の通りYESと判断したため強く推奨するが、
  無くてもGate Race自体の収集・Raw Frame Statsは可能 |
| `PACKAGE_MANIFEST.json` | レース件数・行数・selection rule適用結果・sourceHorseId一致数等の集計値 | **required** |
| `SOURCE_MANIFEST.csv` | 30レース分の出典URL（既存10レース分も再掲） | **required** |
| `README.md` | 収録内容・既知の欠損・Selection Ruleの適用結果 | **required** |
| `CHECKSUMS.sha256` | 全ファイルのchecksum | **required** |

既存Importer/Contractとの親和性を最優先し、CHECKPOINT14D.1Bで確定した
5ファイル構成をそのまま踏襲、`runner_prior_history.csv`のみ新規追加とした。

---

## 15. DATA REQUEST MANIFEST全文

```json
{
  "manifestId": "NIIGATA_TURF_2000_GATE_30RACE_EXPANSION_REQUEST",
  "packageName": "niigata_turf2000_gate_history_v2_30r.zip",
  "baseline": {
    "existingRaces": 10,
    "existingRaceIds": [
      "JRA-20250517-NIIGATA-11", "JRA-20250831-NIIGATA-11",
      "JRA-20240505-NIIGATA-11", "JRA-20240901-NIIGATA-11",
      "JRA-20230507-NIIGATA-11", "JRA-20230903-NIIGATA-11",
      "JRA-20220508-NIIGATA-11", "JRA-20220904-NIIGATA-11",
      "JRA-20210509-NIIGATA-11", "JRA-20210905-NIIGATA-11"
    ],
    "note": "既存10レースは再収集しない。同一内容のまま新ZIPへ再掲するか、release note内で明示的に据え置きと記載する。"
  },
  "targetCondition": {
    "racecourse": "新潟", "surface": "turf", "distance": 2000,
    "courseLayout": "outer", "raceDateBefore": "2026-08-30",
    "raceClassScope": "限定しない（G1/G2/G3/Listed/OP/条件戦いずれも対象）"
  },
  "additionalRaceCountTarget": 20,
  "selectionRule": {
    "mandatory": [
      "racecourse=新潟", "surface=turf", "distance=2000", "courseLayout=outer",
      "raceDate<2026-08-30", "既存10レースと重複しない raceId"
    ],
    "tieBreak": [
      "候補レースの出走馬のうち、docs/checkpoint14d1e-known-sourcehorseid-crossref.json に含まれるsourceHorseIdと一致する頭数が多い順",
      "同数の場合はraceDate新しい順"
    ],
    "prohibition": "finishPosition/枠順結果に基づく選定は一切禁止。既知horse重複数のみをability coverage改善目的で使用する。"
  },
  "gateRaceCsvHeader": "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId",
  "priorHistoryCsvHeader": "raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId",
  "priorHistoryScope": "1節のB分類（41頭、production側にtarget race以前の実データが無い馬）を優先。各馬、対応するGate Raceのracedateより前の直近走を最大5走まで（新規thresholdなし）。新潟・芝・2000mに限定しない。",
  "futureLeakageRule": {
    "gateRace": "raceDate < 2026-08-30",
    "priorHistory": "raceDate < 該当Gate RaceのraceDate（個別基準、固定日付ではない）"
  },
  "excludeFromRequest": [
    "オッズ・人気", "天候・馬場含水率・クッション値", "騎手ごとの補正係数",
    "Gate結果に基づくレース選定"
  ],
  "isolationRequirement": "収集した全データはdata/gateValidation/配下のValidation専用領域からのみ読み込む。data/horses/へのproduction importは行わない（CHECKPOINT14D.1Dで確立したIsolation Architectureを継続使用）。"
}
```

**添付**: `docs/checkpoint14d1e-known-sourcehorseid-crossref.json`
（本ラウンドで生成、406件のcanonical horseId↔sourceHorseId対応表。
horseNameは含まない——production側にhorseNameを保持する仕組みが
無いため、identity照合はsourceHorseId経由のみ可能）。

---

## 16. Isolation Standardization

CHECKPOINT14D.1Dで確立したパターン（`data/<validationDomain>/`への
配置＋production globから構造的に隔離＋isolatedな`buildRaceHistory()`実行＋
production read-only参照＋Zero Drift Contract test）は、以下の将来的な
Historical Validationにもそのまま再利用可能と判断する（**今回は大規模
refactor・実装はしない、方針確認のみ**）:

- 他コースのGate Validation（東京ダート1600m版は既にこのパターンの原型）
- Course Validation（courseTimeBaselines/courseFinal3FBaselines拡張時の
  実データ検証）
- Pace Validation（`racePaceValidation.ts`系列、CHECKPOINT14C.1〜2Hも
  概ね同じ思想で`raceLapData.json`を分離済み）
- Track Bias研究（将来着手時）
- Race Review研究（将来着手時）

標準化の要点をdocsへ明文化することを次回以降の候補として提案する
（例: `docs/historical-validation-isolation-pattern.md`）——ただし今回は
提案のみで、新規ドキュメント作成・既存ファイルのrefactorは行っていない。

---

## 17. Regression

```
npx vitest run abilityModelV1.frozenBenchmark.test.ts niigataGateHistoryV1.test.ts
→ Test Files 2 passed / Tests 15 passed（Frozen Benchmark=70.3含む）
npm run validate:data → 検証成功（エラーなし）
```

`git status --short`で確認: 本ラウンドで追加されたのは以下のみ:

```
A  docs/checkpoint14d1e-niigata-gate-30race-expansion-contract.md
A  docs/checkpoint14d1e-known-sourcehorseid-crossref.json
```

`data/horses/`・`data/gateValidation/niigataTurf2000GateHistoryV1.json`・
Provisional Stage A・Base Ability V1・Suitability V1・MemberLevel・Race Pace
Prediction V1はすべて無変更。

---

## 18. 判定

**A-CONTRACT-READY**

3節（Selection Rule）・6節（Gate Race CSV）・8節（Prior History CSV）・
15節（Manifest全文）により、ChatGPT側は次のターンで
`niigata_turf2000_gate_history_v2_30r.zip`（および任意で
`runner_prior_history.csv`）を作成できる状態にある。

---

## 19. 次にChatGPTが行う作業（優先順位順）

1. **15節のMANIFESTに従い、`docs/checkpoint14d1e-known-sourcehorseid-
   crossref.json`（本ラウンドで添付済み）を使い、3節のSelection Rule
   （必須条件7項目＋known horse overlap優先のタイブレーク）で追加20レースを
   決定的に選定する。**
2. `race_gate_history.csv`（6節のスキーマ、既存10レース＋新規20レース）を
   作成する。既存10レースは内容を変更せず、そのまま再掲する。
3. **7節の判断（YES）に従い、`runner_prior_history.csv`（8節のスキーマ）を
   作成する。** 対象は1節のB分類41頭を優先し、各馬のtarget raceより前の
   直近走（最大5走）を収集する。
4. 2節の構成（5ファイル＋任意のprior history）でZIPを作成し、
   `niigata_turf2000_gate_history_v2_30r.zip`として提出する。
5. 新潟のコース改修履歴（CHECKPOINT14D.1で継続中のopen question）について
   分かる情報があれば`README.md`に記載する。

以上、CHECKPOINT14D.1Eの範囲でSTOPします。Gate実装・Stage A再計算・
Formal Stage A Freeze・Stage Bへは着手していません。

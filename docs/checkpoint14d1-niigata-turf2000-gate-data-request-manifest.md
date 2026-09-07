# NIIGATA_TURF_2000_GATE_DATA_REQUEST（CHECKPOINT14D.1）

## 目的

新潟芝2000m（外回り・Aコース）のGate Suitabilityを統計的に検証するための実データ要求。
現状repository内には対象条件のレースが**1件のみ**（`JRA-20260516-NIIGATA-11`、
2026新潟大賞典、13頭がgate/horseNumber判明、そのうち1頭のみpassingPosition判明）しか
存在せず、frame別の有利不利を馬の能力から分離して検証するには全く不十分。

## 対象条件

- racecourse: 新潟
- surface: turf
- distance: 2000
- courseLayout: 外回り（`raceLapData.json`の新潟大賞典エントリで唯一裏付けあり。
  `data/horses/`側にはcourseLayoutフィールド自体が存在しないため、他レースは未確認）
- courseVariant: A（checkpoint本文の指定。repository内で検証済みではない）

## 必要なレース単位の列

```
raceId, raceDate, racecourse, raceNumber, raceName, surface, distance,
going, fieldSize, courseLayout, courseVariant
```

`courseLayout`・`courseVariant`は既存の`race_performances.csv`契約（21列）に
含まれない新規列。

## 必要な出走馬単位の列

```
horseId, horseName, frame, horseNumber, finishPosition, carriedWeightKg,
actualRaceTimeSeconds, final3FSeconds, timeGapSeconds, passingPosition,
source, sourceRaceId, sourceHorseId
```

`actualRaceTimeSeconds`/`final3FSeconds`/`timeGapSeconds`は、finishPositionだけでは
できない「能力を統制した分析」（Ability Control、raceScore再計算）に必須。

## preRaceBaseAbilityについて

**ZIPに含める必要はない。** 対象馬が既に`data/horses/`に実データとして存在する場合、
baseAbilityはrepository側の既存パイプラインで再現可能。新規（未収録）馬の場合は、
別途通常の`race_performances.csv`契約でその馬自身の直近走データを提供してもらえれば
repository側で算出できる。

## 必要件数

**固定年数・固定レース数を決め打ちしない**（checkpoint本文の明示的な指示に従う）。

- 実測可能な新潟芝2000m外回りAコースの全レースを、できる限り多く提供してほしい。
- 参考情報として、既存プロジェクトの近縁事例（`courseTimeBaselines.json`・
  `courseFinal3FBaselines.json`）は「通常5年」分のデータを目安にしている
  （`docs/data-input-guide.md`）。これは「5年が正しい」という結論ではなく、
  近縁の既存事例の参考値に過ぎない。
- **未確認事項**: 新潟競馬場のコース改修履歴（もしあれば）。改修前後でコース構造が
  変わっている場合、時代を分けて集計する必要がある。repository内にはこの情報が
  無いため、分かれば教えてほしい（repository側で推測して判断することはしない）。

## 今回のリクエストに含まないもの

- オッズ・人気
- 天候・馬場含水率・クッション値
- 騎手ごとの補正係数
- レース結果に基づくmagic weightの提案

## 現状のrepository内カバレッジ（監査結果）

| 項目 | 値 |
|---|---|
| 該当raceId数 | 1（`JRA-20260516-NIIGATA-11`） |
| 出走馬数 | 13（うち2頭は旧式フォーマットでgate/horseNumber欠如） |
| 日付範囲 | 2026-05-16のみ |
| going分布 | 良のみ |
| gate判明率 | 13/13 |
| horseNumber判明率 | 13/13 |
| passingPosition判明率（この1レース自体について） | 1/13 |

この1レースは現在の2026新潟記念（2026-08-30予定）から見て過去のレースのため
`data/horses/`内に正当に存在する（future leakageではない）。ただし1レースのみでは
統計的検証は不可能。

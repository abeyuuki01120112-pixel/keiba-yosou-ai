# WEEKLY LIVE PREDICTION PREP V0 — セントウルS / 京成杯オータムハンデ

**作成日**: 2026-09-03

> **【正誤表・2026-09-03追記】** 本文STEP4は、セントウルSの開催条件を
> 「中京・芝1200m」という**一般知識に基づく未確認の前提**で監査した。
> ChatGPT側が2026年の正式開催条件を確認した結果、実際は
> **「阪神・芝1200m」**（2026-09-06、第40回産経賞セントウルステークス
> GII）であることが判明した。**中京芝1200mについて行った本文のbaseline
> 監査結果は、セントウルSには使用できない（無効）。** 正しい条件
> （阪神芝1200m・中山芝1600m外回り）での再監査は
> `docs/weekly-live-prediction-prep-v1-centaur-keisei-corrected.md`
> に記載した。本文（以下）は当時の記録としてそのまま残す。

**結論を先に明記する**: **両レースとも、正式Predictionを生成するための
最も基本的な前提——出走予定馬の一覧（entry list）——が現在のプロジェクト
データに一切存在しないことを確認した。** これが今回の監査で判明した
唯一かつ最大のブロッカーであり、これが無い限りSTEP2以降（Base Ability
Readiness・Suitability Readiness・正式Prediction生成・UI表示）は
実行できない。**推測でentry listを作成することはしていない**
（CLAUDE.md絶対原則5）。

一方、STEP4（courseTimeBaseline Coverage監査）はentry listが無くても
実行可能なため、実際に既存データを監査し、両レースの伝統的な開催条件
（後述の通り「一般知識」であり本プロジェクトの実データではない旨を
明記）について、courseTimeBaseline・courseFinal3FBaselineのいずれも
現状のプロジェクトデータには1件も存在しないことを確認した。

Base Ability V1・Suitability V1・memberLevel・final3F・finalRaceAbility・
Plackett-Luce・Temperature・raceScore weights・直近5走単純平均仕様は
一切変更していない。新潟記念の結果を見て予想ロジックを調整する行為も
行っていない。

---

## STEP1. Prediction Data Readiness監査

### 確認方法

`grep`でプロジェクト全体（`src/ability/data/`配下の`racecards/`・
`provisional/`・`predictionSnapshots/`）を検索し、「セントウル」
「京成杯」という文字列を含むファイルが存在するかを確認した。

### 結果

**該当ファイルは1件も存在しなかった。** 2026新潟記念で使われていた
`src/ability/data/racecards/niigata-kinen-2026-stage-a.template.json`・
`src/ability/data/provisional/niigata-kinen-2026-registered.json`に
相当するファイルが、セントウルS・京成杯AHのいずれについても
作成されていない。

### Coverage判定（ユーザー指定の9項目）

| 項目 | セントウルS | 京成杯AH |
|---|---|---|
| horse identity（出走予定馬一覧） | **missing** | **missing** |
| 過去走 | 判定不能（対象馬が不明のため） | 判定不能 |
| final3F | 判定不能 | 判定不能 |
| timeGap | 判定不能 | 判定不能 |
| actualRaceTime | 判定不能 | 判定不能 |
| racecourse | 未確定（後述、一般知識のみ） | 未確定（後述、一般知識のみ） |
| surface | 未確定（同上） | 未確定（同上） |
| distance | 未確定（同上） | 未確定（同上） |
| going | 未確定（発走前は常に構造上未確定、既存仕様通り） | 未確定（同上） |
| memberLevel計算に必要な相手情報 | 判定不能 | 判定不能 |

**horse identity（出走予定馬一覧）が無い時点で、以降のすべての項目が
「判定不能」に連鎖する。** これは推測で埋めるべきものではなく、
STEP1の結論としてそのまま報告する。

### racecourse/surface/distanceについての重要な注記

セントウルステークスは例年中京競馬場・芝1200m、京成杯オータム
ハンデキャップは例年中山競馬場・芝1600mで開催される**一般知識**を
Claude Codeは持っているが、**これは本プロジェクトの実データファイルに
基づく確認ではない**（今年（2026年）の正式開催要項・番組表を参照した
結果ではなく、過去の開催実績に基づく一般的な認識に過ぎない）。
今年のレースが同一条件で開催されるか、日程・開催場が変更されていないかは、
本ラウンドでは確認できていない。**STEP4のcourseTimeBaseline監査は、
この未確認の前提条件を明示した上での参考監査として実施する**（後述）。

---

## STEP2. Base Ability Readiness

**全馬 NOT READY。** 出走予定馬が1頭も判明していないため、個別の
READY/PARTIAL/NOT READY分類自体が実行できない。

**欠損項目**: 出走予定馬一覧そのもの。

---

## STEP3. Suitability Readiness

同様に**判定不能**。対象馬が不明なため、distance/course/going/gateの
いずれのcomponentについてもEvidence Coverageを確認できない。

---

## STEP4. courseTimeBaseline Coverage監査

### 対象条件（一般知識に基づく前提、STEP1の注記参照）

| レース | 競馬場 | 芝/ダート | 距離 |
|---|---|---|---|
| セントウルS | 中京 | turf | 1200m |
| 京成杯AH | 中山 | turf | 1600m |

### 監査結果

`src/ability/data/courseTimeBaselines.json`（33行）・
`src/ability/data/courseFinal3FBaselines.json`（22行）の全行を実際に
確認した。

| 条件 | courseTimeBaseline | courseFinal3FBaseline |
|---|---|---|
| 中京 turf 1200m（全going） | **MISSING**（該当0件） | **MISSING**（該当0件） |
| 中山 turf 1600m（全going） | **MISSING**（該当0件） | **MISSING**（該当0件） |

**両レースとも、レース自身の条件に対するcourseTimeBaseline・
courseFinal3FBaselineのいずれも現在のプロジェクトデータに1件も
存在しない。** これはentry list（出走馬一覧）の有無とは独立に確認できる
事実であり、たとえentry listが揃ったとしても、raceTimeScore（25%
ウェイト）・final3FScore（一部）は中立フォールバックになることが
ほぼ確実である。

### 既存courseTimeBaselines.json全33行の条件一覧（実データ）

| 競馬場 | 距離 | going |
|---|---|---|
| 阪神 | 1200 | 良／稍重 |
| 阪神 | 1600 | 良／稍重 |
| 阪神 | 1800 | 良／稍重／重 |
| 阪神 | 2000 | 良／稍重／重 |
| 阪神 | 2200 | 良／稍重／重 |
| 東京 | 1900 | 良 |
| 東京 | 2000 | 良 |
| 中山 | 1900 | 良 |
| 中山 | 2100 | 良／稍重 |
| 中京 | 2000 | 良／重 |
| 京都 | 2000 | 良／稍重 |
| 京都 | 2200 | 良／稍重／重 |
| 札幌 | 1900 | 良 |
| 札幌 | 2100 | 重 |
| 函館 | 1900 | 良 |
| 函館 | 2200 | 良 |
| 小倉 | 1800 | 良 |
| 小倉 | 1900 | 良／稍重 |
| 小倉 | 2100 | 良 |

**中京1200m・中山1600mはいずれも表に一切含まれていない。**

### 「67条件中43条件がmissing」という既存情報の性質について

`npm run validate:data`が報告する「67条件」は、**固定の全国マスターリスト
ではなく、現在`data/horses/*.json`に実在する各馬の過去走から動的に
抽出された条件の集合**である（`scripts/validateAbilityData.mjs`の
`raceFieldConditions`、実コードで確認済み）。したがって、この67条件
リストには、まだ一度も取り込まれていない中京1200m・中山1600mの
過去走は最初から含まれておらず、43件のmissingとは別に、
「そもそもカウント対象にすら入っていない未知の条件」が存在しうる
——今回の2条件はまさにその一例である。今回のバッチで完全な67条件の
実際のリストを列挙することは、対象馬（各馬の過去走）が判明していない
現状ではできない（動的な集合のため）。

**新規baseline生成・weight変更・fallback値変更は一切行っていない
（監査のみ）。**

---

## STEP5. Prediction Confidenceへの影響整理

正式なConfidenceロジックの実装はまだ行わないが、将来UIで
「Data Coverage」「Prediction Confidence」として表示する際に必要になる
情報を、今回判明した事実ベースで整理する。

| 影響要因 | セントウルS | 京成杯AH |
|---|---|---|
| 出走馬identity | 未確定 → Base Ability自体が算出不能 | 同左 |
| raceTimeScore | courseTimeBaseline無し → 中立70点フォールバックが濃厚 | 同左 |
| final3FScore | courseFinal3FBaseline無し → 各馬の過去走final3Fに対する
  絶対評価が使えず、レース内相対評価100%へフォールバックする可能性が高い（既存仕様通り） | 同左 |
| going | 発走前は構造上未確定（`GOING_UNKNOWN_SENTINEL`使用、既存仕様） | 同左 |
| memberLevel | 出走馬identity未確定のため算出不能 | 同左 |

**このレポート単独では、実際にPredictionを生成した際の
`evaluationConfidence`（STEP6、`raceOutcomeEvaluation.ts`の
weakest-link方式）がどの値になるかまでは計算していない**
（Predictionを実行していないため）。ただしgoing.confidenceが
常に"unknown"になる既存の構造（2026新潟記念でも同じ理由で
`evaluationConfidence="unknown"`だった、
`docs/2026-niigata-kinen-preliminary-final-prediction-20260829.md`
参照）は、この2レースでも同様に発生すると予想される。

---

## STEP6. 正式Prediction実行可否

**実行できない。** 出走予定馬一覧が無いため、
`buildGateConfirmedSnapshot()`（既存Stage A関数）に渡す
`RaceEntryInput[]`を構築すること自体が不可能——推測で仮の出走馬を
作ることは絶対原則5に反するため行っていない。**無理に正式Prediction
扱いにしていない**（ユーザー指示通り）。

---

## STEP7. UI表示

**現時点では表示するデータが無い。** ただし、既存UI（PRE-WINDOWS
INTEGRATION + UI V0）のアーキテクチャを確認した結果、**コード変更は
一切不要で、entry listが揃い次第すぐに表示できる状態にある**ことを
確認した:

- `DerivedRacePrediction`型（`src/integration/uiTypes.ts`）は、
  `race`（レース識別情報）・`horses`（0件でも可）・`predicted`
  （bool）・`hasResult`（bool）を持つ汎用構造であり、新規レース追加時に
  型の変更は不要。
- `RaceListView.tsx`・`RaceDetailView.tsx`・`HorseDetailDrawer.tsx`は
  いずれも既存の6レースと同じ形式のderived JSONを
  `src/integration/data/derived/`へ追加するだけで新しいレースを表示できる
  （`import.meta.glob`で自動検出、`predictionDashboardData.ts`側の変更も不要）。
- Collector経由（`buildDerivedFromCollector()`）・Formal Snapshot経由
  （`runPredictionPipelineFromFormalSnapshot()`）のいずれの生成経路も、
  既存のまま使い回せる。

**したがって、今回は「UIへ空のプレースホルダーレースを追加する」ことは
行わなかった**（実在しない出走馬データを含む可能性のあるダミーレコードを
UIへ表示することは、実データ以外を使わないという原則に照らして不適切と
判断したため）。entry listが判明次第、最短でその日のうちに表示可能な
状態を維持している。

---

## 最終報告（12項目）

1. **セントウルS Data Readiness**: entry list無し。horse identity以下
   すべての項目が判定不能。
2. **京成杯AH Data Readiness**: 同上。
3. **各馬Base Ability計算可否**: 対象馬が不明のため、全馬
   **NOT READY**（分類不能ではなく、「分類対象が存在しない」状態）。
4. **欠損項目**: 最優先は出走予定馬一覧（horse identity）。次点で
   courseTimeBaseline・courseFinal3FBaseline（中京1200m・中山1600m、
   両方とも0件）。
5. **courseTimeBaseline Coverage**: 中京1200m・中山1600mともに
   MISSING（courseTimeBaseline・courseFinal3FBaselineいずれも）。
   既存33行の条件一覧はSTEP4に記載の通り。
6. **raceTimeScore fallback発生見込み**: **高い（ほぼ確実）。**
   baseline自体が存在しないため、出走馬が判明してPredictionを実行
   しても、raceTimeScore（25%ウェイト）は中立70点フォールバックに
   なる可能性が非常に高い。
7. **正式Prediction可能か**: **不可能。** entry listが無い。
8. **Predictionを生成した場合の順位・点数**: 該当なし（生成していない）。
9. **UI表示結果**: 該当レースの表示データなし（STEP7参照、コード側は
   準備完了）。
10. **Windows/JRA-VANが来れば解決する不足**: 出走予定馬一覧の自動取得
    （最優先）。ただしcourseTimeBaseline・courseFinal3FBaselineの
    未整備は、JV-Link導入だけでは自動解決しない——過去5年分の基準タイム
    データを別途収集・整備する必要がある（既存の43/67条件missingと
    同種の課題）。
11. **今週追加でChatGPT側からデータ提供が必要か**: **必要。** 最優先は
    セントウルS・京成杯AH双方の正式出走予定馬一覧（馬名、可能であれば
    horseId／sourceHorseId）。次点で、両レース自身および対象馬の
    過去走に関する中京1200m・中山1600mのcourseTimeBaseline候補データ
    （もし別途収集できれば）。
12. **Stage A予想へ正式に進んでよいか**: **まだ進めない。** entry list
    がChatGPT側から提供され次第、STEP2以降を再実行する。

---

## Regression

読み取り専用の監査（既存JSONファイルの内容確認、`grep`のみ）による
研究。新規production code・production dataの追加・変更は無い。

```
git status --short → docs/weekly-live-prediction-prep-v0-centaur-keisei.md のみ
npm test            → 既存822件、回帰なし
npm run lint         → PASS
npm run build         → PASS
npm run validate:data → 検証成功（既存warningのみ）
```

---

以上、Data Readiness監査の範囲でSTOPします。当日オッズを使った最終予想・
正式Prediction生成・UIへのレース追加は、entry listが揃うまで行いません。

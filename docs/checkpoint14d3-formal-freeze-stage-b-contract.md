# CHECKPOINT 14D.3 — Formal Stage A Freeze / Stage B Input Contract

CHECKPOINT14D.2の判定（A-FREEZE-READY）を受け、(1) 現在のStage AをFormalに
FREEZEし、(2) Stage Bで追加する「当日可変情報」の正式Input Contractを設計
した。**Stage A Score自体・Stage B Score自体は本ラウンドで一切計算・変更
していない。** Gate研究再開・Probability/Monte Carlo・Odds/EV/BET-PASSの
いずれも今回は着手していない。

---

## 1. Formal Stage A Snapshot

**既に永続化済みのFormal Prediction Snapshot
（`src/ability/data/predictionSnapshots/JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z.json`、
CHECKPOINT13.5B確立の`formalPredictionSnapshot.ts`/`predictionSnapshotStore.ts`
経由でCHECKPOINT14Dで作成済み）が、そのままFormal Stage Aとして正式に成立
している。** 新しいsnapshotストアは作成していない。既存の凍結インフラを
そのまま「Formal Stage A Freeze」として認定した。

4節で、このsnapshotのimmutability契約が実際のコード実行で成立している
ことを実証した。

---

## 2. Snapshot ID / Cutoff

```
snapshotId       : JRA-20260830-NIIGATA-08__gateConfirmed__2026-08-28T03-03-03.357Z
raceId           : JRA-20260830-NIIGATA-08
raceDate         : 2026-08-30
predictionCutoffAt: 2026-08-28T03:03:03.357Z
stage(internal)  : gateConfirmed（＝checkpoint本文でいう"Stage A"のトリガー、
                    predictionSnapshot.tsの既存docstring「Stage A — Gate
                    Confirmed Snapshot。トリガー：正式な枠順確定後」と対応）
schemaVersion    : formal-prediction-snapshot-v1
formal           : true
```

**checkpoint本文の`stage="A"`という表記は、既存の`PredictionStage`型
（`"gateConfirmed" | "t2h"`）に新しい値を追加するものではない。** 新規
snapshotIdのstage="A"というリテラルは実コードに存在せず、混乱を避けるため
今回は既存の`"gateConfirmed"`をそのまま使用し、`docs/checkpoint14d3-stage-a-formal-freeze.json`
の中で人間向けラベルとして`stage: "A"`（`stageInternalEquivalent:
"gateConfirmed"`と併記）を表示するに留めた。既存型定義は変更していない。

---

## 3. Stage A Board（整数表示、確定・保存済み）

| Rank | Horse | Stage A (display) | 内部値 (internalEffectiveAbility) |
|---|---|---|---|
| 1 | ダノンシーマ | 80 | 79.8 |
| 2 | ロデオドライブ | 77 | 76.7 |
| 3 | ゾロアストロ | 74 | 74.4 |
| 4 | バレエマスター | 74 | 73.6 |
| 5 | ジュンブロッサム | 73 | 73.1 |
| 6 | ボーンディスウェイ | 73 | 73.0 |
| 7 | アーバンシック | 72 | 72.2 |
| 8 | サヴォーナ | 70 | 69.9 |
| 9 | ドゥレッツァ | 70 | 69.9 |
| 10 | チェルヴィニア | 70 | 69.7 |
| 11 | ステレンボッシュ | 68 | 68.2 |

**内部値（internalEffectiveAbility）はCHECKPOINT14D.2で確認済みの
authoritative値をそのまま保持する。新しい小数点スコア制度は作っていない
——既存Formal Snapshotの`effectiveAbility`フィールドがそのままこの内部値
である。** サヴォーナ・ドゥレッツァ（69.9/69.9）はfull precisionで真の
TIED（CHECKPOINT14D.2 11節、正式tie-break無し）。

**本Stage Aは今後、天候・雨・風・馬場・Track Bias・オッズ・人気・馬体重・
Umapro等によって絶対に変更しない。** Stage B以降はこのStage Aを不変の
inputとして扱う（6・12節）。

---

## 4. Immutability Verification（実コード実行による実証）

CHECKPOINT13.5Bの凍結インフラ（`buildFormalPredictionSnapshotRecord()`＋
`persistPredictionSnapshot()`）を実際に再実行し、以下を実証した
（レビュー・推測ではなく実行結果）:

```
1. 既存snapshotと同一内容のrecordを再構築 → persistPredictionSnapshot()
   実行結果: status="duplicate"（no-op、既存ファイルは書き換わらない）

2. 同一snapshotIdのまま、内容を意図的に改変（warningsへダミー追加）
   → persistPredictionSnapshot()実行結果: status="rejected"
   reason: "同一snapshotIdに異なる内容のSnapshotを保存しようとしました。
   正式recordのoverwriteは禁止です（CHECKPOINT13.5B 5節）。"

3. 改変試行後もファイル内容に変化が無いことを確認: true

4. predictionSnapshotStore.tsのexportを列挙:
   ["DEFAULT_SNAPSHOT_STORE_DIR", "persistPredictionSnapshot",
    "loadPredictionSnapshot", "listPredictionSnapshots"]
   → update系API: 無し／delete系API: 無し
```

**「同一snapshotId + 内容一致はno-op」「内容不一致の再保存はreject」
「update/delete APIは存在しない」という3つの契約すべてを、実際にコードを
実行して確認した。** 新しいstore実装は作成していない。検証に使った一時
スクリプトは削除済み。

---

## 5. Explainability Preservation

CHECKPOINT14D.2で作成した`docs/checkpoint14d2-stage-a-explainability-contract.json`
（positiveFactors/negativeFactors/notEvaluatedFactors/evidenceSummary/
confidence/explanation）を、既存Formal Snapshotの各runnerとhorseIdで
突合し、`docs/checkpoint14d3-stage-a-formal-freeze.json`として1つの
参照用インデックスに結合した。**既存の`FormalPredictionSnapshotRecord`
型・`formalPredictionSnapshot.ts`・`predictionSnapshotStore.ts`は一切
変更していない。** この新規JSONは読み取り専用の結合層であり、
`sourceSnapshotId`/`sourceSnapshotPath`で元のimmutable snapshotを参照する
だけで、値を再計算・複製元と乖離させる余地を持たない。

---

## 6. Stage B Definition

**Stage B = 「Stage Aで固定した馬の静的能力評価に、実際のレース当日の
可変条件を加えて、その日のRace Performanceを予測する段階」。** Stage Aを
書き換えるのではなく、Stage AはStage Bへのinputである。

---

## 7. Stage B Input Contract

完全な内容は`docs/checkpoint14d3-stage-b-input-contract.json`に格納した。
8カテゴリ（A〜H）それぞれについて、fields／level（race/per-horse）／
availability／asOfRule／notesを定義した。全カテゴリに共通するAs-Of
Contractの形:

```json
{ "observedAt": "ISO8601", "source": "string", "asOf": "ISO8601（predictionCutoffAt相当）", "confidence": "low|medium|high|unknown" }
```

未来情報混入禁止・レース後データ使用禁止は全カテゴリ共通のルールとした。

---

## 8. AVAILABLE_NOW Inputs

| カテゴリ | 内容 | 根拠 |
|---|---|---|
| F. Frame / Horse Number | 枠・馬番 | 既にFormal Stage A Snapshotへ保存済み（predictionCutoffAt=2026-08-28T03:03:03.357Z時点で確定） |
| G. Assigned Weight | 斤量 | 同上 |
| E. Pace / Position | Race Pace Prediction V1（Pre-Frame）・Historical Position Profile V1 | 対象レースより前の実データ（passingPosition）のみから計算可能、枠順不要。ただし本ラウンドでは実行していない |

天気予報・風予報も「予報という概念自体は今取得できるカテゴリ」として
AVAILABLE_NOWに区分できるが、**本ラウンドでは外部データを一切取得して
いない**ため、実際のvalueはnull（`fetchedThisRound=false`、16節）。

---

## 9. AVAILABLE_RACE_DAY Inputs

| カテゴリ | 内容 | 根拠 |
|---|---|---|
| A. Weather（実況） | 実際の天候・降水量 | レース当日にしか確定しない |
| B. Wind（実況） | 実際の風速・風向 | 同上 |
| C. Going / Track Condition | 公式馬場発表 | JRA公式発表は発走当日（既存Stage A Snapshotの`going.evaluated=false`と整合） |
| D. Track Bias（当日先行レース結果由来） | 前有利/差し有利等 | 対象レースより前に走った当日の他レース結果が必要 |
| H. Horse Weight | 馬体重・増減 | JRA公式発表は発走約1時間前 |

---

## 10. NOT_AVAILABLE / NOT_RECOMMENDED Inputs

| カテゴリ | 分類 | 理由 |
|---|---|---|
| C. 含水率等 | NOT_AVAILABLE | repository内に正式な含水率データソース・パイプラインが現状存在しない（V1では未実装） |
| D. Track Bias（auto観測） | NOT_AVAILABLE | `trackBias.ts`の`resolveTrackBias()`のauto側は`finalRaceAbility.ts`から常にnullで渡される想定（V1未実装） |
| D. Track Bias（manual観測） | AVAILABLE_RACE_DAY（ただし人間入力必須） | Claude単独では生成できない（推測禁止） |
| H. Horse Weightの新規調整式 | NOT_RECOMMENDED_V1 | 既存の検証済み変換式が無いため、新規計算式をこの場で発明しない |
| Gate（枠そのものの新規補正） | NOT_RECOMMENDED_V1 | 新潟芝2000mGate EffectはINSUFFICIENT（CHECKPOINT14D.1C）。新規magic gate weight禁止。既存HorseEvidence（本人の新潟実績）としてのみ使用可 |

---

## 11. Stage B Minimum Viable Input

```
必須（required）:
  - Stage A Score（baseAbility × suitability、immutable input）
  - frame / assignedWeight（既にAVAILABLE_NOW）

任意だが価値が高い（optional_but_high_value）:
  - Pace / Position（Race Pace Prediction V1、実データのみでAVAILABLE_NOW、
    本ラウンドでは未実行）

後日input（deferred_to_race_day）:
  - 公式馬場 / 含水率 / 当日Track Bias / 馬体重
```

**「全部揃うまで何もできない」設計にはしない。** 天気予報・風予報を
実際に取得すればPRELIMINARY_STAGE_Bとして即座に機能する構成だが、本
ラウンドでは外部データ取得を行っていないため、**現時点で即実行可能な
Preliminary Stage Bの実質的な追加inputはPace/Positionのみ**である
（これも本ラウンドでは未実行、Stage B Score自体は今回確定しない）。

---

## 12. Existing STEP5〜 Assets Reuse Audit

repository内の既存資産を監査し、「能力を主・適性/当日条件を従」という
思想に適合するものだけを再利用候補にした。過去の±5% magic adjustmentを
そのまま無条件復活させるのではなく、各ファイルの実装内容を確認した:

| ファイル | 役割 | 判定 |
|---|---|---|
| `finalRaceAbility.ts` | effectiveAbility × raceContextFactor = finalRaceAbility を統合するSTEP5オーケストレーター | **REUSE_CANDIDATE** — effectiveAbility（Stage A）をimmutable inputとして受け取り、そこに乗算でraceContextFactorを適用する構造自体が、今回のStage A/B分離思想と一致 |
| `paceScenarioFactor.ts` | 脚質×想定ペースの相性を100±5%で数値化 | **REUSE_CANDIDATE（要留意）** — 振幅5はコード自身のTODOで「統計的近似であり具体的展開を直接評価しない」と明記済み。confidence縮小・clamp・neutral fallback完備で「その場で発明した固定点」ではないため候補にするが、振幅自体は今回変更・再校正しない |
| `trackBiasFactor.ts` | 脚質×前後バイアス観測の相性を100±5%で数値化 | **REUSE_CANDIDATE** — 観測が無ければ無条件でneutral(100%)固定（推測しない）。ただしauto観測が未実装のため実質的に常に中立になりうる |
| `stabilityFactor.ts` | 直近成績の下方半偏差に基づく安定性指標（STEP6） | **NOT_WIRED_TO_FINAL_RACE_ABILITY** — `finalRaceAbility.ts`のraceContextFactor計算には現在組み込まれていない独立指標。docs/step6-decisions.mdで係数調整禁止と明記済み |
| `racePacePrediction.ts` | Race Pace Prediction V1（Pre-Frame） | **REUSE_CANDIDATE** — 枠順不要、実データのみ。コード自身が「Final Race Abilityへ一切接続しない、Pace Scenario Factorは別レイヤー」と明記——Stage Bで初めて接続する設計 |
| `positionProfile.ts` | Historical Position Profile V1 | **REUSE_CANDIDATE** — passingPosition実データのみ |
| `trackBias.ts` | manual/auto trackBias観測のresolve | **REUSE_CANDIDATE（auto側は現状常にneutral相当）** |

**今回、これらを実際にStage Bへ接続・実行してはいない**（監査・分類のみ）。

---

## 13. Missing Input Behavior

情報が無い場合は推測で補完しない。`null` / `NOT_EVALUATED` /
`low confidence`のいずれかで扱う。Stage Bを成立させるための架空値投入は
一切行っていない（本ラウンドで天気・馬体重等を一切取得していないことが
その具体例）。

---

## 14. Stage B → Probability Output Contract

完全な内容は`docs/checkpoint14d3-stage-b-input-contract.json`の
`stageBToProbabilityOutputContract`に格納した:

```json
{
  "horseId": "string", "horseName": "string",
  "stageAScore": "number（整数表示）", "stageAScoreInternal": "number",
  "stageBScore": "number | null（racePerformanceScore）",
  "stageBRank": "number | null",
  "confidence": "low|medium|high|unknown",
  "adjustmentFactors": { "paceScenario": "object | null", "trackBias": "object | null", "positionProjection": "object | null" }
}
```

Stage A / Stage Bの両方を最終Prediction Recordに残す設計とし、「なぜ
Stage A 5位からStage B 2位へ上がったのか」を後から説明可能にする
（Stage Aを上書きしない、5節のExplainability Preservationと同じ思想）。

---

## 15. Regression

本ラウンドはコード側1ファイル（`suitabilityV1Types.ts`のJSDocコメント
追加のみ、数値ロジック変更なし）と`docs/`配下3ファイルの新規追加のみ。
検証用の一時スクリプトは削除済み。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Formal Stage A Score drift → 0
Stage A Rank drift          → 0
Base Ability drift          → 0
Suitability drift           → 0
Frozen Benchmark            → 70.3（変更なし）
永続化済みSnapshotファイル    → git diff無し（4節で実行した検証は
                                すべてno-op/rejectで完結し、ファイルへの
                                書き込みは一切発生していない）
```

---

## 16. 判定

**A-STAGE-A-FROZEN-STAGE-B-READY**

- Formal Stage A Snapshotは既存の凍結インフラ（CHECKPOINT13.5B）を通じて
  正式に成立しており、immutability契約（no-op/reject/update・delete API
  無し）を実コード実行で実証した。
- Stage A Score・順位・内部精度値は一切変更していない。
- Stage B Input Contract（8カテゴリ、As-Of契約、Availability Board、
  既存STEP5〜資産の再利用監査、Minimum Viable Input、Output Contract）を
  確定した。
- 新規magic weightは一切発明していない。天気・馬体重等の外部データは
  一切取得していない（架空値なし）。

---

## 17. 次にChatGPTと決める必要がある項目（優先順位）

1. 現在取得可能な実データでPRELIMINARY_STAGE_B実行（Pace/Positionのみ、
   天気予報等を別途取得すれば追加可能）
2. 新潟記念Stage B Board生成
3. 発走2時間前Final Stage B更新手順
4. Probability Engine
5. Odds / EV / BET-PASS
6. Minimal Prediction UI

STOP。Stage B Score算出・Weather/Wind実データ取得・Probability/Monte
Carlo・Odds/EV/BET-PASS・Gate 30-race拡張研究再開のいずれも、次の
CHECKPOINTでの明示的な指示を待つ。

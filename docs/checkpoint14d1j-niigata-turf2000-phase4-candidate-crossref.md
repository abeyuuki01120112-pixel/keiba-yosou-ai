# CHECKPOINT 14D.1J — External Candidate Roster Phase 4 / 2022 Cross-Reference

ChatGPTが外部Race DB（netkeiba）から収集した2022年の新潟芝2000m外・既終了
8レース・96 runner（actual starters）の候補Rosterを、repository内部の
production known-sourceHorseId cross-reference（405件）と照合した。
CHECKPOINT14D.1G〜1I（Phase1〜3、計16レース）と統合し、Phase1+2+3+4
Combined Candidate Board（計24レース）を作成した。**今回もGate Dataset
へのImport・additional 20の正式Freezeは行わない。** Production data・
Gate Effect・Stage A再計算・Formal Freeze・Stage B・Weather・Odds・EV・
BET・Probability・Umapro・UIのいずれも今回は着手していない。

---

## 1. Attachment Integrity

| 項目 | 期待値 | 実測値 | 結果 |
|---|---|---|---|
| candidateRaceCount | 8 | 8 | OK |
| runnerRowCount | 96 | 96 | OK |
| combinedCandidateCountAfterThisPhase | 24 | 24 | OK |
| JSON/CSV差異 | なし | なし（96行、`sourceRaceId/raceId/raceDate/raceName/horseName/sourceHorseId`の6フィールド完全一致） | OK |

各raceのactual runner row count == fieldSizeも全件一致（8/8）:

| raceId | raceDate | raceName | fieldSize | runner数 | declaredFieldSize | excluded | 一致 |
|---|---|---|---|---|---|---|---|
| JRA-20220514-NIIGATA-09 | 2022-05-14 | 尖閣湾特別 | 8 | 8 | — | 0 | OK |
| JRA-20220529-NIIGATA-09 | 2022-05-29 | 石打特別 | 13 | 13 | — | 0 | OK |
| JRA-20220807-NIIGATA-10 | 2022-08-07 | 月岡温泉特別 | 9 | 9 | — | 0 | OK |
| JRA-20220813-NIIGATA-09 | 2022-08-13 | 湯沢特別 | 13 | 13 | — | 0 | OK |
| JRA-20220903-NIIGATA-10 | 2022-09-03 | 赤倉特別 | 13 | 13 | — | 0 | OK |
| JRA-20221015-NIIGATA-07 | 2022-10-15 | 3歳以上1勝クラス | 14 | 14 | — | 0 | OK |
| JRA-20221015-NIIGATA-09 | 2022-10-15 | 松浜特別 | 13 | 13 | — | 0 | OK |
| JRA-20221029-NIIGATA-11 | 2022-10-29 | 魚沼ステークス | 13 | 13 | 14 | 1 | OK |

STOPすべき差異は検出されなかった。

### Actual Starter Verification（魚沼ステークスの特殊ケース）

| 項目 | 値 |
|---|---|
| declaredFieldSize | 14 |
| actualFieldSize | 13 |
| 除外馬 | ドンアルゴス（sourceHorseId=2015100533、status=excluded_before_start） |

JSON/CSVいずれにもドンアルゴスの行は含まれておらず、`fieldSize=13`・
`runner rows=13`で一致していることを確認した。既存Gate Validation Contract
（actual startersのみ使用）に従い、ドンアルゴスはproductionKnownHorseCountの
計算対象から除外している。

---

## 2. Phase 4 Candidate Race Board

`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`（405件、sourceHorseId
をPrimary Keyとして照合、horseName fuzzy matchは不使用）との突合結果。

| rank | raceDate | raceName | sourceRaceId | raceId | fieldSize | productionKnownHorseCount | productionUnknownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|---|
| 1 | 2022-09-03 | 赤倉特別 | 202204030710 | JRA-20220903-NIIGATA-10 | 13 | 1 | 12 | 0.077 |
| 2 | 2022-08-13 | 湯沢特別 | 202204030109 | JRA-20220813-NIIGATA-09 | 13 | 1 | 12 | 0.077 |
| 3 | 2022-08-07 | 月岡温泉特別 | 202204020410 | JRA-20220807-NIIGATA-10 | 9 | 1 | 8 | 0.111 |
| 4 | 2022-10-29 | 魚沼ステークス | 202204040511 | JRA-20221029-NIIGATA-11 | 13 | 0 | 13 | 0.000 |
| 5 | 2022-10-15 | 3歳以上1勝クラス | 202204040107 | JRA-20221015-NIIGATA-07 | 14 | 0 | 14 | 0.000 |
| 6 | 2022-10-15 | 松浜特別 | 202204040109 | JRA-20221015-NIIGATA-09 | 13 | 0 | 13 | 0.000 |
| 7 | 2022-05-29 | 石打特別 | 202204010809 | JRA-20220529-NIIGATA-09 | 13 | 0 | 13 | 0.000 |
| 8 | 2022-05-14 | 尖閣湾特別 | 202204010309 | JRA-20220514-NIIGATA-09 | 8 | 0 | 8 | 0.000 |

（rank5・rank6は同日2022-10-15のため、raceNumber昇順サブタイブレークを適用
——3歳以上1勝クラス(raceNumber7)を松浜特別(raceNumber9)より先に配置。）

---

## 3. Runner Cross-Reference（96頭全件、Known馬のみ抜粋）

Known判定された3頭:

| horseName | sourceHorseId | canonicalHorseId | candidateRace |
|---|---|---|---|
| ラーグルフ | 2019101782 | 2019101782 | JRA-20220807-NIIGATA-10（月岡温泉特別） |
| ウインシュクラン | 2018101615 | 2018101615 | JRA-20220813-NIIGATA-09（湯沢特別） |
| アドマイヤハレー | 2018104895 | 2018104895 | JRA-20220903-NIIGATA-10（赤倉特別） |

残り93頭は全てproductionKnown=false。全96頭のhorseName/sourceHorseId/
productionKnown判定は`docs/checkpoint14d1j-niigata-turf2000-phase4-candidate-crossref.json`
の`phase4CandidateRaceBoard`および元データに完全対応する（各レースの
runners配列と1:1で突合済み）。

**repeated horses（同一sourceHorseIdが複数candidate raceに出走）が4件
検出された** — dedupエラーではなく`sourceHorseId + candidateRaceId`単位の
正常な結果:

| sourceHorseId | horseName | 出走candidateRace |
|---|---|---|
| 2018103242 | ピナ | 尖閣湾特別(2022-05-14)／石打特別(2022-05-29) |
| 2018105398 | ブリングトゥライフ | 石打特別(2022-05-29)／湯沢特別(2022-08-13) |
| 2018104627 | アーダレイ | 石打特別(2022-05-29)／湯沢特別(2022-08-13) |
| 2018103206 | クオンタム | 石打特別(2022-05-29)／松浜特別(2022-10-15) |

---

## 4. Known Horse List by Race

赤倉特別=1頭（アドマイヤハレー）。湯沢特別=1頭（ウインシュクラン）。
月岡温泉特別=1頭（ラーグルフ）。魚沼ステークス・3歳以上1勝クラス・松浜特別・
石打特別・尖閣湾特別=各0頭。

---

## 5. Unknown Horse List by Race

各レースのunknown頭数は2節参照（12/12/8/13/14/13/13/8頭）。氏名・
sourceHorseIdの完全リストは元データ（`niigata_turf2000_candidate_rosters_phase4_2022.json`）
の各race.runnersに対応。

---

## 6. Category B 44頭とのOverlap

**該当なし（overlap = 0件）。** Phase4の96頭とCategory B（44 unique horses）を
sourceHorseIdで突合したが、一致する馬は存在しなかった（Phase2・Phase3と
同様の結果——Category B44頭はいずれもproduction側の実データが2025〜2026年に
集中しているため）。

---

## 7. Existing V1 Race Overlap

既存10レース（`niigataTurf2000GateHistoryV1.json`、raceId 2021-2025年の
新潟大賞典・新潟記念、2022年分の新潟大賞典・新潟記念も含む）と、今回の
Phase4候補8レースを突合した結果、**raceId重複は0件。** checkpoint本文
11節の通り、Phase4候補には2022新潟大賞典・2022新潟記念自体は含まれて
いないことを確認した。

---

## 8. Selection Preview（Diagnostic、正式Freezeではない）

既存正式Selection Ruleを24候補へ機械的に適用した場合の上位20件
（9節のCombined Boardのrank1〜20と同一）。**これは正式Freezeではなく、
Diagnostic表示である。**

Top20に含まれる（rank1〜20、全て9節参照）／**除外される4件**（rank21〜24、
全てproductionKnownHorseCount=0）:

| rank | raceDate | raceName | phase | productionKnownHorseCount |
|---|---|---|---|---|
| 21 | 2022-10-15 | 3歳以上1勝クラス | 4 | 0 |
| 22 | 2022-10-15 | 松浜特別 | 4 | 0 |
| 23 | 2022-05-29 | 石打特別 | 4 | 0 |
| 24 | 2022-05-14 | 尖閣湾特別 | 4 | 0 |

除外される4件は全てknownCount=0のグループ内で、raceDateが最も古い側
（2022-05-14〜2022-10-15）に該当する4レースであり、Gate結果（finishPosition・
着順等）を一切参照しない、既存正式Ruleの機械的な適用結果である。

---

## 9. Phase 1 + 2 + 3 + 4 Combined Candidate Board（計24レース）

| overallRank | phase | raceDate | raceName | sourceRaceId | fieldSize | productionKnownHorseCount | productionUnknownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 2026-05-16 | 新潟大賞典 | 202604010511 | 15 | 13 | 2 | 0.867 |
| 2 | 2 | 2024-05-11 | 信濃川特別 | 202404010511 | 11 | 2 | 9 | 0.182 |
| 3 | 3 | 2023-09-02 | 赤倉特別 | 202304030710 | 9 | 2 | 7 | 0.222 |
| 4 | 3 | 2023-08-05 | 月岡温泉特別 | 202304020309 | 13 | 2 | 11 | 0.154 |
| 5 | 2 | 2025-05-18 | 信濃川特別 | 202504010610 | 10 | 1 | 9 | 0.100 |
| 6 | 2 | 2024-08-31 | 赤倉特別 | 202404030710 | 12 | 1 | 11 | 0.083 |
| 7 | 2 | 2024-08-03 | 月岡温泉特別 | 202404020311 | 8 | 1 | 7 | 0.125 |
| 8 | 4 | 2022-09-03 | 赤倉特別 | 202204030710 | 13 | 1 | 12 | 0.077 |
| 9 | 4 | 2022-08-13 | 湯沢特別 | 202204030109 | 13 | 1 | 12 | 0.077 |
| 10 | 4 | 2022-08-07 | 月岡温泉特別 | 202204020410 | 9 | 1 | 8 | 0.111 |
| 11 | 1 | 2026-08-23 | 3歳以上1勝クラス | 202604030210 | 12 | 0 | 12 | 0.000 |
| 12 | 1 | 2026-08-09 | 3歳以上1勝クラス | 202604020610 | 7 | 0 | 7 | 0.000 |
| 13 | 1 | 2026-05-23 | 尖閣湾特別 | 202604010710 | 15 | 0 | 15 | 0.000 |
| 14 | 1 | 2026-05-17 | 4歳以上1勝クラス | 202604010607 | 13 | 0 | 13 | 0.000 |
| 15 | 1 | 2026-05-17 | 信濃川特別 | 202604010610 | 16 | 0 | 16 | 0.000 |
| 16 | 2 | 2025-08-03 | 月岡温泉特別 | 202504020406 | 5 | 0 | 5 | 0.000 |
| 17 | 3 | 2023-10-14 | 3歳以上1勝クラス | 202304040107 | 16 | 0 | 16 | 0.000 |
| 18 | 3 | 2023-10-14 | 松浜特別 | 202304040110 | 15 | 0 | 15 | 0.000 |
| 19 | 3 | 2023-05-13 | 信濃川特別 | 202304010511 | 11 | 0 | 11 | 0.000 |
| 20 | 4 | 2022-10-29 | 魚沼ステークス | 202204040511 | 13 | 0 | 13 | 0.000 |
| 21 | 4 | 2022-10-15 | 3歳以上1勝クラス | 202204040107 | 14 | 0 | 14 | 0.000 |
| 22 | 4 | 2022-10-15 | 松浜特別 | 202204040109 | 13 | 0 | 13 | 0.000 |
| 23 | 4 | 2022-05-29 | 石打特別 | 202204010809 | 13 | 0 | 13 | 0.000 |
| 24 | 4 | 2022-05-14 | 尖閣湾特別 | 202204010309 | 8 | 0 | 8 | 0.000 |

**24レース中14レース（58.3%）がproductionKnownHorseCount=0。** 2026新潟
大賞典（86.7%）のみ突出しており、残り23レースは0〜22.2%。

---

## 10. Official Selection Rule Reconfirmation

CHECKPOINT14D.1E〜1Iで確定した正式Deterministic Selection Ruleをそのまま
使用した。今回も新しいthreshold・weight・tie-breakは発明していない:

```
1. productionKnownHorseCount 降順
2. 同数の場合はraceDate新しい順
3. さらに同日の場合はraceNumber昇順（CHECKPOINT14D.1Gで追加）
```

結果に合わせてSelection Ruleを変更していない。

---

## 11. Candidate Pool Sufficiency

| 項目 | 値 |
|---|---|
| 目標追加レース数 | 20 |
| 現在の候補プール（Phase1+2+3+4合計） | 24 |
| 判定 | **POOL_SUFFICIENT** |

**判定理由**: 既存Selection Contract（CHECKPOINT14D.1E以降）は「候補が20に
満たない場合は無理に合わせず実収集数を報告する」というfloor条件のみを
定めており、20を超える際の追加マージン要件は定義していない。24候補は20を
上回っており、Selection Ruleを適用した結果、ちょうど4レース（全て
productionKnownHorseCount=0）が機械的に除外される、意味のある選択が成立
している（8節参照）。

CHECKPOINT14D.1I 10節で述べた「10レース程度の追加が望ましい」は診断的な
推奨であり、既存Contract上の強制要件ではない。checkpoint本文16節の
「多い方が安心という理由だけで無限に追加Discoveryしない」という指示にも
従い、新規thresholdを発明してPOOL_EXPANSION_RECOMMENDEDとする根拠はない。

---

## 12. Phase 5 必要性

**NO。**

POOL_SUFFICIENTのため、2021年Phase5 Discoveryは実施しない。次はExact
Additional 20 Selectionへ進む段階である。

---

## 13. Regression

本ラウンドは`docs/`配下2ファイルの新規追加のみで、コード・実データは一切
変更していない。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Frozen Benchmark          → 70.3（変更なし）
Production Prediction Drift → 0
data/horses change          → 0
Provisional Stage A drift  → 0（1位ダノンシーマ80〜11位ステレンボッシュ68、不変）
```

---

## 14. 判定

**A-PHASE4-SCORED-POOL-SUFFICIENT**

8レースのinternal coverage計算完了。Attachment Integrity（魚沼ステークスの
actual starter特殊ケース含む）・sourceHorseId cross-reference照合・
Category B overlap・既存V1 race overlap・Combined Board作成・Selection
Preview・Pool Sufficiency判定、いずれにも問題は検出されなかった
（B-CROSSREF・C-IDENTITY・C-REGRESSIONのいずれにも該当しない）。

---

## 15. 次にChatGPTと決める必要がある項目（優先順位付き）

A-PHASE4-SCORED-POOL-SUFFICIENTのため、次CHECKPOINTでは以下を確定する:

1. **24 candidate races → 正式Selection Rule → Exact Additional 20 races**
   の最終確定（本ラウンドの8節Selection Previewをベースに、正式Freezeとして
   確定する）。
2. 確定した追加20レースについて、実際のGate Race CSV本体データ（枠番・
   馬番・着順・タイム等）の収集契約を再確認する（`docs/checkpoint14d1f-*`
   で既に確定済みの24列契約を再利用する想定）。
3. 除外される4レース（8節参照）についても、Historical Ability Support
   Dataset（Category B/A対象馬のprior history収集）の観点で今後扱うか
   どうかを別途判断する。

今回まだGate実装・Stage A再計算・Formal Stage A Freeze・Stage Bへは進んで
いない。

STOP。

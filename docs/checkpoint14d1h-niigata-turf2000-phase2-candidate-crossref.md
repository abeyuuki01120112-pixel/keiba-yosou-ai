# CHECKPOINT 14D.1H — External Candidate Roster Phase 2 / 2025-2024 Cross-Reference

ChatGPTが外部Race DB（netkeiba）から収集した2025・2024年の新潟芝2000m外・
既終了5レース・46 runnerの候補Rosterを、repository内部のproduction
known-sourceHorseId cross-reference（405件）と照合した。CHECKPOINT14D.1G
（Phase1、2026年6レース）の結果と統合し、Combined Candidate Board（計11レース）を
作成した。**今回もadditionalRacesは確定しない。** Production data・Gate Effect・
Stage A再計算・Formal Freeze・Stage B・Weather・Odds・EV・BET・Probability・
Umapro・UIのいずれも今回は着手していない。Production Importも行っていない。

---

## 1. Attachment Integrity

| 項目 | 期待値 | 実測値 | 結果 |
|---|---|---|---|
| candidateRaceCount | 5 | 5 | OK |
| runnerRowCount | 46 | 46 | OK |
| JSON/CSV差異 | なし | なし（46行、`sourceRaceId/raceId/raceDate/raceName/horseName/sourceHorseId`の6フィールド完全一致） | OK |

各raceのrow count == fieldSizeも全件一致（5/5）:

| raceId | raceDate | raceName | fieldSize | runner数 | 一致 |
|---|---|---|---|---|---|
| JRA-20250518-NIIGATA-10 | 2025-05-18 | 信濃川特別 | 10 | 10 | OK |
| JRA-20250803-NIIGATA-06 | 2025-08-03 | 月岡温泉特別 | 5 | 5 | OK |
| JRA-20240511-NIIGATA-11 | 2024-05-11 | 信濃川特別 | 11 | 11 | OK |
| JRA-20240803-NIIGATA-11 | 2024-08-03 | 月岡温泉特別 | 8 | 8 | OK |
| JRA-20240831-NIIGATA-10 | 2024-08-31 | 赤倉特別 | 12 | 12 | OK |

STOPすべき差異は検出されなかった。

---

## 2. Phase 2 Candidate Race Board

`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`（405件、sourceHorseId
をPrimary Keyとして照合、horseName fuzzy matchは不使用）との突合結果。

| rank | raceDate | raceName | sourceRaceId | raceId | fieldSize | productionKnownHorseCount | productionUnknownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|---|
| 1 | 2024-05-11 | 信濃川特別 | 202404010511 | JRA-20240511-NIIGATA-11 | 11 | 2 | 9 | 0.182 |
| 2 | 2025-05-18 | 信濃川特別 | 202504010610 | JRA-20250518-NIIGATA-10 | 10 | 1 | 9 | 0.100 |
| 3 | 2024-08-31 | 赤倉特別 | 202404030710 | JRA-20240831-NIIGATA-10 | 12 | 1 | 11 | 0.083 |
| 4 | 2024-08-03 | 月岡温泉特別 | 202404020311 | JRA-20240803-NIIGATA-11 | 8 | 1 | 7 | 0.125 |
| 5 | 2025-08-03 | 月岡温泉特別 | 202504020406 | JRA-20250803-NIIGATA-06 | 5 | 0 | 5 | 0.000 |

Phase1（2026新潟大賞典=13/15=86.7%）と比べ、**今回の5レース（信濃川特別・
月岡温泉特別・赤倉特別のいずれも条件戦・特別戦級）は全て0〜2という低い
Known Coverage**だった。これはCHECKPOINT14D.1G 9節のdiagnostic
（「重賞のみKnown Coverageが高く、条件戦・特別戦は構造的に低い」）と整合する。

---

## 3. Runner Cross-Reference（46頭全件）

### 3-1. JRA-20240511-NIIGATA-11（信濃川特別2024、known=2/11）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| シーウィザード | 2020101695 | false | — |
| カンティプール | 2019104703 | false | — |
| マイネルメモリー | 2020105750 | true | 2020105750 |
| タイキラフター | 2020106811 | false | — |
| フェミナフォルテ | 2020103920 | false | — |
| カフジアスール | 2018101562 | false | — |
| マルチャン | 2020103066 | true | 2020103066 |
| エイトキングゴッド | 2020103865 | false | — |
| ウィステリアリヴァ | 2020104708 | false | — |
| ロードディフィート | 2020102119 | false | — |
| コルベイユ | 2019104607 | false | — |

### 3-2. JRA-20250518-NIIGATA-10（信濃川特別2025、known=1/10）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| ドラゴンヘッド | 2020100495 | false | — |
| ストップザタイム | 2019101873 | false | — |
| サダムオプシス | 2021105474 | false | — |
| マイネルオーシャン | 2021106766 | false | — |
| ミスティア | 2021105802 | false | — |
| ファミリータイム | 2021100651 | true | 2021100651 |
| エコロレイズ | 2021103976 | false | — |
| ピクシレーション | 2020102868 | false | — |
| コスモエクスプレス | 2019100702 | false | — |
| バードウォッチャー | 2021105375 | false | — |

### 3-3. JRA-20240831-NIIGATA-10（赤倉特別、known=1/12）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| コスモシャングリラ | 2020103562 | false | — |
| ピンキープロミス | 2020106475 | false | — |
| レッドミラージュ | 2019105492 | false | — |
| ジュンツバメガエシ | 2020103208 | false | — |
| マルチャン | 2020103066 | true | 2020103066 |
| ロードプレイヤー | 2020101199 | false | — |
| フォーランマリア | 2019104726 | false | — |
| スズノマーベリック | 2019102496 | false | — |
| ホウオウバニラ | 2019105340 | false | — |
| シルバープリペット | 2020104878 | false | — |
| マルベリーシチー | 2020100684 | false | — |
| マイネルトルファン | 2019100790 | false | — |

### 3-4. JRA-20240803-NIIGATA-11（月岡温泉特別2024、known=1/8）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| オールセインツ | 2021104971 | false | — |
| ウインオーディン | 2020105217 | false | — |
| マルチャン | 2020103066 | true | 2020103066 |
| ナムラフッカー | 2021102510 | false | — |
| ニュージーズ | 2021105807 | false | — |
| タガノカイ | 2018101970 | false | — |
| ダノンターキッシュ | 2018100410 | false | — |
| ヴェンチュラムーン | 2020105951 | false | — |

### 3-5. JRA-20250803-NIIGATA-06（月岡温泉特別2025、known=0/5）

サダムオプシス(2021105474)／フナデ(2021103790)／ナイトスラッガー(2021101603)／
カフェアローロ(2021100469)／マーシャルポイント(2021105675)
— 全頭productionKnown=false。

**マルチャン（sourceHorseId=2020103066）は、2024年の3レース全て（信濃川特別・
月岡温泉特別・赤倉特別）に出走しており、同一馬が複数candidate raceに登場
している。これはduplicate errorではなく、`sourceHorseId + candidateRaceId`
単位でのRace-level Screeningとして正常な結果である。**

---

## 4. Known Horse List by Race

2節の表と重複するため要約: 信濃川特別2024(2頭)／信濃川特別2025(1頭)／
赤倉特別(1頭)／月岡温泉特別2024(1頭)／月岡温泉特別2025(0頭)。詳細は3節。

---

## 5. Unknown Horse List by Race

各レースのunknown頭数は2節参照（9/9/11/7/5頭）。氏名・sourceHorseIdの完全
リストは3節の表に記載済み。

---

## 6. Category B 44頭とのOverlap

**該当なし（overlap = 0件）。** Phase2の46頭とCategory B（44 unique horses）を
sourceHorseIdで突合したが、一致する馬は存在しなかった。（Phase1では3頭が
2026新潟大賞典と重複していたことと対照的——Category B44頭はいずれも
production側の実データが2025〜2026年に集中しているため、2024年以前の
候補レースとの重複が発生しにくい構造であることが伺える。）

---

## 7. Existing V1 Race Overlap

既存10レース（`niigataTurf2000GateHistoryV1.json`、raceId 2021-2025年の
新潟大賞典・新潟記念）と、今回のPhase2候補5レースを突合した結果、
**raceId重複は0件。** horse単位の重複（6節）とrace単位の重複は区別して
確認済み。

---

## 8. Phase 1 + Phase 2 Combined Candidate Board（計11レース）

| overallRank | phase | raceDate | raceName | sourceRaceId | fieldSize | productionKnownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2026-05-16 | 新潟大賞典 | 202604010511 | 15 | 13 | 0.867 |
| 2 | 2 | 2024-05-11 | 信濃川特別 | 202404010511 | 11 | 2 | 0.182 |
| 3 | 2 | 2025-05-18 | 信濃川特別 | 202504010610 | 10 | 1 | 0.100 |
| 4 | 2 | 2024-08-31 | 赤倉特別 | 202404030710 | 12 | 1 | 0.083 |
| 5 | 2 | 2024-08-03 | 月岡温泉特別 | 202404020311 | 8 | 1 | 0.125 |
| 6 | 1 | 2026-08-23 | 3歳以上1勝クラス | 202604030210 | 12 | 0 | 0.000 |
| 7 | 1 | 2026-08-09 | 3歳以上1勝クラス | 202604020610 | 7 | 0 | 0.000 |
| 8 | 1 | 2026-05-23 | 尖閣湾特別 | 202604010710 | 15 | 0 | 0.000 |
| 9 | 1 | 2026-05-17 | 4歳以上1勝クラス | 202604010607 | 13 | 0 | 0.000 |
| 10 | 1 | 2026-05-17 | 信濃川特別 | 202604010610 | 16 | 0 | 0.000 |
| 11 | 2 | 2025-08-03 | 月岡温泉特別 | 202504020406 | 5 | 0 | 0.000 |

（rank9とrank10は同日2026-05-17のため、CHECKPOINT14D.1Gで導入したraceNumber
昇順サブタイブレークを適用——4歳以上1勝クラス(raceNumber7)を信濃川特別
(raceNumber10)より先に配置。）

**2026新潟大賞典（rank1、13/15=86.7%）が依然として突出しており、他10レースは
0〜2という低いKnown Coverage。**

---

## 9. Official Selection Rule Reconfirmation

CHECKPOINT14D.1E 3節で確定した正式Selection Ruleをそのまま適用した:

```
1. productionKnownHorseCount 降順
2. 同数の場合はraceDate新しい順
3.（CHECKPOINT14D.1Gで新規追加）さらに同日の場合はraceNumber昇順
```

今回の依頼文が提示したタイブレーク（count→rate→raceDate）は採用していない。
CHECKPOINT14D.1Gと同様、既存正式Ruleを優先した。Combined Board（8節）では
count=1の3レース間でrace日付が明確に異なる（2024-08-31 > 2024-08-03）ため、
rateタイブレークが必要になる場面もなく、正式Ruleのみで一意に順位付けできた。

---

## 10. Candidate Pool Sufficiency

| 項目 | 値 |
|---|---|
| 目標追加レース数 | 20 |
| 現在の候補プール（Phase1+2合計） | 11 |
| 最低限あと必要な候補数（プールを20に到達させるため） | 9 |

**ただし、単純な候補数だけでは不十分。** Phase1+2の11候補中、意味のある
productionKnownHorseCountを持つのは2026新潟大賞典（13）のみで、残り10候補は
0〜2と非常に低い。Ability Coverage改善という本来の目的（CHECKPOINT14D.1E
「Ability Control可能runner数を増やす」）に照らすと、単純に候補数を20へ
到達させるだけでは不十分であり、**重賞・Listed・OP級のレースを優先的に
追加探索する必要がある**（CHECKPOINT14D.1G 9節のdiagnosticと整合する結論）。

結果を見てから探索方針を恣意的に変えているわけではなく、「productionデータの
収集が重賞級レースに集中している」という既に確認済みの構造的事実に基づく
推奨である。

---

## 11. Next Discovery Range

結果を良くするために年を選んでいない。既存正式Selection Ruleの必須条件7項目
（新潟・芝・2000m・outer・raceDate<2026-08-30・既存10レース除外・レースクラス
限定なし）を満たす候補を網羅的に収集することを優先する:

1. **2025年の残り新潟芝2000m外レース**（信濃川特別・月岡温泉特別以外の
   重賞・Listed・OP級を含む、条件を満たす全レース）
2. **2024年の残り新潟芝2000m外レース**（同上）
3. **2023年以前**（新潟記念・新潟大賞典自体の他年度、および他の重賞・
   Listed・OP級レース）

10節のdiagnosticに基づき、重賞・Listed・OP級を優先して収集することを推奨する。

---

## 12. Regression

本ラウンドは`docs/`配下2ファイルの新規追加のみで、コード・実データは一切変更
していない。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Frozen Benchmark          → 70.3（変更なし）
Production Prediction Drift → 0
Gate 10-Race Dataset        → 不変
```

---

## 13. 判定

**A-PHASE2-SCORED**

5レースのinternal coverage計算完了。Attachment Integrity・sourceHorseId
cross-reference照合・Category B overlap・既存V1 race overlap・Combined Board
作成、いずれにも問題は検出されなかった（B-CROSSREF・C-IDENTITY・C-REGRESSION
のいずれにも該当しない）。

---

## 14. 次にChatGPTが行う作業

1. Phase 3として、**2025年の残り新潟芝2000m外レース**（重賞・Listed・OP級を
   優先）の候補Rosterを、同一Manifest形式（JSON+CSV、sourceHorseId必須）で
   収集する。
2. 続けて**2024年の残り**、必要なら**2023年以前**（新潟記念・新潟大賞典自体の
   他年度を含む）の候補Rosterも同様に収集する。
3. 10節の通り、候補プールを20に到達させるだけでなく、重賞・Listed・OP級を
   優先することで、実質的なAbility Coverage改善効果の高い候補を増やすことを
   推奨する。
4. 各Phaseで得られたRosterは、本ラウンドと同じ形式でClaude側へ提出し、
   productionKnownHorseCount/Rateの計算・Category B Overlap確認・Combined
   Boardの更新を継続する。
5. **追加20レースの最終確定は、まだ行わない。**

STOP。additional 20 racesの最終確定・Gate実装・Stage A再計算・Formal Freeze・
Stage Bへは進まない。

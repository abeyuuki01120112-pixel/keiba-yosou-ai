# CHECKPOINT 14D.1I — External Candidate Roster Phase 3 / 2023 Cross-Reference

ChatGPTが外部Race DB（netkeiba）から収集した2023年の新潟芝2000m外・既終了
5レース・64 runnerの候補Rosterを、repository内部のproduction
known-sourceHorseId cross-reference（405件）と照合した。CHECKPOINT14D.1G
（Phase1、6レース）・CHECKPOINT14D.1H（Phase2、5レース）と統合し、Phase1+2+3
Combined Candidate Board（計16レース）を作成した。**今回もadditionalRacesは
確定しない。** Production data・Gate Effect・Stage A再計算・Formal Freeze・
Stage B・Weather・Odds・EV・BET・Probability・Umapro・UIのいずれも今回は
着手していない。Production Importも行っていない。

---

## 1. Attachment Integrity

| 項目 | 期待値 | 実測値 | 結果 |
|---|---|---|---|
| candidateRaceCount | 5 | 5 | OK |
| runnerRowCount | 64 | 64 | OK |
| JSON/CSV差異 | なし | なし（64行、`sourceRaceId/raceId/raceDate/raceName/horseName/sourceHorseId`の6フィールド完全一致） | OK |

各raceのrow count == fieldSizeも全件一致（5/5）:

| raceId | raceDate | raceName | fieldSize | runner数 | 一致 |
|---|---|---|---|---|---|
| JRA-20230513-NIIGATA-11 | 2023-05-13 | 信濃川特別 | 11 | 11 | OK |
| JRA-20230805-NIIGATA-09 | 2023-08-05 | 月岡温泉特別 | 13 | 13 | OK |
| JRA-20230902-NIIGATA-10 | 2023-09-02 | 赤倉特別 | 9 | 9 | OK |
| JRA-20231014-NIIGATA-07 | 2023-10-14 | 3歳以上1勝クラス | 16 | 16 | OK |
| JRA-20231014-NIIGATA-10 | 2023-10-14 | 松浜特別 | 15 | 15 | OK |

STOPすべき差異は検出されなかった。

---

## 2. Phase 3 Candidate Race Board

`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`（405件、sourceHorseId
をPrimary Keyとして照合、horseName fuzzy matchは不使用）との突合結果。

| rank | raceDate | raceName | sourceRaceId | raceId | fieldSize | productionKnownHorseCount | productionUnknownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|---|
| 1 | 2023-09-02 | 赤倉特別 | 202304030710 | JRA-20230902-NIIGATA-10 | 9 | 2 | 7 | 0.222 |
| 2 | 2023-08-05 | 月岡温泉特別 | 202304020309 | JRA-20230805-NIIGATA-09 | 13 | 2 | 11 | 0.154 |
| 3 | 2023-10-14 | 3歳以上1勝クラス | 202304040107 | JRA-20231014-NIIGATA-07 | 16 | 0 | 16 | 0.000 |
| 4 | 2023-10-14 | 松浜特別 | 202304040110 | JRA-20231014-NIIGATA-10 | 15 | 0 | 15 | 0.000 |
| 5 | 2023-05-13 | 信濃川特別 | 202304010511 | JRA-20230513-NIIGATA-11 | 11 | 0 | 11 | 0.000 |

（rank3・rank4は同日2023-10-14のため、raceNumber昇順サブタイブレークを適用
——3歳以上1勝クラス(raceNumber7)を松浜特別(raceNumber10)より先に配置。）

---

## 3. Runner Cross-Reference（64頭全件）

### 3-1. JRA-20230513-NIIGATA-11（信濃川特別、known=0/11）

セレブレイトガイズ(2019105485)／ブルーゲート(2019100808)／
エヴィダンシア(2019106932)／トランシルヴァニア(2017105667)／
シーリアスラブ(2016105048)／シンシアリダーリン(2018105408)／
ヒルノエドワード(2017101322)／マリノソフィア(2017100251)／
ビートザウイングス(2017104670)／サマービート(2017106570)／
アナレンマ(2018105462)
— 全頭productionKnown=false。

### 3-2. JRA-20230805-NIIGATA-09（月岡温泉特別、known=2/13）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| コスモサガルマータ | 2020103881 | false | — |
| マイネルモーント | 2020105749 | true | 2020105749 |
| シーウィザード | 2020101695 | false | — |
| エクランドール | 2018105345 | false | — |
| クリオミニーズ | 2019105171 | false | — |
| ブリングトゥライフ | 2018105398 | false | — |
| ハッピーオーサム | 2018104929 | false | — |
| アトミックフレア | 2018100190 | false | — |
| ファジェス | 2018105084 | false | — |
| クロニクルノヴァ | 2019105084 | false | — |
| サイモンメガライズ | 2018101175 | false | — |
| デルマグレムリン | 2019105877 | true | 2019105877 |
| ダンツエスプリ | 2019106399 | false | — |

### 3-3. JRA-20230902-NIIGATA-10（赤倉特別、known=2/9）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| ロードデルレイ | 2020100157 | true | 2020100157 |
| シーウィザード | 2020101695 | false | — |
| アイザックバローズ | 2020101548 | false | — |
| ニシノレヴナント | 2020100254 | true | 2020100254 |
| ロジマンボ | 2019105559 | false | — |
| アラビアンナイト | 2018100226 | false | — |
| パンドレア | 2019104557 | false | — |
| サマービート | 2017106570 | false | — |
| オウケンロジータ | 2017106232 | false | — |

### 3-4. JRA-20231014-NIIGATA-07（3歳以上1勝クラス、known=0/16）

シュホ(2019105341)／ゴルトシュミーデ(2019104839)／
スリリングチェイス(2020103407)／スノーディザイア(2019105764)／
レディズビーク(2019105550)／トゥルブレンツ(2020102574)／
ヒナノコバン(2017105874)／メイショウサンガ(2017106366)／
シルバースピリット(2018106506)／コスモダークナイト(2019102611)／
マコトヴィクラント(2020104940)／アンブロジアーナ(2019100620)／
プリティユニバンス(2017104215)／ハイランドリンクス(2020103595)／
エンライトメント(2020106986)／クリノグリゴロス(2018101114)
— 全頭productionKnown=false。

### 3-5. JRA-20231014-NIIGATA-10（松浜特別、known=0/15）

ヴァイルマティ(2020105789)／メイショウノブカ(2020106925)／
キヨラ(2018106352)／ジェモロジー(2020103560)／
ローブエリタージュ(2019105570)／クインズカムイ(2020105325)／
アドマイヤサジー(2020103792)／レシプロシティ(2020102862)／
ルージュクレセント(2020104570)／トリオンファルマン(2020105652)／
セルケト(2019105272)／イージーオンミー(2020101143)／
オブリクア(2020105618)／エルチェリーナ(2020106566)／
ウインレイアー(2020105185)
— 全頭productionKnown=false。

**シーウィザード（sourceHorseId=2020101695）とサマービート（sourceHorseId=
2017106570）は複数candidate raceに出走している** — シーウィザードは
月岡温泉特別(2023-08-05)と赤倉特別(2023-09-02)、サマービートは信濃川特別
(2023-05-13)と赤倉特別(2023-09-02)。dedupエラーではなく、
`sourceHorseId + candidateRaceId`単位のRace-level Screeningとして正常な
結果である。

---

## 4. Known Horse List by Race

要約: 赤倉特別(2頭)／月岡温泉特別(2頭)／3歳以上1勝クラス(0頭)／
松浜特別(0頭)／信濃川特別(0頭)。詳細は3節。

---

## 5. Unknown Horse List by Race

各レースのunknown頭数は2節参照（11/11/16/15/11頭）。詳細は3節。

---

## 6. Category B 44頭とのOverlap

**該当なし（overlap = 0件）。** Phase3の64頭とCategory B（44 unique horses）を
sourceHorseIdで突合したが、一致する馬は存在しなかった。（Phase2と同様、
Category B44頭はいずれもproduction側の実データが2025〜2026年に集中している
ため、2023年以前の候補レースとの重複は今回も発生しなかった。）

---

## 7. Existing V1 Race Overlap

既存10レース（`niigataTurf2000GateHistoryV1.json`、raceId 2021-2025年の
新潟大賞典・新潟記念）と、今回のPhase3候補5レースを突合した結果、
**raceId重複は0件。**

---

## 8. Phase 1 + Phase 2 + Phase 3 Combined Board（計16レース）

| overallRank | phase | raceDate | raceName | sourceRaceId | fieldSize | productionKnownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2026-05-16 | 新潟大賞典 | 202604010511 | 15 | 13 | 0.867 |
| 2 | 2 | 2024-05-11 | 信濃川特別 | 202404010511 | 11 | 2 | 0.182 |
| 3 | 3 | 2023-09-02 | 赤倉特別 | 202304030710 | 9 | 2 | 0.222 |
| 4 | 3 | 2023-08-05 | 月岡温泉特別 | 202304020309 | 13 | 2 | 0.154 |
| 5 | 2 | 2025-05-18 | 信濃川特別 | 202504010610 | 10 | 1 | 0.100 |
| 6 | 2 | 2024-08-31 | 赤倉特別 | 202404030710 | 12 | 1 | 0.083 |
| 7 | 2 | 2024-08-03 | 月岡温泉特別 | 202404020311 | 8 | 1 | 0.125 |
| 8 | 1 | 2026-08-23 | 3歳以上1勝クラス | 202604030210 | 12 | 0 | 0.000 |
| 9 | 1 | 2026-08-09 | 3歳以上1勝クラス | 202604020610 | 7 | 0 | 0.000 |
| 10 | 1 | 2026-05-23 | 尖閣湾特別 | 202604010710 | 15 | 0 | 0.000 |
| 11 | 1 | 2026-05-17 | 4歳以上1勝クラス | 202604010607 | 13 | 0 | 0.000 |
| 12 | 1 | 2026-05-17 | 信濃川特別 | 202604010610 | 16 | 0 | 0.000 |
| 13 | 2 | 2025-08-03 | 月岡温泉特別 | 202504020406 | 5 | 0 | 0.000 |
| 14 | 3 | 2023-10-14 | 3歳以上1勝クラス | 202304040107 | 16 | 0 | 0.000 |
| 15 | 3 | 2023-10-14 | 松浜特別 | 202304040110 | 15 | 0 | 0.000 |
| 16 | 3 | 2023-05-13 | 信濃川特別 | 202304010511 | 11 | 0 | 0.000 |

（rank8〜12・rank14〜16の同数グループ内は、raceDate降順→raceNumber昇順の
既存正式Ruleでソート。）

---

## 9. Official Selection Rule Reconfirmation

CHECKPOINT14D.1E〜1Hで確定した正式Deterministic Selection Ruleをそのまま
使用した。今回も新しいthresholdやtie-breakは発明していない:

```
1. productionKnownHorseCount 降順
2. 同数の場合はraceDate新しい順
3. さらに同日の場合はraceNumber昇順（CHECKPOINT14D.1Gで追加）
```

結果に合わせてSelection Ruleを変更していない。

---

## 10. Candidate Pool Sufficiency

| 項目 | 値 |
|---|---|
| 目標追加レース数 | 20 |
| 現在の候補プール（Phase1+2+3合計） | 16 |
| 最低限あと必要な候補数（プールを20に到達させるため） | 4 |

候補プールを20に到達させるだけなら最低4レースの追加で足りる。ただし
**16候補中9レース（56%）がproductionKnownHorseCount=0**であり、
Deterministic Selection Ruleに実質的な選択の余地（20を超える候補から
上位20を選ぶ）を持たせるには、最低限の4レースだけでなく、それを上回る候補
（目安として現状の16候補に対し同程度以上、たとえば10レース前後）を収集し、
20を明確に超えるプールを確保することが望ましい。これは新規thresholdの
発明ではなく、checkpoint本文15節の「20候補ぴったりで終わらせない」という
既存指示の反映である。

---

## 11. Phase 4 Recommended Discovery Range

**2022年**の新潟芝2000m外レース（新潟大賞典・新潟記念以外の、信濃川特別・
月岡温泉特別・赤倉特別・松浜特別・石打特別等の条件戦・特別戦、および
該当すればListed〜OP級のレース）を優先探索する。16候補では明確に不足して
いるため、Phase4で最低4レース、可能であれば10レース程度の追加候補収集を
推奨する。

**架空raceIdは作成していない。** checkpoint本文16節で例示された石打特別等は
ChatGPT側での外部探索候補として名前が挙がっているのみで、Claude側では
今回外部検索を行っておらず、これらのレースの実在・具体的なraceId・出走馬
構成については一切確認していない。

---

## 12. Production Known Density（実測、13節の指示に従い推測で結論しない）

| Phase | 対象年 | レース数 | 平均productionKnownHorseRate |
|---|---|---|---|
| 1 | 2026 | 6 | 14.45%（うち新潟大賞典1レースが86.7%で牽引） |
| 2 | 2025・2024 | 5 | 9.8% |
| 3 | 2023 | 5 | 7.52% |

**実測値のみ報告する。** 2023年5レースも他年度の条件戦・特別戦と概ね同様の
低〜中程度のcoverage（0〜22.2%）であり、「古いから低い」という推測は今回の
データからは断定できない——2023赤倉特別（22.2%）は2024年の同名レース
（8.3%）より高い。唯一明確に高いのは2026新潟大賞典（86.7%、重賞級）のみで
あり、これが年度によるものかレースグレードによるものかは、今回の16候補
だけでは統計的に切り分けられない。

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
Gate 10-Race Dataset        → 不変
Provisional Stage A Board  → 不変（1位ダノンシーマ80〜11位ステレンボッシュ68）
```

---

## 14. 判定

**A-PHASE3-SCORED**

5レースのinternal coverage計算完了。Attachment Integrity・sourceHorseId
cross-reference照合・Category B overlap・既存V1 race overlap・Combined Board
作成、いずれにも問題は検出されなかった（B-CROSSREF・C-IDENTITY・
C-REGRESSIONのいずれにも該当しない）。

---

## 15. 次にChatGPTが行う作業

1. Phase 4として、**2022年**の新潟芝2000m外レース（信濃川特別・月岡温泉特別・
   赤倉特別・松浜特別・石打特別等の条件戦・特別戦を含む、実在確認済みの
   レース）の候補Rosterを、同一Manifest形式（JSON+CSV、sourceHorseId必須）で
   収集する。
2. 10節の通り、候補プールを単に20に到達させるだけでなく、選択の余地を
   持たせるため、最低4レース・目安として10レース程度の追加収集を推奨する。
3. 得られたRosterは、本ラウンドと同じ形式でClaude側へ提出し、
   productionKnownHorseCount/Rateの計算・Category B Overlap確認・Combined
   Boardの更新を継続する。
4. **追加20レースの最終確定は、まだ行わない。**

STOP。additional 20 racesの最終確定・Gate実装・Stage A再計算・Formal Freeze・
Stage Bへは進まない。

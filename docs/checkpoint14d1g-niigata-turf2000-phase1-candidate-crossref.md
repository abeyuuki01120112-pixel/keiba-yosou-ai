# CHECKPOINT 14D.1G — External Candidate Roster Phase 1 / Production Known-Horse Cross-Reference

ChatGPTが外部Race DB（netkeiba）から収集した2026年新潟芝2000m外・既終了6レースの
候補Rosterを、repository内部のproduction known-sourceHorseId cross-reference
（`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`、405件）と照合した。
**今回もaddtionalRacesは確定しない（Phase 1 Screeningのみ）。** Production data
（`data/horses/`・Base Ability・MemberLevel・Suitability・Provisional Stage A・
Gate Validation Dataset・Frozen Benchmark 70.3）は一切変更していない。添付データの
Production Importも行っていない。Gate Effect再計算・Gate Weight・Stage A再計算・
Formal Stage A Freeze・Stage B・Weather・Track Bias・Odds・EV・BET・Probability・
Umapro・UIのいずれも今回は着手していない。

---

## 1. Attachment Integrity

| 項目 | 期待値 | 実測値 | 結果 |
|---|---|---|---|
| candidateRaceCount | 6 | 6 | OK |
| runnerRowCount | 78 | 78 | OK |
| JSON/CSV差異 | なし | なし（78行完全一致、`(sourceRaceId, sourceHorseId, horseName)`で突合） | OK |

各raceのrow count == fieldSizeも全件一致（6/6）:

| raceId | fieldSize | runner数 | 一致 |
|---|---|---|---|
| JRA-20260516-NIIGATA-11 | 15 | 15 | OK |
| JRA-20260517-NIIGATA-07 | 13 | 13 | OK |
| JRA-20260517-NIIGATA-10 | 16 | 16 | OK |
| JRA-20260523-NIIGATA-10 | 15 | 15 | OK |
| JRA-20260809-NIIGATA-10 | 7 | 7 | OK |
| JRA-20260823-NIIGATA-10 | 12 | 12 | OK |

STOPすべき差異は検出されなかった。

（注: CSV読み込み時にUTF-8 BOMが検出されたため、`sourceRaceId`ヘッダーの
先頭にBOMが付与された状態で最初のパースが失敗した。BOM対応の読み込みで
再パースし、78行完全一致を確認した——これはデータ内容の問題ではなく、
ファイルエンコーディングの標準的な扱いの問題であり、Manifestの内容には
影響しない。）

---

## 2. Candidate Race Board

`docs/checkpoint14d1e-known-sourcehorseid-crossref.json`（405件、sourceHorseId
をPrimary Keyとして照合、horseName fuzzy matchは不使用）との突合結果。

| rank | raceDate | raceName | sourceRaceId | raceId | fieldSize | productionKnownHorseCount | productionUnknownHorseCount | productionKnownHorseRate |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-05-16 | 新潟大賞典 | 202604010511 | JRA-20260516-NIIGATA-11 | 15 | 13 | 2 | 0.867 |
| 2 | 2026-08-23 | 3歳以上1勝クラス | 202604030210 | JRA-20260823-NIIGATA-10 | 12 | 0 | 12 | 0.000 |
| 3 | 2026-08-09 | 3歳以上1勝クラス | 202604020610 | JRA-20260809-NIIGATA-10 | 7 | 0 | 7 | 0.000 |
| 4 | 2026-05-23 | 尖閣湾特別 | 202604010710 | JRA-20260523-NIIGATA-10 | 15 | 0 | 15 | 0.000 |
| 5 | 2026-05-17 | 4歳以上1勝クラス | 202604010607 | JRA-20260517-NIIGATA-07 | 13 | 0 | 13 | 0.000 |
| 6 | 2026-05-17 | 信濃川特別 | 202604010610 | JRA-20260517-NIIGATA-10 | 16 | 0 | 16 | 0.000 |

**新潟大賞典（2026-05-16）のみproductionKnownHorseCount=13で突出しており、他5レース
（条件戦・特別戦）は全て0。**

---

## 3. Runner Cross-Reference（78頭全件）

### 3-1. JRA-20260516-NIIGATA-11（新潟大賞典、known=13/15）

| horseName | sourceHorseId | productionKnown | canonicalHorseId |
|---|---|---|---|
| グランディア | 2019105302 | true | 2019105302 |
| バレエマスター | 2019104850 | true | 2019104850 |
| フクノブルーレイク | 2022101329 | true | 2022101329 |
| ドゥラドーレス | 2019105556 | false | — |
| ヤマニンブークリエ | 2022106611 | true | 2022106611 |
| トーセンリョウ | 2019104711 | true | 2019104711 |
| セキトバイースト | 2021103975 | true | 2021103975 |
| ホールネス | 2020110060 | true | 2020110060 |
| グランドカリナン | 2020106234 | true | 2020106234 |
| アンゴラブラック | 2021105738 | true | 2021105738 |
| シュトルーヴェ | 2019104447 | true | 2019104447 |
| ラインベック | 2017105194 | true | 2017105194 |
| サフィラ | 2021105541 | false | — |
| シンハナーダ | 2021105574 | true | 2021105574 |
| シュガークン | 2021102224 | true | 2021102224 |

### 3-2. JRA-20260517-NIIGATA-07（4歳以上1勝クラス、known=0/13）

ベネスピラ(2022102745)／コスモアチーブ(2022106792)／ダノンアトラス(2021105113)／
マイネルアウルム(2022106811)／ウインボレロ(2021106203)／ロジウムエポック(2020104986)／
コンサートマスター(2022104595)／ディーンズリスター(2019105490)／
トラストモアリズム(2022101620)／コーラスライン(2019104843)／
デビューフライト(2022105123)／アンドローゼス(2021105911)／ソリッドベーシス(2022105697)
— 全頭productionKnown=false。

### 3-3. JRA-20260517-NIIGATA-10（信濃川特別、known=0/16）

マリアイリダータ(2022105064)／ホウオウシンデレラ(2021103533)／
コンフォルツァ(2022105421)／クロシェットノエル(2021101068)／
ズイウンゴサイ(2021100597)／ジェットブレード(2022103522)／ワザモノ(2018103560)／
ハイディージェン(2021103821)／バンフィエルド(2019104531)／
ホウオウレイヴン(2022105322)／コスモアバンサ(2020101337)／
パッションリッチ(2022105390)／フルレゾン(2021104840)／
バードウォッチャー(2021105375)／ジャンビ(2021103878)／
タッチアンドムーブ(2021105106)
— 全頭productionKnown=false。

### 3-4. JRA-20260523-NIIGATA-10（尖閣湾特別、known=0/15）

マイネルアズーロ(2022100274)／トゥルーサクセサー(2021103537)／
ミッドセンチュリー(2022103308)／マイネルモメンタム(2021106811)／
エテルニータ(2022106344)／シンドリームシン(2021105382)／
オプレントジュエル(2022105365)／クラウディアイ(2022100099)／
ドーギッド(2022105766)／サイレントグルーヴ(2021105274)／
タマモランプ(2021101557)／フォーグッド(2019105076)／
ローンウルフ(2021104112)／ライジングハース(2022106495)／
エコログロス(2022101430)
— 全頭productionKnown=false。

### 3-5. JRA-20260809-NIIGATA-10（3歳以上1勝クラス、known=0/7）

モートンアイランド(2023107277)／ウップヘリーア(2023107228)／
オプレントジュエル(2022105365)／トラストモアリズム(2022101620)／
ミッドセンチュリー(2022103308)／テイキットイージー(2021101088)／
イスキオス(2022105223)
— 全頭productionKnown=false。

### 3-6. JRA-20260823-NIIGATA-10（3歳以上1勝クラス、known=0/12）

リポサンテ(2022105338)／モウエエデショー(2023105433)／
オルグジェシダ(2022104875)／イモータリス(2023107032)／
ウィンスタンリー(2022104684)／キョウエイグッド(2022104362)／
マイネルモメンタム(2021106811)／ラヴィニール(2023107047)／
スペードギニー(2022105191)／ルーリングクラス(2023103749)／
クラウドセイル(2020102552)／モルゲンゾンネ(2022102141)
— 全頭productionKnown=false。

---

## 4. Known Horse List by Race

2節の表と重複するため、レースごとのKnown頭数のみ再掲する（詳細は3節）:
新潟大賞典=13頭。他5レース=各0頭。

---

## 5. Unknown Horse List by Race

新潟大賞典=2頭（ドゥラドーレス／サフィラ）。
4歳以上1勝クラス=13頭全て。信濃川特別=16頭全て。尖閣湾特別=15頭全て。
3歳以上1勝クラス(8/9)=7頭全て。3歳以上1勝クラス(8/23)=12頭全て。
（完全な氏名・sourceHorseIdリストは3節参照。）

---

## 6. Category B 44頭とのOverlap

CHECKPOINT14D.1Fで確定したCategory B（44 unique horses / 50 rows）と、
今回の78頭をsourceHorseIdで突合した結果、**3頭が一致した。**

| horseName | sourceHorseId | canonicalHorseId | 該当candidateRace |
|---|---|---|---|
| バレエマスター | 2019104850 | 2019104850 | JRA-20260516-NIIGATA-11（新潟大賞典、2026-05-16） |
| グランドカリナン | 2020106234 | 2020106234 | JRA-20260516-NIIGATA-11（新潟大賞典、2026-05-16） |
| ラインベック | 2017105194 | 2017105194 | JRA-20260516-NIIGATA-11（新潟大賞典、2026-05-16） |

**3頭とも新潟大賞典（2026-05-16）にのみ集中している。** この3頭は、CHECKPOINT14D.1Fの
Prior History Request（`requiredPriorRaceId: EXTERNAL_DISCOVERY_REQUIRED`）の対象馬
そのものであり、もしこの2026-05-16新潟大賞典が正式にGate Raceとして採用されれば、
この馬たちのGate Race追加行と、CP14D.1F 8節で要求していたPrior History収集を、
**同一の外部収集作業でまとめて実施できる可能性がある**（同じレース1本を見に行けば、
Gate Race自体のデータと、対象馬のprior historyの両方に資する）。ただし、これは
効率化の可能性の指摘に留め、今回は実際の収集・確定は行っていない。

---

## 7. Existing V1 Race Overlap

既存10レース（`niigataTurf2000GateHistoryV1.json`、raceId 2021-2025）と、
今回のPhase1候補6レース（raceId 2026）を突合した結果、**raceId重複は0件。**
（2026年候補と2021-2025年既存レースで年が異なるため、自然な結果。）

runner単位（horse単位）の重複は6節のCategory B Overlapで扱った通り別問題であり、
race overlapとhorse overlapを混同していない。

---

## 8. Selection Rule Verification

**今回の依頼文が提示したタイブレークルール**
（`productionKnownHorseCount`降順 → `productionKnownHorseRate`降順 → `raceDate`新しい順）
は、CHECKPOINT14D.1E 3節で確定した正式Selection Rule
（`productionKnownHorseCount`降順 → `raceDate`新しい順、rateタイブレーク段階なし）
と**異なる**。

**既存正式Ruleを優先して適用した。** 理由と実際の影響:

- 今回のPhase1候補6件では、`productionKnownHorseCount=0`の5レース全てで
  `productionKnownHorseRate`も同様に0.000のため、rateタイブレークを追加しても
  **実質的な順位への影響は無い**（新潟大賞典が1位、残り5レースが同率という
  構造自体は変わらない）。
- ただし、**2026-05-17に同日2レース**（4歳以上1勝クラスraceNumber7・
  信濃川特別raceNumber10）が候補に含まれており、raceDateだけでは同着になる
  ケースが今回初めて発生した。CHECKPOINT14D.1Eの既存10レースは全raceDateが
  一意だったため、この「同日複数レース」ケースは想定されていなかった。
  結果非依存・決定的な追加サブタイブレークとして、**raceNumber昇順**を
  採用した（枠順・着順等のGate結果とは無関係な、レース番号という
  スケジュール上のメタデータのみを使用）。

---

## 9. Phase 2 推奨探索範囲

**新規固定閾値は発明していない。** 今回の実測結果から、以下のdiagnosticな
傾向のみを報告する:

- 6候補中、**重賞級（新潟大賞典）のみproductionKnownHorseCount=13/15（86.7%）**と高く、
  条件戦・特別戦（1勝クラス×2、信濃川特別、尖閣湾特別、4歳以上1勝クラス）は
  **全て0**だった。
- これは、現行production `data/horses/`の実データ収集が重賞・G1〜G3・Listed級の
  レース出走馬に集中していることの自然な帰結であり、同格の重賞レース
  （新潟記念・新潟大賞典自体の他年度）はKnown Coverageが高く、条件戦・特別戦は
  構造的に低い傾向が、この6件の実測から確認できる。

**推奨（結果を見て恣意的に決めたものではなく、この構造的傾向に基づく）**:
Phase2（2025・2024・2023以前の候補収集）では、新潟記念・新潟大賞典本体、および
その他重賞・Listed・OP級の新潟芝2000m outerレースを優先的に候補化することを
推奨する。条件戦・特別戦も収集対象から排除はしないが、Known Coverage改善への
寄与は低い可能性が高いことをdiagnosticとして記録する。

---

## 10. Regression

本ラウンドは`docs/`配下2ファイルの新規追加のみで、コード・実データは一切変更
していない。

```
npm test           → 全テスト成功（回帰無し）
npm run lint        → エラー無し
npm run build        → 型チェック+ビルド成功
npm run validate:data → 検証成功（既存無関係警告のみ）

Frozen Benchmark          → 70.3（変更なし）
Production Prediction Drift → 0（Provisional Stage A・Base Ability V1・
                                  Suitability V1・MemberLevel、いずれも不変）
Gate 10-Race Dataset        → 不変（niigataTurf2000GateHistoryV1.json未変更）
```

---

## 11. 判定

**A-PHASE1-SCORED**

6レースのinternal coverage計算完了。Attachment Integrity・sourceHorseId
cross-reference照合・Category B overlap・既存V1 race overlapの検証すべてに
問題は検出されなかった（B-CROSSREF・Cのいずれにも該当しない）。

---

## 12. 次にChatGPTが行う作業

1. **2025年**の新潟芝2000m外・既終了レース（新潟記念・新潟大賞典を含む重賞・
   Listed・OP級を優先）の候補Rosterを、同一Manifest形式（JSON+CSV、
   sourceHorseId必須）で収集する。
2. 続けて**2024年**、必要なら**2023年以前**の候補Rosterも同様に収集する。
3. 収集の優先順位は、9節のdiagnosticに基づき、重賞・Listed・OP級を条件戦・
   特別戦より先に収集することを推奨する。
4. 各Phaseで得られたRosterは、本ラウンドと同じ形式でClaude側へ提出し、
   productionKnownHorseCount/Rateの計算・Category B Overlap確認を継続する。
5. 追加20レースの最終確定は、複数Phase分のデータが揃った時点で改めて判断する
   （今回もまだ確定しない）。

STOP。additional 20 racesの最終確定・Gate実装・Stage A再計算・Formal Freeze・
Stage Bへは進まない。

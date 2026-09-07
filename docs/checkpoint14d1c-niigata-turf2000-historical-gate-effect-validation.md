# CHECKPOINT 14D.1C — Niigata Turf 2000 Historical Gate Effect Validation

添付ZIP: `niigata_turf2000_gate_history_v1.zip`（2021〜2025年の新潟大賞典・新潟記念、
10レース・153行）を監査・Dry Run・検証した記録。**重大な発見により、production
`data/horses/`への正式Importは今回見送り、Gate Effect検証はin-memory限定で
実施した。** 理由は7節で詳述する。

---

## 1. ZIP Integrity

```
CHECKSUMS.sha256: race_gate_history.csv OK / SOURCE_MANIFEST.csv OK /
                   PACKAGE_MANIFEST.json OK / README.md OK
```

5ファイルすべて展開・checksum一致を確認（`race_gate_history.csv`・
`SOURCE_MANIFEST.csv`・`PACKAGE_MANIFEST.json`・`README.md`・
`CHECKSUMS.sha256`）。内容は一切変更せずに監査した。

---

## 2. Schema Check

正式24列ヘッダーと**完全一致**（既存の production `parseCsv`/`buildImportResult`
を実際に通して確認。CSVは技術的にはUTF-8 BOM付き・CRLF改行だったが、既存
`csvParser.ts`は`.trim()`と`split(/\r?\n/)`でこれらを正しく吸収するため、
実運用上の問題は無いことを実コードで確認済み）:

```
raceId,raceDate,racecourse,raceNumber,raceName,surface,distance,going,courseLayout,courseVariant,horseId,horseName,horseNumber,gate,finishPosition,carriedWeightKg,actualRaceTimeSeconds,final3FSeconds,timeGapSeconds,fieldSize,passingPosition,source,sourceRaceId,sourceHorseId
```

`buildImportResult()`（既存・無変更）を実行した結果:

```
totalRows: 153 / normalizedCount: 153 / excludedFromScoringCount: 0 / errorCount: 0
```

---

## 3. Race / Runner Count

申告値をそのまま信用せず、Claude側で独立に再計算した:

| 項目 | 申告値 | 独立再計算 | 一致 |
|---|---|---|---|
| raceCount | 10 | 10 | ✅ |
| runnerRows | 153 | 153 | ✅ |
| horseId blank | 0 | 0 | ✅ |
| duplicate(horseId,raceId) | 0 | 0 | ✅ |
| future leakage rows | 0 | 0 | ✅ |

対象10レースはすべて新潟大賞典・新潟記念（2021〜2025年、各年1レースずつ計2回、
5年×2=10レース）。全行`racecourse=新潟, surface=turf, distance=2000,
courseLayout=outer`で完全一致（不一致0件）。

fieldSize/finishPosition整合性（レースごと）:

| raceId | raceName | raceDate | going | fieldSize | 行数一致 | finishPosition 1〜N完備 |
|---|---|---|---|---|---|---|
| JRA-20250517-NIIGATA-11 | 新潟大賞典 | 2025-05-17 | 稍重 | 16 | ✅ | ✅ |
| JRA-20250831-NIIGATA-11 | 新潟記念 | 2025-08-31 | 良 | 16 | ✅ | ✅ |
| JRA-20240505-NIIGATA-11 | 新潟大賞典 | 2024-05-05 | 良 | 16 | ✅ | ✅ |
| JRA-20240901-NIIGATA-11 | 新潟記念 | 2024-09-01 | 良 | 11 | ✅ | ✅ |
| JRA-20230507-NIIGATA-11 | 新潟大賞典 | 2023-05-07 | 不良 | 16 | ✅ | ✅ |
| JRA-20230903-NIIGATA-11 | 新潟記念 | 2023-09-03 | 良 | 14 | ✅ | ✅ |
| JRA-20220508-NIIGATA-11 | 新潟大賞典 | 2022-05-08 | 良 | 15 | ✅ | ✅ |
| JRA-20220904-NIIGATA-11 | 新潟記念 | 2022-09-04 | 良 | 18 | ✅ | ✅ |
| JRA-20210509-NIIGATA-11 | 新潟大賞典 | 2021-05-09 | 良 | 14 | ✅ | ✅ |
| JRA-20210905-NIIGATA-11 | 新潟記念 | 2021-09-05 | 良 | 17 | ✅ | ✅ |

raceId形式（`JRA-YYYYMMDD-NIIGATA-RR`）とraceDate/racecourse/raceNumberの
整合も全10レースで一致（不一致0件）。

**軽微な注記（1件、DATA ISSUEには該当しない）**: 2025新潟記念（horseNumber最大17、
fieldSize16）と2024新潟記念（horseNumber最大12、fieldSize11）で、各1頭ずつ
`horseNumber > fieldSize`が発生していた。独立調査の結果、これは
`PACKAGE_MANIFEST.json`の`exclusions`（2025新潟記念のクイーンズウォーク・
2024新潟記念のライトバック、いずれも「出走取消・実際には出走していない」）と
**正確に整合する**——各レースで欠けているhorseNumberが1つずつ（2025新潟記念は
6番、2024新潟記念は2番）あり、除外馬がその番号を持っていたと推測すれば
（JRAは出走取消後も馬番を振り直さない実務のため）矛盾なく説明できる。
データ欠陥ではない。

---

## 4. Future Leakage

CURRENT TARGET（2026-08-30、新潟記念）に対し、全153行が`raceDate < 2026-08-30`
（最新は2025-08-31）。future leakage行は**0件**。

---

## 5. Duplicate Check

正式dedup key `(horseId, raceId)`で153行すべてunique（重複0件）。

---

## 6. Existing Data Conflict

`npm run import:csv -- race_gate_history.csv --dry-run`（既存・無変更）を実行:

```
rows parsed: 153 / new race records: 153 / exact duplicates: 0 /
enrichment candidates: 0 / conflicts: 0 / errors: 0
```

129頭中51頭は既存`data/horses/`にファイルが存在（既存走数合計115走）、78頭は
新規。**conflictは1件も検出されなかった**——既存51頭の記録と今回の153行の
raceIdは完全に重複しない（silent overwriteのリスクは無し）。

---

## 7. 重大な発見: production Importが Provisional Stage Aを変更する

**Dry Run/Import自体はクリーンだったが、実際にproduction importを実行した後、
CURRENT TARGET（2026新潟記念11頭）のbaseAbilityを再計算したところ、
checkpoint本文が「変更禁止」と明記したProvisional Stage Aが実際に変動する
ことを発見した。**

原因: **MemberLevel Evidence機構**（既存・凍結、`buildRaceHistory()`内で
raceScore算出に使用）は、各過去走のraceScoreを算出する際、その走の
**対戦相手全体の実績データ**を横断的に参照する。今回インポートした153行の
うち51頭は、CURRENT TARGET 11頭の一部（過去走の対戦相手として登場する馬を
含む）と何らかの形で結びついており、対戦相手の実績データが追加された結果、
memberLevelScoreAtRace（→raceScore→baseAbility）が**11頭中9頭で連鎖的に
再計算された**——9頭自身の`data/horses/<horseId>.json`は一切変更していない
にもかかわらず、である。

実際にproduction importを実行して確認した変動（**その後この変更はrevertし、
production diskは元の状態に戻した**）:

| 馬名 | Base Ability 変化 | Stage A Score(表示) 変化 | Rank 変化 |
|---|---|---|---|
| ダノンシーマ | 78.3→78.4 | 80→80 | 1→1 |
| ロデオドライブ | 76.7→76.7 | 77→77 | 2→2 |
| ゾロアストロ | 74.8→74.8 | 74→74 | 3→3 |
| バレエマスター | 72.4→72.8 | 74→74 | 4→4 |
| ボーンディスウェイ | 73.1→73.2 | 73→73 | **6→5** |
| ジュンブロッサム | 72.7→72.7 | 73→73 | **5→6** |
| アーバンシック | 72.1→72.5 | **72→73** | 7→7 |
| サヴォーナ | 70.2→70.9 | **70→71** | 8→8 |
| ドゥレッツァ | 67.4→67.9 | **70→71** | 9→9 |
| チェルヴィニア | 69.1→69.3 | 70→70 | 10→10 |
| ステレンボッシュ | 69.4→69.7 | **68→69** | 11→11 |

**2箇所のRank入れ替え（5位/6位）と4頭の整数表示変化が発生する。** これは
checkpoint本文「Provisional Stage Aを保持...変更禁止」「今回のGate Audit結果を
見てStage Aをまだ再計算しない」に直接抵触する。

**対応**: `git checkout -- src/ability/data/horses/`および新規追加78ファイルの
削除により、**production diskを完全に元の状態へrevertした**（`git status`で
無変更を確認済み）。この後の全ての分析（8〜16節）は、**diskへ一切書き込まず、
CHECKPOINT12.2/12.3で確立済みの「in-memory検証専用」パターン**（既存の
`buildRaceHistory()`を、diskとは別のin-memoryデータセットに対して実行する
手法）を再利用して実施した。

---

## 8. Import / Cold Reload

**production disk import・Cold Reloadは実施していない**（7節の理由）。
代わりに、in-memoryでのみ153行を既存データへマージし、`mergeHorseRaceHistory()`
（既存・無変更）で0 conflictsを再確認した上で、`buildRaceHistory()`
（既存・無変更）を1回だけin-memory実行し、以降の分析すべての入力とした。
このin-memory計算結果はどこにも永続化していない。

---

## 9. Ability Control Coverage

CHECKPOINT14D.1Bの`ABILITY_CONTROL_RECONSTRUCTABLE = true`をin-memoryで
実証した——`collectGateHorseEvidenceDeltas`と同じロジック
（`calculateAbilityBeforeRace`、既存・凍結）を、そのレースより厳密に前の
走のみを使って153行すべてに適用した。

```
Gate History 153行中、abilityBeforeRace算出可能（=Ability Control適用可能）: 31行（20.3%）
```

**残り122行（79.7%）はabilityBeforeRace算出不可（None）。** 理由: 129頭中78頭が
今回のZIPで初めてrepositoryに登場する馬であり、その馬にとって「このGate
History行より前の実データ」が1件も存在しないため（既存78頭が0走だった
ことは6節で確認済み）。この場合、既存仕様通り**50点等の推測補完は一切
行っていない**（"unavailable"として除外、22節相当）。

---

## 10. Raw Frame Statistics（全153行、能力未統制）

| frame | starts | wins | winRate | top2Rate | top3Rate | avgFinish | avgNormFinish |
|---|---|---|---|---|---|---|---|
| 1 | 16 | 1 | 6.3% | 6.3% | 12.5% | 8.81 | 0.523 |
| 2 | 16 | 1 | 6.3% | 6.3% | 6.3% | 10.44 | 0.624 |
| 3 | 18 | 2 | 11.1% | 16.7% | 22.2% | 7.89 | 0.487 |
| 4 | 19 | 2 | 10.5% | 10.5% | 10.5% | 9.42 | 0.570 |
| 5 | 20 | 0 | 0.0% | 5.0% | 15.0% | 9.15 | 0.568 |
| 6 | 20 | 1 | 5.0% | 20.0% | 25.0% | 6.90 | 0.420 |
| 7 | 21 | 0 | 0.0% | 9.5% | 23.8% | 7.52 | 0.452 |
| 8 | 23 | 3 | 13.0% | 26.1% | 34.8% | 6.78 | 0.405 |

raw statsだけを見ると、8枠（外）がwinRate/top3Rate/avgNormFinishいずれも
最も良く、2枠が最も悪いという「外枠有利」に見えるパターンが確認できる。
**ただし、これは12節の通り強い馬の枠分布に影響されている可能性があり、
raw statsのみでGate Suitabilityを作らない（checkpoint本文の明示的指示）。**

---

## 11. Horse Number / Normalized Gate Statistics

`normalizedGatePosition = (horseNumber-1)/(fieldSize-1)`（既存
`calculateRelativeGatePosition`と同じ定義）で3分位バケット化:

| バケット | n | winRate | top3Rate | avgNormFinish |
|---|---|---|---|---|
| inner (0.00-0.33) | 53 | 9.4% | 15.1% | 0.532 |
| middle (0.33-0.67) | 47 | 2.1% | 14.9% | 0.538 |
| outer (0.67-1.00) | 51 | 7.8% | 29.4% | 0.426 |

raw statsではouterバケットのtop3Rate（29.4%）がinner/middle（約15%）の
ほぼ2倍——一見強い傾向に見える。

---

## 12. Ability-adjusted Residual（最重要）

`residual = raceScore（実際の走破後スコア） − abilityBeforeRace（その走以前の
実力水準）`。**Ability Control適用可能な31行のみ**で算出（future leakage無し、
9節）。

```
全体: n=31, mean residual=-0.68, stdev=9.47
```

stdev（9.47）がmeanの絶対値（0.68）の**14倍**——ばらつきが極めて大きく、
全体平均は実質的にゼロと区別がつかない。

frame別:

| frame | n | mean residual | stdev |
|---|---|---|---|
| 1 | 4 | +2.68 | 3.20 |
| 2 | 2 | -6.85 | 8.13 |
| 3 | 2 | -0.65 | 4.74 |
| 4 | 6 | +1.25 | 7.45 |
| 5 | 4 | -2.38 | 9.19 |
| 6 | 4 | -2.38 | 15.13 |
| 7 | 4 | +0.45 | 6.78 |
| 8 | 5 | -1.42 | 16.13 |

normalizedGatePositionバケット別（Ability-adjusted）:

| バケット | n | mean residual | stdev |
|---|---|---|---|
| inner | 9 | -0.18 | 5.59 |
| middle | 12 | -2.32 | 9.61 |
| outer | 9 | **+2.17** | 12.28 |

**10節・11節の「外枠有利」に見えたraw傾向は、Ability Control後は明確な
形で再現しない。** outerバケットのmean residual（+2.17）は確かに正だが、
標準誤差は約`12.28/√9 ≈ 4.1`——+2.17という値は1標準誤差程度に収まり、
ゼロと統計的に区別できない。frame別の内訳（frame1=+2.68〜frame6=-2.38の
間で単調な傾向が無く、n=2〜6の極小サンプルごとにばらついている）も、
「外側ほど有利」という滑らかな構造を裏付けていない。

**これはまさにchekpoint本文が警告した「強い馬がたまたま特定枠へ集まった
影響を枠効果と誤認しない」という懸念が、実データで具体的に裏付けられた
ケースである。** raw statsだけを見ていたら「外枠有利」と誤認するリスクが
あったが、Ability Controlで大幅に弱まった。

---

## 13. Sample Size / Confidence

既存`resolveHorseEvidenceConfidence`の閾値（0=unknown/1-2=low/3-4=medium/
5+=high）をそのまま適用すると、12節のframe別n（2〜6）・バケット別n（9〜12）は
いずれも**low〜medium相当**に留まる。「1枠3勝だから内枠有利」のような
短絡は、今回のデータでは行っていない。

---

## 14. Shrinkage

既存`shrinkTowardCenter`（`adjusted = 100 + (raw-100) × confidenceWeight`、
low=0.3）の思想をそのまま適用すれば、12節の各バケットのmean residual
（inner -0.18・middle -2.32・outer +2.17）は、confidence=low相当の
重み（0.3程度）でさらに中立へ圧縮される——例えばouterの+2.17は
実質+0.65程度まで縮小される計算になる。新規のmagic coefficientは
提案・実装していない（既存の考え方を仮に当てはめた場合の参考値のみ）。

---

## 15. Going / Race Class Limitations

Going分布（153行）: 良121・稍重16・不良16。今回は分割せず全体で分析した
（checkpoint本文の指示通り）。レース格は新潟大賞典・新潟記念（GIII）のみ
（10節）——高クラス限定のサンプルであり、条件戦・OP等を含む新潟芝2000m
全体への一般化はできない（checkpoint本文が事前に警告していた制約通り）。

---

## 16. Gate Effect Result

**C. INSUFFICIENT**

Ability Control適用可能な行が31/153（20.3%）に留まり、frame別n=2〜6・
バケット別n=9〜12という極小サンプルでは、raw statsで見えた「外枠有利」の
方向性がAbility Control後は統計的に安定しない（12節）。10レースパイロットの
既知の限界（checkpoint本文4節）そのままの結果であり、**「Gate Effectは
無い」と断定することも、「Gate Effectがある」と断定することも、現時点の
データでは正当化できない。** Neutralと確定するにも、Signalと確定するにも
サンプルが足りない。

---

## 17. Provisional Stage Aへの想定影響（Score変更はしていない）

7節の通り、実際にimportした場合の影響はすでに測定済み（Score変更は
行わずrevert済み）。もし将来正式にimportする場合、影響し得る馬は
ボーンディスウェイ・バレエマスター（自身の過去走に今回のraceIdが直接
追加される）に加え、対戦相手経由でmemberLevelが再計算される9頭
（ダノンシーマ・ロデオドライブ・ドゥレッツァ・ゾロアストロ・
チェルヴィニア・ジュンブロッサム・アーバンシック・サヴォーナ・
ステレンボッシュ）——**実質11頭全馬**。ただし変動幅は全て±1点未満
（baseAbility）で、内訳は7節の表の通り。今回はGate Effect自体が
INSUFFICIENT（16節）のため、たとえ上記の変動を受け入れてimportしても
「Gate補正込みのStage A」を作る根拠には至らない。

---

## 18. Regression

production diskを完全にrevertした状態で実行:

```
npm run validate:data   → 検証成功（エラーなし、既存の警告のみ）
npm test                → Test Files 74 passed / Tests 775 passed
npm run lint            → エラー無し（scratch削除後）
npm run build            → 成功
Frozen Benchmark         → 70.3（3 tests passed）
```

`git status --short`で確認: **本ラウンドの最終状態で、`src/ability/data/horses/`
配下は1バイトも変更されていない**（新規追加ゼロ）。Base Ability V1・
Suitability V1・MemberLevel・Historical Position Profile V1・Race Pace
Prediction V1・`raceLapData.json`・Provisional Stage A Snapshot
（CHECKPOINT14D）はすべて無変更。追加されたのは本報告書のみ。

---

## 19. 判定

**C**（ただし性質を正確に区別する）

- **ZIPのデータ品質そのものはA級**（Integrity/Schema/Dedup/Leakage/
  Field Consistencyすべてクリーン、SOURCE_MANIFESTとの整合も完全一致、
  唯一のhorseNumber異常も除外馬記録と整合して説明可能）。
- **C判定の理由は「production importがcheckpoint本文の明示的な
  制約（Provisional Stage A変更禁止）と衝突する」という、今回の
  regressionチェック（18節相当の事前確認、7節）で発見した構造的な
  問題**——ZIPのデータ欠陥ではなく、MemberLevel機構（既存・凍結）が
  「無関係に見えるHistorical Data」でも対戦相手経由でBase Abilityへ
  波及するという、この設計の既知の帰結を実地で確認した形。
- **Gate Effect自体は別途C(INSUFFICIENT)**——たとえimport可否の問題が
  解決しても、31行のAbility-adjusted sampleでは正式なSignal/Neutral判定に
  届かない。

---

## 20. 次にChatGPTと決める必要がある項目（優先順位順）

1. **【最重要】Provisional Stage A変更を許容するかどうかの方針決定**:
   production importを実行すると、7節の通りCURRENT TARGET 11頭中9頭の
   baseAbilityがMemberLevel経由でわずかに変動し（全て±1点未満）、
   Stage A Rankが2箇所（5位/6位）入れ替わり、整数表示が4頭変わる。
   これを「より正確な実データが増えた結果として受け入れる」か、
   「Formal Stage A Freezeまでは一切Historical Dataをimportしない」かの
   判断が必要。今回は後者の解釈で安全側に倒し、importをrevertした。
2. **上記が「受け入れる」なら**: 同じZIP（`niigata_turf2000_gate_history_v1.zip`）を
   そのままproduction importできる（conflict 0件、integrity済み）。
3. **Gate Effect検証の継続方針**: 16節のINSUFFICIENT判定を受け、
   recommended=30レースへの拡張が必要かどうか。ただしAbility Control
   適用率が20.3%（31/153）に留まった実績を踏まえると、単純にレース数を
   3倍にしても、同じ比率ならAbility-adjusted sampleは約93行程度に
   留まる見込み——確度を上げるには「同一馬が複数回出走している」
   パターンを意図的に増やす収集方針（例: 過去の新潟大賞典/新潟記念
   常連馬を優先）が有効な可能性がある。
4. **MemberLevelのripple effectを構造的に回避する設計の要否**:
   「Historical Validation専用データ」と「Production Base Ability計算に
   使うデータ」を完全に分離するアーキテクチャ変更（例: 別データストア）を
   検討するか、それとも今回のように都度revert/in-memory検証で対応する
   運用を継続するか。

以上、CHECKPOINT14D.1Cの範囲でSTOPします。Gate Suitability実装・
Stage A再計算・Formal Stage A Freeze・Stage Bへは着手していません。

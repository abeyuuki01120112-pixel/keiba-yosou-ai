# WEEKLY LIVE PREDICTION PREP V1 — セントウルS / 京成杯AH（開催条件修正・entry list登録）

**作成日**: 2026-09-03
**位置づけ**: `docs/weekly-live-prediction-prep-v0-centaur-keisei.md`の
訂正・続き。ChatGPT側が確認した2026年正式開催条件・entry listを反映する。

**結論を先に明記する**: セントウルSの開催条件を**阪神・芝1200m**（前回の
中京芝1200mは誤り、無効）へ訂正した。両レースのPROVISIONAL ENTRY LIST
（各16頭）をproduction dataとは別の`src/ability/data/provisional/`配下へ
登録した。**horseId identity照合の結果、32頭中production
`data/horses/`に実在が確認できたのは1頭（京成杯AH・サイルーン）のみ**
だった。残り31頭は現在のプロジェクトデータには一切存在せず、**NOT READY**
として正直に分類する。courseTimeBaseline再監査の結果、阪神芝1200mは
部分的に存在する（ただし出典自身が「暫定candidate」と明記する未成熟な
データ）が、中山芝1600mは完全に存在しない。

既存Frozen Prediction Logic（Base Ability V1・Suitability V1・
memberLevel・final3F・finalRaceAbility・Plackett-Luce・Temperature）は
一切変更していない。Formal Stage Aへは移行していない（枠番・馬番未確定の
ため、PROVISIONAL ENTRY LISTとしてのみ登録）。

---

## 1. 2026年開催条件の修正結果

| 項目 | セントウルS（訂正後） | 京成杯AH |
|---|---|---|
| raceId（内部） | JRA-20260906-HANSHIN-11 | JRA-20260905-NAKAYAMA-11 |
| sourceRaceId | 202609040211 | 202606040111 |
| raceDate | 2026-09-06 | 2026-09-05 |
| racecourse | 阪神 | 中山 |
| surface | turf（芝） | turf（芝） |
| distance | 1200m | 1600m（外回り） |
| クラス | 3歳以上オープン・別定 | 3歳以上オープン・ハンデ |
| 格 | GII（第40回産経賞セントウルステークス） | GIII（第71回） |

**sourceRaceIdのトラックコード整合性を確認した**: netkeiba形式raceId
（`YYYY-トラックコード2桁-開催回2桁-開催日2桁-レース番号2桁`）の
トラックコード部分（セントウルS=09、京成杯AH=06）は、それぞれ
阪神・中山の公式トラックコードと一致する。**raceNumber=11は、
sourceRaceIdの末尾2桁から推定した値であり、公式番組表を個別に
確認したものではない**——今回の監査ではraceScore/baseAbility計算に
raceNumberを使わないため実害は無いが、記録として明記する。

`courseVariant: "外回り"`（京成杯AH）は、既存の`CourseTimeBaseline`・
`CourseFinal3FBaseline`型に対応するフィールドが存在しない
（両型ともracecourse×surface×distance×goingのみで、内回り/外回りの
区別を持たない）。参考記録として`provisional`データへ保持するのみで、
既存lookup関数へは一切影響しない（既存型・既存lookup関数は無変更）。

**production dataへの反映**: 上記のrace identityは
`src/ability/data/provisional/centaur-stakes-2026-registered.json`・
`src/ability/data/provisional/keisei-hai-autumn-handicap-2026-registered.json`
として新規登録した（2026新潟記念の`niigata-kinen-2026-registered.json`と
同じ形式・同じ分離思想——production Ability計算パイプラインからは
参照されない、登録段階の記録専用ファイル）。

---

## 2. セントウルS 16頭 identity照合結果

| 馬名 | 性齢 | 斤量 | production horseId | 照合結果 |
|---|---|---|---|---|
| カルプスペルシュ | 牝4 | 55.0kg | 該当なし | **NOT READY** |
| クラスペディア | 牡4 | 57.0kg | 該当なし | **NOT READY** |
| ダイヤモンドノット | 牡3 | 55.0kg | 該当なし | **NOT READY** |
| タマモイカロス | 牡3 | 55.0kg | 該当なし | **NOT READY** |
| タマモブラックタイ | 牡6 | 57.0kg | 該当なし | **NOT READY** |
| ティニア | 牡6 | 57.0kg | 該当なし | **NOT READY** |
| ビッグシーザー | 牡6 | 57.0kg | 該当なし | **NOT READY** |
| ピューロマジック | 牝5 | 55.0kg | 該当なし | **NOT READY** |
| ファストネットワーク | せん6 | 57.0kg | 該当なし（香港馬） | **NOT READY** |
| フリッカージャブ | 牡4 | 57.0kg | 該当なし | **NOT READY** |
| プロトポロス | 牡6 | 57.0kg | 該当なし | **NOT READY** |
| ママコチャ | 牝7 | 56.0kg | 該当なし | **NOT READY** |
| メイショウヨゾラ | 牝5 | 55.0kg | 該当なし | **NOT READY** |
| ヤブサメ | 牡5 | 57.0kg | 該当なし | **NOT READY** |
| ヨシノイースター | 牡8 | 57.0kg | 該当なし | **NOT READY** |
| レッドモンレーヴ | 牡7 | 57.0kg | 該当なし | **NOT READY** |

**セントウルS 16頭中、production `data/horses/`に実在が確認できた馬は
0頭。**

### 照合方法（実際に行った確認手順）

1. `src/ability/data/horses/`配下447ファイルには、`horseName`
   フィールド自体が保存されていないことを確認した（`RacePerformance`型に
   horseNameが存在しないため）。したがって、ファイル名（horseId）から
   直接馬名を引くことはできない。
2. 名前が確認できる既存の実データソース（`src/simulation/data/sapporoKinen.json`
   の16頭ロースター、既存の永続化済みFormal Prediction Snapshot、
   `docs/checkpoint14d1*.json`のcandidate crossrefファイル群）を対象に、
   16頭全馬の名前で全文検索した。
3. いずれの馬名も一致しなかった。

**推測での紐付けは一切行っていない**（同名誤認防止のため、確実な
一致が確認できた場合のみsourceHorseIdを設定する方針を貫いた）。

---

## 3. 京成杯AH 16頭 identity照合結果

| 馬名 | 性齢 | 斤量 | production horseId | 照合結果 |
|---|---|---|---|---|
| ヴァルキリーバース | 牝4 | 55.5kg | 該当なし | **NOT READY** |
| エコロブルーム | 牡5 | 58.0kg | 該当なし | **NOT READY** |
| クランフォード | 牝5 | 55.0kg | 該当なし | **NOT READY** |
| クルゼイロドスル | 牡6 | 57.0kg | 該当なし | **NOT READY** |
| **サイルーン** | せん7 | 57.0kg | **2019104838** | **PARTIAL** |
| ディールメーカー | 牡3 | 54.0kg | 該当なし | **NOT READY** |
| テレサ | 牝4 | 55.0kg | 該当なし | **NOT READY** |
| ドロップオブライト | 牝7 | 56.5kg | 該当なし | **NOT READY** |
| ピコローズ | 牝4 | 53.0kg | 該当なし | **NOT READY** |
| ファンダム | 牡4 | 57.0kg | 該当なし | **NOT READY** |
| フォルテアンジェロ | 牡3 | 55.0kg | 該当なし | **NOT READY** |
| ミナデオロ | 牡5 | 56.0kg | 該当なし | **NOT READY** |
| メタルスピード | 牡6 | 55.0kg | 該当なし | **NOT READY** |
| ラケマーダ | 牡6 | 56.0kg | 該当なし | **NOT READY** |
| リラボニート | 牝5 | 54.0kg | 該当なし | **NOT READY** |
| レザベーション | 牡3 | 55.0kg | 該当なし | **NOT READY** |

**京成杯AH 16頭中、production `data/horses/`に実在が確認できた馬は
1頭（サイルーン）のみ。**

### サイルーンの照合根拠（実際に確認した内容）

`docs/checkpoint14d1f-niigata-turf2000-v2-collection-manifest.json`の
既存クロスリファレンスに`{"horseId": "2019104838", "horseName": "サイルーン",
"existingProductionFile": true}`という記録があり、実際に
`src/ability/data/horses/2019104838.json`が存在することをファイル読み込みで
確認した。内容は2走のみ（2026-03-01中山記念・中山turf1800m・7着、
2026-04-04ダービー卿チャレンジトロフィー・中山turf1600m・2着）——
**5走に満たない短キャリアデータのため、READYではなくPARTIALに分類する**
（Base Ability自体は算出可能だが、直近5走中2走のみでconfidenceが
低くなる、既存のshortCareer扱いと同種の状態）。

---

## 4. READY / PARTIAL / NOT READY一覧（全32頭）

| 分類 | 頭数 | 内訳 |
|---|---|---|
| READY | 0頭 | 該当なし |
| PARTIAL | 1頭 | サイルーン（京成杯AH、production 2走のみ） |
| NOT READY | 31頭 | 上記以外全馬 |

---

## 5. 各馬の不足データ

- **NOT READY 31頭**: production `data/horses/`に該当ファイルが
  一切存在しない。過去走・final3F・timeGap・actualRaceTime・
  memberLevel evidenceのすべてが欠損。
- **PARTIAL 1頭（サイルーン）**: production側に2走のみ（5走に満たない）。
  `RECENT_RACE_COUNT=5`未満のため、Base Ability自体は算出可能だが
  shortCareer扱い（低confidence）になる見込み。
- **ファストネットワーク（香港馬）について**: 既存ルールのみで判定した
  結果、他のNOT READY馬と**同じ理由**（production側に該当ファイルが
  無い、abilityBeforeRace算出に使える実データが0件）でNOT READYに
  分類される。「外国馬だから」という特別な理由付けや、この馬専用の
  新しい例外ルールは作っていない——`structural_no_prior_history`
  （対戦馬全員がキャリア初戦の場合の既存の特別扱い）は本馬には該当しない
  （そもそも本馬自身の過去走データが無く、対戦馬全員の状況を云々する
  以前の段階）。

---

## 6. 阪神芝1200m courseTimeBaseline coverage

`src/ability/data/courseTimeBaselines.json`を実際に確認した結果:

| going | 存在 | 詳細 |
|---|---|---|
| 良 | **AVAILABLE（ただし暫定）** | `sampleYears=2, sampleCount=5, medianTimeSeconds=68.4`。sourceフィールドに`"verified_sample_pool_only NOT_final_5y_baseline 暫定candidate"`と明記されており、**正式な5年基準タイムとしてはまだ未成熟**な状態。 |
| 稍重 | **AVAILABLE（ただし暫定）** | `sampleYears=2, sampleCount=2, medianTimeSeconds=68.6`。同様に暫定candidateかつsampleCount=2と少ない。 |
| 重 | **MISSING** | 該当行なし |
| 不良 | **MISSING** | 該当行なし |

**中京芝1200mについて過去に監査した内容は、今回は一切使用していない**
（ユーザー指示の通り、無効な監査として破棄した）。

---

## 7. 中山芝1600m courseTimeBaseline coverage

`src/ability/data/courseTimeBaselines.json`を確認した結果、
**中山1600mの行は1件も存在しない（全going共通でMISSING）**。
既存の中山エントリは1900m・2100mのみ（`docs/weekly-live-prediction-prep-v0-centaur-keisei.md`
STEP4参照）。外回り/内回りの区別自体が既存スキーマに存在しないため、
仮に1600mの行が今後追加されても、外回り限定のbaselineとして区別する
機構は無い（既存の型・lookup関数の制約、今回変更せず）。

---

## 8. courseFinal3FBaseline coverage

`src/ability/data/courseFinal3FBaselines.json`を確認した結果:

| 条件 | 存在 |
|---|---|
| 阪神 turf 1200m（全going） | **MISSING**（該当0件） |
| 中山 turf 1600m（全going） | **MISSING**（該当0件） |

両レースとも、final3FScoreの絶対評価に使うbaselineが無い
——既存仕様通り、final3FScoreはレース内相対評価100%へフォールバックする
見込み（新規に計算式を変更する提案ではなく、既存フォールバック仕様の
確認のみ）。

---

## 9. Provisional Base Ability計算可能頭数

**現時点で0頭（正式に5走ベースで算出可能な馬は存在しない）。**
サイルーンのみ、2走ベースでのshortCareer扱いのBase Ability算出が
理論上可能（ただし今回のラウンドでは実際に計算を実行していない
——枠順未確定のPROVISIONAL段階のため、`buildGateConfirmedSnapshot()`
等の正式呼び出しはまだ行っていない）。

---

## 10. Provisional Suitability計算可能頭数

**0頭。** Suitability V1の4component（distance/course/going/gate）は
いずれも対象馬自身の過去走データを必要とするが、31頭は過去走自体が
0件、サイルーンも新潟記念・京成杯AHそのものの条件（中山芝1600m）との
一致有無を確認できる過去走が無い（保有する2走はいずれも中山だが、
1走は芝1800m、もう1走は芝1600mで京成杯AH自体と条件が一致——ただし
distance/courseのcomponent評価には別途computeSuitabilityV1()を実際に
実行する必要があり、今回は未実施）。

---

## 11. Formal Stage Aへ進むためにあと何が必要か

1. **枠番・馬番の正式確定**（現在のentry listは登録段階、枠順未確定）。
2. **正式斤量・騎手の確定**（斤量は既にentry listにあるが、変更の
   可能性を排除できない段階）。
3. **32頭中31頭（サイルーン以外全馬）のproduction horse historyの
   新規収集・取り込み**——これが最大のブロッカー。少なくとも直近数走の
   実データ（finishPosition・timeGap・actualRaceTime・final3F・
   carriedWeight）がなければBase Abilityが算出できない。
4. 阪神芝1200m・中山芝1600mのcourseTimeBaseline・courseFinal3FBaseline
   の追加整備（無くても計算自体はfallbackで進行可能だが、精度向上のため）。

---

## 12. Windows/JRA-VAN導入で解決できる不足

- 32頭の過去走データの自動取得（最大のブロッカー、11節3.）。
- 枠番・馬番・正式斤量の自動反映（速報データ経由）。
- courseTimeBaseline・courseFinal3FBaselineの過去5年分データの
  体系的収集（ただしJV-Link導入だけで自動的に「5年分の基準タイム表」が
  完成するわけではなく、別途集計処理の実装が必要——今回は範囲外）。

**解決しない不足**: ファストネットワークのような外国馬のJRA形式
prior historyは、JV-Link経由でも国内競走のデータしか取得できない
可能性が高く、別途の国際レース対応（香港競馬のデータソース連携等）が
必要になる見込み——これは今回のRunbookの範囲外の新規課題として記録する。

---

## 13. 今週の予想を現状データで進められるか

**進められない。** 32頭中31頭がNOT READY（production
`data/horses/`に一切データが無い）であり、Base Ability自体が
算出不能なため、Stage A・Suitability・finalRaceAbility・勝率の
いずれも生成できない。**ChatGPT側からの追加データ提供
（32頭のうち可能な限り多くの直近実績データ）が無い限り、今週の
セントウルS・京成杯AHへの正式Prediction生成は不可能である。**

---

## Regression

新規追加は以下のみ（production Ability計算コード・既存data/horsesは
無変更）:

```
新規:
  src/ability/data/provisional/centaur-stakes-2026-registered.json
  src/ability/data/provisional/keisei-hai-autumn-handicap-2026-registered.json
  docs/weekly-live-prediction-prep-v1-centaur-keisei-corrected.md
変更:
  docs/weekly-live-prediction-prep-v0-centaur-keisei.md（正誤表追記のみ、本文無変更）
```

```
npm test            → 既存822件、回帰なし
npm run lint         → PASS
npm run build         → PASS
npm run validate:data → 検証成功（既存warningのみ、provisionalディレクトリは
                        production globの走査対象外のため新規警告なし）
```

---

以上、Provisional Prediction Preparationの範囲でSTOPします。当日オッズを
使った最終予想・正式Stage A Freeze・正式Prediction生成は、32頭の
production historyデータが揃うまで行いません。

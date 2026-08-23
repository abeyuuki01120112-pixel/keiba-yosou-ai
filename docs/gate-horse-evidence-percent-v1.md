# gate HorseEvidence → percent 正式式（CHECKPOINT11.5・実装・B判定）

**作成日: 2026-08-23。ステータス: 実装済み・B判定（暫定パラメータ1件あり）。
effectiveAbility本番接続は未実施。**

CHECKPOINT11.4で比較・推奨した「rawPerformanceDelta＋tanh飽和変換」を正式式として
実装した。`src/ability/suitabilityV1.ts`の`computeGateSuitabilityV1()`を、
CoursePrior専用の暫定実装から、HorseEvidence優先・CoursePriorは監査用フォールバックの
実装へ差し替えた（`suitability.ts`・`suitabilityCoreV1.ts`・`finalRaceAbility.ts`・
Ability Model V1関連ファイルは無変更）。

---

## STEP1: tanh正式候補式

```
percent = 100 + amplitude × tanh(aggregatedDelta / scale)
aggregatedDelta = median(rawPerformanceDelta_i)
rawPerformanceDelta_i = raceScore_i − abilityBeforeRace_i
```

`abilityBeforeRace_i`は対象走より厳密に前の直近最大5走から`calculateAbilityBeforeRace()`
（Ability Model V1凍結済み、無変更）で算出する。マッチ条件は
`horseGateEvidence.ts`と同一（racecourse×surface×distance完全一致）。

## STEP2〜3: amplitude/scale比較・実データ分布

実データ（`data/horses/`全40頭、同一馬×同一racecourse×surface×distanceへの
再訪問）から、グループ単位（馬×条件）でaggregatedDelta（中央値）をn=7件算出し
（全走単位ではn=11）、指定のamplitude[3,4,5,6,8]×scale[1.5,2.0,2.5,3.0,4.0]の
25通り全てにpercent分布を適用した。

**全25通りの結果、90未満・110超は一度も発生しなかった。** これは偶然ではなく、
tanhが±1に飽和するため`amplitude`が理論上の最大乖離幅を保証するという数学的性質
による（amplitude=8でも理論上限は108/92であり、110/90を超えようがない）。

95未満・105超の発生状況（グループ単位n=7）:

| amplitude | scale | <95 | >105 |
|---|---|---|---|
| 3 | 全scale | 0/7 | 0/7 |
| 4 | 全scale | 0/7 | 0/7 |
| **5** | **全scale** | **0/7** | **0/7（scale≥2で最大値ちょうど105.0、超過なし）** |
| 6 | 全scale | 0/7 | 3〜5/7（**過補正**） |
| 8 | scale=1.5のみ1/7、他0/7 | 0〜1/7 | 4〜6/7（**過補正**） |

amplitude=6以上は、この実データでは半数超のグループが105を超え、STEP4の
「105超が大量に出る場合は注意」に抵触する。**amplitude=5が、実データ上105を
一度も超えない最大候補である。**

Base Ability=70参考値（`70 × percent / 100`）は amplitude=5・scale=3の場合で
最小95.0%→66.5、最大105.0%→73.5の範囲に収まる（下記STEP9参照）。

## STEP4: 過補正基準の適用

- amplitude=6・8: 105超が3〜6/7件（43〜86%）発生し、**過補正候補として不採用**。
- amplitude=3・4: 105を一度も超えず安全だが、実データの中央値delta(4.2〜5.2)に
  対する反応がやや平坦（amplitude=3では最大でも103.0%止まり）——「枠は微調整」
  という思想には合うが、意味のある差を表現しきれていない可能性がある。
- **amplitude=5**: 105ちょうどで頭打ちになり、95未満・110超・105超のいずれも
  発生しない、実データ上もっとも大きく反応しつつ過補正にならない値。

## STEP5: 感度分析

代表的な候補（amplitude/scale）でaggregatedDelta=[-8,-5,-3,-2,-1,0,1,2,3,5,8]に
対するpercentを確認した:

```
amp=3 scale=2.5: -8→97.0 -5→97.1 -3→97.5 -2→98.0 -1→98.9 0→100.0 1→101.1 2→102.0 3→102.5 5→102.9 8→103.0
amp=4 scale=3.0: -8→96.0 -5→96.3 -3→97.0 -2→97.7 -1→98.7 0→100.0 1→101.3 2→102.3 3→103.0 5→103.7 8→104.0
amp=5 scale=3.0: -8→95.0 -5→95.3 -3→96.2 -2→97.1 -1→98.4 0→100.0 1→101.6 2→102.9 3→103.8 5→104.7 8→105.0
amp=5 scale=4.0: -8→95.2 -5→95.8 -3→96.8 -2→97.7 -1→98.8 0→100.0 1→101.2 2→102.3 3→103.2 5→104.2 8→104.8
amp=6 scale=4.0: -8→94.2 -5→94.9 -3→96.2 -2→97.2 -1→98.5 0→100.0 1→101.5 2→102.8 3→103.8 5→105.1 8→105.8
```

小さいdelta（±1〜2）には緩やかに反応し（amp=5,scale=3で+1→101.6%）、
大きいdelta（±5〜8）ではamplitudeの上限（±5）へ飽和する——「小さい差には
控えめに、極端な差でも青天井にならない」という設計意図通りの挙動を確認した。

## STEP6: confidence shrinkとの順序（方式A vs 方式B）

**方式A**（percent変換 → confidence shrink、採用）と**方式B**（delta自体を
confidence shrink → percent変換）を数値で比較する。

例: aggregatedDelta=20（極端値）、amplitude=5、scale=3、confidence=low（weight=0.3）。

- 方式A: `raw = 100 + 5×tanh(20/3) = 100 + 5×0.99999 ≈ 105.0`。
  `adjusted = 100 + (105.0−100)×0.3 = 101.5`。
- 方式B: `deltaShrunk = 20×0.3 = 6`。`percent = 100 + 5×tanh(6/3) = 100 + 5×0.964 ≈ 104.8`。

**方式Bは「深さを縮小したはず」なのに104.8と、方式Aの101.5より大きい値になる**
——tanhによる飽和がshrink後の値に対しても部分的に効いてしまうため、
「confidenceが低いほど100に近づく」という保証を方式Bは持たない。

一方、方式A は`adjustedPercent`が常に`[100 − amplitude×weight, 100 + amplitude×weight]`
に収まることを構造的に保証する（`shrinkTowardCenter`の定義そのものであり、
distance/course/going・gate-CoursePrior分岐も含め、既存の全componentが
採用している唯一のパターンでもある）。

**推奨: 方式A。** 解釈しやすさ・既存設計との整合性・過補正防止のいずれにおいても
方式Bに優る。新しい`shrinkDelta()`のような並行ロジックを作らずに済む点も、
「既存ロジックを複製しない」という一貫方針に合致する。**実装済み。**

## STEP7: confidence統一案（結論のみ、実装せず）

CHECKPOINT11.4で示した不一致（sampleCount=2/4での境界差）を維持したまま、
以下を最終比較する。

| 案 | 内容 | 判定 |
|---|---|---|
| 案A | Suitability側の閾値をHorseEvidence側（0=unknown/1-2=low/3-4=medium/5+=high）へ統一 | **推奨**。HorseEvidence V1の閾値は凍結仕様、Suitability側（`baseConfidenceFromSampleCount`）は凍結対象外のため、変更不可能な側に合わせる方が既存の凍結ルールと矛盾しない |
| 案B | Suitability既存定義へHorseEvidenceを合わせる | 不採用。HorseEvidence V1凍結仕様（`docs/horse-evidence-v1.md`）の変更が必要になり、STOP条件に抵触する |
| 案C | 内部4段階／UI3段階 | 不十分。境界値（sampleCount何走からmediumか）の不一致は計算レベルの問題であり、表示層の統一だけでは解消しない |

**正式統一案: 案A。** ただし閾値変更自体は今回実装しない（`suitabilityConfidence.ts`は
無変更）。次回、ChatGPT承認後に`baseConfidenceFromSampleCount`の閾値を変更する。

## STEP8: HorseEvidence/CoursePrior合成方針

| 案 | 内容 | 判定 |
|---|---|---|
| **案A（厳密版・採用）** | HorseEvidenceに1件でも算出可能なdeltaがあれば、HorseEvidence単独でpercentを決定する。confidence shrinkが弱い証拠を自然に100へ寄せるため、追加のCoursePrior混合ロジックを別途発明する必要が無い。HorseEvidenceが0件の場合のみCoursePriorへフォールバック（既存の東京ダート1600m限定・±5pt上限をそのまま維持） | **採用** |
| 案B | HorseEvidence＋CoursePriorを小さく合成 | 不採用。合成比重（例: 0.8/0.2）は未検証の新規数値であり、「根拠がない場合は保守的に」という指示に反する。方式Aのconfidence shrinkが既に「弱い証拠を信じすぎない」役割を果たしており、屋上屋になる |
| 案C | HorseEvidenceがある場合はCoursePrior不使用 | 案Aと実質的に同一の挙動（sampleCount>=1ならCoursePriorを使わない点で一致）。案Aに統合して扱う |

**推奨・実装済み: 案A（厳密版）。** `computeGateSuitabilityV1()`は
`deltas.length > 0`ならHorseEvidenceのみでpercentを決定し、CoursePriorは
`coursePrior`フィールドに監査用メタデータとして保持するが`rawPercent`には
一切混入しない（`reason`に明記）。CoursePrior最大影響幅±5ptのルールは
HorseEvidenceが無い場合のフォールバック経路でそのまま維持されている。

## STEP9: 正式採用値

| 項目 | 値 | 確度 |
|---|---|---|
| gatePercent正式式 | `100 + amplitude × tanh(aggregatedDelta / scale)` | 確定 |
| **amplitude** | **5** | **確定**（数学的保証＋実データ25通り全検証で根拠あり） |
| **scale** | **3** | **暫定**（n=7グループの実データのみが根拠。統計的に確定させるにはサンプル不足） |
| confidence shrink順序 | 方式A（percent変換 → shrink） | 確定（数値例・既存設計整合性の両面で明確な優位） |
| confidence統一案 | 案A（Suitability→HorseEvidence側4段階へ統一） | 方針は確定だが実装は次回（閾値変更のため） |
| HorseEvidence/CoursePrior合成 | 案A厳密版（HorseEvidence優先、フォールバックのみCoursePrior） | 確定・実装済み |

## STEP10: 実馬シミュレーション（実データ、data/horses/全40頭）

`computeSuitabilityV1()`を実際に呼び出し、gate.evaluated=trueだった6頭を示す
（対象条件は各馬の最新走の実際の競馬場×surface×距離を使用、todayの出走情報が
無いため代理として使用）。

| horseId | 対象条件 | sampleCount | confidence | rawPercent | adjustedPercent |
|---|---|---|---|---|---|
| onyankopon | 中山/turf/2100 | 1 | low | 103.1 | 100.9 |
| igacchi | 中山/turf/2100 | 2 | low | 105.0 | 101.5 |
| pinkgin | 中山/turf/2100 | 1 | low | 105.0 | 101.5 |
| magicsands | 中山/turf/2100 | 1 | low | 104.1 | 101.2 |
| ecolowaltz | 中山/turf/2100 | 1 | low | 104.9 | 101.5 |
| roshampark | 東京/turf/1900 | 1 | low | 95.1 | 98.5 |

いずれもconfidence=low（サンプル数1〜2）のため、rawPercentが95〜105の範囲でも
adjustedPercentは98.5〜101.5と100付近に強く縮小されている——**「枠は能力を
微調整する要素」という思想通り、常識的な幅に収まっている**ことを実データで確認した。

## STEP11: 異常系テスト結果

`suitabilityV1.test.ts`に4件追加し、いずれも成功を確認した。

1. 極端な正のaggregatedDelta → `Number.isFinite`かつ`|rawPercent−100|<=5`（NaN/Infinityにならない）。
2. 極端な負のaggregatedDelta → 同上。
3. HorseEvidence・CoursePrior両方利用可能（東京ダート1600m×再訪問） →
   HorseEvidenceが優先され、CoursePriorは監査用メタデータとして`coursePrior`に
   残るがpercentには使われない（reasonに明記されることも確認）。
4. sampleCount=0・CoursePriorも無い → `evaluated=false`・`confidence=unknown`・
   `rawPercent=100`（0点にもNaNにもならない）。

いずれのケースでも「0点」「NaN」「Infinity」「不自然な100固定」（＝根拠なく
100に固定されるケースが無いこと）を確認済み。sampleCount=0のケースの
rawPercent=100は「不自然な固定」ではなく、`evaluated=false`と`confidence=unknown`が
同時に示されるため「データが無いことによる中立」だと呼び出し側から判別できる。

## STEP12: 限定自動修正ループの適用状況

実装中に1件、型エラー（`SuitabilityConfidence`型のimport元誤り、
`suitabilityConfidence.ts`ではなく`suitabilityTypes.ts`が正しいexport元）が発生し、
自動修正した（1回で解決、型エラーの範囲内、数式・閾値・confidence定義・
HorseEvidenceの意味・CoursePrior合成式のいずれにも触れていない）。

また、既存の統合テスト1件（`suitabilityV1.test.ts`の阪神フィクスチャ）が、
gateのマッチ条件が新たにracecourse問わず機能するようになったことで
`gate.evaluated`の期待値が変わった。これは**バグではなく、今回実装した正式式の
意図した挙動**（HorseEvidenceは東京ダート1600m限定ではなく、対象条件への
再訪問があれば任意のコースで機能する）であるため、「単純バグ修正」の範囲を
超える判断としてテストの意図・アサーションを書き直した（数式・閾値・
confidence定義自体は変更していない）。

## 変更禁止・STOP条件の遵守

`raceScore`・`baseAbility`・`memberLevel`・`timeGapScore`・`raceTimeScore`・
`final3FScore`・`weightScore`・HorseEvidence V1正式仕様・Suitability V1統合式
（`aggregateSuitabilityComponents`）・`finalRaceAbility.ts`・`RaceContext`・
`trackBias`はいずれも今回変更していない。`effectiveAbility`本番接続・
Race Review Engineにも進んでいない。

## 完了報告（21項目）

1. **tanh正式候補式**: `percent = 100 + amplitude × tanh(aggregatedDelta / scale)`（STEP1）。
2. **amplitude比較**: [3,4,5,6,8]全て90/110を超えないが、6以上は105超が頻発（3〜6/7件）（STEP2〜4）。
3. **scale比較**: [1.5,2.0,2.5,3.0,4.0]、scale=3がamplitude=5のもとで最も妥当な感度（STEP5）。
4. **percent分布**: 実データn=7グループで全25通り検証、STEP3の表参照。
5. **感度分析**: STEP5の表参照。小delta緩やか、大deltaでamplitudeへ飽和。
6. **過補正発生率**: amplitude=6で3〜5/7（43〜71%）、amplitude=8で4〜6/7（57〜86%）が105超（STEP4）。
7. **confidence shrink方式A/B比較**: 数値例で方式Aのみ「confidence低→100に強く近づく」保証を持つことを確認（STEP6）。
8. **推奨順序**: 方式A（percent変換→shrink）、実装済み。
9. **confidence統一案比較**: STEP7の表参照。
10. **confidence推奨案**: 案A（Suitability→HorseEvidence側閾値へ統一）、方針確定・実装は次回。
11. **HorseEvidence/CoursePrior合成案比較**: STEP8の表参照。
12. **推奨合成案**: 案A厳密版、実装済み。
13. **実馬3頭以上のgatePercent結果**: STEP10の表参照（6頭）。
14. **異常系テスト結果**: STEP11参照、4件全て成功。
15. **60〜120安全境界維持可否**: 維持可。実データ・CASEテストとも90/110にすら到達せず、境界を動かす根拠が無い。
16. **Base Abilityへの影響0確認**: Ability Model V1ファイル群は今回無変更（Read/検証のみ）。
17. **baseAbility=70.3再現**: `abilityModelV1.regression.test.ts`で確認、変化なし（下記test結果参照）。
18. **test/lint/build/validate:data**: 下記参照。
19. **変更ファイル一覧**: `src/ability/suitabilityV1.ts`（gate実装差し替え）、
    `src/ability/__tests__/suitabilityV1.test.ts`（既存1件更新＋新規4件追加）、
    `docs/gate-horse-evidence-percent-v1.md`（新規、本ドキュメント）。
    検証用の`zzz_gatePercentCalibration.test.ts`・`zzz_realHorseGateSimulation.test.ts`は
    報告後に削除済み（コミットしない）。
20. **A/B/C判定**: **B判定**。amplitude=5・confidence shrink順序（方式A）・
    CoursePrior合成方針（案A厳密版）の3項目は実データ・数理的根拠とも十分。
    ただし**scale=3は暫定**（n=7という小サンプルのみが根拠であり、A判定の
    「5項目が実データ上妥当と判断できること」を厳密には満たさない）。
    無理にA判定にはしない。
21. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. scaleの本校正に必要な、より大きい実データセットの要否・入手方法。
    2. Suitability confidence閾値の統一実装（案A、`suitabilityConfidence.ts`の閾値変更）。
    3. distance/course/going側にもHorseEvidence（rawPerformanceDelta方式）を
       将来適用するか（現状は自己参照型percent方式のまま、gateのみ新方式）。
    4. effectiveAbility接続のタイミング（今回のB判定を踏まえ、scale校正後に
       再度A判定確認ラウンドを挟むか、暫定scaleのまま接続へ進むか）。

## test/lint/build/validate:data

```
npm test              # 524/524成功（zzz_検証は報告後に削除済み）
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

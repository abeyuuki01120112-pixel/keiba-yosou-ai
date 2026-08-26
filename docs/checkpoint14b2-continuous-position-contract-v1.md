# CHECKPOINT14B.2 — Continuous Position Contract V1 / Running Style Separation

CHECKPOINT14B.1で発見された「Position BandがRunning Style分類から機械的に導出されており、
scale不一致・境界不安定を抱えている」という問題を解消するため、Historical Position
Profileのsource of truthを連続値へ正式化し、Position Band・Running Style Distribution・
Position Stability・Position Confidenceの4概念を完全に分離した。

`src/ability/positionProfile.ts`・`positionProfileTypes.ts`・
`__tests__/positionProfile.test.ts`を改訂。Base Ability V1・Suitability V1・
Effective Ability・MemberLevel・Formal Snapshot・Eligibleへの変更は無い。
Race Pace Prediction等、今回禁止された範囲の実装も行っていない。

## 1. Continuous Position Contract

`HistoricalPositionProfile`の正式なsource of truth（Contract A）を以下に確定した:

```
positionEvidenceCount      … evidence件数
positionDataCoverage       … 新設。プール（直近最大5走）に対するevidence充足率（0〜1）
earlyNormalizedPositionMean … 各走のearly正規化位置の平均（0=前方寄り、1=後方寄り）
lateNormalizedPositionMean  … 同late（補助情報。6節参照）
positionStdDev              … 新設。連続stability値のsource of truth（=sqrt(positionVariance)）
positionVariance            … 参考値として併記（=positionStdDev^2）
positionConfidence           … evidence品質のみに基づく（4節）
```

いずれもfieldSize差を吸収した0〜1スケールの連続値、またはevidence品質のみに基づく値であり、
CHECKPOINT14C（Race Pace Prediction V1）が主要Featureとして参照するのはこちら側と確定する。

## 2. Running Style Separation

Contract B（Running Style Distribution: `runningStyleDistribution`・
`representativeRunningStyle`）は、既存`passingPositionRunningStyle.ts`が独自に算出した
結果をそのまま転記するのみで、Contract Aの連続値からは一切逆算していない
（元々そうだった。今回変更していない）。

**今回変更したのはPosition Band側。** これまでBand（front/mid/rear）はRunning Style
分類（nige/senko/sashi/oikomi）からの`STYLE_TO_BAND`マッピングで機械的に導出されており、
実質的にContract Bに従属していた。CHECKPOINT14B.2で、Bandの算出を**Running Styleから
完全に独立**させ、Contract Aと同じnormalizedPositionスケール上の専用閾値
（`POSITION_BAND_FRONT_MAX_NORMALIZED=1/3`・`POSITION_BAND_MID_MAX_NORMALIZED=2/3`）から
直接算出するよう変更した。

- **Bandから Running Styleを逆算しない**: Bandの算出コード（`classifyPositionBand()`）は
  `classifiedStyle`を一切参照しない。
- **Running Style DistributionからContract Aの値を逆算しない**: 元々そうなっていた
  （`computePassingPositionRunningStyle()`は正規化位置を一切参照せず、生の
  `cornerPositions`/`fieldSize`比率のみで分類する）。
- 実データで検証: 同じnormalizedPosition帯（例: front）に属する走でも、
  `classifiedStyle`は`nige`にも`senko`にもなりうることをテストで直接確認した
  （`CHECKPOINT14B.2: Running Style DistributionとPosition Bandの独立性`）。

## 3. Position Bandの正式用途（diagnostic専用）

Position Band・`frontRate`/`midRate`/`rearRate`集計は、UI・人間向け説明・診断
（diagnostic）用途に限定し、**CHECKPOINT14C以降のPrediction入力としては使用しない**
ことをコード内コメント・型定義コメントの両方に明記した。境界付近でBandが反転しても、
Contract A側の連続値（`earlyNormalizedPositionMean`等）は一切変化しないアーキテクチャ
であることをテストで確認した（8節）。

**監査中に発見・修正したバグ**: CHECKPOINT14B.1のstability判定と全く同じパターンの
丸め順序バグが、新設したBand判定にも存在した。`representativeNormalizedPosition`を
表示用に小数第3位へ丸めた後の値でBandを判定していたため、数学的にちょうど境界値
（例: position=11/fieldSize=16 → ちょうど2/3）が丸めにより`0.667`へ繰り上がり、
本来`mid`であるべきものが`rear`に誤分類されるケースがあった。境界exactテストで
実際に検出し、判定を丸め前の生値＋微小許容値（`1e-9`）で行うよう修正した
（`positionStability`と同じ対処パターン）。

## 4. Stability Contract

`positionStdDev`をPosition Stabilityの正式な連続値として新設した
（`positionStability`のstable/moderate/variableという区分は、**diagnostic専用**として
維持しつつ、continuous sourceである`positionStdDev`から算出されることを型定義に明記）。
CHECKPOINT14B.1で修正した2件のバグ（丸め順序・浮動小数点境界epsilon）の回帰テストは
維持し、全て引き続きpassすることを確認した。

## 5. Confidence Contract

**Position Stability（馬の位置取り自体の安定性）とPosition Confidence（Profileの
信頼度）を完全に分離した。** `positionConfidence`の算出から「`positionStability ===
"variable"`ならconfidenceを1段階downgradeする」ロジックを削除し、`evidenceCount`
（`baseConfidenceFromSampleCount`）のみに基づくよう変更した。

実データ・単体テストの両方で、以下を確認した:

- 位置取りが毎回大きく変わる馬（`positionStability="variable"`）でも、evidence5走が
  完全であれば`positionConfidence="high"`になる（`high variance ≠ 必ずlow confidence`
  であることの直接確認、テスト`Test F（CHECKPOINT14B.2で改訂）`）。
- `positionStability="variable"`に達した場合でも、confidenceを引き下げていない旨を
  warningsで明示する（例: 「...positionConfidenceを引き下げていません」）。

**Confidence候補の再評価（10節相当）**: evidence count（`baseConfidenceFromSampleCount`）
を基本とし、data validity（`isReliable`フィルタは`computePassingPositionRunningStyle()`
側で既に適用済み）・Short Career completeness（evidence件数閾値が4以上であれば
Short Careerでも"high"になる、既存仕様を維持）は引き続き反映される。**data coverage**は
新設の`positionDataCoverage`フィールドとして可視化した（Short Careerによる母数減少と、
母数はあるがデータ欠損があるケースを区別できるようにする診断用フィールド）が、
confidenceの数値自体には現時点では組み込んでいない。理由: evidence件数がすでに
「実際に使えた走数」であり、Short Careerの母数減少とデータ欠損の母数減少を数値上
区別する具体的な閾値・根拠が無い状態で新たな数値ロジックを追加すると、根拠のない
magic numberを増やすことになるため、V1.1/V2の校正対象として保留する。

新潟記念11頭全馬が引き続き`positionConfidence="high"`だったが、これはこの定義の下でも
妥当である: 全馬`positionDataCoverage=1.0`（欠損無し）かつ`evidenceCount>=4`であり、
機械的に正しい適用結果である。

## 6. CHECKPOINT14C Input Contract

Race Pace Prediction V1が消費すべきPosition側Featureを以下の通り確定する
（枠順/horseNumberはPost-Frame時に別途入力、今回は未確定のまま）:

```
horseId
earlyNormalizedPositionMean   … 主要Feature候補（前半Pace関連）
positionStdDev                … 連続stability値
runningStyleDistribution      … Contract B（分布のまま渡す。単一labelに丸めない）
positionEvidenceCount
positionConfidence
```

`lateNormalizedPositionMean`は補助情報 / 将来のCurrent Race Position Prediction向けとして
分離し、前半Paceの主要Featureからは除外する。`positionStability`（診断区分）・
Position Band・`representativeRunningStyle`（単一label）は、Contract外または
diagnostic専用として明示し、Pace Predictionの主要入力としては使用しない。

## 7. 新潟記念11頭 Board

| 馬名 | early平均 | late平均 | positionStdDev | evidence数 | coverage | distribution(nige/senko/sashi/oikomi) | 代表脚質 | confidence |
|---|---|---|---|---|---|---|---|---|
| アーバンシック | 0.655 | 0.560 | 0.106 | 5 | 1.0 | 0/0/60/40 | sashi | high |
| サヴォーナ | 0.310 | 0.296 | 0.171 | 5 | 1.0 | 0/40/60/0 | sashi | high |
| ジュンブロッサム | 0.755 | 0.804 | 0.076 | 5 | 1.0 | 0/0/20/80 | oikomi | high |
| ステレンボッシュ | 0.460 | 0.483 | 0.208 | 5 | 1.0 | 0/20/60/20 | sashi | high |
| ゾロアストロ | 0.546 | 0.514 | 0.212 | 5 | 1.0 | 20/0/40/40 | sashi | high |
| ダノンシーマ | 0.377 | 0.411 | 0.171 | 5 | 1.0 | 20/20/60/0 | sashi | high |
| チェルヴィニア | 0.496 | 0.484 | 0.204 | 5 | 1.0 | 0/20/60/20 | sashi | high |
| ドゥレッツァ | 0.382 | 0.207 | 0.147 | 5 | 1.0 | 0/60/40/0 | senko | high |
| バレエマスター | 0.800 | 0.769 | 0.149 | 5 | 1.0 | 0/0/20/80 | oikomi | high |
| ボーンディスウェイ | 0.620 | 0.561 | 0.130 | 5 | 1.0 | 0/0/80/20 | sashi | high |
| ロデオドライブ | 0.289 | 0.312 | 0.265 | 4 | 1.0 | 25/50/0/25 | senko | high |

（Position Band・frontRate/midRate/rearRateはdiagnostic専用として別途保持しているが、
本Boardでは正式Contractのみを掲載する。）

## 8. Sensitivity Regression

Position Bandの算出（`classifyPositionBand()`）は、`usedRaces`配列を構築する過程で
`representativeNormalizedPosition`（Contract Aの計算に使う値と同一の値）を入力に
取るだけの純粋関数であり、その戻り値（`band`）はいずれの箇所でも
`earlyNormalizedPositionMean`/`lateNormalizedPositionMean`/`positionStdDev`/
`positionVariance`/`positionConfidence`/`runningStyleDistribution`の計算式に
再入力されていない（コード上、`band`を参照するのは`frontRate`/`midRate`/`rearRate`の
集計のみ）。したがって、Band閾値をどう変更しても、Contract A側の連続値は構造的に
一切影響を受けない。

これを以下2点のテストで直接検証した:

1. 同一入力データに対する連続値の再現性確認（`Position Band境界を±0.03〜0.05動かしても、
   連続値は当然変化しない`）。
2. 各走の`band`が`representativeNormalizedPosition`のみから決定されており、
   `classifiedStyle`（Running Style側）には一切依存していないことの直接確認
   （同じfront帯に属する走でも`classifiedStyle`が`nige`にも`senko`にもなりうることを
   実際に確認）。

CHECKPOINT14Cが未実装の現時点では「後続Pace PredictionがBand labelだけで大きく
変わらないアーキテクチャ」は、6節のInput ContractがBandを含んでいないことによって
設計上担保される（Bandを入力に取らないため、Band反転の影響を原理的に受けない）。

## 9. Tests / Regression

`src/ability/__tests__/positionProfile.test.ts`: **27 tests、全てpass**（前ラウンド24件から、
旧Running-Style由来のBand境界テスト5件を新Band独立閾値の境界テスト4件＋固定値確認1件へ
置き換え、Contract分離確認2件・positionDataCoverage確認2件・Test F改訂を追加）。

- 連続正規化値（Test A、頭数差8頭/18頭）
- Band境界exactテスト（新設の1/3・2/3閾値、ちょうど/超過の4パターン＋定数固定）
- Running Style DistributionとPosition Bandの独立性（2件、上記8節）
- positionDataCoverage（Short Career=1.0 vs 部分欠損=0.6の区別、2件）
- high variance／high evidenceケースでのconfidence同一性（Test F改訂）
- Short Career complete evidence（Test E、無変更）
- positionStability境界regression（CHECKPOINT14B.1の4件、1e-9 epsilon含め全て維持）
- Base Ability不変（Test G）・Suitability V1不変（Test H）

- **Base Ability**: 新潟記念11頭・シェイクユアハートとも無変更。
- **Suitability V1**: 無変更（既存Test H）。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- `npm test`: **728 / 728 pass**。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。
- `git status`: 変更ファイルは`src/ability/positionProfile.ts`・
  `src/ability/positionProfileTypes.ts`・`src/ability/__tests__/positionProfile.test.ts`
  のみ。他ファイルへの影響なし。

## 10. 判定

**A**。

CHECKPOINT14B.1で指摘された「Historical Position ProfileとRunning Style Distributionの
混同」は、Position Bandの算出をRunning Style分類から完全に独立させ、Contract Aと
同じスケール上の専用閾値で計算するよう変更したことで構造的に解消した。Position
Stability（診断区分）とPosition Confidence（evidence品質のみに基づく値）も明確に分離し、
「high variance ≠ 必ずlow confidence」であることを実データ・単体テストの両方で確認した。
Position Bandは診断専用フィールドとして明示し、CHECKPOINT14CのInput Contract
（6節）からも除外したため、Band境界の不安定性（CHECKPOINT14B.1で発見した約45%の
感度）自体はもはやPrediction側への影響経路を持たない。

監査の過程で、新設したBand判定にもCHECKPOINT14B.1と同種の丸め順序バグが実在すること
を発見し、同じ手法（生値＋epsilon）で修正した。Base Ability/Suitability V1/Frozen
Benchmarkへの回帰は無い。無理にA判定にしているわけではなく、Contract分離・
バグ修正・全回帰確認が揃った結果としてのA判定である。

CHECKPOINT14C（Race Pace Prediction V1）へ進める状態にあると判定する。

## 11. 次にChatGPTと決める必要がある項目（優先順位順）

1. **CHECKPOINT14C着手の可否**: 6節のInput Contract（horseId・
   earlyNormalizedPositionMean・positionStdDev・runningStyleDistribution・
   positionEvidenceCount・positionConfidence）で問題ないか最終確認。
2. **positionDataCoverageのconfidenceへの組み込み**: 現状は診断専用フィールドに留めた
   （5節）。将来、Short Careerとdata gapを区別してconfidenceへ反映する具体的な閾値を
   設計するか。
3. **Position Band閾値（1/3・2/3）自体の妥当性**: diagnostic専用に格下げしたため
   Prediction側への影響は無いが、UI表示用としての閾値自体は今回新設した未検証な
   heuristicである。将来UIで使う際に校正が必要か。

以上、CHECKPOINT14B.2完了。CHECKPOINT14Cへは進まず、ここでSTOPする。

# gate HorseEvidence V1 正式仕様（確定・凍結）

**確定日: 2026-08-23（CHECKPOINT11.3〜11.10）。ステータス: V1正式仕様として確定。**

Suitability V1のgate component（`src/ability/suitabilityV1.ts`の
`computeGateSuitabilityV1()`）が、対象馬の本人実績（HorseEvidence）と
コース構造事前分布（CoursePrior）から`gate.rawPercent`/`adjustedPercent`を
算出する正式ロジックをここに記録する。CHECKPOINT11.3〜11.10の各ラウンド記録
（`docs/gate-horse-evidence-percent-v1.md`、`gate-horse-evidence-scale-*.md`）は
検証プロセスの歴史的記録として当時の記述のまま保持し、本ドキュメントが
現在の正式仕様を示す唯一の参照先とする。

## 正式式

```
percent = 100 + amplitude × tanh(aggregatedDelta / scale)
aggregatedDelta = median(rawPerformanceDelta_i)
rawPerformanceDelta_i = raceScore_i − abilityBeforeRace_i
```

- `raceScore_i`: 対象条件（racecourse×surface×distance完全一致、
  `horseGateEvidence.ts`と同一のマッチ条件）に該当する各走のAbility Model V1
  raceScore（既存、無変更）。
- `abilityBeforeRace_i`: その走より厳密に前の直近最大5走のraceScoreから
  `calculateAbilityBeforeRace()`（Ability Model V1凍結済み、無変更）で算出。
  過去走が無い場合はその走のdeltaを算出しない（推測しない、集計対象外）。

## V1正式パラメータ

| パラメータ | 値 | 確定ラウンド |
|---|---|---|
| **amplitude** | **5** | CHECKPOINT11.5 |
| **scale** | **4.0** | CHECKPOINT11.9（A判定）・CHECKPOINT11.10（実装） |
| aggregation | median | CHECKPOINT11.5（HorseEvidence V1と同一） |
| confidence shrink順序 | 方式A（percent変換→confidence shrinkで100へ寄せる） | CHECKPOINT11.5 |
| HorseEvidence/CoursePrior優先順位 | HorseEvidence優先度1、0件時のみCoursePriorへフォールバック | CHECKPOINT11.5 |
| CoursePrior最大影響幅 | ±5pt（`GATE_COURSE_PRIOR_AMPLITUDE`） | CHECKPOINT11.3 |

`amplitude`はtanhの飽和特性により`percent`の理論上の最大乖離幅を数学的に
保証する（scaleに関わらず`percent`は常に`[100−amplitude, 100+amplitude]`
=`[95, 105]`の範囲に収まる）。

## scale=4.0の採用理由

1. CHECKPOINT11.6〜11.9にわたる段階的な実データ検証（グループ数n=7→18→23、
   対象馬6→15→20頭）による。
2. positive・negative・neutralの3方向すべてで検証できるデータ（positive
   16グループ14頭、negative 5グループ5頭、neutral 2グループ2頭）を確保した
   上で判断した。
3. leave-one-horse-out検証で特定馬（houohbiscuits）への依存が実質解消
   （shift=0.88→0.00）し、新たな特定馬依存も確認されなかった。
4. leave-one-horse-outでscale順位（2.5>3.0>3.5>4.0）が全シナリオで安定した。
5. scale=3.5との差は実データ上いずれの指標でも0.3pt未満と実質的に小さい
   （delta感度・percent分布・LOHOの最大shift/平均shiftとも同水準）。
6. scale=4.0でも、実データ中もっとも強いpositive/negativeのdeltaは
   scale=3.5とほぼ同じ水準（105/95付近）まで反応しており、強いHorseEvidence
   信号を失っていないことを確認した（反応不足なし）。
7. 3.5と4.0が実質同等と判断される場合は、「能力9割」思想
   （枠順・コース構造はBase Abilityを上書きする主役ではなく、能力発揮率を
   微調整する補助要素）に基づき、**事前に固定したtie-break rule**
   （実質同等ならより補正の弱いscaleを優先する）に従ってscale=4.0を選定した。
8. この選定は「唯一の数学的真値」を主張するものではなく、実データと
   本モデルの設計思想に基づく校正パラメータとしての決定である。

## HorseEvidence/CoursePrior合成方針（案A厳密版）

`horseEvidenceRaw`（`horseGateEvidence.ts`のfact collector）とcondition-matched
raceの`rawPerformanceDelta`が1件以上算出できる場合、HorseEvidence単独で
`percent`を決定する。confidence shrink（方式A）が弱い証拠を自然に100へ寄せる
ため、CoursePriorとの合成比重を別途発明しない。CoursePriorは、HorseEvidenceの
`rawPerformanceDelta`が1件も算出できない場合（`deltas.length === 0`）のみ
フォールバックとして使用する（東京ダート1600m限定、`GATE_COURSE_PRIOR_AMPLITUDE`
=±5ptの範囲内、`GATE_VALIDATION_STATUS_WEIGHT`による実測検証状況に応じた
追加縮小あり）。HorseEvidenceが利用可能な場合でもCoursePriorの値自体は
監査用メタデータとして`coursePrior`フィールドに保持する（`percent`には
混入しない）。

## confidence

`resolveHorseEvidenceConfidence(deltas.length)`（`horseEvidenceConfidence.ts`、
HorseEvidence V1のconfidence閾値: 0=unknown/1-2=low/3-4=medium/5+=high）を
そのまま再利用する。Suitability側の`baseConfidenceFromSampleCount`
（`suitabilityConfidence.ts`）とは閾値の境界が異なる既知の不一致が残っており
（技術的負債、後述）、統一案（HorseEvidence側の4段階へSuitability側を合わせる）
は方針として確定しているが実装は別ラウンドで行う。

## 安全境界

Suitability V1全体の最終出力（`overallSuitabilityPercent`）には
`SUITABILITY_V1_SAFETY_MIN=60`/`SUITABILITY_V1_SAFETY_MAX=120`の広い安全境界の
みを適用し、`clamp(90,110)`のような狭い強制クランプは使用しない
（CHECKPOINT11.2/11.3で確定）。gate単独のamplitude=5による`[95,105]`の
数学的保証と合わせ、二重の安全設計になっている。

## effectiveAbilityへの接続

**未接続。** `suitabilityV1.ts`はbaseAbilityを一切参照せず、
`finalRaceAbility.ts`・`effectiveAbility`本番計算への接続はまだ行っていない
（CHECKPOINT11.3〜11.10のいずれのラウンドでも意図的にスコープ外としている）。

## technical debt（残存する既知の限界）

1. Suitability側とHorseEvidence側のconfidence閾値境界の不一致
   （sampleCount=2/4での境界差）が未解消（案Aで統一する方針は確定済み、
   実装は次回以降）。
2. scale=4.0は「実データと選定ルールに基づく校正値」であり、唯一の数学的
   真値ではない（CHECKPOINT11.10 STEP10で明示的に許容された性質）。将来
   さらに大きい実データセットが得られた場合、再校正の余地がある。
3. 単一馬1行データセット（検証用CSV）におけるmemberLevelScoreAtRaceの
   自己参照は、数式上は減衰方向（CHECKPOINT10.9C）と確認済みだが、対戦馬
   込みの実データでの定量検証は未実施のまま。
4. distance/course/going側は現状、自己参照型（系統A、`abilityBeforeRace`
   基準ではなく直近5走全体平均基準）のままであり、gateのみHorseEvidence V1
   （`abilityBeforeRace`基準）方式を採用している。両者の統一要否は
   CHECKPOINT11.1以来の未決事項。

---

（参考: 検証プロセスの詳細な経緯は`docs/gate-horse-evidence-percent-v1.md`
（CHECKPOINT11.5・percent式の初期実装とB判定）、
`docs/gate-horse-evidence-scale-calibration.md`（CHECKPOINT11.6）、
`docs/gate-horse-evidence-scale-calibration-v2.md`（CHECKPOINT11.7・データ拡張）、
`docs/gate-horse-evidence-scale-calibration-v3.md`（CHECKPOINT11.8・ZIP投入）、
`docs/gate-horse-evidence-scale-final-decision.md`（CHECKPOINT11.9・A判定）を
参照。これらは各ラウンド当時の記述のまま保持し、遡って書き換えない。）

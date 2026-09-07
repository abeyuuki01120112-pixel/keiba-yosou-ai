# 新潟芝2000m 実戦前プレテスト（3〜5頭限定）（CHECKPOINT12.4）

CHECKPOINT12.3のA判定（gate HorseEvidence実証達成）を受け、完成済みのBase Ability→
Suitability V1→effectiveAbilityパイプラインを新潟芝2000mの実戦候補馬5頭に適用し、
点数の並びが競馬的に不自然でないかを確認した。新潟記念全頭予想には進んでいない。
本ラウンドはコード変更なし、検証のみ（一時スクリプトは確認後削除）。

---

## 1. 対象馬3〜5頭

**選定は結果を見る前に固定した機械的ルールで行った**: CHECKPOINT12.1〜12.3で既に
実測済みのevaluatedComponentCount（本ラウンドの優先条件「できれば4component評価可能」を
そのまま適用した順位付け）で降順ソートし、同順位はhorseId/一時識別子の辞書順でタイブレーク、
先頭5件を採用した。

| 順位 | horseId | 根拠ラウンド | 実測evaluatedComponentCount |
|---|---|---|---|
| 1 | zip:トラストモアリズム | CHECKPOINT12.3 | 4 |
| 2 | zip:ミッドセンチュリー | CHECKPOINT12.3 | 4 |
| 3 | zip:オプレントジュエル | CHECKPOINT12.3 | 4 |
| 4 | 2021102224（シュガークン） | CHECKPOINT12.2 | 3 |
| 5 | 2019104742 | CHECKPOINT12.1 | 2（ただし直近5走の実データを持つ唯一の候補、horseId辞書順で先頭） |

「zip:」接頭辞の3頭はCHECKPOINT12.3で発見した、既存の添付ZIP内部で同一馬名が複数レースに
登場する実馬（本番canonical horseIdへは未接続、検証専用の一時識別子）。

---

## 2. 各馬baseAbility

| horseId | 直近走raceScore | baseAbility |
|---|---|---|
| zip:トラストモアリズム | 71.1, 63.3（2走） | **67.2** |
| zip:ミッドセンチュリー | 72.1, 69.1（2走） | **70.6** |
| zip:オプレントジュエル | 71.2, 66.4（2走） | **68.8** |
| 2021102224 | 58.4, 58.6（2走） | **58.5** |
| 2019104742 | 72.6, 64.7, 74.6, 68.8, 71.6（5走） | **70.5** |

**重要な訂正発見（シュガークン=2021102224）**: CHECKPOINT12.2では新潟大賞典のraceScoreを
60.6・baseAbility=59.5と報告したが、本ラウンドで確認したところ58.6・58.5が正しい値だった。
原因は、CHECKPOINT12.2の検証がシュガークン1頭のみをin-memoryで追加していたため、
final3Fのレース内相対評価（`raceFinal3FMedianSeconds`）が彼女自身の記録1件だけから
求めた退化した中央値（＝常に相対差0秒になる）になっていたこと。本ラウンドでは
新潟大賞典の実出走15頭全員（ZIPの実データ）を含めたため、真のレース中央値
（final3F中央値=34.3秒、彼女自身は35.2秒で中央値より遅い）が正しく使われ、
final3FScoreがより正確な値になった。**CHECKPOINT12.2の committed 報告は歴史的記録として
そのまま残すが、本ラウンド以降はこの訂正後の値（58.6・58.5）を正とする。**
（この訂正はBase Ability V1の数式変更ではなく、既存の「レース内相対評価には
そのレースの実際の全出走馬データを使う」という既存仕様を、より完全な実データで
正しく適用した結果である。）

---

## 3〜6. distance / course / going / gate（詳細） / evaluatedComponentCount / overallConfidence / overallSuitabilityPercent

新潟/turf/2000/良を対象条件として、既存Suitability V1（無変更）で算出。

| horseId | distance | course | going | gate | evaluatedComponentCount | overallConfidence | overallSuitabilityPercent |
|---|---|---|---|---|---|---|---|
| zip:トラストモアリズム | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=104.8, adj=101.4, conf=low, n=1(delta), horseEvidence | **4** | low | **100.4%** |
| zip:ミッドセンチュリー | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100.7, adj=100.2, conf=low, n=2, horseEvidence | eval=true, raw=103.2, adj=101.0, conf=low, n=1(delta), horseEvidence | **4** | low | **100.3%** |
| zip:オプレントジュエル | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=101.2, adj=100.4, conf=low, n=2, horseEvidence | eval=true, raw=104.2, adj=101.3, conf=low, n=1(delta), horseEvidence | **4** | low | **100.4%** |
| 2021102224 | eval=true, raw=100, adj=100, conf=low, n=2, horseEvidence | eval=true, raw=100.2, adj=100.1, conf=low, n=1, horseEvidence | eval=true, raw=100.2, adj=100.1, conf=low, n=2, horseEvidence | **eval=false**, raw=100(placeholder), conf=unknown, n=0, source=none | **3** | low | **100.1%** |
| 2019104742 | eval=true, raw=98.7, adj=98.7, conf=high, n=5, horseEvidence | **eval=false**, raw=100(placeholder), conf=unknown, n=0, source=none | eval=true, raw=100, adj=100, conf=high, n=5, horseEvidence | **eval=false**, raw=100(placeholder), conf=unknown, n=0, source=none | **2** | high | **99.4%** |

すべてのcomponentでCoursePriorは`null`（新潟は東京ダート1600m限定のCoursePrior適用外、
既存仕様、今回も変更なし）。

---

## 7. effectiveAbility

`effectiveAbility = roundToOneDecimal(baseAbility × overallSuitabilityPercent / 100)`
（正式式、無変更）。

| horseId | baseAbility | overallSuitabilityPercent | **effectiveAbility** |
|---|---|---|---|
| zip:トラストモアリズム | 67.2 | 100.4% | **67.5** |
| zip:ミッドセンチュリー | 70.6 | 100.3% | **70.8** |
| zip:オプレントジュエル | 68.8 | 100.4% | **69.1** |
| 2021102224 | 58.5 | 100.1% | **58.6** |
| 2019104742 | 70.5 | 99.4% | **70.1** |

---

## 8. Base Ability順位

**ミッドセンチュリー(70.6) > 2019104742(70.5) > オプレントジュエル(68.8) >
トラストモアリズム(67.2) > 2021102224(58.5)**

---

## 9. effectiveAbility順位

**ミッドセンチュリー(70.8) > 2019104742(70.1) > オプレントジュエル(69.1) >
トラストモアリズム(67.5) > 2021102224(58.6)**

**Base Ability順位と完全に一致（順位変動なし）。**

---

## 10. 順位変動理由

5頭ともoverallSuitabilityPercentが99.4〜100.4%という中立に近い狭い範囲に収まったため、
Base Ability間の実質的な差（58.5〜70.6、最大12.1点差）を覆すような補正は発生しなかった。
「能力上位馬が適性で多少下がる／能力下位馬が適性で多少上がる」という圧縮パターンは、
今回のデータでは明確には観測されなかった——これは実データが全体的に薄い（5頭中4頭が
2走のみ、confidence=lowが大半）ため、Suitability補正自体がごく小さい範囲（±0.6pt）に
収まっていることの反映であり、意図的な圧縮ロジックが働かなかったという意味ではない
（既存のconfidence shrinkは正しく機能しており、単に補正の絶対量が小さいだけ）。

---

## 11. 能力9割思想との整合

**整合している。** overallSuitabilityPercentは全馬99.4〜100.4%の範囲に収まり、
effectiveAbilityの序列はBase Ability順位を一切覆さなかった。gate（HorseEvidence実証済みの
3頭）の影響も個別に見て+0.1〜+0.3pt（第15節参照）にとどまり、course・distance・going
いずれの要素も単独でBase Abilityの差を覆すような支配的影響力を持たなかった。

---

## 12. 異常値有無

**無い。**
- overallSuitabilityPercentは全馬99.4〜100.4%で、SUITABILITY_V1_SAFETY_MIN/MAX
  （60/120）の安全境界から大きく離れている（極端値なし）。
- 1component支配なし（第11節・第15節）。
- Base Ability汚染なし（第16節）。
- unknownの100補完なし——evaluatedComponentCountが2019104742で2、2021102224で3、
  他3頭で4と正しく異なる値になっており（4に統一されていない）、evaluated=falseの
  component（course/gateのrawPercent=100）が平均計算から正しく除外されていることを
  裏付けている。
- gate過大影響なし（第15節）。

---

## 13. future leakage有無

**無い。** 5頭とも、CHECKPOINT12.1〜12.3で既に確認済みの`buildRaceHistory()`の
日付昇順処理・`calculateAbilityBeforeRace`の「対象走より前のみ」制約がそのまま
適用されている（本ラウンドでコード変更していないため、動作は不変）。

---

## 14. 人間向け説明（STEP7）

- **zip:トラストモアリズム**: 馬そのものの能力は67.2点。新潟芝2000m適性は100.4%
  （ほぼ中立、やや得意寄り）。よってeffectiveAbilityは67.5点。gateがプラス
  （aggregatedDelta+7.8、直近の新潟での実績が過去の実力水準を上回った）。
  course/going/distanceはほぼ中立（データ2走のみでconfidence=low）。
- **zip:ミッドセンチュリー**: 能力は70.6点、新潟芝2000m適性100.3%（ほぼ中立）。
  effectiveAbilityは70.8点。goingがわずかにプラス（+0.2pt程度）、gateも小幅プラス
  （aggregatedDelta+3.0）。5頭中もっとも高い能力を持つ馬。
- **zip:オプレントジュエル**: 能力は68.8点、新潟芝2000m適性100.4%。effectiveAbilityは
  69.1点。going（+0.4pt程度）とgate（aggregatedDelta+4.8）がわずかにプラス。
- **2021102224（シュガークン）**: 能力は58.5点、新潟芝2000m適性100.1%
  （course/going/distanceともほぼ中立）。effectiveAbilityは58.6点。gateはデータ不足
  （本人の対象条件走が新潟大賞典1走のみで、それより前の実データが無いため
  abilityBeforeRace算出不能、evaluated=false）。5頭中もっとも能力が低いと評価された。
- **2019104742**: 能力は70.5点、新潟芝2000m適性99.4%（distanceがわずかにマイナス、
  -1.3pt程度、5走の重み付き平均が全体平均をやや下回るため）。effectiveAbilityは
  70.1点。**course・gateは共にデータ不足**（直近5走に新潟の実績が無いため）——
  evaluatedComponentCountが2と、他4頭より少ない点が明確なデータ不足箇所。

---

## 15. gate単独影響（第12節裏付け用の補足データ）

gate componentを含む場合と除いた場合の比較（読み取り専用の比較計算、本番式は無変更）。

| horseId | overallSuitabilityPercent（gate込み） | （gate除外） | 差分 | effectiveAbility差分 |
|---|---|---|---|---|
| zip:トラストモアリズム | 100.4% | 100.0% | +0.4pt | +0.3 |
| zip:ミッドセンチュリー | 100.3% | 100.1% | +0.2pt | +0.1 |
| zip:オプレントジュエル | 100.4% | 100.1% | +0.3pt | +0.2 |
| 2021102224 | 100.1%（gate自体がevaluated=falseのため差分なし） | 100.1% | 0 | 0 |
| 2019104742 | 99.4%（同上） | 99.4% | 0 | 0 |

---

## 16. baseAbility=70.3回帰

シェイクユアハートの`calculateBaseAbility`を、今回の5頭分のin-memoryデータ追加後に実行し、
**70.3を完全再現した**（変化なし）。`abilityModelV1.regression.test.ts`も3件全てパスした
（コード変更していないため無変更のまま）。

---

## 17. test/lint/build/validate:data

- `npm test` — 534/534 pass（54 test files。CHECKPOINT12.3完了時点と同一件数、
  本ラウンドはコード変更が無いため変化なし）。
- `npm run lint` — clean（0 errors, 0 warnings）。
- `npm run build` — `tsc -b && vite build` 成功。
- `npm run validate:data` — 成功。既存と同じ内容の情報warningのみ。

---

## 18. A/B/C判定

**A: 3〜5頭で自然な序列・説明が得られた。**

Base Ability順位とeffectiveAbility順位が完全に一致し、極端な逆転は一切発生しなかった
（第8節・第9節）。各馬のeffectiveAbilityは、素点(Base Ability)・適性(%)・各component
のプラス/マイナス要因まで人間が追える形で一貫して説明できた（第14節）。1component支配・
Base Ability汚染・future leakage・unknownの100補完・gate過大影響のいずれも検出されなかった
（第12節・第13節・第15節）。本ラウンド自体で発見した検証スクリプトの構築ミス
（シュガークンの重複データ、第2節）も、原因を特定し訂正した上で正しい値を報告した。

**ただし、この5頭の実データは全体的に薄い（4頭が2走のみ、confidence=lowが大半、
2019104742のみ5走だが新潟実績自体が無い）ことを次節・次項で明確に留保する。**
今回の「自然さ」は、正しい構造がデータの薄さを誇張せず正直に表現した結果
（小さな補正・低いconfidence表示）であり、本格的な新潟記念全頭展開には、
より厚みのある実データ（各馬5走・複数の新潟実績）が引き続き必要である。

---

## 19. technical debt

- 今回選定した5頭のうち4頭は2走のみの実データで、baseAbilityの信頼性は
  シェイクユアハート（5走、CHECKPOINT12.0でA判定済み）ほど高くない
  （confidence=lowが大半という形で正直に反映されている）。
- CHECKPOINT12.2の報告値（シュガークンのraceScore=60.6・baseAbility=59.5）は、
  検証範囲が限定的だったための誤差を含んでいたことが判明した（第2節）。
  historical CHECKPOINTの記録としてそのまま残すが、以降のラウンドでは本ラウンドの
  訂正値（58.6・58.5）を正とする。
- CoursePriorは引き続き東京ダート1600m限定のため新潟では発火しない（既存の
  technical debt、変更なし）。
- 「zip:」接頭辞の3頭・シュガークンの拡張データは、いずれも検証専用のin-memory
  データのままで、`data/horses/`には一切反映していない。

---

## 20. 次にChatGPTと決める必要がある項目

1. 新潟記念全頭展開へ進めるための、より厚みのある実データ（各馬5走、複数新潟実績）
   収集を優先事項とするかどうか。
2. 今回発見・訂正したシュガークンの数値誤差（第2節）を踏まえ、今後の検証における
   「対象レースの実出走馬全員を含める」原則を明文化するかどうか。
3. 「zip:」一時識別子の3頭・シュガークンの拡張データを、正式にhorseId付きで
   `data/horses/`へ取り込むかどうか（CHECKPOINT12.3から継続する未決事項）。
4. `data/horses/grandia.json`等のV0プレースホルダー疑いファイル（CHECKPOINT12.2で
   発見、technical debt）の扱い。

**ここでSTOPします。** A判定になりましたが、新潟記念全頭展開にはChatGPT承認前に
進みません。

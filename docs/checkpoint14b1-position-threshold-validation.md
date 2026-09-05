# CHECKPOINT14B.1 — Position Band / Stability Threshold Validation

Historical Position Profile V1（CHECKPOINT14B）で使用しているPosition Band（front/mid/rear）
とpositionStability（stable/moderate/variable）の閾値を監査した。監査の過程で
positionStability判定に実在するバグを2件発見・修正した（詳細は5節）。Position Bandに
ついては、閾値そのものは監査済みだが「Historical Position ProfileとRunning Style
Distributionを混同しない」という本チェックポイントの懸念が実際に該当する設計上の
論点を発見したため、B-SPECとして次の判断を仰ぐ（10節）。

Base Ability V1・Suitability V1・Effective Ability・MemberLevel・Eligibility・
Formal Snapshotへの変更は無い。Pace Prediction等、今回禁止された範囲の実装も行っていない。

## 1. Current Band Thresholds

**実装コード上の事実として、Position Band（front/mid/rear）はnormalizedPosition上の
固定された数値境界としては定義されていない。** `positionProfile.ts`のBandは、
`passingPositionRunningStyle.ts`の4分類脚質（nige/senko/sashi/oikomi）の分類結果を
そのまま`STYLE_TO_BAND`でマッピングしたものである:

```
nige   → front
senko  → front
sashi  → mid
oikomi → rear
```

その4分類脚質自体の判定式（`classifyRunningStyleFromPositions()`）は、
**Historical Position Profileが公開しているnormalizedPosition（`(position-1)/(fieldSize-1)`）
とは別のスケール**で計算されている:

- **nige**: 最初の有効な通過順位が**絶対順位**で`NIGE_LEAD_POSITION_THRESHOLD=2`以下
  （比率ではない。頭数によらず「先頭2番手以内にいたか」で判定）
- **senko**: 代表区間（3件以上なら最終コーナーを除く）の平均位置比率
  `position / fieldSize`（**`(position-1)/(fieldSize-1)`ではない**）が`0.35`以下
- **sashi**: 同比率が`0.35`超`0.70`以下
- **oikomi**: 同比率が`0.70`超

したがって、`earlyNormalizedPositionMean`等の公開フィールド（`(position-1)/(fieldSize-1)`
スケール）から単純にBand境界を逆算することはできない。両スケールは頭数が大きいほど
近似するが厳密には一致しない（例: fieldSize=14で比率境界0.35に相当する位置は
`(4.9-1)/13≈0.30`であり、`0.35`ではない）。この事実は今回の監査で初めて明示的に
コード外へ文書化した。

## 2. Threshold Origin

**legacy asset（heuristic、未バックテスト）。** `NIGE_LEAD_POSITION_THRESHOLD=2`・
`senkoMaxRatio=0.35`・`sashiMaxRatio=0.7`はいずれも`passingPositionRunningStyle.ts`
（STEP5.1、CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み）で既に定義済みだった定数であり、
CHECKPOINT14Bで新規のBand用閾値を追加してはいない（「新規閾値を増やさない」方針を
文字通り守った結果ではあるが、その代償として4分類脚質の定義をそのまま3分割Bandへ
横流ししている）。

同ファイルのコード内コメントに明記されている通り、**根拠なしのmagic numberではないが、
実戦データでの検証（バックテスト）は行われていない**（「将来の実戦検証で見直し可能な
定数」と明記）。`courseContextPrior`由来ではない（gate適性の正規化パターンを流用した
のは`normalizePosition()`のみで、Band閾値そのものとは無関係）。単純3分割として
新規設計されたものでもない。

## 3. 11-Horse Boundary Audit

`earlyNormalizedPositionMean`ではなく、実際にBand判定へ使われる比率スケール
（代表区間の`position/fieldSize`平均、以下`ratioMean`）で境界からの距離を算出した
（2節の通り、Bandは公開normalizedPositionスケールでは判定されていないため）。

| 馬名 | currentBand | ratioMean | normMean(参考) | nearestBoundary | distanceFromBoundary |
|---|---|---|---|---|---|
| アーバンシック | mid | 0.685 | 0.663 | sashi/oikomi(0.70) | **0.015** |
| サヴォーナ | mid | 0.363 | 0.319 | senko/sashi(0.35) | **0.013** |
| ジュンブロッサム | rear | 0.780 | 0.765 | sashi/oikomi(0.70) | 0.080 |
| ステレンボッシュ | mid | 0.512 | 0.481 | senko/sashi(0.35) | 0.162 |
| ゾロアストロ | mid | 0.609 | 0.553 | sashi/oikomi(0.70) | 0.091 |
| ダノンシーマ | mid | 0.451 | 0.401 | senko/sashi(0.35) | 0.101 |
| チェルヴィニア | mid | 0.514 | 0.479 | senko/sashi(0.35) | 0.164 |
| ドゥレッツァ | front | 0.340 | 0.295 | senko/sashi(0.35) | **0.010** |
| バレエマスター | rear | 0.798 | 0.782 | sashi/oikomi(0.70) | 0.098 |
| ボーンディスウェイ | mid | 0.651 | 0.626 | sashi/oikomi(0.70) | 0.049 |
| ロデオドライブ | front | 0.367 | 0.320 | senko/sashi(0.35) | **0.017** |

**境界付近（distance ≤ 0.02）の馬: アーバンシック・サヴォーナ・ドゥレッツァ・ロデオドライブの4頭**
（11頭中4頭、36%）。いずれも実際の11頭Boardの`representativeRunningStyle`は現行閾値の
下で確定した値であり、境界に近いこと自体が誤りではないが、4節のSensitivity Testで
実際にこれらの馬の分類が揺れることを確認した。

## 4. Sensitivity Analysis

54走全件（11頭分の実データ、`usedRaces`）に対し、`senkoMaxRatio`/`sashiMaxRatio`を
±0.03/±0.05、`NIGE_LEAD_POSITION_THRESHOLD`を1・3に変えて、各走の分類
（`classifyRunningStyleFromPositions`の出力）と、馬ごとの代表脚質（5走中の最頻値、
`representativeRunningStyle`相当）が変わるかを確認した。

| 摂動 | 走単位の分類が変わった件数(/54) | **代表脚質（Band相当）が変わった馬** |
|---|---|---|
| senko/sashi比率 +0.03 | 3 | サヴォーナ(sashi→senko)、ゾロアストロ(oikomi→sashi) |
| senko/sashi比率 -0.03 | 5 | ドゥレッツァ(senko→sashi)、ボーンディスウェイ(sashi→oikomi)、ロデオドライブ(senko→oikomi) |
| senko/sashi比率 +0.05 | 5 | サヴォーナ(sashi→senko)、ゾロアストロ(oikomi→sashi) |
| senko/sashi比率 -0.05 | 6 | ドゥレッツァ(senko→sashi)、ボーンディスウェイ(sashi→oikomi)、ロデオドライブ(senko→oikomi) |
| nige閾値=1（現行2） | 3 | なし（走単位の分類は変わるが代表脚質は不変） |
| nige閾値=3（現行2） | 7 | ロデオドライブ(senko→nige) |

**11頭中5頭（サヴォーナ・ゾロアストロ・ドゥレッツァ・ボーンディスウェイ・ロデオドライブ、
約45%）が、±0.03〜0.05程度の小さな閾値変更で代表脚質（＝Band）が変わる。** これは
特定馬を都合よく分類するための調整ではなく、3節の境界付近監査と整合する客観的事実
として報告する。目的通り「V1の分類安定性」を評価した結果、**現行の11頭Niigata Kinen
フィールドに対しては、Band分類の安定性は高くない**と判定する。

## 5. Stability Formula / Thresholds

`positionVariance` = 各走の`representativeNormalizedPosition`（`(position-1)/(fieldSize-1)`
スケール）の母集団分散。`positionStability`は`stdDev = sqrt(positionVariance)`から:

```
stdDev <= 0.15  … stable
stdDev <= 0.30  … moderate
それ以外         … variable
```

**監査中に実装バグを2件発見し、修正した（`positionProfile.ts`）:**

1. **丸め順序バグ（実質的な誤分類、最大約0.0017のstdDevずれ）**: 修正前は
   `positionVariance`（表示用に小数第3位へ丸め済み）から`stdDev`を計算していたため、
   数学的に`stdDev=0.15`ちょうどのケースが、varianceの丸め（`0.0225→0.023`）によって
   `stdDev≈0.1517`となり、本来`stable`であるべきものが`moderate`に誤判定されていた。
   `CHECKPOINT14B.1`で追加した境界exactテストで実際に検出。**修正**: stability判定は
   丸め前の生varianceのstdDevで行い、表示用`positionVariance`のみ丸めるよう分離した。
2. **浮動小数点表現誤差（1e-17オーダー、実質無視できるが境界exactテストでは顕在化）**:
   修正1の後も、IEEE754の丸め誤差により`stdDev`が数学的な境界値よりごく僅か
   （例: `0.15000000000000002`）上振れし、`<=`比較で境界を跨いで誤判定するケースが
   残った。**修正**: `classifyStability()`の比較に`1e-9`の微小許容値を追加した
   （実データでこの桁の誤差が意味を持つことはなく、境界exactテストのための数値的
   頑健性強化）。

いずれの修正も新潟記念11頭の実際の`positionStability`/`positionConfidence`の値には
影響しなかった（修正前後でBoardは完全一致、6節参照）。

## 6. Confidence Audit

`positionConfidence`は`baseConfidenceFromSampleCount(positionEvidenceCount)`
（`suitabilityConfidence.ts`、STEP4のSuitability Confidenceと同じ基準を再利用、
高:4走以上/中:2〜3走/低:0〜1走）をベースに、`positionStability === "variable"`の
場合のみ1段階downgradeする。

- **本当に11頭全馬highが妥当か**: 妥当。10頭がevidence5走・1頭(ロデオドライブ)が
  evidence4走で、いずれも`baseConfidenceFromSampleCount`の閾値(4走以上)を満たす。
  かつ11頭中`positionStability="variable"`（downgrade対象）に該当する馬は0頭
  （最も分散が大きいロデオドライブでもstdDev=0.265で、variable境界0.30まで
  distance 0.035残っている）。**「全馬high」は、evidence数とvariance実測値から
  現行ルールを機械的に適用した結果であり、恣意的な過大評価ではない。**
- **4〜5走のEvidenceだけでhighが容易に出すぎないか**: 現行ルール上は「容易に出る」。
  `baseConfidenceFromSampleCount`はvarianceを一切見ずevidence数のみでbase判定するため、
  variance="stable"でも"moderate"でも、evidence数が4以上であれば同じ"high"になる
  （downgradeは"variable"のみが対象）。**これは事実として開示すべき設計特性であり、
  stableな6頭とmoderateな5頭が現状confidence上で区別されていないことを意味する。**
- **varianceが大きい馬でもhighになっていないか**: 11頭の中では発生していない
  （最大varianceのロデオドライブでも"moderate"止まり）。ただし、上記の通り
  "moderate"はdowngrade対象外のため、**もし"moderate"止まりでもvarianceがより
  大きい馬が今後現れた場合、それでも"high"のままになる**設計である。
- **coverage100%だけでhighになっていないか**: coverage（passingPosition充足率）は
  そもそも本Profileのconfidence計算に直接使われていない（evidence数と分散のみが
  入力）。したがって「coverage100%だから」という理由でhighになっているわけではない。

無理にconfidenceを下げてはいない。事実として、現行設計は「evidence数が十分あれば、
variance="variable"という明確な悪化シグナルが無い限りhighを維持する」という
one-directional downgradeであり、11頭全馬highはこのルールの正しい適用結果である。

## 7. Rodeo Drive

4走全てにpassingPositionが揃っており、`positionEvidenceCount=4`・
`positionConfidence="high"`（5走目を要求していない、CHECKPOINT14Bの既存Test Eと同じ
結論）。stdDev=0.265は11頭中最大で、variable境界(0.30)までの距離は0.035と**11頭中
最も境界に近い**。これは「4走しかないから」ではなく、実際のvariance実測値に基づく
事実であり、Short Careerであることを理由に不当にconfidenceを下げても上げてもいない。

## 8. Condition Split Recommendation

距離・コース・馬場別のPosition Profile分割は、CHECKPOINT14Bと同じくV1として
実装していない。今回の監査でも新規に着手していない。V1.1/V2の技術的負債候補として
そのまま維持する。

## 9. Regression / Tests

`src/ability/__tests__/positionProfile.test.ts`に10 testsを追加（計24 tests、
全てpass）:

- Band境界exactテスト（6件）: senko/sashi比率境界(0.35)ちょうど/超過、
  sashi/oikomi比率境界(0.70)ちょうど/超過、nige絶対順位境界(2)ちょうど/超過、
  現行定数(0.35/0.7)自体の凍結確認
- Stability境界exactテスト（4件）: stdDev=0.15ちょうど（stable維持）/超過（moderateへ）、
  stdDev=0.30ちょうど（moderate維持）/超過（variableへ）

このテスト作成の過程で5節記載の2件のバグを実際に検出・修正した。

- **Base Ability**: 新潟記念11頭・シェイクユアハートとも、修正前後で完全不変
  （`positionProfile.ts`の修正はstability判定のみに閉じており、Base Ability計算経路には
  一切触れていない）。
- **Suitability V1**: 無変更（既存Test H、無回帰）。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- **11頭Board**: 本ラウンドの2件のバグ修正の前後で、`frontRate`/`midRate`/`rearRate`・
  `positionStability`・`positionConfidence`・`representativeRunningStyle`は全馬で
  完全一致（修正はfloating-point境界近傍にのみ影響し、実データはいずれも境界から
  十分離れているか、丸め誤差の影響を受けない値だったため）。
- `npm test`: **725 / 725 pass**（既存715 + 新規10）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告のみ、件数・内容とも不変。
- `git status`: 変更ファイルは`src/ability/positionProfile.ts`（バグ修正2件）・
  `src/ability/__tests__/positionProfile.test.ts`（テスト追加）のみ。他ファイルへの
  影響なし。

## 10. 判定

**B-SPEC**。

**positionStabilityの閾値・実装は今回の監査で発見した2件の実バグ（丸め順序・
浮動小数点境界）を修正済みであり、この部分は正式に固定可能（A相当）と判断する。**

**一方、Position Bandについては、本チェックポイントが事前に懸念していた
「Historical Position ProfileとRunning Style Distributionの混同」が実際に該当する
設計上の論点が見つかった。** 現行実装ではBandはRunning Style分類（4分類脚質）から
機械的に導出されており、Historical Position Profile独自の閾値としては存在しない
（1節）。この設計自体は「新規閾値を増やさない」というCHECKPOINT14Bの方針に忠実だが、
結果として:

- Bandの境界はProfileが公開するnormalizedPositionスケールとは別スケール（position/
  fieldSize比率、かつnigeのみ絶対順位）で計算されており、両者を単純に対応づけられない
  （1節）。
- 実際の新潟記念11頭のうち約36%（4頭）が境界からdistance 0.02以内、約45%（5頭）が
  ±0.03〜0.05の閾値摂動で代表脚質（Band相当）が変わる（3〜4節）。V1として
  未バックテストの閾値をそのまま採用している以上、この程度の感度は許容範囲という
  見方もできるが、"分類安定性の監査"という本ラウンドの目的に照らせば、無視できない
  水準だと判断する。

無理にA判定にはしない。次にChatGPTと決めるべき事項を11節に整理した。

## 11. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Position Bandの定義方針**: 現行の「Running Style分類からのSTYLE_TO_BANDマッピング」
   のままCHECKPOINT14Cへ進むか、それとも「Historical Position Profile独自の
   representativeNormalizedPosition（`(position-1)/(fieldSize-1)`スケール）に対する
   独立した3分割閾値」を新設し、Running Style Distributionとは完全に切り離すか。
   後者を選ぶ場合、新たな閾値の根拠（過去検証データ or 暫定heuristic）を別途定める
   必要がある。
2. **Band分類安定性の許容範囲**: 4節のSensitivity結果（11頭中5頭が小さな閾値変更で
   代表脚質が変わる）を、V1として許容するか、それとも複数走の多数決だけでなく
   境界近傍馬には"boundary"フラグを追加する等の緩和策を検討するか。
3. **moderate stabilityとconfidenceの関係**: 現行は"variable"のみがdowngrade対象で、
   "moderate"はdowngradeしない。stable/moderateをconfidence上で区別する必要が
   将来的にあるか（6節）。
4. **CHECKPOINT14C（Race Pace Prediction V1）着手の可否**: 上記1・2が解決すれば
   着手可能という理解でよいか。

以上、CHECKPOINT14B.1完了。CHECKPOINT14Cへは進まず、ここでSTOPする。

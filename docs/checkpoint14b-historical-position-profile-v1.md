# CHECKPOINT14B — Historical Position Profile V1

「各馬が過去レースで通常どの位置を取ってきたか」を、通過順位（`passingPosition`）+
出走頭数（`fieldSize`）の実データのみから数値化するモジュールを実装した。
**今回レースでの位置取り予測（Current Race Position Prediction）はスコープ外**であり、
実装していない。Base Ability V1・Suitability V1・Formal Snapshotへの参照・変更は無い。

新規ファイル: `src/ability/positionProfileTypes.ts`（型定義）、`src/ability/positionProfile.ts`
（本体、`computeHistoricalPositionProfile()`）、
`src/ability/__tests__/positionProfile.test.ts`（14 tests）。既存ファイルの変更は無い。

## 1. Position Normalization

`normalizePosition(position, fieldSize) = (position - 1) / (fieldSize - 1)`。
`courseContextPrior.ts`の`calculateRelativeGatePosition()`と同じ式・同じ境界処理方針を
採用し、gate適性側で既に監査済みの正規化パターンを流用した（新規の相対化ロジックを
発明していない）。

- 0 = 最前方、1 = 最後方
- `position = 1` → 常に0、`position = fieldSize` → 常に1
- `fieldSize <= 1`、または`position`が`1..fieldSize`の範囲外 → `null`（推測補正しない）
- 頭数の違いは正しく吸収される（例: 8頭立て4番手 = `3/7 ≈ 0.429`、18頭立て4番手 =
  `3/17 ≈ 0.176`。Test A で確認）。

## 2. コーナー数非依存の設計

`cornerPositions`の要素数（2件=2コーナー計測、3〜4件=3〜4コーナー計測）を問わず処理する。
存在しないコーナーを補完しない。`firstObservedPosition`/`lastObservedPosition`という
命名にして、「スタート直後の位置」「今回のfinishPosition（着順）」であるとは一切
断定していない（型定義コメントに明記）。

「代表区間」（`representativeNormalizedPosition`、Position Band・Position Varianceの
算出に使用）は、既存`classifyRunningStyleFromPositions()`（`passingPositionRunningStyle.ts`、
CHECKPOINT14A.1でREUSE_WITH_CHANGES判定済み・無変更）と同じ規約をそのまま踏襲: 記録が
3件以上あれば最終コーナーを除いた区間の平均、2件以下ならず全件の平均。独自の代表区間
定義を新設していない。

## 3. Position Band（3分割）

`front`/`mid`/`rear`の3分割は、既存の4分類脚質（`nige`/`senko`/`sashi`/`oikomi`、
`passingPositionRunningStyle.ts`で無変更のまま算出）をそのまま`STYLE_TO_BAND`で
マッピングしたものであり、新規の閾値・境界値は一切追加していない。

```
nige   → front
senko  → front
sashi  → mid
oikomi → rear
```

## 4. Running Style Distribution / Representative Running Style

`computePassingPositionRunningStyle()`を**1回だけ呼び出し**、その`distribution`
（nige/senko/sashi/oikomi、合計100）と`dominantStyle`をそのまま
`runningStyleDistribution`/`representativeRunningStyle`として転用している。脚質分類
ロジックを独自に複製していない。`representativeRunningStyle`は固定ラベルではなく、
evidenceが変われば再計算される値である（型定義コメントに明記）。

## 5. Position Variance / Stability / Confidence

- `positionVariance`: `representativeNormalizedPosition`群の母集団分散（0〜1スケール）。
- `positionStability`: `stdDev <= 0.15` → `stable`、`<= 0.30` → `moderate`、それ以外 →
  `variable`。**V1の未検証な暫定定数**であり、`docs/step6-decisions.md`と同じ
  「将来のバックテストでのみ校正する、特定レースの結果に合わせて調整しない」方針に
  従う（コード内コメントに明記）。
- `positionConfidence`: `baseConfidenceFromSampleCount(positionEvidenceCount)`
  （既存`suitabilityConfidence.ts`、無変更）をベースに、`positionStability === "variable"`
  の場合のみ1段階downgradeする（`downgradePositionConfidence()`、high→medium→lowの
  1方向のみ）。**variance/stabilityによってconfidenceが上がることは無い**
  （downgrade専用、upgrade経路が存在しない設計）。Test Fで、5走とも位置取りが激しく
  変動する馬のconfidenceが、5走とも安定した馬のconfidenceを上回らないことを確認した。

## 6. Confidence とEvidence Countの分離

Position Profile専用の`positionConfidence`は、Suitability Confidence・Short Career
Evidence（`memberLevelEvidence.ts`等）とは別概念として独立に算出している。Short Career
馬（4走のみ）でも、4走全てにpassingPositionがあれば`positionEvidenceCount = 4`・
`positionConfidence = "high"`となり、「5走に満たないから欠損」という扱いはしない
（Test E、後述7節ロデオドライブの実データでも確認）。

## 7. Output Contract

`HistoricalPositionProfile`（`positionProfileTypes.ts`）:

```
horseId, horseName, positionEvidenceCount,
earlyNormalizedPositionMean, lateNormalizedPositionMean,
frontRate, midRate, rearRate,
positionVariance, positionStability,
runningStyleDistribution, representativeRunningStyle,
positionConfidence, usedRaces（監査用内訳）, warnings
```

チェックポイント原文の出力契約（15節）を満たしつつ、監査可能性のため`usedRaces`
（各走のraceId/観測位置/fieldSize/正規化値/band/classifiedStyle）を追加している。

## 8. 新潟記念11頭 Position Profile Board

`getHorseRecentRaces()`（本番データ経路、無変更）から実データで算出（スクラッチ
スクリプトで生成・確認後に削除、`data/horses/`への書き込みは無し）:

| 馬名 | evidence数 | early平均 | late平均 | front% | mid% | rear% | variance | stability | 代表脚質 | confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| アーバンシック | 5 | 0.655 | 0.560 | 0 | 60 | 40 | 0.011 | stable | sashi | high |
| サヴォーナ | 5 | 0.310 | 0.296 | 40 | 60 | 0 | 0.029 | moderate | sashi | high |
| ジュンブロッサム | 5 | 0.755 | 0.804 | 0 | 20 | 80 | 0.006 | stable | oikomi | high |
| ステレンボッシュ | 5 | 0.460 | 0.483 | 20 | 60 | 20 | 0.043 | moderate | sashi | high |
| ゾロアストロ | 5 | 0.546 | 0.514 | 20 | 40 | 40 | 0.045 | moderate | sashi | high |
| ダノンシーマ | 5 | 0.377 | 0.411 | 40 | 60 | 0 | 0.029 | moderate | sashi | high |
| チェルヴィニア | 5 | 0.496 | 0.484 | 20 | 60 | 20 | 0.041 | moderate | sashi | high |
| ドゥレッツァ | 5 | 0.382 | 0.207 | 60 | 40 | 0 | 0.022 | stable | senko | high |
| バレエマスター | 5 | 0.800 | 0.769 | 0 | 20 | 80 | 0.022 | stable | oikomi | high |
| ボーンディスウェイ | 5 | 0.620 | 0.561 | 0 | 80 | 20 | 0.017 | stable | sashi | high |
| ロデオドライブ | 4 | 0.289 | 0.312 | 75 | 0 | 25 | 0.070 | moderate | senko | high |

ロデオドライブは4走（全キャリア）のみだが、4走全てにpassingPositionが揃っているため
`positionConfidence = "high"`（5走目を要求していない、6節・Test Eの通り）。11頭全馬で
`final3F`プロキシへのfallbackは発生していない（`positionEvidenceCount`はいずれも
`recentRaces`から実際に取得できた通過順位データの件数と一致）。

## 9. Extreme Case監査（実データ）

- **2コーナー中心の履歴**: ジュンブロッサム（5走中3走が2コーナーのみ計測）、
  バレエマスター（5走中3走が2コーナーのみ計測）。いずれも存在しない3・4コーナーを
  補完せず、2件のみで代表区間を算出し、正常にband/varianceへ反映されることを確認した
  （Test B/Fでも単体検証済み）。
- **4コーナー中心の履歴**: アーバンシック・サヴォーナ・ダノンシーマ・ドゥレッツァ・
  ボーンディスウェイ（5走中4〜5走が4コーナー計測）。いずれも最終コーナーを除いた
  代表区間（3件平均）で正常に算出されることを確認した（Test Cでも単体検証済み）。
- **常に前方**/**常に後方**の合成データ（Test「Extreme Case」）: frontRate=100・
  representativeRunningStyle="nige"、rearRate=100・representativeRunningStyle="oikomi"
  をそれぞれ確認した。
- **passingPositionが無い馬**: `positionEvidenceCount = 0`、`runningStyleDistribution =
  null`、final3F等での代替推定を行わない旨の警告を返すことを確認した（Test D）。
- **isReliable=falseの走**: 無視されることを確認した（Test D）。

## 10. Future Leakage

`computeHistoricalPositionProfile()`自身は`recentRaces`を自前でフィルタしない。呼び出し側
（`getHorseRecentRaces()`経由で`predictionCutoffAt`より前の走だけに絞り込み済みの
`RacePerformance[]`を渡す）が安全な範囲を担保する、既存の`baseAbility.ts`・
`runningStyle.ts`・`passingPositionRunningStyle.ts`と同じ規約をそのまま踏襲した
（コード冒頭コメントに明記）。今回スコープでは新規のフィルタ処理を実装していない。

## 11. Regression

- **Base Ability**: Test G（合成データ）で、Position Profile計算の前後で
  `calculateBaseAbility()`の出力が完全一致（`toBe`）することを確認。新潟記念11頭の
  本番baseAbilityも本ラウンドを通じて不変（アーバンシック72.1・サヴォーナ70.2・
  ジュンブロッサム72.7・ステレンボッシュ69.4・ゾロアストロ74.8・ダノンシーマ78.3・
  チェルヴィニア69.1・ドゥレッツァ67.4・バレエマスター72.3・ボーンディスウェイ73.1・
  ロデオドライブ76.7）。
- **Suitability V1**: Test Hで、Position Profile計算の前後で`computeSuitabilityV1()`の
  出力が完全一致（`toEqual`）することを確認。
- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- **data/horses/**: 本ラウンドでの書き込みは無し（`git status`確認済み、新規ファイル3件
  のみ）。
- `npm test`: **715 / 715 pass**（既存701 + 新規14）。
- `npm run lint`: エラーなし。
- `npm run build`: 型チェック・ビルドともエラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告（courseTimeBaselines/
  courseFinal3FBaselines不足等）は本ラウンドと無関係の既知事項で、件数・内容とも変化なし。

## 12. Tests

`src/ability/__tests__/positionProfile.test.ts`（14 tests、全てpass）:

- Test A（3件）: 頭数差の正規化（8頭立て/18頭立てで異なる値、境界値position=1/
  position=fieldSize、fieldSize<=1・範囲外はnull）
- Test B/F（1件）: 2コーナーのみの走の正常処理
- Test C（1件）: 4コーナー分の走の正常処理
- Test D（2件）: passingPosition実データのみ使用（final3F代替なし）、
  isReliable=false無視
- Test E（1件）: Short Career 4/4をcomplete evidenceとして処理（5走目不要）
- Test F（2件）: 高varianceの馬のconfidenceが安定馬を上回らない、境界値（stdDev=0）
  でstableのまま
- Test G（1件）: Base Ability不変
- Test H（1件）: Suitability V1不変
- Extreme Case（2件）: 常に前方/常に後方の馬

途中、`representativeNormalizedPosition`が実装仕様通り小数第3位に丸められて格納される
ため、テスト側の比較精度（`toBeCloseTo`の桁数）を5桁から3桁へ修正する必要があった
（実装側の丸め自体は意図した仕様であり、修正はテスト側のみ）。

## 13. 判定

**A**。

Historical Position Profile V1は、既存のRunning Style分類（`passingPositionRunningStyle.ts`）
・gate正規化パターン（`courseContextPrior.ts`）を再利用し、新規の脚質分類ロジックや
Band閾値を発明せずに実装できた。実データ（新潟記念11頭）で2コーナー中心・4コーナー中心
双方の履歴が正しく処理されること、Short Career（ロデオドライブ4走）がconfidence="high"
として扱われること、position varianceが大きい馬のconfidenceが安定馬を上回らないことを
それぞれ確認した。Base Ability/Suitability V1/Formal Snapshotへのregressionは無い。
Frozen Benchmarkも70.3で不変。無理にA判定にしているわけではなく、11節の独立した
regression確認（Test G/H・Frozen Benchmark・本番11頭baseAbility）が全て一致した結果
としてのA判定である。

## 14. 次にChatGPTと決める必要がある項目（優先順位順）

1. **Position Band閾値（front/mid/rear）の妥当性検証**: 現状は既存4分類脚質の
   `STYLE_TO_BAND`マッピングをそのまま流用しているが、これがPosition Profile用途
   として適切かは未検証（本ラウンドでは「新規閾値を増やさない」ことを優先した）。
2. **positionStability閾値（stdDev 0.15/0.30）の校正**: 本ラウンドで明記した通り、
   V1の未検証な暫定値。将来バックテストでの校正対象。
3. **CHECKPOINT14C（Current Race Position Prediction）着手の可否**: Historical
   Position Profileは「過去の傾向」のみであり、「今回レースでどこを取るか」の予測
   （枠順・展開・ペース等を用いた予測）は本ラウンドで意図的に未着手のまま。
4. **条件分割（距離・コース・馬場）の要否**: 本ラウンドではV1として意図的に見送った
   （V1.1/V2候補として本文中にフラグ済み）。

以上、CHECKPOINT14B完了。CHECKPOINT14Cへは進まず、ここでSTOPする。

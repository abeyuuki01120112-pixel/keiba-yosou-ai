# Suitability V1 アーキテクチャ一本化（CHECKPOINT11.1・設計のみ、実装なし）

**作成日: 2026-08-23。ステータス: 設計文書のみ。本番コード変更なし。**

`docs/suitability-v1-connection-design.md`（CHECKPOINT11）が発見した「系統A
（`suitability.ts`系）・系統B（`suitabilityCoreV1.ts`系）の並存」を解消するため、
Suitability V1の正式アーキテクチャを1本に決める。**系統A維持＋系統B追加＋
HorseEvidence別系統、という三重構造は避ける。今回も本実装・接続は行わない。**

---

## STEP1: 系統A / 系統Bの責務比較

### 系統A（`suitability.ts`系）

| ファイル | 役割 | 入力 | 出力 | 自己参照 | future leakageリスク | 本番再利用性 | V1で残す価値 |
|---|---|---|---|---|---|---|---|
| `distanceSuitability.ts` | 対象馬自身の直近5走のうち距離帯近似度で重み付けした平均raceScoreを、直近5走全体平均と比較 | `RacePerformance[]`（直近5走）、`SuitabilityTargetRaceContext` | `DistanceSuitabilityComponent`（raw/adjusted/confidence/evidence等） | あり | 低（呼び出し側が「対象レースより前」のみ渡す前提。本ファイル自体に明示的な自己レース除外は無い） | 高（純関数・テスト済み） | 高（ロジック健全、実データ根拠あり） |
| `goingSuitability.ts` | 同上、対象は馬場状態の順序近似度 | 同上 | `SuitabilityComponent` | あり | 同上 | 高 | 高 |
| `courseSuitability.ts` | 同上、対象は競馬場×surface完全一致 | 同上 | `SuitabilityComponent` | あり | 同上 | 高 | 高 |
| `suitability.ts` | distance/going/courseの3コンポーネントを単純平均しclamp(90,110)、`effectiveAbility`まで算出 | 上記3関数の出力 | `SuitabilityBreakdown`, `EffectiveAbilityResult` | 間接的にあり | 同上（呼び出し側依存） | 高いが3要素限定 | 統合ロジック（単純平均+clamp）自体は暫定案として価値あり。7要素化には拡張要 |
| `finalRaceAbility.ts` | baseAbility×suitability→effectiveAbility、さらにpaceScenario×trackBias→raceContext→finalRaceAbilityまで合成するオーケストレーター | `FinalRaceAbilityInput`一式 | `FinalRaceAbilityResult` | 内部で自己参照（suitability・runningStyle推定）＋非自己参照（raceContext） | **低。唯一、対象レース自身を明示的に除外する二重防御あり**（`priorRaces = recentRaces.filter(r => r.raceId !== raceContextTarget.raceId)`） | 非常に高い（全体パイプラインの実例） | 非常に高い。オーケストレーション構造・leakageガードはそのままV1骨格に使える |

### 系統B（`suitabilityCoreV1.ts`系）

| ファイル | 役割 | 入力 | 出力 | 自己参照 | future leakageリスク | 本番再利用性 | V1で残す価値 |
|---|---|---|---|---|---|---|---|
| `suitabilityCoreV1Types.ts` | 7要素（distance/course/surface/turn/going/gate/runningStyle）schema、`horseEvidence`/`coursePrior`を分離保持する型定義 | なし（型のみ） | `SuitabilityComponentV1`, `SuitabilityCoreV1`, `HorseEvidenceDetail`, `CoursePriorDetail` | N/A | N/A | 高い（設計として） | **非常に高い**。要素粒度と二重計上防止の型構造はそのまま正式採用に値する |
| `suitabilityCoreV1.ts` | 7要素の安全な既定値生成＋東京ダート1600m gate componentのみ実データマッピング | `RaceGateInput`, `RunningStyleProfile` | `SuitabilityComponentV1`（`score`常にnull） | gate要素はCoursePrior由来（非自己参照）、他6要素は未評価 | 低（実質未計算） | 低（7要素中1つしか値が入らない） | 型は高評価だが、ビルダー関数自体は未熟 |
| `courseContextPrior.ts` | 東京ダート1600m限定の構造的CoursePrior算出（`gateCoefficient`・`empiricalValidationStatus`等） | `RaceGateInput`（frame等） | `CourseContextPrior` | なし（構造的・静的データ由来） | なし（対象レース自身の結果を一切参照しない） | 高いが東京ダート1600m限定 | 高い。「出典の主張」と「実測検証結果」を分離する`empiricalValidationStatus`設計は他コース拡張のテンプレートに値する |
| `horseGateEvidence.ts` + `horseEvidenceConfidence.ts` | 対象馬自身の過去走から、指定コース条件完全一致に該当する走歴の事実（gate位置・着順）を抽出するfact collector＋confidence判定 | `RacePerformance[]`, `HorseEvidenceCourseCondition` | `HorseEvidence`, `HorseEvidenceConfidence` | あり | 低（呼び出し側依存、系統Aと同じ弱点） | 高いが、raceScore/delta値を持たずgate位置の事実のみ | 中〜高。`sampleCount`/`confidence`の定義は`docs/horse-evidence-v1.md`と完全一致するため共通基盤として転用可。run内容の拡張が必要 |
| `gateValidationV1.ts` | 東京ダート1600m gate suitability実データ検証専用（30レース集計） | 検証専用データセット | `FrameStats`等 | なし | N/A（production未使用と明記） | 低（検証専用） | 低（V1アーキテクチャの一部にはしない） |

---

## STEP2: 正式系統候補A/B/C比較

| 観点 | 案A: 系統A拡張 | 案B: 系統B育成 | 案C: 新統合層（A/Bを内部部品化） |
|---|---|---|---|
| 既存コード再利用性 | 高い（3コンポーネントがそのまま使える） | 低い（実装がほぼ無い） | **高い**（Aの計算ロジック＋Bの出力型を両方再利用） |
| 技術負債 | 中（3→7要素化でsuitability.ts/型の書き直しが要る） | 高い（7要素分をゼロから実装、Aで既にできていることの再実装） | 中（統合層は新規だが中身は実証済み部品の組み合わせ） |
| future leakage | 低リスク（既存パターン健全） | 未知数（実装がほぼ無い） | 低リスク（既存部品を使う。統合層自体のグルーコードにはテスト要） |
| HorseEvidence接続しやすさ | 高い（自己参照計算を`abilityBeforeRace`基準へ置き換えるだけ） | 高い（型が最初から分離済み） | **高い**（Bの型構造をそのまま出力形式に採用） |
| CoursePrior接続しやすさ | 低〜中（CoursePrior概念自体が無い） | 高い（gateで実例あり） | **高い**（`courseContextPrior.ts`をそのまま部品化） |
| RaceContext分離 | 既に分離済み | 型上未明示（runningStyle混入の温床） | 設計次第で明確に保てる（統合層の責務をSuitability計算のみに限定） |
| テスト容易性 | 高い（既存テストあり） | 低い（実装がほぼ無く評価不能） | 高い（部品ごとに既存テスト＋統合層は薄いグルーコード） |
| effectiveAbility接続 | 実装済み | 未実装 | 既存ロジックをそのまま転用可能 |
| 将来拡張性 | 中（3要素専用設計） | 高い（型は7要素対応済み） | **高い**（7要素型を持ちつつ未実装componentは`notEvaluated`のまま運用可） |

**推奨: 案C。** ただし実質的には「系統Aの計算ロジック（実証済み・自己参照計算）を、系統Bの出力型（7要素＋horseEvidence/coursePrior分離）でラップする」新設の薄い統合層（例: `suitabilityV1.ts`）というアプローチであり、系統A・系統Bをそれぞれ「calculation engine」「output schema」として役割分担させ、三重構造を避ける。

---

## STEP3: HorseEvidence V1の正式配置

候補C（CoursePriorとHorseEvidenceをcomponent内で統合）は、`docs/gate-suitability-v1-decision.md`が既に定めた「優先順位はあるが1つの数値には混ぜない」方針に反するため**却下**。候補B（Suitability前段の独立レイヤー）は、HorseEvidenceが本来component横断的ではなく「distance用・going用・gate用…」とcomponentごとに条件が異なる性質を持つため、単一オブジェクトでは粒度を表現しづらい。

**推奨: 候補A（各component内部にhorseEvidenceを持たせる）。**
`suitabilityCoreV1Types.ts`の`SuitabilityComponentV1.horseEvidence`（`HorseEvidenceDetail`型）が既にこの設計であり、gate要素で実例（`coursePrior`フィールド）もある。

ただし、HorseEvidenceの計算処理自体（`rawPerformanceDelta`/median集約等）をcomponentごとに別々に実装するのではなく、**component横断で使える共通関数**（例: `computeHorseEvidenceForCondition(recentRaces, condition)`）として一度実装し、各component（distance/going/course/gate）が自分の一致条件を渡して呼び出す設計にする。これにより将来、系統Aの各self-referentialロジック（「自分の直近5走平均」との比較）を、HorseEvidence V1の「`abilityBeforeRace`」との比較へ置き換える移行も一本化しやすくなる。

`rawPerformanceDelta`をそのままSuitability percentへ変換することは、指示通り**今回は決定しない**（配置のみ）。

---

## STEP4: runningStyle重複監査

3つの異なる意味を明確に分離する。

1. **馬自身の脚質適性**（`runningStyle.ts`/`passingPositionRunningStyle.ts`が自己参照で推定する分布）: これは属性推定であり、Suitability percentそのものではない。後続計算(2)(3)への**入力**にすぎない。
2. **今回の展開との相性**（`paceScenarioFactor.ts`）: 脚質×想定ペース。今回のレース固有条件＝RaceContextの管轄。
3. **当日のトラックバイアスとの相性**（`trackBiasFactor.ts`）: 脚質×バイアス観測。当日固有条件＝RaceContextの管轄。

**推奨構造**: (1)は「馬固有の属性」としてSuitabilityの外側（Base Abilityに近い、馬プロファイルの一種）に位置づけ、Suitability componentとして`runningStyleSuitability%`は作らない。(2)(3)はどちらも今回のレース固有条件のため、現状どおり`raceContextFactor`に残す。

これにより`suitabilityCoreV1Types.ts`の7要素キーから`runningStyle`を外す（またはSuitability評価対象外として明示し、RaceContextへの参照のみ残す）ことで、脚質起因の二重加点を構造的に防ぐ。

---

## STEP5: V1正式component候補の4分類

| 要素 | 分類 | 理由 |
|---|---|---|
| distance | **V1正式採用** | 系統Aで実装済み・実データ根拠あり |
| course | **V1正式採用** | 同上 |
| going | **V1正式採用** | 同上 |
| gate | **V1正式採用** | HorseEvidence（要拡張）＋CoursePrior（東京ダート1600m限定）併存、優先順位決定済み。他コースは`notEvaluated`のまま運用 |
| surface | **V1保留** | 独立componentとして未実装。現状はdistance/going/course各コンポーネント内のフィルタ条件としてのみ存在 |
| turn（右回り/左回り） | **V1保留** | `RacePerformance`型にデータフィールド自体が無い。実装しても`notEvaluated`にしかならない |
| runningStyle | **RaceContextへ移動** | STEP4の結論通り |

### surface / turnを独立componentにすべきか、courseに内包すべきか

- 独立化のメリット: 同一競馬場で芝・ダート両方開催があるコースなど、courseが変わらずsurfaceだけ変わるケースを個別評価できる。
- 内包のメリット: 現状のデータ量（1頭あたり直近5走）では、distance/course/surfaceを別々に評価すると各コンポーネントがconfidence=lowになりやすく、情報として薄くなる。現行の`courseSuitability.ts`が`surface`を絞り込み条件に使っている設計（同競馬場×同馬場種別でしか比較しない）は、実質的にcourseがsurfaceの情報を暗に含んでいる。

**結論: V1では内包を維持し、独立component化はV1.1以降、実データニーズ（芝・ダート両方走る馬の実例が十分蓄積された時点）で再検討する。**

---

## STEP6: CoursePriorの配置

選択肢（componentの事前分布／弱い補助情報／RaceContext／独立layer）のうち、RaceContextは**該当しない**（CoursePriorは「そのコースが恒常的に持つ構造的傾向」であり、今回のレース固有・当日固有ではない時間軸のため）。独立layerは、Suitability全体の統合式に別途混ぜ込むロジックが必要になり、統合ロジックが二重化する。

**推奨: componentの事前分布（弱い補助情報）として、各component内部にcoursePriorフィールドを持たせる。**
STEP3で決めた「各component内部にhorseEvidenceを持たせる」と対になる形であり、既存の`SuitabilityComponentV1.coursePrior`設計・gate要素の実例と一致する。`docs/gate-suitability-v1-decision.md`の「HorseEvidence優先度1、CoursePrior優先度2」を、Suitability V1全体の設計原則として一般化する。

---

## STEP7: overallSuitability統合式の推奨（実装しない）

| 候補 | 特徴 |
|---|---|
| A. 単純平均（現行`suitability.ts`採用） | 実装済み・confidence shrinkとの二重加重リスクなし（`suitability.ts`のコメントで既に明記済み） |
| B. 重み付き平均 | 要素重要度を反映できるが、重みの根拠となる校正データが現状無い |
| C. 乗算 | 弱点が響きすぎる。componentが増えるほど100%からの乖離が指数的に効く |
| D. 幾何平均 | 乗算よりマイルドに弱点を反映。対数変換すれば単純平均と同型で扱いやすい |
| E. 最低値制約付き平均 | 1要素（特にconfidence=lowでノイズが大きい要素）がそのまま全体を決めてしまうリスク |
| F. confidence連動平均 | 各componentのadjusted算出時に**既にDesign-2縮小（shrinkTowardCenter）を適用済み**のため、統合段階で再度confidenceを重みに使うと二重加重になる（`suitability.ts`の既存コメントが明示的に禁止） |

**推奨**: 現行の単純平均（A）をV1の暫定統合式として維持する。理由は次の3点。

1. 実装・テスト済みで、confidence shrinkとの二重加重リスクが無いことが確認済み。
2. 乗算型・最低値制約型は「能力9割」の思想に対するリスクが大きい。極端な弱点1つでeffectiveAbilityを過度に押し下げると、baseAbilityの相対的な重みが損なわれかねない。単純平均＋`clamp(90,110)`の組み合わせが、Suitabilityの変動幅を狭い帯域に保つ最も安全な方式である。
3. 幾何平均（D）は将来の校正候補として保持するが、今回は正式決定しない。実データバックテストでの比較検証を待つ。

**統合式は「差し替え可能な1つの関数」として切り出しておく設計にする**（将来B/Dへ移行しやすくするため）。ただし今回は設計提案のみで実装しない。

---

## STEP8: effectiveAbilityへの唯一の出口

Suitability V1の正式出力は`overallSuitabilityPercent`の1つに限定する。

**既存`finalRaceAbility.ts`との競合回避案**: `finalRaceAbility.ts`を**引き続き正式出口として維持**する。現在`finalRaceAbility.ts`は内部で`computeSuitabilityBreakdown()`（3要素・系統A）を呼んで`overallSuitability`を得ているが、この呼び出し先だけを、STEP2で決めた新統合層（案C、7要素対応・HorseEvidence/CoursePrior接続済み）に**将来差し替える**。

- `effectiveAbility = baseAbility × overallSuitabilityPercent / 100`という式自体は`finalRaceAbility.ts`に既にあるロジックをそのまま正式継続する。
- `raceContextFactor`（pace×trackBias）は今回の設計対象外（既に良い分離ができている）のためそのまま維持する。
- こうすることで、新しい「唯一の出口」を別途新設せず、既存の`finalRaceAbility.ts`を活かしたまま内部のSuitability計算部分だけを段階的に差し替えられる。

**今回はこの差し替えも実施しない**（設計提案のみ）。

---

## STEP9: Base Ability / HorseEvidence凍結確認

今回のCHECKPOINT11.1でもコードは一切変更していない（Readと設計文書作成のみ）。
`raceScore.ts`・`baseAbility.ts`・`memberLevel.ts`・`abilityBeforeRace.ts`・
`timeGapScore.ts`・`raceTimeScore.ts`・`final3FScore.ts`・`weightScore.ts`は無変更。
`docs/horse-evidence-v1.md`の仕様も無変更。検証結果はSTEP15参照。

---

## STEP10: 最終推奨アーキテクチャ

```
Base Ability V1（凍結・値そのものは不変）
   |
   v
HorseEvidence（本人実績、component横断の共通関数として将来実装。今回は未実装のまま）
   |  → 各Suitability componentの horseEvidence フィールドへ格納（優先度1）
   v
Suitability Components（V1正式採用: distance / course / going / gate）
   |  → 各componentは horseEvidence（優先度1）＋ coursePrior（優先度2・弱い補助情報）を保持
   |  → surface/turnは内包 or notEvaluated、runningStyleはここに存在しない
   v
overallSuitabilityPercent（単純平均＋clamp、Suitability V1の唯一の出力。将来差し替え可能）
   |
   v
effectiveAbility = baseAbility × overallSuitabilityPercent / 100（finalRaceAbility.ts内、既存ロジック維持）
   |
   v
raceContextFactor = paceScenarioFactor × trackBiasFactor（今回のレース固有条件、脚質推定を入力として使用）
   |
   v
finalRaceAbility（既存の唯一の最終出口、変更なし）
```

**二重加点禁止の確認**:
- HorseEvidenceとCoursePriorは各component内で別フィールドとして保持されるのみで、1つの数値には混ぜない（優先順位ロジックで選択的に使う）。
- SuitabilityとRaceContextは完全に別の乗数としてbaseAbilityへ直列に効く（`baseAbility × suitability% × raceContext%`相当）ため意味は重複しない。runningStyleをSuitability componentから外すことで、脚質起因の二重加点も構造的に防ぐ。

---

## 完了報告（17項目）

1. **系統Aの評価**: 3要素（distance/going/course）は実装済み・自己参照・テスト済みだが、CoursePrior概念が無くsurface/turn/gate/runningStyleへの拡張余地が無い。`finalRaceAbility.ts`のオーケストレーション構造とleakageガードは特に高評価。
2. **系統Bの評価**: 7要素schemaとhorseEvidence/coursePrior分離の型設計は高評価だが、実装（`score`常にnull、gate以外未評価）はほぼ未着手。
3. **A/B/C統合案比較**: STEP2参照。案Cが両案の長所（Aの実証済みロジック＋Bの拡張可能な型）を両立。
4. **正式採用推奨案**: **案C**（新設の薄い統合層が、系統Aの計算ロジックと系統Bの出力型を内部部品として利用）。
5. **HorseEvidence V1の正式配置**: 各Suitability component内部に`horseEvidence`フィールドとして保持（候補A）。計算処理はcomponent横断の共通関数として1箇所に実装。
6. **runningStyle重複解消案**: 「馬自身の脚質適性」（属性推定）と「今回の展開/バイアスとの相性」（RaceContext）を分離し、Suitability componentからrunningStyleキーを除外してRaceContextへ一本化。
7. **V1正式component一覧**: distance / course / going / gate（4要素）。
8. **V1保留component一覧**: surface（courseに内包継続）、turn（データ自体が無い）。runningStyleはRaceContextへ移動のため保留ではなく除外。
9. **CoursePriorの正式配置**: componentの事前分布（弱い補助情報）として各component内部に保持。HorseEvidence優先度1・CoursePrior優先度2の原則をV1全体に一般化。
10. **overallSuitability統合式の推奨**: 単純平均＋`clamp(90,110)`を暫定V1採用のまま維持（「能力9割」思想を守るため乗算型・最低値制約型は不採用）。将来の校正で幾何平均へ移行できるよう関数を差し替え可能に設計。
11. **finalRaceAbility.tsの今後の扱い**: 変更せず、唯一の正式出口として維持。内部で呼ぶSuitability計算部分のみ、将来新統合層へ差し替える方針。
12. **effectiveAbilityへの正式出口**: `finalRaceAbility.ts`（既存のまま）。新規出口は新設しない。
13. **future leakageリスク**: 監査した全ファイルで新たなリスクは発見せず。系統Aコンポーネント単体には明示的な自己レース除外が無い点は既知（呼び出し側依存）だが、`finalRaceAbility.ts`が既に二重防御しているため実害なし。
14. **Base Abilityへの影響0確認**: Ability Model V1ファイル群は今回一切変更していない（Readのみ）。
15. **baseAbility=70.3再現**: `abilityModelV1.regression.test.ts`で再確認、変化なし。
16. **test/lint/build/validate:data**: 下記参照。
17. **次にChatGPTと決める必要がある項目（優先順位順）**:
    1. 新統合層（案C）の具体的なモジュール名・ファイル構成（例: `suitabilityV1.ts`として新設するか、既存`suitability.ts`をリネーム/拡張するか）。
    2. HorseEvidenceの共通関数（`computeHorseEvidenceForCondition`相当）の正式仕様（`docs/horse-evidence-v1.md`のrawPerformanceDelta/median集約をどうcomponentごとの条件に一般化するか）。
    3. `finalRaceAbility.ts`の差し替えタイミング（新統合層が4要素すべて実装完了してから一括差し替えるか、component単位で段階的に差し替えるか）。
    4. overallSuitability統合式の実データ校正計画（単純平均→幾何平均等への移行判断に必要なバックテスト設計）。
    5. surface/turn独立component化の要否再検討タイミング（データ蓄積状況の定期確認）。
    6. gate以外（distance/going/course）へのCoursePrior拡張要否・拡張する場合の実測検証手順（東京ダート1600mと同様の相関検証をコースごとに行うか）。

## test/lint/build/validate:data

コード変更を行っていないため回帰確認のみ実施:

```
npm test              # 509/509成功、変化なし
npm run lint            # 既存の警告のみ、新規エラーなし
npm run build            # 型チェック+ビルド成功
npm run validate:data     # 既存データの構造チェック成功
```

`abilityModelV1.regression.test.ts`でシェイクユアハートのbaseAbility=70.3が
変化していないことも再確認した。

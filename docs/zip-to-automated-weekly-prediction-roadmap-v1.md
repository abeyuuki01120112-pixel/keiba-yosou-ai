# ZIP手渡しゼロ → 毎週自動予想パイプライン ロードマップ v1

**作成日**: 2026-09-07
**ステータス**: ロードマップ作成・現状診断のみ。実装は一切行っていない。
**前提**: Windows PC + JV-Link 5.0.0でのJRA-VAN実データ取得可否は、別セッション（Windows側Claude Codeセッション）で検証中と報告されているが、
本リポジトリのブランチにはまだそのセッションからのコミットは反映されていない（`git log`／`git fetch`で確認済み。直近コミットは
`d7d08fe` JV-Link診断レポートのまま）。したがって本ロードマップの「Phase 1」は"これから接続する"前提で書く。

---

## 0. 調査方法

以下を実コードリードで確認した（推測・一般知識ではなく、リポジトリの実装事実）。

- `src/collector/` 一式（`collectRace.ts`／`providers/`／`normalize.ts`／`leakageGuard.ts`／`cache.ts`）
- `src/bridge/`（`requestBridge.ts`／`types.ts`）
- `src/integration/`（`predictionPipeline.ts`／`formalSnapshotPipeline.ts`／`derivedFromCollector.ts`／`uiTypes.ts`）
- `src/ability/` 配下、特に `finalRaceAbility.ts`／`raceContextTypes.ts`／`trackBiasFactor.ts`／`trackBias.ts`／
  `raceContextFactor.ts`／`courseContextPrior.ts`／`raceOutcomeEvaluation.ts`／`raceContextLeakageGuard.ts`／
  `suitabilityV1.ts`／`outcomeProbability.ts`／`predictionSnapshot.ts`
- `src/ability/import/predictionSnapshotStore.ts`
- `git log` / `git fetch origin` でWindows側の新規コミットが未着であることを確認

---

## 1. 既存コードの現状診断（コンポーネント別）

### 1-1. RealJraVanProvider
**存在しない。** `find src -iname "*realjravan*" -o -iname "*jvlink*"` は0件。
`RaceDataProvider`インターフェース（`src/collector/providers/RaceDataProvider.ts`）に準拠する実装は、現状
`FakeJraVanProvider`（`fakeJraVanProvider.ts`。中身はManualRawFileProvider→凍結済みGate Validationデータの流用で、
JV-Linkへの接続は一切ない）のみ。

### 1-2. Collector（`src/collector/`）
`collectRace(targetRaceId)`が Provider fetch → normalize → validate → prior-history取得 → Future Leakage監査 →
冪等キャッシュ書き込み、まで一気通貫で動く状態まで完成済み（V0で実装・テスト済み、2026新潟記念のFrozen Dataとの
Smoke Testも通過済み）。Provider差し替え型（Source Adapter）なので、RealJraVanProviderを追加するだけでこの部分は
そのまま使える設計になっている。

**ただし**: Future Leakage監査（`leakageGuard.ts`）は`priorRaceDate >= targetRaceDate`を違反とする設計であり、
これは「過去走データの中に対象レース以降のデータが紛れていないか」の監査であって、「対象レース自体のresultを
Collectorが取得すること」を妨げるものではない（レース後の結果取得＝Phase 5は別物として問題なく扱える）。

### 1-3. Bridge（`src/bridge/`）
`createRequest`/`processRequest`/`pollResponse`が揃い、requestId単位の冪等性・エラー種別（FETCH_UNAVAILABLE /
JRAVAN_ERROR / DATA_MISSING / FUTURE_LEAKAGE / VALIDATION_FAILED）の分類・テストも完備。**ファイルベース設計のため、
Windows側の実装言語をNode.js/TypeScriptに縛らない**（JSON入出力の契約さえ満たせばよい）。この部分は追加実装不要、
そのまま使える。

### 1-4. Prediction Pipeline（`src/integration/predictionPipeline.ts` / `formalSnapshotPipeline.ts`）
Collector出力→`buildGateConfirmedSnapshot()`+`buildAbilityBoard()`（Stage A）→2パスの`computeFinalRaceAbility()`
（STEP5）→`computeOutcomeProbabilitiesRaw()`（STEP6、T=10固定）まで、既存の凍結ロジックを**呼び出すだけ**の
統合層として動作確認済み（2026新潟記念で実データ検証済み）。

**重要な既知の制約**（前回セッションで確認済み、今回も再確認）:
`buildGateConfirmedSnapshot()`は内部で本番`data/horses/`から直接`getHorseRecentRaces()`を呼んでおり、
外部から渡した`priorHistories`はStage A（Base Ability/Suitability/effectiveAbility）には反映されない
（STEP5のfinalRaceAbility計算にのみ使われる）。つまり **Stage Aを自動更新するには、Collectorが取得した
データを`data/horses/`へ正規に取り込む経路が別途必要** であり、現状それは無い（Post-Race Update Shadow計算は
以下1-9の通りscript一回限りの手作業）。

### 1-5. Base Ability（`raceScore.ts`／`baseAbility.ts`／`abilityBeforeRace.ts`／`raceHistoryPipeline.ts`等）
V1として凍結済み・本番稼働中。Collectorや自動化とは独立して安定動作している。**このロードマップでは一切変更しない。**

### 1-6. Suitability（`suitabilityV1.ts`／`suitabilityCoreV1.ts`／`distanceSuitability.ts`／`courseSuitability.ts`／
`goingSuitability.ts`）
V1として本番接続済み（CHECKPOINT11.14）。Evidence Coverageに応じたconfidence処理も実装済み。
Collector自動化とは独立して動作するため、**この部分は自動化の障害にならない。**

### 1-7. Track Bias（`trackBias.ts`／`trackBiasFactor.ts`／`raceContextTypes.ts`）
**想定より実装が進んでいた。** `computeTrackBiasFactor()`は「脚質傾向×前残り/差し有利の観測」から95〜105%の
補正係数を出す計算式まで実装・テスト済み。ただし:

- `TrackBiasObservation`は**manual（人間入力）／auto（将来実装）**の二系統として型設計されているが、
  **autoは現状常にnull**（コード内コメントで明記: 「auto（将来実装、V1は常にnull）」）。
- `predictionPipeline.ts`／`formalSnapshotPipeline.ts`では`manualTrackBias: null, autoTrackBias: null`と
  ハードコードされており、**実運用のパイプラインでTrackBiasが実際に使われたことは一度も無い**
  （常にneutral=100%にフォールバックする設計であり、これ自体は安全側フォールバックとして正しく機能している）。
- `insideOutsideBias`（内外の有利不利）は型として存在するが、枠番データがRacePerformanceに無いため計算に
  一切使われていない（コード内コメントで明記）。

→ **結論**: Track Biasの「計算式」と「安全なfallback」は完成しているが、「観測データを自動または手動で
投入する経路」が存在しない。自動化ロードマップにおいてはPhase 3の中でも後回しにできる（無くても
neutral fallbackで安全に動く）が、精度向上のためには将来的な自動観測パイプラインの設計が必要。

### 1-8. 展開・脚質（`racePacePrediction.ts`／`passingPositionRunningStyle.ts`／`runningStyle.ts`／
`paceScenarioFactor.ts`）
過去の通過順位から脚質分布を自動推定するロジック（`passingPositionRunningStyle.ts`）は実装済みで、
`predictionPipeline.ts`内の2パス`computeFinalRaceAbility()`呼び出しで実際に使われている（1パス目で各馬の
分布を得て、2パス目でfield全体のペースシナリオを評価）。**これはTrack Biasと異なり、既に自動で動いている。**

### 1-9. Odds入力
**完全に未実装。** `winOdds`という型フィールド（`uiTypes.ts`／`derivedFromCollector.ts`／
`formalSnapshotPipeline.ts`）は存在するが、**すべて`null`固定**。オッズ取得ロジック・オッズProvider・
勝率とオッズを突き合わせて期待値を計算するモジュール（EV計算）は、`src`配下のどこにも存在しない
（`outcomeProbability.ts`はAI予測確率の計算のみで、市場オッズとの突合は範囲外）。**Phase 4は実質ゼロから
新規設計・新規実装になる。**

### 1-10. Prediction Snapshot（`src/ability/predictionSnapshot.ts`／`src/ability/import/predictionSnapshotStore.ts`）
Formal Prediction Snapshot（`FormalPredictionSnapshotRecord`）の保存・読込APIは本番稼働済み
（`listPredictionSnapshots()`/`loadPredictionSnapshot()`）。現状はStage A確定時点のスナップショットのみで、
オッズ・EV・買い目を含む「最終予想スナップショット」の型は存在しない。Phase 4で拡張が必要。

### 1-11. Post-Race Update（能力値の事後更新）
**production codeとして存在しない。** 2026新潟記念で行ったShadow計算（Before/After Base Ability）は、
このセッション内の一回限りのスクラッチ計算であり、`src/`にも`scripts/`にも再利用可能なモジュールとして
コミットされていない。具体的には:
- 過去に発見された重大なバグ（horseの全履歴を`buildRaceHistory()`に再投入すると過去のraceScoreが破壊される）
  への対処ロジック（`calculateTopNConfidenceWeightedMean()`直接呼び出し＋新走のみの孤立`buildRaceHistory()`呼び出し
  ＋`calculateRaceScore()`での手動再結合）は、レポート内に手順として記録されているだけで、
  コードとして`src/ability/postRaceUpdate.ts`のような形にはなっていない。
- 「Aルート（新エビデンス追加、毎週）」と「Bルート（予測誤差原因の修正、要複数レース検証）」を区別する設計方針は
  確認済みだが、Aルートを実行する自動化されたコマンド（`npm run update:ability -- --raceId=...`のようなもの）は無い。

→ **これはPhase 6着手前に必ず埋める必要がある明確なギャップ**（後述）。

### 1-12. Race Review（objectiveData / aiReview / humanReview）
**production codeとして存在しない。** 唯一の手がかりは`raceContextTypes.ts`内の`ManualRaceReviewNote`型
（raceId/raceDate/horseId/note/source/observedAtのみを持つ自由記述メモ）だが、これは
`raceContextLeakageGuard.ts`の`isRaceReviewEligible()`（future leakage判定）でのみ参照されており、
**実際にこの型のデータを保存・読込・何かのスコアに反映する経路は一切無い**（型が定義されているだけの
未接続状態）。今回ユーザーが要求している「objectiveData/aiReview/humanReviewの3系統分離＋source provenance」
という設計は、この`ManualRaceReviewNote`を土台にゼロから設計し直す必要がある規模の新規設計。

---

## 2. 提示されたPhase 1〜6の順序は妥当か

**結論: 大枠の順序は妥当。ただし2点の分割・補足を推奨する。**

### 2-1. Phase 3は「3a: 既存ロジックの接続確認」と「3b: Track Bias/展開の自動観測」に分けることを推奨

提示された順序ではPhase 3で「予想入力データ自動生成」を一括りにしているが、実態は:
- **3a（すぐ着手可能）**: Collector正規化データ→Base Ability/Suitability/finalRaceAbility/AI順位/勝率まで、
  既存`predictionPipeline.ts`をそのまま流すだけ。これはPRE-WINDOWS INTEGRATION V0で既に2026新潟記念において
  動作確認済み。RealJraVanProviderさえ繋がれば追加実装はほぼ不要。
- **3b（新規設計が必要、優先度は3aより低い）**: Track Bias自動観測（現状autoは常にnull）。これが無くても
  neutral fallbackで安全に動くため、**3bが無い状態でも毎週予想は成立する**。3bは「予測精度を上げるための
  将来拡張」として3aと分離し、無理に同時着手しない方がスコープが暴走しない。

### 2-2. Phase 6着手前に「Post-Race Update Engineの正式コード化」を挟むことを推奨

提示された順序ではPhase 5（結果自動回収）の直後にPhase 6（AI Review + Human Review）が来るが、
現状のPost-Race Update計算は前述の通り**再利用可能なコードになっていない**（一回限りのスクラッチ計算）。
Phase 6で「毎週自動でBase Abilityを更新する」ことを目指すなら、その前提として:

- Phase 5a: レース結果自動回収（Collectorの延長。RealJraVanProviderで結果データも取得できるようにする）
- Phase 5b（新規）: **Post-Race Update Engineの正式モジュール化**
  （2026新潟記念Shadow計算で確立した手順をコード化し、n=1以外のレースでも再現できる状態にする）
- Phase 6: AI Review + Human Review（3系統分離の型設計・保存・UI）

という3段に分けることを推奨する。Phase 6の中身（objectiveData/aiReview/humanReview分離）自体は
Post-Race Update Engineとは独立した設計課題（レース回顧の記録であり、能力値更新そのものではない）なので、
「Phase 5bで能力値更新の自動化」「Phase 6でレース回顧記録の3層分離」と役割を明確に分けるべき。

### 2-3 まとめた推奨順序

```
Phase 1  JV-Link → Collector実接続（RealJraVanProvider新規実装）
Phase 2  対象レース自動収集（週次スケジュール・エントリー自動取得）
Phase 3a 予想入力データ自動生成（既存predictionPipeline接続。ほぼ即着手可）
Phase 3b [並行・低優先] Track Bias/展開の自動観測設計（無くても安全に動くため急がない）
Phase 4  オッズ取得 → 最終予想 → 期待値（ゼロから新規設計・新規実装）
Phase 5a レース結果自動回収
Phase 5b [新規] Post-Race Update Engineの正式コード化（1回限りのShadow計算を再利用可能にする）
Phase 6  AI Review + Human Review（objectiveData/aiReview/humanReview 3系統分離設計・実装）
```

---

## 3. objectiveData / aiReview / humanReview 3系統分離についての設計方針（設計のみ、実装はまだ行わない）

ユーザー要求の通り、以下を今回は**設計方針としてのみ**記録する。

- 3つは別々の型・別々の保存領域に分離し、決して1つのオブジェクトに混在させない
  （例: `RaceReviewRecord { objectiveData: ObjectiveRaceData; aiReview: AiReviewResult; humanReview: HumanReviewNote[] }`
  のように、フィールドレベルで明確に分離する形が既存の`ManualRaceReviewNote`より適切）。
- `objectiveData`はJV-Van/Collector由来の実測値のみ（着順/actualRaceTime/timeGap/final3F/passingPosition/
  斤量/馬場/ペース等）とし、Source Provenance（`SourceProvenance`型を流用可能）を必ず保持する。
- `aiReview`は`objectiveData`のみを入力としてAIが評価した結果（例: raceScore再評価・展開評価）とし、
  `humanReview`の影響を一切受けない生成経路にする。
- `humanReview`はユーザー主観評価（自由記述＋将来的には構造化タグ化も検討）とし、**Base Ability等の計算式に
  無条件で加点・減点する経路を作らない**。将来的な「humanReviewが実際に予測精度向上に寄与するか」の検証は、
  別途バックテストで行える形（例: humanReviewありなしでのシミュレーション比較）で保持するに留める。
- 既存の`ManualRaceReviewNote`型は、この3分離設計の`humanReview`部分の前身とみなせるが、フィールドが
  自由記述メモのみで構造が薄いため、Phase 6で正式に再設計する（既存型をそのまま拡張するか、置き換えるかは
  Phase 6着手時にChatGPTと決定する）。

**今回はこの方針をドキュメント化するのみで、型定義・保存先・UIは一切実装しない。**

---

## 4. 【現在地】【不足しているもの】【次の3タスク】【今はやらないもの】【ChatGPTと次に決める項目】

### 【現在地】
- Windows PC + JV-Link 5.0.0での接続確認は別セッションで進行中と報告されているが、本リポジトリには
  まだ反映されていない（RealJraVanProviderは未実装のまま）。
- Collector V0・Bridge・Prediction Pipeline・UI V0は完成済みで、2026新潟記念の実データで動作検証済み。
  RealJraVanProviderさえ繋がれば、Phase 1〜3a相当は既存資産の再利用でかなりの部分をカバーできる。
- Track Bias・展開（脚質）の計算式は既に実装済みだが、Track Biasの自動観測データが無いため常にneutral
  fallback（安全側）で動いている。展開（脚質）の方は自動推定が既に実際に使われている。
- オッズ・EV・買い目判定・Post-Race Update Engine・Race Review（3系統分離）は、**いずれもコードとして
  存在しない領域**であり、Phase 4以降はゼロベースの新規設計が必要。

### 【自動化までに不足しているもの】（優先順）
1. **RealJraVanProvider実装**（Phase 1の中核。Windows側での実接続結果を踏まえて実装）
2. **対象レース自動収集の仕組み**（現状は毎回手動でraceIdを指定している。週次スケジュールから対象レースを
   自動判定する仕組みが無い）
3. **オッズ取得経路とEV計算モジュール**（Phase 4。現状ゼロから）
4. **Post-Race Update Engineの正式コード化**（現状は一回限りの手作業手順のみ）
5. **Race Review（objectiveData/aiReview/humanReview）の型設計・保存領域**（現状`ManualRaceReviewNote`は
   未接続の飾り型のみ）
6. （優先度低）Track Biasの自動観測データ取得経路

### 【次の3タスク】（ChatGPT判断待ちの領域を除き、着手可能な順）
1. Windows側セッションでのJV-Link実接続結果（実際に1件データ取得できたか、ログ・保存先）を確認し、
   本リポジトリへ反映する（RealJraVanProvider実装の前提情報が揃うまではPhase 1のコード実装に着手しない）。
2. RealJraVanProviderのインターフェース設計を`FakeJraVanProvider`と同じ`RaceDataProvider`契約に合わせて
   設計する（実装はWindows側の実データ取得結果を見てから）。
3. Phase 2（対象レース自動収集）の要件を具体化する
   ——「週次で何をトリガーに対象レースを決めるか」（開催日程表の自動取得か、手動指定した上での自動データ収集か）
   をChatGPTと合意してから設計に入る。

### 【今はやらないもの】
- Race Reviewの実装（型定義・保存・UIすべて）
- Post-Race Update Engineの実装（今回はコード化していない現状の確認のみ）
- 既存予想ロジック（Base Ability/Suitability/finalRaceAbility/Plackett-Luce/Temperature）の変更
- 大規模リファクタリング
- オッズ・EV・買い目ロジックの実装（設計にも今回は入っていない、Phase 4着手時に別途）
- Track Bias自動観測の実装

### 【ChatGPTと次に決める必要がある項目】（優先順）
1. **Windows側JV-Link実接続の現在の状態**（実際に何が取得できたか、RawRaceBundle形式に変換可能なデータが
   得られているか）——Phase 1着手の前提情報として最優先で必要。
2. **Phase 2の「対象レース自動収集」のトリガー設計方針**（開催日程の自動取得 vs 手動指定+自動データ収集の
   ハイブリッド）。
3. **Phase 4（オッズ・EV）の範囲の合意**——「AIが期待値を提示するだけ」で「買い/見送り/買い目の最終判断は
   常にユーザー」という既存の自動購入禁止の恒久方針を、Phase 4の設計にどう反映するか（表示のみか、
   推奨買い目まで出すか）。
4. Race Review 3系統分離の型設計を、既存`ManualRaceReviewNote`の拡張にするか新規に置き換えるか
   （Phase 6着手時でよいが、方向性だけ早めに合意しておくと手戻りが減る）。

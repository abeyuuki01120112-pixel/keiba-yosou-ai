# PRE-WINDOWS INTEGRATION + UI V0 — 実装報告

**作成日**: 2026-09-03

**結論を先に**: PHASE A〜Fすべて実装・動作確認を完了した。実際に
ブラウザ（Chromium、Playwright経由でスクリーンショット取得）で
2026新潟記念の実データがRace List→Race Detail→Horse Detailまで
正しく表示されることを確認した。Base Ability V1・Suitability V1・
memberLevel・final3F・finalRaceAbility・Plackett-Luce・Temperature・
各種weight/parameterは一切変更していない。

---

## 1. Windowsが無くてもどこまで完成したか

- **PHASE A（Mac↔Windows Data Bridge Contract）**: 完成。
  `requests/→completed/failed/`のファイルベースプロトコル、
  Idempotency、Error分類（FETCH_UNAVAILABLE/JRAVAN_ERROR/DATA_MISSING/
  FUTURE_LEAKAGE/VALIDATION_FAILED）まで実装・テスト済み。
- **PHASE B（Fake JRA-VAN Provider）**: 完成。既存Collector V0の
  `data/raw/`と、既存の凍結済みGate Validation実データ
  （10レース153行）の両方をデータソースとして使う`FakeJraVanProvider`を
  実装した。
- **PHASE C（Collector → Prediction Pipeline接続）**: 完成。
  2つの経路を実装した:
  1. Collector V0経由（`predictionPipeline.ts`）——RawRaceBundle→
     normalized→Base Ability V1→Suitability V1→Stage A→
     finalRaceAbility→Win Probabilityまで1関数呼び出しで実行。
  2. 既存の永続化済みFormal Prediction Snapshot経由
     （`formalSnapshotPipeline.ts`）——2026新潟記念の実際の
     Formal Snapshot（CHECKPOINT13.5B〜で既に生成・凍結済み）を
     入力に、finalRaceAbility・Win Probabilityまで追加算出。
- **PHASE D（Web UI V0）**: 完成。Race List・Race Detail・Horse Detail
  Drawerを実装し、実際にChromiumで動作確認済み（4節）。
- **PHASE E（Local Run）**: 完成。`npm run dev`だけでUIが起動する
  （後述12節、意図的にbackend/frontend分離をV0では行っていない）。
- **PHASE F（Windows Setup Runbook）**: 完成（設計・手順書のみ、
  実機未検証）。`docs/windows-jravan-collector-setup.md`。

## 2. Windows到着後に残る実装

- `RealJraVanProvider`本体（JV-Link COM相互運用のNode.js実装）。
  Node.jsからCOMコンポーネントを呼ぶ具体的な方法の選定から必要
  （このセッションでは着手・調査していない、最大の未知数）。
- Mac↔Windows間の実際の共有ストレージ手段の選定・設定
  （iCloud Drive/Dropbox/ローカルネットワーク等）。
- JV-Linkの速報/確定データ区別方法の確認（Future Leakage対策上重要）。
- 1レースSmoke Test・Future Leakage確認・Mac UI表示確認の実機実行
  （`docs/windows-jravan-collector-setup.md`8〜10節）。

## 3. Fake → Real Provider差し替え難易度

**低いと想定される（設計上の確認のみ、実機未検証）。**
`RaceDataProvider`インターフェース（`fetchRace(raceId):
Promise<RawRaceBundle | null>`）を満たす`RealJraVanProvider`を実装し、
`FakeJraVanProvider`を使っていた箇所（例:
`scripts/generateDerivedPredictions.ts`）で差し替えるだけでよい設計に
している。`collectRace()`・`requestBridge.ts`・Prediction Pipeline・
UIのいずれのコードも変更不要——ただし、これは設計上の期待であり、
実際にJV-Link連携を実装してみるまで、想定外の困難（COM相互運用の
複雑さ、データフォーマットの違い等）が無いとは断言できない。

## 4. Collector → Predictionまで通ったか

**通った。実際に2つの経路で確認した。**

- Collector経由: `JRA-20240505-NIIGATA-11`（2024新潟大賞典、16頭）で
  `collectRace()` → `runPredictionPipeline()`を実行し、16頭中
  production側にBase Abilityが算出できる馬について、
  effectiveAbility・finalRaceAbility・AI順位・Win%まで正しく算出
  （Win%合計=ちょうど100.0%、Plackett-Luceの制約を満たす）。
- Formal Snapshot経由: **2026新潟記念**（実際にこのプロジェクトで
  使用されてきた本物のレース）の永続化済みSnapshotから
  `runPredictionPipelineFromFormalSnapshot()`を実行し、
  ダノンシーマ（baseAbility=78.3）・ロデオドライブ（76.7）・
  ゾロアストロ（74.8、実際の1着）という、これまでのセッションで
  何度も検証してきた実数値と完全一致する結果を再現した
  （Win%合計=99.8%、独立丸めによる既知のずれ、
  `docs/win-probability-calibration-v1-research.md`で既に説明済みの
  現象と一致）。

## 5. UIから新潟記念を確認できるか

**確認できた。実際にブラウザで動作確認済み。**

- Race List: 2026-08-30 新潟 新潟記念（芝2000m、確定、予測済、結果あり）
  を含む6レースが日付降順で表示される。
- Race Detail: 11頭全頭のBase Ability・Suitability・finalRaceAbility・
  AI順位・Win%・Confidence・実着順が表示され、実着順（ゾロアストロ1着
  ほか、ユーザー提供の実データを再利用）も正しく表示される。
- Horse Detail Drawer: ゾロアストロを選択すると、Base Ability
  （74.8）・Suitability内訳（distance99.2%/course99.6%/going100%/
  gate100%）・過去走5走（皐月賞12着raceScore=70.2等）・Warningsが
  表示される——いずれも本セッションの過去ラウンド（Stage A内部分解
  研究）で手動検証した数値と完全一致する。

スクリーンショット3枚（Race List・Race Detail・Horse Detail）で
実機確認済み（このレポートには画像を含めていないが、ユーザー確認用に
別途送付可能）。

## 6. Mac上で正常起動できるか

**正常起動を確認した。** `npm run dev`のみでVite開発サーバーが起動し、
ブラウザから`http://localhost:5183/`（または既定の5173）でアクセスして
即座にUIが表示される（backend/frontendを分離した2プロセス構成には
していない、12節参照）。

## 7. Gate30へ再利用できるか

**再利用できる見込みは高い。** `collectRace()`・
`buildDerivedFromCollector()`はraceIdを引数に取る汎用関数であり、
Gate30の追加20レース（実データが収集され次第）にもそのまま使える。
ただし、`docs/gate30-phase1-basic-data-completion-audit.md`で
報告した通り、追加20レースの実データ自体はまだ収集されていない
——今回のCollector拡張はその収集済みデータを「取り込みやすくする」
側の改善であり、収集自体を代行するものではない。

## 8. 毎週の実戦レースへ再利用できる見込み

**Provider差し替え後は高い見込み。** `runPredictionPipelineFromFormalSnapshot()`
は、既存のFormal Prediction Snapshotワークフロー（枠順確定後に
`buildGateConfirmedSnapshot()`で生成・`persistPredictionSnapshot()`で
永続化）にそのまま接続でき、STEP5・STEP6を自動追加できることを
2026新潟記念で実証した。毎週この経路を使えば、Stage Aまでの
既存ワークフロー＋本ラウンドで追加したSTEP5/6自動化＋UIで、
実戦予想の確認作業を大幅に効率化できる見込みがある
（ただし生データ・出馬表入力自体の自動化はまだ無く、引き続き
人間側での`raceCardInput`準備が必要）。

## 9. 技術的負債

- **UI用「backend」を意図的に作らなかった**（12節で詳述）。将来、
  UIから新しい予測を能動的にトリガーする（例: 「このレースを予測する」
  ボタン）機能が必要になった場合、静的JSON読み込み方式では対応できず、
  小さなAPIサーバーの追加が必要になる。
- `FormalPredictionSnapshotRecord`にraceName（レース名）を保持する
  フィールドが無いことが判明した（`formalSnapshotPipeline.ts`の
  コメント参照）。今回は2026新潟記念1件のみ手動で正しい名前を
  上書きしたが、汎用的な解決（raceCardInputへのraceName追加等）は
  future scopeとして残っている。
- Collector V0の`PriorHistoryEntry.races`を、当初の縮約形
  （raceId/raceDate/raceScoreのみ）から`RacePerformance`全体へ
  型を拡張した（Suitability計算に必要なracecourse/surface/distance/
  goingが必須なため）。この変更に伴い、既存の5レース分の
  `normalized`キャッシュファイルを再生成した（内容は同一データの
  再構築であり、実データの変更ではない）。
- Horse Detail Drawerの表示が、狭いビューポート（1200px前後）で
  一部列が見切れる（過去走テーブルの右端）。iPad横画面
  （1194px以上）やより大きなノートPC画面では問題ないと想定されるが、
  実機での最終確認はしていない。

## 10. 次のCHECKPOINT（提案）

1. **KEIBA_DATA_DIRを実際のrepository外パスへ向ける運用開始**
   （現状は後方互換のためrepository内`src/collector/data/`を既定値と
   しているが、本来の目的である「大量データをGitへコミットしない」を
   実現するには、ユーザー側で実際の共有フォルダを用意し環境変数を
   設定する必要がある）。
2. `RawRaceBundle`形式JSONでのデータ授受を、Gate30追加20レース収集の
   本番運用として試験導入するか（前ラウンドの提案の継続）。
3. Windows PC入手後、`docs/windows-jravan-collector-setup.md`の
   未検証事項（特に1節「JV-LinkをNode.jsから呼ぶ具体的な方法」）を
   優先的に調査する。
4. UIの「backend」要否の再検討（9節）——UIから能動的に新しい予測を
   トリガーする機能が必要になった時点で着手する。

---

## Regression

新規/変更ファイル一覧（`git status --short`で確認、production
Ability計算コード・データは無変更）:

```
新規:
  src/bridge/（types.ts, requestBridge.ts, __tests__/）
  src/config/keibaDataDir.ts
  src/collector/providers/fakeJraVanProvider.ts
  src/integration/（predictionPipeline.ts, formalSnapshotPipeline.ts,
    derivedFromCollector.ts, uiTypes.ts, data/derived/*.json, __tests__/）
  src/components/（PredictionDashboard.tsx/.css, RaceListView.tsx,
    RaceDetailView.tsx, HorseDetailDrawer.tsx, SimulatorView.tsx,
    predictionDashboardData.ts, __tests__/）
  scripts/generateDerivedPredictions.ts
  docs/windows-jravan-collector-setup.md
  docs/pre-windows-integration-ui-v0-report.md

変更:
  package.json（npm script追加のみ: collect:race, generate:derived）
  src/App.tsx / src/App.css（タブ切り替え追加）
  src/collector/types.ts（PriorHistoryEntry.racesの型拡張、
    CollectedRaceIdentity.raceNumberのnull許容化）
  src/collector/cache.ts / providers/manualRawFileProvider.ts
    （KEIBA_DATA_DIR環境変数対応、既定パスは不変）
  src/collector/providers/productionHistoryProvider.ts
    （型拡張に伴う戻り値の変更、フィルタロジックは無変更）
  src/collector/data/normalized/*.json（型拡張に伴う再生成、5ファイル）
  src/collector/__tests__/collectRace.test.ts（型拡張対応のfixture更新）

src/ability/配下・data/horses/配下: 変更なし（git diff --stat空を確認済み）
```

```
npm test            → Test Files 80 passed / Tests 822 passed
                       （既存787 + Collector13 + Bridge10 + PredictionPipeline4 +
                       FormalSnapshotPipeline3 + PredictionDashboardData5 = 822）
npm run lint         → PASS（警告なし）
npm run build        → PASS（tsc -b・vite build共に成功）
npm run validate:data → 検証成功（既存warningのみ、新規warningなし）
npm run dev           → 正常起動を確認（Playwright経由でスクリーンショット取得、
                        Race List/Race Detail/Horse Detail全て表示確認済み）
```

---

以上、PHASE A〜Fの範囲でSTOPします。Real JRA-VAN Provider・JV-Link接続・
リアルタイムオッズ・Track Bias自動取得・斤量補正・Probability
Calibration変更・EVロジック変更・推奨買い目ロジック完成・自動投票・
一般公開・ユーザー登録・課金は、いずれも今回は実装していません。

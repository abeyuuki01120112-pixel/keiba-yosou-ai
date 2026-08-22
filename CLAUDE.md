# keiba-yosou-ai

競馬の期待値エンジン（`README.md`参照）。実装に着手する前に、必ず以下を読むこと。

## 必読ドキュメント

- **[`docs/prediction-philosophy.md`](docs/prediction-philosophy.md)** — 本プロジェクトの
  根幹思想。計算式・評価ロジック・UI設計・バックテスト方針すべてに優先する。
  実装がこの思想と衝突する場合、実装側を正しいものとして扱わず、まずこの思想との
  整合性を再検討すること。
- **[`docs/ability-model-v1.md`](docs/ability-model-v1.md)** — **能力測定器V1（raceScore・
  memberLevel V1・confidence・baseAbility・future leakage防止・fallback条件）の正式確定・
  凍結仕様。2026-08-22確定。** raceScore/baseAbility/memberLevel関連ファイルを触る前に必ず読み、
  文末「凍結ルール」に従うこと。既知の技術的負債は
  [`docs/ability-model-v1-known-issues.md`](docs/ability-model-v1-known-issues.md)に分離記録。
- **[`docs/step6-decisions.md`](docs/step6-decisions.md)** — STEP6 V1で正式決定した
  係数固定方針・confidence分離原則・データ不足の意味論、および現状実装との既知の衝突点。
- **[`docs/memberlevel-v1-decision.md`](docs/memberlevel-v1-decision.md)** — memberLevel V1と
  してconfidence考慮Top5方式を正式決定した経緯（検証ラウンドの記録）。本番実装は完了済み
  （`docs/ability-model-v1.md`参照）。

## 絶対に守ること（要約。詳細は上記2文書）

1. **馬の能力が9割。** オッズ・人気・騎手・調教・血統・馬体重・枠順を能力評価の
   主要因にしない。STEP1〜6にオッズ・人気は一切入力しない（STEP7以降のスコープ）。
2. **係数の無断調整禁止。** `outcomeScore.ts`／`stabilityFactor.ts`の重み・スケール定数は
   V1の仮パラメータとして固定済み。特定レースの結果に合わせて調整しない。将来の
   バックテストでのみ校正する。`PLACKETT_LUCE_TEMPERATURE=10`はV1の正式確定値。
   同様に、Ability Model V1（`raceScore.ts`・`baseAbility.ts`・`abilityBeforeRace.ts`・
   `memberLevelCandidates.ts`・`memberLevel.ts`・`timeGapScore.ts`・`raceTimeScore.ts`・
   `final3FScore.ts`・`weightScore.ts`）の数式・重み・定数も凍結済み
   （`docs/ability-model-v1.md`）。変更が必要な場合はV2として明示的に切り出すこと。
3. **confidenceは予測値を変えない。** confidence（信頼度）とscore/probability（予測値）は
   常に分離する。confidenceが低いからといってscore/probabilityを縮小・変更してはいけない。
4. **baseAbility=0は「能力0点」ではない。** データ不足による評価不能を意味する。
   この区別をUIやロジックで曖昧にしない。
5. **実データ以外を使わない。** プレースホルダー・推測・捏造データを実データとして
   混入させない。データ不足時は「何が不足しているか」を明確に報告し、勝手に埋めない。
6. **スコープを広げない。** 「シェイクユアハート1頭でbaseAbility V1の信頼性を証明する」ことは
   2026-08-22のCHECKPOINT 5で完了・凍結した（`docs/ability-model-v1.md`）。次フェーズ
   （適性・展開・トラックバイアス等）の設計・実装は、ユーザーの明示的な指示が出るまで
   着手しない。新STEP・大規模データ収集・新UIへの拡張も同様。
7. **future leakage禁止。** 対象レースの結果・着順・raceScore・final3F・オッズ等を、
   そのレース自身の評価に使わない。

## 開発コマンド

```bash
npm run dev            # 開発サーバー
npm run build           # 型チェック + ビルド
npm test                 # テスト
npm run lint             # oxlint
npm run validate:data    # 能力スコア用データの構造チェック
npm run import:csv       # CSV実データを src/ability/data/horses/ へ取り込む（--dry-run で確認のみ）
```

コード変更後は必ず `npm test` / `npm run lint` / `npm run build` / `npm run validate:data`
を実行し、既存の結果に回帰が無いことを確認すること。

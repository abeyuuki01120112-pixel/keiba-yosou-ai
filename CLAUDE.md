# keiba-yosou-ai

競馬の期待値エンジン（`README.md`参照）。実装に着手する前に、必ず以下を読むこと。

## 必読ドキュメント

- **[`docs/prediction-philosophy.md`](docs/prediction-philosophy.md)** — 本プロジェクトの
  根幹思想。計算式・評価ロジック・UI設計・バックテスト方針すべてに優先する。
  実装がこの思想と衝突する場合、実装側を正しいものとして扱わず、まずこの思想との
  整合性を再検討すること。
- **[`docs/step6-decisions.md`](docs/step6-decisions.md)** — STEP6 V1で正式決定した
  係数固定方針・confidence分離原則・データ不足の意味論、および現状実装との既知の衝突点。

## 絶対に守ること（要約。詳細は上記2文書）

1. **馬の能力が9割。** オッズ・人気・騎手・調教・血統・馬体重・枠順を能力評価の
   主要因にしない。STEP1〜6にオッズ・人気は一切入力しない（STEP7以降のスコープ）。
2. **係数の無断調整禁止。** `outcomeScore.ts`／`stabilityFactor.ts`の重み・スケール定数は
   V1の仮パラメータとして固定済み。特定レースの結果に合わせて調整しない。将来の
   バックテストでのみ校正する。`PLACKETT_LUCE_TEMPERATURE=10`はV1の正式確定値。
3. **confidenceは予測値を変えない。** confidence（信頼度）とscore/probability（予測値）は
   常に分離する。confidenceが低いからといってscore/probabilityを縮小・変更してはいけない。
4. **baseAbility=0は「能力0点」ではない。** データ不足による評価不能を意味する。
   この区別をUIやロジックで曖昧にしない。
5. **実データ以外を使わない。** プレースホルダー・推測・捏造データを実データとして
   混入させない。データ不足時は「何が不足しているか」を明確に報告し、勝手に埋めない。
6. **スコープを広げない。** 現在の最優先ゴールは「シェイクユアハート1頭でbaseAbility V1の
   信頼性を証明する」こと。新STEP・大規模データ収集・新UIへの拡張は、ユーザーの明示的な
   指示を待つ。
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

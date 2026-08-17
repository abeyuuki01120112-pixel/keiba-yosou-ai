# keiba-yosou-ai

競馬の期待値エンジン。AIが独自に展開やトラックバイアスを予想するのではなく、
**馬の能力データ ＋ 馬プロの展開・TB・ラップ等の予想 ＋ 確率的なブレ** を使って
1レースを大量にシミュレーションし、実オッズとの乖離から期待値の高い馬を探すためのツール。

## V0: 札幌記念シミュレーター

現在は札幌記念16頭を対象にしたV0（仮パラメータ版）。

- `src/simulation/` … UIから独立したシミュレーションロジック
  - `types.ts` … 馬の能力値・レース設定などの型定義
  - `probability.ts` … seed指定可能な乱数生成（mulberry32 + Box-Muller）
  - `raceEngine.ts` … 1レース分のシミュレーション（スタート〜ゴールの6フェーズ）
  - `simulationRunner.ts` … N回試走して勝率・連対率・複勝率を集計
  - `expectedValue.ts` … 適正オッズ・単勝期待値の計算
  - `horseData.ts` / `data/sapporoKinen.json` … 出走馬データ（差し替え可能）
- `src/components/` … 試走回数・ペース選択、結果ランキング表示などの最小限のUI
- `src/ability/` … 馬の能力スコア（baseAbility）計算ロジック。
  実質メンバーレベル・タイム差・走破タイム・上がり3F・斤量の5項目からraceScoreを算出し、
  直近5走の均等平均でbaseAbilityを出す。実データの投入方法は
  [`docs/data-input-guide.md`](docs/data-input-guide.md) を参照。

## セットアップ

```bash
npm install
npm run dev            # 開発サーバー
npm run build          # 型チェック + ビルド
npm test                # テスト
npm run lint            # oxlint
npm run validate:data   # 能力スコア用データの構造チェック
```

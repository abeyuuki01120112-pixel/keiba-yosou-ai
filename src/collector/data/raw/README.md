# Collector V0 — raw data cache

`ManualRawFileProvider`（`src/collector/providers/manualRawFileProvider.ts`）が
読み込む生データの配置場所。`<raceId>.json`という名前で、`RawRaceBundle`型
（`src/collector/types.ts`）に従ったJSONファイルを配置する。

**なぜライブ取得ではないか**: このセッションの実行環境では、
db.netkeiba.com・www.jra.go.jp を含む外部ネットワークアクセスが
egress proxyでブロックされていることを2026-09-03に実機確認した
（WebFetch・curl双方でEGRESS_BLOCKED、認証突破やアクセス制限回避は
一切試みていない——環境のネットワークポリシーによる構造的な制約）。
そのため、V0では人間またはChatGPT側がこのディレクトリへ生データを
事前配置する運用とする。配置後は`collectRace()`が自動的に
normalize→validate→Future Leakage監査→キャッシュ保存まで実行する
（ZIP/CSVの手動突合作業は不要になる）。

将来、外部ネットワークアクセスが許可された環境が用意された場合は、
`RaceDataProvider`インターフェースを実装した別のProvider（例:
NetkeibaLiveProvider）を追加し、このディレクトリへの手動配置を
経由せずに直接取得する構成へ移行できる。

## サンプルファイル

`JRA-20230507-NIIGATA-11.json`（2023年新潟大賞典、16頭）は、
`src/ability/data/gateValidation/niigataTurf2000GateHistoryV1.json`
（CHECKPOINT14D.1C監査済みの既存実データ）から抽出した**実データ**であり、
架空のサンプルではない。Collector V0のSmoke Test
（`docs/collector-v0-report.md`参照）でこのファイルを使用し、
Collectorの正規化結果が既存の凍結済みデータと一致することを確認した。
今後のCollector自動テストのfixtureとしても使用する。

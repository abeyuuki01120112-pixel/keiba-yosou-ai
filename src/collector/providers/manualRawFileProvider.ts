import fs from "node:fs";
import path from "node:path";
import type { RaceDataProvider } from "./RaceDataProvider";
import type { RawRaceBundle } from "../types";
import { keibaDataSubdir } from "../../config/keibaDataDir";

/**
 * PRE-WINDOWS INTEGRATION + UI V0で`KEIBA_DATA_DIR`環境変数対応に変更。
 * 未設定時は従来通り`src/collector/data/raw/`（repository内、既存fixture群の場所）を指す。
 */
export const DEFAULT_RAW_DIR = keibaDataSubdir("raw");

export const MANUAL_RAW_FILE_PROVIDER_VERSION = "0.1.0-v0";

/**
 * V0で実装した唯一の具体的Provider。
 *
 * 【なぜライブ取得ではないか】このセッションの実行環境では、
 * db.netkeiba.com・www.jra.go.jp・example.comを含む外部ネットワークアクセスが
 * すべてegress proxyでブロックされていることを2026-09-03に実機確認した
 * （WebFetch・curl双方でEGRESS_BLOCKED）。これは認証突破やアクセス制限回避を
 * 試みた結果ではなく、環境のネットワークポリシーによる構造的な制約である。
 *
 * そのため、生データは事前に`src/collector/data/raw/<raceId>.json`へ
 * 配置されたファイル（人間またはChatGPT側が配置する想定）から読み込む。
 * 既存のZIP/CSV手渡しと異なり、配置後はnormalize/leakageGuard/provenance/
 * cacheの自動パイプラインへそのまま接続される。
 *
 * 将来、外部ネットワークアクセスが許可された環境が用意された場合は、
 * `RaceDataProvider`を実装した別のProvider（例: NetkeibaLiveProvider）を
 * 追加し、`collectRace()`側でこのProviderと差し替えるだけで良い設計にしている。
 */
export class ManualRawFileProvider implements RaceDataProvider {
  readonly id = "manual_raw_file";
  readonly version = MANUAL_RAW_FILE_PROVIDER_VERSION;
  private readonly rawDir: string;

  constructor(rawDir: string = DEFAULT_RAW_DIR) {
    this.rawDir = rawDir;
  }

  async fetchRace(raceId: string): Promise<RawRaceBundle | null> {
    const filePath = path.join(this.rawDir, `${raceId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as RawRaceBundle;
  }
}

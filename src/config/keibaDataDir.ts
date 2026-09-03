import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 共有データ領域（KeibaData/）のルートディレクトリ解決（PRE-WINDOWS INTEGRATION + UI V0）。
 *
 * 環境変数`KEIBA_DATA_DIR`で上書き可能。未設定時は、既存Collector V0が使ってきた
 * repository内の`src/collector/data/`を既定値として維持する（後方互換性、
 * 既存raw/normalizedファイルの参照を壊さない）。
 *
 * 将来Windows PC到着後は、Mac側でこの環境変数をGitHubリポジトリ外の共有フォルダ
 * （例: `~/KeibaData`、iCloud DriveやDropbox等でWindows側と共有）へ向けることを想定している。
 * 大量の競馬データをGitへコミットする設計にしないため（ユーザー指示）、本番運用では
 * この環境変数を必ずrepository外のパスへ設定すること。
 */
export function resolveKeibaDataDir(): string {
  return process.env.KEIBA_DATA_DIR ?? path.join(__dirname, "..", "collector", "data");
}

/** `<KeibaDataDir>/<name>`を返す（raw/normalized/requests/completed/failed/odds/results等） */
export function keibaDataSubdir(name: string): string {
  return path.join(resolveKeibaDataDir(), name);
}

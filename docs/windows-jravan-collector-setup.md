# Windows PC / JRA-VAN Collector セットアップ手順（未検証）

**作成日**: 2026-09-03
**位置づけ**: PRE-WINDOWS INTEGRATION + UI V0のPHASE F。Windows PCを実際に
借りられた際の作業手順を先に文書化しておく。

**重要な注意**: **本ドキュメントの内容は実機検証していない（未検証）。**
Windows PC・JV-Link・JRA-VAN Data Labのいずれも、このセッションの実行環境
からはアクセス・確認できないため、公式ドキュメント・一般的なJV-Link利用の
知識に基づく計画であり、実際にWindows環境で試したときに手順が変わる
可能性がある。各手順に「未検証」の注記を付ける。

---

## 0. 前提・全体像

```
Windows PC（JV-Link/JRA-VAN Data Lab）
  ↓ 取得
RawRaceBundle（JSON、src/collector/types.ts）
  ↓ 書き込み
共有ストレージ（KeibaData/raw/）
  ↓ Mac側が読み取り
ManualRawFileProvider（既存Collector V0、無変更）
  ↓
collectRace() → normalize → Future Leakage Guard → Prediction Pipeline → UI
```

Windows側で新規に実装する必要があるのは「JV-Linkからデータを取得し、
`RawRaceBundle`形式のJSONへ変換して共有ストレージへ書き込む」部分のみ
（`RealJraVanProvider`、`RaceDataProvider`インターフェースの新規実装）。
Mac側のCollector・Bridge・Integration Layer・UIは無変更で動作する
——これが本V0の設計目標。

---

## 1. Windows準備（未検証）

1. Windows 10/11 PC（JRA-VAN Data Lab / JV-Linkの動作要件を満たすもの）を用意する。
2. .NET Framework等、JV-Linkが要求するランタイムをインストールする
   （JRA-VAN公式サイトの動作環境ページを参照——このセッションからは
   アクセスできないため未確認）。
3. Node.js（LTS版、Macと同等バージョン）をインストールする。

## 2. JRA-VAN Data Lab契約（未検証）

1. JRA-VAN公式サイトでData Lab会員登録・契約を行う（有償サービス）。
2. 利用規約・データ利用範囲を確認する
   （個人利用の範囲内であることを確認——本プロジェクトの
   「自動投票・一般公開はしない」という既存方針とも整合する）。
3. 契約後に発行される会員ID・パスワード等の認証情報を控える。

## 3. JV-Linkインストール（未検証）

1. JRA-VAN公式サイトからJV-Link（COMコンポーネント）をダウンロード・
   インストールする。
2. JV-Linkの初期設定（会員ID登録等）を行う。
3. JV-Link付属のサンプルツール等で、実際にデータが取得できることを
   単体で確認する（Node.jsコードを書く前に、まずJV-Link単体の動作を
   確認することを推奨）。

## 4. Repository準備（未検証）

1. Windows PC上に本repository（`keiba-yosou-ai`）をclone する。
2. `npm install`を実行する。
3. `npm test` / `npm run lint` / `npm run build` / `npm run validate:data`
   を実行し、Windows環境でも既存テストが通ることを確認する
   （Windows固有のパス区切り文字等の問題が無いか、この時点で洗い出す）。

## 5. Windows Collector設定（未検証・実装が必要）

1. `src/collector/providers/RaceDataProvider.ts`のinterfaceを実装した
   `RealJraVanProvider`（仮称）をWindows側で新規作成する。
   - JV-LinkのCOM APIをNode.jsから呼ぶ方法（`node-ffi`・`edge-js`・
     JV-Link用の非公式npmパッケージ等）を選定する必要がある
     （このセッションでは調査・選定していない、未着手）。
   - `fetchRace(raceId): Promise<RawRaceBundle | null>`を実装し、
     JV-Linkから取得したデータを`RawRaceBundle`形式（
     `src/collector/types.ts`）へ変換する。
2. 変換したデータの`RawRaceBundle`を、共有ストレージの`raw/`ディレクトリへ
   書き込む処理を実装する（`requestBridge.ts`の`processRequest()`と
   同じ書き込み先パターンを踏襲すればよい）。
3. `KEIBA_DATA_DIR`環境変数を、Mac側と共有する実際のフォルダパスへ設定する
   （6節）。

## 6. Macとの共有領域設定（未検証）

1. Mac・Windows間でファイル共有可能な領域を用意する
   （候補: iCloud Drive・Dropbox・OneDrive・ローカルネットワーク共有
   フォルダ・外付けドライブ等。具体的な選定はこのラウンドでは行っていない）。
2. その領域内に`KeibaData/`ディレクトリ（`raw/`・`normalized/`・
   `requests/`・`completed/`・`failed/`・`odds/`・`results/`）を作成する。
3. Mac側・Windows側の両方で環境変数`KEIBA_DATA_DIR`をこのパスへ設定する
   （`.env`ファイル、またはシェルのプロファイルで設定）。
4. **GitHubリポジトリへは絶対にコミットしないこと**
   （`.gitignore`にこの共有フォルダのパスパターンを追加することを推奨——
   ただし共有フォルダがrepository外にある限り、そもそも追跡対象にならない）。
5. 同期の競合（Mac・Windows双方が同時に同じファイルへ書き込む等）を
   避けるため、書き込みは常に「Windows側が`completed/`/`failed/`へ書く、
   Mac側は`requests/`へ書く」という一方向の役割分担を守ること
   （`requestBridge.ts`のIdempotency設計が前提とする役割分担）。

## 7. Fake Provider → Real Provider切替（未検証）

1. UI・Prediction Pipeline・Bridgeのコードは無変更のまま、
   `FakeJraVanProvider`を使っていた箇所（`scripts/generateDerivedPredictions.ts`
   等）を`RealJraVanProvider`に差し替える。
2. `RaceDataProvider`インターフェースを満たしている限り、
   `collectRace()`・`requestBridge.ts`・Prediction Pipeline・UIの
   いずれのコードも変更不要——これが本V0で最も重要な設計目標であり、
   この手順が「差し替えるだけ」で済むことを実機で確認することが
   PHASE Fの最終ゴールになる。

## 8. 1レースSmoke Test（未検証）

1. 既に結果が確定している任意の1レース（例: 直近の新潟の重賞）を対象に、
   `RealJraVanProvider`経由で`collectRace(raceId)`を実行する。
2. 既存の凍結済み実データ（`niigataTurf2000GateHistoryV1.json`等）と
   同じレースがあれば、両者を突合し、race identity・runner数・
   horse identity・finish関連フィールドが一致することを確認する
   （`docs/collector-v0-report.md`8節のSmoke Test手順と同じ考え方）。
3. 一致しなければ、どちらが正しいかを実際のJRA公式結果と突き合わせて
   確認する（既存データへ機械的に合わせるハードコードは禁止）。

## 9. Future Leakage確認（未検証）

1. `auditFutureLeakage()`（`src/collector/leakageGuard.ts`、既存・無変更）が、
   JV-Link経由の実データに対しても正しく機能することを確認する。
2. 特に、JV-Linkが「まだ確定していない出走予定」と「確定済みの結果」を
   区別して返すかどうかを確認し、Stage A予測時点（枠順確定後・発走前）で
   結果データが誤って混入しないことを検証する
   （JV-Linkのデータ種別・速報/確定の区別は、このセッションでは
   確認できていない未検証事項）。

## 10. Mac UIで表示確認（未検証）

1. Windows側で取得・書き込んだ`RawRaceBundle`を、Mac側の
   `npm run collect:race -- <raceId>`で正しく取り込めることを確認する。
2. `npm run generate:derived`（または同等の新しいスクリプト）で
   derived JSONを生成し、`npm run dev`でUIを起動して、
   Race List・Race Detail・Horse Detailに実データが表示されることを
   確認する。

---

## 未検証事項の一覧（優先度付き、次回Windows到着時に確認すべき順）

1. **JV-LinkをNode.jsから呼ぶ具体的な方法**（COM相互運用のライブラリ選定）
   ——これが無いと5節のReal Provider自体が実装できない、最大の未知数。
2. JV-Linkが返すデータのフォーマット（`RawRaceBundle`への変換ロジックの
   詳細設計）。
3. JV-Linkの速報/確定データの区別方法（Future Leakage対策上、重要）。
4. Mac ↔ Windows間の実際の共有ストレージ手段（iCloud/Dropbox/ローカル
   ネットワーク等、どれが同期遅延・競合の面で最も安定するか）。
5. JRA-VAN Data Labの利用規約上、この使い方（研究・個人利用としての
   自動取得）が問題ないかどうかの最終確認。

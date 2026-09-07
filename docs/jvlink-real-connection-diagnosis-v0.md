# JV-Link実接続診断 V0（コード変更なし・診断のみ）

**作成日**: 2026-09-05
**位置づけ**: Windows 11 PC（JV-Link 5.0.0インストール済み・試用期間・
利用キー未設定・JRA-VAN Data Lab.本契約前）が用意されたことを受けた、
実接続に向けた現状診断。**今回はコード変更・ファイル削除を一切行っていない
（診断のみ）。**

---

## A. 現在のJRA-VANまわりのアーキテクチャ

既存コードを実際に読み直して確認した（PRE-WINDOWS INTEGRATION + UI V0、
`b9d9fa8`で実装済み）。

```
Mac側（このリポジトリ）
  src/bridge/requestBridge.ts
    createRequest(raceId, requestedDataTypes)
      → KeibaData/requests/<requestId>.json を書く
    processRequest(request, provider)
      → provider.fetchRace(raceId) を呼び、
        completed/<requestId>.json または failed/<requestId>.json を書く
    pollResponse(requestId)
      → completed/failed を読んでMac側へ状況を返す

  src/collector/providers/RaceDataProvider.ts（interface）
    fetchRace(raceId): Promise<RawRaceBundle | null>

  src/collector/providers/fakeJraVanProvider.ts（現在の唯一の実装）
    1. ManualRawFileProvider（KeibaData/raw/<raceId>.json を読む）
    2. 上記に無ければ、既存の凍結済みGate Validation実データ
       （niigataTurf2000GateHistoryV1.json、10レース153行）から変換
    のいずれかでRawRaceBundleを返す。**JV-Linkへは一切接続していない
    （フル架空データを使わない、既存の実データのみを流用するFake）。**

  src/collector/collectRace.ts
    ManualRawFileProviderを使い、raw→normalize→Future Leakage監査→
    normalizedキャッシュ保存、まで実行する（Provider非依存の
    オーケストレーター、fakeJraVanProviderからも呼ばれる想定の設計）。

  src/integration/predictionPipeline.ts・formalSnapshotPipeline.ts
    Collectorの出力（またはFormal Snapshot）→ 既存の凍結済み
    Base Ability V1・Suitability V1・finalRaceAbility・Plackett-Luce
    まで一気通貫実行するIntegration Layer。**JV-Linkの有無に関わらず
    無変更で動作する設計**（RawRaceBundleの形式さえ揃えば良い）。

  src/config/keibaDataDir.ts
    KEIBA_DATA_DIR環境変数でKeibaData/のルートを指定。未設定時は
    repository内の`src/collector/data/`が既定値（**現時点ではまだ
    repository外の実際の共有フォルダへ向けられていない**）。
```

Windows側（JV-Link接続を担う想定の部分）は、**現時点ではコードが
一切存在しない。** `docs/windows-jravan-collector-setup.md`
（前回セッションで作成、実機未検証）に手順の想定のみが記載されている。
`RealJraVanProvider`という名前のファイル・クラスはまだ実装されていない
——`FakeJraVanProvider`の隣に置く想定のプレースホルダー的な言及が
コメント上にあるのみで、実体は無い。

**COM/ActiveX/JV-Link関連の依存パッケージ・呼び出しコードは
package.json・src/配下のいずれにも一切存在しない**（`grep`で
jv-?link|activex|win32com|edge-js|ffi-napi|node-ffi|winax を検索した
結果、docsの説明文以外に実装コードは0件）。

---

## B. Windows側に必要な環境

**重要な前提**: JV-Link（JRA-VAN Data Lab.用）は**32bit専用のCOM/ActiveX
コンポーネント**として提供されていることが一般的に知られている
（regsvr32でシステムへ登録するタイプのin-processサーバー）。この事実は
JRA-VAN公式の一般的な技術知識に基づくものであり、**本セッションはネット
アクセスができないため、JV-Link 5.0.0の最新の公式ドキュメントを直接
確認したわけではない**（後述F・Jで要確認事項として明記する）。

現在のリポジトリのスタック（Node.js/TypeScript/Vite、`package.json`で
確認済み）だけでは、32bit COMコンポーネントを直接呼び出す手段が
無い（Node.jsに標準のCOM interop機構は無く、`node-ffi-napi`等の
ネイティブアドオンも導入されていない）。したがって、**Windows側で
JV-Linkを実際に呼び出す部分は、このNode.js/TypeScriptリポジトリとは
別の言語・別のプロセスとして実装する必要がある**、というのが今回の
診断で得られた最も重要な結論である。

### 想定される必要環境（一般的なJV-Link利用パターンに基づく、要検証）

| 項目 | 想定 | 根拠・不確実性 |
|---|---|---|
| Windows 11 | 済み | ユーザー確認済み |
| .NET Runtime / .NET Framework | 必要 | JV-LinkのCOM Interopを最も安定して呼べる言語がC#（.NET）であるという一般知識に基づく。.NET Framework側のCOM Interop（tlbimp/regasm生成のInterop assembly）が伝統的な方法。.NET最新版（.NET 6/8等）でもCOM Interopは可能だが、32bit（x86）ターゲットでのビルドが必須になる見込み |
| Visual C++ Runtime | 可能性あり | JV-Link自体やその依存コンポーネントが要求する場合がある（JRA-VAN公式の動作要件ページで確認が必要、本セッションでは未確認） |
| Python（32bit版） | 代替案 | `pywin32`（`win32com.client`）でCOM呼び出しをする場合、**Python自体を32bit版でインストールする必要がある**（64bit Pythonは32bit専用COMコンポーネントをin-processでロードできない） |
| Node.js | 不要（Windows側では） | 既存のBridge設計はファイルベース（JSON）のため、Windows側の実装言語はNode.js/TypeScriptである必要が無い。C#やPythonで完結できる |
| リポジトリ本体 | 不要（最小構成でよい） | Windows側に必要なのは「JV-Linkから取得したデータをRawRaceBundle形式のJSONへ変換し、KeibaData/raw・completed・failedへ書き込む」ロジックだけであり、このTypeScriptリポジトリ全体をcloneする必要はない。ただし`src/collector/types.ts`のRawRaceBundle/RawRunnerRow等の型定義・`src/bridge/types.ts`のDataRequest/DataResponseCompleted/DataResponseFailedのJSON構造は、Windows側の実装が正確に一致させる必要がある（現状これらはTypeScriptの型定義でしか存在しないため、Windows側実装者向けに別途スキーマ文書やJSON Schemaとして書き出す必要がある——**これは今回未実施、Dで指摘する不足点**） |
| 32bit/64bit | **32bit（x86）ビルドが必須の可能性が高い** | JV-Linkが32bit専用という一般知識に基づく想定。実際にJV-Link 5.0.0がこの制約を持つかは、インストール済みのWindows PC上でJV-Linkのプロパティ（ファイルの詳細タブ等）を確認するか、JRA-VAN公式ドキュメントで確認する必要がある（本セッションでは未検証） |

---

## C. 既に完成している部分

- `RaceDataProvider`インターフェース（`fetchRace(raceId): Promise<RawRaceBundle | null>`）——
  Provider差し替えの受け皿として既に確立済み。
- `RawRaceBundle`／`RawRunnerRow`のスキーマ（`src/collector/types.ts`）——
  Windows側が生成すべきJSONの形が既に定義済み。
- `FakeJraVanProvider`——同じinterfaceの動作するサンプル実装として、
  実装時の参考にできる。
- Mac↔Windows Data Bridge（`src/bridge/requestBridge.ts`）——
  `requests/`→`completed/`・`failed/`のファイルベースプロトコルが
  実装・テスト済み（`src/bridge/__tests__/requestBridge.test.ts`、
  10件のテストで検証済み）。
- Future Leakage Guard（`src/collector/leakageGuard.ts`）——
  priorHistoryを含むリクエストで、対象レース日付以降の実績データが
  1件でもあればFAILにする仕組みが実装・テスト済み。
- Idempotency（同一requestIdの再処理防止）——実装・テスト済み。
- Error分類（FETCH_UNAVAILABLE/JRAVAN_ERROR/DATA_MISSING/
  FUTURE_LEAKAGE/VALIDATION_FAILED）——実装・テスト済み。
- Research Integration Layer（`src/integration/predictionPipeline.ts`・
  `formalSnapshotPipeline.ts`）——Collector出力からBase Ability V1・
  Suitability V1・finalRaceAbility・Plackett-Luce勝率まで一気通貫で
  実行できることを、2026新潟記念の実データで実証済み。
- UI V0（Race List/Race Detail/Horse Detail）——derived JSONを
  `import.meta.glob`で自動検出する方式のため、新しいレースのderived JSONが
  置かれれば無変更で表示できる。
- `docs/windows-jravan-collector-setup.md`——Windows側の作業手順の
  想定（実機未検証）。

**結論**: Mac側（TypeScript）の受け皿はすべて完成しており、
「Windows側からKeibaData/raw/へ正しい形式のJSONが置かれさえすれば」、
その先はコード変更なしで動く状態にある。

---

## D. 不足している部分

1. **`RealJraVanProvider`自体が存在しない。** ファイルすら作られていない。
2. **JV-LinkをWindows側から呼び出す実装コードが0件。** C#/Python等、
   どの言語で実装するかも未決定。
3. **Windows側実装者向けのスキーマ文書が無い。** `RawRaceBundle`・
   `DataRequest`・`DataResponseCompleted`・`DataResponseFailed`は
   TypeScriptの型としてしか定義されておらず、Windows側がC#やPythonで
   実装する際に参照できるJSON Schema・サンプルJSON集が用意されていない。
4. **共有ストレージ（KeibaData/）が実際にはまだ設定されていない。**
   `KEIBA_DATA_DIR`は現状repository内の既定値のままで、Mac・Windows間で
   実際にファイルを共有できる場所（iCloud Drive/Dropbox/ローカル
   ネットワーク等）がまだ決まっていない。
5. **JV-Link 5.0.0の正確なAPI仕様・動作要件（32bit/64bit、.NET
   Interop方法、必要ランタイム）を、このセッションでは公式ドキュメントで
   確認できていない**（ネットワークアクセス不可のため）。
6. **JRA-VAN Data Lab.の「試用期間・利用キー未設定」状態で、JVInit等の
   どの呼び出しまでが成功するのかが未検証。**

---

## E. JV-Link 5.0.0接続方式（一般的な技術知識に基づく整理、要検証）

**重要な留保**: 以下はJV-Link・JRA-VAN Data Lab.に関する一般的に
知られている技術情報に基づく整理であり、**JV-Link 5.0.0固有の公式仕様を
このセッションで確認したものではない**（ネットワークアクセスが
ブロックされているため）。実装前に、ユーザー自身がJRA-VAN公式サイトの
開発者向けドキュメント・SDKのヘルプファイルで最終確認することを
強く推奨する。

- **COM/ActiveX**: JV-Linkは一般に32bit専用のCOMコンポーネント
  （in-processサーバー）として提供されている。`regsvr32`でシステムへ
  登録し、COMクライアント（VBA/Excel、C#、VB.NET、Python等）から
  ProgID経由でインスタンス化して使う方式が伝統的に案内されている。
- **32bit/64bit**: 32bit専用の可能性が高い。呼び出し側プロセスも
  32bit（x86）でビルド・実行する必要がある見込み（64bitプロセスから
  32bit専用in-process COMサーバーを直接ロードすることはできない）。
- **Pythonから直接呼ぶか**: `pywin32`（`win32com.client.Dispatch`）で
  技術的には可能だが、**Python自体を32bit版でインストールする必要が
  ある**（上記32bit制約のため）。
- **C#等のWindows専用ラッパーを挟むか**: 最も実績が多いとされる方法。
  JV-LinkのタイプライブラリからCOM Interop assemblyを生成
  （Visual Studioの「参照の追加」またはtlbimp.exe）し、C#
  （.NET Framework、またはビルドターゲットをx86に固定した.NET最新版）
  から呼び出す。JRA-VAN公式サイトが配布するサンプルコードも、
  伝統的にVB6/VBA/C#向けが中心とされている。
- **既存Bridge設計をそのまま利用できるか**: **できる。** 既存の
  `src/bridge/`はファイルベース（JSON経由）のプロトコルであり、
  Windows側の実装言語をNode.js/TypeScriptに縛っていない。C#やPythonで
  実装した`RealJraVanProvider`相当のプログラムが、
  `KeibaData/requests/`を監視（またはWindows側から手動起動）し、
  JV-Linkから取得したデータを`RawRaceBundle`と同じJSON構造で
  `KeibaData/raw/<raceId>.json`へ書き出し、`completed/`・`failed/`へも
  同じスキーマでJSONを書けば、Mac側のコードは一切変更せずに機能する。

---

## F. 無料/試用状態で確認可能な範囲（要検証事項として整理）

**このセッションでは実機検証できない**（Windows PCへ直接アクセスできない、
かつJV-Link公式ドキュメントもネットワークブロックのため参照できない）
ため、以下は一般的に知られている情報に基づく**推定**であることを
明記した上で整理する。

- JV-Linkの設定画面が起動する・COMコンポーネントとして認識されている
  状態（ユーザー確認済み）は、**COMの登録自体は成功している**ことを
  示す、確実な事実。
- JRA-VAN Data Lab.は一般に、開発者向けの`JVInit`等の初期化呼び出しに
  ソフトウェアID（sid、JRA-VANへの開発者登録で無償発行されることが
  多いとされる）を必要とし、この時点では料金は発生しないことが
  一般的に案内されている——**ただし本セッションでは未確認。**
- 実際のレースデータ取得（`JVOpen`/`JVRead`相当のAPI）は、JRA-VAN
  Data Lab.の有償契約に基づく「サービスキー」が必要になる可能性が高い
  ——**契約前の試用期間でどこまでのデータ種別・件数が取得できるかは、
  ユーザー自身がJRA-VAN公式サイトまたはJV-Linkのヘルプファイル内で
  確認する必要がある。**
- **したがって、今回のWindows PCの現状（利用キー未設定・本契約前）では、
  「JV-Linkが正しくインストールされ、設定画面が開ける」ことの確認までは
  できているが、実際のレースデータを1件でも取得できるかどうかは
  未検証・不透明**というのが正直な現状評価である。

---

## G. 最初の実データ取得テスト案（提案、まだ実行しない）

**絶対条件（本契約・課金を前提にしない、いきなり大量取得しない）に
従い、以下の順序を提案する:**

1. **JVInit相当の初期化呼び出しのみを行うテスト。** 実際のデータ取得
   （JVOpen等）はまだ行わず、COMオブジェクトが正常にインスタンス化・
   初期化できるかどうかだけを確認する。これが成功すれば「COM接続
   自体は生きている」ことが分かる。
2. **初期化が成功した場合のみ、最も小さい・古いデータ種別を1件だけ
   要求するテストへ進む。** 例えば、既に決着済みで再現性の高い
   「過去の特定重賞1レース」の確定成績データを1件だけ取得する
   （新しいレースの速報データより、確定済み過去データの方が
   Future Leakageのリスクが無く安全）。
   - 対象レース例: 既にこのプロジェクトの`data/horses/`・
     Formal Prediction Snapshotで実データが確認済みの2026新潟記念
     （raceId=JRA-20260830-NIIGATA-08）を候補にする。実際にJV-Link経由で
     取得した結果を、既存の（ChatGPT relay経由で取得済みの）実データと
     突き合わせることで、**取得結果の正しさをこのプロジェクト内で
     既に検証済みの実データと直接比較できる**という利点がある。
3. **1件のテストが成功し、内容の整合性が確認できた場合のみ**、
   件数を増やす・複数レース種別を試す、という段階に進む。
   **今回はこの1件テストの提案までとし、実行はしない。**

---

## H. 実装する場合の作業手順（優先順位順、まだ実装しない）

1. JV-Link 5.0.0の正確な仕様確認（32bit/64bit、必要ランタイム、
   JVInit時に必要な情報、無償で確認できる範囲）——ユーザー自身が
   JRA-VAN公式サイト・SDKヘルプで確認（本セッションはネット不可）。
2. Windows側の実装言語決定（C#/.NET x86 が現時点の第一候補、
   Python 32bit版が代替候補）。
3. `RawRaceBundle`・`DataRequest`・`DataResponseCompleted`・
   `DataResponseFailed`のJSON Schema／サンプルJSON集をWindows側実装者
   向けに書き出す（現状TypeScript型定義のみのため、言語非依存の
   仕様書が必要）。
4. Windows側で「JVInitのみ実行する」最小の疎通確認プログラムを作成
   （まだJVOpen/JVReadは呼ばない）。
5. 疎通確認が成功したら、G節の1件テスト案を実行し、
   `RawRaceBundle`形式のJSONを実際に1件出力してみる（KeibaData/raw/へは
   まだ書き込まず、まずは単体でファイル出力を確認）。
6. Mac・Windows間の共有ストレージ（KeibaData/）の実際の場所を決定し、
   `KEIBA_DATA_DIR`をMac側・Windows側の両方で設定する。
7. Windows側から`KeibaData/raw/<raceId>.json`へ実際に書き込み、
   Mac側の`ManualRawFileProvider`（既存・無変更）経由で
   `collectRace()`が正しく読み込めることを確認する（**この時点でも
   `FakeJraVanProvider`は置き換えない**——新しいReal用の経路として
   並行稼働させる）。
8. `RealJraVanProvider`（TypeScript側、`RaceDataProvider`実装）を
   新規追加する。ただしこのProviderの役割は「Windows側が既に
   `KeibaData/raw/`へ書き込んだファイルを読む」ことに限定するか、
   あるいはWindows側プロセスをMacから起動する仕組みを作るかは、
   6-7の結果を見てから設計する。
9. Real JV-Link Shadow Test（既存の研究環境と並行、production
   移行ではない）として、実データが正しく取得できることを複数回
   確認してから、初めて`FakeJraVanProvider`から`RealJraVanProvider`への
   本格切り替えを検討する。

---

## I. 今このWindows PCでユーザーが最初にやるべき操作

**コード実装より前に、ユーザー自身が確認・調査すべき事項**
（本セッションはネットアクセス不可のため、これらはユーザー側での
確認が必須）:

1. JV-Link 5.0.0が32bit専用か64bit対応かを確認する（インストール
   フォルダのファイルプロパティ、または公式ドキュメント）。
2. JRA-VAN Data Lab.の開発者向けページで、「JVInit等の初期化のみ
   無償で試せる範囲」と「実際のデータ取得に必要な契約・サービスキー」の
   境界を確認する。
3. JV-Linkに同梱されているサンプルコード・ヘルプファイル
   （多くの場合、VB6/VBA/C#サンプルが同梱されている）を確認し、
   実際にどの言語での接続例が公式に提供されているかを確認する。
4. 上記が確認でき次第、その内容をChatGPT側またはこのセッションへ
   共有してもらえれば、E・G・H節の内容を実際の仕様に基づいて
   更新できる。

---

## J. 次にChatGPTと決める必要がある項目（優先順位付き）

優先度1: **Windows側の実装言語をC#（.NET, x86ビルド）にするか、
Python（32bit）にするか。** JV-Link同梱サンプルの言語（I節3.の
確認結果）に合わせるのが最も手戻りが少ないと考えられる。

優先度2: **JRA-VAN Data Lab.の本契約をいつ行うか。** 現状の
試用状態でJVInitまでは試せる可能性があるが、実データ取得には
契約が必要になる可能性が高い。今回のShadow Test方針
（本契約や課金を前提にしない）を維持したまま、どこまで進められるかを
I節の確認結果を踏まえて再度すり合わせる必要がある。

優先度3: **Mac・Windows間の共有ストレージ（KeibaData/）の実際の
選定。** iCloud Drive/Dropbox/ローカルネットワーク共有等、具体的な
手段をまだ決めていない。

---

## Regression

診断のみ（既存ファイルの読み込み確認・`grep`検索のみ）。新規作成した
ドキュメント1件（本ファイル）以外、production code・production data・
既存ファイルの変更・削除は一切行っていない。

```
git status --short → docs/jvlink-real-connection-diagnosis-v0.md のみ
npm test            → 既存822件、回帰なし
npm run lint         → PASS
npm run build         → PASS
npm run validate:data → 検証成功（既存warningのみ）
```

以上、診断の範囲でSTOPします。JV-Link呼び出しコード・
`RealJraVanProvider`の実装、`FakeJraVanProvider`の置き換え、
`KEIBA_DATA_DIR`の実際の外部パスへの変更は、いずれも今回は
行っていません。

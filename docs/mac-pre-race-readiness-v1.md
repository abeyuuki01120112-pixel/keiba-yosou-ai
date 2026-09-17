# Mac Pre-Race Readiness — P0-1R

2026-09-17。コードの入口は `src/integration/preRaceReadiness.ts`、CLIは
`scripts/checkPreRaceReadiness.ts`。読み取り診断だけを行う。
以前のP0-1文書にあった、SHAやraw解析を実装済みとする記述は当時のコードと不一致だった。
本書はP0-1Rで実際に追加した保証と、残る制限を記録する。

## 保証範囲と状態

- READY: 以下のStage A受領条件をすべて満たす。その読み取り時点の入力受領判定。
- WAITING: receipt/plan未到着、Windowsが正式RA待ち等を報告。
- FAILED: SHA・サイズ・identity不一致、壊れたraw、upstream失敗等。
- BLOCKED: 証拠不足、履歴不完全、時刻証明不能、未対応Stage等。

**Stage Bの専用snapshot/condition証跡validatorは未実装。** Stage Bはreceipt未到着なら
WAITING、Stage A receiptの流用はFAILED、その他の到着済み形式はBLOCKED。
Stage Bを検証済みとは扱わない。P0-2の実装・Prediction生成は本変更に含まない。

Prediction eligibilityはUNKNOWN/BLOCKEDだけを返す。Formal Gateを実行せずPASSは返さない。
完全に取得された短キャリアはinput READYとeligibility BLOCKEDを両立できる。
部分取得やキャリア完全性が不明な短い履歴はinput BLOCKED。

## 一次契約

OneDriveのWindowsデータ収集root内で読んだ既存スクリプト:

- `scripts/Invoke-ShadowWatch.ps1`: plan-reference、通常/復旧receiptの生成形式。
- `scripts/Test-ShadowStageAArtifact.ps1`: Stage A manifest、stage 2、cutoff、全頭数検証。
- `scripts/Collect-ShadowStageA.ps1`: collection-summary、runDir、取得状態。

Mac側の `JvRecord` と `runFolderLoader` のレコード構造・selection契約も確認した。
新しいWindows schemaを要求する変更やWindows側ファイルの変更はしていない。

### Stage Aの必須証拠

1. 明示したMac root、raceId、Stage、runDir、runId、receipt、plan-reference、cutoff。
   Windows絶対パスの場合は対応するWindows rootも明示する。
2. `plan-reference.json.path / sha256` → preparationをSHA256照合。
   `ready=true`、対象`canonicalRaceId`が一意、`raceKey / startAt`を確定。
3. receiptの位置がplan-referenceと同じ日次ディレクトリの
   `stage-a-receipts/<raceKey>.json`。
4. `summary.runDir`が明示runDirと一致。
   canonical runIdは**Windowsプロジェクトrootからの完全な相対runパス**。
   basename、mtime、latestで選択しない。入力runId、receiptのrunパス、実ディレクトリ、
   SHA確認済みmanifestの所在runパスを比較する。manifestに直接runIdがあればそれも比較。
5. 通常receipt: `summary.status=ACQUIRED_SYNC_NOT_CHECKED|PARTIAL_HISTORY`、
   `sourceSummary / sha256`、保存summaryとの内容一致、raceId/raceKey一致。
   復旧receipt: `recovered=true / manifest`のパスが選択runの`raw/manifest.json`と一致。
6. `historyFetchAvailable=true / historyComplete`とmanifest diagnosticsが一致。
7. `files[].path / sha256`をすべて検証。保存されている`bytes / sizeBytes`も照合。
   manifest、target-records、history-recordsの3つには必ずSHA参照が必要。
   SHAがない場合にその場で生成して承認することはない。
8. manifestの`schemaVersion=jvlink-raw-v1 / source=JRA-VAN/JV-Link`、
   `targetRaceId / targetRaceKey / raceDate / recordFiles / record counts`を照合。
9. raw全行をJSON envelopeと固定長RA/SEとして解析。
   `bytes / sourceFile / providedAt / retrievedAt`、base64、長さ、CRLF、作成日を検証。
   対象record全件が同じraceId/key・stage 2。対象外recordを暗黙に捨てない。
10. 対象RAは1件。RA登録頭数(882)とSE数一致、SE血統登録番号(31)が一意・非空。
    枠/馬番が確定、馬番重複なし。track codeは既存Windows検証の17/18/24だけ。
    RA発走時刻(874)もplanと照合。
11. 履歴selection集合と対象SE ID集合が一致。missing/unexpected/duplicateを出力。
12. 時刻境界と履歴の以下の検査がPASS。
13. 選択runの.tmp/partial/incomplete、FAILED/非ゼロexitCode/error JSONを拒否。
    親ディレクトリのcollection-summaryが**同じrunDirを明記して失敗**している場合も拒否。
    無関係な過去runの失敗とは混同しない。
14. 読んだ全ファイルを終了直前に再読し、診断中の変更を検知。

root外参照、親への遡り、symlinkは受理しない。Windowsパスは明示rootのprefixだけを写像する。
SHAは同期整合性の証拠であり公式ソースの電子署名ではない。信頼するWindows producer/receiptの
境界を越えて、攻撃者が証跡一式を改ざんしていないことまでは証明しない。

## Population / Horse History

populationの基準は**対象stage 2 RA + SEの公式血統登録番号**。
架空のmanifest.runnersも馬名joinも使わない。

`historySelections[].horseId / status / availableHistoryCount / selectedRaceKeys`を、
実history SEのhorseId/key/順序とRA参照に照合。選択は最大5走、重複なし。
余分な馬・未選択RA、対象日以降の履歴、非対応stageを拒否する。
履歴stageは既存collectorの6/7/Bを扱うが、海外Bを検出した場合のeligibilityはBLOCKED。

各馬のselected count・race keys・selection status・source referencesを出力する。
5走availableはfull。5走未満では既存`careerStartCountAsOf`と実選択数が一致する場合だけ
shortCareerまたはverifiedNoPrior。空配列だけからNO_PRIORにしない。
この分類は既存manifestのキャリア申告を照合するもので、Formal GateのCareer Completeness証明を
新しく生成するものではない。0〜2走はeligibility BLOCKEDとして残す。

## Cutoff

入力cutoffはmanifest.targetAsOfと同じ時刻であることを要求する。
Stage Aの既存Windows規則どおり`collectedAt < cutoff < plan.startAt - 40分`。
全rawのprovidedAt/retrievedAt、存在するavailableAt、manifest provenanceの時刻配列、
通常summaryの取得時刻を検査。raw作成日 <= providedAt <= retrievedAtもJvRecordで検証する。
データ時刻がcutoffを超える場合はBLOCKED、必須時刻の欠損や壊れたenvelopeはBLOCKED/FAILED。
receipt検出・公開時刻をrawの利用可能時刻へ置き換えない。

ここでのcutoffは**選択した入力runの境界**。Predictionはまだ生成しておらず、
「実際に生成したPredictionのcutoffを検証済み」とは主張しない。
将来の消費側は同じ固定run/digestと明示cutoffを再検証する必要がある。
読み取り終了後のOneDrive変更をロックする機能はない。

## CLI

```sh
npm run readiness:pre-race -- \
  --root '/absolute/Mac/Windows-project-root' \
  --windows-root 'C:\Users\abeyu\OneDrive\ドキュメント\競馬予想AI_Windowsデータ収集' \
  --race-id JRA-20260919-NAKAYAMA-10 --stage STAGE_A \
  --run-id 'data/EXACT_RUN_PATH' --run-dir 'data/EXACT_RUN_PATH' \
  --plan-reference 'data/EXACT_DAILY_PATH/plan-reference.json' \
  --receipt 'data/EXACT_DAILY_PATH/stage-a-receipts/EXACT_RACE_KEY.json' \
  --expected-cutoff-at 'EXACT_MANIFEST_TARGET_AS_OF'
```

上記は実行用の実値ではなく指定形式の例。代替runの自動選択は禁止。
複数raceは`--selections /absolute/selections.json`にReadinessInput配列を渡す。
各入力を独立診断し、`results`とREADY/WAITING/FAILED/BLOCKED件数を返す。
CLI終了値はFAILED/BLOCKEDがあれば1、それ以外0。WAITINGをREADYとは解釈しないこと。

## 2026-09-17の実Windows読み取り確認

root: `OneDrive-個人用/ドキュメント/競馬予想AI_Windowsデータ収集`
次は固定した過去attemptの結果であり、Windowsの現在の最新稼働状態を示すものではない。

| 対象 | 明示した既存証拠 | 結果 |
|---|---|---|
| JRA-20260920-NAKAYAMA-10 | `data/KeibaData/shadow-weekend-20260919-20/runtime-20260916-v1/20260920/Pre-attempts/20260917-122258-272-bc6634/result.json` | WAITING / UPSTREAM_NOT_COMPLETE。WindowsはWAITING_FOR_OFFICIAL_STAGE2、exitCode=0 |
| JRA-20260919-NAKAYAMA-10 | 同runtimeの`20260919/Pre-attempts/20260917-103643-033-49c49e/result.json` | FAILED / UPSTREAM_FAILED。RACE probe failed、exitCode=1 |
| JRA-20260913-NAKAYAMA-11 | `data/KeibaData/jvlink-runs/2026-09-12T01-06-20.494Z` | READY不可。診断はWAITING / COMPLETION_RECEIPT_MISSING、eligibility BLOCKED |

3件目は別途read-only parserで対象17件・履歴139件すべてを解析しmanifest件数一致を確認。
対象はstage 2、16頭のIDが一意、history selectionも16頭でmissing/unexpectedなし。
保存targetAsOfを超えたraw提供・取得時刻は0件。ただし正式なStage A完了receiptとSHA chainを
確認できず、この解析を受領READYの代用にしていない。旧cutoffも新Stage A規則と同じとは限らない。

実Windowsの**成功receiptからREADYまでの全段E2Eは未確認**。
実データ2件以上の非READY診断と実raw解析は実施済みだが、この不足はfixture PASSでは埋まらない。

## 残る実運用条件

修正checkpointの検証: P0-1R 46/46、関連Pre-Race 27/27、全回帰1372/1372
(110 files)、TypeScript、lint、production build、git diff --checkはPASS。
buildには既存の500kB超chunk警告がある。fixtureは通常/復旧receipt・SHA・全長RA/SE envelopeを
用い、SHAを再計算してから意味不整合を投入するケースも含む。対象テストの成功は実Windows成功E2Eの代わりではない。

- 実Stage A完了receipt + plan-reference + rawが揃った際の固定run受領E2E。
- Stage B専用証跡のvalidatorと実データE2E。
- 将来のPrediction入口でのrun/digest/cutoff再照合と正式Formal Gate。

P0-1Rは安全側への修正checkpoint。P0-1全体の正式実運用DONEとP0-2着手可はまだ宣言しない。
Prediction/Ability/Result/rawの変更・保存、Windows実行はしていない。

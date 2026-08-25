# CHECKPOINT14A.3B — Position Persistence Final Verification

CHECKPOINT14A.3のA判定を最終確認するラウンド。**コード変更は行っていない**（検証用の
一時スクリプトのみ実行し、確認後に削除した。`git status`は本ラウンド開始前後とも
クリーン、コミット対象の変更は無い）。

## 1. passingPositionのdisk persistence確認

新潟記念11頭について、`fs.readFileSync()`で`data/horses/<horseId>.json`を直接読み込み
（Node.jsモジュールキャッシュ・Vite `import.meta.glob`のいずれも一切経由しない、
純粋なディスク読み取り）、直近最大5走（raceDate降順で明示的にソート）すべてについて
`horseName`・`raceId`・`fieldSize`・`passingPosition`を確認した。

**結果: 54/54 全件で`fieldSize`・`passingPosition`とも populated であることを確認した。**
1件も欠落していない。（全54件の生データは検証ログとして確認済み。代表例:
ロデオドライブ`JRA-20251221-NAKAYAMA-05` → `fieldSize:16, passingPosition.cornerPositions:
[2,3,2]`、ジュンブロッサム`JRA-20260808-NIIGATA-07`（新潟・2コーナー）→
`fieldSize:16, passingPosition.cornerPositions:[14,14]`）

さらに、実際にpushされたgit commit（`253a8cb`）のcommitted blob自体を
`git show HEAD:<path>`で直接読み、`passingPosition`が確かにcommit履歴に含まれている
ことも確認した（作業ツリーだけでなく、リモートへpush済みの内容そのものに存在する）。

## 2. git diff記述との整合性

CHECKPOINT14A.3の完了報告「削除された行はfieldSize（null→値）とimportedAtのみ」は
**正しい記述であり、訂正の必要は無い**。`git diff`の`-`（削除）行にpassingPositionが
含まれていなかったのは、passingPositionが**元々存在しなかったキーへの新規追加**
（差分としては`+`のみで、対応する`-`行が無い）だったためであり、passingPosition自体が
変更・保存されていなかったことを意味するものではない。

紛らわしい表現だったことは認める。「fieldSizeとimportedAtのみ」という記述は
「置き換えられた（既存の値が新しい値に変わった）フィールド」を指しており、
「新規追加された（元々キー自体が無かった）フィールド」であるpassingPositionは
この文の対象外だった。今回`git show`で該当コミットのblobを直接確認し、
passingPositionが以下のように新規追加（`+`のみ、対応する`-`無し）されていることを
再確認した:

```diff
-    "fieldSize": null,
+    "fieldSize": 15,
     "source": "keibamar_public_dataset",
     "sourceRaceId": "202406050811",
     "sourceHorseId": "2021105436",
     "dataKind": "real",
-    "importedAt": "2026-08-24T06:06:37.712Z"
+    "importedAt": "2026-08-25T14:53:00.954Z",
+    "passingPosition": {
+      "cornerPositions": [7, 8, 11, 8],
+      "fieldSize": 15,
+      "source": "keibamar_public_dataset",
+      "isReliable": true
+    }
```

**PERSISTENCE BUGには該当しない。** in-memory計算のみで54/54になっていたのではなく、
1節のとおりディスク上のファイル・pushされたgit commitの両方に実際に保存されている
ことを確認した。

## 3. Cold Reload Test

新規の`vite-node`プロセス（このセッション内の過去のどのコマンドともin-memory stateを
一切共有しない、独立したNode.jsプロセス起動）から、`getHorseRecentRaces()`
（`data/horses/`全体を起動時に`import.meta.glob({eager:true})`で読み込み直す既存の
本番経路、無変更）→`computePassingPositionRunningStyle()`（無変更）を実行した。

| 馬名 | positionRaceCount | runningStyleSource | confidence |
|---|---|---|---|
| アーバンシック | 5 | passingPosition | high |
| サヴォーナ | 5 | passingPosition | high |
| ジュンブロッサム | 5 | passingPosition | high |
| ステレンボッシュ | 5 | passingPosition | high |
| ゾロアストロ | 5 | passingPosition | high |
| ダノンシーマ | 5 | passingPosition | high |
| チェルヴィニア | 5 | passingPosition | high |
| ドゥレッツァ | 5 | passingPosition | high |
| バレエマスター | 5 | passingPosition | high |
| ボーンディスウェイ | 5 | passingPosition | high |
| ロデオドライブ | 4 | passingPosition | high |

**11頭全馬でfinal3Fプロキシへのfallbackが発生していない**ことを確認した
（`computePassingPositionRunningStyle()`が`null`を返した馬は0頭）。

## 4. CSV Contract正式確認

今回発見したheader mismatchを踏まえ、今後ChatGPT側でPosition追加ZIPを作成する際の
正式column一覧を確定する（Importer自体の改修は無し、今回のスコープ外）。

**正式column名（`race_performances.csv`契約、`normalize.ts`が実際に読む名前）:**

```
raceId, raceDate, racecourse, raceNumber, raceName, surface, distance, going,
horseId, horseName, horseNumber, gate,
finishPosition, carriedWeightKg, actualRaceTimeSeconds, final3FSeconds, timeGapSeconds,
fieldSize, passingPosition,
source, sourceRaceId, sourceHorseId
```

**今後のPosition追加ZIPで使うべきでない旧alias（今回originalのZIPで実際に使われていた
canonical `RacePerformance`側のフィールド名。CSV取り込み経路では認識されない）:**

| 使うべきでない列名 | 理由 | 正式列名 |
|---|---|---|
| `timeGap` | `RacePerformance`計算後の内部フィールド名。CSV取り込み経路は`timeGapSeconds`のみ認識 | `timeGapSeconds` |
| `raceTime` | 同上 | `actualRaceTimeSeconds` |
| `final3F` | 同上 | `final3FSeconds` |
| `carriedWeight` | 同上 | `carriedWeightKg` |

これらの列名は`data/horses/<horseId>.json`の中身（＝canonical recordの確認用に
ChatGPT側が参照する対象）としては正しいが、**CSV取り込み専用の`RacePerformanceInput`
契約とは別物**である。この区別を今後のPosition/その他データ追加ZIP作成手順に
明記することを推奨する（12節「次に決める項目」参照）。

## 5. Regression

- **Frozen Benchmark**: シェイクユアハート baseAbility = **70.3**（無変更、3 tests pass）。
- **Production**: シェイクユアハート baseAbility = **70.9**（無変更）。
- **新潟記念11頭のBase Ability**: 全馬、CHECKPOINT14A/14A.2/14A.3と完全一致
  （アーバンシック72.1・サヴォーナ70.2・ジュンブロッサム72.7・ステレンボッシュ69.4・
  ゾロアストロ74.8・ダノンシーマ78.3・チェルヴィニア69.1・ドゥレッツァ67.4・
  バレエマスター72.3・ボーンディスウェイ73.1・ロデオドライブ76.7）。**1頭も変化していない。**
- **Suitability V1**: 無変更、既存テスト無回帰。
- **Formal Snapshot**: 無変更、既存テスト無回帰。
- `npm test`: **701 / 701 pass**（本ラウンドはコード変更が無いため新規テスト0件）。
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存警告は無関係の既存事項。
- `git status`: 本ラウンド開始時・終了時ともクリーン（コード・データとも変更無し）。

## 6. 判定

**A**。

54/54の`passingPosition`・`fieldSize`が、in-memory計算だけでなく**実際にディスク上の
canonical file・pushされたgit commitの両方に正式保存**されていることを、モジュール
キャッシュを経由しない直接ファイル読み取りと、独立した新規プロセスでのcold reloadの
両方で確認した。11頭全馬が、final3Fプロキシへのfallback無しに、実際のpassingPosition
データからRunning Style（confidence="high"）を生成できる状態になっている。
Base Ability/Suitability V1/Formal Snapshotへのregressionも無い。**PERSISTENCE BUGは
検出されなかった。**

CHECKPOINT14Bへ進める状態にあると判定する。ただし、CHECKPOINT14A.3の完了報告の
「削除された行はfieldSizeとimportedAtのみ」という記述が、passingPositionの新規追加を
明記していなかった点は紛らわしかったため、2節で明確化した。無理にA判定にしている
わけではなく、1〜3節の独立した3種類の検証（ディスク直接読み取り／git commit blob
確認／cold process再実行）が全て一致した結果としてのA判定である。

## 7. 次にChatGPTと決める必要がある項目（優先順位順）

1. **今後のデータZIP作成手順書に、CSV取り込み専用のフィールド名
   （`actualRaceTimeSeconds`等）とcanonical `RacePerformance`側のフィールド名
   （`raceTime`等）が別物であることを明記するか**（4節）。今回のような取り違えの
   再発防止。
2. **normalize.tsにフィールド名エイリアス対応を追加するか**（CHECKPOINT14A.3の
   次項目から持ち越し）。今回は手作業でのheader補正で対応したが、今後も同種の
   ZIPを受け取る前提なら、importer側で両方の名前を受理できるようにする方が
   運用上安全という考え方もある。
3. **CHECKPOINT14B（Position Profile V1）着手の可否**: 本ラウンドの最終確認により、
   データ面の準備は整った。

以上、CHECKPOINT14A.3B完了。CHECKPOINT14Bへは進まず、ここでSTOPする。

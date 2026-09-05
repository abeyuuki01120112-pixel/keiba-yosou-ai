# Gate 30拡張研究 Phase 1 — 基礎データ完成・監査結果

**作成日**: 2026-09-03
**位置づけ**: `docs/gate30-niigata-turf2000-hypothesis-validation-design-v3.md`
（v3設計）で決定されたPhase 1（既存v2基礎データの完成）の実行結果。

**結論を先に明記する**: **Phase 1は完了できていません。** 実際に検証・完了
できた作業と、実データが存在しないため完了できなかった作業を、以下に
正直に分離して報告します。新規4CSV（Phase 2対象）の本格収集は行っていません。
production code・production data・parameterの変更もありません
（8節Regression参照）。

---

## 0. 実施内容の要約

| 依頼された作業 | 状態 |
|---|---|
| 1. Gate 30対象30レースの確定 | **一部のみ**（既存10レースは確定済み・監査済み。追加20レースは「候補選定（Diagnostic）」までで、実データ収集は未着手） |
| 2. race_gate_history.csv完成 | **未完了**（10/30レースのみ実データが存在） |
| 3. runner_prior_history.csv完成 | **未着手**（0件、ファイル自体が存在しない） |
| 4. データリーク監査 | 既存10レース分のコードパス・データについて実施・完了（後述4節） |
| 5. Coverage / Missingness Report | 実施・完了（現状の正直な数値、後述5節） |
| 6. Source Provenance | 既存10レース分について確認・完了（後述6節） |
| 7. オッズ収集の固定ルールをv3ドキュメントへ追記 | **完了**（後述7節、コード変更なし） |
| 8. Double Counting判定基準 | 固定閾値を導入していないことを再確認（変更なし） |

---

## 1. Gate 30対象レースの確定状況

### 1-1. 既存10レース（実データあり、Selection Rule準拠を再監査）

`src/ability/data/gateValidation/niigataTurf2000GateHistoryV1.json`
（153行）を対象に、Selection Rule・重複・整合性を機械的に再検証した
（読み取り専用スクリプト、コード変更なし）。

| raceId | 開催日 | 競馬場 | 芝/ダート | 距離 | 頭数 | レース名 | 選定理由 |
|---|---|---|---|---|---|---|---|
| JRA-20210509-NIIGATA-11 | 2021-05-09 | 新潟 | turf | 2000 | 14 | 新潟大賞典 | 既存v1（CHECKPOINT14D.1B/C） |
| JRA-20210905-NIIGATA-11 | 2021-09-05 | 新潟 | turf | 2000 | 17 | 新潟記念 | 同上 |
| JRA-20220508-NIIGATA-11 | 2022-05-08 | 新潟 | turf | 2000 | 15 | 新潟大賞典 | 同上 |
| JRA-20220904-NIIGATA-11 | 2022-09-04 | 新潟 | turf | 2000 | 18 | 新潟記念 | 同上 |
| JRA-20230507-NIIGATA-11 | 2023-05-07 | 新潟 | turf | 2000 | 16 | 新潟大賞典 | 同上 |
| JRA-20230903-NIIGATA-11 | 2023-09-03 | 新潟 | turf | 2000 | 14 | 新潟記念 | 同上 |
| JRA-20240505-NIIGATA-11 | 2024-05-05 | 新潟 | turf | 2000 | 16 | 新潟大賞典 | 同上 |
| JRA-20240901-NIIGATA-11 | 2024-09-01 | 新潟 | turf | 2000 | 11 | 新潟記念 | 同上 |
| JRA-20250517-NIIGATA-11 | 2025-05-17 | 新潟 | turf | 2000 | 16 | 新潟大賞典 | 同上 |
| JRA-20250831-NIIGATA-11 | 2025-08-31 | 新潟 | turf | 2000 | 16 | 新潟記念 | 同上 |

**再監査結果（全10レース、機械的に再確認）**:
- racecourse=新潟／surface=turf／distance=2000／courseLayout=outer：**全10レース準拠**
- raceDate < 2026-08-30：**全10レース準拠**
- raceId重複：**なし**
- レース内horseId重複：**なし**
- レース内horseNumber重複：**なし**
- finishPositionの欠番・重複（同着以外）：**なし**（連番1〜fieldSizeで完全）
- horseNumber > fieldSize：2件（JRA-20240901-NIIGATA-11、JRA-20250831-NIIGATA-11）
  ——いずれも既存README記載の出走取消2頭（2024新潟記念ライトバック・
  2025新潟記念クイーンズウォーク）に起因する既知の正当な差分（JRAが
  出走取消後に馬番を振り直さない実務上の帰結）。データ欠陥ではない。
- 必須フィールド（raceId/raceDate/racecourse/raceNumber/raceName/surface/
  distance/going/courseLayout/horseId/horseName/horseNumber/gate/
  finishPosition/carriedWeightKg/actualRaceTimeSeconds/final3FSeconds/
  timeGapSeconds/fieldSize）の欠損：**なし**

**結論**: 既存10レースはSelection Rule完全準拠・整合性良好であることを
再確認した（既存CHECKPOINT14D.1C/Dの結論を追認）。

### 1-2. 追加20レース（候補選定のみ、実データ未収集）

`docs/checkpoint14d1j-niigata-turf2000-phase4-candidate-crossref.json`の
`selectionPreview.top20`に、既存Selection Rule（3節タイブレーク＝
known horse overlap優先）を24候補へ機械的に適用した結果が既に含まれている
（`isFormalFreeze: false`と明記された**Diagnostic表示**）。これにより
「どの20レースを対象にするか」という**レース識別情報のみ**（raceId・
raceDate・raceName・raceNumber・fieldSize・knownCount等）は用意されている。

**しかし、これらのレースの`race_gate_history.csv`相当の実データ
（各出走馬のfinishPosition・carriedWeightKg・actualRaceTimeSeconds・
final3FSeconds・timeGapSeconds・passingPosition等、既存24列スキーマの
runner-level情報）は一切収集されていない。** 過去のすべてのGate
Validationデータセット（東京ダート1600m版・新潟版いずれも）は
`README.md`に明記の通り「ユーザー提供ZIP」から取り込まれており、
Claude Code側が独自にWeb収集した実績はこのプロジェクトには存在しない。
今回も同様の方法（ユーザー／ChatGPT側での収集→ZIP/CSV提供）が
前提になっていると判断し、**Claude Code側で未検証の実データを
推測・生成することは行っていない**（CLAUDE.md絶対原則5）。

**結論**: 30レースのうち、実データが存在するのは**10レースのみ**。
残り20レースは「候補として識別済み（raceId等のメタデータのみ）」の
段階にとどまり、**完了条件1「30レースがSelection Rule準拠で確定」は
満たされていない。**

---

## 2. race_gate_history.csv完成状況

**未完了。** 現状10/30レース・153行のみ。追加20レース分の
runner-level実データ（推定150〜300行程度、正確な頭数は各レースの
実際のfieldSizeに依存するため未確定）が必要。

1-1節の監査により、既存10レース分についてはSelection Rule違反・
重複・必須項目欠損・異常値のいずれも検出されなかった（クリーンな状態）。

---

## 3. runner_prior_history.csv完成状況

**未着手。ファイル自体が存在しない（0件）。**

`src/ability/data/gateValidation/`配下を確認したところ、既存3ファイル
（`niigataTurf2000GateHistoryV1.json`・`tokyoDirt1600RealRaces10.json`・
`tokyoDirt1600Add20.json`）のいずれも`runner_prior_history`に相当する
ものではない。CHECKPOINT14D.1E（v2）7節で「Ability Coverageを実質的に
改善するには対象馬自身のprior historyデータが必要」と設計されて以降、
このデータセットは一度も収集・importされていない。

これは既存10レース・153行における**Ability Controlled行数が
未だ10/153（6.5%）にとどまっている**ことと直接対応する（4-2節で
実測値を再確認）。

---

## 4. データリーク監査

### A. 対象レース結果を能力算出inputとして使用していないか

**問題なし（コード確認済み）。** `niigataGateHistoryV1.ts`の
`computeAbilityAdjustedResiduals()`を読み込み確認した。
`abilityBeforeRace`（対象走以前の実力水準）は
`getHorseRecentRaces(horseId).filter((r) => Date.parse(r.raceDate) < cutoffMs)`
（`cutoffMs`=対象行自身の`raceDate`）のみから算出され、**対象レース
自身のraceScoreは一切含まれない。** `residual = raceScore(実際の結果) -
abilityBeforeRace(事前のみ)`という定義自体が「事前評価と実際の結果の差」を
測るものであり、`raceScore`（実際の結果）を使うこと自体はGate Effect
測定という目的上正当であって、リークではない。

### B. 対象レース後の競走履歴を使用していないか

**問題なし（コード確認済み）。** 上記と同じ`cutoffMs`フィルタが
厳密な `<`（以上ではなく未満）で適用されており、対象レース当日・
それ以降の実績は`productionPriorRaceScores`に一切含まれない。

### C. 後から確定した馬場・結果・オッズ等がAbility側inputへ混入していないか

**問題なし。** `abilityBeforeRace`の入力は`raceScore`（過去走の
実績スコア）のみであり、対象レースの`going`・オッズ等は
`computeAbilityAdjustedResiduals()`のいかなる計算にも使われていない
（該当フィールドを一切参照していないことをコード上確認）。

### D. Gate Validation専用データがproduction pipelineからimportされていないか

**問題なし。** `horseAbilityData.ts`のproduction glob
（`import.meta.glob("./data/horses/*.json")`）は`data/gateValidation/`を
走査対象に含まない（ディレクトリ自体が別階層）。`niigataGateHistoryV1.ts`
もproduction `data/horses/`への書き込みAPIを一切importしていない
（既存コードのコメントで明記、実装内容とも一致）。

**監査対象の限界**: 本監査は**既存10レース・153行と現行コードパス**に
ついてのみ実施した。追加20レース・`runner_prior_history.csv`は
データ自体が存在しないため、監査対象にできていない（3節参照）。

---

## 5. Coverage / Missingness Report（正直な現状値）

読み取り専用スクリプトで`computeAbilityAdjustedResiduals()`を実際に
実行し、以下を実測した（推測・過去記録の転記ではなく、本ラウンドで
再計算した値）。

| 指標 | 値 |
|---|---|
| 対象レース数（実データあり） | 10 / 30（目標） |
| 総runner行数 | 153 |
| 一意horseId数 | 129 |
| Ability Controlled（production側にtarget race以前の実データが1走以上ある） | 10行（6.5%） |
| Ability Controlled 一意horseId数 | 10 / 129 |
| predictionEligible相当（Ability Controlled と同義、本データセットでは同一の定義） | 10行 |
| predictionIneligible相当 | 143行 |
| race_gate_history.csv必須フィールド欠損数 | 0（既存10レースは全項目充足） |
| race_gate_history.csv欠損率 | 0%（既存10レース内） |
| runner_prior_history.csv行数 | 0（未収集） |

**この数値はCHECKPOINT14D.1E（v2設計時点）で報告された「10/153
（6.5%）」から一切変化していない。** これは追加20レース・
`runner_prior_history.csv`のいずれも本ラウンドまで実際には収集・
反映されていないことの直接的な証拠である。

---

## 6. Source Provenance

既存10レース・153行について、`source`／`sourceRaceId`／`sourceHorseId`
フィールドの充足状況を確認した。

- 全153行に`source`（"netkeiba"）・`sourceRaceId`（netkeiba形式のレースID）・
  `sourceHorseId`が設定されている。
- 手動入力か自動取得かの区別を示すフィールドは現行スキーマに存在しない
  （既存24列契約にそのような列は無い）。`README.md`の記述（"出典:
  ...zip（ユーザー提供）"）から、ユーザー側での収集・提供であることが
  分かるのみ。
- 追加20レース分・`runner_prior_history.csv`については、データ自体が
  無いためProvenance確認の対象にできていない。

**既存スキーマの変更が必要かどうか**: 現時点では変更を要する具体的な
不備は見つかっていない。もし将来、手動/自動区別の列が必要になった場合は、
勝手に追加せずChatGPTへ相談する（指示通り）。

---

## 7. オッズ収集に関する固定ルールの追記

`docs/gate30-niigata-turf2000-hypothesis-validation-design-v3.md`
1-2(D)節に、以下を追記した（ドキュメントのみの変更、コード変更なし）:

- `race_odds_result.csv`に`winOddsType`（`prediction_time`／`final`）を
  新規フィールドとして追加。
- **予測時点オッズが取得できない過去レースについて、確定オッズを
  代替値として使用することを明示的に禁止**（`missing`/`unavailable`
  として扱う）。
- 確定オッズは市場参考比較専用の別レコードとしてのみ保存可能とし、
  予測時点オッズとの混同・合算を禁止。
- この変更は今回（Phase 1）の実データには未適用（`race_odds_result.csv`
  自体をまだ収集していないため）。将来Phase 2で本格収集する際に適用する。

---

## 8. Double Counting判定基準について

v3設計時点の方針（固定閾値を導入しない）を変更していない。今回
実データ（追加20レース・runner_prior_history）が集まっていないため、
この判定基準の適用自体もまだ行っていない。

---

## 9. 今回判明した重要な発見・想定外の点

1. **追加20レースの「候補選定」と「実データ収集」は別工程であることが
   改めて明確になった。** `checkpoint14d1j`の`selectionPreview.top20`は
   raceId等の識別情報のみで、runner-level結果データを一切含んでいない
   ——CHECKPOINT14D.1F〜Jの一連のPhase作業が「どのレースを選ぶか」の
   決定に特化しており、「選んだレースの中身を集める」工程がまだ
   一度も実行されていなかったことが、今回のPhase 1着手で初めて
   明示的に確認された。
2. **Ability Control coverage（6.5%）はCHECKPOINT14D.1E設計時点から
   1ミリも改善していない。** これは新潟の対象30レースを増やしても、
   `runner_prior_history.csv`が無い限り改善しないというv2設計時点の
   予測（14D.1E 7節）が、そのまま現実になっていることを追認する結果。
3. **既存10レースのデータ品質自体には問題が見つからなかった。**
   （1-1節、4節）これは新規発見というより既存監査の再確認だが、
   Phase 2以降の土台として安心材料になる。

---

## 10. 未解決点

- 追加20レース分のrunner-level実データが未収集（最大のブロッカー）。
- `runner_prior_history.csv`が未収集（Ability Coverage改善の唯一の手段だが
  一度も着手されていない）。
- 追加20レースの`selectionPreview`は`isFormalFreeze: false`の
  Diagnostic表示であり、正式なfreeze手続き（対象30レースの最終確定）が
  まだ行われていない。

---

## 11. 懸念点

- **構造的な懸念**: Ability Control coverageが6.5%のまま放置されると、
  Gate 30研究全体（Base Ability再現性・Suitability Double Counting・
  Score Spacing・展開利・斤量研究のいずれも）の統計的信頼性が、
  実質的に既存10レース分から大きくは向上しない可能性がある。
  `runner_prior_history.csv`の収集を後回しにし続けるほど、Phase 2以降の
  検証結果が「サンプルが少ないので結論が出ない」に終わるリスクが高まる。
- **データ不足リスク**: 追加20レースの実データが今後どの程度の品質・
  完全性で収集されるかは、この時点では未知数（ChatGPT側の収集精度に依存）。
- **過学習リスク**: 直接該当なし（今回パラメータ変更を行っていないため）。
- **既存仕様との矛盾**: なし（v2契約の変更は行っていない）。
- **将来バグになりそうな点**: 特になし。ただし、`selectionPreview`が
  Diagnostic表示のまま実データ収集フェーズへ進むと、後から「実は
  この20レースで確定ではなかった」という手戻りが起きるリスクがある
  ——実データ収集を依頼する際は、`top20`のraceId一覧を正式な収集対象
  リストとして明示的に固定した上で依頼することを推奨する（12節）。

---

## 12. Phase 2へ進んで安全か

**推奨: STOP（Phase 2へ進むべきではない）。**

理由: Phase 1の完了条件7項目のうち、1〜3（30レース確定・
race_gate_history.csv完成・runner_prior_history.csv完成）が
未達のまま。Phase 2（斤量・オッズ・ペース評データの追加収集）を
先に進めても、そもそもの基礎データ（30レース中20レース分）が
存在しない状態では、Phase 2で収集した追加データを紐付けるべき
runner-level基礎行自体が無い。**Phase 1の残り作業（追加20レースの
実データ収集＋runner_prior_history.csvの収集）を先に完了させることを
強く推奨する。**

---

## 13. Regression

本ラウンドで行った変更は以下のみ:
- `docs/gate30-niigata-turf2000-hypothesis-validation-design-v3.md`
  1-2(D)節への追記（オッズtype区別ルール）
- 本ファイル（`docs/gate30-phase1-basic-data-completion-audit.md`）の新規作成

`git status --short`で確認: 上記2ファイルのみが変更対象。production
code（`src/`配下）・production data（`data/horses/`）・
`src/ability/data/gateValidation/`配下の既存データファイルは
**一切変更していない**（読み取り専用スクリプトで参照しただけ）。

`npm test`/`npm run lint`/`npm run build`/`npm run validate:data`は
前回コミット（823b763）時点の結果（787/787テスト・lint clean・
build成功・validate:data検証成功、既存warningのみ）から不変。

---

以上、Phase 1の範囲でSTOPします。追加20レースの実データ収集・
`runner_prior_history.csv`の収集、Phase 2（新規4CSVの本格収集）、
いずれも今回は着手していません。

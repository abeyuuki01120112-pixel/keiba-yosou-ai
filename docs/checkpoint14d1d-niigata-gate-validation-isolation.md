# CHECKPOINT 14D.1D — Historical Gate Validation Isolation / MemberLevel Ripple Prevention

CHECKPOINT14D.1Cで発見した「Historical Gate Dataのproduction importが、対戦相手
経由のMemberLevel再計算を通じてCURRENT TARGET（2026新潟記念）11頭のProvisional
Stage Aを変動させる」問題を解消するため、Historical Gate Validation Datasetと
Production Prediction Datasetを構造的に分離する仕組みを実装した。**Gate Effect
そのものは今回も実装しない。**

---

## 1. Ripple Root Cause

`buildRaceHistory()`（既存・凍結）は、各走のraceScore算出時に**同一レース内の
対戦馬全員の実績データ**を横断参照するMemberLevel機構を内蔵している。
CHECKPOINT14D.1Cで実際にproduction importした結果、新規に取り込んだ153行
（129頭）のうち51頭が既存`data/horses/`と接点を持ち（既存走数合計115走）、
これによりCURRENT TARGET 11頭のうち9頭の**過去走のraceScore**（対戦相手情報が
より充実したことによる再計算）が変動し、baseAbilityへ波及した。**9頭自身の
`data/horses/<horseId>.json`は一切変更していないにもかかわらず発生した**——
これがrippleの本質的な原因である。

---

## 2. MemberLevel Data Discovery Path（実コード監査）

`horseAbilityData.ts`を実コード監査した結果、production能力計算が参照する
唯一のデータソースを特定した:

```typescript
const horseFileModules = import.meta.glob<RaceHistoryRawInput[]>("./data/horses/*.json", {
  eager: true,
  import: "default",
});
```

**この1行のglobパターンが、production `historyByHorseId`（baseAbility/raceScore/
MemberLevel計算の唯一の入力）の全データソースである。** 非再帰的・単一ディレクトリ
限定のglobであり、`data/horses/`以外のいかなるディレクトリも走査しない
（Node.js/Viteのglob仕様上、`./data/horses/*.json`は`data/horses/`直下のみに
マッチし、兄弟ディレクトリを含まない）。

したがって、**Historical Gate Dataを`data/horses/`以外のディレクトリへ配置する
だけで、production MemberLevel/baseAbility計算への混入は構造的に不可能になる**
——これが今回のIsolation設計の核となる保証である（5節・6節で実装・テスト済み）。

---

## 3. Production vs Validation Dataset Separation

| | PRODUCTION_DATA | HISTORICAL_VALIDATION_DATA |
|---|---|---|
| 配置 | `src/ability/data/horses/*.json` | `src/ability/data/gateValidation/*.json` |
| 読み込み経路 | `horseAbilityData.ts`の`import.meta.glob` | `niigataGateHistoryV1.ts`が直接import |
| baseAbility/MemberLevelへの参加 | する | **しない（構造的に不可能）** |
| Formal Prediction Snapshotへの参加 | する | **しない** |
| 用途 | 正式予測（Stage A/B） | Gate Effect等の研究・検証専用 |

既存の東京ダート1600m検証データ（`gateValidationV1.ts`、CHECKPOINT8〜10.2で
確立済み）が**既にこの分離パターンを実践していた**ため、新規アーキテクチャを
発明せず、この既存パターンをそのまま新潟データへ再利用した（checkpoint本文
3節「既存repository architectureに最も整合する配置を選択」の指示通り）。

---

## 4. Historical Validation Storage

新規ファイル: `src/ability/data/gateValidation/niigataTurf2000GateHistoryV1.json`
（153行、CHECKPOINT14D.1Cで監査済みのZIPをそのまま変換。内容は一切変更していない）。

`README.md`（既存ファイル、追記のみ）に、東京ダート1600m版と並記する形で
出典・スコープ・既知の制約・CHECKPOINT14D.1Cで発覚したripple問題とその
解決方針を明記した。

---

## 5. Gate Validation Reader

新規ファイル: `src/ability/niigataGateHistoryV1.ts`。提供する関数:

- `NIIGATA_GATE_HISTORY_ROWS`: 153行の生データ（読み取り専用）。
- `computeRawFrameStats()`: 枠別生統計（能力未統制、CHECKPOINT14D.1C 10節と
  同一定義）。
- `getIsolatedGateHistory()`: **153行だけを閉じたデータセットとして
  `buildRaceHistory()`（既存・無変更）へ渡した結果**（production dataとは
  一切マージしない）。各レースの実際の出走馬全頭がこの153行に含まれている
  ため（CHECKPOINT14D.1C 3節でrowCount==fieldSize確認済み）、MemberLevelは
  このデータセット内で自己完結する。
- `computeAbilityAdjustedResiduals()`: 8節で詳述。

`data/horses/`への書き込みAPI（`fs.writeFileSync`等）はこのファイル内に
一切importしていない。

---

## 6. Ability Control READ-ONLY Contract

`computeAbilityAdjustedResiduals()`は、各Historical行の`abilityBeforeRace`
（その走以前の実力水準）を、production `getHorseRecentRaces()`
（`horseAbilityData.ts`、既存・無変更）を**呼び出すだけ**で算出する。

```typescript
const productionPriorRaceScores = getHorseRecentRaces(row.horseId)
  .filter((r) => Date.parse(r.raceDate) < cutoffMs)  // future leakage禁止
  .sort((a, b) => Date.parse(b.raceDate) - Date.parse(a.raceDate))
  .map((r) => r.raceScore);
```

`getHorseRecentRaces()`はproduction側の既に計算済みの結果を**参照するだけ**の
関数であり、この呼び出しによってproduction側のデータやキャッシュが変更される
経路は無い（`horseAbilityData.ts`の実装確認済み、モジュールスコープの
`historyByHorseId`はモジュール読み込み時に一度だけ計算され、以後は不変）。

**checkpoint本文10節の明示的指示「Production Evidenceのみ使用」に従い、
他のHistorical Gate行を追加の証拠として連鎖的に使うことはしていない**
（CHECKPOINT14D.1Cの旧スクリプトは「productionデータ＋他のHistorical行」を
混在させた結果カバレッジ31/153だったが、今回のisolatedな実装は
「production側の実データのみ」に限定したため10/153に減少した——これは
バグではなく、より厳格な定義への意図的な変更である）。

---

## 7. 10-Race ZIP Reload

新規収集は行わず、CHECKPOINT14D.1Cで既にA級品質と判定済みの
`niigata_turf2000_gate_history_v1.zip`（scratchpad上に保持済み）を
そのまま再利用した。153行・10レース・courseLayout=outer・future
leakage 0件・重複0件——監査結果は完全に同一（テストで再確認済み、9節）。

---

## 8. Stage A Before / After

| 馬名 | horseId | baseAbility (Before=CP14D) | baseAbility (After=Isolation実装後) | Stage A Score | Rank |
|---|---|---|---|---|---|
| ダノンシーマ | 2022104645 | 78.3 | 78.3 | 80 | 1 |
| ロデオドライブ | 2023107166 | 76.7 | 76.7 | 77 | 2 |
| ゾロアストロ | 2023106850 | 74.8 | 74.8 | 74 | 3 |
| バレエマスター | 2019104850 | 72.4 | 72.4 | 74 | 4 |
| ジュンブロッサム | 2019105118 | 72.7 | 72.7 | 73 | 5 |
| ボーンディスウェイ | 2019104658 | 73.1 | 73.1 | 73 | 6 |
| アーバンシック | 2021105436 | 72.1 | 72.1 | 72 | 7 |
| サヴォーナ | 2020100734 | 70.2 | 70.2 | 70 | 8 |
| ドゥレッツァ | 2020103650 | 67.4 | 67.4 | 70 | 9 |
| チェルヴィニア | 2021105643 | 69.1 | 69.1 | 70 | 10 |
| ステレンボッシュ | 2021105743 | 69.4 | 69.4 | 68 | 11 |

**全11頭、baseAbility・Stage A Score・Rankとも1桁も変化していない。**
（`niigataGateHistoryV1.test.ts`の「Zero Drift Contract」テストで、
`NIIGATA_GATE_HISTORY_ROWS`・`computeRawFrameStats()`・
`getIsolatedGateHistory()`・`computeAbilityAdjustedResiduals()`を
全て呼び出した**後**にStage A Boardを計算し、CHECKPOINT14Dの値と
`toBe()`で完全一致することを機械的に検証済み。)

---

## 9. Zero Drift Verification

```
Base Ability drift:    0/11
Suitability drift:     0/11（overallSuitabilityPercent・4component個別値とも）
Stage A Score drift:   0/11（表示値・内部full precision値とも）
Stage A Rank drift:    0/11
```

すべてテスト（`niigataGateHistoryV1.test.ts`）で機械的に確認済み。丸め表示
だけでなく、`baseAbility`の内部値（`toBe()`による厳密一致、`toBeCloseTo`では
ない）で比較した。

---

## 10. Frozen Benchmark

```
npx vitest run src/ability/__tests__/abilityModelV1.frozenBenchmark.test.ts
→ Test Files 1 passed / Tests 3 passed（70.3を完全再現）
```

---

## 11. Gate Validation Result Preservation

**INSUFFICIENTのまま。** Raw Frame Statsは完全に同一（8枠top3Rate=34.8%・
2枠top3Rate=6.3%等、CHECKPOINT14D.1Cと同じ傾向）。

Ability-adjusted残差は、**checkpoint本文10節の「Production Evidenceのみ」
制約を厳密に適用した結果、n=10（CHECKPOINT14D.1Cの旧n=31より厳格・小さい）**
となった:

```
n=10, mean residual=+7.45
2024-05-05 新潟大賞典（5行）: ヤマニンサルバム+21.4・ヨーホーレイク+7.9・
  ノッキングポイント+15.9・ブレイヴロッカー+5.4・シーズンリッチ+15.1
2024-09-01 新潟記念（2行）: ゴールドプリンセス+4.4・バラジ+19.5
2025-05-17 新潟大賞典（1行）: マイネルメモリー-10.5
2025-08-31 新潟記念（2行）: ヴェローチェエラ-0.3・ダノンベルーガ-4.3
```

n=10のうち5行が単一レース（2024-05-05新潟大賞典）に集中しており、frame別・
バケット別の分解にはサンプルが全く不足している。**「Production Evidenceのみ」
という、より保守的で誤りにくい定義を採用した結果、統計的検証力はCP14D.1Cの
n=31より下がったが、これはchekpoint本文の明示的な要求（future leakage無し・
50点等の推測補完禁止の徹底）を優先した結果であり、INSUFFICIENT判定を
変更する要素にはならない**（むしろより強く支持する）。

---

## 12. 30-Race Expansion Readiness

Isolationアーキテクチャは完成した。次回30レースへ拡張する場合、
`data/gateValidation/niigataTurf2000GateHistoryV1.json`を差し替える
（またはCHECKPOINT10.2の`Add20`パターンに倣い別ファイルで追加する）だけで、
`niigataGateHistoryV1.ts`のロジックは変更不要——production側への影響は
今回確立した仕組みにより構造的に排除されている。

---

## 13. Ability Coverage改善（設計候補のみ、未実装）

11節の通り、Production Evidenceのみに限定するとn=10まで下がる。将来の
改善候補（今回は実装しない）:

1. **Historical行どうしの連鎖**: 同一馬の複数のHistorical行を、互いの
   Ability Control証拠として使う（CHECKPOINT14D.1Cの旧アプローチ、n=31）。
   ただし「Historical Dataから算出したability」を「別のHistorical Data」の
   評価に使う循環になるため、production由来の証拠とは信頼度を明確に区別する
   設計が必要。
2. **収集方針の変更**: 20節の通り、次回のData Requestで「新潟大賞典/新潟記念
   常連馬」を優先的に収集すれば、同一馬の複数出走によりproduction側の
   prior evidenceを持つ馬の比率が上がる可能性がある。
3. **既存Base Ability reconstruction以外の手法**（22節相当）: raceScore・
   memberLevel・prior race evidence等、既存の構成要素を別の組み合わせ方で
   「結果非依存のExpected Performance」を作れないか——ただし新モデルの
   発明は行わない。

---

## 14. Regression

```
npm run validate:data   → 検証成功（エラーなし、既存の警告のみ）
npm test                → Test Files 75 passed / Tests 787 passed
                          （既存775 + niigataGateHistoryV1.test.ts新規12）
npm run lint             → エラー無し
npm run build             → 成功
Frozen Benchmark          → 70.3（3 tests passed）
```

`git status --short`で確認: `src/ability/data/horses/`配下は1バイトも
変更されていない。変更・追加されたのは以下のみ:

```
M  src/ability/data/gateValidation/README.md（追記のみ）
A  src/ability/data/gateValidation/niigataTurf2000GateHistoryV1.json（新規）
A  src/ability/niigataGateHistoryV1.ts（新規）
A  src/ability/__tests__/niigataGateHistoryV1.test.ts（新規）
```

Base Ability formula・MemberLevel formula・Suitability formula・Gate
weight・Stage A Score・Race Pace Prediction等、production予測ロジックは
一切変更していない。

---

## 15. 判定

**A-ISOLATED**

Historical Gate Dataset（`niigataTurf2000GateHistoryV1.json`、10レース153行）を
読み込み・使用しても、CURRENT TARGET（2026新潟記念）11頭のBase Ability・
Suitability・Stage A Score・Rankは完全に不変であることを、テストで機械的に
証明した（9節）。構造的な保証（`import.meta.glob`のディレクトリスコープ、
2節）とテストによる実証（Zero Drift Contract、8〜9節）の両方が揃っている。

---

## 16. 次にChatGPTと決める必要がある項目（優先順位順）

1. **30レースへのExpansion Data Request**: Isolationが完成したため、次は
   recommended=30レースのDATA REQUEST CONTRACTへ進んでよいか。checkpoint
   本文20節の方針（新潟・turf・2000・outer・raceDate<2026-08-30、条件戦〜
   重賞まで race classを限定しない）で進めることを提案する。
2. **Ability Coverage改善方針の選択**（13節の3候補のうちどれを採用するか、
   または30レース拡張だけで様子を見るか）。
3. **Historical行どうしの連鎖評価を許可するかどうか**: 許可すれば
   カバレッジは31/153相当まで戻るが、「production由来」と「historical
   同士の連鎖」の信頼度区別という設計判断が新たに必要になる。
4. **本Isolationパターンを他の将来Historical Validationデータセット
   （例: 他コースのGate検証）にも標準採用するかどうか**。

以上、CHECKPOINT14D.1Dの範囲でSTOPします。Gate Suitability実装・
Stage A再計算・Formal Stage A Freeze・Stage Bへは着手していません。

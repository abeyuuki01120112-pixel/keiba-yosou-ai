# CHECKPOINT13.4G: Short Career Eligibility V1 / Data Manifest

日付: 2026-08-24
**Base Ability formula / raceScore / component weights / memberLevel formula / final3F / raceTime / timeGap / weightScore / Suitability V1は一切変更していない。** 新規実データImportも行っていない。外部データ収集も行っていない。

---

## 1. Short Career Eligibility V1 実装

新規モジュール `src/ability/abilityEvidence.ts`（追加のみ）に`resolveAbilityEvidence()`を実装した。

| ケース | 条件 | historyCompleteness | historyConfidence | shortCareer | blockingReason |
|---|---|---|---|---|---|
| A（5走以上） | `abilityEvidenceCount >= 5` | complete | high | false | null |
| B（4走・career確定） | `knownCareerRaceCount===4`かつ`recognized===4` | complete | medium | true | null |
| C（3走・career確定） | `knownCareerRaceCount===3`かつ`recognized===3` | complete | low | true | null |
| D（1〜2走） | `abilityEvidenceCount<=2` | (別途判定) | insufficient | 状況依存 | `insufficient_evidence` |
| E（career count不明） | 3〜4走だがknownCareerRaceCount未登録/未来日付 | unknown | insufficient | false | `career_history_completeness_unknown` |
| （データ欠損確認済み） | `knownCareerRaceCount > recognized`（3〜4走域） | incomplete | insufficient | false | `incomplete_recent_history` |

`blockingReason`が非nullの場合のみ、`predictionSnapshot.ts`の`completenessFlags`へその文字列（`insufficient_evidence`/`career_history_completeness_unknown`/`incomplete_recent_history`）をそのまま追加する。既存の`reasonsFromSnapshotEntry()`（`raceCardBridge.ts`、無変更）が`COMPLETENESS_FLAG_TO_REASON[flag] ?? flag`という既存ロジックでそのまま拾うため、追加のマッピング変更は不要だった。

Case D（1〜2走）はknownCareerRaceCountの有無に関わらず一律`insufficient_evidence`でblockする（証拠量そのものが少なすぎるため、確認済み短キャリアであっても変わらない）。

## 2. Evidence Fields

`HorseSnapshotEntry`に新規フィールド`abilityEvidence: AbilityEvidence | null`を追加（scratched/過去走0件の場合のみnull、既存フィールドの型は無変更）:

```ts
interface AbilityEvidence {
  abilityEvidenceCount: number;        // baseAbility算出に実際に使われた走数（最大5）
  knownCareerRaceCount: number | null; // 有効なcareerCountRecordがあればその値
  historyCompleteness: "complete" | "incomplete" | "unknown";
  historyConfidence: "high" | "medium" | "low" | "insufficient";
  shortCareer: boolean;
  blockingReason: "insufficient_evidence" | "career_history_completeness_unknown" | "incomplete_recent_history" | null;
}
```

Suitability V1のConfidence（`suitabilityConfidence.ts`）とは完全に別の型・別のフィールドであり、混同していない。**baseAbilityの数値そのものは一切変更しない**（4走馬の76.7に対する減点等は一切行っていない。5節で検証済み）。

## 3. knownCareerRaceCount: 保存・判定方法

新規データファイル `src/ability/data/careerCounts.json` を追加した（`courseTimeBaselines.json`等と同じ、`horseAbilityData.ts`経由でロードするパターン）。

```json
{
  "records": [
    {
      "horseId": "2023107166",
      "knownCareerRaceCount": 4,
      "careerCountAsOf": "2026-08-24T00:00:00Z",
      "careerCountSource": "ロデオドライブ。CHECKPOINT13.4Bで検証した実データZIP...5走目の存在を示す証拠は一度も見つからなかった。..."
    }
  ]
}
```

**data/horses内の記録走数から自動生成する仕組みは一切実装していない。** 新規`getCareerCountRecord(horseId)`（`horseAbilityData.ts`）は、このJSONに明示登録されたエントリのみを返し、未登録の馬は常に`null`を返す。

**future leakage防止**: `resolveAbilityEvidence()`内で`careerCountAsOf`が`predictionCutoffAt`より後の日付なら、そのレコードを無視する（`isCareerCountValidAsOf`関数、テストで検証済み・7節参照）。

### 今回、唯一登録したエントリ（ロデオドライブ）について

`knownCareerRaceCount=4`を登録した根拠は、**新規の外部データ収集ではなく**、CHECKPOINT13.4Bで検証済みの実データZIP（`niigata_kinen_2026_cp13_4_data_v1.zip`）の監査結果、およびCHECKPOINT13.4C〜13.4Fの各ラウンドで繰り返し実データを再確認し、5走目の存在を示す証拠が一度も見つからなかったという、この一連の作業自体の監査記録である。`careerCountSource`フィールドに全文を明記した。**この判断は本ラウンドで私が単独で行ったものであり、ChatGPT/ユーザー側の明示的な追加確認ではない。** 異論があれば`careerCounts.json`のこの1エントリを訂正・削除できる。

## 4. ロデオドライブ: Short Career rule適用後の状態

実際に`buildHorseSnapshotEntry()`を実行して確認した:

```
baseAbility: 76.7（変化なし）
completenessFlags: ["memberLevelUnavailable"]
abilityEvidence: {
  abilityEvidenceCount: 4,
  knownCareerRaceCount: 4,
  historyCompleteness: "complete",
  historyConfidence: "medium",
  shortCareer: true,
  blockingReason: null
}
```

**想定通り、2つの問題が完全に分離された:**

- `insufficientRecentHistory`（旧フラグ）→ **Short Career Ruleにより解消。** `abilityEvidence.blockingReason=null`
- `memberLevelUnavailable` → **別問題として残存。** 彼女のデビュー戦（2歳新馬、2025-12-21）で当時の対戦馬データが不足しているため、これはデータ追加でのみ解消可能（本ラウンドでは監査対象外、次回以降の課題）

`npm run provisional:check`で再確認した結果、11頭のPrediction Eligibleは引き続き**7/11のまま変化しない**（彼女はmemberLevelUnavailableで依然blockされているため）。彼女の`reason`一覧は`["memberLevelUnavailable"]`のみとなり、`insufficientRecentHistory`は消えた。

## 5. Base Ability Regression（数値変更が無いこと）

- ロデオドライブ: baseAbility = **76.7**（CHECKPOINT13.4E/13.4Fと完全一致、変化なし）
- シェイクユアハート: baseAbility = **70.9**（CHECKPOINT13.4Dの production値と完全一致、変化なし）
- datasetFingerprint = `447h-876r-e0d4c788`（CHECKPOINT13.4Dと完全一致 — data/horses/を一切触れていないことの直接証拠）

## 6. 5走馬 Regression（既存挙動が変わっていないこと）

シェイクユアハートで確認:

```
abilityEvidence: {
  abilityEvidenceCount: 5,
  historyCompleteness: "complete",
  historyConfidence: "high",
  shortCareer: false,
  blockingReason: null
}
completenessFlags: []（insufficient_evidence等は一切含まれない）
```

新規テスト`shortCareerEligibility.integration.test.ts`で、baseAbilityが正式経路（`calculateBaseAbility(getHorseRecentRaces(...))`）と完全一致することを検証済み。5走以上の馬はknownCareerRaceCountが未登録でも（`careerCounts.json`に一切エントリが無い場合でも）常にCase A（historyCompleteness=complete、no block）になる設計（5走窓が既に埋まっている以上、キャリア総数がいくつであっても問題にならないため）。

## 7. MemberLevel Data Request Summary

- target horses = 3（ゾロアストロ・ダノンシーマ・ドゥレッツァ）
- requested opponent horses = 15
- unique count = **15**（重複0）
- required prior races count = 各対戦馬につき「対象走より前の実績、直近最大5走」（具体的な件数・raceIdは不明のため推測・捏造していない）

## 8. FULL DATA REQUEST MANIFEST（15頭全件、省略なし）

MEMBER_LEVEL_TOP_N=5（memberLevel V1既存仕様、無変更）に基づき、各対象走の着順上位5頭（対象馬本人を除く）を最小限の対象とした。

### ゾロアストロ（targetHorseId=2023106850、targetRaceId=JRA-20250727-NIIGATA-02、targetRaceName=2歳未勝利、targetRaceDate=2025-07-27）

```
1. requiredOpponentHorseName: ジーネキング     requiredOpponentHorseId: 2023104885
2. requiredOpponentHorseName: パンジー         requiredOpponentHorseId: 2023106589
3. requiredOpponentHorseName: クリスタルメモリー requiredOpponentHorseId: 2023106048
4. requiredOpponentHorseName: ソルトバーン      requiredOpponentHorseId: 2023102163
5. requiredOpponentHorseName: シシリアンフラッグ requiredOpponentHorseId: 2023102677
```

### ダノンシーマ（targetHorseId=2022104645、targetRaceId=JRA-20250928-HANSHIN-09、targetRaceName=兵庫特別、targetRaceDate=2025-09-28）

```
1. requiredOpponentHorseName: サークルオブジョイ requiredOpponentHorseId: 2021105796
2. requiredOpponentHorseName: カエルム          requiredOpponentHorseId: 2021105160
3. requiredOpponentHorseName: パンデアスカル     requiredOpponentHorseId: 2020103369
4. requiredOpponentHorseName: パーサヴィアランス requiredOpponentHorseId: 2019105330
5. requiredOpponentHorseName: デルマグレムリン   requiredOpponentHorseId: 2019105877
```

### ドゥレッツァ（targetHorseId=2020103650、targetRaceId=JRA-20240310-CHUKYO-11、targetRaceName=金鯱賞、targetRaceDate=2024-03-10）

```
1. requiredOpponentHorseName: プログノーシス    requiredOpponentHorseId: 2018104541
2. requiredOpponentHorseName: ヨーホーレイク    requiredOpponentHorseId: 2018105012
3. requiredOpponentHorseName: ハヤヤッコ        requiredOpponentHorseId: 2016104624
4. requiredOpponentHorseName: アラタ            requiredOpponentHorseId: 2017104756
   （注: CHECKPOINT13.4Dで既に34行分の実データ復元済みだが、2024-03-10より前の実績は0件のまま。今回の要求と重複しない）
5. requiredOpponentHorseName: ワイドエンペラー   requiredOpponentHorseId: 2018101660
```

**requiredPriorRaces（15件共通）**: 各対戦馬自身の、対象走の日付より前の実績（直近最大5走）。具体的なraceId/raceDateは弊社側では不明のため推測・捏造していない。

**requiredFields（既存race_performances.csv contract、CHECKPOINT13.4A準拠）**:
```
必須: raceId, raceName, raceDate, racecourse, surface, distance, going,
      horseId, horseName, finishPosition, timeGap, raceTime, final3F, carriedWeight
任意（あれば有用）: raceNumber, gate, horseNumber, passingPosition,
      source, sourceRaceId, sourceHorseId
```

## 9. Machine-readable Manifest

`docs/checkpoint13-4g-memberlevel-data-request.json` として保存した。8節の内容を完全に機械可読なJSON形式（`requests`配列15件、`requiredFields`、`summary`）で保持しており、ChatGPT側でそのままZIP作成の入力として使える構造にしている。

## 10. Test Results

- 新規テスト: `abilityEvidence.test.ts`（13ケース、Case A〜E・future leakage・異常値の安全側処理を網羅）、`shortCareerEligibility.integration.test.ts`（5走馬regression・ロデオドライブのShort Career解決とmemberLevelUnavailable分離を検証）
- 既存テストの更新: `predictionSnapshot.test.ts`の1件（`SPARSE_HORSE_ID`=1走馬のテストを、旧`insufficientRecentHistory`から新`insufficient_evidence`へ更新。挙動が正しく変わったことの反映であり、無理な書き換えではない）
- **Full test suite: 655 / 655 PASS**
- lint: エラーなし
- build: 成功
- validate:data: 検証成功（エラーなし、新規警告なし）

## 11. 判定

**A-SPEC — Short Career仕様完成。残りはMemberLevel追加データのみ。**

根拠:
- Short Career Eligibility V1を完全実装し、6つの必須テストケース全てをカバー（Case A〜E + 既存5走馬regression）
- Base Ability formula/raceScore/component weights/memberLevel formula/Suitability V1のいずれも変更していない（datasetFingerprint不変・シェイクユアハート70.9不変・ロデオドライブ76.7不変で直接確認）
- ロデオドライブの`insufficientRecentHistory`は解消され、残る`memberLevelUnavailable`は完全に独立した別問題として明確に分離できた
- 3頭のMINIMAL DATA REQUEST MANIFESTを、人間可読・機械可読の両形式で重複なく（15/15 unique）出力した
- 全655テストPASS、lint/build/validate:data全てクリーン

無理にAを出したわけではない — Short Careerの実装自体は完成しているが、「残りはMemberLevel追加データのみ」という限定を付けている通り、3頭の`memberLevelUnavailable`はデータが届くまで未解決のまま残る（今回のスコープ外、意図的）。この意味で純粋なAではなくA-SPECとした。

## 12. 次にChatGPTと決める必要がある項目（優先順位順）

1. **8節/9節のManifestに基づく追加ZIPの作成**: 15頭分の対戦馬prior races。届き次第、Dry Run→Import→memberLevel再監査を次ラウンドで実施する。
2. **`careerCounts.json`のロデオドライブエントリの承認可否**（3節）: 本ラウンドで私が単独登録した`knownCareerRaceCount=4`を正式なsource-backed事実として承認するか、より厳格な確認（ChャットGPT側での独立した再確認）を求めるか。
3. **他の短キャリア候補馬への`knownCareerRaceCount`登録要否**: 今後、新潟記念以外のレースで3〜4走馬が出走候補になった場合、同様の登録が必要になる。運用フローの確定。
4. **ゾロアストロ・ダノンシーマ・ドゥレッツァのmemberLevelUnavailable解消後の再監査**: データ到着後、Prediction Eligibleが7/11からどこまで改善するかの再計測。

---

以上でCHECKPOINT13.4Gを完了する。外部データは収集していない。**正式Stage A・CHECKPOINT14へは進まない。**

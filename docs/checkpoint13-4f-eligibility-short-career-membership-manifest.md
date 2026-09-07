# CHECKPOINT13.4F: Eligibility V1 / Short Career Rule / Missing MemberLevel Manifest

日付: 2026-08-24
**本ラウンドは原則Audit / Spec Proposalのみ。コード変更なし。追加データの自動収集も行っていない。**

---

## 1. DATA-FIXABLE 3頭のmemberLevelUnavailable race完全特定

`data/horses/`の実データを直接走査し、各馬のBase Ability対象走（直近5走）のうち`memberLevelBreakdown===null`となっている走を特定した。

| horseName | targetRaceId | targetRaceName | targetRaceDate | memberLevel status | fallback有無 | unavailable reason |
|---|---|---|---|---|---|---|
| ゾロアストロ | JRA-20250727-NIIGATA-02 | 2歳未勝利 | 2025-07-27 | FALLBACK_MEMBER_LEVEL_SCORE(50) | **あり** | 候補馬0頭（後述） |
| ダノンシーマ | JRA-20250928-HANSHIN-09 | 兵庫特別 | 2025-09-28 | FALLBACK_MEMBER_LEVEL_SCORE(50) | **あり** | 候補馬0頭（後述） |
| ドゥレッツァ | JRA-20240310-CHUKYO-11 | 金鯱賞 | 2024-03-10 | FALLBACK_MEMBER_LEVEL_SCORE(50) | **あり** | 候補馬0頭（後述） |

### unavailable reasonの根本原因（3走とも共通）

各対象走の出走馬全員（`data/horses/`に実データが存在する馬）について、対象日より**前**の実績（prior races）を確認した:

- **JRA-20250727-NIIGATA-02**: 出走馬6頭全員、prior races = **0件**（ゾロアストロ自身を含む全馬にとって、この日が現在データ上の最も古い記録）
- **JRA-20250928-HANSHIN-09**: 出走馬12頭全員、prior races = **0件**
- **JRA-20240310-CHUKYO-11**: 出走馬13頭全員、prior races = **0件**

**これは「対戦馬データが無い」のではなく「対戦馬データはあるが、その対戦馬たち自身の"さらに前の"実績が誰1人分も記録されていない」という状態である。** `memberLevelCandidates`は各出走馬の`abilityBeforeRace`（そのレースより厳密に前の実績から計算）を必要とするため、出走馬全員のprior racesが0件なら候補馬も必然的に0頭になり、`FALLBACK_MEMBER_LEVEL_SCORE`へフォールバックする（`raceHistoryPipeline.ts`の既存仕様通り、無変更）。

## 2. 追加データで何が必要か（対戦馬の特定）

`MEMBER_LEVEL_TOP_N=5`（memberLevel V1がTop5候補の重み付き平均を使う既存仕様、無変更）に合わせ、各対象走について**着順上位5頭（対象馬本人を除く）**を最小限の対象として選定した（5節「再帰拡大を避ける」の方針に基づく、全出走馬ではなく上限5頭）。

### JRA-20250727-NIIGATA-02（ゾロアストロ、2歳未勝利、2025-07-27）

| 着順 | horseId | horseName |
|---|---|---|
| 2 | 2023104885 | ジーネキング |
| 3 | 2023106589 | パンジー |
| 4 | 2023106048 | クリスタルメモリー |
| 5 | 2023102163 | ソルトバーン |
| 6 | 2023102677 | シシリアンフラッグ |

### JRA-20250928-HANSHIN-09（ダノンシーマ、兵庫特別、2025-09-28）

| 着順 | horseId | horseName |
|---|---|---|
| 2 | 2021105796 | サークルオブジョイ |
| 3 | 2021105160 | カエルム |
| 4 | 2020103369 | パンデアスカル |
| 5 | 2019105330 | パーサヴィアランス |
| 6 | 2019105877 | デルマグレムリン |

### JRA-20240310-CHUKYO-11（ドゥレッツァ、金鯱賞、2024-03-10）

| 着順 | horseId | horseName |
|---|---|---|
| 1 | 2018104541 | プログノーシス |
| 3 | 2018105012 | ヨーホーレイク |
| 4 | 2016104624 | ハヤヤッコ |
| 5 | 2017104756 | アラタ |
| 6 | 2018101660 | ワイドエンペラー |

必要な過去走・raceId・raceDateは、これら15頭それぞれについて**対象走の日付より前の実績**（未確定・弊社側では特定不可）である。具体的なraceId/raceDateを推測・捏造することはしない（3節・4節の重複回避も参照）。

## 3. MINIMAL DATA REQUEST MANIFEST

```
horseName: ゾロアストロ
targetRace: JRA-20250727-NIIGATA-02（2歳未勝利、2025-07-27）
reason: memberLevelUnavailable（対戦馬全員のprior racesが0件のためフォールバック発生）

requiredOpponent:
  - horseName: ジーネキング
    horseId: 2023104885
  - horseName: パンジー
    horseId: 2023106589
  - horseName: クリスタルメモリー
    horseId: 2023106048
  - horseName: ソルトバーン
    horseId: 2023102163
  - horseName: シシリアンフラッグ
    horseId: 2023102677

requiredHistoricalRaces:
  - 上記5頭それぞれの、2025-07-27より前の実績（直近最大5走）
  - raceId / raceDate は現時点で不明（推測不可・そちらのデータをそのまま提供してください）
  - raceName（分かれば）

requiredFields:
  - finishPosition
  - raceTime
  - timeGap
  - final3F
  - carriedWeight
  - racecourse / surface / distance / going
  - 同レースの勝ち馬データ（raceTimeScoreの基準タイムに必要）

---

horseName: ダノンシーマ
targetRace: JRA-20250928-HANSHIN-09（兵庫特別、2025-09-28）
reason: memberLevelUnavailable（対戦馬全員のprior racesが0件のためフォールバック発生）

requiredOpponent:
  - horseName: サークルオブジョイ
    horseId: 2021105796
  - horseName: カエルム
    horseId: 2021105160
  - horseName: パンデアスカル
    horseId: 2020103369
  - horseName: パーサヴィアランス
    horseId: 2019105330
  - horseName: デルマグレムリン
    horseId: 2019105877

requiredHistoricalRaces:
  - 上記5頭それぞれの、2025-09-28より前の実績（直近最大5走）
  - raceId / raceDate は現時点で不明（推測不可）
  - raceName（分かれば）

requiredFields:
  - （ゾロアストロと同一。重複記載を避けるため上記参照）

---

horseName: ドゥレッツァ
targetRace: JRA-20240310-CHUKYO-11（金鯱賞、2024-03-10）
reason: memberLevelUnavailable（対戦馬全員のprior racesが0件のためフォールバック発生）

requiredOpponent:
  - horseName: プログノーシス
    horseId: 2018104541
  - horseName: ヨーホーレイク
    horseId: 2018105012
  - horseName: ハヤヤッコ
    horseId: 2016104624
  - horseName: アラタ
    horseId: 2017104756
  - horseName: ワイドエンペラー
    horseId: 2018101660

requiredHistoricalRaces:
  - 上記5頭それぞれの、2024-03-10より前の実績（直近最大5走）
  - raceId / raceDate は現時点で不明（推測不可）
  - raceName（分かれば）

requiredFields:
  - （同一。上記参照）
```

**重複チェック**: 3走の対象馬（ゾロアストロ・ダノンシーマ・ドゥレッツァ本人）、および15頭の対戦馬horseIdは全て異なる個体であり、重複するhorseIdは無い（レース間・馬間の重複要求は発生していない）。

**注記（アラタについて）**: `2017104756`（アラタ）はCHECKPOINT13.4Dで既に34行のうち一部として実データが復元されている馬だが、その時点で追加されたのは2024-03-10より**後**の走のみであり、2024-03-10より前の実績は依然として0件のまま。今回のリクエストは既存の復元データと重複しない。

## 4. memberLevelの再帰拡大を避ける（方針の明記）

今回のManifestは、対象3走それぞれについて**着順上位5頭の「1階層だけ」**を要求している。これらの対戦馬自身の対戦馬（2階層目）の完全データまでは要求していない（memberLevel V1がTop5候補の重み付き平均である以上、Top5相当の候補が用意できれば正式計算が可能になるため、これ以上の網羅は現時点で不要）。次にこの15頭のprior racesが届いた場合、それらの走に**さらに**別の候補馬が必要になる可能性はあるが、それは受領後に個別判断する（今回は要求しない）。

## 5. Rodeo Drive Base Ability Calculation（完全監査）

`src/ability/baseAbility.ts`の`calculateBaseAbility()`を直接呼び出し、正式経路（`getHorseRecentRaces("2023107166")`）から取得した実データで検証した。

| recognizedRaceCount | 4 |
|---|---|
| RECENT_RACE_COUNT（既存仕様の上限） | 5 |

使用raceId・使用順序（新しい順、全4走とも使用＝4<5のため全走使用）:

| 順序 | raceId | raceName | raceDate | raceScore | memberLevel fallback |
|---|---|---|---|---|---|
| 1（最新） | JRA-20260510-TOKYO-11 | NHKマイルカップ | 2026-05-10 | 79.0 | いいえ |
| 2 | JRA-20260411-NAKAYAMA-11 | ニュージーランドトロフィー | 2026-04-11 | 77.7 | いいえ |
| 3 | JRA-20260301-NAKAYAMA-07 | 3歳1勝クラス | 2026-03-01 | 77.8 | いいえ |
| 4（最古＝デビュー戦） | JRA-20251221-NAKAYAMA-05 | 2歳新馬 | 2025-12-21 | 72.4 | **はい** |

各race weight・weight合計・weighted contribution:

| raceId | weight | contribution（raceScore × weight） |
|---|---|---|
| JRA-20260510-TOKYO-11 | 25%（1/4） | 19.75 |
| JRA-20260411-NAKAYAMA-11 | 25%（1/4） | 19.425 |
| JRA-20260301-NAKAYAMA-07 | 25%（1/4） | 19.45 |
| JRA-20251221-NAKAYAMA-05 | 25%（1/4） | 18.1 |
| **weight合計** | **100%** | |

**final baseAbility = (79.0 + 77.7 + 77.8 + 72.4) / 4 = 306.9 / 4 = 76.725 → 丸めて76.7**（実際の関数出力と完全一致）。

weight normalizationの有無: 後述7節参照。

## 6. Four-race Weight Behavior（コード事実のみ、変更なし）

`src/ability/baseAbility.ts`の該当コード（コメント含め全文引用）:

```ts
export const RECENT_RACE_COUNT = 5;

export function calculateBaseAbility(recentRaces: RacePerformance[]): number {
  const races = recentRaces.slice(0, RECENT_RACE_COUNT);
  if (races.length === 0) return 0;
  const total = races.reduce((sum, race) => sum + race.raceScore, 0);
  return roundToOneDecimal(total / races.length);
}
```

**重要な訂正（チェックポイントの前提と実際のコードの差異）**: 質問は「30/25/20/15/10のような既存weight仕様がある場合」を前提としているが、**実際のBase Ability V1のコードにはそのような段階的な減衰weight（前走を重く、古い走を軽くする方式）は一切存在しない。** `docs/ability-model-v1.md`・`baseAbility.ts`のコメント（「直近5走のraceScoreを均等20%ずつ平均する。前走を特別に重くしない」）が示す通り、**常に「使用する走数の逆数」を均等に割り当てる単純算術平均**である。

したがって、4走時の挙動は選択肢A/B/Cのうち：

- **A（30/25/20/15のみ使用）**: 該当しない。そもそも段階的weightが存在しない。
- **B（残ったweightを100%へ再正規化）**: 字義通りには該当しないが、**結果的な挙動としては最も近い**。「本来5走なら20%ずつ」という説明文と対比すると、4走時は自動的に25%ずつになる（`total / races.length`が`races.length`に応じて自動的に均等割りするため、"再正規化"という特別な処理ステップを踏むわけではなく、そもそも割り算の分母が可変なだけ）。
- **C（その他）**: **最も正確な表現はこちら。** 「固定の5段階weightを再正規化する」のではなく、**「そもそも各走に固定weightという概念が無く、常に1/n（n=使用走数、最大5）の均等平均」**という設計。5走のケースが「たまたま1/5=20%ずつ」に見えるだけで、内部的には特別扱いされていない。

**結論: 今のコードの事実として、4走時は「4走の単純算術平均（各25%）」であり、5走用の固定weightを部分的に使ったり明示的に再正規化したりする処理は存在しない。** これは今回何も変更していない、既存の（凍結済みの）Base Ability V1の設計そのものである。

## 7. Short Career vs Incomplete History: 現在の判定可能性

現行システムには、以下の2ケースを区別する仕組みが**存在しない**:

- **Case A（Incomplete Historical Data）**: `knownCareerRaceCount=8`だが`recognizedRecentRaceCount=4`（本来存在するレースを未取得）
- **Case B（Complete Short Career）**: `knownCareerRaceCount=4`かつ`recognizedRecentRaceCount=4`（実際に4戦のみ）

現行の`getHorseRecentRaces()`は`data/horses/`に記録されている走数をそのまま返すだけであり、「その馬の本当の総出走回数」を独立に検証する外部メタデータを一切保持していない。したがって、**現行コードだけでは、ロデオドライブが本当にCase B（実キャリア4走）なのか、実はCase A（本当は5走以上あるが記録が4走分しか無い）なのかを、システム自身は判別できない。**

CHECKPOINT13.4B/13.4C/13.4Eでロデオドライブが「実キャリア4走」と結論付けてきたのは、あくまで**ユーザー/ChatGPTが外部で確認した事実**（人間による確認）に基づくものであり、システムのコードロジックがそれを検証・保証しているわけではない。この区別を安全にシステム内で表現するには、次節の`knownCareerRaceCount`のような外部確認済みメタデータが必要。

## 8. knownCareerRaceCount: 必要性・最小実装案

**必要性**: 8節の通り、現行システムはCase AとBを区別できない。この区別が無いまま将来的にShort Career Ruleを実装すると、「単にデータ収集が追いついていないだけの馬」を誤って「短キャリア馬」として扱ってしまうリスクがある（データ欠損の隠蔽）。

**最小実装案（提案のみ、未実装）**:

- 新規フィールド`knownCareerRaceCount: number | null`を、馬プロフィールレベル（`data/horses/<horseId>.json`とは別の、馬単位メタデータ）に追加する案。
- **絶対条件**: `recognizedRaceCount`（記録されている走数）から自動的に`knownCareerRaceCount`を推測・代入してはならない（チェックポイント9節の警告通り）。これを設定できるのは、外部ソース（netkeiba等の公式プロフィールで確認した「通算出走回数」）から明示的に入力された場合のみとする。
- `knownCareerRaceCount`が未設定（null）の馬は、常に「Case A/B判定不能」として扱い、Short Careerの優遇的扱い（後述10節）を一切適用しない、という安全側の設計を推奨する。
- `knownCareerRaceCount === recognizedRaceCount`かつ両方とも5未満の場合のみ、`shortCareer: true`（Complete Short Career）と判定できる。

## 9. Eligibility V1 Proposal（提案評価）

ChャットGPT提案ルールを、既存思想（`docs/prediction-philosophy.md`・`docs/ability-model-v1.md`）と照らして評価する。

| ケース | 提案内容 | 評価 |
|---|---|---|
| career 5走以上 | 直近5走が揃っていることを正式基準。不足なら`predictionEligible=false, reason=incomplete_recent_history` | **既存思想と整合。** 現行の`insufficientRecentHistory`とほぼ同義（名称のみ異なる） |
| career 3〜4走（全career races揃っている場合） | `predictionEligible=true, shortCareer=true` + `abilityEvidenceCount`/`historyConfidence`で証拠量明示 | **概ね整合するが、8節の`knownCareerRaceCount`が無ければ「全career races揃っている」ことを安全に確認できない。** この前提が満たされない限り、提案通りの実装はできない（データ欠損を短キャリアと誤認するリスク） |
| career 1〜2走 | `predictionEligible=false, reason=insufficient_evidence` | **保守的で妥当。** 1〜2走はmemberLevel/final3F等の相対評価コンポーネント自体の信頼性も極端に低くなるため、除外する判断は既存の「evaluated=falseを推測で埋めない」思想と整合する |

**総合評価**: 提案の方向性自体（3〜4走を一律除外せず、証拠不足を明示した上でeligible候補にする）は、11節の「キャリアが浅い有力馬」問題への現実的な対応として理にかなっており、既存の「confidenceとscoreの分離」思想（`docs/prediction-philosophy.md`思想3）とも整合する。**ただし、実装の前提条件として8節のknownCareerRaceCount（またはそれに相当する、外部確認済みの安全なCase A/B判別手段）が先に確立されている必要がある。** この前提無しに3〜4走を無条件でeligible化すると、データ欠損馬を誤って正式予想対象に含めてしまう可能性がある。

## 10. Evidence / Confidence Proposal（Base Ability非変更での証拠量表現）

既存の`suitabilityConfidence.ts`（`baseConfidenceFromSampleCount`: 4走以上=high、2〜3走=medium、0〜1走=low）と同型のパターンを踏襲する案:

```
abilityEvidenceCount: number       // baseAbility算出に使った実走数（既存のrecognizedRaceCount相当を明示的に再エクスポート）
historyCompleteness: "full" | "partial" | "unknown"
  // full: knownCareerRaceCount === recognizedRaceCount（8節）
  // partial: knownCareerRaceCount > recognizedRaceCount（Case A、データ欠損）
  // unknown: knownCareerRaceCountが未確認
historyConfidence: "high" | "medium" | "low"
  // 例: abilityEvidenceCount>=5 → high, 3-4 → medium, 1-2 → low（suitabilityConfidenceと同様の閾値パターンを踏襲する案。数値は要ChatGPT確定）
shortCareer: boolean               // historyCompleteness==="full" かつ abilityEvidenceCount < RECENT_RACE_COUNT の場合のみtrue
```

**Base Abilityの数値自体（例: ロデオドライブの76.7）は一切変更しない。** これらは全て「baseAbilityという数値の隣に添える、証拠量の質を示すメタデータ」であり、`suitability`のconfidence/scoreの分離と同じ設計思想である。「4走だから-3点」のような直接減点は、この提案には一切含まれていない。

## 11. Rodeo Drive Remaining memberLevel Issue（Short Career解決後に何が残るか）

仮に将来、8〜10節のEligibility V1案（3〜4走かつhistoryCompleteness=fullならeligible）が実装され、ロデオドライブの`insufficientRecentHistory`問題が解消されたとしても、**彼女の`memberLevelUnavailable`は別途残る可能性が高い。**

理由: 彼女のmemberLevelフォールバック走は2歳新馬（2025-12-21、JRA-20251221-NAKAYAMA-05）。この走についても、1節・2節で扱った3頭と同じメカニズム（対戦馬のprior racesが不足）が疑われる（本ラウンドでは彼女のデビュー戦の対戦馬までは監査対象に含めていない。次節「次に必要な作業」参照）。

**Short Career RuleとmemberLevelUnavailableは完全に独立した問題であり、片方を解決してももう片方が自動的に解決するわけではない。**

## 12. 次に必要な作業（DATA ADDITION / SPEC IMPLEMENTATION 分離）

### DATA ADDITION（追加データが必要、実装不要）
- 3節のMINIMAL DATA REQUEST MANIFEST（15頭×prior races）
- ロデオドライブのデビュー戦（2歳新馬 2025-12-21）の対戦馬prior races（今回未監査、次回対象とすべき）

### SPEC IMPLEMENTATION（仕様決定後にコード実装が必要）
- `knownCareerRaceCount`（またはそれに相当する安全なメタデータ）の設計・データソース確定
- Eligibility V1（career 3〜4走のshortCareer扱い）のルール確定・実装
- `abilityEvidenceCount`/`historyCompleteness`/`historyConfidence`/`shortCareer`のフィールド設計・実装
- `insufficientRecentHistory`が現在「0走ケース」と「1〜4走ケース」を同一フラグで扱っている点（CHECKPOINT13.4E5節）の整理要否

## 13. 判定

**B-BOTH — 追加データと仕様決定の両方が必要**

根拠:
- 3頭（ゾロアストロ・ダノンシーマ・ドゥレッツァ）のmemberLevelUnavailable解消には、3節のManifestに基づく追加データが必要（DATA）
- ロデオドライブのShort Career扱いには、8節の`knownCareerRaceCount`設計と9-10節のEligibility V1ルール確定が必要（SPEC）。この前提が無い状態でShort Careerルールを実装すると、データ欠損馬を誤ってeligible化するリスクがある
- Base Ability数式・4走時の計算挙動自体には問題は見つからなかった（6節、単純算術平均として正しく動作している）ため、C判定には該当しない
- 今回は監査・仕様提案のみに留め、コード変更は一切行っていない

無理にAを出したわけではない — 3頭のDATA-FIXABLE分は追加データさえ届けばAに近づくが、ロデオドライブのSPEC-DECISION-REQUIRED分はデータだけでは解決せず、`knownCareerRaceCount`という新しい安全設計の合意が必要なため、単純なA-SPEC・B-DATAのどちらか一方には収まらないと判断した。

---

以上でCHECKPOINT13.4Fを完了する。追加データは自動取得していない。Eligibility Ruleは実装していない。**正式Stage A・CHECKPOINT14へは進まない。**

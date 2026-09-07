# CHECKPOINT13.4I: ロデオドライブ最終 MemberLevel Data Request Manifest

日付: 2026-08-24
**本ラウンドは監査のみ。コード変更・外部データ取得・自動補完は一切行っていない。**

---

## 1. Target Debut Race

`data/horses/2023107166.json`（ロデオドライブ、正式経路経由で再確認済み）から、Base Abilityに使用されている4走のうち`memberLevelUnavailable`が残っている走を特定した:

| 項目 | 値 |
|---|---|
| raceId | JRA-20251221-NAKAYAMA-05 |
| raceName | 2歳新馬 |
| raceDate | 2025-12-21 |
| racecourse | 中山 |
| raceNumber | 5 |
| surface | turf |
| distance | 1600 |
| going | 重 |
| finishPosition | 1 |
| raceTime | 95.1 |
| final3F | 35.4 |
| carriedWeight | 56 |

（既存の実データそのまま。推測補完は一切行っていない）

## 2. Current MemberLevel State

`getHorseRecentRaces("2023107166")`で正式経路から直接確認:

| 項目 | 値 |
|---|---|
| memberLevel current value | 50（`FALLBACK_MEMBER_LEVEL_SCORE`） |
| fallbackUsed | true |
| candidateOpponentCount | null（`memberLevelBreakdown`自体がnull、候補馬0頭のため） |
| MEMBER_LEVEL_TOP_N（既存仕様） | 5 |
| priorRaceAvailableCount | 0（後述、出走馬全員が対象） |

## 3. Required Opponents

`data/horses/`全体を走査し、raceId=JRA-20251221-NAKAYAMA-05を持つ全行を抽出した。**fieldSize（data/horses内で確認できる範囲）=16頭**（ロデオドライブ本人含む）。

| finishPosition | horseName | horseId |
|---|---|---|
| 1 | ロデオドライブ（対象馬本人） | 2023107166 |
| 2 | （馬名未記録＊） | 2023106846 |
| 3 | （馬名未記録＊） | 2023105003 |
| 4 | （馬名未記録＊） | 2023102504 |
| 5 | （馬名未記録＊） | 2023103860 |
| 6 | （馬名未記録＊） | 2023106997 |
| 7 | （馬名未記録＊） | 2023104005 |
| 8 | （馬名未記録＊） | 2023106317 |
| 9 | （馬名未記録＊） | 2023105097 |
| 10 | （馬名未記録＊） | 2023107188 |
| 11 | （馬名未記録＊） | 2023107151 |
| 12 | （馬名未記録＊） | 2023100767 |
| 13 | （馬名未記録＊） | 2023104602 |
| 14 | （馬名未記録＊） | 2023103225 |
| 15 | （馬名未記録＊） | 2023104883 |
| 16 | （馬名未記録＊） | 2023107339 |

＊`RacePerformance`は走単位のレコードであり、馬名は保持しない設計（既存仕様、CHECKPOINT13.4Gでも同様の制約に遭遇済み）。data/horses内にhorseNameの記録が無いため「不明」とし、捏造していない。

MEMBER_LEVEL_TOP_N=5に従えば、本来必要な「上位対戦馬」は着順2〜6位の5頭（2023106846・2023105003・2023102504・2023103860・2023106997）だが、4節の結果、この5頭を含む**16頭全員**が同一の理由でmemberLevel候補になれないことが判明した。

## 4. Prior Race Availability（各対戦馬）

15頭（ロデオドライブ本人を除く）全員について、`data/horses/<horseId>.json`の全走を確認した:

| horseId | totalRaces（data/horses内） | priorRaces（2025-12-21より前） | 全走の日付 |
|---|---|---|---|
| 2023106846 | 1 | 0 | [2025-12-21] |
| 2023105003 | 1 | 0 | [2025-12-21] |
| 2023102504 | 1 | 0 | [2025-12-21] |
| 2023103860 | 1 | 0 | [2025-12-21] |
| 2023106997 | 1 | 0 | [2025-12-21] |
| 2023104005 | 1 | 0 | [2025-12-21] |
| 2023106317 | 1 | 0 | [2025-12-21] |
| 2023105097 | 1 | 0 | [2025-12-21] |
| 2023107188 | 1 | 0 | [2025-12-21] |
| 2023107151 | 1 | 0 | [2025-12-21] |
| 2023100767 | 1 | 0 | [2025-12-21] |
| 2023104602 | 1 | 0 | [2025-12-21] |
| 2023103225 | 1 | 0 | [2025-12-21] |
| 2023104883 | 1 | 0 | [2025-12-21] |
| 2023107339 | 1 | 0 | [2025-12-21] |

**15頭全員が、data/horses内に記録されている走がこの1走（2025-12-21の本レース）のみ。**

**重要な区別（チェックポイントの指示通り）**: これは「prior raceがdata/horsesに無い」（＝データ未取得の可能性）ではなく、**「このレース自体が『2歳新馬』であり、JRAの規則上、2歳新馬戦は出走資格が『それまで一度も競走に出走したことのない馬』に限定される」**という制度上の事実に基づく。つまり、このレースに出走した16頭全員（ロデオドライブを含む）にとって、このレースは定義上、生涯で確実に最初の実戦競走である。data/horses内の記録が「1走のみ」という状態は、単なる収集不足ではなく、**この馬たちの実際のキャリアと完全に一致している**と判断できる（16頭全員が一致して「1走のみ・その1走がこの新馬戦」という状態を示しており、相互に補強し合う一貫した証拠）。

## 5. 追加データで解決可能か判定

| horseId | 分類 |
|---|---|
| 2023106846 | **TRUE-DEBUT** |
| 2023105003 | **TRUE-DEBUT** |
| 2023102504 | **TRUE-DEBUT** |
| 2023103860 | **TRUE-DEBUT** |
| 2023106997 | **TRUE-DEBUT** |
| 2023104005 | **TRUE-DEBUT** |
| 2023106317 | **TRUE-DEBUT** |
| 2023105097 | **TRUE-DEBUT** |
| 2023107188 | **TRUE-DEBUT** |
| 2023107151 | **TRUE-DEBUT** |
| 2023100767 | **TRUE-DEBUT** |
| 2023104602 | **TRUE-DEBUT** |
| 2023103225 | **TRUE-DEBUT** |
| 2023104883 | **TRUE-DEBUT** |
| 2023107339 | **TRUE-DEBUT** |

**DATA-FIXABLEな対戦馬は0頭。UNKNOWN判定の対戦馬も0頭。**

判定根拠: (a) data/horses内で15頭全員が「このレースのみ」という一致した記録を示している、(b) レース区分自体が「2歳新馬」であり、JRA競走体系上、新馬戦は出走資格として「未出走馬限定」が制度的に定められている。この2点が相互に補強し合っており、単なる「データが無いから不明」ではなく「構造的にprior raceが存在し得ない」と高い確信度で判断できる。

## 6. TRUE-DEBUTが含まれる場合の対応

必要対戦馬（着順上位5頭に限らず、確認できた16頭全員）が**全てTRUE-DEBUT**であるため、これ以上データを要求しても解決不能と判断した。**無制限のデータ要求は行わない。**

**SPEC_DECISION_REQUIRED として報告する。**

現行のmemberLevel fallback仕様（`FALLBACK_MEMBER_LEVEL_SCORE=50`、`raceHistoryPipeline.ts`・`memberLevel.ts`、無変更）は勝手に変更していない。

## 7. Minimal Data Request Manifest

**該当なし。** 全required opponentがTRUE-DEBUTのため、ZIP要求Manifestは作成していない（無意味なデータ要求を避けるため）。

## 8. Machine-readable Manifest

**該当なし。** 7節と同じ理由により作成していない。

## 9. Dataで解消可能か

```
DATA_REQUEST_NOT_APPLICABLE
SPEC_DECISION_REQUIRED
```

**理由**: ロデオドライブのmemberLevelUnavailableが残っている唯一の走（2歳新馬、2025-12-21）は、レース区分の性質上、出走馬全員（16頭、ロデオドライブ本人を含む）にとって定義上の生涯初戦である。JRAの新馬戦は出走資格を「未出走馬」に限定しているため、**このレースの対戦馬について「対象走より前の実績」を要求すること自体が、制度上あり得ないデータを要求する行為になる。** したがって、追加データによってこの走のmemberLevelを`FALLBACK_MEMBER_LEVEL_SCORE=50`以外の値にすることは、原理的に不可能である。

これは既存のmemberLevel V1フォールバック仕様が正しく機能している証拠でもある（候補馬が真に0頭の状況で、正直に「評価不能」を表す50点へフォールバックしている。捏造や無理な代替評価を行っていない）。

## 10. 変更禁止事項の遵守

Base Ability formula / raceScore / memberLevel formula / Short Career V1 / Suitability V1 / Eligibility Ruleのいずれも変更していない。

## 11. 判定

**A-SPEC — 追加データでは解消不能で仕様判断が必要**

根拠:
- ロデオドライブのmemberLevelUnavailableの原因を完全に特定した（デビュー戦の対戦馬16頭全員がTRUE-DEBUT）
- 追加データによる解決が原理的に不可能であることを、data/horsesの一貫した証拠とJRAの新馬戦制度の両面から確認した
- 無制限のデータ要求は行わず、無意味なZIP Manifestも作成していない
- 既存のmemberLevel fallback仕様（50点フォールバック）は変更していない

無理にA判定（"11/11到達可能"）にはしていない。**現行仕様のままでは、ロデオドライブは恒久的に`memberLevelUnavailable`のままpredictionEligible=falseであり続ける。** これは追加データ収集で解決する問題ではなく、次の2択のいずれかをChatGPT側で判断する必要がある:

1. **現状維持**: 新馬戦由来のmemberLevelUnavailableは「正直な評価不能」として、predictionEligible=falseのまま扱う（データの誠実性を優先。無理にeligible化しない）。
2. **仕様拡張（要検討・未実装）**: 「対象レースの出走馬全員が構造的にTRUE-DEBUTと判定できる場合」を、通常のmemberLevelUnavailable（データ収集で解決しうる一時的な不足）と区別する新しい completeness カテゴリ（例: `memberLevelStructurallyUnavailable`）を設け、Short Career Eligibility V1と同様の「Evidence分離」思想で扱うかどうか。この場合もbaseAbilityの数値自体は変更しない前提。

いずれを選ぶかは、Base Ability V1の凍結ルールに触れる可能性がある仕様判断であり、本ラウンドでは実装していない。

## 12. 次の作業

**DATA ADDITIONではなく、SPEC DECISIONが必要。**

- 次にChatGPTと決める必要がある項目（優先順位順）:
  1. **11節の2択**（現状維持 vs 新しいcompletenessカテゴリの検討）をどちらにするか。
  2. 2を選ぶ場合、`memberLevelStructurallyUnavailable`（または同等の概念）をEligibility判定にどう反映するか（predictionEligibleを変えるのか、単なる可視化に留めるのか）を仕様として確定する。
  3. 新潟記念の他10頭は既にpredictionEligible=trueのため、ロデオドライブの扱いが確定次第、11/11か10/11のまま正式Stage Aへ進むかを判断できる状態にある。

---

以上でCHECKPOINT13.4Iを完了する。外部データ取得・自動補完は行っていない。**正式Stage A・CHECKPOINT14へは進まない。**

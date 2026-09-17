# P0-1 Mac Pre-Race receipt/readiness V1

This is a read-only diagnostic boundary, not Prediction permission. It imports no
Prediction runner, collector-history calculation, Odds/EV integration or artifact store.
It does not modify normalized caches, raw, model data, Windows automation or Post-Race.

## Supported evidence, investigated 2026-09-17

The existing OneDrive Windows project scripts are the source of the receipt contracts:
`Invoke-ShadowWatch.ps1`, `Test-ShadowStageAArtifact.ps1`, `Prepare-ShadowTasks.ps1`,
`Register-ShadowJob.ps1`, `Invoke-ShadowJob.ps1`, `Export-JVLinkRealtime.ps1`,
`Export-JVLinkConditions.ps1`, and `Invoke-JVLinkSnapshot.ps1`.

- Stage A: explicit daily `plan-reference.json` → hashed `preparation.json` →
  exact canonicalRaceId/raceKey/startAt target → daily `stage-a-receipts/<raceKey>.json`.
  Both normal source-summary receipts and the Windows recovery receipt are supported.
  The receipt must bind the exact selected run and hash manifest/target/history files.
  It is published after collection validation, even when history is partial.
  Mac local full-byte digest verification establishes arrival; a global Pre-done marker
  is NOT required (it would couple otherwise independent races and stages).
- Stage B: the same explicit plan → that race's unique minutesBefore=40 job → hashed
  config → explicit `jobDir/attempts/<id>/result.json`. PreRace mode, 0B15-only job,
  includeConditions, scheduled window, successful receipt, cloudSyncConfirmed and
  no job errors are required. All referenced files are hashed again locally.
  The snapshot manifest, 0B15 report/raw, 0B14 report/raw and 0B11 report/raw are required.
  The -30/-10 O1/O2 jobs cannot masquerade as Stage B. Stage A history is a separate,
  explicitly pinned selection, independently diagnosed; no implicit cache lookup.

Current Windows automation is limited to 9/19–20, Nakayama/Hanshin 10–12R. This Mac
module does not extend that scheduling scope or claim Monday readiness.

## Selection and CLI

`npm run readiness:pre-race -- --root <OneDrive-project-root> --selections <file.json>
 --windows-root <exact-Windows-project-root>`

`--windows-root` is needed when receipts contain Windows absolute paths. It must
match the entire declared project prefix, not an inferred suffix. Paths outside the
Mac root, traversal and escaping symlinks are rejected. No Windows code is executed.
All results and the status totals go to stdout. Exit 1 means at least one FAILED or
BLOCKED input (or invalid CLI input); WAITING is normal, not a process failure.
The caller must also inspect predictionEligibilitySummary before later Prediction work.

The operator-created selection file is a JSON array. Each row has:

- raceId, stage (STAGE_A or STAGE_B)
- runDir: exact project-relative run path, or null if not yet selected
- planReference: explicit project-relative daily plan-reference.json
- receiptPath: exact receipt or attempt result.json path
- predictionCutoffAt: intended information cutoff, never inferred from checkedAt
- historySelection: a full STAGE_A selection required for STAGE_B

Example template (replace every placeholder with actual plan/receipt values):

```json
[
  {
    "raceId": "JRA-YYYYMMDD-VENUE-11",
    "stage": "STAGE_A",
    "runDir": "data/KeibaData/<exact-run-path>",
    "planReference": "data/KeibaData/<daily-path>/plan-reference.json",
    "receiptPath": "data/KeibaData/<daily-path>/stage-a-receipts/<raceKey>.json",
    "predictionCutoffAt": "<explicit ISO timestamp>"
  }
]
```

This is not a valid race schedule, nor an executable sample. Never select the newest
run, newest mtime, or latest attempt implicitly. null runDir cannot become READY;
if a completed receipt exists, explicit run selection is required (BLOCKED).
A receipt path ending in .tmp/.temp/.partial is WAITING and is not parsed.
Unselected sibling temporary files are ignored. Missing plan/receipt is WAITING;
a completed proof referencing a missing file is FAILED, including partial sync.
Retry the same immutable selection after sync; never repair or overwrite raw.

## Status boundaries

- READY: supported completion evidence, local integrity, raw identity/population,
  history selection structure and cutoff have passed. This is input admission only.
- WAITING: plan/receipt not yet present, plan not ready, receipt not complete or
  Stage B reports sync pending. No fabricated RA or replacement run is used.
- FAILED: identity mismatch, missing referenced file, invalid JSON/envelope,
  checksum/size mismatch, acquisition failure or corrupted evidence.
- BLOCKED: valid-looking evidence cannot be used under the requested cutoff/stage,
  unsupported course, changed time/course, missing Stage A history binding, etc.

Prediction eligibility is independently UNKNOWN or BLOCKED. V1 deliberately never
claims PASS: it does not run Base Ability, raceScore, MemberLevel, Suitability,
Formal Prediction Gate or Probability. Structural sufficiency is not scoring readiness.
Existing pure `resolveAbilityEvidence` is reused to report short-career blockers.
A READY input with Prediction BLOCKED is expected and is not an acquisition failure.

History categories are disjoint: full selected five, confirmed short career (1–4),
verified no prior, partial, unresolved. Verification of no prior uses the existing
manifest careerStartCountAsOf contract: available, count 0, no selected/raw starts,
JV-Link manifest/receipt, matching manifest targetAsOf. Empty history without that
explicit count remains unresolved. No count is inferred from RA/SE or file count.
This does not strengthen or redefine the existing career proof trust model.
Unsupported history stages are preserved and flagged, not replaced or scored.

## Timing and identity

- Official date/venue/race number derived from the 16-digit key must match raceId.
- Target RA/SE must all be Stage 2, one RA, unique horse IDs/numbers, valid frames,
  and RA declared count equals SE population. Horse names never form identity.
- Plan startAt is checked against the raw RA start time and date.
- Target/history providedAt and retrievedAt must not exceed the explicit cutoff.
- Stage A manifest targetAsOf equals the selected cutoff; collection precedes it;
  the existing Windows Stage A contract requires it before start minus 40 minutes.
- Stage B raw/conditions must have been retrieved in the job acquisition window and
  before the selected cutoff. An old Stage A card cannot pass as a Stage B capture.
  A later sync-only retry completion does not change original raw acquisition times.
- All selected historical races precede target date; target and same-day history fail.
- Stage B conditions use the existing Windows lengths and scopes: WE venue/meeting
  prefix, WH/other supported condition records exact race key. TC/CC block revalidation.
  No going/body-weight semantic transformation is performed here.

All bytes read are retained in memory, SHA-256 and optional receipt sizes verified,
then rechecked before READY (including Stage A history used by Stage B). No mtime
selection, latest cache, persistence, file deletion, locking or acquisition is used.
Receipt checksums prove consistency within the trusted Windows handoff, not cryptographic
JRA authorship. A future caller must reread/revalidate the same references; this report
is not a transferable permission token against subsequently changed files.

## Limits and real-data observation

On 2026-09-17, the two explicitly selected legacy runs were diagnosed read-only:

- JRA-20260912-HANSHIN-11: jvlink-runs/2026-09-11T03-51-37.782Z
- JRA-20260913-NAKAYAMA-11: jvlink-runs/2026-09-12T01-06-20.494Z

Both returned WAITING / EVIDENCE_NOT_ARRIVED: their raw manifests exist, but the
new Windows SHADOW daily plan/receipt proof for those historical dates does not.
No historical receipt was fabricated or old Prediction reclassified. Raw checks within
this admission path were NOT run after the missing plan, digest status NOT_CHECKED.
These are negative admission checks, NOT successful real-data end-to-end admissions.
The current weekend handoff likewise has no completed Stage A receipts/plan-reference
at inspection time. Synthetic complete A/B tests do not establish weekend READY.

Strict unsupported cases (including missing realtime publication timestamps, unknown
receipt versions or HR records in a pre-race RA/SE card stream) fail closed rather than
substituting retrievedAt or silently dropping records. Actual completed Stage A/B
handoffs are still needed to confirm the supported contract against live outputs.
P0-2 may reuse this boundary, but must independently perform Formal Gate/Prediction v2
validation and must not equate READY/UNKNOWN with formal Prediction PASS.

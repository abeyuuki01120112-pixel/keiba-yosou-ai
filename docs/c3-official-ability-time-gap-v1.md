# C3: official JV-Link, Result v2 and Ability time gaps

## Specification basis and scope

The user's 2026-09-17 Windows investigation reports JVData 4.9.0.1 and
actual raw confirmation: SE(532,4) is signed tenths, winner against second
(negative), other finishers against winner (positive), 9999 special/unavailable.
SE(343,3) is a different preceding-horse margin code and is not converted.
The specification PDF and real Windows raw were not independently opened by
this Mac implementation. Tests use synthetic raw with the reported -002/+002/+003.

No Ability formula, Result v2 schema, Prediction, stored raw or rolling data
is changed. No scoring or storage is called by the new pure derivation.

## Three distinct values

- `officialJvTimeGap`: typed decode with exact raw text and signed seconds.
  Missing/blank, unsigned 0000, invalid and special 9999 are unavailable.
  Unsigned 0000 is refused; no claim about its official initialization semantics.
- `resultTimeBehindWinnerSeconds`: Result v2 projection, winner zero only when
  a valid nonpositive official measurement exists, losers nonnegative. Invalid
  or missing winner measurement remains null, never a zero fallback.
- `abilityTimeGapSeconds`: the original signed official value after race-level
  checks. `racePerformanceInput.timeGap` is the explicit future Ability boundary.
  It is only a partial input; it does not construct a RacePerformance or bypass
  the C1/C2 Post-Race gates.

The importer returns a separate `timeGapEvidence` envelope, bound to Result
artifact ID/fingerprint, containing the exact source SE envelopes and SHA-256
identity. Result v2 does not receive extra fields. Winner margin is retained
in this evidence and original immutable raw, not reconstructed from Result zero.
This minimal change does NOT add a companion persistence store: even on persist,
only the existing Result store is called, and evidence is returned to the caller.
A later consumer must retain the evidence or reload the same immutable raw
revision. Result alone is insufficient and the derivation fails without evidence.

## Normal-race gate

`deriveAbilityTimeGaps(result, evidence, normalFinishOrderEvidence, calculatedAt)`:

1. Reuses C1 runtime Result validation and full Result ID/fingerprint validation.
2. Requires FINAL/CORRECTED, JV_LINK source, matching race/revision and evidence hash.
3. Requires explicit official finish/adjudication review evidence bound to this
   Result revision, confirming no dead heat or relegation. Its sourceIdentifier
   must reference the reviewed official record/report. It is trusted ingress
   evidence, not a claim inferred from zero gap. No automatic provider exists yet;
   without that review the outcome is UNAVAILABLE. A digest proves content identity,
   not official authenticity. Callers must not fabricate the review assertion.
4. Requires a unique winner and second, unique sequential official positions,
   normal started/finished state for every runner, and exact raw/Result horse set.
   This is a local consistency check, NOT C4 proof of official field completeness.
5. Re-parses each original SE, matches race/date/horse/finish/time, rejects
   unsupported status/stage and raw timestamps newer than the bound Result.
6. Requires winner '-' and others '+', including preserved -000/+000. Validates
   signed raw gap against race-time differences using integer tenths. Times only
   cross-check the official value; no sub-tenth rounding or estimated gap is used.
7. Confirms Result v2 still has the behind-winner projection; emits deterministic
   candidates with reference horse, Result revision, raw evidence hash, review,
   rule version, caller-supplied calculatedAt and content identity.

## Unsupported cases

All official ties, relegation or unverified adjudication, missing second,
missing/invalid time, contradictory gap, or any non-normal runner fail closed
for the whole derivation. This deliberately conservative scope also rejects a
race containing scratched/excluded/DNF/disqualified runners rather than selecting
partial updates. Result import continues to retain these runners as before.
Zero gap never identifies a dead heat; equal display times with distinct official
positions can pass only with the independent normal-finish review.
CORRECTED requires newly bound evidence/review; old revision data is not overwritten.
No CORRECTED chain or idempotent Ability-update mechanism is implemented here.

## Remaining operational work

Run read-only real Windows raw E2E, supply auditable normal-finish/adjudication
review, and decide a future append-only evidence store before production Ability
connection. C4, MemberLevel/raceScore computation and rolling updates remain out of
scope. Existing prediction-history decode merely reuses the same safe decoder;
its accepted normal values and scoring semantics are unchanged.

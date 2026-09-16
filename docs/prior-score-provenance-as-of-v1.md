# Prior Score Provenance / As-Of Contract V1 — C2 boundary

This checkpoint verifies supplied evidence; it does not generate scores, replay
history, persist evidence or connect an ability update engine. Existing Prediction
and Result artifacts and BA-V1 calculation semantics are unchanged.

## Inputs and trust boundary

`verifyPriorScoreAsOf(evidence, context, expected)` is a shared, synchronous,
Node-side integration verifier. `context.predictionArtifact` is existing v2 JSON,
read through its official reader; `context.dependencies` is the independently
resolved, read-only evidence repository content. A caller must authenticate the
repository/source. A content digest or an asserted timestamp is not authentication.
No Production evidence supplier is implemented in this checkpoint.

The Contract binds target identity, actual Prediction cutoff/reference, horse,
prior race, literal score, calculation/availability timestamps, BA-V1, implementation
revision, ordered selected history, canonical dataset, dependency references,
classification, reason codes, evidence creation time and validation-rule version.
Its content identity is canonical JSON + SHA-256; all arrays retain their order.
Existing Artifact FNV fingerprints are retained unchanged.

Dependencies carry id/kind, source/sourceIdentifier, availableAt/retrievedAt,
availabilityEvidence (source observation reference), payload and child digest refs.
Required kinds: OFFICIAL_RAW, CANONICAL_DATASET, MEMBER_LEVEL, TIME_BASELINES,
FINAL3F_BASELINES, FIELD_AGGREGATES, TRACK_ADJUSTMENT, IMPLEMENTATION.
VERIFIED additionally requires CALCULATION execution evidence. All reachable
references must resolve with matching SHA-256 and cutoff-safe availability; cycles
and conflicting ids are rejected. Search/selection pool manifests contain records
and an explicit fallbackReason when empty. They preserve existing fallback policy,
not an invented score. Historical raw must contain the existing canonical objective
measurements, not only race identity.

The implementation record identifies BA-V1, a revision and the existing
`buildHorseHistoriesAsOf` entrypoint. This is an execution provenance assertion,
not a second implementation of raceScore. The CALCULATION record binds the exact
score, timestamps, cutoff, identities, selection and dataset; its dependency graph
must cover all supplied root dependencies. Source authenticity still belongs to
the future evidence supplier.

## Classification

- VERIFIED_AS_OF: score and execution evidence exist before cutoff, every dependency
  is available no later than calculation, all identities and references match.
  The canonical scored-history content must reproduce the existing Prediction's
  datasetFingerprint using its existing normalization (importedAt excluded).
  The claimed score must be the score in that same content; the selected raw
  identities must cover that canonical scored-history set. Only this class is AVAILABLE.
- RECONSTRUCTABLE_AS_OF: historical input dependency/selection references resolve,
  but saved-score execution proof is not accepted. Scored-history output is not
  required. This is only an input-reference-completeness candidate, not a guarantee
  that a future replay will succeed; it remains UNAVAILABLE. No reconstruction runs.
- UNVERIFIABLE: missing, malformed, inconsistent, future or unresolvable evidence.
  The producer's classification label never overrides verification failures.

The new evidence createdAt may be later than cutoff. Score calculatedAt and
scoreAvailableAt may not. Later reconstruction never becomes an original verified
score merely because a numeric result matches.

## Consumers and compatibility

Phase 5b resolver takes optional verification context and proofs. Without them,
legacy scores become UNAVAILABLE. With verified evidence it takes the score from
that evidence, never the Collector's locally calculated numeric score. Original
history objects are not changed. The Post-Race Contract retains proof/context and
its Gate repeats verification, including proof-to-prior-row binding. Directly
constructing AVAILABLE or NO_PRIOR cannot bypass this gate. Multiple different
Prediction references within a Contract are rejected.

The shared verifier defines acceptance for Prediction-side consumers too. Existing
Production Prediction calculation and its Artifact format are NOT rewired in this
checkpoint. Production evidence generation, trusted source resolution and actual
Prediction/Post-Race evidence-supply E2E remain outstanding; do not enable updates.

NO_PRIOR is independent: reuse Career Completeness, match target/canonical identity,
JV-Link provenance and exact targetAsOf/cutoff, require career count zero, explicitly
empty selected history, no races/unsupported histories, and a cutoff-safe query
retrieval time. Empty history alone is unavailable. Structural No-Prior formulas
are not modified.

Persisted older Post-Race V1 inputs without these optional proof fields now fail
adoption at the Gate. Nothing is migrated or overwritten. Legacy baseline bundles
need explicit supplied version/availability evidence to participate; unknown times
are not filled. Corrected versions after cutoff fail the same temporal checks;
correction-chain processing is out of scope.

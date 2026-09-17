# C4: Official Race Population Evidence V1 (limited request edition)

## Scope and trust boundary

Only the two user-approved Evidence SHA-256 identities are accepted:

- JRA-20260913-NAKAYAMA-11: b3ee00950c4ee89b1209d3d870eba29241b5d0d2c7b8d3eac5ef72711e6b1682
- JRA-20260912-HANSHIN-11: 61c579e0bc58b7cab1103504e93e09529693cf5a40c049286db54dab798359bb

They certify the final edition contained in the recorded 2026-09-16 RACE option 1
request, fromTime 20260911000000. NOT current latest, arbitrary as-of, or future
corrections. Evidence digest is a content identity, not a JV-issued revision number.
The Evidence and all original source files remain unchanged.

Acceptance is not based on Windows status=VALID alone. The independent TypeScript
verifier rejects duplicate JSON keys and floats, implements ORPE-CJSON-1, recomputes
the Evidence hash, then requires the approved edition hash. This pins the complete
schema, static specification claims, scope and all reference digests; it deliberately
is not a validator accepting newly authored, self-hashed Evidence. Future editions
require explicit review and a new approved identity. No executable from the handoff
is loaded or executed by the TypeScript verifier.

All referenced raw/report/collector/specification/generator/schema/Final-run bytes
are rehashed. Raw stream SHA-256 is additionally pinned directly. The verifier
reparses all RA/SE using Mac's JvRecord, checks target source lines and record digests,
identities, status, dates, provenance, occurrence multiplicity, no deletion/conflict,
RA counts, and original/compatible run full envelope multiset equality. The persisted
report and the pinned JVRead=0 source-code branch are checked. Unrecorded API trace,
lastfiletimestamp, executable attestation and all-file name list remain notRecorded;
no stronger claim is made.

## Canonical identity

Existing JV-Link Final Result Adapter explicitly assigns canonicalHorseId=SE.horseId
(blood registration number); formalSnapshotPipeline constructs a dynamic collected-run
ID registry, not just the checked-in historical horse files. C4 reuses that namespace
and resolveRunner Priority 1, with an empty horse-name registry. It preserves all rows
before detecting duplicate/ambiguous/colliding mappings. No name-based resolution or
new alias policy is introduced. A registry mapping other than exact JV identity is
rejected; known non-JV namespaces would require a separately reviewed adapter.

## Comparison and revision

The Gate accepts only an in-process verified Evidence handle, and detects edited or
fabricated handles. It compares canonical identity sets and retains missing/unexpected,
duplicate/unresolved IDs, ambiguity/collision, race/revision mismatches and provenance.
Result is revalidated with C1 runtime validation and the Result v2 ID/checksum validator.
The named acquired run must be one of the verified Final run references and its full
raw digest must match. Result must be FINAL v1, from the default JV_LINK import with
matching race/date, source files, providedAt and retrievedAt; any other Result version,
CORRECTED or source provenance fails. Official status/placing and counts are compared.
Population count is supplementary to identity and revision checks, never sufficient.

Both approved editions contain only normal finishers and the known code-4 DNF.
The DNF 2020103522 is retained in the Hanshin Result and both compared populations.
Other status/revision editions fail closed; no generic correction/status resolver is
implemented. This limitation is not permission to discard a non-eligible member.

## Integration and read-only execution

`dryRunOfficialPopulation` reads the Evidence, verifies sources, builds a Result v2
in memory with persist:false, then evaluates C4. Code-4 DNF classification uses the
verified official status. It does not call a Post-Race contract builder, RaceHistoryRawInput,
MemberLevel, raceScore, Base Ability or a persistence/update function. C4 PASS is only
population readiness, not Ability-update permission; C1/C2/C3 remain independently
required before any future production update. No new bypass to Ability is introduced.

Run: `npx tsx scripts/checkOfficialPopulation.ts <Windows-handoff-root>`.
Output is stdout only. Invalid Evidence/source throws or returns structured rejection;
CLI exits nonzero unless both races pass. Source resolution rejects paths outside root,
including symlinks. This module is not a generic CORRECTED chain or idempotency system.

## Mac real-data verification

Both supplied Evidence files and every reference digest passed on Mac. For each race:
16 official, 16 Result, missing 0, unexpected 0, duplicate 0, unresolved 0, collision 0,
raceMismatch=false, revisionMismatch=false, C4 PASS.

- Nakayama Result content fingerprint (in-memory): 3c8818fa.
- Hanshin Result content fingerprint (in-memory): 2399e127; DNF 2020103522 included.
- Source stream SHA-256: e4fe57daddf96cbd3ef0ca3ea4ad60009db64989bdf3ffbbaea28e10eda82c40.

These fingerprints identify this dry-run output; no Result was saved or overwritten.

## Tests and remaining work

Portable canonicalization tests always run. Read-only real-bundle regression/E2E tests
use KEIBA_POPULATION_SOURCE_ROOT or discover the existing Mac OneDrive handoff. They
are explicitly skipped when that external bundle is absent; CI must supply it to claim
real E2E PASS. Adversarial mutations are in memory only, never in official files.

Still out of scope: C3 finish/adjudication evidence provider and companion persistence,
normal Post-Race execution orchestration, additional race editions/statuses, CORRECTED
chain, idempotency, raceScore/MemberLevel computation and rolling/Ability updates.

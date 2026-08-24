# Task A7 report: atomic meeting projection publication

## Scope and base

- Base: `78e423001e7043ab1ef98435a043377090153dae`.
- Surface: Kotlin/Spring server application, persistence adapters, public/member origin queries, session-record apply, and focused server tests.
- Implemented origin atomicity only. This task does not implement or claim C1 convergence generation, BFF/CDN denial convergence, append-only convergence attempts, cache propagation SLA, runtime deployment, or provider validation.
- V45 compatibility is preserved: no migration was added or changed, and the existing compatibility columns remain dual-written by the authoritative origin transaction.
- The execution ledger was not edited.

## ADR impact

- ADR-0023: `update` in implementation evidence. Correction confirmation now owns the exact session/draft/live/exposure/publication vector and origin projection transition.
- ADR-0022: `update` in implementation evidence. Origin eligibility and Notes member reads use the canonical lifecycle/access/site axes; public origin requires `PUBLISHED`, `GUEST_READABLE`, and `PUBLIC_RECORD` together.
- ADR-0028: `update` in implementation evidence. Correction canonical identity, immutable feature-receipt binding, duplicate replay, and response-loss reconciliation share the session-record-owned receipt ID without storing the canonical request.
- ADR-0033: satisfied; controllers parse/map only, while `HostSessionLifecycleService` owns the transaction and invokes the single session-record atomic capability.
- No ADR status was promoted in this isolated task.

## Acceptance matrix selection

Selected:

- Actor or authorization: host success plus unauthorized and cross-club writes fail closed.
- Club context: the correction and exposure/publication stores bind both session ID and club ID; focused integration tests cover cross-club denial.
- Session lifecycle: DRAFT/OPEN/CLOSED/PUBLISHED combinations are covered for exposure, placement, ordinary publish, and correction publish.
- Guest/public exposure: `HOST_ONLY`/`GUEST_READABLE`, `HIDDEN`/`PUBLIC_RECORD`, compatibility columns, revision-zero first placement, and origin public eligibility are covered.
- Guest DTO privacy: anonymous public responses explicitly exclude meeting URL/passcode and member-only one-line-review data.
- Persistence or migration: MySQL/Testcontainers integration tests cover locks, compare-and-set revisions, rollback, immutable history, receipt binding, and origin projection reads; no migration change was required.

Excluded:

- BFF or OAuth: no BFF, OAuth, cookie, or trusted-header behavior changed.
- Cursor collection: no cursor encoding, continuation, or accumulation behavior changed.
- Async, cache, or provider: C1 convergence/cache/CDN/provider behavior is deliberately outside A7. Only origin transaction state and the registered record epoch are asserted.
- UI or runtime state: no frontend or deployed runtime was changed or exercised.

## TDD RED evidence

Initial integration RED:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.publication.api.PublicControllerDbTest --no-parallel --max-workers=1
```

- 16 tests completed, 3 failed.
- Failures proved that the dual access/placement command did not bind both revisions, correction returned without making the public origin effect, and the public origin query did not require the new access-scope projection.

Initial epoch RED:

```bash
./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest --no-parallel --max-workers=1
```

- 4 tests completed, 2 failed.
- The access-scope/site-visibility readiness inputs and their mutation owners were missing from the record epoch inventory.

Review-hardening RED:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.mutation.application.service.MutationCanonicalizationTest --tests com.readmates.session.application.service.HostSessionServicesTest --no-parallel --max-workers=1
```

- 75 tests completed, 1 failed.
- The correction publisher was still an optional production dependency, so a missing capability could preserve the old 200-without-effect behavior.

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --no-parallel --max-workers=1
```

- 6 tests completed, 4 failed.
- Failures covered exact five-field idempotency identity, hidden-to-public draft projection, public-to-host-only draft projection, and stale correction/receipt preservation.

## Implementation

- Exposure-only commands require `expectedExposureRevision`; public placement requires `expectedPublicationRevision`; a combined command validates both under the same locked write path and bumps the relevant revisions together.
- Correction preview is loaded from the session-record correction capability and reports the exact vector plus the draft's target audience. It no longer reports the old live audience.
- Correction idempotency canonicalization binds exactly five non-negative revisions: session, record draft, live record, exposure, and publication. It does not persist the canonical request or raw meeting credentials.
- `HostSessionLifecycleService` has a mandatory `ApplySessionRecordUseCase` dependency and owns the transaction. There is no legacy verification-only fallback.
- The session-record store locks the current live record, draft, active session, and publication version before validating the complete vector. Only after validation does it replace origin content, preserve immutable history, update session/member/guest/public compatibility projections, insert the immutable apply receipt, delete the draft, and bump the record epoch once.
- Draft visibility is converted once to an origin audience projection. Correction is allowed to publish a `HOST_ONLY` draft, while ordinary import keeps its existing host-only rejection.
- Public and member archive origin queries use `access_scope = 'GUEST_READABLE'`; public reads additionally require `PUBLISHED` and `PUBLIC_RECORD`.
- Failed, stale, unauthorized, cross-club, and losing concurrent commands throw inside the same transaction. Focused tests assert no partial live record, history, public/member projection, receipt, audit, publication/exposure revision, or record-epoch commit.
- A6 idempotency regression setup now creates a valid record draft through the owned API, and cleanup removes the origin rows created by the now-real correction effect.

## GREEN and regression evidence

Required integration gate:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.publication.api.PublicControllerDbTest --no-parallel --max-workers=1
```

- PASS, 16/16 (`HostSessionExposurePublicationDbTest` 3, `PublicControllerDbTest` 13).

Final post-cleanup integration rerun:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --tests com.readmates.publication.api.PublicControllerDbTest --no-parallel --max-workers=1
```

- PASS, 19/19 (`HostSessionExposurePublicationDbTest` 3, `HostSessionCorrectionSafetyDbTest` 3, `PublicControllerDbTest` 13).

Required epoch gate:

```bash
./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest --no-parallel --max-workers=1
```

- PASS, 4/4.

Correction safety hardening:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --no-parallel --max-workers=1
```

- PASS, 3/3.

Correction identity and mandatory dependency:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.mutation.application.service.MutationCanonicalizationTest --tests com.readmates.session.application.service.HostSessionServicesTest --no-parallel --max-workers=1
```

- PASS, 75/75 (`MutationCanonicalizationTest` 15, `HostSessionServicesTest` 60).

A6 receipt/idempotency regressions:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest --no-parallel --max-workers=1
```

- PASS, 18/18 (`HostSessionIdempotencyDbTest` 10, `HostSessionRecordControllerDbTest` 8).

Focused architecture boundary:

```bash
./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest --no-parallel --max-workers=1
```

- PASS, 38/38.

Additional affected regression bundle:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest --tests com.readmates.archive.api.ArchiveControllerDbTest --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest --no-parallel --max-workers=1
```

- PASS, 39/39.

Diff hygiene:

```bash
git diff --check
```

- PASS.

All Testcontainers runs used serial/isolated Gradle options. Existing services and containers were not stopped.

## Full gate and BASE comparison

The required script was run twice, including after A7-local detekt/ktlint cleanup:

```bash
./scripts/server-ci-check.sh
```

- BLOCKED in the existing detekt quality gate before the normal `check` task could finish.
- Final current result: 122 detekt issues across 38 files.
- Rule counts: MaxLineLength 57, ThrowsCount 15, MagicNumber 12, LongMethod 10, UnusedParameter 9, TooManyFunctions 7, LargeClass 5, ReturnCount 3, CyclomaticComplexMethod 3, ComplexCondition 1.

The exact clean BASE was checked in a detached temporary worktree with:

```bash
./server/gradlew -p server detekt --no-build-cache --rerun-tasks --no-parallel --max-workers=1
```

- BASE result: 124 detekt issues across 39 files.
- BASE rule counts: MaxLineLength 57, ThrowsCount 16, MagicNumber 12, LongMethod 10, UnusedParameter 9, TooManyFunctions 7, LargeClass 5, ReturnCount 3, CyclomaticComplexMethod 3, ComplexCondition 2.
- A7 therefore introduces no net detekt debt after its local cleanup; the branch has two fewer issues and one fewer affected file than BASE.

Ktlint was also compared with the same exact command in the current tree and clean BASE:

```bash
./server/gradlew -p server ktlintCheck --no-build-cache --rerun-tasks --no-parallel --max-workers=1
```

- Current and BASE both fail with the same 13 existing findings, all in `CanonicalMeetingLanguageInventoryTest.kt` (12 chain-wrapping findings at lines 294-296 and one body-expression finding at line 571).
- A7-local ktlint findings: zero after cleanup.

The full unit lane was run despite the quality gate:

```bash
./server/gradlew -p server unitTest architectureTest --no-parallel --max-workers=1
```

- `unitTest`: 1,622 total, 1,620 passed, 1 skipped, 1 existing failure in `ActiveSessionProjectionArchitectureTest`.
- The failure reports 12 existing raw-`sessions` reads outside the A7 archive/public changes. The focused A7 architecture boundary remains 38/38 GREEN.
- Full `architectureTest`: 97 total, 96 passed, 1 existing failure from the default `error("listMode is not implemented")` in `HostSessionQueryPort.kt`.
- Both full-lane failures are present in the inherited server-quality debt and are not introduced by A7.

## Self-review

- The first GREEN still allowed an optional correction capability, resource-only idempotency identity, and live-audience preview. Review-hardening tests exposed all three and they were removed.
- A second review found that generic import validation rejected a legitimate correction to `HOST_ONLY`; the correction-only path now opts into that visibility while normal imports retain the previous contract.
- The authoritative audience projection is derived once and dual-written. Public/member queries consume `access_scope` rather than the legacy `visibility` spelling, which prevents a compatibility value from reopening a host-only origin record.
- Full vector validation happens after the relevant database locks and before replacement. Every later write participates in the lifecycle transaction, so an exception rolls the complete origin commit back.
- Controllers contain parsing and response mapping only. No controller owns a transaction or persistence sequence.
- Receipts and canonical digests contain identifiers/revisions/hashes only; no raw meeting URL, passcode, canonical request, or private member data was added to an origin/public response.
- No migration, cache/BFF/CDN implementation, deploy configuration, live service, or provider system was changed.

## Residual risk and release boundary

- A7 is not independently releasable as complete public-effect behavior. C1 must still prove convergence generation, BFF/CDN denial behavior, append-only convergence attempts, and the cache/convergence SLA before public-effect release claims are made.
- The inherited server quality gate remains red even though A7 reduces detekt findings and adds no ktlint findings. That cross-cutting quality hardening must be closed separately before the overall branch can claim `server-ci-check.sh` GREEN.
- No live runtime, deploy, CDN, BFF, cache, OAuth, or provider validation was performed in this isolated server task.

## Fix round 1: review findings

This round closes the one Critical and five Important A7 review findings without broadening the C1 boundary.

- Notes privacy: all nine Notes session/list/feed/filter query gates now require `sessions.access_scope = 'GUEST_READABLE'` with the existing `PUBLISHED` lifecycle predicate. A public-to-`HOST_ONLY` correction immediately removes the session, question, existing highlight, and session-filtered results; private `draftThought` never appears before or after the correction. Existing member-visible fixtures now explicitly declare `GUEST_READABLE` instead of relying on incompatible legacy visibility values.
- Preview/confirm exactness: correction preview returns typed `SESSION_RECORD_LIVE_STALE` when the draft's live metadata base is stale. No safe preview is returned for a vector that the unchanged confirm path would reject. Rebase produces a new draft revision, then preview and confirm use the same exact five-field vector successfully.
- Ordinary apply lifecycle: `PUBLIC` import/apply intent maps DRAFT and OPEN to `GUEST_READABLE` plus `HIDDEN` and compatibility `MEMBER`; CLOSED and PUBLISHED map to `PUBLIC_RECORD` and compatibility `PUBLIC`. Correction remains separately allowed to apply `HOST_ONLY` while ordinary import retains its validation contract.
- Exact publication envelope and semantic no-op: `expected.exposureRevision` is present if and only if `command.accessScope` is present. After locking, access and publication changes are detected independently. Repeated access/site/summary values do not bump their revisions or the record epoch; a combined repeated access plus changed publication bumps only publication and exactly one epoch. A new-key semantic no-op may create one immutable operational receipt, while exact replay retains that same single receipt and performs no domain write.
- Receipt binding: correction uses one session-record-generated `applyRequestId` as the feature apply receipt ID, host mutation receipt ID, and operational idempotency completion link. Same key and five-field identity replay the linked effect once; a different identity conflicts; reconciliation returns the authoritative linked receipt without meeting URL, passcode, draft hash, or canonical request data.
- Authorization evidence: anonymous access is `401`, an active non-host publication/correction is `403`, and a host addressing another club's access/publication/correction resource receives `404`. Each path compares the full live/history/draft/projection/revision/receipt/epoch fingerprint and commits nothing.
- Production correction store capabilities no longer default to `null`/`false`. A semantic architecture assertion now requires the three correction methods to remain abstract, so every implementation must opt in explicitly.
- Correction preview snapshot identity contains exactly session, record-draft, live-record, exposure, and publication revisions; participant-set revision is not silently included.

### Acceptance matrix selection for fix round 1

Selected:

- Actor or authorization: anonymous, active non-host, host success, and cross-club denied paths with response status plus zero-write fingerprints.
- Club context: access, publication, and correction commands are tested against a session owned by a different club.
- Session lifecycle: the ordinary public-intent mapping is asserted across DRAFT, OPEN, CLOSED, and PUBLISHED; correction behavior is separately retained.
- Guest/public exposure: canonical access/site axes, axis-specific expected revisions, semantic no-op behavior, and correction-driven withdrawal are covered.
- Guest DTO privacy: Notes/public/reconciliation responses exclude private draft thoughts and meeting credentials.
- Persistence or migration: locked semantic detection, receipt links, rollback/no-partial-write state, and V45-compatible fixture projections are covered in MySQL integration tests; no migration changed.

Excluded:

- BFF or OAuth, cursor collections, UI/runtime state: untouched by this server-origin fix.
- Async/cache/provider release behavior: Redis invalidation regression is checked only for the existing origin hook. C1 convergence, BFF/CDN denial, cache propagation SLA, attempts, deployment, and provider validation remain explicitly excluded.

### Fix-round TDD RED evidence

Notes correction RED:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --no-parallel --max-workers=1
```

- 3 tests completed, 1 failed: corrected `HOST_ONLY` content remained on Notes surfaces through the legacy visibility predicate.

Preview/lifecycle/identity RED:

```bash
./server/gradlew -p server unitTest --tests com.readmates.session.domain.SessionExposureTest --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest --tests com.readmates.session.application.model.HostSessionRevisionModelsTest --no-parallel --max-workers=1
```

- The first compile failed because the exact correction `snapshotIdentity` contract did not exist. The behavior tests then exposed the missing stale-preview rejection and DRAFT/OPEN public-placement lifecycle mapping.

Publication exactness/no-op RED:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --no-parallel --max-workers=1
```

- 5 tests completed, 2 failed: an extra exposure revision was accepted without an access axis, and repeated semantics still bumped revisions/epoch.

Receipt bridge RED:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --no-parallel --max-workers=1
```

- 4 tests completed, 1 failed: the host mutation receipt and session-record apply receipt used unrelated IDs.

Correction capability RED:

```bash
./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest.session record boundaries use owned models and ports' --no-parallel --max-workers=1
```

- 1 test completed, 1 failed with all three correction store methods reported as defaulted instead of abstract.

The new authorization tests were GREEN against the existing fail-closed security boundary; no production authorization bypass fix was necessary.

### Fix-round GREEN evidence

Focused unit and service bundle:

```bash
./server/gradlew -p server unitTest --tests com.readmates.session.domain.SessionExposureTest --tests com.readmates.session.application.model.HostSessionRevisionModelsTest --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest --tests com.readmates.sessionrecord.application.service.SessionRecordDraftServiceTest --tests com.readmates.session.application.service.HostSessionServicesTest --no-parallel --max-workers=1
```

- PASS, 97/97: exposure 4, revision models 8, apply 15, draft 10, host services 60.

Focused origin/privacy/authorization bundle:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.publication.api.PublicControllerDbTest --no-parallel --max-workers=1
```

- PASS, 24/24: correction 4, exposure/publication/auth 7, public origin 13.

Notes/archive canonical-access regression:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest --no-parallel --max-workers=1
```

- PASS, 31/31 after making the three intended member-visible fixtures explicitly `GUEST_READABLE`.

Ordinary import/apply regression:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest --no-parallel --max-workers=1
```

- PASS, 8/8. The exact DRAFT/OPEN/CLOSED/PUBLISHED audience matrix is additionally asserted by `SessionExposureTest`.

A6 idempotency/session-record regressions:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest --no-parallel --max-workers=1
```

- PASS, 18/18: idempotency 10, session record 8.

Redis invalidation compatibility:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest --no-parallel --max-workers=1
```

- PASS, 6/6.

Focused correction-port architecture test:

```bash
./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest.session record boundaries use owned models and ports' --no-parallel --max-workers=1
```

- PASS, 1/1.

All Testcontainers runs remained serial; existing services and containers were preserved.

### Fix-round full gate, inherited comparison, and self-review

```bash
./scripts/server-ci-check.sh
```

- BLOCKED at the inherited detekt gate with 122 issues, exactly the pre-fix A7 HEAD count. The temporary implementation peak was 126; the four A7-local additions were removed, leaving no net A7 detekt debt.
- `ktlintCheck` still reports the same inherited 13 findings, all in unchanged `CanonicalMeetingLanguageInventoryTest.kt`; A7 changed files report zero findings.
- Full `architectureTest` executes 97 tests and has one inherited failure: `HostSessionQueryPort.kt` defaults `listMode` to `error("listMode is not implemented")`. Both that default and its detecting architecture test are present at fix-round base `5c47f27d`; the focused correction-port boundary is GREEN.

Self-review confirmed that controllers only parse/map; preview rejects stale draft metadata before presenting an exact vector; semantic no-op detection happens under the same locks as revision validation; correction receipt generation remains inside the session-record feature; and denial tests inspect every origin table/epoch affected by A7. No raw meeting URL/passcode, canonical request, or private draft thought is persisted in new receipts or returned by new responses.

The release boundary is unchanged: this round proves origin atomicity and privacy only. It does not implement or claim C1 convergence generation, append-only convergence attempts, BFF/CDN denial convergence, cache propagation SLA, runtime deployment, or provider validation.

## Fix round 2: exact draft base, canonical publication identity, compatibility signal, and complete authorization evidence

This round closes the four remaining Important review findings. It corrects one statement from fix round 1: an exact correction base did require schema support. Because the feature line is still undeployed and C1 explicitly owns `V54__public_projection_convergence.sql`, no A7 V54 migration was added. The three draft-base columns, backfill, and non-negative checks were appended to the existing undeployed `V53__host_mutation_idempotency_receipts.sql`; C1's V54 filename and contract remain reserved.

### ADR impact

- ADR-0022 (`update` impact, no status promotion): correction/import and publication now call one shared authoritative V45 compatibility projection. Canonical `access_scope`/`site_visibility` remain the eligibility source; lifecycle compatibility columns cannot drift between write paths.
- ADR-0023 (`update` impact, no status promotion): each draft persists the exact `session`, live-record, exposure, and publication base revisions. Participant-only changes are intentionally excluded. A compatibility-only repair signals one record epoch/cache invalidation without bumping exposure/publication domain revisions.
- ADR-0028 (`update` impact, no status promotion): publication canonical identity is operation-schema v2 and binds nullable placement, nullable access, and legacy visibility separately. Omitted placement is not collapsed into explicit `HIDDEN`; raw payload/canonical bytes/SHA remain unpersisted.
- ADR-0033 ownership is unchanged: the application transaction and atomic outbound capability still own the origin commit. No new ADR or promotion is required.

### Implementation and contract changes

- `SessionRecordDraft` now carries `baseSessionRevision`, `baseLiveRevision`, `baseExposureRevision`, and `basePublicationRevision`, with `draftRevision` remaining separate. Save, restore, and rebase write the complete base vector; editor and import-draft responses carry it back to callers.
- `baseSessionUpdatedAt` remains only as V41 storage compatibility. It is not read by stale detection, preview, rebase review, or confirm. Preview and confirm use the same explicit revision basis. Summary, basic/session, access, placement, or live-record revision changes stale the draft; a participant-set-only `sessions.updated_at` change does not.
- Publication canonical payload schema v2 writes nullable markers for `siteVisibility` and `accessScope` and binds legacy `visibility`. DTO command properties are allowlisted exactly before service entry. Same-key omitted versus explicit `HIDDEN`, and legacy `MEMBER` versus `PUBLIC`, conflict; an exact request replays.
- `v45CompatibilityProjection` is the single mapper used by session publication and record correction/import. A PUBLISHED `HOST_ONLY` canonical exposure maps to the required V45 `MEMBER` compatibility column while remaining denied by canonical access. Compatibility-only repair is exposed by `HostPublicationWriteResult.compatibilityChanged`, signals once, and leaves domain revisions unchanged. Once repaired, the same semantics are a true no-op: no `sessions.updated_at`, revision, epoch, or cache signal.
- The correction apply port has no production default body, including `findApplyReceipt`. The architecture test inspects JVM method modifiers with `Modifier.isAbstract` for every apply-store capability rather than searching source for `=`.
- Anonymous and active non-host callers exercise access, publication, and correction. Cross-club tests use a valid foreign PUBLISHED session, live revision, exact-base draft, publication row/version, foreign host membership, and both club epochs. The before/after fingerprint covers sessions, public projection contents/revisions, all origin content tables, immutable history, drafts, audits, feature and host receipts, operational keys, both club epochs, and notification outboxes.

### Fix-round 2 TDD RED evidence

Exact draft-base RED:

```bash
./server/gradlew -p server compileKotlin compileTestKotlin --console=plain
```

- FAIL at `compileTestKotlin`: the new tests could not resolve `expectedSessionRevision`, `expectedExposureRevision`, or `expectedPublicationRevision`, and rejected the removed `expectedSessionUpdatedAt` precondition. This established that the persisted/model/API contract only carried the timestamp proxy.

Publication identity RED:

```bash
./server/gradlew -p server compileTestKotlin --console=plain
```

- FAIL with four canonical-contract errors: `siteVisibility` rejected null, `visibility` did not exist, and `PUBLICATION_SCHEMA_VERSION` was unresolved. The prior payload therefore could not distinguish omission or bind legacy V45 effect.

The authorization additions were GREEN against the existing security boundary. Their value is complete fixture validity and enlarged zero-write evidence, not an authorization production-code change.

### Fix-round 2 GREEN evidence

Exact base persistence and rebase:

```bash
./server/gradlew -p server integrationTest --tests '*JdbcSessionRecordAdapterTest' --tests '*HostSessionRecordDraftRebaseControllerDbTest' --console=plain --max-workers=1
```

- PASS, 15/15: 14 JDBC adapter tests plus one controller rebase test.

Migration schema/backfill:

```bash
./server/gradlew -p server integrationTest --tests '*MySqlFlywayMigrationTest' --console=plain --max-workers=1
```

- PASS, 18/18, including V53 exact-base columns, checks, and legacy-draft backfill. No V54 file exists in A7.

Focused origin, canonical identity, compatibility, and authorization:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionCorrectionSafetyDbTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --console=plain --no-parallel --max-workers=1
```

- PASS, 16/16: correction 6, exposure/publication/auth 10.

Focused application/domain/canonical bundle:

```bash
./server/gradlew -p server unitTest --tests '*SessionRecordDraftServiceTest' --tests '*SessionRecordApplyServiceTest' --tests '*SessionExposureTest' --tests '*MutationCanonicalizationTest' --tests '*HostSessionServicesTest' architectureTest --tests '*ServerArchitectureBoundaryTest' --console=plain
```

- PASS, 109/109 focused unit tests: draft 11, apply 16, exposure 4, canonicalization 16, host services 62.
- PASS, 38/38 focused architecture tests. The apply-store assertion uses JVM abstract modifiers and every fake is explicit.

Notes/archive, ordinary import, and A6 regressions:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest --console=plain --no-parallel --max-workers=1
```

- PASS. The selected classes contain 32 Notes/archive, 8 import, 10 idempotency, and 8 primary session-record controller tests. The separate record-draft rebase controller is covered in the 15-test persistence/rebase command above.

Redis/cache regression:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest --console=plain --no-parallel --max-workers=1
```

- PASS, 6/6.

Full lanes and quality baseline:

```bash
./server/gradlew -p server unitTest --console=plain --no-parallel --max-workers=1
./server/gradlew -p server architectureTest --console=plain --no-parallel --max-workers=1
./scripts/server-ci-check.sh
```

- Full unit: 1,630 total, 1,628 passed, 1 skipped, 1 inherited `ActiveSessionProjectionArchitectureTest` failure.
- Full architecture: 97 total, 96 passed, 1 inherited `HostSessionQueryPort.listMode` default-runtime-failure finding.
- Server CI remains blocked at the inherited detekt gate with exactly 122 issues across 38 files: MaxLineLength 57, ThrowsCount 15, MagicNumber 12, LongMethod 10, UnusedParameter 9, TooManyFunctions 7, LargeClass 5, ReturnCount 3, CyclomaticComplexMethod 3, ComplexCondition 1. This exactly matches fix-round-1 A7 HEAD and introduces no round-2 detekt debt.
- `ktlintCheck` reports exactly the same 13 inherited findings, all in unchanged `CanonicalMeetingLanguageInventoryTest.kt`; round-2 changed files have zero findings.

```bash
git diff --check
```

- PASS.

All Testcontainers commands remained serial/isolated. Existing services and containers were not stopped.

### Acceptance matrix selection for fix round 2

Selected:

- Actor/authorization and club context: anonymous, active non-host, valid cross-club foreign correction vector, explicit status, and full zero-write fingerprint.
- Lifecycle and guest/public exposure: summary/access/placement/basic/live-record draft-base invalidation, participant-only non-invalidation, PUBLISHED `HOST_ONLY` compatibility, and repeat no-op.
- Persistence/migration: undeployed V53 schema/backfill, exact base save/restore/rebase, locked revision comparison, immutable receipt/history preservation, and no partial writes.
- Idempotency/privacy: publication schema v2 omission/legacy identity, exact replay/conflict, linked feature/host receipts, HMAC-only operational identity, and no raw meeting URL/passcode/canonical request storage or response.
- Cache signal: compatibility-only repair and semantic no-op unit behavior plus the existing Redis invalidation regression.

Excluded:

- C1 convergence generation/attempts, BFF/CDN denial convergence, cache propagation SLA, deployment/runtime, OAuth/provider, frontend UI, and browser evidence. A7 neither implements nor claims these release properties.

### Self-review and residual boundary

- The exact base intentionally excludes participant-set revision, so participant management cannot create false correction conflicts. Every correction-owned revision is included and rebase replaces the entire base vector atomically.
- Compatibility repair updates only V45 projection state and signals readers; it does not counterfeit an access/publication domain change. The next identical command is write-free.
- Canonical publication v2 preserves semantic omission and legacy compatibility intent without persisting raw request material.
- Controller work remains parsing/mapping only. Cross-club denial uses a fully valid foreign resource, so `404` is authorization-derived rather than fixture absence or validation failure.
- C1 remains the non-release boundary. In particular, A7 does not consume C1's reserved V54, implement convergence attempts, or prove BFF/CDN/cache convergence SLA.

## Fix round 3: v2 additive compatibility, fail-closed draft bases, and authoritative legacy revision signals

This round closes the two Critical and three Important follow-up findings. It corrects two superseded round-2 statements: browser v2 continues to use `liveSessionUpdatedAt` for rebase review during `SUPPORT_V2_V3`, and V53 now adds three exact revision columns plus an explicit `base_vector_known` state. The migration suite remains 18/18; A7 still does not create or consume V54.

### ADR impact

- ADR-0022 (`update` impact, no status promotion): the shared V45 compatibility mapper remains authoritative for canonical and legacy writes. Actual legacy access/publication changes now advance the corresponding canonical revision signal; semantic repeats are write-free.
- ADR-0023 (`update` impact, no status promotion): draft freshness is the exact session/live/exposure/publication base vector plus an explicit known/unknown state. The v2 timestamp is only a locked rebase-review input that records the current exact vector; it is not the stored freshness proxy. Participant-only `sessions.updated_at` movement does not stale a known exact base.
- ADR-0028 (`update` impact, no status promotion): exposure identity is schema v2 and publication identity is schema v3. Both bind expected revisions with explicit null markers; publication additionally preserves omitted placement, nullable access, and legacy visibility. Older stored schema rows remain available to reconciliation lookup but cannot replay a current command.
- ADR-0033 ownership is unchanged. Controllers validate/map mutually exclusive legacy/exact contracts; application services own the transaction and locked semantic decisions. No ADR is promoted.

### Implementation and contract changes

- The editor response restores the v2 `liveSessionUpdatedAt` field additively while retaining the exact live revisions. The rebase response remains parseable by the current strict frontend draft schema because Zod strips additive server fields.
- Rebase accepts exactly one reviewed-base contract: v2 `expectedLiveRevision` plus `expectedSessionUpdatedAt`, or v3 session/live/exposure/publication revisions. Mixed, partial, or empty vectors fail as typed `SESSION_RECORD_INVALID_REBASE_CONTRACT`. The v2 path validates its timestamp under the live lock, then persists the locked exact vector; the v3 path validates those exact revisions directly.
- V53 adds `base_vector_known boolean not null default false`. Only legacy drafts whose V41 `base_session_updated_at` equals the current locked-session evidence are backfilled with exact revisions and marked known. Mismatched/ambiguous drafts remain unknown and preview/confirm return typed `SESSION_RECORD_LIVE_STALE` with zero writes until an explicit rebase records a known vector. Save, restore, and rebase always persist a known exact base.
- Legacy flat access and publication writes now use the same locked semantic detectors as canonical writes. Actual access changes advance `exposure_revision`; actual placement/summary changes advance `publication_revision`; any resulting readiness/projection change signals one record epoch and one cache invalidation. Repeated semantics leave `sessions.updated_at`, revisions, audits, epoch, and cache unchanged. Combined changes still emit only one record signal.
- Exposure canonical identity includes nullable `expectedExposureRevision`; publication identity includes nullable `expectedPublicationRevision` and `expectedExposureRevision`. Same key plus a changed expected revision, including null-versus-present, conflicts instead of replaying. No raw payload, canonical bytes, request SHA, meeting URL, or passcode is stored.
- Authorization fingerprints now include `base_vector_known` along with live/origin/public data, exact revisions, history, drafts, audits, both receipt families, operational keys, both club epochs, and outboxes.

### Fix-round 3 TDD RED evidence

Current frontend and v2 rebase contract RED:

```bash
./server/gradlew -p server integrationTest --tests '*FrontendZodSchemaContractTest.host session record editor preserves*' --tests '*HostSessionRecordDraftRebaseControllerDbTest.host v2 rebase request remains*' --console=plain --no-parallel --max-workers=1
```

- RED, 0/2: the editor omitted `liveSessionUpdatedAt`, so the server response failed the current frontend fixture before the v2 rebase response could satisfy the contract.

Exact-base, legacy signal, and HMAC contract RED:

```bash
./server/gradlew -p server compileTestKotlin --console=plain
```

- RED at test compilation: `baseVectorKnown`, access semantic-change flags, nullable expected-revision canonical fields, and the exposure/publication schema constants were absent. This established the missing production contracts before implementation.

One first GREEN attempt correctly exposed invalid test setup rather than an implementation bypass: a PUBLISHED `HOST_ONLY` access request with the existing `PUBLIC_RECORD` placement failed `SESSION_EXPOSURE_INVALID`. The fixture was corrected to hide placement before saving the reviewed draft; production validation was retained.

### Fix-round 3 GREEN evidence

Frontend fixture/export and current browser parser:

```bash
npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/api/host-session-record-api.test.ts
```

- PASS: the fixture export completed and the current frontend API contract passed 8/8. Corepack was not on PATH, so the repository-documented `corepack@0.35.0` fallback was used. No frontend runtime/schema/bundle file changed.

Exact rebase, V53 backfill, origin semantics, HMAC, and authorization bundle:

```bash
./server/gradlew -p server integrationTest --tests '*FrontendZodSchemaContractTest*' --tests '*HostSessionRecordDraftRebaseControllerDbTest*' --tests '*HostSessionCorrectionSafetyDbTest*' --tests '*HostSessionExposurePublicationDbTest*' --tests '*HostSessionIdempotencyDbTest*' --tests '*MySqlFlywayMigrationTest*' --console=plain --no-parallel --max-workers=1
```

- PASS, 64/64: frontend contracts 14, rebase controller 3, correction safety 8, exposure/publication/auth 11, idempotency 10, migration 18.
- The migration cases distinguish timestamp-equal known backfill from timestamp-mismatched unknown backfill and prove typed denial plus rebase recovery. No `V54__public_projection_convergence.sql` exists in A7.
- A final isolated rerun of `HostSessionExposurePublicationDbTest` passed 11/11 after expanding the authorization fingerprint with `base_vector_known`.

Focused application and canonical bundle:

```bash
./server/gradlew -p server unitTest --tests '*MutationCanonicalizationTest*' --tests '*HostSessionServicesTest*' --tests '*SessionRecordDraftServiceTest*' --tests '*SessionRecordApplyServiceTest*' --tests '*SessionRecordErrorHandlerTest*' --tests '*HostSessionRecoveryServiceTest*' --console=plain --no-parallel --max-workers=1
```

- PASS, 127/127: canonicalization 18, host services 64, draft 12, apply 17, record error handler 3, recovery 13. This includes current-versus-old schema lookup/conflict, null markers, semantic access no-op, and exactly-one epoch/cache signal.

Notes/archive/import/A6/Redis regression bundle:

```bash
./server/gradlew -p server integrationTest --tests '*ArchiveAndNotesDbTest*' --tests '*ArchiveControllerDbTest*' --tests '*HostSessionImportControllerDbTest*' --tests '*HostSessionRecordControllerDbTest*' --tests '*JdbcSessionRecordAdapterTest*' --tests '*JdbcMutationIdempotencyAdapterDbTest*' --tests '*RedisReadCacheInvalidationAdapterTest*' --tests '*RedisNotesReadCacheAdapterTest*' --tests '*RedisPublicReadCacheAdapterTest*' --console=plain --no-parallel --max-workers=1
```

- 102/103 passed. The only failure was the pre-existing order-sensitive digest-key retirement test after another method advanced its shared `MutableClock`; rerunning that exact test alone passed 1/1. All selected Notes/archive/import/session-record/Redis tests passed. Existing services and containers were preserved.

Architecture:

```bash
./server/gradlew -p server architectureTest --tests '*ServerArchitectureBoundaryTest.session record boundaries use owned models and ports' --console=plain --no-parallel --max-workers=1
./server/gradlew -p server architectureTest --console=plain --no-parallel --max-workers=1
```

- Focused apply-store abstract-method boundary PASS, 1/1.
- Full architecture executed 97 tests: 96 passed, with the same inherited `HostSessionQueryPort.listMode` default-runtime-failure finding present at round-3 base `cf552539`.

Full unit and quality gates:

```bash
./server/gradlew -p server unitTest --console=plain --no-parallel --max-workers=1
./server/gradlew -p server ktlintCheck --console=plain --no-parallel --max-workers=1
./server/gradlew -p server detekt --console=plain --no-parallel --max-workers=1
./scripts/server-ci-check.sh
git diff --check
```

- Full unit executed 1,636 tests: 1,633 passed, 1 skipped, and 2 failed. One is the inherited `ActiveSessionProjectionArchitectureTest`; the other is an unrelated global-log-appender race in `HostSessionServicesTest.changed reverse transition logs...`. The complete changed-unit bundle subsequently passed 127/127.
- A7-local ktlint findings were reduced to zero. The gate still reports exactly the inherited 13 findings in `CanonicalMeetingLanguageInventoryTest.kt` (12 chain continuations, one function signature).
- A7-local detekt additions were reduced from a temporary 124 to the unchanged baseline of exactly 122 issues across 38 files: MaxLineLength 57, ThrowsCount 15, MagicNumber 12, LongMethod 10, UnusedParameter 9, TooManyFunctions 7, LargeClass 5, CyclomaticComplexMethod 3, ReturnCount 3, ComplexCondition 1.
- `server-ci-check.sh` reaches and fails at that same inherited detekt gate with 122 issues. It does not produce a false passing claim.
- `git diff --check` passes.

An accidentally broad frontend test invocation also exposed 5 existing branch failures among 2,671 tests in untouched SPA-router, host-editor copy, and frontend-boundary files. The correctly targeted current-browser contract passed 8/8; round 3 changes only the fixture exporter and generated fixture, not those failing runtime/test files.

### Acceptance matrix selection and residual boundary

Selected:

- Compatibility: current frontend Zod fixture, v2 timestamp rebase, v3 exact rebase, mutually exclusive validation, and additive responses.
- Persistence/migration: V53 known/unknown backfill, save/restore/rebase exact vectors, preview/confirm fail-closed behavior, and V54 reservation.
- Exposure/publication: canonical and legacy access/site/summary changes, true no-op invariants, axis-specific revision movement, one record epoch/cache signal, and V45 compatibility repair.
- Idempotency/privacy: expected-revision HMAC identity with null markers, older-schema lookup-only behavior, exact replay/conflict, and raw-request non-storage.
- Authorization/club context and regressions: anonymous/non-host/cross-club zero-write fingerprints, Notes/Archive withdrawal, ordinary import/apply, A6 receipts/session record, and Redis invalidation.

Excluded:

- C1 convergence generation or attempts, BFF/CDN denial convergence, cache propagation SLA, deployment/runtime, OAuth/provider behavior, and browser UI redesign. A7 proves the origin transaction and signal only.

Self-review confirms that participant-only timestamp movement cannot stale an unchanged five-component correction base; any correction-owned revision movement does stale it; v2 review cannot record a vector it did not validate under lock; legacy semantic no-ops cannot move timestamps/revisions/epochs; and schema-version changes cannot replay a weaker stored canonical identity. C1 remains the non-release boundary and retains exclusive ownership of V54.

## Fix round 4: publication review timestamps and legacy visibility domain classification

This round closes the remaining one Critical and one Important review findings without reopening the origin, receipt, migration, or C1 surfaces. It separates canonical access, canonical placement, and compatibility-only repairs at both publication write owners. No migration, frontend runtime contract, V53 shape, or reserved V54/C1 artifact changed.

### Root cause and ADR impact

- Publication summary/site-only writes advanced `publication_revision` but skipped the `sessions` row when access and session compatibility were unchanged. Browser v2 therefore compared an unchanged `liveSessionUpdatedAt` and could rebase a reviewed draft onto a publication vector it had never seen.
- Legacy `/visibility` derived the correct V45 target exposure but grouped canonical `site_visibility` movement with legacy `visibility`/`is_public` projection repairs. The reader projection changed, but the publication domain revision did not.
- ADR-0022 impact remains `update`: the V45 mapper is still authoritative and the three axes remain separate. MEMBER/PUBLIC compatibility input maps HIDDEN/PUBLIC_RECORD placement only where a publication row and lifecycle policy allow it.
- ADR-0023 impact remains `update`: a real correction-owned summary/site/placement change advances the v2 legacy review timestamp and the exact publication revision. A compatibility-only repair advances only the conservative timestamp signal and reader epoch/cache signal, never exposure/publication revisions. No ADR status is promoted.
- ADR-0028 and ADR-0033 are unchanged. Existing HMAC identities, application-service transaction ownership, receipt binding, and exact v3 vectors remain intact.

### TDD RED evidence

The first test compile failed because `HostSessionVisibilityUpdateResult` had no `publicationChanged` axis; the compatibility endpoint could not report a canonical placement mutation independently from access or repair.

Two mutation checks then proved the regression tests exercise the missing production effects:

- Removing publication-only `sessions.updated_at` advancement made `HostSessionRecordDraftRebaseControllerDbTest.v2 rebase review timestamp rejects summary and site changes then records refreshed exact vectors` fail 0/1: the old v2 timestamp was incorrectly accepted.
- Removing the legacy visibility publication-revision bump made `HostSessionExposurePublicationDbTest.legacy visibility classifies placement changes and compatibility repairs without counterfeit revisions` fail 0/1 at the exact publication revision assertion.

### Implementation

- `HostSessionPublicationWriteOperations` now classifies access, placement, summary, session compatibility, and publication compatibility separately. Any actual publication-domain change bumps `publication_revision` and touches `sessions.updated_at` once; compatibility-only repair touches the legacy review timestamp and reader projection without counterfeiting a domain revision; exact repeats write nothing.
- `HostSessionDraftWriteOperations` applies the same classification to `/visibility`. A real placement change updates the public row, bumps `publication_revision`, advances the monotonic legacy timestamp, and reports `publicationChanged`; compatibility-only `visibility`/`is_public` repair reports only `compatibilityChanged`. The application service therefore emits one record epoch and one cache invalidation for either real change or repair, and none for a repeat.
- Correction-owned session timestamps use `greatest(utc_timestamp(6), timestampadd(microsecond, 1, updated_at))`, so an actual change cannot leave the v2 signal byte-identical even when two statements share a microsecond. Semantic no-ops still skip the statement entirely.
- CLOSED and PUBLISHED integration coverage checks HIDDEN↔PUBLIC_RECORD placement, exposure/publication revisions, monotonic/no-op timestamps, one record epoch, unchanged unrelated change-audit count, exact draft staleness, compatibility repair, and true repeat no-op.

### GREEN and regression evidence

Current frontend contract, v2/v3 rebase, correction/publication/authorization, HMAC/idempotency, and migrations:

```bash
./server/gradlew -p server integrationTest --tests '*FrontendZodSchemaContractTest*' --tests '*HostSessionRecordDraftRebaseControllerDbTest*' --tests '*HostSessionCorrectionSafetyDbTest*' --tests '*HostSessionExposurePublicationDbTest*' --tests '*HostSessionIdempotencyDbTest*' --tests '*MySqlFlywayMigrationTest*' --console=plain --no-parallel --max-workers=1
```

- PASS, 67/67: frontend Zod 14, v2/v3 rebase 4, correction safety 8, exposure/publication/auth 13, idempotency 10, Flyway 18.
- V53/V54 remain unchanged. The refreshed v2 rebase records the exact session/live/exposure/publication vector it loaded; old summary-only and site-only timestamps fail typed `SESSION_RECORD_LIVE_STALE` with an unchanged draft.

Notes/archive, ordinary import, A6/sessionrecord, HMAC adapter, and Redis/cache regression:

```bash
./server/gradlew -p server integrationTest --tests '*ArchiveAndNotesDbTest*' --tests '*ArchiveControllerDbTest*' --tests '*HostSessionImportControllerDbTest*' --tests '*HostSessionRecordControllerDbTest*' --tests '*JdbcSessionRecordAdapterTest*' --tests '*JdbcMutationIdempotencyAdapterDbTest*' --tests '*RedisReadCacheInvalidationAdapterTest*' --tests '*RedisNotesReadCacheAdapterTest*' --tests '*RedisPublicReadCacheAdapterTest*' --console=plain --no-parallel --max-workers=1
```

- 102/103 passed. The only failure was the inherited order-sensitive `MutableClock` digest-key retirement case documented in round 3; its exact isolated rerun passed 1/1. Every Notes/archive/import/sessionrecord/Redis test passed.

Final changed-surface verification:

```bash
./server/gradlew -p server integrationTest --tests '*HostSessionExposurePublicationDbTest*' --tests '*HostSessionCorrectionSafetyDbTest*' --tests '*HostSessionRecordDraftRebaseControllerDbTest*' unitTest --tests '*HostSessionServicesTest*' --tests '*SessionRecordDraftServiceTest*' architectureTest --tests '*ServerArchitectureBoundaryTest*' --console=plain --no-parallel --max-workers=1
```

- PASS: integration 25/25, unit 78/78, architecture 38/38.

Full-lane and quality evidence:

- Full unit executed 1,638 tests: 1,636 passed, 1 skipped, and the inherited `ActiveSessionProjectionArchitectureTest` failed.
- Full architecture executed 97 tests: 96 passed, with the inherited `HostSessionQueryPort.listMode` default-runtime-failure finding.
- `ktlintCheck` retains exactly the 13 inherited `CanonicalMeetingLanguageInventoryTest.kt` findings and no changed-file finding.
- Detekt improves from the round-3/base 122 issues to 121 by removing the prior `HostSessionDraftWriteOperations.updateVisibility` long-method finding; no new changed-file issue remains.
- `./scripts/server-ci-check.sh` reaches and fails at the inherited detekt gate with those 121 issues. It does not produce a false pass claim.
- `git diff --check` passes.

### Compatibility limitation and residual boundary

The v2 contract intentionally remains conservative: participant-only operations may historically advance `sessions.updated_at`, so an old v2 timestamp can stale even though participants are outside the exact correction vector. The v3 exact session/live/exposure/publication vector does not false-stale for that participant-only timestamp movement; `SessionRecordDraftServiceTest` and `HostSessionCorrectionSafetyDbTest` retain this proof. This dual-support limitation is accepted for R2a and is not weakened by this round.

C1 remains the non-release boundary. This round does not create convergence generations/attempts, claim BFF/CDN/cache propagation SLA, consume V54, or perform rollout/deployment/runtime mutation.

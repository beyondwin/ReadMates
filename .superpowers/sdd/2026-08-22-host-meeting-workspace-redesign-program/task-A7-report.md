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

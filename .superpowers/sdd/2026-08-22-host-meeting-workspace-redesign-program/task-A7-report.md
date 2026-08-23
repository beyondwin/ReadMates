# Task A7 report: atomic meeting projection publication

## Scope and base

- Base: `78e423001e7043ab1ef98435a043377090153dae`.
- Surface: Kotlin/Spring server application, persistence adapters, public/member origin queries, session-record apply, and focused server tests.
- Implemented origin atomicity only. This task does not implement or claim C1 convergence generation, BFF/CDN denial convergence, append-only convergence attempts, cache propagation SLA, runtime deployment, or provider validation.
- V45 compatibility is preserved: no migration was added or changed, and the existing compatibility columns remain dual-written by the authoritative origin transaction.
- The execution ledger was not edited.

## ADR impact

- ADR-0023: `update` in implementation evidence. Correction confirmation now owns the exact session/draft/live/exposure/publication vector and origin projection transition.
- ADR-0028: `update` in implementation evidence. Public origin eligibility now requires `PUBLISHED`, `GUEST_READABLE`, and `PUBLIC_RECORD` together.
- ADR-0022: satisfied; the compatibility projection remains bounded to the existing V45 columns.
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

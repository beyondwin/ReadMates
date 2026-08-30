# Task 1.1 Report: application projection and policy

## Status

Implemented only Task 1.1. ADR impact: `none`; the implementation follows the already Proposed ADR-0051 projection policy and adds no new durable decision.

## What changed

- Added the framework-neutral auth access projection model, including fixed v1 product-space and club-perspective wire ordering.
- Added the `ResolveAuthAccessProjectionUseCase` input port and its service implementation.
- The service combines `MemberIdentityLookupPort` and `PlatformAdminLookupPort`, filters readable memberships, deduplicates club spaces, grants `HOST` only to active hosts, and derives a semantic recommendation without routes or web DTOs.
- Added pure application-service coverage for platform-only, member, viewer, suspended host, active host, inactive/invited, mixed platform plus multiple clubs, and duplicate club inputs.

## TDD evidence

### RED

Command:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.auth.application.service.ResolveAuthAccessProjectionServiceTest'
```

Result: exit `1`.

Relevant expected failure before production code existed:

```text
Unresolved reference 'AvailableClubSpace'.
Unresolved reference 'ClubPerspective'.
Unresolved reference 'ProductSpaceKind'.
Unresolved reference 'RecommendedSpace'.
Unresolved reference 'ResolveAuthAccessProjectionService'.
```

The test failed during `compileTestKotlin` because the Task 1.1 projection model and service were intentionally absent.

### GREEN

Command:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.auth.application.service.ResolveAuthAccessProjectionServiceTest'
```

Result: exit `0` (`BUILD SUCCESSFUL`). The final focused run completed with the same command and exit `0`.

## Verification

- `./server/gradlew -p server unitTest --tests 'com.readmates.auth.application.service.ResolveAuthAccessProjectionServiceTest'` — exit `0`.
- `./server/gradlew -p server architectureTest` — exit `0`; 105 tests completed after correcting a test-only exact-import inventory interaction without changing inventory files.
- `./scripts/server-ci-check.sh` — exit `1` after the new test's Detekt findings were fixed. The remaining failures are pre-existing, unrelated Detekt findings in `HostOperatingRoomCurrentService.kt`, `HostOperatingRoomCandidateQueries.kt`, and `HostOperatingRoomCandidateDbTest.kt`; no Task 1.1 file is named in the final output.
- `git diff --cached --check` — run after staging, exit `0`.

## Files changed

- `server/src/main/kotlin/com/readmates/auth/application/model/AuthAccessProjection.kt`
- `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveAuthAccessProjectionUseCase.kt`
- `server/src/main/kotlin/com/readmates/auth/application/service/ResolveAuthAccessProjectionService.kt`
- `server/src/test/kotlin/com/readmates/auth/application/service/ResolveAuthAccessProjectionServiceTest.kt`
- `.superpowers/sdd/2026-08-30-platform-admin-operations-product-redesign/task-1-1-report.md`

## Self-review

Reviewed the exact staged diff. No web DTO, controller, frontend route, persistence adapter, or existing current-member service was modified. The new service has no URL or web DTO dependency and preserves `MEMBER, HOST` and `PLATFORM, CLUBS` wire order.

## Concerns

The PR-level server gate remains blocked by the three unrelated, pre-existing Detekt findings listed above. Evidence is otherwise repository-local; no integration or live-runtime validation is applicable to this pure application projection task.

# Task 1.2 Report: expose available spaces v1

## Status

Implemented only Task 1.2. ADR impact: `none`; this adapter work implements the existing Proposed ADR-0051 projection policy and introduces no new durable decision.

## Delivered surface

- `GET /api/auth/me` and dev login now resolve `ResolveAuthAccessProjectionUseCase` once for each known user ID and serialize its `availableSpaces` as v1.
- The web adapter preserves every legacy auth field. It maps the application-layer semantic recommendation to the legacy `recommendedAppEntryUrl` only at the web boundary: platform maps to `/admin`, a valid member club recommendation maps to `/clubs/{slug}/app`, and multi-club has no compatibility destination.
- Anonymous responses retain their existing values and now include `{ version: 1, kinds: [], clubs: [] }`.
- The generic Pages Function proxy is unchanged. Its contract test proves additive auth JSON is passed through while the existing internal response headers remain stripped.

## TDD evidence

### RED

Command:

```bash
./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest' --tests '*DevLoginControllerTest' --tests '*PlatformAdminBffSecurityTest'
```

Result: exit `1`.

Eight `AuthMeControllerTest`/`DevLoginControllerTest` assertions failed with `PathNotFoundException` for the intentionally absent `$.availableSpaces` path. They cover anonymous, unscoped member, requested-club-not-member, host-fallback, multi-club, platform-only, dev host, and dev platform-admin behavior. The wildcard's platform-admin pattern selected the separate tagged `com.readmates.club.api.PlatformAdminBffSecurityTest` sibling (5 tests), not the changed untagged `com.readmates.auth.api.PlatformAdminBffSecurityTest`; that sibling result is not used as evidence for the changed harness.

The BFF characterization was introduced before production adapter changes and passed independently because the generic proxy already preserves upstream JSON without a path-specific implementation:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts
```

Result: exit `0` (80 tests).

### GREEN

After injecting the Task 1.1 projection use case into the two controllers and adding only web DTO mapping, the AuthMe/DevLogin integration lane passed:

```bash
./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest' --tests '*DevLoginControllerTest'
```

Result: exit `0` (`BUILD SUCCESSFUL`).

The earlier `integrationTest --tests '*PlatformAdminBffSecurityTest'` wildcard also exited `0`, but selected the separate `com.readmates.club.api.PlatformAdminBffSecurityTest` sibling (5 tests) and is not used to verify this Task 1.2 test harness. The changed harness was verified with its exact unit-test FQCN:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.auth.api.PlatformAdminBffSecurityTest'
```

Result: exit `0`; the JUnit suite reports 51 tests, 0 failures, and 0 errors.

## Verification

- `./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest' --tests '*DevLoginControllerTest'` — exit `0` (`BUILD SUCCESSFUL`).
- `./server/gradlew -p server unitTest --tests 'com.readmates.auth.api.PlatformAdminBffSecurityTest'` — exit `0`; 51 tests, 0 failures, 0 errors.
- `./server/gradlew -p server unitTest --tests '*CurrentMemberArgumentResolverTest'` — exit `0` (`BUILD SUCCESSFUL`).
- `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts` — exit `0` (1 file, 80 tests).
- `./scripts/server-ci-check.sh` — exit `1`. The final Detekt report contains only the three known base-owned findings below; no Task 1.2 path is reported:
  - `server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostOperatingRoomCurrentService.kt` (`ReturnCount`)
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostOperatingRoomCandidateQueries.kt` (`LongMethod`)
  - `server/src/test/kotlin/com/readmates/session/api/HostOperatingRoomCandidateDbTest.kt` (`LongMethod`)

## Acceptance coverage

- Selected `Actor or authorization` and `Club context`: anonymous, member, host-fallback, requested-club-not-member, platform-only, and dev-login projection paths are covered.
- Selected `BFF or OAuth`: the Pages Function test confirms generic auth-me response passthrough and trusted-header stripping.
- Persistence, lifecycle, async/provider, public projection, and UI rows are excluded: Task 1.2 adds no migration, mutation, cache/provider behavior, or browser UI consumer.

## Self-review

- Reviewed the scoped diff and all `AuthMemberResponse` construction paths. The one direct fixture factory was updated to supply the new required projection.
- Confirmed `AuthMeController` and `DevLoginController` no longer call the legacy joined-club/platform-admin lookup pair; each known-user response path obtains one `ResolveAuthAccessProjectionUseCase` result.
- Confirmed BFF production files are untouched.
- `git diff --check` passed before commit preparation.

## Residual risk

The PR-level server gate remains red solely due to the three fixed-base Detekt findings listed above. Evidence is repository-local; no live runtime, deployment, or production data validation was performed.

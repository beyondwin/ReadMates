# Task 4 Report: PUT Member Profile Contract

## Changed surface

- Added `OwnMemberProfileReplaceRequest` and `PUT /api/me/profile`.
- The controller resolves only trusted club context, fails closed with `MEMBER_NOT_FOUND`, and delegates both fields to `ReplaceOwnMemberProfileUseCase`.
- Existing display-name and avatar `PATCH` adapters and their shared error mapping remain unchanged.
- Added controller integration coverage for club isolation, missing/malformed context, authentication, duplicate names, invalid/removed avatar keys, blocked memberships, and no partial column writes.
- Added BFF coverage proving PUT method/query/body preservation and attacker slug replacement with the normalized trusted slug.

## Acceptance evidence

- Selected authorization, club-context, and BFF rows because the new write endpoint depends on authentication and trusted club selection.
- Persistence atomicity is asserted at the HTTP boundary by querying both membership columns after rejection; Task 3 owns simultaneous store-level atomicity coverage.
- Session lifecycle, publication visibility, async/provider, cursor, and UI rows do not apply to this adapter-only contract.

## Checks

- PASS: `front/node_modules/.bin/vitest run --config front/vitest.config.ts front/tests/unit/cloudflare-bff.test.ts` (42 tests).
- PASS: `git diff --check`.
- BLOCKED: `./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest` — sandbox denies the Gradle wrapper lock file.
- BLOCKED: `./scripts/server-ci-check.sh` — same Gradle wrapper lock denial.
- BLOCKED: direct Gradle distribution with a temporary `GRADLE_USER_HOME` — sandbox denies Gradle's file-lock contention socket.
- BLOCKED: the initial Corepack pnpm invocation attempted an install and could not reach the package registry; the already-installed local Vitest binary provided the focused BFF evidence above.

## Residual risk

Kotlin compilation and Testcontainers behavior were not executable in this sandbox. The controller integration tests require CI or an unrestricted local Gradle run for runtime confirmation.

## Review fix round 1

- Added HTTP-boundary simultaneous-request coverage: two PUT requests race for the same display name, exactly one succeeds, and the 409 loser preserves both columns. A deterministic lock-mediated PUT race additionally verifies the typed duplicate response.
- Added six PUT DTO/error-handler cases for missing, explicit `null`, and blank `displayName`/`avatarKey`. Each asserts status 400, exact error code/message, and no partial write.
- Strengthened unauthenticated PUT coverage with a persisted baseline membership and assertions that display name and avatar key remain unchanged.
- BLOCKED: `./server/gradlew -p server integrationTest --tests com.readmates.auth.api.MemberProfileControllerTest` — `FileNotFoundException` opening the Gradle wrapper `.zip.lck` (`Operation not permitted`).
- PASS: `git diff --check`.

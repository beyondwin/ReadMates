# Stage 4 Task 3 brief — privacy-safe host person detail API

## Scope and authority

Implement only Stage 4 plan Task 3 from base `13b2efc5c068f44f6cd24f00e14050888e0f6d68`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Implement the accepted task contract; do not add/update/supersede an ADR or reopen the broader design.
- Migration tail is V63. This task is read-only and must add no migration.
- Preserve the external untracked `design/mockups/2026-08-30-admin-operations-redesign/` tree untouched and unstaged.

## Required API and privacy contract

Implement exactly:

```text
GET /api/host/people/{membershipId}?attendanceCursor=...&limit=20
```

- Require the current authenticated membership to be an ACTIVE HOST in the URL-selected/trusted-BFF club context. Fail closed on viewer/member/non-active host, authority loss, malformed IDs, cross-club target, or missing target using the repository's controlled error conventions.
- Query the target directly by `(clubId, membershipId)`. Do not load or scan the paged host member list on the client or server.
- The serialized allowlist is only: `membershipId`, `displayName`, `avatarKey`, membership `status`/`role`, coarse `lastClubAccessAt`, current schedule state/revision/time, current RSVP, and an attendance-history page with `nextCursor`.
- Never expose or serialize `userId`, email, account/login name, auth sessions, page path/history, duration, IP, user-agent, provider/token fields, or exact telemetry. `lastClubAccessAt` comes only from `membership_club_access.last_access_at`; do not infer it from user/auth timestamps. Respect inactive/deleted lifecycle semantics and add forbidden-key JSON assertions.
- Keep the vertical slice one-way: inbound controller -> hostworkspace input port/service -> hostworkspace output query port -> hostworkspace JDBC adapter. Do not inject/import auth/session foreign persistence adapters or repositories. Direct SQL joins inside the hostworkspace adapter are allowed behind its own port.

## Cursor contract

- Attendance history is server-paged and ordered by a stable total order that supports no-gap/no-duplicate continuation. Fetch `limit + 1`; never client-slice a partial collection. Validate a bounded limit using existing HTTP conventions.
- `HostPersonCursorCodec` must use a purpose-bound signed opaque cursor with strict payload shape. Bind at least purpose/version, club ID, current host membership ID, target person membership ID, stable sort tuple, evaluated/expiry time and signing key version.
- First/continuation/last pages, tamper, malformed/non-canonical payload, cursor reuse across club/host/person, expiry, current/previous key rotation and retired-key behavior must be tested. A cursor from another host list/purpose must fail closed. Do not fall back to unsigned `CursorCodec`.
- Continuation must preserve no-gap/no-duplicate behavior under the chosen stable ordering. If an evaluation anchor is necessary to make this true, bind and apply it server-side.

## Frontend/BFF contract

- Add strict Zod contracts in `front/features/host/api/host-person-contracts.ts`, a feature-owned GET client, and TanStack Query keys/options in `host-person-queries.ts`. Query keys must include club and membership identity plus continuation parameters; no UI/route module enters this task.
- Add one focused generic BFF GET proof for the encoded membership path, query string and trusted club context. Reuse the generic proxy; do not add a special route or change trusted-header/secret behavior.
- Export deterministic strict fixtures and update both server `FrontendFixtureContractTest` and `FrontendZodSchemaContractTest`. Run export twice and require no second diff.

## TDD and focused evidence

1. RED first in the three exact server tests and two co-located frontend tests named by the plan. Include active-HOST success, URL club scope, cross-club/not-found/authority loss, inactive lifecycle, response forbidden keys, direct target query/no list scan, cursor boundaries and pagination continuity.
2. Implement the smallest files listed by Stage 4 Task 3. Do not implement Task 4 invitation/settings, Task 5 workbox aggregation, Task 8 person UI, or unrelated architecture/security changes.
3. Run only focused Task 3 server unit/controller/persistence/contract tests, focused frontend API/query/BFF/Zod tests, exact ESLint for changed frontend files, architecture boundary tests, fixture stability, `git diff --check`, and targeted public-safety scans. Full frontend/server/CT/E2E/public-release gates wait for the Stage boundary.
4. Force-add this brief and a `task-3-report.md`, then commit all and only intended Task 3 files. Report RED/GREEN commands, test counts, file SHA-256 manifest and any skipped proof honestly.

## Exclusions

- No UI route/detail screen or CT in this task.
- No new mutation, migration, notification/invitation/settings/workbox behavior.
- No production/live runtime, external provider, email, push, PR, tag or deployment action.

# Stage 4 Task 6 brief — frontend workbox contract, query and pure model

## Scope and authority

Implement only Stage 4 plan Task 6 from base `780a5f687effc6646d4a1cfd062fe86f816f6332`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. No design/ADR reopening.
- Implement only the exact API/query/model/tests/fixture/purge files in Task 6. No UI/route composition from Task 7/8 and no server behavior change.
- Preserve external untracked `design/mockups/2026-08-30-admin-operations-redesign/` untouched and unstaged.

## Strict wire contract and API

- Define strict Zod schemas for all `NOW|DEFERRED|COMPLETED` states, all five work-item types, all five source availability entries, optional typed failure codes, receipt summary, nullable timestamps/receipt/cursor and non-negative count including literal zero.
- Enforce cross-field invariants that the server contract guarantees: available source has null/no failure code, unavailable source has its type-specific safe code; item state matches page state; deferred/resolved timestamp combinations are state-consistent; `destinationHref` is safe same-origin app-relative and contains no scheme; cursor is opaque and only nullable at last page. Reject unknown/private keys recursively.
- API calls exactly the GET/PUT/DELETE routes from Task 5, URL-encodes the authoritative key once, includes club context, preserves state/cursor/limit, parses every JSON response before use, and handles DELETE 204 without parsing a body. No arbitrary key construction or local completion mutation.

## Query/cache contract

- Workbox query keys must descend from `hostClubQueryPrefix(clubSlug)` and include `workbox`, state and cursor/page identity. Different club/state/cursor values must never collide.
- Deferral PUT and DELETE mutations use the existing club-scoped host mutation key convention. Success invalidates the entire workbox root (all three states/pages) and the existing operating-room-current composition query for that same club only. Preserve the original server receipt/error; do not optimistically mark completed.
- Register the workbox root in the host query-key inventory and authority-loss purge tests. Purge must remove/cancel only the exact club's workbox cache/mutations and prevent late responses from resurrecting it.

## Pure model contract

- `host-workbox-model.ts` is pure: no React/router/fetch/query imports. It maps every source type to explicit Korean operational labels and an approved destination category while preserving the server-provided scoped `destinationHref`.
- Use these stable labels unless an existing approved copy constant already matches exactly: `일정 미열람 확인`, `가입 승인 검토`, `지난 모임 기록 마감`, `초대 링크 만료 확인`, `알림 실패 확인`.
- Never hide `count: 0`, coerce zero to unavailable, or merge partial availability into an empty-success state. Provide typed partial-warning presentation data from source availability, with no raw server/private detail.
- Model `NOW`, `DEFERRED`, `COMPLETED` distinctly and retain `receiptSummary` only for completed/present responses allowed by the wire.

## Fixture and focused evidence

1. RED `host-workbox-api.test.ts` for strict schemas/all types/states/partial warnings/receipt/cursor/private keys plus exact GET/PUT/DELETE behavior.
2. RED `host-workbox-queries.test.ts` for club+state+cursor keys, all-state/operating-room invalidation and exact-club mutation isolation.
3. RED `host-workbox-model.test.ts` for five Korean mappings, safe destination categories, partial warnings and visible zero counts; RED inventory/purge registration.
4. Implement the smallest files. Add `front/tests/unit/__fixtures__/host-workbox-page.json`; update the literal exporter for every Task 6 response. Reuse/update the Task 5 Zod fixtures rather than adding aliases.
5. Run exporter, stage intended JSON, run exporter again and require fixture-tree no diff. Run both endpoint-backed server contract classes through focused `integrationTest` because the TS schema source changed.
6. Run only the three Task 6 test files, query inventory/state-purge tests, focused Zod fixture tests/contracts, exact changed-file ESLint, `git diff --check` and targeted public/private-data scan. Full frontend/build/E2E waits for Task 9.
7. Force-add this brief and `task-6-report.md`, commit intended files, and record RED/GREEN commands/counts and per-file SHA-256 manifest.

## Exclusions

- No workbox UI, tabs/rows/schedule review flow, CT, server source/snapshot changes, named-link/settings changes, deployment, push, PR or tag.

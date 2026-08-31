# Stage 4 Task 8 brief — complete meetings, people, records and settings destinations

## Scope and authority

Implement only Stage 4 plan Task 8 from base `90aba87ee7598b5a7839069e478dcc1a3bbb6c59`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Do not reopen design/ADR/Tasks 1–7.
- Frontend destination/UI/route/query-composition and focused unit/CT only. No server/migration/OAuth/BFF/source predicate changes and no Task 9 full gate work.
- Preserve external untracked `design/mockups/2026-08-30-admin-operations-redesign/` untouched and unstaged. Do not stop user ports 18080/5173. No real email, OAuth, club close or private data mutation in tests.

## Meetings destination

- Preserve the real server-backed upcoming and past pagination, cursor-stale recovery, new/edit/detail routes and lifecycle/status copy. Add an accessible list/calendar affordance using only dates/items already loaded from the current server pages; never synthesize days, sessions or completion.
- Calendar is an alternate organization of the exact loaded rows, grouped by real date/month, and must disclose when more server pages exist rather than imply a complete month. Switching views makes no mutation and keeps working detail/new/edit links and return state.
- Keep loading/error/empty/partial-past states distinct. Both continuation controls remain cursor-backed and deduplicate exact session IDs without scanning another client cache.

## People and dedicated person detail

- Keep pending approval and active/suspended/inactive member rows using `AvatarChip`; link each safe member identity to the declared scoped `people/:membershipId` route without exposing email or user IDs.
- Add `host-person-detail-route.tsx`, `host-person-detail.tsx`, route element/registration/inventory/continuity tests. Resolve membershipId from URL and call only Task 3 `hostPersonDetailQuery`; validate `response.membershipId === URL membershipId` and fail closed otherwise. Never fetch or scan the paged member list for detail.
- Render allowlisted fields only: avatar/display name, membership role/status, coarse `최근 접속` from `lastClubAccessAt` or exact `접속 기록 없음`, current schedule state/revision/time, RSVP, and attendance history. State explicitly that page-view history is not collected. Never map login/auth-session/page timestamps.
- Attendance history continuation sends the server cursor unchanged, appends only exact page results, deduplicates by the stable server tuple without inventing rows, and handles cursor failure/refetch without losing the already visible first page.
- Membership management is visually separate from attendance/schedule facts. Reuse existing lifecycle actions only when their required facts are present and server-authoritative; otherwise provide a clear return to the People management ledger rather than inferring permissions. Cross-club/authority loss follows existing route guards/purge.

## Records destination

- Replace `/records` reuse of the full meetings route with a record-only controller/view backed solely by `hostSessionRecordLedgerQuery`. The page must render only strict CLOSED/PUBLISHED items and the server summary (`needsAttentionCount`, `incompletePublishedCount`, `draftCount`) as editorial ledger context, not KPI cards.
- Show closing state/lifecycle, `recordStatus`, draft/attention markers, visibility/publication state, exact modified time when present, and links to the existing exact session detail/closing workspace with return state. Do not call an upcoming-session list or fabricate publication history.
- Preserve first-page and opaque cursor continuation, cursor-stale restart, load failure/empty/zero summary, and deduplication. Existing exact session detail/history continuation remains the authoritative publication history surface; link to it and add/adjust focused proof that the record route never substitutes a list-derived detail.

## Settings destination

- Finish the Task 4 composition: named invitation links, existing email invitations as a clearly separate compatibility section, club settings, co-host management, audit history and guarded club-end preview/confirm. Use only strict Task 4 query/mutation contracts.
- Named link create remains one-time disclosure and hash/token-free after dismissal. Pause/resume/edit use exact current revision and idempotency; stale/unknown paths refresh without creating a fresh semantic request or revealing secrets. Do not label email invites as named links.
- Co-host candidates/rows may consume the existing scoped member query, but render only membership ID/display/avatar/status/role and never email/auth data. Promote/demote uses the current settings revision and one stable idempotency key per logical attempt. Do not locally infer last-host permission; show safe server permission/stale reasons, refetch settings/members/history after success/unknown.
- History uses the strict settings history cursor and allowlisted actions, before/after fields and occurred time. Continue with the exact opaque cursor, retain visible rows on failure, and avoid raw internal error detail.
- Club end remains preview first and confirms the exact previewId/effectHash with one stable idempotency key. No close on open/preview. Stale/expired/unknown results clear non-current previews, preserve a visible receipt/recovery state, and require an explicit same-request reconciliation; tests use mocks only.

## Experience and responsive contract

- Follow the existing calm paper/ink hierarchy, editorial ledgers, real `AvatarChip`, keyboard-accessible tabs/toggles, focus visibility, 44px targets, reduced motion and no horizontal table dependency on mobile. Avoid KPI-card grids, gradients and generic dashboard chrome.
- Add focused component tests representing approved surfaces 10/11/12/13/14/17: meetings desktop, people desktop, records desktop, settings desktop, schedule-review route continuity, and person-detail mobile. Do not reopen or regenerate approved authority PNGs. CT may use synthetic local fixtures only.

## TDD and focused evidence

1. RED tests first for meetings list/calendar real-data behavior and cursor/empty/error states.
2. RED tests first for direct person detail query, URL identity fail-close, privacy copy, coarse access label, current schedule/RSVP, cursor continuation and mobile layout.
3. RED tests first for record-only query, strict states/summary/status/detail return link, pagination/cursor recovery and proof that no upcoming list query runs.
4. RED tests first for settings link/email separation, co-host current-revision/idempotency/recovery, history cursor, and club-close preview/confirm/unknown behavior.
5. Implement the smallest reuse-oriented surface. Run only affected unit/route/inventory tests and focused CT for the six Task 8 surfaces, exact changed-file ESLint, changed-file type-diagnostic filter, `git diff --check`, and targeted added-line public/private-data scan. Full frontend/server/E2E/public-release waits for Task 9.
6. Force-add this brief plus `task-8-report.md` and SHA-256 manifest, commit exactly `feat(host): complete lifecycle ledger destinations`.

## Exclusions

- No server or migration change, no Task 9 BFF/full gate/E2E work, no broad redesign, no authority-doc edits, no real notification/email/OAuth/club close, no deploy, push, PR or tag in this task.

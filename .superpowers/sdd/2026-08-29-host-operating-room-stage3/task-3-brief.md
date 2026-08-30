# Stage 3 Task 3 brief — operating-room loader

- BASE: `e2fd48f30b51fc82c21a446b57a6fb2a7c831fa8`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 3 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the loader-composition portion of Proposed ADR-0048/0049; no new ADR.

## Required outcome

- Replace the dashboard loader data dependency with the server-owned `GET /api/host/operating-room/current` selector, then fetch the exact host session detail when a sessionId exists. The frontend must never select by date/list order.
- Auth must finish first and URL-derived club scope must be passed to every query. Required selector or selected-detail failure remains a route error; `currentMeeting: null` returns an explicit empty operating-room result without discarded dependent fetches.
- After sessionId is known, prefetch the exact existing closing-status, record-attention, club-operations, and notification-health sources in parallel. Each optional source must return a typed ready/absent/failed result carrying its data or retryable error, rather than detached booleans. One optional failure must not blank or cancel the others.
- Preserve existing query-key scoping, retry policy, and no-legacy-`/api/host/dashboard` behavior.
- Modify only the Task 3 files from the plan. A minimal API/query contract addition inside the existing host query/API contract owners is allowed only if the selector cannot be safely consumed otherwise; if added, cover it with focused runtime-contract tests and explain the necessity in the report.
- Establish RED for auth-first, URL club scope, null selector, selector+exact detail, independent optional failures, parallel optional start, and absence of legacy dashboard/list-based selection. Run focused loader/query/API contract tests and exact changed-file ESLint under Node 24/pinned pnpm, diff check, and public-safety scan. Write public-safe `task-3-report.md`, force-add brief/report, commit.

## Stop conditions

- Do not alter server, route rendering, UI, CSS, mutations, or Stage 4+ behavior.
- Do not derive schedule-seen availability from frontend facts; pass through the server field.
- Do not run full frontend/server/CT/E2E/public-release gates.
- Preserve and ignore the externally appeared untracked design PNG directory.

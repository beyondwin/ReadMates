# Stage 4 range review fix 1 brief

Implement only the three IMPORTANT findings from the Stage 4 range review, from base `002c4a00dd50c70e089aa7b30b8df7bb70500207`.

## Finding 1 — unknown confirmation cache reconciliation

- In `host-schedule-review-route.tsx`, a `ReadmatesTransportError` after confirm is indeterminate: the server may have committed. Preserve the durable unknown receipt and no-resend behavior, but invoke the same club-scoped invalidation set as a known confirm before returning.
- RED must assert confirm called exactly once, no automatic resend control, and invalidation of the workbox root, manual notification state/dispatch roots, exact session detail and operating-room-current composition. Do not navigate the receipt away.

## Finding 2 — concurrent idempotent settings commands

- In `HostClubSettingsService`, settings update, co-host change and club-end confirm must serialize/claim before deciding that no prior command exists. After acquiring the club/preview transaction lock, replay lookup must happen before revision/active/preview-consumed checks.
- Same idempotency key + same canonical request under concurrency must produce one mutation/history transition and the same receipt/replayed result to both callers. Same key + request drift must fail conflict without a second mutation.
- Preserve transaction ownership, actor/club authority, last-active-host protection, revision monotonicity and preview/effect binding. Do not widen public/controller/security endpoints.
- RED real-MySQL concurrency tests for at least co-host and club-end confirm; cover settings update if the same shared ordering is not structurally guaranteed. Sequential replay tests remain green. No sleeps as correctness synchronization; use barriers/latches and bounded futures.

## Finding 3 — present blank cursor fail-close

- Workbox and person controllers/codecs must distinguish absent cursor (`null`, legitimate first page) from present empty/whitespace cursor (controlled invalid cursor/restart). Never trim a valid nonblank opaque token or silently replace a corrupt continuation with a fresh first page.
- Add server controller/codec tests for empty, spaces/tabs and valid opaque bytes. Add/strengthen frontend person API/query boundary so empty/whitespace never reaches fetch/key creation while valid bytes remain unchanged; Task 6 workbox frontend behavior stays sealed.
- Preserve current status/problem codes and safe restart semantics. Generic BFF remains pass-through; no route special case.

## Focused evidence and commit

1. RED the exact frontend unknown invalidation test, real concurrency tests and blank-cursor controller/API/query tests before production changes.
2. GREEN only affected frontend files, club service/persistence/controller tests, hostworkspace controllers/codecs, person API/query and one-way architecture boundary.
3. Run exact changed-file ESLint, ktlint/detekt for changed Kotlin, `git diff --check`, targeted public-safety scan and a delta SHA-256 manifest. Do not rerun full Stage 4 gates, CT, E2E, integration union or public release.
4. Record `source hash -> command -> result -> finding closure` in `stage4-review-fix-1-report.md`; force-add brief/report/manifest and commit exactly `fix(host): close stage 4 range review findings`.

Do not touch external `design/mockups/2026-08-30-admin-operations-redesign/`, user ports, external delivery/OAuth/real club close, deploy, tag or push.

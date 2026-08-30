# Stage 4 Task 7 brief — workbox rail and review-first schedule notification

## Scope and authority

Implement only Stage 4 plan Task 7 from base `aacad94e8183dd2f070033a70c81e3039b609ba7`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Do not reopen design, ADR or prior tasks.
- Touched surface is frontend route/state/UI plus focused unit and component tests. Do not change server contracts, migrations, source predicates, OAuth/named-link/settings behavior or Task 8 destinations.
- Preserve external untracked `design/mockups/2026-08-30-admin-operations-redesign/` untouched and unstaged. Do not use or stop user ports 18080/5173. No real email/provider action.

## Workbox composition

- Create `host-workbox.tsx`, `host-work-item.tsx`, `operation-receipt.tsx` and `host-workbox.css`, with colocated unit tests and focused CT. Reuse Task 6's strict page query, pure model and deferral mutations; do not duplicate parsing or labels.
- Render NOW, DEFERRED and COMPLETED as keyboard-accessible tabs. Counts are only counts for the currently loaded server page; never present them as full collection totals when `nextCursor` exists. Keep literal zero visible. Support a load-more continuation without merging identities across state/cursor.
- Show distinct loading, empty, overdue and retryable source-partial states. A failed source is typed availability data, not an all-empty success. Retry refetches the affected page; it does not mutate any source fact.
- Desktop uses a quiet hairline 68/32 preparation/workbox grid. At `max-width: 1199px`, place the workbox below preparation in normal document order. Preserve the established paper/ink typography, low-chrome hierarchy, focus visibility, touch targets and reduced-motion behavior; do not add KPI cards or decorative gradients.
- `HostWorkItem` follows only the server-provided scoped `destinationHref`. Both it and `HostNextAction` pass the exact server-returned `key` verbatim to PUT/DELETE deferral. Never derive a key from type/resource/revision and never optimistically complete an item.
- Deferral uses explicit future options and submits an ISO future instant; undo removes the same authoritative key. Pending controls are disabled and errors stay recoverable without dropping the row.
- `OperationReceipt` has durable, accessible presentation for pending, success, partial, failure and unknown outcomes. Unknown never offers or performs an automatic resend. Completed workbox receipt summaries remain server-owned and read-only.
- The global workbox remains available even when there is no current meeting; the current-meeting empty state must not hide the independent work queue.

## Schedule review route

- Add `/sessions/:sessionId/schedule-review` to the shared destination constants/inventory and scoped host route registry, with a dedicated route element and `host-schedule-review-route.tsx`. Resolve club from scoped host context and session ID from the URL; fetch the exact host session detail. Do not scan a paged session/member list.
- Fail closed unless `scheduleSeenAvailability === "AVAILABLE"`. In unavailable, missing, stale-authority or load-error states, do not mount an enabled composer or call preview/confirm; expose a safe return/retry path.
- Display every attendee from the server detail. Only `STALE` and `UNSEEN` are initially selected and eligible for the reminder; `CURRENT` remains visible, explicitly excluded and disabled. Do not infer this from RSVP, attendance, login or client timestamps.
- Use one enabled Task 2 manual notification template returned for the exact session. Keep subject/body editable and selected membership IDs explicit. Opening the route, selecting recipients and editing copy must make zero preview/confirm calls. Any edit or target change after preview discards that preview.
- Preview builds the exact Task 2 selection: session/event/content revision, current schedule revision, `SELECTED_MEMBERS`, selected IDs, explicit exclusions/inclusions, channels, `NOW`, subject and body. Confirm is separately enabled only for the current preview and sends the same selection plus `previewId` and explicit resend confirmation when required.
- A successful confirm displays a durable receipt instead of navigating it away. Map `PENDING|PUBLISHING` to pending, `PUBLISHED` to success and `FAILED|DEAD` to failure. A confirmed mixed-channel/expected-count discrepancy may display partial; an indeterminate network outcome displays unknown with a link to the notification ledger and no resend. Preserve receipt visibility through query invalidation/refetch.
- Confirm completion invalidates the same-club workbox root, manual notification state/dispatch roots and the exact session-detail/operating-room composition queries. A Task 2 stale/recipient/content conflict refreshes detail/options/workbox, retains the user's draft where safe, clears preview and requires a new preview; it must never silently resend.

## TDD and focused evidence

1. RED unit tests first for workbox tabs/page-visible counts, zero, partial retry, empty, overdue, load-more, exact-key defer/undo, and five receipt states.
2. RED schedule-review tests first for AVAILABLE gating, STALE/UNSEEN selection, visible-disabled CURRENT, editable draft, zero sends on open/select/edit, preview invalidation, exact preview/confirm payload, stale recovery, unknown no-resend and cache invalidation.
3. RED route inventory/registration tests and focused CT at desktop and <=1199px/mobile widths. CT must assert the 68/32 desktop rail and below-preparation responsive order; no screenshot update outside Task 7.
4. Implement the smallest route/UI/query invalidation glue. Reuse existing manual notification hooks/contracts and existing host-session query keys; add only missing targeted invalidation helpers if required.
5. Run only Task 7 unit/route/inventory tests, focused CT, exact changed-file ESLint, TypeScript/build slice if available, `git diff --check`, and targeted added-line public/private-data scan. Full frontend lint/test/build/E2E waits for Task 9.
6. Force-add this brief plus `task-7-report.md` and a SHA-256 manifest, commit exactly `feat(host): add lifecycle workbox and schedule review`.

## Exclusions

- No Task 8 meetings/people/records/settings completion, no broad visual redesign, no server or migration change, no BFF expansion, no full E2E, no external email/OAuth, no deploy, push, PR or tag.

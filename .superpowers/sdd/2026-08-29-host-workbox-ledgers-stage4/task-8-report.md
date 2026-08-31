# Stage 4 Task 8 report — lifecycle ledger destinations

## Authority and scope

- Base: `90aba87ee7598b5a7839069e478dcc1a3bbb6c59`.
- Stage 4 plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- Proposed ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`; the implementation stays inside the approved Stage 4 authority.
- Only frontend destination, route composition, presentation, model and focused tests changed. No server, migration, BFF, OAuth, provider, deploy or real mutation surface was used.
- External untracked `design/mockups/2026-08-30-admin-operations-redesign/` remained untouched and unstaged.

## Delivered behavior

- Meetings retain real upcoming/past cursor pages and add an accessible list/calendar switch. Calendar groups only loaded server rows by their actual dates, discloses incomplete pagination and keeps independent cursor continuation and exact-ID deduplication.
- People rows expose safe display identity links without email/user IDs. The dedicated scoped person detail calls only the exact membership query, fails closed on URL/response mismatch, exposes coarse club access and current schedule/RSVP facts, states that page-view history is not collected, and continues attendance with the exact cursor plus stable-tuple deduplication.
- Records now use the record-only ledger query/controller rather than the upcoming meeting list. The editorial summary preserves literal zero, rows expose closing/record/draft/attention/publication facts, continuation deduplicates exact session IDs, and detail links preserve the record-owned return URL.
- Settings compose named links, a separately labelled legacy email-invitation compatibility route, basic settings, safe member-derived co-host management, allowlisted audit history and preview-bound club end. Co-host and close recovery keep one idempotency key per logical attempt; unknown/stale outcomes refresh authority, clear non-current previews and never disclose raw failures or secrets.
- The schedule-review route reuses a pure header component so its scoped return continuity is included in the six-surface CT without invoking notification transports.

## TDD and sealed evidence

| Source hash / command | Result | Finding closure |
|---|---|---|
| Base plus meetings RED tests | Focused model/UI Vitest | RED 5 failed, 17 passed; GREEN 22/22 | real dates, exact-ID dedupe, calendar disclosure, independent continuation and distinct error/empty states closed |
| Base plus people/detail RED tests | Focused route/UI Vitest | RED module load plus 4 behavior failures with 19 existing passes; GREEN 26/26 | exact detail query, identity fail-close, privacy/coarse access, scoped return and attendance continuation closed |
| Base plus records RED tests | Focused model/query/UI/route Vitest | RED 4 failed, 14 passed; GREEN 18/18 | record-only query/route, editorial summary, zero and deduplicated cursor continuation closed |
| Base plus settings RED tests | Focused component/route Vitest | RED on missing co-host/history modules while 2/2 email-separation cases passed; GREEN 11/11 | named/email separation, current revision, stable retry, history cursor retention and close recovery closed |
| Final Task 8 frontend surface | Node 24 pinned Corepack/pnpm direct Vitest over 17 focused files | GREEN 151/151 | destination models, routes, UI, route inventory, frontend dependency boundary and affected legacy people tests closed |
| Approved surfaces 10/11/12/13/14/17 | Playwright CT, Chromium | GREEN 6/6: meetings/people/records/settings at 1440px, schedule-review continuity at 1024px, person detail at 390px | focused responsive, overflow, focus, target and reduced-motion evidence closed without authority PNG churn |
| Exact changed TypeScript/TSX files | Node 24 pinned Corepack/pnpm ESLint | 0 errors, 0 warnings | changed-file lint closed |
| Changed UI surface | `impeccable detect --json` over changed destination UI/CSS | `[]` | detector reported no remaining finding |
| Frontend TypeScript diagnostic filter | Node 24 `tsc --noEmit --pretty false` | repository gate remains non-green with 653 existing diagnostic lines; changed-file filter named five unchanged-base test diagnostics and no Task 8-added-line diagnostic | baseline debt reported without reopening prior tasks |
| Implementation hashes | `shasum -a 256 -c task-8-manifest.sha256` | 44/44 expected | exact implementation/test/route surface sealed; manifest excludes brief, report and itself |
| Patch and public safety | `git diff --check`, cached diff check and targeted added-line scan | clean | whitespace, absolute path, private-domain, OCI, PEM and token-shaped additions closed |

## Explicit residuals and exclusions

- Full frontend lint/test/build, full E2E, server/Testcontainers and public-release gates are intentionally deferred to Task 9/stage closeout.
- The repository-wide TypeScript command is not green because of established baseline debt. The five diagnostics whose file names intersect this task are on unchanged base lines (`HostSessionAttentionSummary` fixture and existing `HostMembersActions` test fixtures); no new Task 8 file diagnostic appeared.
- A separate typography contract still reports the base Task 7 `host-workbox.css` use of `--font-editorial`. That file is byte-identical to Task 8 base and was not reopened under the task authority.
- Tests use synthetic fixtures and mocked/no-op callbacks. No real club close, email, OAuth, notification, member-role mutation, deployment, push, PR or tag occurred.

## Review round 1 closure — definitive rejection versus unknown reconciliation

The two IMPORTANT settings-recovery findings were closed together without changing another Task 8 destination:

- Club-end confirmation no longer interprets `Error.message`. `ReadmatesApiError` code/status now distinguishes expired, mismatch, not-found, consumed, settings-stale and fallback non-current preview responses. Every definitive API rejection clears both the rendered preview and bound confirm request, exposes fresh-preview recovery, and cannot reconfirm the old preview or reuse its idempotency key. Only a transport or otherwise indeterminate non-API result retains the exact confirm request for same-request reconciliation.
- Co-host recovery now classifies `HOST_SETTINGS_STALE`, `LAST_ACTIVE_HOST_REQUIRED`, permission status/code and transport uncertainty through the parsed API error contract. Stale, permission and other definitive server rejections clear the pending request; after the settings/members/history refetch, the next operator action uses the newly rendered revision and a new idempotency key. Only `ReadmatesTransportError` retains the exact request/key.

TDD evidence: realistic `ReadmatesApiError` fixtures with non-semantic user messages first produced 8 failures with 8 existing component passes. After routing API interpretation through the architecture-safe recovery adapter, the component file passed 16/16 and the final focused component/recovery/dependency-boundary set passed 41/41. Exact six-file ESLint completed with 0 errors and 0 warnings; focused diff and added-line public-safety checks were clean. The unchanged six-surface CT and other destination evidence remain sealed because this review only changed error disposition and focused tests. The six-file delta is sealed by `task-8-review-1-manifest.sha256`.

## Review round 2 closure — transport-only close reconciliation

Close-confirm recovery now treats only `ReadmatesTransportError` as an indeterminate outcome that may retain the exact preview-bound request and idempotency key. An arbitrary non-API error is a definitive rejected path: the dialog clears its bound request and rendered preview, requires a fresh preview, and therefore cannot reuse the old key. The focused test first failed 1/30 because a plain `Error` was still classified as `unknown`, then the recovery and settings suites passed 30/30 after the minimal classifier change. The two-file delta is sealed by `task-8-review-2-manifest.sha256`; no other destination or CT layout surface changed.

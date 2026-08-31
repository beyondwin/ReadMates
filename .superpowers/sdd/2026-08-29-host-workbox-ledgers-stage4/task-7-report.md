# Stage 4 Task 7 report — lifecycle workbox and schedule review

## Authority and scope

- Base: `aacad94e8183dd2f070033a70c81e3039b609ba7`.
- Plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- Task brief SHA-256: `236ab34b6ff7bb090673ffd6ce1ff8b7e218eff472c9c37a9394df7dcb7ab3f0`.
- ADR impact: `none`; no durable decision outside the accepted Stage 4 authority was introduced.
- The external `design/mockups/2026-08-30-admin-operations-redesign/` tree remained untouched and unstaged.

## Delivered behavior

- The operating room now keeps a club-global workbox visible with or without a current meeting. NOW, DEFERRED and COMPLETED are keyboard-operable tabs with literal zero, page-only count disclosure, continuation, loading, empty, overdue, source-partial retry, exact-key defer/undo and read-only completed receipts.
- Desktop preparation/workbox composition is a quiet 68/32 rail; at `1199px` and below the workbox follows preparation in document order. Focus visibility, 44px interactive targets and horizontal containment are covered by focused component tests.
- Workbox destinations and opaque keys remain server-owned. The current meeting only receives an authoritative next-action key when the server destination targets that exact session; the key itself is never parsed or reconstructed.
- The new scoped and compatibility schedule-review route fetches the exact session and stays fail-closed unless schedule-seen authority and the exact enabled `SESSION_REMINDER_DUE` template agree. CURRENT attendees remain visible-disabled; only STALE and UNSEEN begin selected.
- Opening, selecting and editing issue no preview or confirm request. Preview carries the exact Task 2 selection and is discarded after edits. Confirm reuses that snapshot plus its `previewId`, renders a durable pending/success/partial/failure/unknown receipt, never automatically resends an unknown outcome, and invalidates same-club workbox, notification/manual-dispatch, exact-detail and operating-room keys.
- Stale authority refreshes exact detail/options/workbox evidence, preserves safe draft text and explicit eligible selections, clears preview and requires a new preview.

## TDD and sealed evidence

| Source hash / command | Result | Finding closure |
|---|---|---|
| Base plus Task 7 tests only | Node 24 pinned-pnpm Vitest invocation for workbox, schedule-review, route and inventory tests | RED: workbox/receipt/schedule-review modules and schedule-review route were missing; the initial package-script form also exposed unrelated existing full-suite architecture failures | requested UI and route behavior demonstrably preceded implementation; subsequent runs used direct focused Vitest execution |
| Base plus Task 7 CT only | `pnpm --dir front exec playwright test -c playwright-ct.config.ts features/host/ui/workbox/host-workbox.ct.tsx --project=chromium` | RED: component build could not resolve the missing `host-workbox` module; after implementation, CT isolated missing direct rail CSS ownership and a sub-44px link target | missing behavior and both responsive/accessibility defects were closed without screenshot churn |
| Scoped self-review additions | Node 24 direct Vitest over workbox and schedule-review | RED: 3 focused failures proved fabricated inactive-tab zero, unscoped row error and mismatched detail authority; GREEN: 2 files, 14/14 | page-only count truth, key-owned recovery error and URL/detail fail-closed boundary closed |
| Final Task 7 frontend surface | Node 24 `pnpm --dir front exec vitest run` over eight focused model/query/UI/route/inventory files | GREEN: 8 files, 90/90 | workbox states, exact-key actions, five receipts, schedule-review authority/payload/recovery/invalidation and route registration closed |
| Final Task 7 CT | same focused Playwright CT command | GREEN: Chromium 3/3 at 1440px, 1199px and 390px | 68/32 desktop rail, responsive document order, focus, targets and overflow closed |
| Changed TypeScript/TSX files | Node 24 `pnpm --dir front exec eslint` over the exact 18 changed TS/TSX files | 0 errors and 0 warnings | focused static check closed |
| Changed visual surface | `impeccable detect --json` over the Task 7 UI/route/CSS targets | `[]` | no detector finding remained |
| Frontend TypeScript slice | Node 24 `pnpm --dir front exec tsc --noEmit --incremental false -p tsconfig.json` | NOT PASSED: repository-wide pre-existing type debt remains. Filtering named only the existing base `host-operating-room-model.test.ts` version-vector fixture and unchanged attendance receipt line in `host-dashboard-route.tsx`; no Task 7-new file diagnostic appeared | reported honestly; no unrelated baseline repair was attempted |
| Implementation hashes | `shasum -a 256 -c task-7-manifest.sha256` | 20/20 OK | exact runtime/test/route surface sealed; manifest excludes itself, brief and this report |
| Patch and public safety | `git diff --check`, `git diff --cached --check`, targeted added-line private-data scan | clean | whitespace and public-repository safety closed |

## Explicitly skipped and residual risk

- Full frontend lint/test/build, server gates, Playwright E2E, public-release gates and screenshots were not run; Task 9/stage closeout owns those full gates.
- No real notification, email/provider action, OAuth action, deployment, push, PR or tag was performed.
- The focused route tests use mocked Task 2 transports. Browser-level BFF/server integration and mixed-channel provider behavior remain for the stage E2E/full-gate boundary.
- The repository-wide TypeScript gate is not green because of existing baseline debt described above; Task 7 introduced no diagnostic in its new files.

## Review round 1 closure — exact authority, count and pending boundaries

The three IMPORTANT findings were closed together without reopening any previously sealed Task 7 surface:

- Every Task 2 manual-notification application code is now classified. Expired, missing, reused and otherwise non-current previews are cleared immediately. Recipient, audience, template, state, content and target-snapshot conflicts also clear the preview, preserve the operator draft and fail the composer closed until both exact detail and manual options refetch successfully and agree on URL session, schedule-seen availability, schedule revision and enabled content/audience authority. Refetch failure has an explicit unavailable/retry state, so an old preview can never be confirmed.
- Workbox tab counts now render only from an exact matching page that has finished loading without error. Literal `0` remains visible for a genuinely loaded empty page, while initial load, error and cursor transition disclose no fabricated or stale count.
- The operating-room next action receives pending state only when its current authoritative work-item key exactly matches the unresolved mutation. The defer control stays visible-disabled with `보류 중`, and a synchronous key guard prevents a repeated click from submitting twice.

TDD evidence: the four affected Vitest files first failed 13 tests with 42 passing, then passed 55/55 after the minimal implementation. Exact nine-file ESLint completed with 0 errors and 0 warnings; `git diff --check`, cached diff check and the targeted added-line public-safety scan were clean. Repository-wide TypeScript remains non-green on existing debt; the changed-file filter reports only the previously sealed unchanged attendance receipt diagnostic in `host-dashboard-route.tsx:358`, and no review-round-added diagnostic. The previously sealed Chromium CT result remains 3/3 because this round did not change CSS, CT fixtures or responsive composition. The nine-file review delta is sealed in `task-7-review-1-manifest.sha256`, excluding the manifest and this report.

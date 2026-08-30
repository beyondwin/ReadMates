# Task 2.1 implementation report

Status: DONE

Initial commit: `74dfa977482ebf721bdf68ce373a929a5ff35db9`

Fix round 1 commit: `2cafe61ed43b3aea9af8a3a4f2845369636ace94`

Fix round 2 commit intent: `fix(app): tombstone late transition registrations`

## Scope and ADR impact

- Implemented only the Task 2.1 pure/shared/app model, storage, context, and coordinator seams.
- ADR impact: `none`. This task implements the transition model already proposed by ADR-0051; it neither changes an accepted decision nor accepts ADR-0051 ahead of the remaining program work.
- Task 2.2 navigation-controller wiring and Task 2.3 switcher UI are deliberately not implemented.
- Existing `readmates:last-safe-workspace-target:{member|host}` keys remain readable and are not deleted.

## Implementation

- Added shared `ProductSpace`, club perspective, identity, `ReturnTarget`, recovery observation, pending-registration, retired-receipt, and publication-port types without importing app or feature code into shared.
- Added a React transition-safety context exposing only the registration port.
- Added an app-owned transition coordinator with a 30-second default timeout, shorter-timeout support, upper-bound clamping, invalid-timeout rejection, generation tokens, coordinator-owned retired receipts, and a narrow current-owner publication callback.
- Normal same-identity unmount retires a receipt, permits at most one reconciliation, and removes it in `finally`. Authority loss synchronously invalidates and clears active and retired work, cancels timers, advances generation, and permits zero replay.
- A newer pending registration atomically retires an older registration for the same owner; dirty-token cleanup does not mutate pending generations. Different owners remain independently current and the aggregate snapshot stays blocking until every pending owner settles.
- Receipt capsules now use one managed state across active, retired-registry, and `finally` paths. Invalidation and clear are one-shot, authority changes during an awaited recovery normalize the final observation to `authority-lost`, and callback failures are aggregated without aborting the remaining purge/generation cleanup.
- Recovery operation identity mismatches fail synchronously before timer, recovery, invalidation, or clear work starts. Destination resolution returns no destination when the available-space projection has no valid identity.
- After authority loss, dirty registration is a no-op and pending registration returns a tombstoned handle. A late receipt is immediately invalidated and cleared exactly once; no active entry, timer, snapshot, registry entry, recovery I/O, or publication remains. The same gate applies to registration reentered from invalidate/clear/purge callbacks.
- Added eight named, dependency-free publication boundary ports for UI, cache, receipt callback, success copy, error copy, navigation, return target, and session storage. They receive only generation-authorized operation identity/outcome and import no product implementation or `QueryClient`.
- Added an app-owned, typed route-family registry covering every Task 2.1 allowlist row. It composes the existing route-owned parsers for platform-admin filters, host meeting/ledger state, archive view, and notes state.
- Added versioned per-identity `ReturnTarget` persistence. Unknown keys, hashes, duplicate singleton parameters, absolute URLs, cross-club targets, oversized targets, stale projections, and unsupported parameters are rejected or normalized according to the route-family contract. No auth, pending state, request payload, receipt capsule, or capability data is serialized.
- Centralized the legacy `ClubWorkspace` alias on the shared `ClubPerspective` type without deleting legacy continuity behavior.

## Route-family evidence

The typed registry and focused tests cover all grouped rows from the design table:

- platform admin: Today, clubs list, club detail, support, notifications, AI, audit, analytics
- member: archive, notes, and the no-search current-session/notifications/settings/my-page group
- host: meeting detail/editor, meeting/record ledgers, notifications, and the no-search members/invitations/dashboard/AI-defaults group

For each family, the table-driven suite proves the representative positive case plus rejection or fallback for unknown parameters, duplicate singleton parameters, cross-club targets, oversized targets, and stale projection data. Route-specific tests additionally prove canonical host meeting state, platform-admin parser reuse, focus existence checks, bounded scroll restoration, hash removal, legacy-key migration, and unavailable-identity purge.

## TDD evidence

RED command:

```text
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/model/global-space.test.ts shared/ui/space-transition-safety-context.test.tsx src/app/global-space-continuity.test.ts src/app/global-space-transition.test.ts
```

RED result: exit 1. All four suites failed collection because the four production modules did not exist.

An intermediate GREEN attempt exposed 28 contract mismatches in fallback selection and table-case construction. The failures were traced before changing implementation expectations; the registry fallback order and fixtures were corrected.

Final GREEN result: exit 0, 4 files passed, 115 tests passed.

Final self-review added a focused storage-boundary RED for stale-projection purge. It failed with exit 1 (1 failed / 85 passed) because the stale entry was normalized instead of removed. After the minimal store fix, the exact focused command returned to GREEN with the count above.

Fix round 1 added RED probes before production changes. The exact focused command exited 1 with 11 expected failures (2 failing suites, 117 passing tests): overlapping same-owner lifecycle, dirty/pending generation isolation, both operation-identity mismatch variants, authority loss during awaited recovery, cleanup exception isolation, empty/malformed projections, context-free stale fallback, and stale remember refusal. The different-owner aggregate/publication probes already passed and documented the retained contract.

Fix round 1 GREEN result: exit 0, 4 files passed, 128 tests passed.

Fix round 2 RED used the same exact focused command and exited 1 with 4 expected failures (1 failing suite, 127 passing tests): the current-owner positive path did not reach any named boundary, post-authority dirty registration surfaced state, post-authority receipt registration retained its capsule/timer, and cleanup-callback reentry emitted transient state and duplicate timers.

Fix round 2 GREEN result: exit 0, 4 files passed, 131 tests passed.

The coordinator suite includes the exact interleaving `beginPending -> unregister -> authority loss -> late settle/reconcile`. Original issue count is produced by an instrumented invocation, remains 1, replay count is 0, `currentOwnerRefetch` and each of the eight named boundary ports receive zero calls, canonical request fields are cleared, and retired-registry size is 0. A separate current-owner positive test proves every named port is connected by the coordinator rather than by a test-side fan-out helper.

## Verification

- Focused Task 2.1 command: exit 0, 4 files / 131 tests.
- Route-parser and boundary bundle: exit 0, 9 files / 236 tests.
- Full frontend suite: `npx --yes corepack@0.35.0 pnpm --dir front test`; exit 0, 420 files / 3,866 tests.
- Frontend lint: `npx --yes corepack@0.35.0 pnpm --dir front lint`; exit 0. It reports only the two pre-existing Fast Refresh warnings in `meeting-notification-rail.tsx` and `member-invitations-section.tsx`; no touched-file warning or error remains.
- Frontend build: `npx --yes corepack@0.35.0 pnpm --dir front build`; exit 0, 781 modules transformed.
- Exploratory `tsc -b --pretty false`: exit 1 with 714 lines of repository-wide existing TypeScript baseline output. Filtering a fresh run for `global-space` and `workspace-route-(model|continuity)` produced no touched-path match, so this command is not claimed as passing.
- The full test run emitted the existing Node `localStorage` experimental warning; it did not fail tests.

## Self-review

- Dependency direction remains app -> features -> shared. Shared code imports neither feature nor app modules.
- Publication seams have no `QueryClient` or product-layer imports. The eight named ports independently record whether a generation-authorized observation crossed each contract boundary.
- The authority-loss interleaving asserts zero calls independently for UI, cache, receipt callback, success copy, error copy, navigation, return target, and session storage; it does not synthesize those results from one spy.
- The persistence adapter serializes the exact `ReturnTarget` envelope only.
- Authority loss clears active and retired receipt state synchronously before any late microtask can reconcile.
- Authority loss during an already-awaited recovery overrides its late result, and managed capsule cleanup remains one-shot even when domain callbacks throw.
- Authority loss permanently closes both registration APIs: late or reentrant work cannot recreate dirty/pending state, and receipt tombstones retain only primitive operation identity after immediate clear.
- Empty or wholly malformed available-space projections produce no destination; Task 2.2 must supply login/selection handling rather than navigating an unprojected identity.
- Stale projections neither persist nor restore a target, and their pure fallback cannot reuse loaded IDs from stale context.
- The coordinator owns reconciliation and automatic detached cleanup; callers do not need to orchestrate receipt replay.
- No navigation controller, switcher UI, server contract, migration, release, or deployment surface was added.

## Residual risk

- End-to-end navigation and responsive switcher behavior remain unmeasured here because they belong to Tasks 2.2 and 2.3 and have no Task 2.1 UI/controller wiring yet.
- ADR-0051 remains Proposed until the wider implementation, tests, and active architecture align.

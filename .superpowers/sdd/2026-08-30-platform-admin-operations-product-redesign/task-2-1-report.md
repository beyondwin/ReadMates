# Task 2.1 implementation report

Status: DONE

Commit intent: `refactor(app): model global space transitions`

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
- Added an app-owned, typed route-family registry covering every Task 2.1 allowlist row. It composes the existing route-owned parsers for platform-admin filters, host meeting/ledger state, archive view, and notes state.
- Added versioned per-identity `ReturnTarget` persistence. Unknown keys, hashes, duplicate singleton parameters, absolute URLs, cross-club targets, oversized targets, stale projections, and unsupported parameters are rejected or normalized according to the route-family contract. No auth, pending state, request payload, receipt capsule, or capability data is serialized.
- Centralized the legacy `ClubWorkspace` alias on the shared `ClubPerspective` type without deleting legacy continuity behavior.

## Route-family evidence

The typed registry and focused tests cover all grouped rows from the design table:

- member: today, library, discussion, notes, archive
- host: dashboard, meetings, meeting workspace, library, members, settings, applications, notifications
- platform admin: dashboard, clubs, audit, analytics, support

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

The coordinator suite includes the exact interleaving `beginPending -> unregister -> authority loss -> late settle/reconcile` and asserts request count 1, replay count 0, zero authority-lost/publication surfaces, cleared canonical pending fields, and retired-registry size 0. It also covers active authority loss, same-identity maximum-one reconciliation, `finally` cleanup after failure, stale generation settlement, current-owner recovery publication, and the exact timeout contract.

## Verification

- Focused Task 2.1 command: exit 0, 4 files / 115 tests.
- Route-parser and boundary bundle: exit 0, 9 files / 236 tests.
- Full frontend suite: `npx --yes corepack@0.35.0 pnpm --dir front test`; exit 0, 420 files / 3,850 tests.
- Frontend lint: `npx --yes corepack@0.35.0 pnpm --dir front lint`; exit 0. It reports only the two pre-existing Fast Refresh warnings in `meeting-notification-rail.tsx` and `member-invitations-section.tsx`; no touched-file warning or error remains.
- Frontend build: `npx --yes corepack@0.35.0 pnpm --dir front build`; exit 0, 781 modules transformed.
- Exploratory `tsc -b --pretty false`: exit 1 because of the repository's existing unrelated TypeScript baseline. Filtering that output for `global-space` and `workspace-route-(model|continuity)` produced no touched-path match, so this command is not claimed as passing.
- The full test run emitted the existing Node `localStorage` experimental warning; it did not fail tests.

## Self-review

- Dependency direction remains app -> features -> shared. Shared code imports neither feature nor app modules.
- The publication seam has no `QueryClient` type and exposes only the current-owner recovery observation needed by Task 2.1 tests.
- The persistence adapter serializes the exact `ReturnTarget` envelope only.
- Authority loss clears active and retired receipt state synchronously before any late microtask can reconcile.
- The coordinator owns reconciliation and automatic detached cleanup; callers do not need to orchestrate receipt replay.
- No navigation controller, switcher UI, server contract, migration, release, or deployment surface was added.

## Residual risk

- End-to-end navigation and responsive switcher behavior remain unmeasured here because they belong to Tasks 2.2 and 2.3 and have no Task 2.1 UI/controller wiring yet.
- ADR-0051 remains Proposed until the wider implementation, tests, and active architecture align.

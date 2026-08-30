# Task 1.3 Report: consume available spaces projection

## Status

Implemented only Task 1.3. ADR impact: `none`; this frontend compatibility work implements the existing Proposed ADR-0051 decision and creates no new durable decision.

## Delivered surface

- Added the additive `AvailableSpacesV1` frontend contract and one pure normalizer.
- v1 projection data is canonicalized to `PLATFORM, CLUBS` and `MEMBER, HOST`, deduplicated, and rejects unknown versions, malformed club fields, malformed perspectives, and malformed legacy rows without widening visibility.
- Projection omission derives only the already-readable legacy club destinations; host requires `HOST + ACTIVE + ACTIVE approval`, and platform requires legacy `platformAdmin` presence.
- Every listed `AuthMeResponse` JSON ingress normalizes before its context, audience, redirect, or capability decision. Existing action authorization checks remain unchanged.
- Compatibility fallback is a non-enumerable derived property so legacy loader result object shapes remain additive; an actual v1 server field remains enumerable.
- Updated only the requested representative API/E2E auth fixtures. No switcher, href registry, or route work was added; Task 2.1 remains the route-registry owner.

## TDD evidence

### RED

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/auth/available-spaces.test.ts features/club-selection/route/club-selection-data.test.ts tests/unit/auth-context.test.tsx features/host/route/host-loader-auth.test.ts features/guest-browse/route/guest-route-data.test.ts
```

Result: exit `1`. The new normalizer module was intentionally absent, and the new ingress assertions showed raw malformed/unknown projections passed through unchanged.

After the initial GREEN implementation, a focused run exposed one existing exact-object assertion that rejected the additive compatibility field. The fallback was changed to non-enumerable derived state, keeping the legacy result shape intact while leaving `auth.availableSpaces` available to consumers.

An additional malformed legacy-row regression was then added first:

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/auth/available-spaces.test.ts
```

Result: exit `1`; the test reproduced `TypeError: Cannot read properties of null (reading 'status')`. The normalizer now skips non-record legacy rows.

### GREEN

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/auth/available-spaces.test.ts features/club-selection/route/club-selection-data.test.ts tests/unit/auth-context.test.tsx features/host/route/host-loader-auth.test.ts features/guest-browse/route/guest-route-data.test.ts tests/unit/frontend-boundaries.test.ts
```

Result: exit `0` (6 files, 77 tests).

## Verification

- Focused auth/normalizer, ingress, context, host, guest, club-selection, fixture, and frontend-boundary tests: exit `0` (77 tests).
- `npx --yes corepack@0.35.0 pnpm --dir front test`: exit `0` (416 files, 3,727 tests).
- `npx --yes corepack@0.35.0 pnpm --dir front lint`: exit `0`; two pre-existing Fast Refresh warnings remain in unrelated host UI files.
- `npx --yes corepack@0.35.0 pnpm --dir front build`: exit `0`.
- `npx --yes corepack@0.35.0 pnpm --dir front test:e2e`: exit `1` before tests began because the default local API port was already occupied and Playwright is configured with `reuseExistingServer: false`. The existing process was preserved; no alternate service or test database was started.
- `git diff --check` and `git diff --cached --check`: exit `0`.

## Acceptance coverage

- Selected `Actor or authorization` and `Club context`: platform-only, mixed authority, selected club, readable fallback, inactive host, malformed/unknown projection, host public/authenticated branches, and guest member audience all have focused evidence.
- Selected `UI or runtime state`: app context, club-selection redirect loader, and source inventory prove state normalization before consumption; no new UI is in scope.
- `BFF or OAuth`, persistence, lifecycle, provider, and public-projection rows are excluded: Task 1.3 does not modify BFF/OAuth code, server persistence, mutations, or public data.

## Self-review

- Reviewed all listed ingress source files and the public status-only probe. The source inventory test prevents an ingress from bypassing the common normalizer and prevents the probe from importing full auth/projection types.
- Confirmed malformed and unknown server projection data never falls back to broader legacy destinations; fallback applies only when the projection is absent.
- Confirmed no route href, global switcher, action authority, or `public-auth-action-state.ts` production change was introduced.

## Residual risk

Repository-local unit, lint, and build evidence is green. Browser E2E is not measured in this worktree because its isolated server lane could not start while another local backend occupied the configured port; no production, deployment, or billable-provider validation was performed.

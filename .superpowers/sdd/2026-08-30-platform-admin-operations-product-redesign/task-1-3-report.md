# Task 1.3 Report: consume available spaces projection

## Status

Implemented only Task 1.3 and its review fix round. ADR impact: `none`; this frontend compatibility work implements the existing Proposed ADR-0051 decision and creates no new durable decision.

## Delivered surface

- The common pure normalizer returns `NormalizedAuthMeResponse`, whose required `availableSpaces` is enumerable for both v1 and legacy-fallback input. It therefore survives object spread, JSON serialization, and structured cloning.
- v1 data is canonicalized to `PLATFORM, CLUBS` and `MEMBER, HOST`; unknown versions, malformed rows, malformed perspectives, and identity-conflicting duplicates fail closed. Perspective union is retained only for duplicate rows with identical club ID, slug, and name.
- Projection omission preserves only the already-readable legacy destinations. An unknown or malformed supplied projection never falls back to legacy destinations.
- Club-selection redirects now require an exact normalized member-space correspondence with the destination URL. Malformed and unknown projections cannot redirect via `recommendedAppEntryUrl` or a single readable legacy club.
- All listed auth JSON ingress points normalize the fetched value before the named state, guard, audience, or redirect sink. The public auth-action probe remains structurally unable to consume `availableSpaces`.
- Anonymous, initial 401, error, and logout transitions install normalized empty `availableSpaces`. Existing action authorization checks remain unchanged.
- No switcher, route href registry, or global-space route work was added; Task 2.1 remains the owner. Only existing exact fixture expectations were made explicit for the enumerable normalized shape.

## TDD evidence

### RED

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/auth/available-spaces.test.ts features/club-selection/route/club-selection-data.test.ts tests/unit/auth-context.test.tsx
```

Result: exit `1` (10 failures). The new tests demonstrated non-enumerable fallback loss at copy/JSON/clone boundaries, permission union across conflicting duplicate identities, redirects through unknown/malformed projections, absence of normalized anonymous spaces, and the insufficient ingress proof.

### GREEN

```bash
npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/auth/available-spaces.test.ts features/club-selection/route/club-selection-data.test.ts tests/unit/auth-context.test.tsx features/host/route/host-loader-auth.test.ts features/guest-browse/route/guest-route-data.test.ts tests/unit/frontend-boundaries.test.ts
```

Result: exit `0` (6 files, 83 tests).

## Verification

- Focused common-normalizer, all ingress/order proof, auth-context transitions, host/guest/club-selection, fixture-contract, and frontend-boundary tests: exit `0` (83 tests).
- `npx --yes corepack@0.35.0 pnpm --dir front test`: exit `0` (416 files, 3,733 tests). Node emitted existing localStorage experimental warnings.
- `npx --yes corepack@0.35.0 pnpm --dir front lint`: exit `0`; two pre-existing Fast Refresh warnings remain in unrelated host UI files.
- `npx --yes corepack@0.35.0 pnpm --dir front build`: exit `0`.
- E2E is not required for this fix round and was not re-run. The earlier Task 1.3 E2E attempt exited `1` before tests because the default API port was already occupied while Playwright had `reuseExistingServer: false`; the unrelated existing server was preserved and no alternate service or test database was started.
- `git diff --cached --check`: exit `0` before the fix commit. After commit the range check will be `git diff --check 4ee8104d..NEW_HEAD`.

## Acceptance coverage

- Selected `Actor or authorization` and `Club context`: exact normalized member redirect, unknown/malformed projection redirect denial, legacy fallback, inactive host, conflict deduplication, platform, host public/authenticated branches, and guest audience have focused evidence.
- Selected `UI or runtime state`: authenticated app state plus anonymous/401/error/logout empty projection transitions have focused evidence. No new UI is in scope.
- `BFF or OAuth`, persistence, lifecycle, provider, and public-projection rows are excluded: Task 1.3 does not modify BFF/OAuth code, server persistence, mutations, or public data.

## Self-review

- AST-backed tests verify each named ingress wraps its fetch result in `normalizeAuthAvailableSpaces`, forwards that normalized value to its actual sink, and does so in source order. A dead or late normalizer call, raw sink input, or missing ingress fails the test.
- Conflicting identity rows are blocked persistently within a payload so later duplicates cannot restore a destination.
- The public status-only probe neither imports projection types nor names `availableSpaces`.
- Confirmed no action authorization, route-registry, switcher, or public-probe production behavior changed.

## Residual risk

Repository-local unit, lint, and build evidence is green. Browser E2E remains unmeasured for the pre-existing occupied-port reason above; no production, deployment, or billable-provider validation was performed.

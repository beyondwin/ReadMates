# Task 5 Report: Replace Split Frontend Mutations with One Profile Revision

## Outcome

- Added the framework-independent `EditableMemberProfile`, typed profile failure model, and profile failure-field mapping.
- Replaced the My Page split name/avatar mutation path with one club-scoped `PUT /api/me/profile` request containing both required fields.
- Consolidated query invalidation to one successful profile mutation.
- Replaced independent field overrides with one club-scoped, generation-aware saved profile override. Both fields advance and retire together; stale revalidation responses and previous-club responses cannot replace the current saved/current-club profile.
- Wired the route and My Page presentation tree through one `onSaveProfile` callback. The existing leaf name editor and avatar picker adapt their field-specific UI interactions into complete editable profiles.
- Kept direct compatibility coverage for the legacy avatar endpoint only.

## RED

The pinned Corepack command was attempted first:

```text
corepack pnpm --dir front exec vitest run features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx
```

Corepack attempted to repair the workspace install and could not reach `registry.npmjs.org` (`ERR_PNPM_META_FETCH_FAIL` / `ENOTFOUND`) in the network-restricted environment. The already-installed repository binary was therefore used explicitly from `front/`:

```text
./node_modules/.bin/vitest run features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx
```

Observed RED: 2 files failed; 6 tests failed and 2 passed. The query test showed the old `PATCH` body nesting the combined object under `displayName`; all controller tests failed because the implementation still required `useUpdateMyAvatarMutation` and did not expose `saveProfile`.

## GREEN and verification

Focused data/route GREEN:

```text
./node_modules/.bin/vitest run features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx features/archive/route/my-page-route.test.tsx
```

Result: 3 files passed, 12 tests passed.

Focused architecture plus data/route verification:

```text
./node_modules/.bin/vitest run tests/unit/frontend-boundaries.test.ts features/archive/queries/profile-queries.test.tsx features/archive/route/profile-update-controller.test.tsx features/archive/route/my-page-route.test.tsx
```

Result: 4 files passed, 20 tests passed.

Full frontend lint:

```text
./node_modules/.bin/eslint .
```

Result: exit 0, no findings.

Full frontend tests:

```text
./node_modules/.bin/vitest run
```

Result: 231 files passed, 1,877 tests passed.

Frontend production build:

```text
./node_modules/.bin/vite build
```

Result: exit 0; 568 modules transformed and production assets emitted.

Whitespace validation:

```text
git diff --check
```

Result: exit 0.

## Skipped validation and residual risk

- `corepack pnpm --dir front test:e2e` was not run because this focused data-flow task did not start the external application/server/database/browser environment required by the E2E suite. Unit route coverage exercises the changed user interactions and callback assembly.
- Corepack could not be used after the initial attempt because the restricted environment could not fetch missing packages. All subsequent checks used the repository's existing `front/node_modules/.bin` binaries; the package manager pin remains unchanged.

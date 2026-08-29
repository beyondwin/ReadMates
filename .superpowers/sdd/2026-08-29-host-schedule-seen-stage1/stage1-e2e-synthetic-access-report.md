# Stage 1 synthetic account E2E fixture evidence

## Scope and source seal

- Stage 1 source HEAD before this focused correction: `8ccc20f9afcefd298a96dd3669f2e617791a0e6e`.
- Authority base used for the admin comparison: `9285266bbc620b7f9c522dd2a469ac02ab467655`.
- ADR impact: `none` — this task only aligns a synthetic E2E fixture with already implemented Stage 1 contracts.
- Original account fixture SHA-256: `577be8aab1936e73856891d6ce19ad3268983c18d8c1c16ceaacd74cd9f205b7`.
- Corrected account fixture SHA-256: `0448762d52ed59a4bd134e2afe5cf2e7fee0d8a5b8b16901d36fb1d2ec4e0c6d`.
- Authority-base admin spec SHA-256 values:
  - `admin-ai-ops-drilldown.spec.ts`: `86ab4ff56570030e37ca803f1aa1233721d535eb933e8b2346f4b90e4185cd2a`.
  - `admin-analytics.spec.ts`: `eb84eb9afc0d6956384964fd05a7e1502ddb7fb64b254551c00a9405c8010027`.
  - `admin-audit-ai-ops-drilldown.spec.ts`: `83248e10c60e3e860992b84e02777c2d43947329c53713af5965e21e92e22dcf`.

Commands ran with Node `v24`, Corepack `0.35.0`, repository-pinned pnpm `11.13.1`, one Playwright worker, and isolated loopback ports and synthetic databases. Machine-specific launcher and temporary-checkout paths are intentionally omitted.

## Finding closure

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Original account fixture `577be8aa...` at `8ccc20f9...` | `npx --yes corepack@0.35.0 pnpm --dir front test:e2e tests/e2e/account-navigation-avatars.spec.ts --project=chromium` | `1 passed`, `6 failed`; every failure emitted `Unhandled synthetic BFF request: /api/bff/api/me/club-access`. | RED proved that the new nonblocking club-access touch crossed the synthetic handler without a receipt fixture. |
| Intermediate account fixture with only the club-access route | Same focused Chromium command | `5 passed`, `2 failed`; the unhandled-request error disappeared. | The route returns only the privacy-safe strict receipt `{ lastClubAccessAt }`. The remaining roster failures exposed a second, same-file Stage 1 contract drift instead of another route failure. |
| Corrected account fixture `0448762d...` | Same focused Chromium command | `7 passed` in `18.5s`. | The member current-session response now includes its exact revision and already-seen fact. The host detail and member-list responses include only the Stage 1 strict Zod fields needed by those existing journeys. No production code changed. |
| Corrected account fixture `0448762d...` | `npx --yes corepack@0.35.0 pnpm --dir front exec eslint tests/e2e/account-navigation-avatars.spec.ts` | Exit `0`. | Focused lint is closed. |
| Corrected account fixture `0448762d...` | `npx --yes corepack@0.35.0 pnpm --dir front exec tsc --ignoreConfig --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable --types node tests/e2e/account-navigation-avatars.spec.ts` | Exit `0`. | The corrected fixture and its dependency graph type-check. |
| Corrected account fixture `0448762d...` | `git diff --check -- front/tests/e2e/account-navigation-avatars.spec.ts` plus the targeted private-value scan | Exit `0`; scan returned no findings. | Whitespace and public-repository safety are closed for the fixture before report creation. |

## Authority-base admin comparison

The three admin specs were run unchanged from detached authority base `9285266b` in an isolated temporary worktree, with separate loopback ports and a synthetic database:

```text
npx --yes corepack@0.35.0 pnpm --dir front test:e2e \
  tests/e2e/admin-ai-ops-drilldown.spec.ts \
  tests/e2e/admin-analytics.spec.ts \
  tests/e2e/admin-audit-ai-ops-drilldown.spec.ts \
  --project=chromium
```

Result: `2 passed`, `4 failed` in `1.5m`.

- `admin-ai-ops-drilldown.spec.ts`: its only test failed after navigation moved to the login return URL before the expected `AI 작업` heading appeared.
- `admin-analytics.spec.ts`: the export-denial and public-safe visual tests passed; the overview test failed after navigation moved to the login return URL before the expected `80%` value appeared.
- `admin-audit-ai-ops-drilldown.spec.ts`: both tests timed out waiting for the audit-row button after the same login-return navigation.

All three files therefore reproduce their full-gate failure class at the unchanged authority base. Stage 1 has no diff in these specs, so the admin failures are sealed as pre-existing and out of scope. No admin source or test was modified.

## Validation boundary

- Evidence is repository-local browser/BFF/API/MySQL evidence, not production evidence.
- Only the account fixture, this report, focused account E2E, focused lint/type/whitespace/public-safety checks, and the read-only authority-base admin comparison are in scope.
- Full E2E remains controller-owned and was intentionally not repeated here.

# Task 7 Report: One-Layer Avatar Consumers

## Result

- `AvatarChip` keeps its existing public identity inputs (`avatarKey`, `name`, `label`, `size`) and decorative image semantics, while removing `rsvpStatus` and `data-rsvp-status`.
- Local artwork now adds `.rm-avatar-chip--artwork`; the later design-system modifier removes border, radius, background, and clipping and changes the image to `object-fit: contain`.
- The generic `.rm-avatar-chip` initials contract is unchanged. RSVP and attendance labels remain adjacent to artwork in current-session and member-home consumers.
- Desktop current-session, mobile prep, and member-home attendee callers no longer pass RSVP state into artwork.
- Consumer tests cover current session, archive detail, member-home records, host members, account menu, and public session artwork. Component tests cover all approved sizes, requested fallback, terminal fallback, and picker-owned selection/focus rings.
- Synthetic avatar E2E now models the integrated `PUT /api/me/profile` flow, uses the current 30-key catalog labels, and asserts frame-free same-origin local artwork.

## Verification

- PASS: `./node_modules/.bin/vitest run tests/unit/frontend-boundaries.test.ts tests/unit/current-session.test.tsx tests/unit/member-session-detail-page.test.tsx features/member-home/ui/member-home-records.test.tsx tests/unit/host-members.test.tsx features/auth/ui/account-menu.test.tsx features/public/ui/public-session.test.tsx tests/unit/member-home.test.tsx` from `front/` — 8 files, 132 tests.
- PASS: `./node_modules/.bin/eslint .` from `front/`.
- PASS: `./node_modules/.bin/vite build` from `front/`.
- PASS: design-system `tsc --noEmit -p tsconfig.json`; design-system Vitest with `--configLoader runner` — 7 files, 14 tests.
- PASS: design-docs Vite build and Vitest with `--configLoader runner` — 1 file, 2 tests.
- PASS: Impeccable detector on the changed UI targets — no findings.
- PASS: `git diff --check`.

## Blocked or Partial Evidence

- The requested Corepack CT command could not hydrate workspace packages because registry access failed with `ERR_PNPM_META_FETCH_FAIL` and `ENOTFOUND` for `registry.npmjs.org`.
- Using the existing local Playwright binary built the CT bundle, then failed before tests with `listen EPERM: operation not permitted ::1:3100`; 5 tests did not run.
- The avatar E2E failed before tests because MySQL was unavailable at `127.0.0.1:3306` and Gradle could not open its user-home distribution lock (`Operation not permitted`).
- Full frontend Vitest ran 1,880 tests: 1,878 passed and 2 failed. The architecture failure was caused by the first CT fixture shape and was fixed; the remaining failure is an existing Task 6 stale assertion in `tests/unit/my-page.test.tsx` expecting `이름 변경` while the current product renders `프로필 편집`.

## Residual Risk

Computed-style CT and complete synthetic browser journeys could not execute in this sandbox. The local build, lint, design-system tests, architecture boundary, and all Task 7 named unit consumers passed; runtime visual and network assertions remain to be confirmed in an environment that permits loopback listeners and the E2E service stack.

## Fix Round 1

- Expanded `account-navigation-avatars.spec.ts` to cover the complete Step 6 evidence matrix at both 390px and 1280px: profile editor and saved identity, current-session roster, host attendance, host member list, and public session.
- Added synthetic host member, host session detail, record editor, history, and manual-dispatch fixtures. Host attendance and host member list are now explicit tested surfaces rather than inferred coverage.
- Every matrix surface asserts computed zero-width artwork borders and derives its expected visible avatar paths from the rendered artwork before checking that image requests and responses are same-origin `/assets/avatars/book-club/*.webp` resources only.
- Corrected the retired `이름 변경` assertion in `tests/unit/my-page.test.tsx` to the integrated `프로필 편집` contract.
- PASS: full frontend Vitest — 233 files, 1,880 tests.
- PASS: focused profile and architecture Vitest — 2 files, 9 tests.
- PASS: targeted ESLint and Playwright test discovery (`--list`) — 5 tests discovered in the avatar E2E file.
- The E2E execution attempt remains environment-blocked before test startup: MySQL refused `127.0.0.1:3306`, and Gradle could not open its user-home distribution lock due to sandbox permissions.
- A standalone `tsc --noEmit` was also attempted but is not a clean repository gate in the current integrated branch; it reports numerous pre-existing cross-feature test typing failures. No diagnostic referenced the two files changed in this fix round.

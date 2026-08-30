# Stage 4 Task 9 report — BFF, browser and stage gate verification

## Authority and scope

- Base: `047f561a11db93539264f2ef83d694b790c1eb00`.
- Stage 4 plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- Proposed ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. This task added Stage 4 verification and fixed only failures exposed by the fresh stage gates.
- Final 39-file implementation/test source seal: `fcb4de13e626ab443c7dc0b2e8479d951ca1430f08c20ee51b6eba90d15d2a2e`; individual file hashes are in `task-9-manifest.sha256`.
- The external untracked admin mockup directory remained untouched and unstaged. No external provider, email, OAuth, real club end, deployment, tag or push was invoked.

## Delivered verification and fixes

- Generic BFF proxy tests now lock workbox GET, deferral PUT and DELETE, exact encoded keys/cursors, method/body/query preservation, trusted server header generation, browser trust-header stripping, upstream problem propagation and DELETE 204. The existing generic proxy was already compliant, so the characterization was GREEN and no production BFF route special case was added.
- One serial five-case browser fixture proves authoritative workbox defer/expiry/completion receipts, CURRENT/STALE schedule availability and preview drift, unknown confirmation reconciliation without resend, real local member approval, privacy/cross-club person detail, workbox/person opaque cursor continuation, one-time named-link authority, revisioned settings/history and mocked club-end rejection without a real destructive mutation. UNSEEN selection, partial receipts, co-host retry identity and the 403 authority-loss purge chain are closed by the unchanged focused evidence named below rather than overstated as browser proof.
- Workbox continuation now composes immutable cursor pages through `useQueries`, preserves loaded rows across stale/error recovery and deduplicates exact server keys. The existing operating-room E2E expectation now follows the authoritative schedule-review route.
- The forbidden Task 7 typography token was replaced by the allowed sans contract, and the settings label was aligned with the canonical meeting-language inventory.
- Fresh server gates were closed without suppressions or baseline changes: Stage 4 Kotlin was formatted/refactored to detekt zero, direct session-table reads were restored to the active-session boundary, closing policy was moved to its application model boundary, notification hashing no longer imports across the forbidden boundary, and canonical publication language was restored.
- Test-gate time bombs were made deterministic: person-history observation no longer predates freshly inserted seed rows, Flyway upgrade expectations include V63–V65, and startup migration assertions identify V65.

## TDD and focused closure

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| BFF test `aa0949af...` | `<node24-bin>` + Corepack 0.35.0 / pnpm 11.13.1 focused BFF Vitest | 85/85 GREEN on first characterization run | Generic proxy already preserved the Stage 4 contract; production BFF remained unchanged. |
| Typography CSS `1dc84348...` | Exact typography contract Vitest | RED 2 failures; GREEN 13/13, combined BFF/typography 98/98 | Forbidden `--font-editorial` use removed. |
| Dashboard route `aac0c816...` and test `f8aaa48b...` | Focused host dashboard route Vitest | RED expected cursor 40 but received 20; GREEN 18/18 | Immutable multi-page cursor continuation and loaded-row preservation closed. |
| Stage 4 E2E `d6f35c1c...` | Isolated Chromium Stage 4 spec | GREEN 5/5 | Browser coverage is exactly: workbox defer/expiry/source-owned completion plus local approval/privacy; draft and CURRENT/STALE schedule review, preview drift and unknown no-resend; workbox cursor stale retention; person cursor fingerprint retention; named-link one-time authority, settings/history cursor recovery and rejected club close. UNSEEN, partial receipt and co-host retry identity remain owned by the separately listed Task 7/8 focused evidence. |
| Lifecycle E2E `82f704f2...` | Changed-lane Chromium run, then only the failed lifecycle case | RED on stale responses-query destination; focused GREEN 1/1 | Existing lane now asserts the authoritative schedule-review destination. |
| Final Kotlin/test surface in manifest | detekt/ktlint plus focused unit, architecture and DB integration cases | detekt RED 103 findings to zero; four architecture/language failures to GREEN; person RED 3/5 to GREEN 5/5 | Stage 4 gate regressions closed without baseline changes or new suppressions. |
| Migration/startup tests `7f8ac16a...`, `d9fe6c0a...` | Failed migration/startup cases only | RED 8 stale migration counts plus 2 stale latest-version assertions; GREEN 8/8 and 3/3 focused | V63–V65 upgrade and V65 startup authority are explicit. |

## Full stage gates

All frontend commands below used `PATH=<node24-bin>:$PATH`, Node 24.19.0, `npx --yes corepack@0.35.0` and repository-pinned pnpm 11.13.1.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Final frontend source before server-only gate fixes | `pnpm --dir front lint` | GREEN, 0 errors and 2 unchanged Fast Refresh warnings | Full frontend lint closed. |
| Same frontend source | `pnpm --dir front test` | GREEN, 431 files and 3,852/3,852 tests | Full frontend unit/component contract gate closed. |
| Same frontend source | `pnpm --dir front build` | GREEN | Production frontend build closed. |
| Final changed browser surface | Four changed Chromium lanes on isolated ports/database | Initial 18/19 plus focused closure 1/1; aggregate 19/19 | Stage 4 5/5, manual notification 12/12, schedule-seen 1/1 and lifecycle 1/1 are GREEN. |
| Fixture tree digest `64f65bc915039affaaeb9e973214bb68d29727cbf1282b007d16843d0b19c7f9` | `pnpm --dir front zod:export-fixtures` twice plus fixture diff | Same digest twice; no fixture diff | Double-export determinism closed. |
| Final server source seal | `./scripts/server-ci-check.sh` | GREEN: 1,913 unit tests, 0 failures/errors, 1 skip; 105/105 architecture tests; detekt, ktlint, compile and coverage GREEN | PR-level server gate closed. |
| Final server source seal | `./server/gradlew -p server integrationTest`, completed as non-overlapping package shards after the monolithic worker exhausted heap | GREEN union 1,463/1,463, 0 failures/errors/skips | Every integration-tag package, including both endpoint-backed frontend contract classes, is covered exactly once in the final union. |
| Final repository source | `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate` | Candidate built once; public-release check GREEN | Runtime config and fallback path/content safety checks closed. `gitleaks` was unavailable and is not claimed. |
| Final 39-file surface | `git diff --check`, manifest check and targeted added-line absolute/private/token scan | GREEN | Whitespace and targeted public-repository safety closed. |

## CT classification

- Canonical Docker CT discovered all 100 tests with the repository image, volumes and CI mode, transformed 225 modules, then was forcibly killed before assertions in the approximately 1.9 GiB Docker VM. A safe `workers=1` single-file attempt also transformed its 99 modules and was killed before either of its two assertions. Because the failure occurs below suite granularity, Docker CT is `UNVERIFIED_ENV`; it was not repeatedly rerun and no snapshot was updated.
- The one requested supplemental host run used the same Playwright CT config, pinned Node/Corepack/pnpm and `workers=1`: 93/100 passed. Seven failures were screenshot-only host-versus-Docker rendering differences: three one-pixel height deltas, three approximately one-percent text-pixel deltas, and one narrow admin screenshot with a three-percent/21-pixel layout delta. This is supplemental product evidence, not a replacement for the authoritative Docker renderer, and no baseline was changed.

## Reused and not-measured evidence

- The unchanged admin login-return lane was not rerun. The three spec hashes remain `86ab4ff5...`, `eb84eb9a...` and `83248e10...`, byte-identical to authority base `9285266b`. Its sealed result remains 0 passed / 6 failed because all six reached login return before their admin assertion; this is unchanged out-of-scope residual evidence.
- Provider delivery is `not measured`. No external email/provider request or Google OAuth flow ran. Local signed invitation acceptance remains covered by the focused integration suite.
- A real club end is `not measured` and was not attempted. The browser proof stops at real local preview plus mocked/rejected confirmation evidence.
- Canonical Docker CT remains `UNVERIFIED_ENV` for the constrained Docker runtime described above. Host CT's seven visual mismatches remain non-authoritative residuals.
- `gitleaks` is not installed. The repository fallback scanner passed, but a professional gitleaks scan is not claimed.
- The monolithic integration command exhausted its cumulative test JVM heap and left one orphan worker, which was terminated by exact PID without touching user services or unrelated containers. The final non-overlapping 1,463-test union is the executable server evidence.

## Review round 1 closure — coherent snapshots and exact evidence ownership

The two review findings were closed without reopening the full stage gates:

- Workbox pages now merge only when both `state` and the root page's exact `evaluatedAt` generation match. A missing root renders no retained continuation, while a root-generation change immediately excludes old cursor rows, source availability and `nextCursor`, then resets the cursor chain to its root. A continuation failure that retains data from the same unchanged generation still preserves already loaded rows. Source hashes `fb2157c7...`, `55a95d47...` and `b15c2b9b...`; focused dashboard Vitest was RED 1/19 before the helper existed and GREEN 19/19 after the implementation.
- The final isolated Stage 4 browser run at source hash `21a0dfb...` is GREEN 5/5. The fixture now follows pagination when an expired deferral is authoritatively sorted beyond the first page, so it no longer treats page-one membership as a contract. An initial normal-memory MySQL container was lost under the constrained shared Docker VM; a task-owned low-memory isolated MySQL 8.0 container on separate ports/database produced the final result and was removed afterward. No user port, unrelated container, provider, OAuth flow or real club-end confirmation was touched.

The IMPORTANT coverage claim is split across exact, already sealed owners instead of duplicating those branches in the browser fixture:

| Source hash | Sealed command and result | Exact claim owned |
| --- | --- | --- |
| `front/features/host/route/host-schedule-review-route.test.tsx` `40db27b4...` | Task 7 Node 24 pinned-pnpm focused eight-file Vitest union, GREEN 90/90; hash is unchanged from `task-7-review-1-manifest.sha256` | CURRENT remains disabled; STALE and UNSEEN are selected; the preview carries both exact membership IDs; a durable partial receipt removes the send action and invalidates scoped caches. |
| `front/features/host/ui/settings/host-settings-components.test.tsx` `14ecdb71...` | Task 8 review-1 Node 24 focused component/recovery/dependency union, GREEN 41/41; hash is unchanged from `task-8-review-1-manifest.sha256` | A co-host request carries visible revision 7 and one idempotency key across an indeterminate retry; 403/permission and stale rejections clear it, and the next visible revision uses a fresh key. |
| `front/shared/api/host-authority-event.test.ts` `e4975015...` plus final dashboard test `7cd0c7fb...` | Task 9 full frontend gate GREEN 431 files / 3,852 tests at the unchanged parser hash; review round 2 focused dashboard Vitest GREEN 20/20 | A parsed 403 authority code emits one club-scoped loss event, while the mounted operating room purges that club's conflict draft, unknown state and receipt. This row does not claim redirect behavior. |

Review-only static evidence used Node 24.19.0 and repository-pinned pnpm 11.13.1: exact four-file ESLint completed with 0 errors and 0 warnings. `git diff --check`, the review manifest check and targeted added-line absolute-path/private-domain/token scans were clean. Full lint/test/build, CT, server, integration and public-release gates were deliberately not rerun because their sealed source surfaces were untouched. The four implementation/test files are sealed in `task-9-review-1-manifest.sha256`; the report and manifest exclude themselves.

## Review round 2 closure — missing-root pagination reset and claim precision

- The route-level regression first loaded root plus continuation, then removed root data. RED retained the query batch as `[root, cursor-one]`; GREEN uses render-derived generation state to reset it atomically to `[root]`, removes the continuation row and leaves the same-generation merge behavior from review round 1 unchanged. Final source hashes `522e40d9...` and `7cd0c7fb...`; focused dashboard Vitest: 20/20.
- The Stage 4 browser row now enumerates only the five cases it actually executed. UNSEEN and partial receipt remain assigned to the unchanged Task 7 focused evidence, and co-host revision/idempotency remains assigned to unchanged Task 8 evidence. The authority-loss row is narrowed to the demonstrated 403 event and club-scoped purge; no redirect claim remains.
- Only the route and route test were linted and executed for this review. Exact ESLint, diff, review manifest and targeted public-safety checks were GREEN. E2E and broad stage gates were not rerun because the focused route regression directly exercises the changed state transition and no browser fixture, API or server surface changed. The two-file delta is sealed in `task-9-review-2-manifest.sha256`; the report and manifest exclude themselves.

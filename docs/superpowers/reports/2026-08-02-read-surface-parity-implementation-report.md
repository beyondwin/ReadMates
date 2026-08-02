# Read-surface parity implementation report

Date: 2026-08-02

Branch: `codex/read-surface-parity`

Program base: `5215b845`

Implementation snapshot reviewed for this report: `8fea0e17`

Evidence scope: repository-local frontend tests and isolated local Playwright fixtures

## Outcome

The approved read-surface parity program is implemented through Task 9. Anonymous guests and authenticated viewers now read the home, current-session, notes, archive, and historical-session-detail surfaces through the regular-member presentation contracts. Guest and viewer write controls stay visible in the shared layouts but are disabled and guarded from mutation. Feedback remains unavailable to both read-only audiences, while `GuestMySpace` and explicit account/feedback lock flows keep their contextual conversion action.

The implementation retained separate anonymous guest and authenticated member data lanes. It did not intentionally change Spring API code, Cloudflare Pages Functions BFF code, database schema, Flyway migrations, deployment configuration, or public API DTO contracts.

Task 9's pre-final-review canonical snapshot passed 2,038 frontend unit tests and 131 Playwright E2E tests. The final whole-branch review then identified three Important findings. One fix wave resolved all three in `8fea0e17`, and its scoped re-review was clean. That fix-wave snapshot passed 103 focused tests, 8 frontend-boundary tests, 2,041 full frontend unit tests, lint, build, diff hygiene, and a targeted public-safety scan. Because the fix wave changed runtime code after Task 9's browser and E2E evidence, the controller-owned final-HEAD targeted E2E, full E2E, and browser evidence reruns remain pending at this documentation commit; their earlier results are not presented as final-HEAD proof.

## User-visible behavior

| Audience | Shared read surfaces | Personal/write state | Feedback | Conversion policy |
| --- | --- | --- | --- | --- |
| Anonymous `GUEST` | Regular home, current session, notes, archive, and session-detail renderers | No personal values are fabricated. Regular inputs remain visible with neutral/empty display state, disabled controls, and guarded handlers. | Generic lock only; no metadata or body is read or inferred. | No persistent header or ordinary-page prompt. `GuestMySpace` and an explicitly opened lock retain one contextual action. |
| Authenticated `VIEWER` | Same regular renderers and public section order | Actual returned personal values remain visible in the same disabled controls; direct writes remain denied. | Generic lock only; direct feedback read remains denied. | Existing authenticated navigation remains; no read-only audience upgrade occurs. |
| Active `MEMBER` / `HOST` | Existing regular renderers | Existing writable controls and protected personal state remain available according to current authorization. | Existing capability and availability rules remain. | Existing authenticated account and host behavior remains. |

Desktop and mobile use the same permission meaning. Task 9 browser evidence covered the 1280x900 and 390x844 layouts, notes rail/sheet and filters, archive/detail section order, current-session enabled/disabled differences, reduced-motion transitions, dialog focus/Escape/focus restoration, `GuestMySpace`, and horizontal overflow.

## Architecture and data boundary

- `ReadSurfaceCapabilities` is the audience-neutral control contract: `canWrite`, `canReadFeedback`, and `canViewPersonalState`.
- Feature-owned or shared presentation adapters normalize protected member responses and allowlisted guest responses into renderer-facing read views.
- Guest requests continue through `/api/public/clubs/:slug/browse/**`; protected audiences continue through authenticated member APIs. Guest and member query/cache lanes remain separate.
- Shared renderers consume presentation data, capabilities, and callbacks. Guest composition supplies no mutation actions, and current-session handlers also reject writes when capabilities or actions do not permit them.
- Guest adapters explicitly omit or null protected meeting/location values, account or membership identity, personalized `my*` values, and feedback metadata/body. They do not invent absent values.
- Cross-feature composition stays at app/page boundaries. Task 5 moved the current-session presentation contract to `front/shared/model`; Tasks 6 and 7 use app/page injection and lazy boundaries rather than forbidden feature-to-feature imports.

## Task 1-9 implementation and TDD evidence

| Task | Implemented surface | RED evidence | GREEN, review, and commit evidence |
| --- | --- | --- | --- |
| 1 | Immutable capability constants and member/guest current-session read-view adapters | Capability and adapter tests each failed because their new modules did not exist. | Focused 5/5; full unit 2,013; lint/build/diff passed. Commit `c31e9177`. Review clean. |
| 2 | One desktop/mobile current-session renderer for members and viewers; disabled controls and handler guards | Viewer desktop/mobile tests failed because the regular `참석` control was absent. Review RED later exposed incorrect mobile feedback copy. A deliberate progress mutation proved the saved-value assertion. | Focused sets passed through 48/48; full unit 2,015; lint/build/diff passed. Commits `6fbe82a9`, `487db61c`. Review clean after the mobile feedback and saved-progress fix loop. |
| 3 | Guest current session composed through the regular `CurrentSessionPage`; public loader shape retained and no guest actions supplied | Guest surface test failed because the regular `참석` control was absent; loader test failed because the old mapper did not preserve the required public shape. | Focused 67/67 plus boundary/composition 9/9; full unit 2,017; lint/build/diff passed. Commit `1241d31a`. An early full E2E attempt was unavailable at localhost and was deferred to Task 9. |
| 4 | Guest notes adapted into `NotesFeedPage`, with nullable avatar keys, guest query lanes, URL filter/session state, cursor accumulation, and retry | Adapter function was missing and the regular notes description was absent: 2 failed, 37 passed. | Focused 39/39; full unit 2,017; lint/build/diff passed. Commit `b70edfad`. Playwright startup was blocked by an occupied health port and deferred. |
| 5 | Guest home composed through the regular `MemberHome`, with widget-local errors/retries and protected-value omission | Both new home suites failed because the read-view module did not exist. Review RED caught an invalid guest About path under `/app/about`. | Focused 50/50, route recovery 42/42, guest E2E 9/9; full unit 2,018; lint/build/diff passed. Commits `91d9d637`, `ae423db0`. Review clean after the route fix. |
| 6 | Guest archive adapted into the regular archive page; all tabs retained, personal pages empty, feedback generically locked | Adapter assertions and lock rendering failed: 3 failed, 25 passed. Review RED caught optional capabilities, rejected load-more handling, and eager guest-archive loading. | Initial focused 41/41; fix-wave focused 30/30 and archive/router/boundary 104/104; full unit 2,026; lint/build/diff passed. Commits `20737b90`, `ace48a17`. Review clean. |
| 7 | Shared historical-session-detail renderer with public long reviews, null-guarded protected data, and capability-short-circuited feedback | Missing adapter/query enrichment caused the initial RED; guest composition remained separate; deliberate adapter and renderer metadata reads triggered privacy REDs. | Focused 25/25, expanded regression 71/71, archive regression 105/105; full unit 2,036; lint/build/diff passed. Commits `108d5765`, `66466c88`. Review clean after extracting the shared session-state parser. |
| 8 | Persistent guest account/conversion controls removed from desktop/mobile headers; personal-space and explicit lock behavior retained | Shell/layout RED reported two failures with the guest account control still present. | Focused 32/32, guest feature 65/65, boundary 8/8, scoped browser 2/2; full unit 2,037; lint/build/diff passed. Commit `9331ee08`. Review clean. |
| 9 | Guest/viewer/member E2E parity, denied-write probes, responsive browser evidence, query-bearing notes continuity, fixture repair, and CHANGELOG | Initial targeted run: 12 passed, 3 expected stale-selector failures, 8 not run. A query-bearing notes route then failed 1/1 because classification included query/hash. | Query fix GREEN 1/1; focused model/boundary 26/26; targeted E2E 24/24; browser evidence 3/3; full unit 2,038; full E2E 131/131; lint/build/diff/safety passed. Commit `d2f5087c`. Review clean. |

The Task 1-9 reports and SDD ledger are ignored working evidence. This tracked report summarizes them without adding generated screenshots or private runtime state to the repository.

## Focused, full, E2E, and browser evidence

### Baseline

- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front test`: 251 files, 2,008 tests passed.
- `corepack pnpm --dir front build`: passed, 598 modules transformed.

### Task 9 canonical snapshot at `d2f5087c`

- Targeted guest/viewer/member Playwright: 24/24 passed.
- Anonymous request inventory contained no non-public data request; the tested guest lane used public BFF API requests plus auth status only.
- Viewer direct RSVP write and feedback-document read probes returned `403`.
- Browser evidence lane: 3/3 passed and produced 27 ignored screenshots at 1280x900 and 390x844. Representative images were visually inspected, and no horizontal overflow was found.
- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front test`: 260 files, 2,038 tests passed.
- `corepack pnpm --dir front build`: passed, 605 modules transformed.
- Isolated `corepack pnpm --dir front test:e2e`: 131/131 passed.
- Frontend boundary/model focus: 26/26 passed.
- Diff, public-safety, and UI detector checks were clean.

### Final-review fix-wave snapshot at `8fea0e17`

- Focused cross-surface regression: 12 files, 103/103 passed.
- Frontend boundary test: 8/8 passed.
- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front test`: 262 files, 2,041 tests passed.
- `corepack pnpm --dir front build`: passed.
- `git diff --check`: passed.
- Public-safety scan over the changed tracked files returned no matches.

The fix implementer did not rerun Playwright or browser evidence. Therefore the earlier 24 targeted, 131 full E2E, and 3 browser-evidence results prove the pre-fix Task 9 snapshot, not the final docs HEAD.

## Final whole-branch review and fix wave

The independent whole-branch review reported three Important findings:

1. Protected archive composition did not pass scoped viewer capabilities, so the archive needed to derive capabilities from scoped auth and avoid reading report metadata for viewers.
2. Protected session detail built its public long-review collection from one limited protected notes page. It needed the guest-owned complete public-detail collection without weakening protected location, personal-state, or feedback boundaries.
3. The shared current-session renderer had lost writable one-line-review editors for active members. Desktop and mobile needed the editors restored while guest/viewer controls remained populated, disabled, and handler-guarded.

One fix implementer addressed all three with RED/GREEN evidence in commit `8fea0e17` (`fix(frontend): close read surface parity gaps`). The contract's single scoped re-review found no remaining finding in the fix diff. No server contract or public/protected ownership boundary changed in the wave.

## CHANGELOG and public-repository safety

`CHANGELOG.md` already contains an accurate public-safe `Unreleased / Changed` entry: guests use the same home, session, notes, archive, and record presentation as regular members; inputs are read-only; feedback remains member-only. No CHANGELOG edit was needed during this documentation closeout.

The implementation and report use synthetic fixtures and relative repository paths. No real member data, secret, token-shaped value, private domain, deployment identifier/state, OCID, or tracked local absolute path was added. Task adapters and tests also preserve the guest DTO allowlist and prove forbidden feedback/protected fields are not read in the covered paths.

## Branch and commits

The program began from `5215b845` and produced these commits before this report commit:

1. `6b5573a1` — `docs: approve read surface parity plan`
2. `c31e9177` — `refactor(frontend): define shared read surface contracts`
3. `6fbe82a9` — `feat(frontend): keep viewer session controls read only`
4. `487db61c` — `test(frontend): cover viewer mobile saved progress`
5. `1241d31a` — `feat(frontend): share current session with guests`
6. `b70edfad` — `feat(frontend): share notes feed with guests`
7. `91d9d637` — `feat(frontend): share member home with guests`
8. `ae423db0` — `fix(frontend): route guest home about link`
9. `20737b90` — `feat(frontend): share archive presentation with guests`
10. `ace48a17` — `fix(frontend): harden shared guest archive`
11. `108d5765` — `feat(frontend): share session detail with guests`
12. `66466c88` — `refactor(frontend): share archive session state parser`
13. `9331ee08` — `fix(frontend): remove persistent guest conversion actions`
14. `d2f5087c` — `test(frontend): prove guest member surface parity`
15. `8fea0e17` — `fix(frontend): close read surface parity gaps`

At the implementation snapshot used for this report, the branch was clean and pointed to `8fea0e17`. The documentation closeout commit is intentionally not self-referenced here; its hash must be read from Git after commit creation.

## Pending final gates and residual risk

Controller-owned checks still pending after this docs commit:

- targeted guest/viewer/member E2E at the exact final docs HEAD;
- full frontend E2E at the exact final docs HEAD;
- responsive/reduced-motion browser evidence at the exact final docs HEAD;
- exact final-HEAD canonical frontend lint, unit, build, diff, and public-safety record if the controller requires a single post-doc snapshot.

The controller should append or amend this section if final-HEAD counts differ from the pre-doc evidence above. Until those reruns complete, the branch is implementation-complete with final browser/E2E recertification pending, not fully final-gate certified.

No server CI, Testcontainers integration, BFF smoke, database integration, or Flyway validation was run for this frontend-only program because the branch intentionally changes none of those surfaces. Residual validation risk is limited to production data variety not represented by synthetic fixtures, manual assistive-technology behavior beyond automated keyboard/focus checks, and the final review wave not yet being re-exercised through Playwright at the docs commit.

## Integration boundary

No local `main` merge, push, pull request, tag, release, deploy, production mutation, live provider call, email, notification, or outbox action was performed. The branch remains a local feature branch for controller-owned final verification and later integration under separate authority.

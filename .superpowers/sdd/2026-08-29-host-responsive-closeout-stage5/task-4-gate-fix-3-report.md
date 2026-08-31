# Stage 5 Task 4 gate fix 3 report — lifecycle E2E authority alignment

## Authority and scope

- Base: `4240fa61687588f58f5d70ad6a8e7943ba01dbe5`.
- Fix brief SHA-256: `aa42ad624ded7384f8ca3074c1acc5de7dc13e5b8879f54348093236fbd41874`.
- ADR impact: `none`. The accepted operating-room, records, invitation-fragment and schedule-seen decisions were not reopened.
- The external admin mockup tree remained untouched and unstaged. No provider, real OAuth, real email, production data, deploy, tag, PR or push action ran.

## Failure classification and closure

| Failure cluster | Classification | Closure |
| --- | --- | --- |
| Retired `오늘` heading, dashboard attention queue, old host selector/source and `/members` invitation destination | Stale E2E authority | Assertions now use canonical `/app/host`, current-meeting group, immutable workbox, host workspace switcher, records handoff and `/settings#invitations`. |
| Legacy email-invitation scenarios in dev-login and Google-auth files | Superseded flow, not a product regression | Stage 5 Task 3 made `/invitations` a replace redirect to canonical named-link settings. Both compatibility entries now prove the final fragment destination; named-link creation, one-time redaction and isolated Google acceptance remain active in `google-auth-invite-flow`. Coverage was transferred, not silently skipped. |
| `records=json` and host browser-smoke fixture failures | Fixture drift | Host editor and record-preview fixtures now include club-access and schedule-seen contract fields. The legacy URL canonicalizes once and opens the JSON source. |
| Next-book composer describe-level skip and retired inline meeting ledger | Stale route authority | The skip was removed. Three active tests use the canonical new-meeting workspace, member-visible access scope and notification workbench; Escape, explicit dismiss and exactly-once confirm/retry are proved without delivery. |
| Multi-club email invite returned not found | Real fixture-contract regression | The synthetic token was 31 characters, outside server `InviteTokenFormat`'s 43–128 character email-token contract. A 32-byte base64url token now produces the required 43 characters; scoped preview and acceptance pass. |
| Host shell overflow at 768px | Real responsive production regression | At the tablet boundary the account-actions edge was 809px in a 768px viewport. The account name is hidden while its accessible button label remains, and the 44px trigger uses compact spacing. Final 320/390/768/1280 evidence has no horizontal overflow. |
| Member-reading visual fixture stopped in route loading | Branch-owned fixture isolation gap | The fixture now owns joined-club, club-access and current-session schedule-seen data and enters the scoped canonical current-session URL. Fresh focused Chromium is 2/2 GREEN. |
| Admin base login-return failures | Pre-existing, excluded | Only the desktop/mobile platform-admin host-workspace handoff cases were selected; both pass. |

## TDD and focused evidence

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Base `4240fa61687588f58f5d70ad6a8e7943ba01dbe5` | `<isolated-e2e-env> pnpm --dir front exec playwright test <10 initially failing specs> --project=chromium --reporter=list` | Expected RED: 26 passed, 12 failed, 4 skipped, 25 serial cases did not run. | Reproduced the exact retired-dashboard, selector, redirect, fixture, precision and serial-cascade failures. |
| Final affected sources sealed by the manifest | `<isolated-e2e-env> pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts tests/e2e/dev-login-session-flow.spec.ts tests/e2e/google-auth-invite-flow.spec.ts tests/e2e/host-club-operations.spec.ts tests/e2e/host-next-book-notification-composer.spec.ts tests/e2e/host-session-hardening.spec.ts tests/e2e/multi-club-flow.spec.ts tests/e2e/public-auth-member-host.spec.ts tests/e2e/responsive-navigation-chrome.spec.ts --project=chromium --reporter=list` plus fresh focused continuation for the corrected host-club cases | GREEN closure: all 13 host-club cases passed across source-stable focused runs; the other selected cases passed, with the pre-existing access-scope case still explicitly skipped. | Canonical operating room, lifecycle workspaces, next-book workbench, multi-club switching, OAuth link acceptance, mobile/keyboard and privacy assertions are active. No full 250-test suite ran. |
| Final admin handoff `e9d399c6...` | `<isolated-e2e-env> pnpm --dir front exec playwright test tests/e2e/admin-shell.spec.ts --project=chromium --grep 'platform admin with host membership' --reporter=list` | GREEN: 2/2. | Desktop and mobile admin-to-host handoff reach the empty operating room and immutable workbox without reopening unrelated admin failures. |
| Browser smoke `3b2d52f9...` | `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true pnpm --dir front exec playwright test tests/e2e/host-meeting-workspace-browser-smoke.spec.ts --project=chromium --project=firefox-host --project=webkit-mobile-host --reporter=list` | GREEN: 3/3. Observability proxy warnings were expected because the Vite-only harness has no API process. | Essential host semantics and keyboard path hold across the installed focused browser projects. |
| Record preview `ce7f960d...` | `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true pnpm --dir front exec playwright test tests/e2e/host-session-record-preview.spec.ts --project=chromium --reporter=list` | GREEN: 2/2. | Desktop/mobile record evidence and legacy `records=json` canonicalization pass. |
| Member reading `00057411...` | `<isolated-e2e-env> pnpm --dir front exec playwright test tests/e2e/member-reading-momentum.spec.ts --project=chromium --reporter=list` | GREEN: 2/2 after fresh source-hash fixture correction. | The branch-owned isolated-loader gap is closed without changing product behavior. |
| Responsive production delta `19998740...` | `pnpm --dir front exec vitest run tests/unit/responsive-navigation.test.tsx --reporter=dot` | GREEN: 1 file, 73/73. | Existing global responsive/navigation contracts remain intact after the 768px correction. |
| Final changed TypeScript sources | `pnpm --dir front exec eslint <15 changed TypeScript files>` | GREEN: exit `0`, no output. | Changed frontend test and fixture sources pass static quality. |
| Final scoped delta | `git diff --check` | GREEN: exit `0`, no output. | The production, test and evidence delta has no whitespace errors. |
| Source manifest | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-3-manifest.sha256` | GREEN: 17/17 entries `OK`. | The brief, production correction and all changed test/fixture sources are sealed. |
| Added lines in the scoped delta | Generic local-root, private-domain, key and common token-shape scan | GREEN: 0 matches. | No machine-local path, private domain, private-key marker or common secret-shaped value was added. |

## Boundaries and residual risk

- The focused browser-smoke run is Vite-only and intentionally reports observability proxy connection warnings; its assertions are fully mocked and passed.
- External provider/OAuth, real email delivery, production data, deploy, public-release and the unrelated full admin suite remain not measured.
- No load-bearing branch-owned finding remains open. The full 250-test E2E suite was deliberately not rerun per the gate-fix brief.

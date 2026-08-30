# Stage 2 gate report

## Scope seal

- Stage start: `57bca8ca14e98a98d2edb14e34827c8712f6c8b7`.
- Final implementation HEAD before this evidence seal: `5c65a743fd58c04fa8bb41aaac6c5b6acf325c12`.
- Final implementation tree: `18cade66f3fa2fb485fa9986b8c67962ee9fda59`.
- Plan SHA-256: `606110311e9b639c2e48ded6e92673aa7ac3ace75f857deb0eefaee18435cef0`.
- ADR impact: implements the Stage 2 shell/navigation portion of ADR-0048; ADR-0048 remains `Proposed` until the five-stage program and active architecture agree.
- Repository-local evidence only; no deployment, provider call, production mutation, or real email.

## Source hash to command to result to finding closure

| Sealed source | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Frontend production trees: `front/src` `049bda71...`, `front/shared` `d7b7beeb...`, `front/features` `0f8dbe66...` | Node 24 + pinned pnpm: `pnpm --dir front lint` | Exit `0`; two pre-existing Fast Refresh warnings, no errors. Later changes were one CSS line and test/report corrections with their own focused checks. | Full TypeScript/TSX lint is closed; changed files after the full run have exact focused lint evidence. |
| Same production trees plus unit tests at `5891ae63`; later commit changes only E2E/report | `pnpm --dir front test` | `408` files, `3651` tests passed. | Full frontend unit, architecture, typography, route, authority, and component regression is closed. Initial six contract failures and one status synchronization race were fixed and fresh-reviewed before this final pass. |
| Same production trees at `5891ae63`; later commit changes only E2E/report | `pnpm --dir front build` | `775` modules transformed; production build passed. | Lazy canonical people/records/settings chunks and the host shell bundle compile successfully. |
| Host shell CSS/CT sources sealed in Task 2/3 reports | Playwright CT for host shell, shared shell 767/768 boundary, mobile tabs, and desktop nav with the known base-identical avatar snapshot excluded | Chromium `8/8` passed, including `390×844` and `1440×900`. | 4-area layout, 44px targets, safe area/content reserve, long labels, desktop typography, and combined switcher geometry are closed. The excluded member avatar snapshot is byte-identical at Stage 2 BASE and HEAD and is a non-blocking local antialiasing baseline residual. |
| Responsive E2E SHA-256 `d1196ac2a3f2b4194d81163d4bb43cecb5ae920f5aaf5537fd684aa76bf88a38` | Isolated Node 24 Chromium `responsive-navigation-chrome.spec.ts` | `11/11` passed. | Scoped/unscoped 4-area navigation, combined switcher keyboard/Escape/focus, club/workspace target safety, 767/768 and mobile behavior, record ownership, history, utilities, and reduced motion are closed. |
| Unchanged authority-loss E2E source across the responsive correction | Isolated Chromium `host-authority-loss.spec.ts` in the Stage gate run | `5/5` passed. | In-flight cancellation, host cache/draft purge, cross-club isolation, conflict preservation, and response-loss recovery remain closed. |
| Server main tree `7460fda4...`, server test tree `8dd33301...` | Reuse Stage 1 server CI and full Testcontainers evidence | Server CI passed; integration `1419/0/0/0`. | Stage 2 has no server diff, so the exact server source/test hashes are unchanged and the sealed Stage 1 proof is reused. |
| Final implementation HEAD `5c65a743` | `./scripts/build-public-release-candidate.sh` | Exit `0`; candidate built. | The Stage 2 repository state can be assembled as a public artifact. |
| Same candidate | `./scripts/public-release-check.sh .tmp/public-release-candidate` | Exit `0`; runtime contract OK; gitleaks scanned about 21.41 MB with no leaks. | Public-release safety is closed for Stage 2. |

## Full E2E disposition

The full 239-test E2E lane is not repeated because Stage 1 already proved that three unchanged admin spec files fail at exact authority base `9285266b` (`0/6`). Stage 2 changes none of those files or their admin product sources. The complete changed Stage 2 browser surface is instead measured by responsive `11/11` plus authority-loss `5/5` on isolated ports and a unique synthetic database.

Accordingly the repository-wide E2E lane remains **BLOCKED by the sealed pre-existing authority-base admin failures**; Stage 2 changed-surface E2E is GREEN `16/16`. No overall E2E pass is claimed.

## Stage 2 closure

- Canonical four-area ownership, combined host workspace switcher, desktop/mobile composition, canonical people/records/settings lazy routes, legacy route preservation, authority-loss purge, cross-club isolation, and public safety have direct evidence.
- All task findings and Stage-gate failures have focused commits and fresh scoped approvals.
- Remaining load-bearing Stage 2 claim: one fresh range review of `57bca8ca..HEAD`. Closed task evidence and the authority-base admin residual must not be reopened unless the reviewed Stage 2 diff directly contradicts them.

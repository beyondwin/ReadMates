# Stage 5 gate report — responsive recovery and closeout

## Authority and scope

- Stage start: `9e90834c26496cb4af4b84f4ccda22c10be34fcf`.
- Final gate source before this report: `7bbb4df8345473cddc7e9eb9d3883149dd9d7d8a`.
- Stage 5 plan SHA-256: `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- Repository package manager source: `package.json` SHA-256 `1715ded81813d070d5125001609c6ba2fff43359156ce4af148302d37a06ff76`, pinned `pnpm@11.13.1`.
- ADR impact: `update`. ADR-0048 and ADR-0049 are `Accepted` at this source after their named implementation and evidence gates closed.
- This report consolidates the single Stage 5 full-matrix attempt and its bounded repairs. It does not rerun unchanged evidence.

## Complete validation matrix

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Gate source `2b6cc84e14236f43feec76618f5d6a55dc0317da` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front lint` | GREEN: exit `0`; two unchanged Fast Refresh warnings, zero errors. | Full frontend static gate executed; no branch-owned lint error remained. |
| Account gate fix `a3a24b668f083b2b7bd013c7af374a96f5cd505c` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front test` | GREEN: 431/431 files, 3891/3891 tests. | The stale closed-dialog account-trigger assertion was corrected under focused RED/GREEN; fresh full Vitest passed. |
| Final production/CSS source `66fe6fc25c02e416b30a7dbbfec0af0119514f5c` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front build` | GREEN: production Vite build completed. | The final 768px responsive production correction builds successfully. Later commits are tests, raster evidence or docs only. |
| Zod fixture source at the full frontend gate | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures` then `git diff --exit-code -- front/tests/unit/__fixtures__` | GREEN: exported aggregate SHA-256 `64f65bc915039affaaeb9e973214bb68d29727cbf1282b007d16843d0b19c7f9`; fixture diff empty. | Frontend/server contract fixtures are stable. |
| Server source at the full server gate | `./scripts/server-ci-check.sh` | GREEN: server PR gate, including architecture checks, completed successfully. | Compile, unit/static and one-way hostworkspace architecture contracts passed. |
| Server source plus fixture fix `4240fa61687588f58f5d70ad6a8e7943ba01dbe5` | `./server/gradlew -p server integrationTest` followed, after the host OOM, by an exact disjoint selector union and isolated `HealthControllerTest` | Monolithic worker was killed by the constrained host before a valid assertion total. The disjoint union is GREEN 1465/1465: 660 + 275 + 397 + 45 + 4 + 51 + 33. | The environment failure was not called a pass. Every integration class, including clean/upgrade V61–V65 migration, idempotency, stale revision, parallel seen-upsert, cursor, cleanup-on-role-loss, trusted-BFF and authorization coverage, passed exactly once in the sealed union. The isolated health fixture is order-independent. |
| Full browser source `4240fa61687588f58f5d70ad6a8e7943ba01dbe5` | isolated `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front test:e2e` | Executed 250 cases: 138 passed, 83 failed, 4 skipped and 25 did not run. Failures were classified into stale lifecycle authority, branch-owned fixture/768px defects, missing Firefox/WebKit binaries and the sealed authority-base admin login-return residual. | No overall E2E pass is claimed. Firefox/WebKit were installed; branch-owned clusters were repaired in `66fe6fc2` and focused Chromium/Firefox/WebKit evidence passed. The unrelated admin residual stayed explicitly open. |
| E2E fix `66fe6fc25c02e416b30a7dbbfec0af0119514f5c`; manifest 17/17 | Focused affected Chromium union; admin host handoff; host browser smoke on Chromium/Firefox/WebKit; record preview; member reading; responsive Vitest | GREEN: changed lifecycle selection 21/21 on fresh review; admin host handoff 2/2; overflow representatives 4/4; 767/768 boundary 1/1; browser smoke 3/3; record preview 2/2; member reading 2/2; responsive Vitest 73/73. | Canonical host destinations, named invitation-link creation/redaction/OAuth acceptance, legacy redirects, schedule/access fixtures and 768px overflow are closed without a new skip. |
| CT source `66fe6fc25c02e416b30a7dbbfec0af0119514f5c` | canonical Docker `PATH=<container-node>:$PATH pnpm --dir front test:ct` equivalent, pinned Playwright image and one worker | 121 executed: 118 passed, three screenshot comparisons failed. One was the intentional host CLOSED-768 height change; two were unrelated platform-admin one-pixel renderer deltas. | No overall CT pass is claimed. Host semantics passed before the screenshot assertion; only the reviewed host raster was updated. |
| CT fix `e4117640c65df14c1e9124e4cbc8368110afba5b`; target SHA-256 `b16601d8f3e56acd6eb7e1d66b2b9d699537653fe51f664a18e67440a27c9491` | focused canonical Docker update once, then the same selector without update mode | GREEN: update 1/1 and verify-only 1/1; 24/24 non-target PNGs and all six admin PNGs byte-identical. | The 768x2427 image has no clipping or overlap and retains the recovery bar and final CTA. The unrelated admin one-pixel deltas were not rewritten. |
| Public release scripts `18e630d9...` and `b43eee56...`; final docs source `7bbb4df8345473cddc7e9eb9d3883149dd9d7d8a` | `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate` | GREEN: production runtime config contract OK; public-release check passed. `gitleaks` was unavailable, so the script used and disclosed fallback path/content checks. | The accepted ADR docs and current lifecycle source are safe under the repository public-release gate; a professional gitleaks result is not claimed. |
| Branch source `7bbb4df8345473cddc7e9eb9d3883149dd9d7d8a` | `git diff --check origin/main..HEAD` | GREEN: exit `0`, no output. | The full branch delta has no whitespace errors. |
| Same branch source, excluding evidence reports that quote scanner patterns | Added-line scan over product, tests and docs for machine-local roots, private-key markers and common provider-token shapes | GREEN: zero matches. | No public-repository safety finding exists in the changed product/docs surface. The first meta-scan matched only scanner command text inside evidence reports and was classified, not suppressed as a product pass. |

## Requirement closure

| Load-bearing claim | Sealed result |
| --- | --- |
| Schedule-seen lifecycle | V61 policy/timing/privacy, parallel seen-upsert, role-loss cleanup and unchanged RSVP/attendance passed in the 1465/1465 server union and focused browser fixtures. |
| hostworkspace one-way dependency | Server CI and architecture tests passed; no baseline exception was added. |
| Immutable workbox snapshot | Stage 4 immutable snapshot/source-derived completion and Stage 5 recovery/browser/CT evidence passed without redefining snapshot semantics. |
| OAuth named invitation-link acceptance | Named-link creation, one-time redaction and isolated Google acceptance remain active and green; the retired email-invitation E2E was not retained as false authority. |
| Zod contract | Export completed with digest `64f65bc9...`; checked-in fixtures remained byte-identical. |
| Responsive, recovery and CT | Required widths and 403/409/partial/unknown recovery passed focused unit/browser/CT evidence; the one reviewed host raster is canonical Docker green. |
| Security and public safety | Trusted-BFF/authorization integration coverage passed; full branch diff check and public-release gate passed; gitleaks remains unavailable and unclaimed. |

## Honest residuals

- Authority-base platform-admin login-return E2E remains an unrelated known residual. It is not presented as a host lifecycle pass and was not rerun after its source hashes stayed unchanged.
- Two platform-admin CT screenshots retain unrelated one-pixel renderer deltas. Their six checked-in baselines were byte-identical across the host baseline repair.
- Manual VoiceOver/NVDA and physical-device assistive-technology validation are `not measured`.
- External OAuth/provider behavior, real email delivery, real club-end confirmation, production migration duration and deployment are `not measured` or not executed.
- The monolithic integration command was host-memory constrained; the exact disjoint union is the valid 1465/1465 server evidence.
- `gitleaks` is unavailable; only the repository fallback and targeted scans passed.

No branch-owned Stage 5 load-bearing claim remains open. Stage-range review and the single whole-branch review remain the next authority gates.

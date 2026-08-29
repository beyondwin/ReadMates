# Stage 1 gate report

## Scope seal

- Stage start: `9285266bbc620b7f9c522dd2a469ac02ab467655`.
- Gate HEAD: `1871a7697a352585e7651934c0c24de321de49b5`.
- Gate tree: `0ff6783cfbcf5c5904ab0c0a7a7582f66333d407`.
- ADR impact: `none` for the gate itself. Stage 1 implements the already proposed ADR-0049 boundary; the ADR remains `Proposed` until the full five-stage program and architecture agree.
- Evidence is repository-local only. No deployment, provider call, production mutation, or real email was performed.

## Source hash to command to result to closure ledger

| Sealed source | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Frontend source tree `ebf7ef7afe83237b3c8cf7d0603143e7cae283d7` | Node 24 + repository-pinned pnpm: `pnpm --dir front lint` | Exit `0`; two pre-existing Fast Refresh warnings, no errors. | Stage 1 frontend production lint is closed. The source tree is identical at `0d7e1555` and this gate HEAD, so the sealed result is reused rather than repeated. |
| Same frontend source tree | `pnpm --dir front test` | `402` files and `3596` tests passed. | Full frontend unit/component regression is closed for the unchanged production source surface. |
| Same frontend source tree | `pnpm --dir front build` | `769` modules transformed; production build passed. | Stage 1 frontend compile/bundle gate is closed. |
| Stage 1 generated-contract sources at `0d7e1555` | Zod export and generated fixture drift checks | Exit `0`; no generated drift. | Strict member/host schedule-seen and access contracts remain schema-backed. Later commits do not change these sources. |
| Server production tree `7460fda4f0e6160c8e684321f1566fe4b9c7d4f7` | `./scripts/server-ci-check.sh` | Exit `0`. | Server PR-level compile, unit, lint, and architecture checks are closed. The production tree is identical at `0d7e1555` and this gate HEAD; later server changes are integration-test isolation only and have their own focused lint plus full Testcontainers proof. |
| Server integration-test tree `8dd333013790275355f313aac99b92d4bfaf7698` | `./server/gradlew -p server integrationTest -PtestMaxHeap=4g` | `1419` tests, `0` failures, `0` errors, `0` skipped; build successful. | The full shared-MySQL Testcontainers lane closes migration, schedule revision/seen, lifecycle cleanup, authorization, and suite-isolation risk at `8ccc20f9`. The server test tree is unchanged at this gate HEAD. |
| Schedule-seen E2E source at `fe19a924` | Focused Chromium schedule-seen lifecycle spec | Passed `1/1`. | Proves DRAFT rejection; OPEN/UNSEEN; render acknowledgement to CURRENT; host schedule edit to STALE; rerender to CURRENT; two-club isolation; RSVP, attendance, and coarse access independence. |
| Account E2E fixture SHA-256 `0448762d52ed59a4bd134e2afe5cf2e7fee0d8a5b8b16901d36fb1d2ec4e0c6d` | `pnpm --dir front test:e2e tests/e2e/account-navigation-avatars.spec.ts --project=chromium` | Passed `7/7`. | Closes synthetic BFF drift for the nonblocking club-access receipt and strict schedule-seen fields without production changes. |
| Authority base `9285266b`; three admin spec hashes sealed in `stage1-e2e-synthetic-access-report.md` | Isolated Chromium run of the three failing admin spec files | `0` passed, `6` failed; all reached the login-return page. | All three files fail unchanged at the exact authority base and have no Stage 1 diff. They are classified pre-existing/out-of-scope, not hidden as a Stage 1 pass. |
| Gate HEAD before candidate generation `1871a769` | `./scripts/build-public-release-candidate.sh` | Exit `0`; candidate built. | The public artifact can be assembled from the Stage 1 tree. |
| Same candidate | `./scripts/public-release-check.sh .tmp/public-release-candidate` | Exit `0`; production runtime contract OK; gitleaks scanned about 21.32 MB with no leaks. | Public-release safety is closed for the Stage 1 candidate. |

## Full E2E disposition

The controller started the full `pnpm --dir front test:e2e` lane (`239` tests) once and stopped after repeated early failures instead of spending another full lane on the same cause. Six account-fixture failures were Stage 1 contract drift and are closed by the focused `7/7` proof above. The remaining observed failures were in the three unchanged admin specs; a fresh exact-base run proves every file already fails at `9285266b`.

Therefore the Stage 1 full-E2E gate is **BLOCKED by pre-existing authority-base failures**, while every changed Stage 1 browser surface is GREEN. No overall E2E pass is claimed, and the unchanged admin defect is carried as explicit residual risk rather than expanded into this program.

## Stage 1 closure

- Schedule-seen persistence, exact revision acknowledgement, one-way hostworkspace dependency, strict Zod contracts, lifecycle cleanup, coarse access privacy boundary, full Testcontainers integration, and changed browser journeys have direct evidence.
- Public-release candidate and secret scan pass.
- Remaining load-bearing Stage 1 claim: only the fresh stage-range review from `9285266b` to the final Stage 1 HEAD. Closed task findings and unchanged authority evidence must not be reopened during that review.

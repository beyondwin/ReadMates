# Stage 4 range review fix 1 report

- Base: `002c4a00dd50c70e089aa7b30b8df7bb70500207`
- Scope: the three IMPORTANT findings in `stage4-review-fix-1-brief.md` only
- ADR impact: `none` (implementation aligns existing ADR-0028, ADR-0038, ADR-0048, and ADR-0049 authority)
- External mockups, user ports, delivery/OAuth, real club close, deploy, tag, and push: untouched

## Finding closure ledger

| Finding | Source hash | Command | Result | Closure |
|---|---|---|---|---|
| Unknown confirmation cache reconciliation | `host-schedule-review-route.tsx` = `1f253ea848a6af8d069585d51c31805ec1021cdd1a0f05bd77867bff26da2f3a` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-schedule-review-route.test.tsx features/host/api/host-person-api.test.ts features/host/queries/host-person-queries.test.ts --reporter=verbose` before production change | RED: 7 failed / 24 passed overall; the unknown-confirm test failed with zero invalidations while confirm remained exactly once and the unknown receipt remained visible | The transport-error branch now awaits the same five club-scoped invalidations as a known confirm. It retains the durable unknown receipt, no resend control, and current route. |
| Concurrent idempotent settings commands | `HostClubSettingsService.kt` = `38b35fcc28a72aaed369bde40c4be63723e47c202f13b6b124573d046352c7ce` | `./server/gradlew -p server integrationTest --tests 'com.readmates.club.application.service.HostClubSettingsConcurrencyDbTest' --rerun-tasks` before production change | RED: 2 failed / 0 passed. Real MySQL co-host and club-end callers crossed latch gates immediately before their row locks; the second caller raised conflict instead of replaying. | Settings and co-host commands lock the club before replay lookup; club-end confirm locks the preview before replay lookup. Identical concurrent commands return one receipt/mutation with replay flags `false,true`. Request drift remains `HOST_SETTINGS_IDEMPOTENCY_CONFLICT` without a second history transition. |
| Settings update ordering coverage | `HostClubSettingsService.kt` = `38b35fcc28a72aaed369bde40c4be63723e47c202f13b6b124573d046352c7ce` | `./server/gradlew -p server unitTest --tests 'com.readmates.club.application.service.HostClubSettingsServiceTest.settings update claims the club lock before idempotency replay lookup'` against the pre-fix order | RED: 1 failed / 0 passed; observed replay lookup before lock. | A focused order assertion now seals the separate settings-update path in addition to the real MySQL co-host/club-end proof. |
| Present blank cursor fail-close | `host-person-api.ts` = `767f91f73974aa4e43aeaa92a81d44ef5a6cd84d40c33c2126714ad19c1497e4`; `host-person-queries.ts` = `46f8273de55e433036656e6109aa8c37321f917b8ec61fd671b6166830604b10`; `HostPersonDetailController.kt` = `6dfc6dfb868ed63ff68fb74ad63f9bc89822f0c8d9edeb8d47b02f29bd4e50ee`; `HostWorkboxController.kt` = `738f55cfa0f860c53a3c023f0f8f932863f6e9c9b25cb4267546f9451729564e` | Frontend RED command above plus `./server/gradlew -p server unitTest --tests 'com.readmates.hostworkspace.api.HostWorkboxControllerTest' --tests 'com.readmates.hostworkspace.api.HostPersonDetailControllerTest' --tests 'com.readmates.hostworkspace.adapter.in.web.HostWorkboxCursorCodecTest' --rerun-tasks` before production change | RED: frontend person API/query 6 failures; server controllers 2 failed / 13 passed. Codec blank cases already failed closed and remained green. | Controllers distinguish absent cursor from present blank. Person API and query reject empty/space/tab before fetch or key creation. Nonblank opaque cursor bytes are never trimmed. Existing workbox frontend behavior was not changed. |

## Fresh GREEN evidence

| Surface | Command | Result |
|---|---|---|
| Frontend route/API/query | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-schedule-review-route.test.tsx features/host/api/host-person-api.test.ts features/host/queries/host-person-queries.test.ts` | 3 files, 31/31 passed |
| Server focused unit | `./server/gradlew -p server unitTest --tests 'com.readmates.hostworkspace.api.HostWorkboxControllerTest' --tests 'com.readmates.hostworkspace.api.HostPersonDetailControllerTest' --tests 'com.readmates.hostworkspace.adapter.in.web.HostWorkboxCursorCodecTest' --tests 'com.readmates.club.application.service.HostClubSettingsServiceTest'` | 22/22 passed |
| Real MySQL concurrency | `./server/gradlew -p server integrationTest --tests 'com.readmates.club.application.service.HostClubSettingsConcurrencyDbTest'` | 2/2 passed; latch-gated, bounded futures, no sleep |
| Hostworkspace one-way boundary | `./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest.host workspace composition keeps foreign features behind outbound input-port adapters' --tests 'com.readmates.architecture.ServerArchitectureInventoryTest.host workspace is inventoried without an application feature edge'` | 2/2 passed |
| Exact frontend lint | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint <six changed frontend files>` | exit 0, no findings |
| Kotlin static | `./server/gradlew -p server detekt ktlintMainSourceSetCheck ktlintTestSourceSetCheck --rerun-tasks` | exit 0; baseline-aware detekt and both ktlint source sets passed |
| Whitespace | `git diff --check` | exit 0 |
| Targeted public safety | added-line and new-file `rg` scan for local absolute paths, private-key/cloud identifiers, private domains, and literal password assignments | passed; `gitleaks` is not installed, so no professional secret scan is claimed |

## Residuals and exclusions

- Direct `detektMain detektTest` diagnostics were not used as the gate: those source-set tasks bypass the repository's configured baseline and reported the existing whole-tree 200 main / 128 test inventory. The configured top-level `detekt` task passed fresh.
- The full Stage 4 frontend/server/CT/E2E/integration/public-release gates were intentionally not rerun; the fix brief assigns those to the already-completed Stage gate and requires focused regression only here.
- A first wrapper-form frontend invocation forwarded arguments incorrectly and was discarded. All frontend evidence above comes from exact `pnpm exec vitest run ...` commands.
- `gitleaks` remains unavailable; targeted fallback passed, but this is not equivalent to a professional secret scan.
- No load-bearing finding remains within this fix scope.

## Delta seal

The exact tracked delta is sealed by `stage4-review-fix-1-manifest.sha256`. The manifest excludes itself and the external untracked mockup directory.

# Stage 4 Task 2 report — editable snapshot-bound manual notification

## Authority and boundary

- Base: `e22a4369fa653d5c7df100473b3206d9ab3e3eca`
- Task brief SHA-256: `b5c3129e42e805259c9a56df7ea967021caea3b6d51bf00ac693911c6992fc01`
- ADR impact: `none`; this task implements the already-approved Stage 4 authority without adding a durable decision.
- Migration tail was checked once before editing. `V62` was the tail and `V63` was free, so this task owns `V63__manual_notification_custom_copy_snapshot.sql`.
- Scope stayed inside the manual-notification selection/preview/confirm vertical slice. No workbox source aggregation, invitation-link, settings, person-detail, provider-delivery, or unrelated architecture surface was added.
- The external untracked `design/mockups/2026-08-30-admin-operations-redesign/` tree was not read, modified, or staged.

## Result

Operators can edit subject and body before preview. The server normalizes and validates the exact copy, computes its content hash, and persists an immutable preview snapshot containing schedule revision, target membership IDs/revision/hash, and eligibility fingerprint. Confirm locks that preview, re-reads the live schedule and eligible target set, and returns controlled `409 MANUAL_NOTIFICATION_PREVIEW_STALE` before outbox or dispatch mutation when any bound fact drifts.

Preview remains read-only. Confirm emits the exact frozen preview copy into the existing local outbox/dispatch path; no real email or provider action was executed. Dispatch list/history responses do not expose the custom subject or body. Existing duplicate/resend, idempotency, unknown-outcome, and reconciliation semantics remain keyed by the pre-existing authority.

The frontend mirrors validation, invalidates preview on subject/body/selection/session/template changes, and sends the frozen preview contract only after explicit confirmation. A stale response clears confirm state, refreshes options, and never auto-sends.

## RED evidence

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Brief `b5c3129e42e805259c9a56df7ea967021caea3b6d51bf00ac693911c6992fc01` at base `e22a4369` | `./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest'` | RED at test compilation because `scheduleRevision`, editable copy, content/target hashes, stale/copy errors, and snapshot persistence contract did not exist. This was requested-behavior absence, not setup failure. | Closed by the additive model/service/port/store/web and V63 implementation plus focused GREEN below. |
| Same brief/base | Node 24 + pinned pnpm focused `HostNotificationComposer` test | RED because the `알림 제목` and `알림 본문` controls did not exist. An accidentally broad package-script invocation was stopped and was not used as evidence. | Closed by editable draft/UI/controller/API implementation and the 132-test focused GREEN below. |

## GREEN and safety ledger

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Runtime manifest `e030f7b72c90e1f6f3d3dfefc6072b58b14338b691a7eb28951a3e38a1bce4fd` | `./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest' --tests 'com.readmates.notification.adapter.out.persistence.NotificationDeliveryRowMappersTest'` | GREEN, 21/21 | Copy normalization/validation/hash and exact safe delivery mapping are closed. |
| Same manifest | `./server/gradlew -p server integrationTest --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'` | GREEN, 32/32 | Immutable snapshot persistence, exact outbox copy, stale schedule/target/eligibility rejection, zero mutation, idempotency and reconciliation are closed. |
| Same manifest | `./server/gradlew -p server integrationTest --tests 'com.readmates.notification.api.HostNotificationControllerTest'` | GREEN, 26/26 | Web request/response, validation status, preview no-send, stale 409, and safe error mapping are closed. |
| Same manifest | `./server/gradlew -p server integrationTest --tests 'com.readmates.contract.FrontendZodSchemaContractTest'` | GREEN, 20/20 | Server fixtures and strict frontend Zod schemas agree for options, preview, confirm, and dispatch list. |
| Same manifest | Node 24 + `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run` with the ten Task 2 API/model/query/controller/rail/composer/preview/workbench/Zod/notification files | GREEN, 10 files and 132/132 tests | Editable copy, invalidation, exact preview/confirm contract, stale recovery, strict parsing, and no automatic send are closed. |
| Same manifest | Node 24 + `npx --yes corepack@0.35.0 pnpm --dir front exec eslint` over every changed frontend `.ts`/`.tsx` file | Exit 0; 0 errors, 1 pre-existing `react-refresh/only-export-components` warning at unchanged export line 25 in `meeting-notification-rail.tsx` | No Task 2 lint error remains; the unchanged warning is not a Task 2 regression. |
| Same manifest | `READMATES_API_BASE_URL=http://127.0.0.1:18087 PLAYWRIGHT_PORT=3107 READMATES_E2E_DB_NAME=readmates_e2e_stage4_task2` plus Node 24 + pinned pnpm exact `tests/e2e/manual-notifications.spec.ts --project=chromium` | GREEN, 12/12 in 20.3 s | Local-safe browser proof closes editable exact-copy preview, zero pre-confirm outbox/dispatch, explicit confirm, and exactly one local outbox/dispatch. Provider processing was not invoked. |
| Fixture hashes listed below | Run `zod:export-fixtures`, hash four intended files, rerun exporter, hash again, compare | Both comparisons identical | Fixture generation is deterministic and only the four intended manual-notification fixtures changed. |
| Same manifest | `git diff --check` | Exit 0 | Tracked diff whitespace is clean; cached check is repeated after explicit staging. |
| Same manifest | Targeted private-path/key/token scan over all 42 runtime files | No secret, private path, or token-shaped production/fixture value. Only deliberate negative-test sentinel strings and `m***@example.test` synthetic fixture data matched. | Public-repository safety claim is closed. |
| Same manifest | Listener inspection for task ports `18082-18087` and `3102-3107`; verify PID/cwd before termination | One leftover server on `18082` belonged to this worktree and was stopped; no task-port listener remains. Port `18080` was not inspected for termination or touched. | Isolated runtime cleanup is closed without affecting user services. |

A broad exploratory frontend `tsc --noEmit` was also attempted and reproduced the repository's existing cross-feature typecheck baseline failures. It is not used as Task 2 acceptance evidence and no unrelated surface was changed. Per controller policy, full frontend/server/CT/E2E/public-release lanes remain deferred to the Stage 4 and merged-main gates.

## Per-file SHA-256

The following 42-line manifest covers every runtime, test, migration, exporter, and fixture file in this task. Its own SHA-256 is `e030f7b72c90e1f6f3d3dfefc6072b58b14338b691a7eb28951a3e38a1bce4fd`. The report itself is excluded to avoid a self-referential hash; the brief hash is recorded above.

```text
1324252906a9baac5902982507296cfc86d7e502b3d94e0ee5f7db2b9a3765cf  front/features/host/api/host-api.test.ts
1b76179de472bdb80f04258200315c669fa9f83b82d887ed8317544c340e984e  front/features/host/api/host-api.ts
a1d2da25c47e1ad0953abfd667fbb8250862ef3f01231694b07d68202d838110  front/features/host/api/host-contracts.ts
89a049fb253ea151f5c50c88d9c6a4b45750a6edf5dac1d35b7d825dbfac1783  front/features/host/model/host-notification-composer-model.test.ts
8d507066b60291031add96b7f7500ea13bb597885f2228d8cfec1c285fc1ae16  front/features/host/model/host-notification-composer-model.ts
6e0970b1acf5746c0a8d7141808a26e64c4fd60174efbe1e789947eff8db0a85  front/features/host/model/host-view-types.ts
e30e007701cfde884ed24051b90983a5e46cccef538df2713091cf61f0ef186e  front/features/host/queries/host-notification-queries.hooks.test.tsx
861e8624384926d00e3575e1e50643e975aae93acb3b1d6467f20a52eca595ec  front/features/host/route/host-notification-composer-controller.test.tsx
2e69474cb4d544f67634e00ceb34ebc3c2f05208b557b6e049dbf6f107df1881  front/features/host/route/host-notification-composer-controller.tsx
1acdc7631da9065640da2f53f50ac50fbbeaa78b5c09eefde54a8f94215e2426  front/features/host/ui/meeting-workspace/meeting-notification-rail.test.tsx
33fdaffe3d68ef06e9448af6f624156e602f8ca37f06cf1d3dc3ca76313420b4  front/features/host/ui/meeting-workspace/meeting-notification-rail.tsx
6ce3919b5963037bfc3c94d4c88381043d8ed10a9f0b9bb8d43de78c7c6cd693  front/features/host/ui/notifications/host-notification-composer.test.tsx
93ff0e9017fdc73501a802e955db0ed3da4697330c776c5be976bfabad29865f  front/features/host/ui/notifications/host-notification-composer.tsx
47c4fe8ba33714031eff2e7703919d207eb30698f1f1acc612457f437ea052ef  front/features/host/ui/notifications/manual-notification-preview.test.tsx
c1cb0cb12f21e89a552566b2284e85be7e9f47dfa8fe5462bba8196eb447e239  front/features/host/ui/notifications/manual-notification-workbench.test.tsx
4820d5e2393d27e2539e44c8cabcae2487dc02e7011b2305b9af2a738daf5bd3  front/features/host/ui/notifications/manual-notification-workbench.tsx
d9962c1f373d18f0695f8148054873abe72a703401bc4f3d763aab1c61322ff7  front/scripts/export-zod-fixtures.ts
6c9d089373f988ed4ba3166e03fcc803ba147fd8591314c80bba8bafbd5e7883  front/tests/e2e/manual-notifications.spec.ts
28fac0495d13f69a0ea15487a6775892981e4dfa76b16fe616783063241961f4  front/tests/unit/__fixtures__/zod-schemas/manual-notification-confirm.json
125dc858d9c088ab3ae09b726a0542c1a6637d1864fa33e4c356260659d99d51  front/tests/unit/__fixtures__/zod-schemas/manual-notification-dispatch-list.json
7317b2f9cf807100e0b720c65723527043fb4d50025c2590b135fb46de1ab24d  front/tests/unit/__fixtures__/zod-schemas/manual-notification-options.json
6ea96b3749ea2a9bc729b54d0b72f95554e3f18edb88b5b6942c096b8bdc53fc  front/tests/unit/__fixtures__/zod-schemas/manual-notification-preview.json
6b29345aeeb33f46c7d874b78a279212ccbf3564f1ea195e019ec2393e51e5fb  front/tests/unit/host-contract-zod.test.ts
1f97fc5952aacd629f9f2b7090f913580a1d31fba131608e9fceba32a5fc7417  front/tests/unit/host-notifications.test.tsx
aeba67248819cc328251b4f5ae3b121dfe452c0a29d426eee78a910f34ffbf5b  server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt
05cc3d916eefac1e5f5782bdc0fa6043380271b6d7a10a7424e37632d941844c  server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt
88c237f3ef94be7c3473de061b693e6adf6fc03085c06c6e91c869c24b583bb8  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt
65fd6e07ae645b5a77db02c7192bd75e5cc18b97b5c0e674ae1d65924ee51a81  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationConfirmStore.kt
54819f026812000e2a0831b4a31bfedc639235fa1a8664754b60fc7fd47d0472  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationDispatchReadQueries.kt
d904fe94bf1db038adc66f09e47e778c6d595cd83454bbc171943465e8a95033  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationDispatchRows.kt
d7b7f973a7f5475d903ff20b4b7905e8ca5a9038784554b7a201f19ecd2b3fc4  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationPreviewStore.kt
dfd3816313aeb5129ee8c9165e90fbbfa1bb74835f2b7ad3ba30c7e4e1cb6aa7  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt
94c520987070b8c25a8444238a58266106052693ab517a8d8d42c1858b9bc5fc  server/src/main/kotlin/com/readmates/notification/application/NotificationApplicationException.kt
7105aa0ce87ac1f9e6c7df772ddb71af278ab8bc68d1d42bb24d9a1f719de655  server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt
2e0c255e9d3e7ca7546368a983e76bbdf79aab30af1ca2c60cfc5ce287a0139e  server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt
82c158c190fbefe73af8a1d8e8675ecb1a0dcc28be162306ae4e02de3a1621fd  server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt
80014af1afcff11d5b1b3aecf0e9326a7370e6878854cf10cf9c6935ac85fc23  server/src/main/resources/db/mysql/migration/V63__manual_notification_custom_copy_snapshot.sql
db3e0baa8e5f40e59fb176c996585ac8964a4824c8c726e34f810d9f544bb7cc  server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt
664d32ecc957c54a280bef5e6af752381be6605f2b694fc99058667c08de394c  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt
9d0f998d463e97bafebc08df7507ffdfb8357c36b0b67fbc9e855c572120e3a8  server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappersTest.kt
9a01c40a82862f8f79fa816d61fa2be0495e682c595cc148a37268ba5bcbcbd3  server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt
778ed55061986939b813405ae9055987744f449db3a9e935f961e362b60406b5  server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt
```

## Finding closure

| Load-bearing finding | Closure |
| --- | --- |
| Editable copy could drift between preview and confirm | Exact normalized subject/body and content hash are stored in the locked preview; confirm emits that snapshot. |
| Schedule or audience eligibility could drift after preview | Schedule revision, target IDs/revision/hash, and eligibility fingerprint are revalidated under confirm locks; stale returns 409 before mutation. |
| Preview or UI state could accidentally send | Preview is read-only in service, persistence, controller, frontend tests, and local-safe E2E; confirm is explicit. |
| Copy could leak through list/history | Existing dispatch list/history DTOs and reads remain copy-free; custom copy is returned only by preview and consumed through the internal outbox payload. |
| Contract drift could be accepted silently | Strict Zod parsers, four deterministic fixtures, frontend tests, and server fixture contract tests cover all changed endpoints. |
| Provider action could escape focused verification | E2E stops after local outbox/dispatch evidence and never processes provider delivery. |

No load-bearing Task 2 finding remains open.

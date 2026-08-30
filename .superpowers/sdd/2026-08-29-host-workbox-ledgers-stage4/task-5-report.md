# Stage 4 Task 5 report — aggregate immutable host workbox API

## Authority and scope

- Base: `ac0ba798d5e59063559fae08384b11e344fe4deb`.
- Plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- Task brief SHA-256: `c674e3eb8e55afe96d1d61142912780bec18daddcfb9daf0795ee6d8c62bc4bd`.
- ADR impact: `none`.
- Migration tail remains V65. Task 5 changes no migration and all six architecture baseline/exception ledgers remain byte-identical.
- The external `design/mockups/2026-08-30-admin-operations-redesign/` tree remained untouched and unstaged.

## Delivered contract

- Five source owners expose typed `AVAILABLE` or exact source-unavailable results in fixed order: `SCHEDULE_UNSEEN -> MEMBER_APPROVAL -> RECORD_CLOSING -> INVITATION_EXPIRY -> NOTIFICATION_FAILURE`. Hostworkspace depends only on their input ports through outbound translators; it imports no foreign persistence adapter.
- A first page captures one `evaluatedAt`, evaluates all sources once inside a read-only `REPEATABLE_READ` transaction, derives NOW/DEFERRED/COMPLETED with inclusive 30-day retention, sorts by priority/due/type/resource/generation, and persists one immutable schema-v1 V62 snapshot with a 15-minute expiry. Expected unavailability is snapshot data; unexpected exceptions abort before snapshot persistence.
- Continuations use only the owned immutable snapshot. The signed cursor binds purpose, club, host membership, state/filter, snapshot/schema, evaluated/expiry, ordinal/sort tuple and key version; tampering, cross-scope reuse, retirement and expiry return controlled restart responses.
- PUT/DELETE deferrals require an ACTIVE HOST, exact current authoritative key, current club/host ownership and a future timestamp. Existing snapshots remain unchanged while a new first page observes the mutation; expired deferrals return to NOW.
- Invitation expiry uses the captured `evaluatedAt`, projects an audited prior revision for extension/stop, and treats an actually expired active revision as completed. Actual MySQL evidence proves revision 4 mutation produces completed revision 3 without link name/token disclosure.
- Response items use only `key,type,state,title,description,count,dueAt,deferredUntil,resolvedAt,destinationHref,receiptSummary`. Destinations are app-relative; source rows and snapshot JSON contain no email, user ID, token, provider body or page history.
- Exact PUT/DELETE workbox-deferral paths alone bypass Spring CSRF. BFF secret, allowed origin, forged role, active-host loss and cross-club denial remain fail closed.

## TDD closure

| Cluster | RED | GREEN / closure |
|---|---|---|
| Five source owners | Missing source input/output/service symbols in fixed-order tests | 10/10 source service tests; exact identity/generation, NOW/completed/due/receipt and five typed unavailable codes |
| Aggregate/snapshot | Missing aggregate ports/service and transaction behavior | 6/6 service tests; fixed call order, one read-only REPEATABLE_READ transaction, 15-minute immutable snapshot, zero-as-data, 30-day retention, partial failure, abort-no-snapshot, authoritative deferral and concurrent snapshot stability |
| Translators | Missing hostworkspace outbound source adapters | 2/2 translator tests; stable keys, priorities, relative destinations, receipt allowlists and typed availability |
| Cursor | Missing purpose-bound cursor codec | 3/3 cursor tests; current/previous key, tamper/cross-owner/cross-state/expiry/retired-key restart |
| Controller | Missing exact endpoints and controlled error mapping | 3/3 controller tests; page allowlist, continuation, validation, encoded authoritative key and PUT/DELETE receipts |
| BFF/JDBC/security | Exact mutations were initially blocked by CSRF (2 of 4 failed with 403); actual invitation revision integration was then added | 6/6 BFF integration tests plus 3/3 V62 persistence tests; exact CSRF exception, trust boundary, five JDBC sources, immutable/owned/ordered snapshot, bounded cleanup and audited old revision |
| Fixtures/contracts | Both workbox fixtures were absent (0/2) | 2/2 focused server fixture contracts; page and deferral receipt recursive shapes agree |
| Invitation time/revision | Query lacked captured `evaluatedAt`; far-away prior revisions were incorrectly eligible (1/2) | 2/2 invitation source tests; one time anchor and only previously actionable audited revisions complete |

## Sealed evidence

| Source hash / surface | Command | Result | Finding closure |
|---|---|---|---|
| Task 5 Kotlin source/test surface | `./server/gradlew -p server unitTest --tests <nine Task-5 classes>` | GREEN, 24/24 | source semantics, fixed order/transaction, aggregate, snapshot, cursor, controller and translators closed |
| V62/JDBC/BFF/contracts | `./server/gradlew -p server integrationTest --tests '*JdbcHostWorkboxAdapterTest' --tests '*HostWorkboxBffSecurityTest' --tests '*FrontendFixtureContractTest*host workbox*' --tests '*FrontendZodSchemaContractTest*host workbox*'` | GREEN, 11/11: persistence 3, BFF/source integration 6, contracts 2 | ownership, immutability, cleanup, actual source SQL, invitation old revision, security and JSON contracts closed |
| One-way composition | `./server/gradlew -p server architectureTest --tests '*host workspace composition keeps foreign features behind outbound input-port adapters*' --tests '*host workspace is inventoried without an application feature edge*'` | GREEN, 2/2 | foreign features remain behind hostworkspace outbound input-port adapters; no application feature edge |
| Task 5 static surface | repository ktlint formatter/check followed by `./server/gradlew -p server detekt` report filtered to Task-5 files | Task 5 ktlint GREEN; detekt findings 23 -> 0 | formatting, magic numbers, cursor complexity and service function/throw debt closed without baseline edits |
| Deterministic fixtures | Node 24 `npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures`, hash two fixtures, repeat twice and `diff -u` | identical hashes across both repeat exports | deterministic contract artifacts closed |
| Architecture and migration anchors | `git diff <base> -- server/config/architecture server/src/main/resources/db/mysql/migration` and migration-tail scan | empty diff; V65 | no architecture exception or V66 was introduced |
| Public/privacy safety | targeted new-production scan for private paths, private keys, provider keys, absolute URLs, email/user/token/provider-body/page-history identifiers | no matches | public-repository and snapshot privacy surface closed |
| Patch hygiene | `git diff --check` | clean | whitespace closed |

## Fixture seals

- `host-workbox-page.json`: `4832375c953dc4aa35c5bb9a8b0deb7281d0e5e3e622d11921a83b3cfbdc42c1`.
- `host-workbox-deferral-receipt.json`: `3bc77233e1457a7da026d8f6336c5bc9e853a6141e454923e9226cbf151fdcc8`.

The per-file implementation manifest is sealed in `task-5-manifest.sha256`; it intentionally excludes itself and this report to avoid recursive hashes. Manifest SHA-256: `501e1f29a0359557bc56c90aa29c74c571a1d2c398c4668241a89afba9f9ac51`.

## Explicitly skipped

- Full server CI/Testcontainers suite, frontend lint/test/build, CT, E2E, public-release, full Stage 4 gates and Task 6+ were not run; those belong to stage closeout or later tasks.
- Whole-server detekt remains a skipped gate because it reports pre-existing Task 2/4 findings outside Task 5. The focused report contains zero Task 5 findings after cleanup. Whole-class architecture execution similarly retains the pre-existing `ManualNotificationAudienceQueries.kt -> Sha256` allowlist failure; both Task-5-specific architecture tests pass.
- No live OAuth, email/provider call, deployment, push, PR or tag was performed.

## Review round 1 — source-authority closure

- Review base: `59b9af7c4421c6cf823d08da89cbdde959570db0`.
- Scope stayed within the three reviewed source owners and their source-local approval/closing authority. Aggregate, snapshot, cursor, controller, security, frontend, migrations, architecture ledgers and Task 6+ were unchanged.

| Finding | RED evidence | Closure |
|---|---|---|
| `SCHEDULE_UNSEEN` admitted unavailable drafts | Real MySQL source test returned three `DRAFT` sessions that fail the authoritative host-session availability predicate | The source now applies the same `OPEN`, or `DRAFT + GUEST_READABLE + participant_set_revision > 0 + meeting >= evaluatedAt in Asia/Seoul`, predicate and still requires an ACTIVE participant. Unavailable sessions expose no work item or deferral key. |
| `MEMBER_APPROVAL` inferred completion from mutable membership state | Repository inspection found immutable `VIEWER_ACTIVATED` receipts, but no rejection audit/receipt anywhere in the schema or rejection transaction | The existing append-only auth mutation receipt is now written as `VIEWER_REJECTED` inside the approval transaction. The source selects the first immutable activation/rejection transition and its time; later membership status, joined-at or updated-at mutations cannot shift or relabel `APPROVED/ACTIVE` or `REJECTED/INACTIVE`. No migration or mutable fallback was introduced. |
| `RECORD_CLOSING` treated every closed session as actionable and mutable publication state as completion | Real MySQL source test admitted `READY/NONE` and failed the same-generation publish transition | `SessionClosingStatusService` and the work source now share one closing-decision function. NOW contains only `CLOSE_SESSION`, `IMPORT_RECORDS`, `SEND_NOTIFICATION` or `PUBLISH_RECORDS`; `READY/NONE` is absent. Completion comes only from immutable `SESSION_PUBLISH` mutation receipts. The receipt's canonical resulting vector is converted to the pre-publish vector by reversing the publish transaction's single session-revision increment, so actionable and completed keys match. |

### Fresh focused evidence

| Source hash / command | Result | Finding closure |
|---|---|---|
| Review-round source hashes in `task-5-review-1-manifest.sha256` | 12/12 files verified | Exact changed authority surface sealed; report and manifest exclude themselves from recursive hashing. |
| `./server/gradlew -p server unitTest --tests '*HostScheduleSeenWorkSourceServiceTest' --tests '*MemberApprovalServiceTest' --tests '*HostMemberApprovalWorkSourceServiceTest' --tests '*HostRecordClosingWorkSourceServiceTest' --tests '*SessionClosingStatusServiceTest'` | GREEN, 13/13: 2 + 2 + 2 + 2 + 5 | Schedule projection, rejection receipt transaction, immutable member result mapping, BLOCKED/action filtering and the complete canonical closing policy are closed. |
| `./server/gradlew -p server integrationTest --tests '*JdbcHostWorkSourceAuthorityTest'` | GREEN, 3/3 against MySQL | DRAFT available/unavailable evaluation and no key leakage; approval/rejection immutability under later lifecycle updates; IMPORT/SEND/PUBLISH/NONE plus same-generation publish completion are closed. |
| `./server/gradlew -p server ktlintMainSourceSetCheck ktlintTestSourceSetCheck detekt`, reports filtered to the 12 manifest files | Focused findings 0 | Whole tasks remain non-green only for pre-existing findings outside the review diff. |
| `git diff --check` plus targeted production privacy scan | clean / no matches | Patch hygiene and public-repository privacy closed. |

Review-round manifest SHA-256: `d0a0843dda1938e3f0852ab7b64418d7c74778d79d001bec2233cfbcf8b5907f`.

### Review-round skipped evidence

- Aggregate, snapshot, cursor, controller, security/BFF, frontend/contracts, full server CI/Testcontainers, CT/E2E, public-release and Stage 4 gates were not rerun because this round did not touch those sealed surfaces.
- No V66 migration, architecture baseline/exception change, deployment, provider call, push, PR or tag was performed.

## Review round 2 — completed publish receipt deduplication

- Review base: `70a3b32535f278dd4423bf4086b131692933eb30`.
- Scope is exactly the RECORD completed-receipt query and its real MySQL regression. Schedule, member, aggregate, snapshot implementation, cursor, controller, security, frontend, migrations and architecture ledgers are unchanged.
- Receipt authority inspection found no explicit changed/outcome field in `host_session_mutation_receipts`: every newly claimed idempotency key records a receipt even when lifecycle publication is already `PUBLISHED` and unchanged.

| Finding | RED evidence | Closure |
|---|---|---|
| A real `CLOSED -> PUBLISHED` call followed by `PUBLISHED -> PUBLISHED` with a different idempotency key created two `SESSION_PUBLISH` receipts and two identical completed work items | Focused MySQL test observed two receipts with one canonical resulting vector and failed `Expected size: 1 but was: 2` before snapshot construction | The completed query ranks receipts by the complete canonical resulting vector and selects the deterministic earliest `created_at,id` receipt. Distinct publication generations remain distinct; no-op duplicates of one generation collapse to one item. The retained item keeps the actual transition receipt ID, original `resolvedAt` and the pre-publish generation. A COMPLETED workbox snapshot then constructs with unique keys. |

### Fresh focused evidence

| Source hash / command | Result | Finding closure |
|---|---|---|
| Review-round source hashes in `task-5-review-2-manifest.sha256` | 2/2 files verified | Exact RECORD query and JDBC regression surface sealed. |
| `./server/gradlew -p server unitTest --tests '*HostRecordClosingWorkSourceServiceTest'` | GREEN, 2/2 | Existing record action/completion filtering remains intact. |
| `./server/gradlew -p server integrationTest --tests '*JdbcHostWorkSourceAuthorityTest.record completion deduplicates*'` | GREEN, 1/1 against MySQL | Two real lifecycle calls produce two receipts; source returns one earliest receipt, stable key/time, and COMPLETED snapshot construction succeeds. |
| Repository ktlint/detekt reports filtered to the two manifest files | Focused findings 0 | Round 2 formatting and static analysis closed; whole tasks retain only pre-existing findings outside this diff. |
| `git diff --cached --check`, targeted production privacy scan and forbidden-surface diff | clean / no matches / empty | Patch hygiene, public-repository safety and bounded scope closed. |

Review-round 2 manifest SHA-256: `e139ea58876874f0b58f720636bae911fc2cca426189803916f18128c41ee327`.

### Review-round 2 skipped evidence

- Schedule/member source tests and aggregate/cursor/controller/security/BFF/frontend/contracts were not rerun because their source hashes and behavior surfaces are unchanged.
- Full server CI/Testcontainers suite, CT/E2E, public-release and Stage 4 gates remain deferred to stage closeout. No migration, deployment, provider call, push, PR or tag was performed.

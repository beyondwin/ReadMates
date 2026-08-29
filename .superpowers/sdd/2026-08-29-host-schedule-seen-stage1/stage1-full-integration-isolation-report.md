# Stage 1 full-integration isolation correction report

## Status and scope

- Base: `0d7e15559c2094c889bccddf4cc51ffa230f2cb0` on `codex/host-lifecycle-operating-room`.
- ADR impact: `none` — this correction changes only integration-test fixture isolation and V61 expectations. It adds no product, persistence, security, or architecture decision.
- Changed surface: five integration-test files and this report. No production source or migration changed.
- Evidence is local repository and Testcontainers MySQL evidence. No deployment, provider call, private data access, or production mutation was performed.

## RED and root causes

The controller-owned Stage 1 gate command `./server/gradlew -p server integrationTest -PtestMaxHeap=4g` supplied the initial RED: 21 failures across the six reported victim classes. The correction did not rerun that full lane.

A smaller polluter-to-victim RED identified the public seed leak:

```text
./server/gradlew -p server integrationTest -PtestMaxHeap=4g \
  --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest' \
  --tests 'com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapterTest'
```

Result: 34 tests ran and `JdbcPublicQueryAdapterTest.publicStats issues exactly one consolidated queryForObject call` failed because the six-session public baseline had fallen to five. `JdbcManualNotificationDispatchAdapterTest` restored only `sessions.state`; it did not restore the complete public audience tuple or a readable current projection for the two seed sessions it mutates.

The remaining XML failures mapped to these fixture defects:

- `AdminCommandIdempotencyConcurrencyTest` cleaned its own administrator fixture but assertion helpers queried global claim, alias, and key-state rows, so 29 rows from earlier classes contaminated counts and single-row reads.
- `AdminCommandDigestKeyRetirementConcurrencyTest` exercises intentionally global maintenance, but its method boundary removed only fixture-owned rows. The purge and assertions therefore observed unrelated expired commands.
- `AdminCommandDigestKeyStartupIntegrationTest` expected latest migration `60` after V61 and started validation contexts against a shared database containing unrelated global aliases or pending host-invitation references.
- `JdbcMutationIdempotencyAdapterDbTest` inserted an emergency-takedown receipt using columns removed by the current V55 schema instead of creating the current immutable receipt plus its completed idempotency reference.

## Source hash to command to closure ledger

| Closing source SHA-256 | Command and result | Finding closure |
| --- | --- | --- |
| `0807cac1089bc4c27fcb2ecffb870e05068c7d4b9e0df7afd3945a3013d38ca6` — `JdbcManualNotificationDispatchAdapterTest.kt` | Focused seven-class GREEN below passed. | Cleanup restores `PUBLISHED` + `PUBLIC` + `GUEST_READABLE` for seed sessions 301 and 302 and restores readable projections only when they are not emergency denied. Both public victim classes remain unchanged and pass after the real polluter.
| `cb01da6ae939e92ccd6f5f399fd25b0e2f26f5576170742d8aa03f267734a89f` — `AdminCommandIdempotencyConcurrencyTest.kt` | Focused seven-class GREEN below passed. | Claim, alias, receipt, expiry, canonical scope, and key-state assertions now select only administrator `5701` and digest versions `5701..5703`; unrelated valid rows cannot satisfy or break the test.
| `1c4ab52ced6fe2472fc0cdb5e2dbf40225e9c75b9618d63b2ee39025808b2341` — `AdminCommandDigestKeyRetirementConcurrencyTest.kt` | Focused seven-class GREEN below passed. | Each global-maintenance method begins and ends with empty global command claim, alias, and key-state tables, matching the global production purge boundary while preserving all receipt-retention and lock-order assertions.
| `0e0cbaaf8fbabd95f66c61b496ceecf81960d4fd4daac7a84b23671c72f6e518` — `AdminCommandDigestKeyStartupIntegrationTest.kt` | Focused seven-class GREEN below passed. | Startup methods clear global command aliases/key state and pending invitation references, then create only the reference under test. Fresh-deployment and query-failure assertions now require migration `61`.
| `5a7ebf01c4c4d3e77cdfc970a6f24b9ed814f7b861fb04885d331b7a1b154eac` — `JdbcMutationIdempotencyAdapterDbTest.kt` | Focused seven-class GREEN below passed. | The fixture now inserts the current V55 immutable receipt and a completed `admin_public_takedown_idempotency` row carrying the digest-key reference. Retirement and startup remain fail closed without reviving obsolete columns.

The final focused GREEN command was:

```text
./server/gradlew -p server integrationTest -PtestMaxHeap=4g \
  --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest' \
  --tests 'com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapterTest' \
  --tests 'com.readmates.publication.api.PublicControllerDbTest' \
  --tests 'com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandIdempotencyConcurrencyTest' \
  --tests 'com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandDigestKeyRetirementConcurrencyTest' \
  --tests 'com.readmates.shared.adminmutation.config.AdminCommandDigestKeyStartupIntegrationTest' \
  --tests 'com.readmates.shared.mutation.adapter.out.persistence.JdbcMutationIdempotencyAdapterDbTest'
```

Result: `BUILD SUCCESSFUL`; XML totals were 92 tests, 0 failures, 0 errors.

## Quality and residual gate ownership

- `./server/gradlew -p server ktlintTestSourceSetCheck detekt` passed.
- `git diff --check` passed with no output.
- No assertion, production authorization rule, public visibility predicate, digest-retirement policy, or migration was weakened.
- The controller owns the single fresh `./server/gradlew -p server integrationTest -PtestMaxHeap=4g` rerun at the Stage 1 gate. It is intentionally not claimed here.
- Public-repo safety: changed files add no real member data, secret, deployment state, private domain, local absolute path, or token-shaped example.

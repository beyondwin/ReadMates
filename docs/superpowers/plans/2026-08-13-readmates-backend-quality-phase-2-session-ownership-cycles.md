# ReadMates Backend Quality Phase 2 — Session Ownership And Cycle Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Keep the ledger, task briefs, review packages, mutation evidence, and final execution report in the ignored workspace returned by that skill's `scripts/sdd-workspace`; none of those SDD artifacts is a tracked deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the four remaining server boundary-import identities and the two remaining reverse session-family application edges, leaving zero current boundary debt and zero feature cycles without changing session, import, record, closing, notification, persistence, or public API behavior.

**Architecture:** Each inbound adapter owns its HTTP parsing and maps application-owned failures. Session-record ordering and visibility live with session-record application models. Snapshot serialization is a session-record output port with a Jackson outbound implementation. Session record apply calls a session-record-owned replacement port implemented by session import, preserving the approved forward `sessionimport -> sessionrecord` direction and the existing outer apply transaction. Session consumes record-owned visibility while session-record history owns its cursor failure, preserving `session -> sessionrecord` and removing the reverse edge.

**Tech Stack:** Kotlin 2.4, Java 25, Spring Boot 4, Spring MVC, JDBC, MySQL/Testcontainers, Jackson, JUnit 5, AssertJ, ArchUnit 1.3.2, Gradle 9.6.1, and repository public-release checks.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md`.
- Execute from branch `codex/backend-quality-hardening-phase-0-2` at exact clean plan base `4fa0b6b99bc82f4beec26db477a083a13b461835` or a descendant containing only this tracked plan commit. Record the actual implementation base before Task 1.
- Scope is exactly the session-family ownership and cycle-removal slice. Retire these four current boundary identities verbatim:

  ```text
  com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt|com.readmates.session.adapter.in.web.parseHostSessionId
  com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt|com.readmates.sessionimport.application.service.InvalidSessionImportException
  com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt|com.readmates.sessionrecord.application.service.typeSort
  com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt|com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodec
  ```

- Retire exactly `sessionrecord|sessionimport`, `sessionrecord|session`, and the ownership-derived `aigen|session` edge. Preserve current `sessionimport|sessionrecord` and `session|sessionrecord`. Do not retire or invent a fourth feature edge.
- Initial architecture partitions are `4 current + 35 retired = 39 approved` boundary identities and `40 current + 1 retired = 41 approved` feature identities. Final partitions must be `0 + 39 = 39` and `37 + 4 = 41`, with `cyclicFeatureComponents(actual) == emptySet()`.
- Preserve every REST route, request/response JSON field and enum spelling, status, public error code/message, cursor key and sort tuple, draft/live revision and replay rule, notification composer choice and dedupe independence, transaction boundary and rollback behavior, snapshot JSON/schema/hash, author attribution, normalized import content, cache invalidation timing, import preview/commit behavior, and exposure compatibility mapping.
- Do not change frontend/BFF source, migrations, schema, SQL meaning, deploy files, auth/actor behavior, notification delivery, or public/guest access policy. No live provider, email, production data, deployment, tag, push, or PR action is authorized.
- Use application-owned models, failures, and consumer-owned ports. Do not move session-family values into `shared`, inject concrete services across features, or create an adapter-to-adapter dependency.
- Keep `SessionRecordApplyService.apply` as the outer `@Transactional` boundary. The sessionimport implementation of the record-owned replacement port joins that transaction; baseline, live replacement, applied revision, receipt, and draft deletion remain one atomic unit. Cache invalidation remains after-commit.
- `SessionRecordSnapshotCodec` is an output port because application services need encode/decode behavior but do not own Jackson. Its implementation must preserve byte-for-byte deterministic JSON for a given snapshot, schema `readmates-session-record:v1`, SHA-256 of the exact JSON, and rejection of missing/unknown schema.
- `HostSessionHistoryType.typeSort` is the sole application ordering policy: `BASIC_INFO_UPDATED=10`, `ATTENDANCE_UPDATED=20`, `RECORD_REVISION_APPLIED=30`, `RECORD_REVISION_RESTORED=40`, `NOTIFICATION_SENT=50`, `NOTIFICATION_SKIPPED=60`. SQL literals and cursor keys remain unchanged.
- `SessionRecordVisibility` remains exactly `HOST_ONLY`, `MEMBER`, `PUBLIC`. Move it to sessionrecord ownership; do not redesign `SessionExposure`, compatibility conversion, access scope, site visibility, or publication dual-write.
- Session-record history uses a record-owned `InvalidHostSessionHistoryCursorException`; ordinary host-session listing keeps session-owned `InvalidHostSessionCursorException`. Both retain HTTP 400, code `INVALID_CURSOR`, and message `커서가 현재 검색 조건과 일치하지 않습니다.`.
- For each retirement, add behavior and load-bearing architecture/source detectors first; then remove the source dependency; then remove the exact current row and append the identical row to the retired ledger in the same commit. Never increase an approved seed, remove a tombstone, substitute an identity, weaken a scanner, or broaden an exception.
- Run Gradle, Testcontainers, Playwright, and public-candidate commands sequentially. No overlapping heavy process in the shared worktree.
- Each task has an exact tracked-file allowlist. Before commit, compare `git diff --cached --name-only` with the task allowlist, obtain a fresh independent review, fix findings through the originating task, and use the exact commit subject below. A correction uses only that task's allowlist plus its review report in the ignored workspace.
- No new ktlint/Detekt suppression, baseline identity, configuration exception, migration, or schema change is authorized. If implementation unexpectedly requires one, stop and return to planning.
- Large-class decomposition, including splitting `JdbcSessionRecordAdapter`, `JdbcSessionImportWriteAdapter`, or `SessionImportService`, and final Phase 2 program closeout are explicitly outside this plan. This slice nevertheless must finish boundary debt and feature cycles at zero.
- Keep tracked and ignored artifacts public-safe: no local absolute paths, secrets, private domains, real member data, cookies, tokens, provider payloads, or deployment identifiers.

## Debt Ledger And Cycle Target

| Point | Boundary current | Boundary retired | Feature current | Feature retired | Cyclic components |
| --- | ---: | ---: | ---: | ---: | --- |
| Start | 4 | 35 | 40 | 1 | `session,sessionimport,sessionrecord` |
| After Task 1 | 2 | 37 | 40 | 1 | unchanged |
| After Task 2 | 1 | 38 | 40 | 1 | unchanged |
| After Task 3 | 0 | 39 | 40 | 1 | unchanged |
| After Task 4 | 0 | 39 | 39 | 2 | `session,sessionrecord` |
| After Task 5 | 0 | 39 | 38 | 3 | none |

The only new feature tombstones are `sessionrecord|sessionimport` in Task 4 plus `sessionrecord|session` and `aigen|session` in Task 5. The `aigen|session` edge exists at the Task 5 base only because the three AI production consumers import the session-owned `SessionRecordVisibility`; the required move to record ownership removes all three imports, so retaining that edge would require an artificial dependency. The existing `club|auth` tombstone remains untouched.

## File Structure

### New production files

- `server/src/main/kotlin/com/readmates/sessionimport/application/InvalidSessionImportException.kt` — application-owned invalid-import failure with the existing issues payload and message.
- `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordVisibility.kt` — record-owned compatibility visibility enum.
- `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordSnapshotCodec.kt` — encode/decode output port.
- `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/ReplaceSessionRecordContentPort.kt` — consumer-owned cross-feature replacement command/result contract.
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/codec/JacksonSessionRecordSnapshotCodec.kt` — Jackson/SHA-256 port implementation.
- `server/src/test/kotlin/com/readmates/sessionimport/api/SessionImportErrorHandlerTest.kt` — exact invalid-import response characterization in package `com.readmates.sessionimport.api`, outside the adapter package-name suppression boundary.
- `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/codec/JacksonSessionRecordSnapshotCodecTest.kt` — moved and strengthened codec contract.

### Deleted production and test files

- Delete `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodec.kt` after the port implementation is wired.
- Delete `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodecTest.kt` after its behavior is preserved under the outbound implementation test.

### Tracked ledgers, architecture, and active docs

- `server/config/architecture/boundary-import-baseline.txt`
- `server/config/architecture/phase-0-retired-boundary-imports.txt`
- `server/config/architecture/feature-dependency-baseline.txt`
- `server/config/architecture/phase-0-retired-feature-dependencies.txt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- `docs/development/architecture.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `CHANGELOG.md`
- `${SDD_WORKSPACE}/final-report.md` — ignored execution evidence only; never stage or commit.

## Task Interfaces

The exact new codec contract is:

```kotlin
interface SessionRecordSnapshotCodec {
    fun encode(snapshot: SessionRecordSnapshot): EncodedSessionRecordSnapshot
    fun decode(json: String): SessionRecordSnapshot
}

@Component
class JacksonSessionRecordSnapshotCodec(
    private val objectMapper: ObjectMapper,
) : SessionRecordSnapshotCodec
```

The exact consumer-owned replacement contract is:

```kotlin
interface ReplaceSessionRecordContentPort {
    fun replace(input: SessionRecordContentReplacement): SessionRecordContentReplacementResult
}

data class SessionRecordContentReplacement(
    val host: AuthenticatedClubActor,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val snapshot: SessionRecordSnapshot,
    val source: SessionRecordDraftSource,
    val trustedAuthorBindings: Map<String, UUID>,
    val historicalAuthorBindings: Map<String, UUID>,
)

sealed interface SessionRecordContentReplacementResult {
    data class Applied(val canonicalSnapshot: SessionRecordSnapshot) : SessionRecordContentReplacementResult
    data object Invalid : SessionRecordContentReplacementResult
}
```

`SessionImportService` implements this port. It maps the record command to the existing `SessionImportCommand` with `SESSION_IMPORT_FORMAT`, validates against the current target with the supplied binding maps and `trustAuthorDisplayNames = source == AI_GENERATED`, canonicalizes with `toCanonicalSnapshot`, performs the current `SessionImportRecordReplacement` write and after-commit cache invalidation, and returns `Applied`. Invalid preview or missing feedback title returns `Invalid`. `SessionRecordApplyService` maps `Invalid` to the existing `SessionRecordException(SessionRecordError.INVALID_RECORD, "Session record draft is invalid")` and encodes the returned canonical snapshot for the immutable revision. No sessionimport type crosses the record-owned port.

---

### Task 1: Own Session-Closing Parsing And Session-Import Failure

**Exact allowlist:**

- `server/src/main/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/application/InvalidSessionImportException.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportDraftService.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- `server/src/test/kotlin/com/readmates/sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`
- `server/src/test/kotlin/com/readmates/sessionimport/api/SessionImportErrorHandlerTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/config/architecture/boundary-import-baseline.txt`
- `server/config/architecture/phase-0-retired-boundary-imports.txt`

- [ ] **Step 1: Write RED behavior and ownership detectors.** Add an invalid `sessionId` controller test that asserts HTTP 400 and no use-case call. Add direct error-handler tests in `SessionImportErrorHandlerTest` with package `com.readmates.sessionimport.api` for HTTP 400, code `INVALID_SESSION_IMPORT`, first-issue message, empty-issues fallback message, and absence of private exception text. Do not add a package-name suppression or baseline identity for this test. Add architecture rules that sessionclosing inbound web source imports no other feature's inbound adapter and sessionimport inbound web source imports no concrete application service.
- [ ] **Step 2: Run RED sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionclosing.adapter.in.web.HostSessionClosingControllerTest \
    --tests com.readmates.sessionimport.api.SessionImportErrorHandlerTest \
    --tests com.readmates.aigen.adapter.in.web.AiGenerationErrorHandlerTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: new source-boundary rules fail on the two exact current imports.
- [ ] **Step 3: Implement ownership without changing behavior.** Add a private sessionclosing UUID parser with the same `ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id")`. Move only the exception declaration, unchanged, to the application root and update every enumerated caller/test import. Do not change session's existing parser.
- [ ] **Step 4: Retire exact rows atomically.** Remove the two exact Task 1 rows from the current baseline and append them unchanged to the retired ledger. Assert `2 current + 37 retired = 39 approved`.
- [ ] **Step 5: Run GREEN and deterministic mutations.** Re-run Step 2. Temporarily change the closing parser to 404; the invalid-ID characterization must fail. Temporarily select the last issue instead of the first and remove the fallback; each handler assertion must fail independently. Restore each mutation and rerun the same selector.
- [ ] **Step 6: Review, stage, and commit.** Review exact HTTP/error parity, all exception consumers, scanner load bearing, and ledger identity. Stage only the allowlist and commit:

  ```bash
  git commit -m "refactor(server): own session family web boundaries"
  ```

  Correction subject: `fix(server): correct session web boundary review`.

### Task 2: Own Session History Sort Policy

**Exact allowlist:**

- `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryService.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModelsTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryServiceTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapterDbTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/config/architecture/boundary-import-baseline.txt`
- `server/config/architecture/phase-0-retired-boundary-imports.txt`

- [ ] **Step 1: Write RED ordering ownership.** Extend `SessionRecordModelsTest` with exact enum-to-sort map equality. Add a source/ArchUnit rule that `JdbcHostSessionHistoryAdapter` cannot import `sessionrecord.application.service`. Strengthen the DB test so equal timestamps cross audit, applied revision, notification send, and notification skip sources and paginate by `(createdAt DESC, typeSort DESC, id DESC)` without duplicate/skip.
- [ ] **Step 2: Run RED sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionrecord.application.model.SessionRecordModelsTest \
    --tests com.readmates.sessionrecord.application.service.HostSessionHistoryQueryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.sessionrecord.adapter.out.persistence.JdbcHostSessionHistoryAdapterDbTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Move the policy.** Give `HostSessionHistoryType` a constructor property `val typeSort: Int` with the exact six values. Delete the service extension and constants. Keep cursor keys, accepted sort set, SQL literals, tuple comparison, and UUID string comparison unchanged.
- [ ] **Step 4: Retire the exact row.** Move only `com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt|com.readmates.sessionrecord.application.service.typeSort` to the retired ledger. Assert `1 current + 38 retired = 39 approved`.
- [ ] **Step 5: Mutation and GREEN.** Swap sort values 50 and 60; both exact model mapping and DB send/skip pagination must fail. Restore, rerun Step 2, and verify a second page shares no ID with the first.
- [ ] **Step 6: Review and commit.** Review Kotlin and SQL sort parity, cursor stability, DB tuple semantics, and exact ledger move. Commit:

  ```bash
  git commit -m "refactor(server): own session history sort policy"
  ```

  Correction subject: `fix(server): correct session history sort review`.

### Task 3: Port Snapshot Serialization

**Exact allowlist:**

- `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordSnapshotCodec.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/codec/JacksonSessionRecordSnapshotCodec.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodec.kt` (delete)
- `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftService.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/codec/JacksonSessionRecordSnapshotCodecTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodecTest.kt` (delete)
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftServiceTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/config/architecture/boundary-import-baseline.txt`
- `server/config/architecture/phase-0-retired-boundary-imports.txt`

- [ ] **Step 1: Write RED port and codec detectors.** Move the codec test to the outbound package and assert round-trip equality, deterministic repeated encode, exact 64-character SHA-256 of exact JSON, membership attribution, exact schema value, missing/unknown schema rejection, and all three visibility enum spellings. Add a rule that every sessionrecord outbound adapter imports no sessionrecord concrete application service.
- [ ] **Step 2: Run RED sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionrecord.adapter.out.codec.JacksonSessionRecordSnapshotCodecTest \
    --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest \
    --tests com.readmates.sessionrecord.application.service.SessionRecordDraftServiceTest \
    --tests com.readmates.sessionrecord.adapter.out.persistence.JdbcSessionRecordAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement the port.** Add the exact output interface and Jackson implementation above. Inject the interface into both services and JDBC adapter. Delete the concrete service codec only after `rg` proves no consumer. Preserve mapper module discovery, schema check before deserialization, exception type/message, exact JSON and hash behavior.
- [ ] **Step 4: Retire the exact row.** Move only `com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt|com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodec` to retired. Assert `0 current + 39 retired = 39 approved`.
- [ ] **Step 5: Mutation and GREEN.** Hash a trimmed JSON string and accept schema v2; each codec assertion must fail. Restore and rerun Step 2. Run `rg` to prove no production `sessionrecord.adapter.out` import of `sessionrecord.application.service`.
- [ ] **Step 6: Review and commit.** Review DI uniqueness, codec bytes/schema/hash, persistence decode paths, and ledger finality. Commit:

  ```bash
  git commit -m "refactor(server): port session record snapshot codec"
  ```

  Correction subject: `fix(server): correct session record codec review`.

### Task 4: Invert Session Import Apply Dependency

**Exact allowlist:**

- `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/ReplaceSessionRecordContentPort.kt`
- `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- `server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportDraftServiceTest.kt`
- `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- `server/config/architecture/feature-dependency-baseline.txt`
- `server/config/architecture/phase-0-retired-feature-dependencies.txt`

- [ ] **Step 1: Write RED dependency and transaction behavior.** Add a source rule that sessionrecord application imports no sessionimport package, including aliases and fully-qualified references. Refactor the apply unit fake to implement the proposed record-owned port and retain assertions for trusted/historical bindings, AI trust flag, canonical normalized snapshot, operation order, replay, stale rejection, no notification dispatch, and invalid-with-zero-store-writes. In `HostSessionImportControllerDbTest`, use Spring's `@MockitoSpyBean` for `SessionRecordStorePort`, delegate all real JDBC behavior except a deterministic `IllegalStateException` from `insertAppliedRevision`, and assert the outer transaction rolls back the already-attempted live replacement: live summary/exposure/highlights/reviews/feedback, revision rows, receipt rows, and draft row all equal their pre-apply state.
- [ ] **Step 2: Run RED sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest \
    --tests com.readmates.sessionimport.application.service.SessionImportDraftServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement inversion.** Add the exact record-owned port contract. Make `SessionImportService` implement it through private import validation/canonicalization/replacement helpers. Remove `ReplaceValidatedSessionImportUseCase` and `ValidatedSessionImportReplacement` because their only production cross-feature caller disappears; update the import unit test to exercise the new port. `SessionRecordApplyService` constructs only record-owned input and receives only record-owned result. Keep its `@Transactional` annotation and write order unchanged.
- [ ] **Step 4: Retire exactly one feature row.** Move `sessionrecord|sessionimport` verbatim to retired. Update inventory expected components to `setOf(setOf("session", "sessionrecord"))`. Assert `39 current + 2 retired = 41 approved`, and assert `sessionimport|sessionrecord` remains current.
- [ ] **Step 5: Mutations and GREEN.** Bypass validation, return the untrimmed draft snapshot, move revision insertion before live replacement, and remove the forced post-replacement failure one at a time. The focused unit/integration assertions must fail for each mutation. Restore and rerun Step 2.
- [ ] **Step 6: Review and commit.** Review port ownership, absence of import types in record, validation flags, canonical snapshot single-source use, atomic operation order, cache after-commit behavior, and exact one-row feature retirement. Commit:

  ```bash
  git commit -m "refactor(server): invert session import apply dependency"
  ```

  Correction subject: `fix(server): correct session import inversion review`.

### Task 5: Own Visibility And History Cursor In Session Record

**Exact production allowlist:**

- Create `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordVisibility.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryService.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/HostSessionRecordController.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordWebDtos.kt`
- Modify `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`
- Modify every `SessionRecordVisibility` import in these exact production files: `aigen/adapter/in/web/AiGenerationWebDtos.kt`, `aigen/application/port/in/AiGenerationUseCases.kt`, `aigen/application/service/AiGenerationCommitService.kt`, `session/adapter/in/web/HostSessionController.kt`, `session/adapter/in/web/PublicationController.kt`, `session/adapter/out/persistence/HostSessionQueries.kt`, `session/adapter/out/persistence/HostSessionRowMappers.kt`, `session/adapter/out/persistence/HostSessionWriteOperations.kt`, `session/application/SessionApplicationModels.kt`, `session/application/model/HostSessionCommands.kt`, `session/application/port/out/HostSessionDraftPort.kt`, `session/application/service/HostSessionLifecycleService.kt`, `sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt`, `sessionclosing/application/model/SessionClosingModels.kt`, `sessionclosing/application/service/SessionClosingStatusService.kt`, `sessionimport/adapter/in/web/SessionImportWebDtos.kt`, `sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt`, `sessionimport/application/model/SessionImportModels.kt`, `sessionimport/application/port/out/SessionImportWritePort.kt`, and `sessionimport/application/service/SessionImportService.kt`.

**Exact test/config allowlist:**

- Modify `server/src/test/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandlerTest.kt`
- Modify `server/src/test/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryServiceTest.kt`
- Modify `server/src/test/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModelsTest.kt`
- Modify every `SessionRecordVisibility` import in these exact tests: `aigen/adapter/in/web/AiGenerationControllerTest.kt`, `aigen/api/AiGenerateGroundedCommitIntegrationTest.kt`, `aigen/application/service/AiGenerationCommitRequestHasherTest.kt`, `aigen/application/service/AiGenerationCommitServiceTest.kt`, `session/adapter/out/persistence/HostSessionLedgerScanTest.kt`, `session/application/service/HostSessionServicesTest.kt`, `sessionclosing/adapter/in/web/HostSessionClosingControllerTest.kt`, `sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapterTest.kt`, `sessionclosing/application/service/SessionClosingStatusServiceTest.kt`, `sessionimport/application/service/SessionImportDraftServiceTest.kt`, `sessionrecord/adapter/out/codec/JacksonSessionRecordSnapshotCodecTest.kt`, `sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt`, `sessionrecord/application/service/SessionRecordApplyServiceTest.kt`, `sessionrecord/application/service/SessionRecordDraftServiceTest.kt`, and `shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`
- Modify `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify `server/config/architecture/feature-dependency-baseline.txt`
- Modify `server/config/architecture/phase-0-retired-feature-dependencies.txt`

- [ ] **Step 1: Write RED ownership and public-contract tests.** Add exact enum-name equality in `SessionRecordModelsTest`. Change history unit expectations to the new record-owned exception. Extend record error-handler tests for exact 400/code/message. Keep malformed and duplicate-key HTTP cursor assertions. Add a source detector that sessionrecord application imports no session package, and inventory assertions that both forward edges remain.
- [ ] **Step 2: Run RED sequentially.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionrecord.application.model.SessionRecordModelsTest \
    --tests com.readmates.sessionrecord.application.service.HostSessionHistoryQueryServiceTest \
    --tests com.readmates.sessionrecord.adapter.in.web.SessionRecordErrorHandlerTest \
    --tests com.readmates.session.application.service.HostSessionServicesTest \
    --tests com.readmates.sessionclosing.application.service.SessionClosingStatusServiceTest \
    --tests com.readmates.sessionimport.application.service.SessionImportDraftServiceTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest \
    --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest \
    --tests com.readmates.aigen.api.AiGenerateGroundedCommitIntegrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Move visibility and split cursor failure.** Move the unchanged three-value enum out of `SessionApplicationModels.kt`. Update all exact imports; do not change fields, JSON annotations, database strings, or compatibility conversion. Add `InvalidHostSessionHistoryCursorException` beside record application errors and use it in controller strict decode and history service validation. Map it in `SessionRecordErrorHandler`; leave session's exception/handler/query behavior intact.
- [ ] **Step 4: Retire exactly two feature rows and finish cycles.** Move `sessionrecord|session` and the ownership-derived `aigen|session` verbatim to retired. Change expected cyclic components to `emptySet()`. Assert `37 current + 4 retired = 41 approved`, `session|sessionrecord` and `sessionimport|sessionrecord` remain current, and the only new retired rows relative to the plan base are the two required reverse edges plus `aigen|session`.
- [ ] **Step 5: Mutations and GREEN.** Rename `MEMBER`, map history cursor to 404, remove club/session cursor binding, and map `PUBLIC` to non-public exposure one at a time. Exact enum/JSON, error, cursor, and import-apply exposure tests must fail. Restore and rerun Step 2.
- [ ] **Step 6: Review and commit.** Review all enum consumers, API JSON, ordinary versus history cursor separation, public exposure dual-write, exact three-row total feature retirement across Tasks 4–5, forward edges, and zero cycles. Commit:

  ```bash
  git commit -m "refactor(server): own session record visibility"
  ```

  Correction subject: `fix(server): correct session record ownership review`.

### Task 6: Synchronize Architecture Docs And Produce Final Evidence

**Exact tracked allowlist:**

- `docs/development/architecture.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `CHANGELOG.md`

**Ignored output:** `${SDD_WORKSPACE}/final-report.md`.

- [ ] **Step 1: Freeze references and audit exact source/ledger deltas.**

  ```bash
  PLAN_FILE=docs/superpowers/plans/2026-08-13-readmates-backend-quality-phase-2-session-ownership-cycles.md
  IMPLEMENTATION_BASE="$(git log -1 --format=%H -- "$PLAN_FILE")"
  SDD_SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/subagent-driven-development"
  SDD_WORKSPACE="$("$SDD_SKILL_DIR/scripts/sdd-workspace" "$PLAN_FILE")"
  REPORT_FILE="$SDD_WORKSPACE/final-report.md"
  git status --short --branch
  git rev-parse HEAD
  ```

  Record the actual plan commit and implementation base in the ignored report. Do not use the historical plan base as the implementation diff base.
- [ ] **Step 2: Update active docs.** State that boundary debt is `0 + 39 = 39`, feature debt is `37 + 4 = 41`, and cycle count is zero. Name the four boundary and three new feature tombstones, both preserved forward directions, port ownership, codec ownership, visibility/cursor ownership, and transaction preservation. State that large-class decomposition and final Phase 2 program closeout remain separate.
- [ ] **Step 3: Run final gates sequentially at final candidate HEAD.**

  ```bash
  ./server/gradlew -p server compileKotlin \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./scripts/server-ci-check.sh
  ./server/gradlew -p server integrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  git diff --check "$IMPLEMENTATION_BASE"..HEAD
  ./scripts/build-public-release-candidate.sh
  ./scripts/public-release-check.sh .tmp/public-release-candidate
  ```

  Do not run frontend E2E: no frontend/BFF/auth route or public JSON contract changes are authorized, and focused controller plus full server integration cover the changed risk. If a diff includes frontend/BFF or changes a public contract, remove that diff; do not expand this plan. Do not run a live provider or email test.
- [ ] **Step 4: Run exact partition and no-substitution audit.** Use a read-only script to compare current/retired sets against the plan-base files and fail unless boundary additions are empty, boundary removals are exactly the four named identities with identical retired additions, feature additions are empty, and feature removals/retired additions are exactly the two reverse rows. Verify line counts ignoring comments/blanks: boundary `0/39/39`, feature `38/3/41`. Verify current contains `session|sessionrecord` and `sessionimport|sessionrecord`, retired contains both reverse rows, and no other plan-base current feature moved.
- [ ] **Step 5: Run source escape scans.** Require no production matches for:

  ```text
  sessionclosing adapter.in -> session adapter.in
  sessionimport adapter.in -> sessionimport application.service
  sessionrecord adapter.out -> sessionrecord application.service
  sessionrecord application -> sessionimport
  sessionrecord application -> session
  ```

  Exclude comments and string fixtures only through the existing Kotlin-aware scanner; do not rely on raw grep as the load-bearing detector.
- [ ] **Step 6: Perform independent final review.** Require explicit verdicts for: (1) spec/scope coverage, (2) REST/JSON/error/cursor compatibility, (3) transaction/revision/notification/cache semantics, (4) codec/sort/import/exposure behavior, (5) exact ledger arithmetic/no third edge/zero cycles, and (6) public safety/test evidence. Resolve every Critical/Important finding in its originating task with its exact correction subject and rerun that task plus affected final gates.
- [ ] **Step 7: Write the ignored final report.** Include bases/SHAs, exact changed inventory, task and correction commits, four boundary/three new feature tombstones, preserved forward edges, cycle output, mutation failures/restorations, focused and full test counts, public-candidate result, review verdicts, skipped E2E/live reasons, and remaining out-of-scope large-class/final-closeout work. Never stage the report.
- [ ] **Step 8: Review, stage, and commit docs.** Stage only the three tracked docs and commit:

  ```bash
  git commit -m "docs: document Phase 2 session ownership cycles"
  ```

  Correction subject: `docs: correct Phase 2 session ownership documentation`.

## Deterministic Mutation Checklist

- [ ] Closing invalid UUID returns 400, not 404/500, and never calls the use case.
- [ ] Import error uses the first issue and the exact fallback when issues are empty.
- [ ] History sort mutation changes the cross-source order and breaks continuation deterministically.
- [ ] Codec hashes the exact emitted JSON and rejects missing/unknown schema.
- [ ] Record apply cannot bypass import validation or persist a non-canonical snapshot.
- [ ] A post-live-write failure rolls back live content/exposure, revisions, receipt, and draft deletion.
- [ ] Visibility names and compatibility exposure remain exact for HOST_ONLY/MEMBER/PUBLIC.
- [ ] History cursor retains all five keys and rejects malformed, unknown-sort, wrong-club, and wrong-session values before querying sources.
- [ ] Each mutation is one-at-a-time, produces named RED evidence, is restored byte-for-byte, and is followed by the same GREEN selector.

## Final Completion Checklist

- [ ] Exactly six tasks completed with exact commit subjects or documented correction subjects.
- [ ] Exactly four boundary identities retired; partition `0 + 39 = 39`.
- [ ] Exactly three new feature identities retired; partition `37 + 4 = 41`.
- [ ] `sessionimport|sessionrecord` and `session|sessionrecord` remain current.
- [ ] No fourth feature edge was retired or introduced; cyclic components are empty.
- [ ] REST/JSON/status/error/cursor/revision/notification/transaction/codec/sort/import/commit/exposure behavior is characterized and green.
- [ ] No frontend/BFF, migration/schema, deploy, live provider, email, or production-data change exists.
- [ ] No suppression/baseline/config exception was added.
- [ ] Focused, architecture, server CI, full integration, diff, and public-release gates passed sequentially at final HEAD.
- [ ] Independent reviews have Critical 0 / Important 0 / Minor 0, or every material finding is corrected and re-reviewed.
- [ ] Active docs agree with source and ledgers; ignored report is complete and public-safe.
- [ ] `git status --short --branch` is clean.

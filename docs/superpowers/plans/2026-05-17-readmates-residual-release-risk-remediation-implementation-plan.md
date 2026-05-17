# ReadMates Residual Release Risk Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend CI blocker and the remaining AI generation / platform admin release risks found in the `origin/main..HEAD` readiness review.

**Architecture:** Keep HTTP mapping in inbound adapters, business denials in feature application exceptions, persistence behind outbound ports, and external side effects outside uncommitted database transactions. Treat release docs and validation logs as evidence, not as a substitute for the local CI-equivalent checks.

**Tech Stack:** Kotlin/Spring Boot, detekt/ktlint/JUnit 5, Redis, MySQL/Flyway, React/Vite/Vitest, Playwright, Bash release-safety scripts.

## Audit notes — 2026-05-17

Spot-check of this plan against the current `origin/main..HEAD` source found gaps that have been fixed in place below. Executors should follow the corrected steps — there is no separate "addendum" section.

- detekt baseline count corrected from 48 → 49 (Task 1 Step 3 reference and spec finding §P0).
- Task 3 Step 1 now lists the two additional `FakeValidator.resultProvider = { snapshot -> … }` call sites that must be updated together with the commit test (regen + worker tests) — otherwise the codebase will not compile after the signature flip.
- Task 3 Step 6 now modifies the existing `FakeCommitValidatedUseCase.commitValidated(...)` body rather than adding a duplicate override.
- Task 5 no longer relies on `ResourcelessTransactionManager`. `server/build.gradle.kts` does not pull in `spring-batch-infrastructure`, so the plan now uses an inline `AbstractPlatformTransactionManager` no-op fake for the unit test.
- Task 7 now enumerates the detekt findings outside Tasks 2–6 (worker `ReturnCount`/`MagicNumber`, regen `MagicNumber`, sessionimport `TooManyFunctions`, `RedisGenerationCostCountersTest.UseCheckOrError`, several `MaxLineLength` in tests, `LongMethod` in `StubSessionContent*`). The `DefaultSessionImportV1Validator` refactor covers the full set of returns in both `checkSchema` (7 returns) and `checkFeedbackTemplate` (3 returns).
- Task 9 Step 1 now uses the multipart pattern the existing `AiGenerateApiIntegrationTest` actually uses (`file(transcript) + file(body) + with(user(HOST_EMAIL))`), not URL params + cookie/header headers.
- Task 9 Step 2 assertions now match the validator-produced detail string ("Unknown authorName(s) not in expectedAuthorNames: ...").

---

## Source Documents

- Risk spec: `docs/superpowers/specs/2026-05-17-readmates-residual-release-risk-remediation-spec.md`
- Release readiness checklist: `docs/development/release-readiness-review.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Previous release-risk plan: `docs/superpowers/plans/2026-05-17-readmates-release-risk-remediation-implementation-plan.md`

## File Map

### AI Generation Error Contract

- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`

### Platform Admin Onboarding

- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt`
- Existing integration coverage: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`

### Redis AI Job Store

- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`

### Static Analysis Cleanup

- Modify according to active detekt report:
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
  - `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`
  - `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
  - `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobQueue.kt`
  - `server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducer.kt`
  - `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt`
  - `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
  - `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt`
  - `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaProperties.kt`
  - `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
  - `server/src/main/kotlin/com/readmates/aigen/application/service/DefaultSessionImportV1Validator.kt`
  - `server/src/main/kotlin/com/readmates/aigen/application/service/ClubAiDefaultsService.kt`
  - the test files listed by `server/build/reports/detekt/detekt.txt`

### Frontend Validation Hygiene

- Modify: `front/eslint.config.mjs`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`

### Release Evidence

- Modify after checks: `CHANGELOG.md`

---

### Task 1: Reproduce And Freeze The Current Risk Baseline

**Files:**
- Read: `server/build/reports/detekt/detekt.txt`
- Read: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm the branch and worktree are safe to edit**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main [ahead N]
```

If tracked files are dirty before editing, inspect them with `git diff -- <path>` and decide whether they are user work. Do not revert unrelated changes.

- [ ] **Step 2: Reproduce the backend release blocker**

Run:

```bash
./server/gradlew -p server check
```

Expected before remediation: failure in detekt.

- [ ] **Step 3: Save the active finding list for this implementation**

Run:

```bash
sed -n '1,260p' server/build/reports/detekt/detekt.txt
```

Expected: 49 active findings, including `AiGenerationOrchestrator.kt` (UseCheckOrError), `AiGenerationRegenerationService.kt` (UseCheckOrError, MagicNumber), `AiGenerationCommitService.kt` (UseCheckOrError), `AiGenerationJobQueue.kt` (LongParameterList), `AiGenerationWorker.kt` (TooManyFunctions, ReturnCount, MagicNumber, MaxLineLength), notification files (LongMethod, CyclomaticComplexMethod), `DefaultSessionImportV1Validator.kt` (ReturnCount ×2), `ClubAiDefaultsService.kt` (ReturnCount), AI generation Kafka adapters (TooGenericExceptionCaught, MaxLineLength), Redis adapter (MaxLineLength), `SessionImportService.kt` (TooManyFunctions), and several test files (LongMethod, MaxLineLength, UnusedPrivateProperty, UseCheckOrError).

- [ ] **Step 4: Confirm CI uses the same gate**

Run:

```bash
rg -n "./gradlew check|Server quality gates" .github/workflows/ci.yml
```

Expected:

```text
.github/workflows/ci.yml:...: Server quality gates (ktlint + detekt + tests + JaCoCo + architecture)
.github/workflows/ci.yml:...: run: ./gradlew check
```

- [ ] **Step 5: Commit nothing**

This task is baseline-only. Leave the worktree unchanged.

---

### Task 2: Convert AI Generation Expected Failures To Typed Exceptions

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`

- [ ] **Step 1: Update orchestrator service tests to expect `AiGenerationException.Coded`**

In `AiGenerationOrchestratorTest`, replace the disabled-model assertion:

```kotlin
assertThatThrownBy {
    ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
}.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
    assertThat(it.code).isEqualTo(ErrorCode.AI_DISABLED)
}
```

Replace the cost-guard deny assertion:

```kotlin
assertThatThrownBy {
    ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
}.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
    assertThat(it.code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
}
```

Add this import if it is missing:

```kotlin
import com.readmates.aigen.application.AiGenerationException
```

- [ ] **Step 2: Update regeneration service test to expect `AiGenerationException.Coded`**

In `AiGenerationRegenerationServiceTest`, replace the cost-guard deny assertion:

```kotlin
assertThatThrownBy {
    ctx.service.regenerate(
        sessionId = ctx.sessionId,
        jobId = record.jobId,
        item = GenerationItem.SUMMARY,
        model = null,
        instructions = null,
    )
}.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
    assertThat(it.code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
}
```

Add this import if it is missing:

```kotlin
import com.readmates.aigen.application.AiGenerationException
```

- [ ] **Step 3: Update commit service tests to expect `AiGenerationException.Coded`**

In `AiGenerationCommitServiceTest`, replace both validation-failure assertions with:

```kotlin
assertThatThrownBy {
    ctx.service.commit(
        host = ctx.host,
        sessionId = ctx.sessionId,
        jobId = record.jobId,
        recordVisibility = SessionRecordVisibility.MEMBER,
        overrideResult = null,
    )
}.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
    assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
}
```

For the override rejection test, keep `overrideResult = badOverride` and use the same `isInstanceOfSatisfying` block.

Add this import if it is missing:

```kotlin
import com.readmates.aigen.application.AiGenerationException
```

- [ ] **Step 4: Run the updated tests and confirm they fail before production changes**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.application.service.AiGenerationOrchestratorTest \
  --tests com.readmates.aigen.application.service.AiGenerationRegenerationServiceTest \
  --tests com.readmates.aigen.application.service.AiGenerationCommitServiceTest
```

Expected before implementation: failures because the services still throw `IllegalStateException`.

- [ ] **Step 5: Replace `IllegalStateException` in orchestrator failure paths**

In `AiGenerationOrchestrator.failStart(...)`, replace both throw statements:

```kotlin
throw AiGenerationException.Coded(code, message)
```

This applies to both overloads:

```kotlin
private fun failStart(
    command: StartGenerationCommand,
    modelId: ModelId,
    code: ErrorCode,
    message: String,
): Nothing
```

and:

```kotlin
private fun failStart(
    command: StartGenerationCommand,
    code: ErrorCode,
    message: String,
): Nothing
```

- [ ] **Step 6: Replace expected regeneration denials**

In `AiGenerationRegenerationService.failRegen(...)`, replace the expected-denial branch:

```kotlin
when (code) {
    ErrorCode.HOST_DAILY_CAP_EXCEEDED,
    ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED,
    ErrorCode.RATE_LIMITED,
    ErrorCode.AI_DISABLED,
    ErrorCode.JOB_EXPIRED,
    ErrorCode.QUEUE_UNAVAILABLE,
    -> throw AiGenerationException.Coded(code, message)
    else -> throw LlmGenerationException(
        com.readmates.aigen.application.model.GenerationError(code, message),
    )
}
```

- [ ] **Step 7: Replace commit validation failure**

In `AiGenerationCommitService.failCommit(...)`, replace:

```kotlin
throw IllegalStateException("Validation failed: ${violation.code}: ${violation.message}")
```

with:

```kotlin
throw AiGenerationException.Coded(violation.code, violation.message)
```

- [ ] **Step 8: Verify no branch-local AI service path still throws the old string form**

Run:

```bash
rg -n 'throw IllegalStateException\("\$code:|Validation failed:' server/src/main/kotlin/com/readmates/aigen
```

Expected: no output.

- [ ] **Step 9: Re-run the service tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.application.service.AiGenerationOrchestratorTest \
  --tests com.readmates.aigen.application.service.AiGenerationRegenerationServiceTest \
  --tests com.readmates.aigen.application.service.AiGenerationCommitServiceTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 10: Commit this slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt
git commit -m "fix: return typed AI generation denials"
```

---

### Task 3: Validate AI Commit Overrides Against Original Session Metadata

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`

- [ ] **Step 1: Add the trust-boundary regression test**

In `AiGenerationCommitServiceTest`, add this test near the existing override tests:

```kotlin
@Test
fun `commit override validates authors against original session metadata`() {
    val ctx = TestContext()
    val originalMeta = AiGenerationTestFixtures.sessionMeta(
        sessionId = ctx.sessionId,
        clubId = ctx.host.clubId,
        expectedAuthorNames = listOf("Real Host"),
    )
    val record = AiGenerationTestFixtures.jobRecord(
        sessionId = ctx.sessionId,
        clubId = ctx.host.clubId,
        hostUserId = ctx.host.userId,
        status = JobStatus.SUCCEEDED,
        result = AiGenerationTestFixtures.snapshot(),
        sessionMeta = originalMeta,
    )
    ctx.jobStore.save(record)
    val injectedOverride = AiGenerationTestFixtures.snapshot().copy(
        highlights = listOf(
            SessionImportV1Snapshot.AuthoredText("Injected Person", "Untrusted edit."),
        ),
        oneLineReviews = listOf(
            SessionImportV1Snapshot.AuthoredText("Injected Person", "Untrusted review."),
        ),
    )
    ctx.validator.resultProvider = { _, meta ->
        if ("Injected Person" in meta.expectedAuthorNames) {
            ValidationResult.Ok
        } else {
            ValidationResult.Violation(ErrorCode.AUTHOR_NAME_MISMATCH, "unknown author")
        }
    }

    assertThatThrownBy {
        ctx.service.commit(
            host = ctx.host,
            sessionId = ctx.sessionId,
            jobId = record.jobId,
            recordVisibility = SessionRecordVisibility.MEMBER,
            overrideResult = injectedOverride,
        )
    }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
        assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
    }

    val validatedMeta = ctx.validator.calls.single().second
    assertThat(validatedMeta.expectedAuthorNames).containsExactly("Real Host")
    assertThat(ctx.delegate.invocations).isEmpty()
}
```

Change `FakeValidator.resultProvider` in `AiGenerationFakes.kt` from:

```kotlin
var resultProvider: ((SessionImportV1Snapshot) -> ValidationResult)? = null
```

to:

```kotlin
var resultProvider: ((SessionImportV1Snapshot, SessionMeta) -> ValidationResult)? = null
```

and change the return line:

```kotlin
return resultProvider?.invoke(snapshot, sessionMeta) ?: result
```

Update ALL existing call sites that currently accept one argument. There are TWO call sites outside the commit test that will fail to compile after the signature flip:

- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt` (~line 160, "regenerate rolls back and audits FAILED when patched snapshot fails validation"):

  ```kotlin
  ctx.validator.resultProvider = { snapshot, _ ->
      if (snapshot.summary == "bad summary") {
          ValidationResult.Violation(ErrorCode.SCHEMA_INVALID, "blank summary")
      } else {
          ValidationResult.Ok
      }
  }
  ```

- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt` (~line 75, "process retries once on validator SCHEMA_INVALID with strengthened instructions"):

  ```kotlin
  ctx.validator.resultProvider = { snapshot, _ ->
      validateCount += 1
      if (validateCount == 1) ValidationResult.Violation(ErrorCode.SCHEMA_INVALID) else ValidationResult.Ok
  }
  ```

The commit test's existing single-argument lambdas (if any are added) follow the same `{ snapshot, _ -> ... }` form. Stage both files in the same commit slice as the signature change.

- [ ] **Step 2: Confirm the new trust-boundary test fails**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests 'com.readmates.aigen.application.service.AiGenerationCommitServiceTest.commit override validates authors against original session metadata'
```

Expected before implementation: failure because `AiGenerationCommitService` currently derives expected author names from the override snapshot.

- [ ] **Step 3: Use `record.toSessionMeta()` in commit validation**

In `AiGenerationCommitService.commit(...)`, replace:

```kotlin
val sessionMeta = buildSessionMeta(record, snapshot)
```

with:

```kotlin
val sessionMeta = record.toSessionMeta()
```

`toSessionMeta()` is a `JobRecord` member function, so call it directly with no extra import:

```kotlin
val sessionMeta = record.toSessionMeta()
```

Then delete the private `buildSessionMeta(...)` function and remove the now-unused `SessionMeta` import.

- [ ] **Step 4: Update `JobRecord.toSessionMeta()` KDoc**

In `AiGenerationJobStore.kt`, replace the last sentence of the KDoc:

```kotlin
* The commit service intentionally builds a different SessionMeta derived from
* the snapshot, so it does not call this.
```

with:

```kotlin
* Worker, regeneration, and commit validation all use this metadata as the
* original trust boundary. User-edited snapshots may change content, but they
* must not redefine the session identity or expected author list.
```

- [ ] **Step 5: Translate downstream `InvalidSessionImportException` safely**

In `AiGenerationCommitService.commit(...)`, wrap the delegate call:

```kotlin
val result =
    try {
        commitDelegate.commitValidated(ValidatedSessionImportInput(command))
    } catch (error: InvalidSessionImportException) {
        failCommit(
            record,
            ValidationResult.Violation(
                ErrorCode.SCHEMA_INVALID,
                "Generated session import failed validation",
            ),
        )
    }
```

Add:

```kotlin
import com.readmates.sessionimport.application.service.InvalidSessionImportException
```

The detail message is intentionally generic. Do not include `error.issues` in the thrown exception detail.

- [ ] **Step 6: Add a downstream validation mapping test**

In `AiGenerationCommitServiceTest`, add a delegate mode that throws `InvalidSessionImportException`. The existing `private class FakeCommitValidatedUseCase` in the test file already defines a `commitValidated(...)` body that pushes to `invocations`. Modify that single body in place — do NOT add a second override — so the optional throw fires before recording the call:

```kotlin
private class FakeCommitValidatedUseCase : CommitValidatedSessionImportUseCase {
    val invocations: MutableList<ValidatedSessionImportInput> = mutableListOf()
    var exception: RuntimeException? = null

    override fun commitValidated(input: ValidatedSessionImportInput): SessionImportCommitResult {
        exception?.let { throw it }
        invocations += input
        // keep the existing return body (constructs the stub SessionImportCommitResult)
        ...
    }
}
```

Keep the rest of the existing class body unchanged — only the property and the leading `exception?.let { throw it }` guard are new.

Add the new mapping test:

```kotlin
@Test
fun `commit maps downstream invalid import to safe AI schema error`() {
    val ctx = TestContext()
    ctx.delegate.exception = InvalidSessionImportException(
        listOf(SessionImportIssue("AUTHOR_NOT_FOUND", "작성자 'Private Name'을 찾을 수 없습니다.")),
    )
    val record = AiGenerationTestFixtures.jobRecord(
        sessionId = ctx.sessionId,
        clubId = ctx.host.clubId,
        hostUserId = ctx.host.userId,
        status = JobStatus.SUCCEEDED,
        result = AiGenerationTestFixtures.snapshot(),
    )
    ctx.jobStore.save(record)

    assertThatThrownBy {
        ctx.service.commit(
            host = ctx.host,
            sessionId = ctx.sessionId,
            jobId = record.jobId,
            recordVisibility = SessionRecordVisibility.MEMBER,
            overrideResult = null,
        )
    }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
        assertThat(it.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
        assertThat(it.message).doesNotContain("Private Name")
    }

    val audit = ctx.auditPort.entries.single()
    assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
    assertThat(audit.errorMessage).doesNotContain("Private Name")
}
```

Add imports:

```kotlin
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.service.InvalidSessionImportException
```

- [ ] **Step 7: Run commit service tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.application.service.AiGenerationCommitServiceTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit this slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt
git commit -m "fix: validate AI commit overrides against session metadata"
```

---

### Task 4: Sanitize AI Generation Error Logging

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`

- [ ] **Step 1: Add a direct handler regression test**

In `AiGenerationErrorHandlerTest`, add:

```kotlin
@Test
fun `unknown handler scrubs invalid session import details from response`() {
    val handler = AiGenerationErrorHandler()
    val error = InvalidSessionImportException(
        listOf(SessionImportIssue("AUTHOR_NOT_FOUND", "작성자 'Private Name'을 찾을 수 없습니다.")),
    )

    val response = handler.handleUnknown(error)

    assertThat(response.statusCode.value()).isEqualTo(500)
    assertThat(response.body!!.code).isEqualTo(ErrorCode.UNKNOWN.name)
    assertThat(response.body!!.detail).isEqualTo("internal error")
    assertThat(response.body!!.detail).doesNotContain("Private Name")
}
```

Add imports:

```kotlin
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.service.InvalidSessionImportException
```

- [ ] **Step 2: Sanitize the log statement**

In `AiGenerationErrorHandler.handleUnknown(...)`, replace:

```kotlin
log.error("Unhandled AI generation exception. Issues: {}", error.issues, error)
```

with:

```kotlin
val issueCodes = error.issues.map { it.code }.distinct()
log.error(
    "Unhandled AI generation exception. issueCount={}, issueCodes={}",
    error.issues.size,
    issueCodes,
    error,
)
```

This still logs the stack trace, but the structured issue messages are no longer emitted.

- [ ] **Step 3: Run handler tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.adapter.in.web.AiGenerationErrorHandlerTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit this slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt
git commit -m "fix: sanitize AI generation error logging"
```

---

### Task 5: Send Platform Admin Host Invitations After Commit

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt`

- [ ] **Step 1: Add a service-level regression test for rollback-before-email**

Create `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt` with fake ports that do not touch MySQL. The first test should model a domain race after invitation creation:

```kotlin
@Tag("unit")
class PlatformAdminOnboardingServiceTest {
    @Test
    fun `commit does not send invitation email when domain creation fails`() {
        val ports = FakePlatformAdminOnboardingPorts()
        ports.createDomainResult = CreateClubDomainResult.DuplicateHostname
        val mail = FakePlatformAdminInvitationMail()
        val service = service(ports, mail)

        assertThatThrownBy {
            service.commit(operatorAdmin(), commandWithNewHostAndDomain())
        }.isInstanceOfSatisfying(PlatformAdminException::class.java) {
            assertThat(it.error).isEqualTo(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
        }

        assertThat(mail.sent).isEmpty()
    }
}
```

The fake mail port should record calls:

```kotlin
private class FakePlatformAdminInvitationMail : SendPlatformAdminHostInvitationEmailPort {
    data class Sent(val email: String, val clubName: String, val acceptUrl: String)
    val sent = mutableListOf<Sent>()

    override fun send(email: String, clubName: String, acceptUrl: String) {
        sent += Sent(email, clubName, acceptUrl)
    }
}
```

Use `org.springframework.transaction.support.TransactionTemplate` backed by a local no-op `PlatformTransactionManager` for unit coverage. `spring-batch-infrastructure` is NOT on `server/build.gradle.kts`, so `ResourcelessTransactionManager` is unavailable; define the fake inline in the test file:

```kotlin
private class NoOpTransactionManager : AbstractPlatformTransactionManager() {
    override fun doGetTransaction(): Any = Any()

    override fun doBegin(transaction: Any, definition: TransactionDefinition) = Unit

    override fun doCommit(status: DefaultTransactionStatus) = Unit

    override fun doRollback(status: DefaultTransactionStatus) = Unit
}

private fun service(
    ports: FakePlatformAdminOnboardingPorts,
    mail: FakePlatformAdminInvitationMail,
): PlatformAdminOnboardingService =
    PlatformAdminOnboardingService(
        onboardingPort = ports,
        loadClubsPort = ports,
        createClubDomainPort = ports,
        sendHostInvitationEmailPort = mail,
        invitationTokenService = InvitationTokenService(),
        transactionTemplate = TransactionTemplate(NoOpTransactionManager()),
        appBaseUrl = "https://app.example.com",
    )
```

Imports:

```kotlin
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.AbstractPlatformTransactionManager
import org.springframework.transaction.support.DefaultTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
```

The fake commits the simulated transaction by no-op'ing `doCommit`, so the `transactionTemplate.execute { persistOnboarding(...) }` block in the service still returns its lambda value. The rollback test path triggers via the thrown `PlatformAdminException` inside `persistOnboarding(...)` — `TransactionTemplate.execute(...)` will propagate the exception just like a real transaction would, and the email port stays untouched.

- [ ] **Step 2: Add a success test proving email happens after persistence work**

Add:

```kotlin
@Test
fun `commit sends one invitation email after successful persistence`() {
    val ports = FakePlatformAdminOnboardingPorts()
    val mail = FakePlatformAdminInvitationMail()
    val service = service(ports, mail)

    val result = service.commit(operatorAdmin(), commandWithNewHostAndDomain())

    assertThat(result.hostOnboarding.kind).isEqualTo(HostOnboardingResultKind.INVITATION_CREATED)
    assertThat(result.hostOnboarding.emailDelivery.status).isEqualTo(PlatformAdminEmailDeliveryStatus.SENT)
    assertThat(mail.sent).hasSize(1)
    assertThat(mail.sent.single().email).isEqualTo("host@example.com")
    assertThat(mail.sent.single().acceptUrl).startsWith("https://app.example.com/clubs/new-club/invite/")
}
```

- [ ] **Step 3: Confirm both tests fail against the current transactional implementation**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.club.application.service.PlatformAdminOnboardingServiceTest
```

Expected before implementation: constructor mismatch until `TransactionTemplate` is introduced, or failure because email is sent before the simulated domain failure.

- [ ] **Step 4: Refactor `commit(...)` to use an explicit transaction block**

In `PlatformAdminOnboardingService`, add:

```kotlin
import org.springframework.transaction.support.TransactionTemplate
```

Add constructor parameter:

```kotlin
private val transactionTemplate: TransactionTemplate,
```

Remove `@Transactional` from `commit(...)`.

Change `commit(...)` to:

```kotlin
override fun commit(
    admin: CurrentPlatformAdmin,
    command: PlatformAdminOnboardingCommand,
): PlatformAdminOnboardingResult {
    requireOperator(admin)
    val normalized = normalize(command)
    rejectConflicts(normalized)

    val persisted =
        transactionTemplate.execute {
            persistOnboarding(admin, normalized)
        } ?: error("Platform admin onboarding transaction returned no result")

    val deliveryStatus = sendInvitationAfterCommit(persisted.pendingEmail)
    return persisted.toResult(deliveryStatus)
}
```

- [ ] **Step 5: Move database writes into `persistOnboarding(...)`**

Add these private data classes:

```kotlin
private data class PersistedOnboarding(
    val club: PlatformAdminClubListItem,
    val host: PersistedHostOnboarding,
    val domain: PlatformAdminClubDomain?,
    val pendingEmail: PendingHostInvitationEmail?,
) {
    fun toResult(deliveryStatus: PlatformAdminEmailDeliveryStatus): PlatformAdminOnboardingResult =
        PlatformAdminOnboardingResult(
            club = club,
            hostOnboarding = host.toResult(deliveryStatus),
            domain = domain,
        )
}

private data class PersistedHostOnboarding(
    val kind: HostOnboardingResultKind,
    val email: String,
    val userId: UUID?,
    val invitationId: UUID?,
    val acceptUrl: String?,
) {
    fun toResult(deliveryStatus: PlatformAdminEmailDeliveryStatus): PlatformAdminHostOnboardingResult =
        PlatformAdminHostOnboardingResult(
            kind = kind,
            email = email,
            userId = userId,
            invitationId = invitationId,
            acceptUrl = acceptUrl,
            emailDelivery = PlatformAdminEmailDeliveryResult(deliveryStatus),
        )
}

private data class PendingHostInvitationEmail(
    val email: String,
    val clubName: String,
    val acceptUrl: String,
)
```

Move the body of the current `commit(...)` into:

```kotlin
private fun persistOnboarding(
    admin: CurrentPlatformAdmin,
    normalized: PlatformAdminOnboardingCommand,
): PersistedOnboarding {
    val clubId = UUID.randomUUID()
    onboardingPort.createClub(
        CreatePlatformAdminClubCommand(
            clubId = clubId,
            slug = normalized.club.slug,
            name = normalized.club.name,
            tagline = normalized.club.tagline,
            about = normalized.club.about,
        ),
    )

    val host = createFirstHostWithoutEmail(admin, clubId, normalized)
    val domain = createDomainIfRequested(clubId, normalized)
    val club =
        loadClubsPort.loadClub(clubId)
            ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Created club not found")

    return PersistedOnboarding(
        club = club,
        host = host.host,
        domain = domain,
        pendingEmail = host.pendingEmail,
    )
}
```

- [ ] **Step 6: Split invitation creation from email sending**

Replace `createFirstHost(...)` with `createFirstHostWithoutEmail(...)` returning persisted host data:

```kotlin
private data class PersistedHostWithEmail(
    val host: PersistedHostOnboarding,
    val pendingEmail: PendingHostInvitationEmail?,
)

private fun createFirstHostWithoutEmail(
    admin: CurrentPlatformAdmin,
    clubId: UUID,
    command: PlatformAdminOnboardingCommand,
): PersistedHostWithEmail {
    val existingUser = onboardingPort.findUserByEmail(command.firstHost.email)
    if (existingUser != null) {
        if (command.existingUserConfirmation != EXISTING_USER_CONFIRMATION) {
            throw PlatformAdminException(
                PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED,
                "Existing user confirmation required",
            )
        }
        onboardingPort.upsertHostMembership(clubId, existingUser.userId, command.firstHost.name)
        return PersistedHostWithEmail(
            host = PersistedHostOnboarding(
                kind = HostOnboardingResultKind.EXISTING_USER_ASSIGNED,
                email = existingUser.email,
                userId = existingUser.userId,
                invitationId = null,
                acceptUrl = null,
            ),
            pendingEmail = null,
        )
    }

    val token = invitationTokenService.generateToken()
    val invitationId = UUID.randomUUID()
    onboardingPort.createHostInvitation(
        CreatePlatformAdminHostInvitationCommand(
            invitationId = invitationId,
            clubId = clubId,
            invitedByPlatformAdminUserId = admin.userId,
            email = command.firstHost.email,
            name = command.firstHost.name,
            tokenHash = invitationTokenService.hashToken(token),
            expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusDays(HOST_INVITATION_TTL_DAYS),
        ),
    )
    val acceptUrl = "${appBaseUrl.trimEnd('/')}/clubs/${command.club.slug}/invite/$token"
    return PersistedHostWithEmail(
        host = PersistedHostOnboarding(
            kind = HostOnboardingResultKind.INVITATION_CREATED,
            email = command.firstHost.email,
            userId = null,
            invitationId = invitationId,
            acceptUrl = acceptUrl,
        ),
        pendingEmail = PendingHostInvitationEmail(command.firstHost.email, command.club.name, acceptUrl),
    )
}
```

Add:

```kotlin
private fun sendInvitationAfterCommit(email: PendingHostInvitationEmail?): PlatformAdminEmailDeliveryStatus {
    if (email == null) {
        return PlatformAdminEmailDeliveryStatus.SKIPPED
    }
    return try {
        sendHostInvitationEmailPort.send(email.email, email.clubName, email.acceptUrl)
        PlatformAdminEmailDeliveryStatus.SENT
    } catch (_: Exception) {
        PlatformAdminEmailDeliveryStatus.FAILED
    }
}
```

- [ ] **Step 7: Extract domain creation without changing behavior**

Add:

```kotlin
private fun createDomainIfRequested(
    clubId: UUID,
    command: PlatformAdminOnboardingCommand,
): PlatformAdminClubDomain? =
    command.domain?.let {
        when (
            val result =
                createClubDomainPort.createClubDomain(
                    clubId = clubId,
                    hostname = it.hostname,
                    kind = it.kind,
                    isPrimary = false,
                )
        ) {
            is CreateClubDomainResult.Created -> result.domain
            CreateClubDomainResult.ClubNotFound -> throw PlatformAdminException(
                PlatformAdminError.CLUB_NOT_FOUND,
                "Club not found",
            )
            CreateClubDomainResult.DuplicateHostname -> throw PlatformAdminException(
                PlatformAdminError.CLUB_DOMAIN_CONFLICT,
                "Club domain hostname already exists",
            )
        }
    }
```

- [ ] **Step 8: Run platform admin tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.club.application.service.PlatformAdminOnboardingServiceTest
./server/gradlew -p server integrationTest \
  --tests com.readmates.club.api.PlatformAdminControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit this slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt \
  server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingServiceTest.kt
git commit -m "fix: send platform admin invitations after commit"
```

---

### Task 6: Treat Missing Redis Transcript As Expired Job

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`

- [ ] **Step 1: Add missing-transcript regression test**

In `RedisAiGenerationJobStoreTest`, add:

```kotlin
@Test
fun `load returns null and deletes stale keys when transcript key is missing`() {
    val record = record()
    store.save(record)
    store.saveResult(record.jobId, snapshot(), TokenUsage(1, 0, 1), BigDecimal("0.001"))
    redisTemplate.delete("aigen:job:${record.jobId}:transcript")

    val loaded = store.load(record.jobId)

    assertThat(loaded).isNull()
    assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isFalse()
    assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:result")).isFalse()
}
```

- [ ] **Step 2: Add transcript TTL refresh regression test**

Add:

```kotlin
@Test
fun `saveResult refreshes transcript ttl with hash and result ttl`() {
    val record = record()
    store.save(record)
    val transcriptKey = "aigen:job:${record.jobId}:transcript"
    redisTemplate.expire(transcriptKey, java.time.Duration.ofSeconds(1))

    store.saveResult(record.jobId, snapshot(), TokenUsage(100, 0, 200), BigDecimal("0.01"))

    val ttlSeconds = properties.job.redisTtl.seconds
    val transcriptTtl = redisTemplate.getExpire(transcriptKey, TimeUnit.SECONDS)
    assertThat(transcriptTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
}
```

Add the same shape for `patchItem(...)`:

```kotlin
@Test
fun `patchItem refreshes transcript ttl with hash and result ttl`() {
    val record = record()
    store.save(record)
    store.saveResult(record.jobId, snapshot(), TokenUsage(1, 0, 1), BigDecimal("0.001"))
    val transcriptKey = "aigen:job:${record.jobId}:transcript"
    redisTemplate.expire(transcriptKey, java.time.Duration.ofSeconds(1))

    store.patchItem(
        record.jobId,
        GenerationItem.SUMMARY,
        snapshot("patched summary"),
        TokenUsage(20, 0, 30),
        BigDecimal("0.005"),
    )

    val ttlSeconds = properties.job.redisTtl.seconds
    val transcriptTtl = redisTemplate.getExpire(transcriptKey, TimeUnit.SECONDS)
    assertThat(transcriptTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
}
```

- [ ] **Step 3: Confirm the new tests fail**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest
```

Expected before implementation: missing-transcript load returns a record with empty transcript, and TTL refresh assertions fail.

- [ ] **Step 4: Change `load(...)` to treat missing transcript as expired**

In `RedisAiGenerationJobStore.load(...)`, replace:

```kotlin
val transcript = redisTemplate.opsForValue().get(transcriptKey(jobId)) ?: ""
```

with:

```kotlin
val transcript =
    redisTemplate.opsForValue().get(transcriptKey(jobId))
        ?: return@runCatching deleteStaleJob(jobId)
```

Add:

```kotlin
private fun deleteStaleJob(jobId: UUID): JobRecord? {
    delete(jobId)
    return null
}
```

- [ ] **Step 5: Refresh transcript TTL in result patch script**

Change both `saveResult(...)` and `patchItem(...)` script invocations from:

```kotlin
listOf(hashKey(jobId), resultKey(jobId)),
```

to:

```kotlin
listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId)),
```

Update the Lua script comment:

```kotlin
* KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey
```

Add transcript TTL refresh to `PATCH_RESULT_SCRIPT`:

```lua
if redis.call('EXISTS', KEYS[3]) == 1 then
  redis.call('EXPIRE', KEYS[3], ARGV[6])
end
```

The final script body should include:

```kotlin
"""
redis.call('SET', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[6])
redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[2])
redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[3])
redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[4])
redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[6])
if redis.call('EXISTS', KEYS[3]) == 1 then
  redis.call('EXPIRE', KEYS[3], ARGV[6])
end
return nil
""".trimIndent()
```

- [ ] **Step 6: Re-run Redis job-store tests**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit this slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt
git commit -m "fix: expire AI jobs when Redis transcript is missing"
```

---

### Task 7: Clear Detekt Without Weakening The Gate

**Files:**
- Modify files reported by `server/build/reports/detekt/detekt.txt`
- Do not modify: `server/config/detekt/detekt.yml` unless a separate review approves a rule change

- [ ] **Step 1: Re-run detekt only**

Run:

```bash
./server/gradlew -p server detekt
```

Expected before this task: detekt still reports active findings not already closed by Tasks 2-6.

- [ ] **Step 2: Replace the long `publish(...)` parameter list with a command object**

In `AiGenerationJobQueue.kt`, add:

```kotlin
data class AiGenerationJobPublishCommand(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val provider: Provider,
    val model: String,
    val kind: JobKind,
)
```

Replace the port method:

```kotlin
fun publish(command: AiGenerationJobPublishCommand): Unit
```

Update `AiGenerationOrchestrator.start(...)`:

```kotlin
queue.publish(
    AiGenerationJobPublishCommand(
        jobId = jobId,
        sessionId = command.sessionId,
        clubId = command.clubId,
        hostUserId = command.hostUserId,
        provider = modelId.provider,
        model = modelId.name,
        kind = JobKind.FULL,
    ),
)
```

Update `AiGenerationJobProducer` and `FakeJobQueue` to accept the command object. Keep Kafka message serialization unchanged.

- [ ] **Step 3: Use targeted suppressions only where Spring DI or fixture builders are the real reason**

For `AiGenerationOrchestrator`, add a class annotation:

```kotlin
@Suppress("LongParameterList")
class AiGenerationOrchestrator(
```

Reason: the constructor is Spring dependency injection for a feature service and not a public call API.

For `AiGenerationTestFixtures.jobRecord(...)`, add:

```kotlin
@Suppress("LongParameterList")
fun jobRecord(
```

Reason: the helper is a named-argument test fixture builder.

For `AiGenerationWorker`, prefer extracting helpers first. If it still has more than 11 functions after extraction and all functions remain cohesive workflow steps, use:

```kotlin
@Suppress("LongParameterList", "TooManyFunctions")
class AiGenerationWorker(
```

Do not suppress `UseCheckOrError`; Tasks 2-3 must remove those findings by using typed exceptions.

- [ ] **Step 4: Replace AI config magic numbers with named constants**

In `AiGenerationProperties.kt`, add:

```kotlin
private const val DEFAULT_REDIS_TTL_HOURS = 6L
private const val DEFAULT_NOTIFICATION_LATENCY_SECONDS = 60L
```

Use:

```kotlin
val redisTtl: Duration = Duration.ofHours(DEFAULT_REDIS_TTL_HOURS)
val notificationLatencyThreshold: Duration = Duration.ofSeconds(DEFAULT_NOTIFICATION_LATENCY_SECONDS)
```

In `AiGenerationKafkaProperties.kt`, add:

```kotlin
private const val DEFAULT_SEND_TIMEOUT_SECONDS = 10L
```

Use:

```kotlin
val sendTimeout: Duration = Duration.ofSeconds(DEFAULT_SEND_TIMEOUT_SECONDS)
```

In `AiGenerationKafkaConfig.kt`, add:

```kotlin
private const val KAFKA_CLOSE_TIMEOUT_SECONDS = 5L
```

Use that constant anywhere the producer/consumer close timeout uses `5`.

- [ ] **Step 5: Remove the Micrometer spread operator**

In `AiGenerationMetrics.kt`, import:

```kotlin
import io.micrometer.core.instrument.Tag
```

Replace:

```kotlin
return Tags.of(*labels.flatMap { (label, value) -> listOf(label.tagKey, value) }.toTypedArray())
```

with:

```kotlin
return Tags.of(labels.map { (label, value) -> Tag.of(label.tagKey, value) })
```

- [ ] **Step 6: Fix generic exception catches in Kafka adapters**

In `AiGenerationJobProducer.kt`, replace the broad catch variable suppression with an explicit local suppression:

```kotlin
} catch (@Suppress("TooGenericExceptionCaught") ex: RuntimeException) {
```

If detekt still flags the catch, add a narrow suppression to the function that interacts with Kafka:

```kotlin
@Suppress("TooGenericExceptionCaught")
override fun publish(command: AiGenerationJobPublishCommand) {
```

In `AiGenerationJobConsumer.kt`, use the same pattern on the listener method that must catch runtime provider/worker failures to prevent consumer death.

- [ ] **Step 7: Refactor notification method length without changing behavior**

In `NotificationDeliveryPlanningOperations.deliveryRowsForRecipient(...)`, extract AI generation branch handling into:

```kotlin
private fun aiGenerationDeliveryRows(
    message: NotificationEventMessage,
    recipient: DeliveryRecipient,
): List<DeliveryInsertRow> =
    when (message.payload) {
        is NotificationEventPayload.AiGenerationCompleted ->
            aiGenerationCompletedRows(message, recipient)
        is NotificationEventPayload.AiGenerationFailed ->
            aiGenerationFailedRows(message, recipient)
        else -> emptyList()
    }
```

Keep existing non-AI event behavior byte-for-byte except for the extracted helper calls.

In `NotificationEmailTemplates.detailFor(...)`, move the AI generation event detail construction into:

```kotlin
private fun aiGenerationDetailFor(
    eventType: NotificationEventType,
    sessionId: UUID,
    sessionNumber: Int,
    bookTitle: String,
    clubSlug: String,
): EventEmailDetail =
    when (eventType) {
        NotificationEventType.AI_GENERATION_COMPLETED -> EventEmailDetail(
            label = "AI 생성 완료",
            title = "AI 세션 초안이 준비되었습니다",
            summary = "세션 #$sessionNumber '$bookTitle'의 AI 초안이 준비되었습니다.",
            ctaLabel = "초안 확인",
            ctaPath = "/clubs/$clubSlug/host/sessions/$sessionId/edit",
        )
        NotificationEventType.AI_GENERATION_FAILED -> EventEmailDetail(
            label = "AI 생성 실패",
            title = "AI 세션 초안 생성에 실패했습니다",
            summary = "세션 #$sessionNumber '$bookTitle'의 AI 초안 생성이 실패했습니다.",
            ctaLabel = "세션 편집",
            ctaPath = "/clubs/$clubSlug/host/sessions/$sessionId/edit",
        )
        else -> error("Unsupported AI generation email event: $eventType")
    }
```

Adjust exact Korean copy only if current template copy differs; preserve current copy over this example.

- [ ] **Step 8: Fix return-count findings in validators and defaults service**

Three functions trigger `ReturnCount` (default threshold 2): `DefaultSessionImportV1Validator.checkSchema` (7 returns), `DefaultSessionImportV1Validator.checkFeedbackTemplate` (3 returns), `ClubAiDefaultsService.resolveAllowlistedModel` (multiple returns).

For `checkSchema`, do NOT use `listOfNotNull` — it loses the current short-circuit behavior and the actual function evaluates 7 distinct branches (4 metadata + summary/feedback-filename/feedback-markdown). Use a `sequenceOf`-of-lazy-suppliers fold so the first failing check wins without forcing evaluation of the rest, and preserve the exact existing detail messages (e.g. `"format must equal '$FORMAT_CONST' (was '${snapshot.format}')"`, `"session metadata mismatch: sessionNumber (snapshot=..., expected=...)"`, etc.):

```kotlin
private fun checkSchema(
    snapshot: SessionImportV1Snapshot,
    meta: SessionMeta,
): ValidationResult.Violation? =
    sequenceOf<() -> ValidationResult.Violation?>(
        { if (snapshot.format != FORMAT_CONST) schemaInvalid("format must equal '$FORMAT_CONST' (was '${snapshot.format}')") else null },
        { if (snapshot.sessionNumber != meta.sessionNumber) schemaInvalid("session metadata mismatch: sessionNumber (snapshot=${snapshot.sessionNumber}, expected=${meta.sessionNumber})") else null },
        { if (snapshot.bookTitle != meta.bookTitle) schemaInvalid("session metadata mismatch: bookTitle") else null },
        { if (!snapshot.meetingDate.isEqual(meta.meetingDate)) schemaInvalid("session metadata mismatch: meetingDate") else null },
        { if (snapshot.summary.isBlank()) schemaInvalid("summary must not be blank") else null },
        { if (snapshot.feedbackDocumentFileName.isBlank()) schemaInvalid("feedbackDocumentFileName must not be blank") else null },
        { if (snapshot.feedbackDocumentMarkdown.isBlank()) schemaInvalid("feedbackDocumentMarkdown must not be blank") else null },
    ).mapNotNull { it.invoke() }.firstOrNull()
```

Apply the same shape to `checkFeedbackTemplate` (the marker check + the header check) so it returns at most once at the bottom:

```kotlin
private fun checkFeedbackTemplate(
    snapshot: SessionImportV1Snapshot,
    meta: SessionMeta,
): ValidationResult.Violation? {
    val markdown = snapshot.feedbackDocumentMarkdown
    val expectedHeader = "# 독서모임 ${meta.sessionNumber}차 피드백"
    val violation = when {
        !markdown.trimStart().startsWith(FEEDBACK_MARKER) ->
            ValidationResult.Violation(ErrorCode.FEEDBACK_TEMPLATE_INVALID, "feedbackDocumentMarkdown must start with '$FEEDBACK_MARKER'")
        !markdown.contains(expectedHeader) ->
            ValidationResult.Violation(ErrorCode.FEEDBACK_TEMPLATE_INVALID, "feedbackDocumentMarkdown must contain header '$expectedHeader'")
        else -> null
    }
    return violation
}
```

In `ClubAiDefaultsService.resolveAllowlistedModel(...)`, replace multiple returns with:

```kotlin
private fun resolveAllowlistedModel(name: String): ModelId? {
    val direct = modelCatalog.resolveAlias(name)
    val fallback = providerFromName(name)?.let { provider -> ModelId(provider, name) }
    return direct ?: fallback?.takeIf(modelCatalog::isEnabled)
}
```

- [ ] **Step 9: Fix max line length in listed AI files**

For each `MaxLineLength` finding in `detekt.txt`, split arguments instead of suppressing. Representative pattern:

```kotlin
methodAndPath(
    "POST",
    Regex("^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+/(regenerate|commit)$"),
)
```

For repeated regex literals, introduce:

```kotlin
private val AI_GENERATE_MUTATION_PATH =
    Regex("^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+/(regenerate|commit)$")
```

Then call:

```kotlin
methodAndPath("POST", AI_GENERATE_MUTATION_PATH)
```

- [ ] **Step 10: Clean unused mock properties**

For `RedisGenerationCostCountersTest` and `RedisAiGenerationJobStoreTest`, replace unused `@MockitoBean private lateinit var jobQueue` with a suppressed property:

```kotlin
@Suppress("UnusedPrivateProperty")
@MockitoBean
private lateinit var jobQueue: AiGenerationJobQueue
```

Only keep this if the mock is required for Spring context loading. If the context loads without it after current conditional properties, delete the mock instead.

- [ ] **Step 10b: Address remaining `AiGenerationWorker` findings**

`detekt.txt` reports `ReturnCount` at `AiGenerationWorker.process` (line 74) plus three `MagicNumber` findings (lines 83, 244, 318) and a `MaxLineLength` at `emitJobMetrics` (line 417). Extract the early-return branches in `process(...)` so it has a single exit, and introduce named constants at the class top for the literals (e.g. `private const val PROGRESS_PROVIDER_RUNNING_PCT = 5`, `private const val PROVIDER_RATE_LIMIT_BACKOFF_SECONDS = 5L`, `private const val PROGRESS_COMPLETE_PCT = 100`). Split the long `recordTokens(...)` line at the comma between arguments. The class is already annotated `@Suppress("LongParameterList", "TooManyFunctions")` per Step 3, so no further class-level suppression is needed.

- [ ] **Step 10c: Address `AiGenerationRegenerationService.kt:252` `MagicNumber`**

The same `5` literal in `retryStrategyFor` should reference the new `PROVIDER_RATE_LIMIT_BACKOFF_SECONDS` constant introduced in Step 10b (or a local equivalent inside this file's companion if shared placement is undesirable).

- [ ] **Step 10d: Address `SessionImportService` `TooManyFunctions`**

`SessionImportService.kt:32` exposes 12/11 functions. Extract one cohesive responsibility (e.g. preview helpers) into a private collaborator class within the same file or move private helper functions to top-level file-private functions to bring the count under the threshold. Do not change public behavior or move functions across packages.

- [ ] **Step 10e: Address `RedisGenerationCostCountersTest.kt:128` `UseCheckOrError`**

Replace `throw IllegalStateException("redis unavailable")` (used inside a fake) with `error("redis unavailable")` so the rule passes without changing test behavior.

- [ ] **Step 10f: Address `StubSessionContentGenerator` and `StubSessionContentRegenerator` `LongMethod`**

Both fixture builders exceed the 60-line ceiling because they construct a single, sequential snapshot. Extract the snapshot pieces (`summary`, `highlights`, `oneLineReviews`, `feedbackDocumentMarkdown`) into private helper functions inside the fixture file. Test consumers must not change.

- [ ] **Step 10g: Address remaining `MaxLineLength` findings in test files**

Split overly long method-and-path strings, metric tag literals, and method signatures listed at `AiGenerationSecurityConfigTest.kt:38`, `AiGenerationControllerTest.kt:478`, `MetricLabelsTest.kt:40`, `AiGenerationNotificationDispatcherTest.kt:29`, `AiGenerationMetricsTest.kt:52`, `AiGenerationMetricsTest.kt:103`. Either pull repeated regex literals into top-level `private val`s (matching Step 9's `AI_GENERATE_MUTATION_PATH` pattern) or break the lines at argument boundaries.

- [ ] **Step 10h: Address `MaxLineLength` findings in source files outside Step 9**

`ClaudeContentRegenerator.kt:112`, `OpenAiContentRegenerator.kt:117`, `RedisAiGenerationJobStore.kt:63`, `AiGenerationErrorHandler.kt:61` and `AiGenerationErrorHandler.kt:89` — split function call arguments at commas, or split annotation parameter lists, until each line fits the configured limit.

- [ ] **Step 11: Re-run detekt until clean**

Run:

```bash
./server/gradlew -p server detekt
```

Expected after cleanup: `BUILD SUCCESSFUL`.

- [ ] **Step 12: Run server check**

Run:

```bash
./server/gradlew -p server check
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 13: Commit this slice**

```bash
git add server/src/main/kotlin server/src/test/kotlin server/config/detekt/baseline.xml
git diff --cached -- server/config/detekt/baseline.xml
git commit -m "chore: clear backend static analysis gate"
```

If `server/config/detekt/baseline.xml` has no staged diff, the second command should show no output and the commit contains only source/test refactors.

---

### Task 8: Remove Frontend Validation Warning Noise

**Files:**
- Modify: `front/eslint.config.mjs`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`

- [ ] **Step 1: Ignore generated coverage artifacts**

In `front/eslint.config.mjs`, add `coverage/**` to `globalIgnores`:

```js
globalIgnores([
  "dist/**",
  "out/**",
  "build/**",
  "coverage/**",
  "test-results/**",
]),
```

- [ ] **Step 2: Wrap polling timer advances in `act(...)`**

In `useAiGenerationJob.test.tsx`, change the import:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
```

Replace each direct timer advance in polling tests:

```ts
await vi.advanceTimersByTimeAsync(2500);
```

with:

```ts
await act(async () => {
  await vi.advanceTimersByTimeAsync(2500);
});
```

Apply the same pattern to `advanceTimersByTimeAsync(0)`, `1000`, and `4500`.

- [ ] **Step 3: Run targeted frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test -- features/host/aigen/hooks/useAiGenerationJob.test.tsx
```

Expected: both pass without the generated coverage warning or React `act(...)` warnings.

- [ ] **Step 4: Commit this slice**

```bash
git add front/eslint.config.mjs front/features/host/aigen/hooks/useAiGenerationJob.test.tsx
git commit -m "test: quiet AI generation polling validation"
```

---

### Task 9: Add API-Level Regression Coverage For Typed AI Errors

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`

- [ ] **Step 1: Add disabled model API assertion**

The endpoint accepts a multipart with a `transcript` file part AND a JSON `body` part (see the existing lifecycle test at `AiGenerateApiIntegrationTest.kt:127`). Auth is `with(user(HOST_EMAIL))`. Mirror that shape exactly:

```kotlin
@Test
fun `start with unknown model returns typed AI disabled problem`() {
    val transcript = MockMultipartFile(
        "transcript",
        "transcript.txt",
        "text/plain",
        "Stub transcript content.".toByteArray(),
    )
    val body = MockMultipartFile(
        "body",
        "body.json",
        "application/json",
        """{"model":"not-allowlisted-model","authorNameMode":"real","instructions":null}""".toByteArray(),
    )

    mockMvc.multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
        file(transcript)
        file(body)
        with(user(HOST_EMAIL))
    }.andExpect {
        status { isServiceUnavailable() }
        jsonPath("$.code") { value("AI_DISABLED") }
        jsonPath("$.detail") { value("Requested model is not enabled") }
    }
}
```

The lifecycle test's `with(user(HOST_EMAIL))` helper and the `MockMultipartFile` import already exist in the file — reuse them rather than introducing cookie/BFF-secret headers, which are not the auth boundary for this integration test.

- [ ] **Step 2: Add commit override validation API assertion**

Use the existing full lifecycle helper pattern in `AiGenerateApiIntegrationTest`:

1. Start a job with a valid model.
2. Wait until status is `SUCCEEDED`.
3. POST commit with an override body containing an author outside the seeded session attendees.

Expected assertion. `DefaultSessionImportV1Validator.checkAuthorNames(...)` emits `"Unknown authorName(s) not in expectedAuthorNames: [Injected Person]"`, so match the prefix rather than asserting an exact-equals string:

```kotlin
.andExpect {
    status { isUnprocessableEntity() }
    jsonPath("$.code") { value("AUTHOR_NAME_MISMATCH") }
    jsonPath("$.detail") {
        value(org.hamcrest.Matchers.startsWith("Unknown authorName(s) not in expectedAuthorNames:"))
    }
}
```

The exact detail string is set by the validator — Task 3 must not change that wording, so the assertion is stable.

- [ ] **Step 3: Run targeted API integration**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit this slice**

```bash
git add server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt
git commit -m "test: cover typed AI generation API denials"
```

---

### Task 10: Refresh Release Evidence

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the full verification matrix**

Run:

```bash
git status --short --branch
git diff --check origin/main..HEAD
bash scripts/aigen-pii-check.sh
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
./server/gradlew -p server architectureTest
./server/gradlew -p server check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
pnpm design:check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all non-live checks pass.

- [ ] **Step 2: Run live provider smoke only when keys are present**

Check:

```bash
env | rg '^READMATES_AIGEN_(ANTHROPIC|OPENAI|GEMINI)_API_KEY='
```

If keys are present, run:

```bash
scripts/aigen-smoke-claude.sh
scripts/aigen-smoke-openai.sh
scripts/aigen-smoke-gemini.sh
```

If keys are absent, do not run the scripts and record them as skipped.

- [ ] **Step 3: Update `CHANGELOG.md` validation notes**

In `CHANGELOG.md`, update the current Unreleased validation section with exact outcomes. Use this shape:

```markdown
Validation refreshed on 2026-05-17:

- `git diff --check origin/main..HEAD` — pass.
- `bash scripts/aigen-pii-check.sh` — pass.
- `./server/gradlew -p server unitTest` — pass.
- `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest` — pass.
- `./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest` — pass.
- `./server/gradlew -p server architectureTest` — pass.
- `./server/gradlew -p server check` — pass.
- `pnpm --dir front lint` — pass.
- `pnpm --dir front test` — pass.
- `pnpm --dir front build` — pass.
- `pnpm --dir front test:e2e` — pass.
- `pnpm design:check` — pass.
- `./scripts/build-public-release-candidate.sh` — pass.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` — pass.
- Live Claude/OpenAI/Gemini smoke — skipped when provider API keys are absent from the local environment.
```

Do not claim live smoke passed unless it actually ran.

- [ ] **Step 4: Run docs/public safety checks on the changed release note**

Run:

```bash
git diff --check -- CHANGELOG.md
rg -n 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|READMATES_AIGEN_.*=' CHANGELOG.md
```

Expected:

- `git diff --check` has no output.
- `rg` has no output. Environment variable names without assigned values are allowed, but do not add key-looking examples.

- [ ] **Step 5: Commit this slice**

```bash
git add CHANGELOG.md
git commit -m "docs: refresh residual release validation"
```

---

## Final Verification And Review

- [ ] **Step 1: Confirm branch cleanliness**

Run:

```bash
git status --short --branch
```

Expected: clean except ahead count.

- [ ] **Step 2: Run release readiness checks again if any code changed after Task 10**

Run the same matrix from Task 10 Step 1.

- [ ] **Step 3: Review public safety**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: both pass.

- [ ] **Step 4: Prepare final handoff**

Final response must include:

- Changed surfaces: `server`, `front`, `docs`, `scripts` if touched by the implementation.
- Checks actually run and their outcomes.
- Live smoke skipped status with exact missing keys if not run.
- Remaining risk: none for local release gates if all matrix commands passed; provider smoke remains conditional until a keyed environment runs it.

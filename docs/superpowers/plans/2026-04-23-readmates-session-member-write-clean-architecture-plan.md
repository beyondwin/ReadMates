# ReadMates Session Member Write Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the session/member write flow behind use cases, typed application models, a `CurrentMember` argument resolver, and temporary persistence adapters while preserving existing API routes and response shapes.

**Architecture:** This is the first vertical slice of the server clean architecture migration. Controllers stop depending on `MemberAccountRepository`, `SessionRepository`, and `JdbcTemplate`; application services depend on inbound/outbound ports; adapter classes delegate to the existing JDBC repositories as a temporary bridge.

**Tech Stack:** Kotlin 2.2, Spring Boot 4, Spring MVC, Spring Security, JdbcTemplate bridge adapters, JUnit 5, Spring MockMvc, MySQL Testcontainers, Gradle.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-22-server-clean-architecture-design.md`
- Current architecture doc: `docs/development/architecture.md`
- Existing backend tests: `server/src/test/kotlin/com/readmates/session/api/*`, `server/src/test/kotlin/com/readmates/note/api/*`

## Scope Check

The clean architecture spec covers the whole server. This plan intentionally implements only the first vertical slice:

- Current member resolution for controllers
- Member current-session writes: RSVP, check-in, questions, one-line review, long review
- Host session writes: create/update/delete open session, attendance, publication
- Current session read only where needed to remove `SessionRepository` from the migrated controller set
- Boundary tests for the migrated packages

The plan does not migrate archive, public publication read APIs, feedback documents, invitations, member lifecycle, or OAuth internals. Those need separate implementation plans.

## Dirty Worktree Guardrails

At plan creation time, unrelated dirty files exist:

```text
 M front/src/app/route-continuity.ts
 M front/tests/e2e/google-auth-viewer.spec.ts
 M front/tests/unit/route-continuity.test.ts
 M front/tests/unit/spa-layout.test.tsx
?? front/tests/e2e/task10-final-qa.spec.ts
```

Implementation workers must not edit those files. If a task unexpectedly requires a dirty file, inspect `git diff -- <path>` first and preserve the existing changes.

## Target File Structure

### Current Member Resolution

- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`
  - Resolves `CurrentMember` by normalized email.
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/LoadCurrentMemberPort.kt`
  - Outbound port for current member lookup.
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
  - Implements the use case.
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcCurrentMemberAdapter.kt`
  - Temporary bridge to existing `MemberAccountRepository`.
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
  - Converts `Authentication` to `CurrentMember`.
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberWebConfig.kt`
  - Registers the resolver.
- Test: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`

### Session Member Writes

- Create: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt`
  - `UpdateRsvpCommand`, `SaveCheckinCommand`, `SaveQuestionCommand`, `ReplaceQuestionsCommand`, `SaveOneLineReviewCommand`, `SaveLongReviewCommand`.
- Create: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt`
  - `RsvpResult`, `CheckinResult`, `QuestionResult`, `ReplaceQuestionsResult`, `OneLineReviewResult`, `LongReviewResult`.
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/SessionMemberWriteUseCases.kt`
  - Inbound use case interfaces.
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`
  - Outbound write port.
- Create: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
  - Implements member write use cases.
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt`
  - Bridge to existing `SessionParticipationRepository`.
- Move/modify:
  - `server/src/main/kotlin/com/readmates/session/api/RsvpController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/RsvpController.kt`
  - `server/src/main/kotlin/com/readmates/note/api/CheckinController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt`
  - `server/src/main/kotlin/com/readmates/note/api/QuestionController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/QuestionController.kt`
  - `server/src/main/kotlin/com/readmates/note/api/ReviewController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/ReviewController.kt`

### Host Session Writes And Current Session Query

- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
  - Host command models.
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostDashboardResult.kt`
  - Application model for host dashboard data.
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
  - Host session inbound ports.
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
  - Outbound host write/query port for this slice.
- Create: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
  - Implements host session use cases.
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyHostSessionWriteAdapter.kt`
  - Bridge to existing `HostSessionRepository` and `HostSessionDeletionRepository`.
- Modify: `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt`
  - Accepts application command models instead of web request DTOs.
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/GetCurrentSessionUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/LoadCurrentSessionPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/CurrentSessionQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyCurrentSessionAdapter.kt`
- Move/modify:
  - `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/CurrentSessionController.kt`
  - `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
  - `server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt`
  - `server/src/main/kotlin/com/readmates/session/api/PublicationController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`
  - `server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostDashboardController.kt`

### Boundary Tests

- Create: `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`
  - Prevents migrated web controllers from depending on old repositories or JDBC.

## Task 1: Capture Baseline And Focused Test Status

**Files:**

- Read only: `server/src/test/kotlin/com/readmates/session/api/*`
- Read only: `server/src/test/kotlin/com/readmates/note/api/*`

- [x] **Step 1: Confirm current dirty files**

Run:

```bash
git status --short
```

Expected: Only unrelated frontend files should be dirty before this server plan starts. If server files are dirty, inspect them with:

```bash
git diff -- server
```

- [x] **Step 2: Run focused validation tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.RsvpControllerTest \
  --tests com.readmates.session.api.CurrentSessionControllerTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.note.api.CheckinControllerTest \
  --tests com.readmates.note.api.QuestionControllerTest \
  --tests com.readmates.note.api.ReviewControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS. If a test fails before changes, record the failure in this plan under a new `Baseline Failures` section before editing code.

Task 1 result on 2026-04-23: the new worktree status was clean, the focused validation command passed, and no `Baseline Failures` section was needed.

- [x] **Step 3: Commit only if baseline notes were added**

If Step 2 required adding baseline notes, commit the plan note:

```bash
git add -f docs/superpowers/plans/2026-04-23-readmates-session-member-write-clean-architecture-plan.md
git commit -m "docs: record session architecture baseline"
```

Expected: commit succeeds. If there were no baseline notes, do not commit.

Completion note: no baseline failure notes were added because the focused suite passed. This checkbox was still committed to satisfy the user-level requirement that each Task update plan checkboxes and produce a Task commit.

## Task 2: Add CurrentMember Use Case And Web Argument Resolver

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/LoadCurrentMemberPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcCurrentMemberAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberWebConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`

- [x] **Step 1: Write the argument resolver unit test**

Create `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`:

```kotlin
package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.context.request.ServletWebRequest
import java.util.UUID

class CurrentMemberArgumentResolverTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "member@example.com",
        displayName = "멤버",
        shortName = "멤버",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `supports CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val parameter = sampleMethodParameter("currentMemberEndpoint")

        assertTrue(resolver.supportsParameter(parameter))
    }

    @Test
    fun `does not support non CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val parameter = sampleMethodParameter("stringEndpoint")

        assertFalse(resolver.supportsParameter(parameter))
    }

    @Test
    fun `resolves authenticated member from principal email`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val request = MockHttpServletRequest()
        val authentication = UsernamePasswordAuthenticationToken("member@example.com", "password")
        request.userPrincipal = authentication

        val resolved = resolver.resolveArgument(
            sampleMethodParameter("currentMemberEndpoint"),
            null,
            ServletWebRequest(request),
            null,
        )

        assertEquals(member, resolved)
    }

    private fun currentMemberEndpoint(member: CurrentMember) = member

    private fun stringEndpoint(value: String) = value

    private fun sampleMethodParameter(methodName: String): MethodParameter {
        val method = this::class.java.declaredMethods.first { it.name == methodName }
        return MethodParameter(method, 0)
    }

    private class FakeResolveCurrentMemberUseCase(
        private val member: CurrentMember?,
    ) : ResolveCurrentMemberUseCase {
        override fun resolveByEmail(email: String): CurrentMember? = member
    }
}
```

- [x] **Step 2: Run the resolver test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest
```

Expected: FAIL because `ResolveCurrentMemberUseCase` and `CurrentMemberArgumentResolver` do not exist.

- [x] **Step 3: Add the inbound and outbound ports**

Create `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`:

```kotlin
package com.readmates.auth.application.port.`in`

import com.readmates.shared.security.CurrentMember

interface ResolveCurrentMemberUseCase {
    fun resolveByEmail(email: String): CurrentMember?
}
```

Create `server/src/main/kotlin/com/readmates/auth/application/port/out/LoadCurrentMemberPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember

interface LoadCurrentMemberPort {
    fun loadActiveMemberByEmail(email: String): CurrentMember?
}
```

- [x] **Step 4: Add the application service**

Create `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`:

```kotlin
package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class ResolveCurrentMemberService(
    private val loadCurrentMemberPort: LoadCurrentMemberPort,
) : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? =
        loadCurrentMemberPort.loadActiveMemberByEmail(email)
}
```

- [x] **Step 5: Add the temporary persistence adapter**

Create `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcCurrentMemberAdapter.kt`:

```kotlin
package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class JdbcCurrentMemberAdapter(
    private val memberAccountRepository: MemberAccountRepository,
) : LoadCurrentMemberPort {
    override fun loadActiveMemberByEmail(email: String): CurrentMember? =
        memberAccountRepository.findActiveMemberByEmail(email)
}
```

- [x] **Step 6: Add the argument resolver**

Create `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`:

```kotlin
package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import org.springframework.web.server.ResponseStatusException

class CurrentMemberArgumentResolver(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
) : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        parameter.parameterType == CurrentMember::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): CurrentMember {
        val request = webRequest.getNativeRequest(HttpServletRequest::class.java)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val authentication = request.userPrincipal as? Authentication
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val email = authentication.emailOrNull()
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return resolveCurrentMemberUseCase.resolveByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
```

- [x] **Step 7: Register the argument resolver**

Create `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberWebConfig.kt`:

```kotlin
package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class CurrentMemberWebConfig(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
) : WebMvcConfigurer {
    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase))
    }
}
```

- [x] **Step 8: Run the resolver test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest
```

Expected: PASS.

- [x] **Step 9: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt \
  server/src/main/kotlin/com/readmates/auth/application/port/out/LoadCurrentMemberPort.kt \
  server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcCurrentMemberAdapter.kt \
  server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt \
  server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberWebConfig.kt \
  server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt
git commit -m "refactor: add current member resolver port"
```

Expected: commit succeeds.

## Task 3: Add Session Member Write Use Cases And Bridge Adapter

**Files:**

- Create: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/SessionMemberWriteUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt`

- [x] **Step 1: Write the application service test**

Create `server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt`:

```kotlin
package com.readmates.session.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.out.SessionParticipationWritePort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class SessionMemberWriteServiceTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "member@example.com",
        displayName = "멤버",
        shortName = "멤버",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `delegates rsvp update to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.updateRsvp(UpdateRsvpCommand(member, "GOING"))

        assertEquals("GOING", result.status)
        assertEquals("updateRsvp:GOING", port.calls.single())
    }

    @Test
    fun `delegates checkin save to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.saveCheckin(SaveCheckinCommand(member, 80, "메모"))

        assertEquals(80, result.readingProgress)
        assertEquals("메모", result.note)
        assertEquals("saveCheckin:80:메모", port.calls.single())
    }

    @Test
    fun `delegates question replacement to write port`() {
        val port = RecordingSessionParticipationWritePort()
        val service = SessionMemberWriteService(port)

        val result = service.replaceQuestions(
            ReplaceQuestionsCommand(member, listOf("첫 질문", "둘째 질문")),
        )

        assertEquals(listOf("첫 질문", "둘째 질문"), result.questions.map { it.text })
        assertEquals("replaceQuestions:첫 질문|둘째 질문", port.calls.single())
    }

    private class RecordingSessionParticipationWritePort : SessionParticipationWritePort {
        val calls = mutableListOf<String>()

        override fun updateRsvp(command: UpdateRsvpCommand) =
            com.readmates.session.application.model.RsvpResult(command.status)
                .also { calls += "updateRsvp:${command.status}" }

        override fun saveCheckin(command: SaveCheckinCommand) =
            com.readmates.session.application.model.CheckinResult(command.readingProgress, command.note)
                .also { calls += "saveCheckin:${command.readingProgress}:${command.note}" }

        override fun saveQuestion(command: SaveQuestionCommand) =
            com.readmates.session.application.model.QuestionResult(command.priority, command.text, command.draftThought)
                .also { calls += "saveQuestion:${command.priority}:${command.text}" }

        override fun replaceQuestions(command: ReplaceQuestionsCommand) =
            ReplaceQuestionsResult(command.texts.mapIndexed { index, text ->
                com.readmates.session.application.model.QuestionResult(index + 1, text, null)
            }).also { calls += "replaceQuestions:${command.texts.joinToString("|")}" }

        override fun saveOneLineReview(command: com.readmates.session.application.model.SaveOneLineReviewCommand) =
            com.readmates.session.application.model.OneLineReviewResult(command.text)

        override fun saveLongReview(command: com.readmates.session.application.model.SaveLongReviewCommand) =
            com.readmates.session.application.model.LongReviewResult(command.body)
    }
}
```

- [x] **Step 2: Run the service test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.SessionMemberWriteServiceTest
```

Expected: FAIL because the command, port, and service classes do not exist.

- [x] **Step 3: Add command models**

Create `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt`:

```kotlin
package com.readmates.session.application.model

import com.readmates.shared.security.CurrentMember

data class UpdateRsvpCommand(
    val member: CurrentMember,
    val status: String,
)

data class SaveCheckinCommand(
    val member: CurrentMember,
    val readingProgress: Int,
    val note: String,
)

data class SaveQuestionCommand(
    val member: CurrentMember,
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsCommand(
    val member: CurrentMember,
    val texts: List<String>,
)

data class SaveOneLineReviewCommand(
    val member: CurrentMember,
    val text: String,
)

data class SaveLongReviewCommand(
    val member: CurrentMember,
    val body: String,
)
```

- [x] **Step 4: Add result models**

Create `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt`:

```kotlin
package com.readmates.session.application.model

data class RsvpResult(
    val status: String,
)

data class CheckinResult(
    val readingProgress: Int,
    val note: String,
)

data class QuestionResult(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsResult(
    val questions: List<QuestionResult>,
)

data class OneLineReviewResult(
    val text: String,
)

data class LongReviewResult(
    val body: String,
)
```

- [x] **Step 5: Add inbound use case interfaces**

Create `server/src/main/kotlin/com/readmates/session/application/port/in/SessionMemberWriteUseCases.kt`:

```kotlin
package com.readmates.session.application.port.`in`

import com.readmates.session.application.model.CheckinResult
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.RsvpResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand

interface UpdateRsvpUseCase {
    fun updateRsvp(command: UpdateRsvpCommand): RsvpResult
}

interface SaveCheckinUseCase {
    fun saveCheckin(command: SaveCheckinCommand): CheckinResult
}

interface SaveQuestionUseCase {
    fun saveQuestion(command: SaveQuestionCommand): QuestionResult
}

interface ReplaceQuestionsUseCase {
    fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult
}

interface SaveReviewUseCase {
    fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult
    fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult
}
```

- [x] **Step 6: Add outbound write port**

Create `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`:

```kotlin
package com.readmates.session.application.port.out

import com.readmates.session.application.model.CheckinResult
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.RsvpResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand

interface SessionParticipationWritePort {
    fun updateRsvp(command: UpdateRsvpCommand): RsvpResult
    fun saveCheckin(command: SaveCheckinCommand): CheckinResult
    fun saveQuestion(command: SaveQuestionCommand): QuestionResult
    fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult
    fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult
    fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult
}
```

- [x] **Step 7: Add application service**

Create `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`:

```kotlin
package com.readmates.session.application.service

import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.`in`.ReplaceQuestionsUseCase
import com.readmates.session.application.port.`in`.SaveCheckinUseCase
import com.readmates.session.application.port.`in`.SaveQuestionUseCase
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.session.application.port.`in`.UpdateRsvpUseCase
import com.readmates.session.application.port.out.SessionParticipationWritePort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SessionMemberWriteService(
    private val writePort: SessionParticipationWritePort,
) : UpdateRsvpUseCase,
    SaveCheckinUseCase,
    SaveQuestionUseCase,
    ReplaceQuestionsUseCase,
    SaveReviewUseCase {
    @Transactional
    override fun updateRsvp(command: UpdateRsvpCommand) =
        writePort.updateRsvp(command)

    @Transactional
    override fun saveCheckin(command: SaveCheckinCommand) =
        writePort.saveCheckin(command)

    @Transactional
    override fun saveQuestion(command: SaveQuestionCommand) =
        writePort.saveQuestion(command)

    @Transactional
    override fun replaceQuestions(command: ReplaceQuestionsCommand) =
        writePort.replaceQuestions(command)

    @Transactional
    override fun saveOneLineReview(command: SaveOneLineReviewCommand) =
        writePort.saveOneLineReview(command)

    @Transactional
    override fun saveLongReview(command: SaveLongReviewCommand) =
        writePort.saveLongReview(command)
}
```

- [x] **Step 8: Add legacy adapter**

Create `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt`:

```kotlin
package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.SessionParticipationRepository
import com.readmates.session.application.model.CheckinResult
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionsResult
import com.readmates.session.application.model.RsvpResult
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.out.SessionParticipationWritePort
import org.springframework.stereotype.Component

@Component
class LegacySessionParticipationWriteAdapter(
    private val repository: SessionParticipationRepository,
) : SessionParticipationWritePort {
    override fun updateRsvp(command: UpdateRsvpCommand): RsvpResult {
        val result = repository.updateRsvp(command.member, command.status)
        return RsvpResult(status = result.getValue("status"))
    }

    override fun saveCheckin(command: SaveCheckinCommand): CheckinResult {
        val result = repository.saveCheckin(command.member, command.readingProgress, command.note)
        return CheckinResult(
            readingProgress = result.getValue("readingProgress") as Int,
            note = result.getValue("note") as String,
        )
    }

    override fun saveQuestion(command: SaveQuestionCommand): QuestionResult {
        val result = repository.saveQuestion(command.member, command.priority, command.text, command.draftThought)
        return QuestionResult(
            priority = result.getValue("priority") as Int,
            text = result.getValue("text") as String,
            draftThought = result["draftThought"] as String?,
        )
    }

    override fun replaceQuestions(command: ReplaceQuestionsCommand): ReplaceQuestionsResult {
        repository.replaceQuestions(command.member, command.texts)
        return ReplaceQuestionsResult(
            questions = command.texts.mapIndexed { index, text ->
                QuestionResult(priority = index + 1, text = text.trim(), draftThought = null)
            },
        )
    }

    override fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult {
        val result = repository.saveOneLineReview(command.member, command.text)
        return OneLineReviewResult(text = result.getValue("text"))
    }

    override fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult {
        val result = repository.saveLongReview(command.member, command.body)
        return LongReviewResult(body = result.getValue("body"))
    }
}
```

- [x] **Step 9: Run the service test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.SessionMemberWriteServiceTest
```

Expected: PASS.

- [x] **Step 10: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt \
  server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt \
  server/src/main/kotlin/com/readmates/session/application/port/in/SessionMemberWriteUseCases.kt \
  server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt \
  server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt \
  server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt
git commit -m "refactor: add session member write use cases"
```

Expected: commit succeeds.

## Task 4: Move Member Write Controllers To Web Adapters

**Files:**

- Move/modify: `server/src/main/kotlin/com/readmates/session/api/RsvpController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/RsvpController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/note/api/CheckinController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/note/api/QuestionController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/QuestionController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/note/api/ReviewController.kt` -> `server/src/main/kotlin/com/readmates/note/adapter/in/web/ReviewController.kt`
- Modify tests package declarations:
  - `server/src/test/kotlin/com/readmates/session/api/RsvpControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/note/api/CheckinControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/note/api/ReviewControllerTest.kt`

- [x] **Step 1: Move controller files**

Run:

```bash
mkdir -p server/src/main/kotlin/com/readmates/session/adapter/in/web
mkdir -p server/src/main/kotlin/com/readmates/note/adapter/in/web
git mv server/src/main/kotlin/com/readmates/session/api/RsvpController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/RsvpController.kt
git mv server/src/main/kotlin/com/readmates/note/api/CheckinController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt
git mv server/src/main/kotlin/com/readmates/note/api/QuestionController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/QuestionController.kt
git mv server/src/main/kotlin/com/readmates/note/api/ReviewController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/ReviewController.kt
```

Expected: files are moved.

- [x] **Step 2: Replace `RsvpController` content**

Edit `server/src/main/kotlin/com/readmates/session/adapter/in/web/RsvpController.kt`:

```kotlin
package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.`in`.UpdateRsvpUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Pattern
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class UpdateRsvpRequest(
    @field:Pattern(regexp = "NO_RESPONSE|GOING|MAYBE|DECLINED")
    val status: String,
) {
    fun toCommand(member: CurrentMember): UpdateRsvpCommand =
        UpdateRsvpCommand(member = member, status = status)
}

data class RsvpResponse(
    val status: String,
)

@RestController
@RequestMapping("/api/sessions/current/rsvp")
class RsvpController(
    private val updateRsvpUseCase: UpdateRsvpUseCase,
) {
    @PatchMapping
    fun update(
        member: CurrentMember,
        @Valid @RequestBody request: UpdateRsvpRequest,
    ): RsvpResponse {
        val result = updateRsvpUseCase.updateRsvp(request.toCommand(member))
        return RsvpResponse(status = result.status)
    }
}
```

- [x] **Step 3: Replace `CheckinController` content**

Edit `server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt`:

```kotlin
package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.port.`in`.SaveCheckinUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CheckinRequest(
    @field:Min(0) @field:Max(100) val readingProgress: Int,
    @field:NotBlank val note: String,
) {
    fun toCommand(member: CurrentMember): SaveCheckinCommand =
        SaveCheckinCommand(member = member, readingProgress = readingProgress, note = note)
}

data class CheckinResponse(
    val readingProgress: Int,
    val note: String,
)

@RestController
@RequestMapping("/api/sessions/current/checkin")
class CheckinController(
    private val saveCheckinUseCase: SaveCheckinUseCase,
) {
    @PutMapping
    fun update(
        member: CurrentMember,
        @Valid @RequestBody request: CheckinRequest,
    ): CheckinResponse {
        val result = saveCheckinUseCase.saveCheckin(request.toCommand(member))
        return CheckinResponse(result.readingProgress, result.note)
    }
}
```

- [x] **Step 4: Replace `QuestionController` content**

Edit `server/src/main/kotlin/com/readmates/note/adapter/in/web/QuestionController.kt`:

```kotlin
package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.port.`in`.ReplaceQuestionsUseCase
import com.readmates.session.application.port.`in`.SaveQuestionUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class CreateQuestionRequest(
    @field:Min(1) @field:Max(5) val priority: Int,
    @field:NotBlank val text: String,
    val draftThought: String?,
) {
    fun toCommand(member: CurrentMember): SaveQuestionCommand =
        SaveQuestionCommand(member, priority, text, draftThought)
}

data class ReplaceQuestionsRequest(
    val questions: List<ReplaceQuestionItem> = emptyList(),
) {
    fun toCommand(member: CurrentMember): ReplaceQuestionsCommand =
        ReplaceQuestionsCommand(member, questions.map { it.text })
}

data class ReplaceQuestionItem(
    val text: String,
)

data class QuestionResponse(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsResponse(
    val questions: List<QuestionResponse>,
)

@RestController
@RequestMapping("/api/sessions/current/questions")
class QuestionController(
    private val saveQuestionUseCase: SaveQuestionUseCase,
    private val replaceQuestionsUseCase: ReplaceQuestionsUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        member: CurrentMember,
        @Valid @RequestBody request: CreateQuestionRequest,
    ): QuestionResponse {
        val result = saveQuestionUseCase.saveQuestion(request.toCommand(member))
        return QuestionResponse(result.priority, result.text, result.draftThought)
    }

    @PutMapping
    fun replace(
        member: CurrentMember,
        @RequestBody request: ReplaceQuestionsRequest,
    ): ReplaceQuestionsResponse {
        val result = replaceQuestionsUseCase.replaceQuestions(request.toCommand(member))
        return ReplaceQuestionsResponse(
            questions = result.questions.map { QuestionResponse(it.priority, it.text, it.draftThought) },
        )
    }
}
```

- [x] **Step 5: Replace `ReviewController` content**

Edit `server/src/main/kotlin/com/readmates/note/adapter/in/web/ReviewController.kt`:

```kotlin
package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class OneLineReviewRequest(@field:NotBlank val text: String) {
    fun toCommand(member: CurrentMember): SaveOneLineReviewCommand =
        SaveOneLineReviewCommand(member, text)
}

data class LongReviewRequest(@field:NotBlank val body: String) {
    fun toCommand(member: CurrentMember): SaveLongReviewCommand =
        SaveLongReviewCommand(member, body)
}

data class OneLineReviewResponse(val text: String)
data class LongReviewResponse(val body: String)

@RestController
@RequestMapping("/api/sessions/current")
class ReviewController(
    private val saveReviewUseCase: SaveReviewUseCase,
) {
    @PostMapping("/one-line-reviews")
    fun saveOneLine(
        member: CurrentMember,
        @Valid @RequestBody request: OneLineReviewRequest,
    ): OneLineReviewResponse {
        val result = saveReviewUseCase.saveOneLineReview(request.toCommand(member))
        return OneLineReviewResponse(result.text)
    }

    @PostMapping("/reviews")
    fun saveLong(
        member: CurrentMember,
        @Valid @RequestBody request: LongReviewRequest,
    ): LongReviewResponse {
        val result = saveReviewUseCase.saveLongReview(request.toCommand(member))
        return LongReviewResponse(result.body)
    }
}
```

- [x] **Step 6: Update test package declarations**

Edit these test files so their package declarations match moved controllers:

```kotlin
package com.readmates.session.adapter.`in`.web
```

for `server/src/test/kotlin/com/readmates/session/api/RsvpControllerTest.kt`.

Use this package:

```kotlin
package com.readmates.note.adapter.`in`.web
```

for `CheckinControllerTest.kt`, `QuestionControllerTest.kt`, and `ReviewControllerTest.kt`.

Do not move DB integration tests in this task; their package can remain as-is because they hit HTTP routes through MockMvc.

- [x] **Step 7: Run member write controller tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.adapter.in.web.RsvpControllerTest \
  --tests com.readmates.note.adapter.in.web.CheckinControllerTest \
  --tests com.readmates.note.adapter.in.web.QuestionControllerTest \
  --tests com.readmates.note.adapter.in.web.ReviewControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS.

- [x] **Step 8: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/adapter/in/web/RsvpController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/QuestionController.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/ReviewController.kt \
  server/src/test/kotlin/com/readmates/session/api/RsvpControllerTest.kt \
  server/src/test/kotlin/com/readmates/note/api/CheckinControllerTest.kt \
  server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt \
  server/src/test/kotlin/com/readmates/note/api/ReviewControllerTest.kt
git add -u server/src/main/kotlin/com/readmates/session/api/RsvpController.kt \
  server/src/main/kotlin/com/readmates/note/api/CheckinController.kt \
  server/src/main/kotlin/com/readmates/note/api/QuestionController.kt \
  server/src/main/kotlin/com/readmates/note/api/ReviewController.kt
git commit -m "refactor: route member writes through use cases"
```

Expected: commit succeeds.

## Task 5: Add Host Session Use Cases And Bridge Adapter

**Files:**

- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostDashboardResult.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyHostSessionWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionCommandServiceTest.kt`

- [ ] **Step 1: Add command models**

Create `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`:

```kotlin
package com.readmates.session.application.model

import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class HostSessionCommand(
    val host: CurrentMember,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String?,
    val endTime: String?,
    val questionDeadlineAt: String?,
    val locationLabel: String?,
    val meetingUrl: String?,
    val meetingPasscode: String?,
)

data class HostSessionIdCommand(
    val host: CurrentMember,
    val sessionId: UUID,
)

data class UpdateHostSessionCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val session: HostSessionCommand,
)

data class AttendanceEntryCommand(
    val membershipId: String,
    val attendanceStatus: String,
)

data class ConfirmAttendanceCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val entries: List<AttendanceEntryCommand>,
)

data class UpsertPublicationCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val publicSummary: String,
    val isPublic: Boolean,
)
```

- [ ] **Step 2: Add dashboard result model**

Create `server/src/main/kotlin/com/readmates/session/application/model/HostDashboardResult.kt`:

```kotlin
package com.readmates.session.application.model

data class HostDashboardResult(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
    val currentSessionMissingMemberCount: Int = 0,
    val currentSessionMissingMembers: List<HostDashboardMissingMemberResult> = emptyList(),
)

data class HostDashboardMissingMemberResult(
    val membershipId: String,
    val displayName: String,
    val email: String,
)
```

- [ ] **Step 3: Add inbound use cases**

Create `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`:

```kotlin
package com.readmates.session.application.port.`in`

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.shared.security.CurrentMember

interface ManageHostSessionUseCase {
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
}

interface ConfirmAttendanceUseCase {
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
}

interface UpsertPublicationUseCase {
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
}

interface GetHostDashboardUseCase {
    fun dashboard(host: CurrentMember): HostDashboardResult
}
```

- [ ] **Step 4: Add outbound host port**

Create `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`:

```kotlin
package com.readmates.session.application.port.out

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.shared.security.CurrentMember

interface HostSessionWritePort {
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
    fun dashboard(host: CurrentMember): HostDashboardResult
}
```

- [ ] **Step 5: Add host command service**

Create `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`:

```kotlin
package com.readmates.session.application.service

import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.ManageHostSessionUseCase
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionCommandService(
    private val port: HostSessionWritePort,
) : ManageHostSessionUseCase,
    ConfirmAttendanceUseCase,
    UpsertPublicationUseCase,
    GetHostDashboardUseCase {
    @Transactional
    override fun create(command: HostSessionCommand) = port.create(command)

    override fun detail(command: HostSessionIdCommand) = port.detail(command)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) = port.update(command)

    override fun deletionPreview(command: HostSessionIdCommand) = port.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) = port.delete(command)

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) = port.confirmAttendance(command)

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) = port.upsertPublication(command)

    override fun dashboard(host: CurrentMember) = port.dashboard(host)
}
```

- [ ] **Step 6: Change legacy host repository signatures to application commands**

Modify `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt` imports:

```kotlin
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardMissingMemberResult
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
```

Remove these imports from `HostSessionRepository.kt`:

```kotlin
import com.readmates.session.api.AttendanceEntry
import com.readmates.session.api.HostDashboardMissingMember
import com.readmates.session.api.HostDashboardResponse
import com.readmates.session.api.HostSessionRequest
import com.readmates.session.api.PublicationRequest
```

Update the public signatures:

```kotlin
fun createOpenSession(host: CurrentMember, request: HostSessionCommand): CreatedSessionResponse

fun hostDashboard(member: CurrentMember): HostDashboardResult

fun updateHostSession(
    member: CurrentMember,
    sessionId: UUID,
    request: HostSessionCommand,
): HostSessionDetailResponse

fun confirmAttendance(
    command: ConfirmAttendanceCommand,
): HostAttendanceResponse

fun upsertPublication(
    command: UpsertPublicationCommand,
): HostPublicationResponse
```

Inside `confirmAttendance`, replace `member` and `entries` references with command fields:

```kotlin
requireHostSession(command.host, command.sessionId)
val jdbcTemplate = jdbcTemplate()
command.entries.forEach { entry: AttendanceEntryCommand ->
    val membershipId = parseMembershipId(entry.membershipId)
    val updated = jdbcTemplate.update(
        """
        update session_participants
        set attendance_status = ?,
            updated_at = utc_timestamp(6)
        where session_id = ?
          and club_id = ?
          and membership_id = ?
          and participation_status = 'ACTIVE'
        """.trimIndent(),
        entry.attendanceStatus,
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
        membershipId.dbString(),
    )
    if (updated == 0) {
        throw HostSessionParticipantNotFoundException()
    }
}

return HostAttendanceResponse(
    sessionId = command.sessionId.toString(),
    count = command.entries.size,
)
```

Inside `upsertPublication`, replace `member`, `sessionId`, and `request` references with command fields:

```kotlin
requireHostSession(command.host, command.sessionId)
val jdbcTemplate = jdbcTemplate()
jdbcTemplate.update(
    """
    insert into public_session_publications (
      id,
      club_id,
      session_id,
      public_summary,
      is_public,
      published_at
    )
    values (
      ?,
      ?,
      ?,
      ?,
      ?,
      case when ? then utc_timestamp(6) else null end
    )
    on duplicate key update
      public_summary = values(public_summary),
      is_public = values(is_public),
      published_at = values(published_at),
      updated_at = utc_timestamp(6)
    """.trimIndent(),
    UUID.randomUUID().dbString(),
    command.host.clubId.dbString(),
    command.sessionId.dbString(),
    command.publicSummary,
    command.isPublic,
    command.isPublic,
)
```

Map dashboard rows to application result types:

```kotlin
HostDashboardResult(
    rsvpPending = currentMetrics.rsvpPending,
    checkinMissing = currentMetrics.checkinMissing,
    publishPending = publishPending,
    feedbackPending = feedbackPending,
    currentSessionMissingMemberCount = currentSessionMissingMembers.size,
    currentSessionMissingMembers = currentSessionMissingMembers,
)
```

and:

```kotlin
HostDashboardMissingMemberResult(
    membershipId = resultSet.uuid("membership_id").toString(),
    displayName = resultSet.getString("display_name"),
    email = resultSet.getString("email"),
)
```

- [ ] **Step 7: Add legacy host adapter**

Create `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyHostSessionWriteAdapter.kt`:

```kotlin
package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDeletionRepository
import com.readmates.session.application.HostSessionRepository
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class LegacyHostSessionWriteAdapter(
    private val hostSessionRepository: HostSessionRepository,
    private val hostSessionDeletionRepository: HostSessionDeletionRepository,
) : HostSessionWritePort {
    override fun create(command: HostSessionCommand) =
        hostSessionRepository.createOpenSession(command.host, command)

    override fun detail(command: HostSessionIdCommand) =
        hostSessionRepository.findHostSession(command.host, command.sessionId)

    override fun update(command: UpdateHostSessionCommand) =
        hostSessionRepository.updateHostSession(command.host, command.sessionId, command.session)

    override fun deletionPreview(command: HostSessionIdCommand) =
        hostSessionDeletionRepository.previewOpenSessionDeletion(command.host, command.sessionId)

    override fun delete(command: HostSessionIdCommand) =
        hostSessionDeletionRepository.deleteOpenHostSession(command.host, command.sessionId)

    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        hostSessionRepository.confirmAttendance(command)

    override fun upsertPublication(command: UpsertPublicationCommand) =
        hostSessionRepository.upsertPublication(command)

    override fun dashboard(host: CurrentMember) =
        hostSessionRepository.hostDashboard(host)
}
```

- [ ] **Step 8: Run compilation-focused tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: PASS. The new adapter compiles while controllers still use legacy packages.

- [ ] **Step 9: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt \
  server/src/main/kotlin/com/readmates/session/application/model/HostDashboardResult.kt \
  server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt \
  server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt \
  server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyHostSessionWriteAdapter.kt \
  server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt
git commit -m "refactor: add host session use cases"
```

Expected: commit succeeds.

## Task 6: Move Host And Current Session Controllers To Web Adapters

**Files:**

- Move/modify: `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/CurrentSessionController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/session/api/PublicationController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`
- Move/modify: `server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt` -> `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostDashboardController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/GetCurrentSessionUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/LoadCurrentSessionPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/CurrentSessionQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyCurrentSessionAdapter.kt`

- [ ] **Step 1: Add current session use case**

Create `server/src/main/kotlin/com/readmates/session/application/port/in/GetCurrentSessionUseCase.kt`:

```kotlin
package com.readmates.session.application.port.`in`

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.shared.security.CurrentMember

interface GetCurrentSessionUseCase {
    fun currentSession(member: CurrentMember): CurrentSessionPayload
}
```

Create `server/src/main/kotlin/com/readmates/session/application/port/out/LoadCurrentSessionPort.kt`:

```kotlin
package com.readmates.session.application.port.out

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.shared.security.CurrentMember

interface LoadCurrentSessionPort {
    fun loadCurrentSession(member: CurrentMember): CurrentSessionPayload
}
```

Create `server/src/main/kotlin/com/readmates/session/application/service/CurrentSessionQueryService.kt`:

```kotlin
package com.readmates.session.application.service

import com.readmates.session.application.port.`in`.GetCurrentSessionUseCase
import com.readmates.session.application.port.out.LoadCurrentSessionPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class CurrentSessionQueryService(
    private val port: LoadCurrentSessionPort,
) : GetCurrentSessionUseCase {
    override fun currentSession(member: CurrentMember) =
        port.loadCurrentSession(member)
}
```

Create `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyCurrentSessionAdapter.kt`:

```kotlin
package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CurrentSessionRepository
import com.readmates.session.application.port.out.LoadCurrentSessionPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class LegacyCurrentSessionAdapter(
    private val currentSessionRepository: CurrentSessionRepository,
) : LoadCurrentSessionPort {
    override fun loadCurrentSession(member: CurrentMember) =
        currentSessionRepository.findCurrentSession(member)
}
```

- [ ] **Step 2: Move host/current controller files**

Run:

```bash
git mv server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/CurrentSessionController.kt
git mv server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt
git mv server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt
git mv server/src/main/kotlin/com/readmates/session/api/PublicationController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt
git mv server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/HostDashboardController.kt
```

Expected: files are moved.

- [ ] **Step 3: Update moved controllers**

Apply these concrete conversions:

- `CurrentSessionController` injects `GetCurrentSessionUseCase` and calls `currentSession(member)`.
- `HostSessionController` injects `ManageHostSessionUseCase`.
- `AttendanceController` injects `ConfirmAttendanceUseCase`.
- `PublicationController` injects `UpsertPublicationUseCase`.
- `HostDashboardController` injects `GetHostDashboardUseCase`.

For `HostSessionRequest`, keep the request DTO in `HostSessionController.kt` during this slice and add:

```kotlin
fun toCommand(host: CurrentMember): HostSessionCommand =
    HostSessionCommand(
        host = host,
        title = title,
        bookTitle = bookTitle,
        bookAuthor = bookAuthor,
        bookLink = bookLink,
        bookImageUrl = bookImageUrl,
        date = date,
        startTime = startTime,
        endTime = endTime,
        questionDeadlineAt = questionDeadlineAt,
        locationLabel = locationLabel,
        meetingUrl = meetingUrl,
        meetingPasscode = meetingPasscode,
    )
```

For `PublicationRequest`, add:

```kotlin
fun toCommand(host: CurrentMember, sessionId: UUID): UpsertPublicationCommand =
    UpsertPublicationCommand(host, sessionId, publicSummary, isPublic)
```

For attendance entries, add:

```kotlin
fun AttendanceEntry.toCommand(): AttendanceEntryCommand =
    AttendanceEntryCommand(membershipId, attendanceStatus)
```

For `CurrentSessionController`, replace the class body with:

```kotlin
@RestController
@RequestMapping("/api/sessions/current")
class CurrentSessionController(
    private val getCurrentSessionUseCase: GetCurrentSessionUseCase,
) {
    @GetMapping
    fun current(member: CurrentMember): CurrentSessionPayload =
        getCurrentSessionUseCase.currentSession(member)
}
```

For `HostDashboardController`, keep response DTOs in the moved web file and map from `HostDashboardResult`:

```kotlin
data class HostDashboardResponse(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
    val currentSessionMissingMemberCount: Int = 0,
    val currentSessionMissingMembers: List<HostDashboardMissingMember> = emptyList(),
) {
    companion object {
        fun from(result: HostDashboardResult) = HostDashboardResponse(
            rsvpPending = result.rsvpPending,
            checkinMissing = result.checkinMissing,
            publishPending = result.publishPending,
            feedbackPending = result.feedbackPending,
            currentSessionMissingMemberCount = result.currentSessionMissingMemberCount,
            currentSessionMissingMembers = result.currentSessionMissingMembers.map {
                HostDashboardMissingMember(it.membershipId, it.displayName, it.email)
            },
        )
    }
}

data class HostDashboardMissingMember(
    val membershipId: String,
    val displayName: String,
    val email: String,
)

@RestController
@RequestMapping("/api/host/dashboard")
class HostDashboardController(
    private val getHostDashboardUseCase: GetHostDashboardUseCase,
) {
    @GetMapping
    fun dashboard(member: CurrentMember): HostDashboardResponse =
        HostDashboardResponse.from(getHostDashboardUseCase.dashboard(member))
}
```

- [ ] **Step 4: Update imports that referenced moved request DTOs**

Search:

```bash
rg -n "com\\.readmates\\.session\\.api\\.(AttendanceEntry|HostSessionRequest|PublicationRequest|HostDashboardResponse)" server/src/main/kotlin server/src/test/kotlin
```

Expected: no production import remains for `com.readmates.session.api.AttendanceEntry`, `com.readmates.session.api.HostSessionRequest`, `com.readmates.session.api.PublicationRequest`, or `com.readmates.session.api.HostDashboardResponse`.

- [ ] **Step 5: Run host/current session tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest
```

Expected: PASS. Test package names can remain old if class package declarations are not changed; if declarations are changed, update the `--tests` selectors to the new packages.

- [ ] **Step 6: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/port/in/GetCurrentSessionUseCase.kt \
  server/src/main/kotlin/com/readmates/session/application/port/out/LoadCurrentSessionPort.kt \
  server/src/main/kotlin/com/readmates/session/application/service/CurrentSessionQueryService.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacyCurrentSessionAdapter.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/CurrentSessionController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/HostDashboardController.kt
git add -u server/src/main/kotlin/com/readmates/session/api
git commit -m "refactor: route host session endpoints through use cases"
```

Expected: commit succeeds.

## Task 7: Remove Controller Dependencies On Legacy Repositories

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Test: all focused backend tests from Task 1

- [ ] **Step 1: Search for migrated controller violations**

Run:

```bash
rg -n "MemberAccountRepository|SessionRepository|JdbcTemplate|ObjectProvider<JdbcTemplate>" \
  server/src/main/kotlin/com/readmates/session/adapter/in/web \
  server/src/main/kotlin/com/readmates/note/adapter/in/web
```

Expected: no output from the migrated web adapter directories.

- [ ] **Step 2: Search for old controller package leftovers**

Run:

```bash
find server/src/main/kotlin/com/readmates/session/api server/src/main/kotlin/com/readmates/note/api -maxdepth 1 -type f | sort
```

Expected: no migrated controller files remain in these directories. `NotesFeedController.kt` may remain under `note/api` because archive/note read flow is outside this plan.

- [ ] **Step 3: Keep `SessionRepository` only as a legacy facade if still referenced**

Run:

```bash
rg -n "SessionRepository" server/src/main/kotlin server/src/test/kotlin
```

Expected: no migrated controller references. If only tests or unmigrated features reference it, leave it in place. If no production references remain, delete `SessionRepository` and move shared helper functions from the file to `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`:

```kotlin
package com.readmates.session.application

import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.ResponseStatus

internal fun jdbcTemplateOrThrow(jdbcTemplateProvider: ObjectProvider<JdbcTemplate>): JdbcTemplate =
    jdbcTemplateProvider.ifAvailable ?: throw CurrentSessionNotOpenException()

internal fun requireHost(member: CurrentMember) {
    if (!member.isHost) {
        throw AccessDeniedException("Host role required")
    }
}

internal fun shortNameFor(displayName: String): String = when (displayName) {
    "김호스트" -> "호스트"
    "안멤버1" -> "멤버1"
    "최멤버2" -> "멤버2"
    "김멤버3" -> "멤버3"
    "송멤버4" -> "멤버4"
    "이멤버5" -> "멤버5"
    else -> displayName
}

@ResponseStatus(HttpStatus.CONFLICT)
class CurrentSessionNotOpenException : RuntimeException("No open current session")

@ResponseStatus(HttpStatus.CONFLICT)
class OpenSessionAlreadyExistsException : RuntimeException("Open session already exists")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionNotFoundException : RuntimeException("Host session not found")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionParticipantNotFoundException : RuntimeException("Host session participant not found")

@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidMembershipIdException : RuntimeException("Invalid membership id")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidSessionScheduleException : RuntimeException("Session end time must be after start time")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidQuestionSetException : RuntimeException("Questions must include 2 to 5 non-empty items")
```

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application
git commit -m "refactor: retire migrated session facade dependencies"
```

Expected: commit succeeds if code changed. If Step 3 did not change files, skip this commit.

## Task 8: Add Session Boundary Tests

**Files:**

- Create: `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`
- Modify: `server/build.gradle.kts`

- [ ] **Step 1: Add ArchUnit dependency**

Modify `server/build.gradle.kts` test dependencies:

```kotlin
testImplementation("com.tngtech.archunit:archunit-junit5:1.3.0")
```

- [ ] **Step 2: Create boundary test**

Create `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`:

```kotlin
package com.readmates.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Test

class SessionCleanArchitectureBoundaryTest {
    private val importedClasses = ClassFileImporter().importPackages("com.readmates")

    @Test
    fun `migrated web adapters do not depend on persistence or legacy repositories`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.session.adapter.out.persistence..",
                "com.readmates.auth.adapter.out.persistence..",
                "org.springframework.jdbc..",
            )
            .check(importedClasses)

        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .should()
            .dependOnClassesThat()
            .haveSimpleNameEndingWith("Repository")
            .check(importedClasses)
    }

    @Test
    fun `session application does not depend on web adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.session.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .check(importedClasses)
    }
}
```

- [ ] **Step 3: Run boundary test and verify it passes**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.SessionCleanArchitectureBoundaryTest
```

Expected: PASS. If it fails because a temporary bridge still references moved web DTOs from application, move those DTO-compatible models into `session.application.model` and update the bridge before committing.

- [ ] **Step 4: Commit**

Run:

```bash
git add server/build.gradle.kts server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt
git commit -m "test: enforce session architecture boundaries"
```

Expected: commit succeeds.

## Task 9: Final Focused Verification

**Files:**

- No planned source edits.

- [ ] **Step 1: Run focused server suite**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest \
  --tests com.readmates.architecture.SessionCleanArchitectureBoundaryTest \
  --tests com.readmates.session.application.service.SessionMemberWriteServiceTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS.

- [ ] **Step 2: Run full backend tests if focused suite passes**

Run:

```bash
./server/gradlew -p server test
```

Expected: PASS.

- [ ] **Step 3: Confirm no unrelated files were changed**

Run:

```bash
git status --short
```

Expected: only the pre-existing unrelated frontend dirty files remain, or no dirty files if the user cleaned them in another session.

## Self-Review

- Spec coverage: This plan covers the first approved vertical slice from the spec: current member resolver, session/member writes, host session writes, temporary adapters, and boundary tests.
- Out of scope by design: archive/note read flow, feedback document, public publication, invitation/member lifecycle, and complete replacement of legacy JDBC repositories are left for separate plans.
- Placeholder scan: The plan contains concrete file paths, commands, expected outcomes, and code blocks for new core classes.
- Type consistency: Commands, ports, services, and controller snippets use the same names across tasks.
- Risk note: The bridge adapter still delegates to legacy repositories. That is intentional for this slice and is constrained to `adapter.out.persistence`.

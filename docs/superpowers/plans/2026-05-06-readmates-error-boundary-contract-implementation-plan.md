# ReadMates Error Boundary Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full-stack ReadMates error contract and route-boundary system so server, BFF, frontend API parsing, and React Router error UI all classify errors consistently.

**Architecture:** Spring web adapters return a shared `{ code, message, status }` error body while application services remain free of Spring HTTP dependencies. Cloudflare Pages Functions produce the same body for BFF-originated rejects, and the frontend shared API layer parses non-OK responses into `ReadmatesApiError`. React Router route boundaries and not-found routes render scoped public/member/host error states from that typed error model.

**Tech Stack:** Kotlin/Spring Boot, MockMvc/JUnit, TypeScript, Cloudflare Pages Functions, React/Vite, React Router 7, Vitest, Testing Library.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-05-06-readmates-error-boundary-contract-design.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`

## File Structure

Create:

- `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt`
  Owns the public-safe server error body and helper constructors.
- `server/src/test/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponseTest.kt`
  Unit coverage for shared server error body helpers and common handler output.
- `server/src/test/kotlin/com/readmates/archive/api/ArchiveErrorHandlerTest.kt`
  Representative archive error-body mapping tests.
- `server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt`
  Representative session error-body mapping tests.
- `server/src/test/kotlin/com/readmates/auth/api/InvitationErrorHandlerTest.kt`
  Auth/invitation error-body mapping tests.
- `front/functions/_shared/errors.ts`
  Pages Functions helper for BFF-originated JSON error responses.
- `front/src/app/route-error.tsx`
  Shared route error presenter, classifier, and not-found route component.

Modify:

- `server/src/main/kotlin/com/readmates/shared/adapter/in/web/SharedApplicationErrorHandler.kt`
  Return `ApiErrorResponse` for shared access-denied and framework-level status exceptions.
- `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveErrorHandler.kt`
  Return shared error bodies.
- `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
  Return shared error bodies.
- `server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationErrorHandler.kt`
  Return shared error bodies while preserving invitation-specific codes/messages.
- `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
  Return shared error body shape while preserving profile-specific codes/messages.
- `front/functions/api/bff/[[path]].ts`
  Return BFF JSON errors for invalid path, same-origin rejection, and invalid club slug.
- `front/functions/oauth2/authorization/[[registrationId]].ts`
  Return BFF JSON 404 for unsupported OAuth registration paths.
- `front/functions/login/oauth2/code/[[registrationId]].ts`
  Return BFF JSON 404 for unsupported OAuth callback paths.
- `front/shared/api/errors.ts`
  Parse API error bodies and expose `code`, user-safe message, and fallback metadata.
- `front/shared/api/client.ts`
  Await `apiErrorFromResponse` before throwing.
- `front/features/public/api/public-api.ts`
  Throw typed API errors for non-404 public API failures.
- `front/features/feedback/api/feedback-api.ts`
  Throw typed API errors for non-unavailable feedback API failures.
- `front/features/archive/api/archive-api.ts`
  Throw typed API errors for non-unavailable archive API failures.
- `front/src/app/router.tsx`
  Add route error elements, not-found routes, and root safety coverage.
- Existing feature route error wrappers:
  `front/features/archive/route/archive-route-state.tsx`,
  `front/features/public/route/public-route-state.tsx`,
  `front/features/feedback/route/feedback-route-state.tsx`,
  `front/features/host/route/host-route-error.tsx`,
  `front/features/current-session/route/current-session-route.tsx`.
- Tests:
  `front/tests/unit/cloudflare-bff.test.ts`,
  `front/tests/unit/cloudflare-oauth-proxy.test.ts`,
  `front/tests/unit/readmates-fetch.test.ts`,
  `front/tests/unit/spa-router.test.tsx`.
- `docs/development/architecture.md`
  Add the API error contract section.

## Task 1: Server Shared API Error Contract

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/in/web/SharedApplicationErrorHandler.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponseTest.kt`

- [x] **Step 1: Write the failing shared server tests**

Create `server/src/test/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponseTest.kt`:

```kotlin
package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.security.AccessDeniedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class ApiErrorResponseTest {
    @Test
    fun `builds a public safe error response from status code and code`() {
        val response = apiErrorResponse(
            status = HttpStatus.NOT_FOUND,
            code = "RESOURCE_NOT_FOUND",
            message = "요청한 리소스를 찾을 수 없습니다.",
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "RESOURCE_NOT_FOUND",
                message = "요청한 리소스를 찾을 수 없습니다.",
                status = 404,
            ),
        )
    }

    @Test
    fun `shared handler returns JSON body for access denied`() {
        val response = SharedApplicationErrorHandler().handleAccessDenied(AccessDeniedException())

        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "PERMISSION_DENIED",
                message = "이 작업을 수행할 권한이 없습니다.",
                status = 403,
            ),
        )
    }

    @Test
    fun `shared handler maps response status exceptions to safe JSON body`() {
        val response = SharedApplicationErrorHandler().handleResponseStatusException(
            ResponseStatusException(HttpStatus.GONE, "Password login has been removed"),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.GONE)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "GONE",
                message = "더 이상 사용할 수 없는 경로입니다.",
                status = 410,
            ),
        )
    }
}
```

- [x] **Step 2: Run the shared server tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.shared.adapter.in.web.ApiErrorResponseTest'
```

Expected: FAIL because `ApiErrorResponse`, `apiErrorResponse`, and the new handler methods do not exist.

- [x] **Step 3: Implement the shared server error contract**

Create `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt`:

```kotlin
package com.readmates.shared.adapter.`in`.web

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity

data class ApiErrorResponse(
    val code: String,
    val message: String,
    val status: Int,
)

fun apiErrorResponse(
    status: HttpStatus,
    code: String,
    message: String = status.defaultApiErrorMessage(),
): ResponseEntity<ApiErrorResponse> =
    ResponseEntity
        .status(status)
        .body(ApiErrorResponse(code = code, message = message, status = status.value()))

fun HttpStatus.defaultApiErrorCode(): String =
    when (this) {
        HttpStatus.BAD_REQUEST -> "INVALID_REQUEST"
        HttpStatus.UNAUTHORIZED -> "AUTHENTICATION_REQUIRED"
        HttpStatus.FORBIDDEN -> "PERMISSION_DENIED"
        HttpStatus.NOT_FOUND -> "RESOURCE_NOT_FOUND"
        HttpStatus.CONFLICT -> "CONFLICT"
        HttpStatus.GONE -> "GONE"
        HttpStatus.SERVICE_UNAVAILABLE -> "SERVICE_UNAVAILABLE"
        else -> if (is5xxServerError) "INTERNAL_ERROR" else "INVALID_REQUEST"
    }

fun HttpStatus.defaultApiErrorMessage(): String =
    when (this) {
        HttpStatus.BAD_REQUEST -> "요청을 처리할 수 없습니다."
        HttpStatus.UNAUTHORIZED -> "로그인이 필요합니다."
        HttpStatus.FORBIDDEN -> "이 작업을 수행할 권한이 없습니다."
        HttpStatus.NOT_FOUND -> "요청한 리소스를 찾을 수 없습니다."
        HttpStatus.CONFLICT -> "요청한 작업이 현재 상태와 충돌합니다."
        HttpStatus.GONE -> "더 이상 사용할 수 없는 경로입니다."
        HttpStatus.SERVICE_UNAVAILABLE -> "서비스를 일시적으로 사용할 수 없습니다."
        else -> if (is5xxServerError) {
            "서비스 오류가 발생했습니다."
        } else {
            "요청을 처리할 수 없습니다."
        }
    }
```

Modify `server/src/main/kotlin/com/readmates/shared/adapter/in/web/SharedApplicationErrorHandler.kt`:

```kotlin
package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.security.AccessDeniedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

@RestControllerAdvice
class SharedApplicationErrorHandler {
    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(error: AccessDeniedException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.FORBIDDEN,
            code = "PERMISSION_DENIED",
            message = "이 작업을 수행할 권한이 없습니다.",
        )

    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatusException(error: ResponseStatusException): ResponseEntity<ApiErrorResponse> {
        val status = HttpStatus.resolve(error.statusCode.value()) ?: HttpStatus.INTERNAL_SERVER_ERROR
        return apiErrorResponse(
            status = status,
            code = status.defaultApiErrorCode(),
            message = status.defaultApiErrorMessage(),
        )
    }
}
```

- [x] **Step 4: Run the shared server tests and verify they pass**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.shared.adapter.in.web.ApiErrorResponseTest'
```

Expected: PASS.

- [x] **Step 5: Commit the shared server contract**

Run:

```bash
git add server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt \
  server/src/main/kotlin/com/readmates/shared/adapter/in/web/SharedApplicationErrorHandler.kt \
  server/src/test/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponseTest.kt
git commit -m "feat: add shared api error response"
```

## Task 2: Server Feature Error Bodies

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Create: `server/src/test/kotlin/com/readmates/archive/api/ArchiveErrorHandlerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/InvitationErrorHandlerTest.kt`

- [x] **Step 1: Write failing feature error-handler tests**

Create `server/src/test/kotlin/com/readmates/archive/api/ArchiveErrorHandlerTest.kt`:

```kotlin
package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class ArchiveErrorHandlerTest {
    @Test
    fun `maps missing archive session to JSON 404`() {
        val response = ArchiveErrorHandler().handleArchiveApplicationException(
            ArchiveApplicationException(ArchiveApplicationError.SESSION_NOT_FOUND, "Archive session not found"),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "SESSION_NOT_FOUND",
                message = "요청한 세션을 찾을 수 없습니다.",
                status = 404,
            ),
        )
    }

    @Test
    fun `maps member app access failure to JSON 403`() {
        val response = ArchiveErrorHandler().handleArchiveApplicationException(
            ArchiveApplicationException(ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED, "Member app access required"),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(response.body?.code).isEqualTo("PERMISSION_DENIED")
        assertThat(response.body?.status).isEqualTo(403)
    }
}
```

Create `server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt`:

```kotlin
package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.InvalidSessionScheduleException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class SessionApplicationErrorHandlerTest {
    @Test
    fun `maps session not found to JSON 404`() {
        val response = SessionApplicationErrorHandler().handleNotFound(HostSessionNotFoundException())

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body?.code).isEqualTo("SESSION_NOT_FOUND")
        assertThat(response.body?.message).isEqualTo("요청한 세션을 찾을 수 없습니다.")
        assertThat(response.body?.status).isEqualTo(404)
    }

    @Test
    fun `maps invalid schedule to JSON 400`() {
        val response = SessionApplicationErrorHandler().handleBadRequest(InvalidSessionScheduleException())

        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(response.body?.code).isEqualTo("INVALID_REQUEST")
        assertThat(response.body?.status).isEqualTo(400)
    }

    @Test
    fun `maps open conflict to JSON 409`() {
        val response = SessionApplicationErrorHandler().handleConflict(HostSessionOpenNotAllowedException())

        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body?.code).isEqualTo("CONFLICT")
        assertThat(response.body?.status).isEqualTo(409)
    }
}
```

Create `server/src/test/kotlin/com/readmates/auth/api/InvitationErrorHandlerTest.kt`:

```kotlin
package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class InvitationErrorHandlerTest {
    @Test
    fun `preserves invitation domain code and message in shared body`() {
        val response = InvitationErrorHandler().handleInvitationDomainException(
            InvitationDomainException(
                code = "INVITATION_EXPIRED",
                error = InvitationDomainError.CONFLICT,
                message = "초대 링크가 만료되었습니다.",
            ),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body.code).isEqualTo("INVITATION_EXPIRED")
        assertThat(response.body.message).isEqualTo("초대 링크가 만료되었습니다.")
        assertThat(response.body.status).isEqualTo(409)
    }

    @Test
    fun `maps auth application errors to shared JSON body`() {
        val response = InvitationErrorHandler().handleAuthApplicationException(
            AuthApplicationException(AuthApplicationError.CLUB_NOT_FOUND, "Club not found"),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body?.code).isEqualTo("CLUB_NOT_FOUND")
        assertThat(response.body?.status).isEqualTo(404)
    }
}
```

- [x] **Step 2: Run feature error-handler tests and verify they fail**

Run:

```bash
./server/gradlew -p server test \
  --tests 'com.readmates.archive.adapter.in.web.ArchiveErrorHandlerTest' \
  --tests 'com.readmates.session.adapter.in.web.SessionApplicationErrorHandlerTest' \
  --tests 'com.readmates.auth.adapter.in.web.InvitationErrorHandlerTest'
```

Expected: FAIL because handlers still return `ResponseEntity<Void>` or feature-specific response types.

- [x] **Step 3: Update archive and session handlers to return shared bodies**

Modify `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveErrorHandler.kt`:

```kotlin
package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.ArchiveApplicationError
import com.readmates.archive.application.ArchiveApplicationException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(assignableTypes = [ArchiveController::class, MemberArchiveReviewController::class])
class ArchiveErrorHandler {
    @ExceptionHandler(ArchiveApplicationException::class)
    fun handleArchiveApplicationException(exception: ArchiveApplicationException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = exception.error.toHttpStatus(),
            code = exception.error.toApiCode(),
            message = exception.error.toUserMessage(),
        )

    private fun ArchiveApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> HttpStatus.FORBIDDEN
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> HttpStatus.BAD_REQUEST
            ArchiveApplicationError.SESSION_NOT_FOUND -> HttpStatus.NOT_FOUND
        }

    private fun ArchiveApplicationError.toApiCode(): String =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> "PERMISSION_DENIED"
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> "INVALID_REQUEST"
            ArchiveApplicationError.SESSION_NOT_FOUND -> "SESSION_NOT_FOUND"
        }

    private fun ArchiveApplicationError.toUserMessage(): String =
        when (this) {
            ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED -> "멤버 공간에 접근할 권한이 없습니다."
            ArchiveApplicationError.REVIEW_BODY_REQUIRED -> "서평 내용을 입력해 주세요."
            ArchiveApplicationError.SESSION_NOT_FOUND -> "요청한 세션을 찾을 수 없습니다."
        }
}
```

Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`:

```kotlin
package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidQuestionSetException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class SessionApplicationErrorHandler {
    @ExceptionHandler(
        CurrentSessionNotOpenException::class,
        OpenSessionAlreadyExistsException::class,
        HostSessionDeletionNotAllowedException::class,
        HostSessionOpenNotAllowedException::class,
        HostSessionCloseNotAllowedException::class,
        HostSessionPublishNotAllowedException::class,
    )
    fun handleConflict(error: RuntimeException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "CONFLICT",
            message = "요청한 작업이 현재 세션 상태와 충돌합니다.",
        )

    @ExceptionHandler(
        HostSessionNotFoundException::class,
        HostSessionParticipantNotFoundException::class,
    )
    fun handleNotFound(error: RuntimeException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.NOT_FOUND,
            code = "SESSION_NOT_FOUND",
            message = "요청한 세션을 찾을 수 없습니다.",
        )

    @ExceptionHandler(
        InvalidMembershipIdException::class,
        InvalidSessionScheduleException::class,
        InvalidQuestionSetException::class,
    )
    fun handleBadRequest(error: RuntimeException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_REQUEST",
            message = "세션 요청 값을 확인해 주세요.",
        )
}
```

- [x] **Step 4: Update auth handlers to return shared bodies**

Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationErrorHandler.kt`:

```kotlin
package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.InvitationDomainError
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class InvitationErrorHandler {
    @ExceptionHandler(InvitationDomainException::class)
    fun handleInvitationDomainException(error: InvitationDomainException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = error.error.toHttpStatus(),
            code = error.code,
            message = error.message ?: error.code,
        )

    @ExceptionHandler(AuthApplicationException::class)
    fun handleAuthApplicationException(error: AuthApplicationException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = error.error.toHttpStatus(),
            code = error.error.toApiCode(),
            message = error.error.toUserMessage(),
        )

    private fun InvitationDomainError.toHttpStatus(): HttpStatus =
        when (this) {
            InvitationDomainError.BAD_REQUEST -> HttpStatus.BAD_REQUEST
            InvitationDomainError.FORBIDDEN -> HttpStatus.FORBIDDEN
            InvitationDomainError.NOT_FOUND -> HttpStatus.NOT_FOUND
            InvitationDomainError.CONFLICT -> HttpStatus.CONFLICT
            InvitationDomainError.STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
        }

    private fun AuthApplicationError.toHttpStatus(): HttpStatus =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> HttpStatus.UNAUTHORIZED
            AuthApplicationError.HOST_REQUIRED -> HttpStatus.FORBIDDEN
            AuthApplicationError.MEMBER_NOT_FOUND -> HttpStatus.NOT_FOUND
            AuthApplicationError.MEMBER_CONFLICT -> HttpStatus.CONFLICT
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> HttpStatus.NOT_FOUND
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> HttpStatus.FORBIDDEN
            AuthApplicationError.CLUB_NOT_FOUND -> HttpStatus.NOT_FOUND
        }

    private fun AuthApplicationError.toApiCode(): String =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> "AUTHENTICATION_REQUIRED"
            AuthApplicationError.HOST_REQUIRED -> "PERMISSION_DENIED"
            AuthApplicationError.MEMBER_NOT_FOUND -> "MEMBER_NOT_FOUND"
            AuthApplicationError.MEMBER_CONFLICT -> "CONFLICT"
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> "MEMBER_NOT_FOUND"
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> "PERMISSION_DENIED"
            AuthApplicationError.CLUB_NOT_FOUND -> "CLUB_NOT_FOUND"
        }

    private fun AuthApplicationError.toUserMessage(): String =
        when (this) {
            AuthApplicationError.AUTHENTICATION_REQUIRED -> "로그인이 필요합니다."
            AuthApplicationError.HOST_REQUIRED -> "호스트 권한이 필요합니다."
            AuthApplicationError.MEMBER_NOT_FOUND -> "멤버를 찾을 수 없습니다."
            AuthApplicationError.MEMBER_CONFLICT -> "멤버 상태가 현재 요청과 충돌합니다."
            AuthApplicationError.VIEWER_MEMBER_NOT_FOUND -> "승인 대기 멤버를 찾을 수 없습니다."
            AuthApplicationError.PENDING_APPROVAL_REQUIRED -> "승인 대기 상태에서만 사용할 수 있습니다."
            AuthApplicationError.CLUB_NOT_FOUND -> "클럽을 찾을 수 없습니다."
        }
}
```

Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt` only inside its `handleMemberProfileException` branch:

```kotlin
    @ExceptionHandler(MemberProfileException::class)
    fun handleMemberProfileException(exception: MemberProfileException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = exception.error.httpStatus(),
            code = exception.error.code,
            message = exception.error.message,
        )
```

Keep the existing `MemberProfileError.httpStatus()` mapping and import:

```kotlin
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
```

- [x] **Step 5: Run feature error-handler tests and verify they pass**

Run:

```bash
./server/gradlew -p server test \
  --tests 'com.readmates.archive.adapter.in.web.ArchiveErrorHandlerTest' \
  --tests 'com.readmates.session.adapter.in.web.SessionApplicationErrorHandlerTest' \
  --tests 'com.readmates.auth.adapter.in.web.InvitationErrorHandlerTest'
```

Expected: PASS.

- [x] **Step 6: Run targeted existing server controller tests**

Run:

```bash
./server/gradlew -p server test \
  --tests 'com.readmates.session.adapter.in.web.RsvpControllerTest' \
  --tests 'com.readmates.auth.api.MemberProfileControllerTest' \
  --tests 'com.readmates.auth.api.HostInvitationControllerTest'
```

Expected: PASS. If a test asserts an empty body, update that assertion to the new `{ code, message, status }` body.

- [x] **Step 7: Commit server feature error bodies**

Run:

```bash
git add server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveErrorHandler.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt \
  server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationErrorHandler.kt \
  server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveErrorHandlerTest.kt \
  server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/InvitationErrorHandlerTest.kt
git commit -m "feat: return structured server api errors"
```

## Task 3: BFF Error Response Contract

**Files:**
- Create: `front/functions/_shared/errors.ts`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Modify: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

- [x] **Step 1: Write failing BFF JSON error tests**

Add this helper to `front/tests/unit/cloudflare-bff.test.ts`:

```ts
async function expectApiErrorBody(response: Response, expected: { status: number; code: string }) {
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    code: expected.code,
    status: expected.status,
  });
}
```

Update the existing BFF rejection tests:

```ts
await expectApiErrorBody(response, { status: 400, code: "INVALID_REQUEST" });
await expectApiErrorBody(response, { status: 403, code: "PERMISSION_DENIED" });
await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
```

For the path traversal `it.each`, keep the current `expect(fetchMock).not.toHaveBeenCalled()` assertion and add:

```ts
await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
```

In `front/tests/unit/cloudflare-oauth-proxy.test.ts`, update unsupported registration/callback path tests to assert:

```ts
expect(response.status).toBe(404);
expect(response.headers.get("content-type")).toContain("application/json");
await expect(response.json()).resolves.toMatchObject({
  code: "RESOURCE_NOT_FOUND",
  status: 404,
});
```

- [x] **Step 2: Run BFF tests and verify they fail**

Run:

```bash
pnpm --dir front test -- cloudflare-bff.test.ts cloudflare-oauth-proxy.test.ts
```

Expected: FAIL because the BFF returns empty bodies for originated 400/403/404 responses.

- [x] **Step 3: Implement the BFF error helper**

Create `front/functions/_shared/errors.ts`:

```ts
export type ApiErrorResponse = {
  code: string;
  message: string;
  status: number;
};

const defaultMessages: Record<number, string> = {
  400: "요청을 처리할 수 없습니다.",
  401: "로그인이 필요합니다.",
  403: "이 작업을 수행할 권한이 없습니다.",
  404: "요청한 리소스를 찾을 수 없습니다.",
  409: "요청한 작업이 현재 상태와 충돌합니다.",
  410: "더 이상 사용할 수 없는 경로입니다.",
  503: "서비스를 일시적으로 사용할 수 없습니다.",
};

export function bffErrorResponse(status: number, code: string, message = defaultMessages[status] || "서비스 오류가 발생했습니다.") {
  const body: ApiErrorResponse = { code, message, status };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

- [x] **Step 4: Use the helper in Pages Functions**

Modify `front/functions/api/bff/[[path]].ts` imports:

```ts
import { bffErrorResponse } from "../../_shared/errors";
```

Replace BFF-originated rejects:

```ts
if (!upstreamPath) {
  return bffErrorResponse(404, "RESOURCE_NOT_FOUND");
}

if (upstreamUrl.pathname !== "/api" && !upstreamUrl.pathname.startsWith("/api/")) {
  return bffErrorResponse(404, "RESOURCE_NOT_FOUND");
}

if (!isSameOriginMutation(context.request)) {
  return bffErrorResponse(403, "PERMISSION_DENIED");
}

if (clubSlug === "") {
  return bffErrorResponse(400, "INVALID_REQUEST");
}
```

Modify `front/functions/oauth2/authorization/[[registrationId]].ts` and `front/functions/login/oauth2/code/[[registrationId]].ts` imports:

```ts
import { bffErrorResponse } from "../../_shared/errors";
```

For `login/oauth2/code`, the relative import is:

```ts
import { bffErrorResponse } from "../../../_shared/errors";
```

Replace unsupported registration/callback responses:

```ts
return bffErrorResponse(404, "RESOURCE_NOT_FOUND");
```

- [x] **Step 5: Run BFF tests and verify they pass**

Run:

```bash
pnpm --dir front test -- cloudflare-bff.test.ts cloudflare-oauth-proxy.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit BFF error contract**

Run:

```bash
git add front/functions/_shared/errors.ts \
  'front/functions/api/bff/[[path]].ts' \
  'front/functions/oauth2/authorization/[[registrationId]].ts' \
  'front/functions/login/oauth2/code/[[registrationId]].ts' \
  front/tests/unit/cloudflare-bff.test.ts \
  front/tests/unit/cloudflare-oauth-proxy.test.ts
git commit -m "feat: return structured bff errors"
```

## Task 4: Frontend API Error Parser

**Files:**
- Modify: `front/shared/api/errors.ts`
- Modify: `front/shared/api/client.ts`
- Modify: `front/features/public/api/public-api.ts`
- Modify: `front/features/feedback/api/feedback-api.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add these tests to `front/tests/unit/readmates-fetch.test.ts`:

```ts
it("throws API errors with parsed server code message and status", async () => {
  const response = new Response(
    JSON.stringify({
      code: "SESSION_NOT_FOUND",
      message: "요청한 세션을 찾을 수 없습니다.",
      status: 404,
    }),
    {
      status: 404,
      statusText: "Not Found",
      headers: { "Content-Type": "application/json" },
    },
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  await expect(readmatesFetch("/api/archive/sessions/missing")).rejects.toMatchObject({
    name: "ReadmatesApiError",
    message: "요청한 세션을 찾을 수 없습니다.",
    status: 404,
    code: "SESSION_NOT_FOUND",
    fallback: false,
  });
});

it("throws API errors with safe fallback body when the response body is empty", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

  await expect(readmatesFetch("/api/host/dashboard")).rejects.toMatchObject({
    name: "ReadmatesApiError",
    message: "이 작업을 수행할 권한이 없습니다.",
    status: 403,
    code: "PERMISSION_DENIED",
    fallback: true,
  });
});

it("throws API errors with safe fallback body when the response body is malformed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("{not-json", {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );

  await expect(readmatesFetch("/api/app/me")).rejects.toMatchObject({
    name: "ReadmatesApiError",
    status: 500,
    code: "INTERNAL_ERROR",
    fallback: true,
  });
});
```

Update the existing typed API error test expectation from `"ReadMates API failed: 500"` to the new fallback message:

```ts
expect(error).toHaveProperty("message", "서비스 오류가 발생했습니다.");
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
pnpm --dir front test -- readmates-fetch.test.ts
```

Expected: FAIL because `ReadmatesApiError` does not expose `code` or parse JSON bodies.

- [ ] **Step 3: Implement async API error parsing**

Replace `front/shared/api/errors.ts` with:

```ts
export type ReadmatesApiErrorBody = {
  code: string;
  message: string;
  status: number;
};

export type ReadmatesApiErrorMetadata = {
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  type: ResponseType;
};

type FallbackApiError = ReadmatesApiErrorBody & {
  fallback: true;
};

const fallbackByStatus: Record<number, ReadmatesApiErrorBody> = {
  400: { code: "INVALID_REQUEST", message: "요청을 처리할 수 없습니다.", status: 400 },
  401: { code: "AUTHENTICATION_REQUIRED", message: "로그인이 필요합니다.", status: 401 },
  403: { code: "PERMISSION_DENIED", message: "이 작업을 수행할 권한이 없습니다.", status: 403 },
  404: { code: "RESOURCE_NOT_FOUND", message: "요청한 리소스를 찾을 수 없습니다.", status: 404 },
  409: { code: "CONFLICT", message: "요청한 작업이 현재 상태와 충돌합니다.", status: 409 },
  410: { code: "GONE", message: "더 이상 사용할 수 없는 경로입니다.", status: 410 },
  503: { code: "SERVICE_UNAVAILABLE", message: "서비스를 일시적으로 사용할 수 없습니다.", status: 503 },
};

function fallbackApiErrorBody(status: number): FallbackApiError {
  const body = fallbackByStatus[status] || {
    code: status >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
    message: status >= 500 ? "서비스 오류가 발생했습니다." : "요청을 처리할 수 없습니다.",
    status,
  };

  return { ...body, status, fallback: true };
}

function isApiErrorBody(value: unknown): value is ReadmatesApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Partial<ReadmatesApiErrorBody>;
  return typeof body.code === "string" && typeof body.message === "string" && typeof body.status === "number";
}

async function parseApiErrorBody(response: Response): Promise<ReadmatesApiErrorBody & { fallback: boolean }> {
  try {
    const text = await response.clone().text();
    if (!text.trim()) {
      return fallbackApiErrorBody(response.status);
    }

    const parsed: unknown = JSON.parse(text);
    if (!isApiErrorBody(parsed)) {
      return fallbackApiErrorBody(response.status);
    }

    return {
      code: parsed.code,
      message: parsed.message,
      status: response.status,
      fallback: parsed.status !== response.status,
    };
  } catch {
    return fallbackApiErrorBody(response.status);
  }
}

export class ReadmatesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fallback: boolean;
  readonly metadata: ReadmatesApiErrorMetadata;
  readonly response: Response;

  constructor(body: ReadmatesApiErrorBody & { fallback: boolean }, response: Response) {
    super(body.message);
    this.name = "ReadmatesApiError";
    this.status = response.status;
    this.code = body.code;
    this.fallback = body.fallback;
    this.metadata = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      type: response.type,
    };
    this.response = response;
  }
}

export function isReadmatesApiError(error: unknown): error is ReadmatesApiError {
  return error instanceof ReadmatesApiError;
}

export async function apiErrorFromResponse(response: Response) {
  return new ReadmatesApiError(await parseApiErrorBody(response), response);
}
```

Modify `front/shared/api/client.ts`:

```ts
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
```

- [ ] **Step 4: Convert route-facing manual non-OK throws to typed API errors**

Modify `front/features/public/api/public-api.ts`:

```ts
import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

export function fetchPublicClub(clubSlug: string) {
  return readmatesFetch<PublicClubResponse>(`/api/public/clubs/${encodeURIComponent(clubSlug)}`);
}

export async function fetchPublicSession(clubSlug: string, sessionId: string) {
  const response = await readmatesFetchResponse(
    `/api/public/clubs/${encodeURIComponent(clubSlug)}/sessions/${encodeURIComponent(sessionId)}`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.json() as Promise<PublicSessionDetailResponse>;
}
```

In `front/features/feedback/api/feedback-api.ts` and `front/features/archive/api/archive-api.ts`, import `apiErrorFromResponse` and replace generic non-OK route-loader throws with:

```ts
throw await apiErrorFromResponse(response);
```

Keep existing feature-specific `403` or `404` unavailable returns where the feature intentionally renders its own state.

- [ ] **Step 5: Run parser tests and verify they pass**

Run:

```bash
pnpm --dir front test -- readmates-fetch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontend API parser**

Run:

```bash
git add front/shared/api/errors.ts \
  front/shared/api/client.ts \
  front/features/public/api/public-api.ts \
  front/features/feedback/api/feedback-api.ts \
  front/features/archive/api/archive-api.ts \
  front/tests/unit/readmates-fetch.test.ts
git commit -m "feat: parse structured frontend api errors"
```

## Task 5: React Router Error Boundaries and Not Found Routes

**Files:**
- Create: `front/src/app/route-error.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/features/archive/route/archive-route-state.tsx`
- Modify: `front/features/public/route/public-route-state.tsx`
- Modify: `front/features/feedback/route/feedback-route-state.tsx`
- Modify: `front/features/host/route/host-route-error.tsx`
- Modify: `front/features/current-session/route/current-session-route.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`

- [ ] **Step 1: Write failing router not-found and route-error tests**

Add this helper to `front/tests/unit/spa-router.test.tsx`:

```tsx
function renderRouterAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}
```

Add unknown route tests:

```tsx
it.each([
  ["/missing-page", "페이지를 찾을 수 없습니다."],
  ["/clubs/reading-sai/missing-page", "페이지를 찾을 수 없습니다."],
  ["/app/missing-page", "페이지를 찾을 수 없습니다."],
  ["/clubs/reading-sai/app/missing-page", "페이지를 찾을 수 없습니다."],
  ["/app/host/missing-page", "페이지를 찾을 수 없습니다."],
  ["/clubs/reading-sai/app/host/missing-page", "페이지를 찾을 수 없습니다."],
])("renders a not-found route for %s", async (path, heading) => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me" || url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(
          jsonResponse({
            authenticated: true,
            userId: "host-user",
            membershipId: "host-membership",
            clubId: "club-id",
            email: "host@example.com",
            displayName: "호스트",
            accountName: "호스트",
            role: "HOST",
            membershipStatus: "ACTIVE",
            approvalState: "ACTIVE",
          }),
        );
      }

      return Promise.resolve(jsonResponse(publicClubResponse));
    }),
  );

  installRouterRequestShim();
  renderRouterAt(path);

  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});
```

Add a route error classification test:

```tsx
it("renders permission denied copy from a structured API route error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(
          jsonResponse({
            authenticated: true,
            userId: "member-user",
            membershipId: "member-membership",
            clubId: "club-id",
            email: "member@example.com",
            displayName: "멤버",
            accountName: "멤버",
            role: "MEMBER",
            membershipStatus: "ACTIVE",
            approvalState: "ACTIVE",
          }),
        );
      }
      if (url === "/api/bff/api/archive/sessions?limit=30&clubSlug=reading-sai") {
        return Promise.resolve(
          jsonResponse(
            {
              code: "PERMISSION_DENIED",
              message: "멤버 공간에 접근할 권한이 없습니다.",
              status: 403,
            },
            403,
          ),
        );
      }

      return Promise.resolve(jsonResponse(publicClubResponse));
    }),
  );

  installRouterRequestShim();
  renderRouterAt("/clubs/reading-sai/app/archive");

  expect(await screen.findByRole("heading", { name: "접근할 수 없습니다." })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run router tests and verify they fail**

Run:

```bash
pnpm --dir front test -- spa-router.test.tsx
```

Expected: FAIL because unmatched routes and structured route error classification are not implemented.

- [ ] **Step 3: Implement shared route error UI**

Create `front/src/app/route-error.tsx`:

```tsx
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { isReadmatesApiError } from "@/shared/api/errors";

export type RouteErrorVariant = "public" | "member" | "host" | "auth";

type RouteErrorView = {
  eyebrow: string;
  heading: string;
  body: string;
  actionHref: string;
  actionLabel: string;
};

function fallbackPathForVariant(variant: RouteErrorVariant) {
  switch (variant) {
    case "host":
      return "/app/host";
    case "member":
      return "/app";
    case "auth":
      return "/login";
    case "public":
      return "/";
  }
}

function classifyStatus(status: number, variant: RouteErrorVariant): RouteErrorView {
  const actionHref = fallbackPathForVariant(variant);
  const actionLabel = variant === "host" ? "호스트 홈" : variant === "member" ? "내 클럽으로" : variant === "auth" ? "로그인" : "공개 홈";

  if (status === 403) {
    return {
      eyebrow: "권한 필요",
      heading: "접근할 수 없습니다.",
      body: "현재 계정 또는 클럽 권한으로는 이 화면을 열 수 없습니다.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 404) {
    return {
      eyebrow: "찾을 수 없음",
      heading: "페이지를 찾을 수 없습니다.",
      body: "주소가 바뀌었거나 현재 클럽에서 열 수 없는 기록입니다.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 409) {
    return {
      eyebrow: "상태 변경",
      heading: "지금은 처리할 수 없습니다.",
      body: "화면의 상태가 바뀌었을 수 있습니다. 새로고침한 뒤 다시 시도해 주세요.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 410) {
    return {
      eyebrow: "사용 종료",
      heading: "더 이상 사용할 수 없는 경로입니다.",
      body: "현재 지원되는 화면으로 이동해 다시 시작해 주세요.",
      actionHref,
      actionLabel,
    };
  }

  return {
    eyebrow: "불러오기 실패",
    heading: "페이지를 불러오지 못했습니다.",
    body: "네트워크 연결 또는 서비스 상태를 확인한 뒤 새로고침해 주세요.",
    actionHref,
    actionLabel,
  };
}

function statusFromRouteError(error: unknown) {
  if (isReadmatesApiError(error)) {
    return error.status;
  }

  if (isRouteErrorResponse(error)) {
    return error.status;
  }

  return 500;
}

export function RouteErrorPage({ variant, status }: { variant: RouteErrorVariant; status: number }) {
  const view = classifyStatus(status, variant);

  return (
    <main className="container">
      <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
        <p className="eyebrow">{view.eyebrow}</p>
        <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
          {view.heading}
        </h1>
        <p className="body" style={{ color: "var(--text-2)" }}>
          {view.body}
        </p>
        <div className="auth-card__actions auth-card__actions--primary">
          <Link className="btn btn-primary" to={view.actionHref}>
            {view.actionLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}

export function RouteErrorBoundary({ variant }: { variant: RouteErrorVariant }) {
  const error = useRouteError();
  return <RouteErrorPage variant={variant} status={statusFromRouteError(error)} />;
}

export function NotFoundRoute({ variant }: { variant: RouteErrorVariant }) {
  return <RouteErrorPage variant={variant} status={404} />;
}
```

- [ ] **Step 4: Delegate feature generic error states to shared UI**

Update each existing generic route error component to use `RouteErrorBoundary`:

`front/features/archive/route/archive-route-state.tsx`:

```tsx
import { RouteErrorBoundary } from "@/src/app/route-error";

export function ArchiveRouteLoading({ label }: { label: string }) {
  return (
    <main className="rm-route-loading rm-route-loading--member">
      <div className="container rm-route-loading__inner">
        <div role="status" aria-live="polite" className="rm-sr-only">
          {label}
        </div>
      </div>
    </main>
  );
}

export function ArchiveRouteError() {
  return <RouteErrorBoundary variant="member" />;
}
```

`front/features/public/route/public-route-state.tsx`:

```tsx
import { RouteErrorBoundary } from "@/src/app/route-error";

export function PublicRouteError() {
  return <RouteErrorBoundary variant="public" />;
}
```

`front/features/feedback/route/feedback-route-state.tsx`:

```tsx
import { RouteErrorBoundary } from "@/src/app/route-error";

export function FeedbackRouteError() {
  return <RouteErrorBoundary variant="member" />;
}
```

`front/features/host/route/host-route-error.tsx`:

```tsx
import { RouteErrorBoundary } from "@/src/app/route-error";

export function HostRouteError() {
  return <RouteErrorBoundary variant="host" />;
}
```

In `front/features/current-session/route/current-session-route.tsx`, replace only `CurrentSessionRouteError` with:

```tsx
export function CurrentSessionRouteError() {
  return <RouteErrorBoundary variant="member" />;
}
```

Add the import:

```tsx
import { RouteErrorBoundary } from "@/src/app/route-error";
```

- [ ] **Step 5: Wire route-level error elements and catch-all routes**

Modify `front/src/app/router.tsx` imports:

```tsx
import { NotFoundRoute, RouteErrorBoundary } from "@/src/app/route-error";
```

Append to `memberAppRoutes()` result:

```tsx
    {
      path: "*",
      element: <NotFoundRoute variant="member" />,
    },
```

Append to `hostAppRoutes()` result:

```tsx
    {
      path: "*",
      element: <NotFoundRoute variant="host" />,
    },
```

Add `errorElement` and public catch-all to the public layout route:

```tsx
  {
    element: <PublicRouteLayout />,
    errorElement: <RouteErrorBoundary variant="public" />,
    children: [
      // existing public children
      { path: "*", element: <NotFoundRoute variant="public" /> },
    ],
  },
```

Add error elements to parent app routes:

```tsx
  {
    path: "/app",
    errorElement: <RouteErrorBoundary variant="member" />,
    children: [
      // existing children
    ],
  },
  {
    id: "club-app",
    path: "/clubs/:clubSlug/app",
    errorElement: <RouteErrorBoundary variant="member" />,
    // existing fields
  },
  {
    id: "app-host",
    path: "/app/host",
    errorElement: <RouteErrorBoundary variant="host" />,
    // existing fields
  },
  {
    id: "club-app-host",
    path: "/clubs/:clubSlug/app/host",
    errorElement: <RouteErrorBoundary variant="host" />,
    // existing fields
  },
```

For `/admin`, use:

```tsx
errorElement: <RouteErrorBoundary variant="auth" />,
```

- [ ] **Step 6: Run router tests and verify they pass**

Run:

```bash
pnpm --dir front test -- spa-router.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit router boundaries**

Run:

```bash
git add front/src/app/route-error.tsx \
  front/src/app/router.tsx \
  front/features/archive/route/archive-route-state.tsx \
  front/features/public/route/public-route-state.tsx \
  front/features/feedback/route/feedback-route-state.tsx \
  front/features/host/route/host-route-error.tsx \
  front/features/current-session/route/current-session-route.tsx \
  front/tests/unit/spa-router.test.tsx
git commit -m "feat: add route error boundaries"
```

## Task 6: Architecture Documentation

**Files:**
- Modify: `docs/development/architecture.md`

- [ ] **Step 1: Add the architecture section**

Insert this section after `## 요청 흐름` and before `## 멀티 클럽 context와 도메인 모델` in `docs/development/architecture.md`:

````markdown
## API 오류 계약과 화면 경계

브라우저가 해석하는 API 오류는 public-safe JSON body를 기준으로 한다.

```json
{
  "code": "SESSION_NOT_FOUND",
  "message": "요청한 세션을 찾을 수 없습니다.",
  "status": 404
}
```

`code`는 stable uppercase identifier이고, `message`는 사용자에게 보여줄 수 있는 안전한 문구이며, `status`는 HTTP status code와 일치해야 한다. 서버는 stack trace, SQL detail, upstream host, SMTP detail, secret, token 원문, private member data, 내부 exception class name을 오류 body에 넣지 않는다.

Spring API의 application service는 Spring Web/HTTP type에 의존하지 않는다. Feature application/domain error는 `adapter.in.web`의 handler가 HTTP status와 `ApiErrorResponse`로 매핑한다. 공통 framework error와 shared access-denied error는 shared web advice가 안전한 기본 code/message로 매핑한다.

Cloudflare Pages Functions BFF가 upstream Spring API에 도달하기 전에 거절하는 요청도 같은 shape를 사용한다. 예를 들어 invalid `/api/bff/**` path는 `404 RESOURCE_NOT_FOUND`, cross-origin mutation은 `403 PERMISSION_DENIED`, invalid `clubSlug`는 `400 INVALID_REQUEST`를 반환한다. Upstream Spring API 응답은 status와 안전한 body를 유지하되, 내부 `x-readmates-*` response header와 secret은 계속 제거한다.

프런트엔드 `shared/api`는 non-OK 응답을 `ReadmatesApiError`로 변환한다. JSON body가 비어 있거나 잘못된 형태여도 HTTP status를 기준으로 안전한 fallback code/message를 만든다. React Router route boundary는 `status`와 `code`를 기준으로 public/member/host context에 맞는 404, 403, 409, 410, 5xx 화면을 보여준다. 정상적인 401 session 만료는 기존 login return flow를 유지한다.

Feature-specific unavailable state는 feature가 계속 소유한다. 공개 세션이 없는 상태, 피드백 문서가 없거나 권한이 없는 상태, 초대 링크 검증 오류처럼 제품 맥락이 있는 화면은 generic route error page로 대체하지 않는다.
````

- [ ] **Step 2: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/development/architecture.md
```

Expected: PASS.

- [ ] **Step 3: Commit docs**

Run:

```bash
git add docs/development/architecture.md
git commit -m "docs: document api error contract"
```

## Task 7: Full Verification and Integration Review

**Files:**
- No new files unless a previous task revealed a concrete compile or test failure.

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 2: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 3: Run end-to-end checks for route/auth/BFF behavior**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. This is required because the change touches route/auth/BFF behavior.

- [ ] **Step 4: Inspect final diff for safety and scope**

Run:

```bash
git diff --stat HEAD~6..HEAD
git diff HEAD~6..HEAD -- docs/development/architecture.md front/functions front/shared/api front/src/app server/src/main/kotlin/com/readmates/shared
rg -n "READMATES_BFF_SECRET|BEGIN [A-Z ]*PRIVATE KEY|token=[A-Za-z0-9_-]{16,}|password=|OCID|kws/source" docs/development/architecture.md front server
```

Expected:

- Diff only touches the planned server, BFF, frontend API, router, test, and architecture-doc files.
- No real secrets, private deployment IDs, local absolute paths in committed public docs or source changes.
- No `x-readmates-*` response header exposure is introduced.

- [ ] **Step 5: Commit verification fixes if needed**

If Step 1, Step 2, Step 3, or Step 4 required a code or doc fix, run the relevant targeted test again, then commit:

```bash
git add <fixed-files>
git commit -m "fix: stabilize error boundary contract"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage:
  - Server `{ code, message, status }` contract: Tasks 1 and 2.
  - BFF-originated JSON errors: Task 3.
  - Frontend parser and fallback behavior: Task 4.
  - Route boundaries and not-found pages: Task 5.
  - Product-specific unavailable states stay owned by features: Task 5 wrappers preserve feature-specific unavailable routes and only centralize generic route errors.
  - Architecture docs: Task 6.
  - Full checks: Task 7.
- Type consistency:
  - Server body type is `ApiErrorResponse(code: String, message: String, status: Int)`.
  - BFF body type is `ApiErrorResponse = { code: string; message: string; status: number }`.
  - Frontend parser exposes `ReadmatesApiError.status`, `ReadmatesApiError.code`, and `ReadmatesApiError.fallback`.
- Scope control:
  - No request-id field is added.
  - No observability platform is added.
  - No product-specific unavailable page is replaced by a generic page.

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class SessionApplicationErrorHandlerTest {
    @Test
    fun `maps session not found to JSON 404`() {
        val response = SessionApplicationErrorHandler().handleNotFound()

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
    fun `maps invalid schedule to JSON 400`() {
        val response = SessionApplicationErrorHandler().handleBadRequest()

        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "INVALID_REQUEST",
                message = "세션 요청 값을 확인해 주세요.",
                status = 400,
            ),
        )
    }

    @Test
    fun `maps remaining lifecycle conflicts to JSON 409`() {
        val response = SessionApplicationErrorHandler().handleConflict()

        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "CONFLICT",
                message = "요청한 작업이 현재 세션 상태와 충돌합니다.",
                status = 409,
            ),
        )
    }

    @Test
    fun `maps open already exists to SESSION_OPEN_ALREADY_EXISTS with session id`() {
        val openId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000307")
        val response =
            SessionApplicationErrorHandler().handleOpenSessionExists(
                OpenSessionAlreadyExistsException(openId),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "SESSION_OPEN_ALREADY_EXISTS",
                message = "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
                status = 409,
                openSessionId = openId.toString(),
            ),
        )
    }

    @Test
    fun `maps reopen not allowed to SESSION_REOPEN_NOT_ALLOWED`() {
        val response = SessionApplicationErrorHandler().handleReopenNotAllowed()
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body?.code).isEqualTo("SESSION_REOPEN_NOT_ALLOWED")
        assertThat(response.body?.message).isEqualTo("마감된 세션만 다시 열 수 있습니다.")
        assertThat(response.body?.openSessionId).isNull()
    }

    @Test
    fun `maps unpublish not allowed to SESSION_UNPUBLISH_NOT_ALLOWED`() {
        val response = SessionApplicationErrorHandler().handleUnpublishNotAllowed()
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body?.code).isEqualTo("SESSION_UNPUBLISH_NOT_ALLOWED")
        assertThat(response.body?.message).isEqualTo("공개된 세션만 공개를 취소할 수 있습니다.")
        assertThat(response.body?.openSessionId).isNull()
    }

    @Test
    fun `maps return to draft not allowed to SESSION_RETURN_TO_DRAFT_NOT_ALLOWED`() {
        val response = SessionApplicationErrorHandler().handleReturnToDraftNotAllowed()
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body?.code).isEqualTo("SESSION_RETURN_TO_DRAFT_NOT_ALLOWED")
        assertThat(response.body?.message).isEqualTo("진행 중인 세션만 예정으로 되돌릴 수 있습니다.")
        assertThat(response.body?.openSessionId).isNull()
    }

    @Test
    fun `maps open already exists without id to SESSION_OPEN_ALREADY_EXISTS`() {
        val response =
            SessionApplicationErrorHandler().handleOpenSessionExists(
                OpenSessionAlreadyExistsException(),
            )
        assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "SESSION_OPEN_ALREADY_EXISTS",
                message = "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
                status = 409,
            ),
        )
    }
}

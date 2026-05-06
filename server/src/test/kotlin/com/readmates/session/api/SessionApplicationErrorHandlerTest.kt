package com.readmates.session.adapter.`in`.web

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
    fun `maps open conflict to JSON 409`() {
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
}

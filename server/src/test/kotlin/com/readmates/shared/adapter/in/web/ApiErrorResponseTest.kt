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

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
            ArchiveApplicationException(
                ArchiveApplicationError.MEMBER_APP_ACCESS_REQUIRED,
                "Member app access required",
            ),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "PERMISSION_DENIED",
                message = "멤버 공간에 접근할 권한이 없습니다.",
                status = 403,
            ),
        )
    }
}

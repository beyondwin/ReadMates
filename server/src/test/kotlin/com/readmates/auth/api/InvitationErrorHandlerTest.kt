package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
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
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "INVITATION_EXPIRED",
                message = "초대 링크가 만료되었습니다.",
                status = 409,
            ),
        )
    }

    @Test
    fun `maps auth application errors to shared JSON body`() {
        val response = InvitationErrorHandler().handleAuthApplicationException(
            AuthApplicationException(AuthApplicationError.CLUB_NOT_FOUND, "Club not found"),
        )

        assertThat(response.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
        assertThat(response.body).isEqualTo(
            ApiErrorResponse(
                code = "CLUB_NOT_FOUND",
                message = "클럽을 찾을 수 없습니다.",
                status = 404,
            ),
        )
    }
}

package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AcceptInvitationUseCaseTest {
    @Test
    fun `keeps invitation pending when google email does not match`() {
        val result = AcceptInvitationUseCase.validateEmailMatch(
            invitedEmail = "member@example.com",
            googleEmail = "other@example.com",
        )

        assertEquals(InvitationStatus.PENDING, result)
    }
}

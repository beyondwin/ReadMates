package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import org.springframework.stereotype.Service

@Service
class AcceptInvitationUseCase {
    companion object {
        fun validateEmailMatch(invitedEmail: String, googleEmail: String): InvitationStatus {
            return if (invitedEmail.equals(googleEmail, ignoreCase = true)) {
                InvitationStatus.ACCEPTED
            } else {
                InvitationStatus.PENDING
            }
        }
    }
}

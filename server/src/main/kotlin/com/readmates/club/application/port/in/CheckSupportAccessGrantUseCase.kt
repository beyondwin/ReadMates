package com.readmates.club.application.port.`in`

import java.util.UUID

interface CheckSupportAccessGrantUseCase {
    fun synthesizeHostCurrentMember(
        userId: UUID,
        email: String,
        clubId: UUID,
        clubSlug: String,
        clubName: String,
    ): SupportMemberSynthesis?

    companion object {
        const val SUPPORT_SYNTHESIS_REQUEST_ATTR = "com.readmates.support.synthesis"
    }
}

data class SupportMemberSynthesis(
    val membershipProxyId: UUID,
    val displayName: String,
    val accountName: String,
)

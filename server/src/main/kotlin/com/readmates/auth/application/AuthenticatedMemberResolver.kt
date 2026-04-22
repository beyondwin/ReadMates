package com.readmates.auth.application

import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component

@Component
class AuthenticatedMemberResolver(
    private val memberAccountRepository: MemberAccountRepository,
) {
    fun resolve(authentication: Authentication?): CurrentMember? {
        val email = authentication.emailOrNull() ?: return null
        return memberAccountRepository.findActiveMemberByEmail(email)
    }

    fun resolveByUserId(userId: String): CurrentMember? =
        memberAccountRepository.findActiveMemberByUserId(userId)
}

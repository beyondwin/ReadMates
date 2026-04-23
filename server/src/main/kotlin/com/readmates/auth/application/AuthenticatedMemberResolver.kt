package com.readmates.auth.application

import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component

@Component
class AuthenticatedMemberResolver(
    private val memberAccountStore: MemberAccountStorePort,
) {
    fun resolve(authentication: Authentication?): CurrentMember? {
        val email = authentication.emailOrNull() ?: return null
        return memberAccountStore.findActiveMemberByEmail(email)
    }

    fun resolveByUserId(userId: String): CurrentMember? =
        memberAccountStore.findActiveMemberByUserId(userId)
}

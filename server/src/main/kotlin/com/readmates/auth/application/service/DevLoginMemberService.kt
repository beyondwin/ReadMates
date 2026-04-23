package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.DevLoginMemberUseCase
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class DevLoginMemberService(
    private val memberAccountStore: MemberAccountStorePort,
) : DevLoginMemberUseCase {
    override fun findDevSeedActiveMemberByEmail(email: String): CurrentMember? =
        memberAccountStore.findDevSeedActiveMemberByEmail(email)
}

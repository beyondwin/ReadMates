package com.readmates.auth.application.service

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.auth.application.port.`in`.DevLoginMemberUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class DevLoginMemberService(
    private val memberAccountRepository: MemberAccountRepository,
) : DevLoginMemberUseCase {
    override fun findDevSeedActiveMemberByEmail(email: String): CurrentMember? =
        memberAccountRepository.findDevSeedActiveMemberByEmail(email)
}

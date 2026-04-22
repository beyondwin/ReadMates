package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class JdbcCurrentMemberAdapter(
    private val memberAccountRepository: MemberAccountRepository,
) : LoadCurrentMemberPort {
    override fun loadActiveMemberByEmail(email: String): CurrentMember? =
        memberAccountRepository.findActiveMemberByEmail(email)
}

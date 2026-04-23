package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class JdbcCurrentMemberAdapter(
    private val memberAccountStore: MemberAccountStorePort,
) : LoadCurrentMemberPort {
    override fun loadActiveMemberByEmail(email: String): CurrentMember? =
        memberAccountStore.findActiveMemberByEmail(email)
}

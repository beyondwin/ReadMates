package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.LoadCurrentMemberPort
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component

@Component
class JdbcCurrentMemberAdapter(
    private val memberIdentityLookup: MemberIdentityLookupPort,
) : LoadCurrentMemberPort {
    override fun loadActiveMemberByEmail(email: String): CurrentMember? = memberIdentityLookup.findActiveMemberByEmail(email)
}

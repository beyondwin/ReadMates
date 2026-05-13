package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.DevLoginMemberUseCase
import com.readmates.auth.application.port.out.DevSeedMemberLookupPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class DevLoginMemberService(
    private val devSeedMemberLookup: DevSeedMemberLookupPort,
) : DevLoginMemberUseCase {
    override fun findDevSeedActiveMemberByEmail(email: String): CurrentMember? =
        devSeedMemberLookup.findDevSeedActiveMemberByEmail(email)
}

package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember

interface DevSeedMemberLookupPort {
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?
}

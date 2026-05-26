package com.readmates.auth.application.port.out

import com.readmates.auth.application.model.DevSeedLoginIdentity
import com.readmates.shared.security.CurrentMember

interface DevSeedMemberLookupPort {
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?

    fun findDevSeedLoginIdentityByEmail(email: String): DevSeedLoginIdentity?
}

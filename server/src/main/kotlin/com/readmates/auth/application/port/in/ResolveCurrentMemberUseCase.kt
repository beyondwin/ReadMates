package com.readmates.auth.application.port.`in`

import com.readmates.shared.security.CurrentMember

interface ResolveCurrentMemberUseCase {
    fun resolveByEmail(email: String): CurrentMember?
}

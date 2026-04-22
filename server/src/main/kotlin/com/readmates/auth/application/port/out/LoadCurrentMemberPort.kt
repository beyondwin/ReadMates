package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember

interface LoadCurrentMemberPort {
    fun loadActiveMemberByEmail(email: String): CurrentMember?
}

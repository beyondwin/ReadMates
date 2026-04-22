package com.readmates.session.application.port.out

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.shared.security.CurrentMember

interface LoadCurrentSessionPort {
    fun loadCurrentSession(member: CurrentMember): CurrentSessionPayload
}

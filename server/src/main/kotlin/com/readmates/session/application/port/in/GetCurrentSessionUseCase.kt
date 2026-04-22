package com.readmates.session.application.port.`in`

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.shared.security.CurrentMember

interface GetCurrentSessionUseCase {
    fun currentSession(member: CurrentMember): CurrentSessionPayload
}

package com.readmates.sessionclosing.application.port.out

import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface LoadSessionClosingStatusPort {
    fun loadHostSessionClosingSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionClosingSnapshot?
}

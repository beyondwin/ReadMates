package com.readmates.sessionclosing.application.port.`in`

import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface GetHostSessionClosingStatusUseCase {
    fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus
}

package com.readmates.session.application.port.out

import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface HostSessionProjectionPort {
    fun loadProjection(
        host: CurrentMember,
        sessionId: UUID,
        includeTrashed: Boolean = false,
    ): HostProjectionSnapshot?

    fun loadVersionVector(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionVersionVector?

    fun attendanceSnapshotId(
        host: CurrentMember,
        sessionId: UUID,
    ): String
}

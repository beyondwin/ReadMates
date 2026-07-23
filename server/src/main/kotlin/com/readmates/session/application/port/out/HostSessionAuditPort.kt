package com.readmates.session.application.port.out

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface HostSessionAuditPort {
    fun loadBasicSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionBasicAuditSnapshot?

    fun loadAttendanceStates(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: Set<UUID>,
    ): Map<UUID, String>

    fun recordBasicUpdate(
        host: CurrentMember,
        sessionId: UUID,
        changedFields: Set<String>,
    )

    fun recordAttendanceUpdate(
        host: CurrentMember,
        sessionId: UUID,
        transitions: List<HostAttendanceAuditTransition>,
    )

    class Noop : HostSessionAuditPort {
        override fun loadBasicSnapshot(
            host: CurrentMember,
            sessionId: UUID,
        ): HostSessionBasicAuditSnapshot? = null

        override fun loadAttendanceStates(
            host: CurrentMember,
            sessionId: UUID,
            membershipIds: Set<UUID>,
        ): Map<UUID, String> = emptyMap()

        override fun recordBasicUpdate(
            host: CurrentMember,
            sessionId: UUID,
            changedFields: Set<String>,
        ) = Unit

        override fun recordAttendanceUpdate(
            host: CurrentMember,
            sessionId: UUID,
            transitions: List<HostAttendanceAuditTransition>,
        ) = Unit
    }
}

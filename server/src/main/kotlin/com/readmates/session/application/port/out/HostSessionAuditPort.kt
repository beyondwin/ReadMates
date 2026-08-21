package com.readmates.session.application.port.out

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionChangeReceipt
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
        before: HostSessionBasicAuditSnapshot,
        after: HostSessionBasicAuditSnapshot,
        changedFields: Set<String>,
        restoredFromChangeId: UUID? = null,
    ): HostSessionChangeReceipt

    fun recordAttendanceUpdate(
        host: CurrentMember,
        sessionId: UUID,
        transitions: List<HostAttendanceAuditTransition>,
        restoredFromChangeId: UUID? = null,
    ): HostSessionChangeReceipt

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
            before: HostSessionBasicAuditSnapshot,
            after: HostSessionBasicAuditSnapshot,
            changedFields: Set<String>,
            restoredFromChangeId: UUID?,
        ): HostSessionChangeReceipt =
            HostSessionChangeReceipt(
                changeId = UUID.randomUUID(),
                kind = HostSessionChangeKind.BASIC_INFO,
                undoAvailable = false,
            )

        override fun recordAttendanceUpdate(
            host: CurrentMember,
            sessionId: UUID,
            transitions: List<HostAttendanceAuditTransition>,
            restoredFromChangeId: UUID?,
        ): HostSessionChangeReceipt =
            HostSessionChangeReceipt(
                changeId = UUID.randomUUID(),
                kind = HostSessionChangeKind.ATTENDANCE,
                undoAvailable = false,
            )
    }
}

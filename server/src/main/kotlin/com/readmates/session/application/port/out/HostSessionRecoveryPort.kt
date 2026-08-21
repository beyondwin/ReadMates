package com.readmates.session.application.port.out

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class HostSessionRecoverableChange(
    val changeId: UUID,
    val sessionId: UUID,
    val kind: HostSessionChangeKind,
    val changedFields: List<String>,
    val before: HostSessionBasicAuditSnapshot?,
    val after: HostSessionBasicAuditSnapshot?,
    val transitions: List<HostAttendanceAuditTransition>,
    val alreadyRestored: Boolean,
)

data class HostSessionRestoreCurrentState(
    val basic: HostSessionBasicAuditSnapshot?,
    val attendance: Map<UUID, String>,
)

data class HostSessionRestoreLock(
    val change: HostSessionRecoverableChange,
    val current: HostSessionRestoreCurrentState,
)

interface HostSessionRecoveryPort {
    fun loadChange(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
    ): HostSessionRecoverableChange?

    fun loadCurrentState(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: Set<UUID>,
    ): HostSessionRestoreCurrentState

    fun lockForRestore(
        host: CurrentMember,
        sessionId: UUID,
        changeId: UUID,
    ): HostSessionRestoreLock?
}

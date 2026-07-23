package com.readmates.session.application.service

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class HostSessionAttendanceService(
    private val attendancePort: HostSessionAttendancePort,
    private val auditPort: HostSessionAuditPort = HostSessionAuditPort.Noop(),
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : ConfirmAttendanceUseCase {
    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        val membershipIds =
            command.entries.mapNotNull {
                runCatching { UUID.fromString(it.membershipId) }.getOrNull()
            }
        val before = auditPort.loadAttendanceStates(command.host, command.sessionId, membershipIds.toSet())
        return attendancePort.confirmAttendance(command).also {
            val transitions =
                command.entries.mapNotNull { entry ->
                    val membershipId =
                        runCatching { UUID.fromString(entry.membershipId) }.getOrNull()
                            ?: return@mapNotNull null
                    val from = before[membershipId] ?: return@mapNotNull null
                    entry.attendanceStatus.takeIf { status -> status != from }?.let { to ->
                        HostAttendanceAuditTransition(
                            membershipId = membershipId.toString(),
                            from = from,
                            to = to,
                        )
                    }
                }
            if (transitions.isNotEmpty()) {
                auditPort.recordAttendanceUpdate(command.host, command.sessionId, transitions)
            }
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        }
    }
}

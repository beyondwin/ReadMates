package com.readmates.session.application.service

import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.requireHost
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.mutation.application.model.HostMutationOperation
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class HostSessionAttendanceService(
    private val attendancePort: HostSessionAttendancePort,
    private val auditPort: HostSessionAuditPort = HostSessionAuditPort.Noop(),
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val mutations: HostSessionMutationCoordinator? = null,
) : ConfirmAttendanceUseCase {
    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        val coordinator = mutations ?: return confirmOnce(command)
        val operation =
            if (command.entries.size > 1) {
                HostMutationOperation.SESSION_ATTENDANCE_BULK
            } else {
                HostMutationOperation.SESSION_ATTENDANCE_SINGLE
            }
        return coordinator.execute(
            host = command.host,
            operation = operation,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.attendance(command),
            mutate = { HostMutationOutcome(command.sessionId, confirmOnce(command)) },
            replay = { _, _ ->
                HostAttendanceResponse(sessionId = command.sessionId.toString(), count = command.entries.size)
            },
        )
    }

    private fun confirmOnce(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        requireHost(command.host)
        if (command.entries.size > 1 && command.expectedParticipantSetRevision == null) {
            throw InvalidSessionScheduleException()
        }
        val membershipIds =
            command.entries.mapNotNull {
                runCatching { UUID.fromString(it.membershipId) }.getOrNull()
            }
        val before = auditPort.loadAttendanceStates(command.host, command.sessionId, membershipIds.toSet())
        val attendance = attendancePort.confirmAttendance(command)
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
            val receipt = auditPort.recordAttendanceUpdate(command.host, command.sessionId, transitions)
            epochPort.bump(command.host.clubId, HostListEpochKind.MEETING)
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            return attendance.copy(changeReceipt = receipt)
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return attendance
    }
}

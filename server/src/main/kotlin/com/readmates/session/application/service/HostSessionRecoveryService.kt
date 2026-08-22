package com.readmates.session.application.service

import com.readmates.session.application.HostSessionChangeNotRestorableException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRestoreHashes
import com.readmates.session.application.HostSessionRestoreStaleException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.evaluate
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionChangeReceipt
import com.readmates.session.application.model.HostSessionRestorePreview
import com.readmates.session.application.port.`in`.PreviewHostSessionRestoreCommand
import com.readmates.session.application.port.`in`.PreviewHostSessionRestoreUseCase
import com.readmates.session.application.port.`in`.RestoreHostSessionCommand
import com.readmates.session.application.port.`in`.RestoreHostSessionUseCase
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionRecoverableChange
import com.readmates.session.application.port.out.HostSessionRecoveryPort
import com.readmates.session.application.port.out.HostSessionRestoreCurrentState
import com.readmates.session.application.port.out.HostSessionRestoreLock
import com.readmates.session.application.requireHost
import com.readmates.session.application.restoreAttendanceTransitions
import com.readmates.session.application.toAttendanceCommand
import com.readmates.session.application.toUpdateCommand
import com.readmates.session.application.transitionMembershipIds
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionRecoveryService(
    private val recoveryPort: HostSessionRecoveryPort,
    private val auditPort: HostSessionAuditPort,
    private val draftPort: HostSessionDraftPort,
    private val attendancePort: HostSessionAttendancePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
) : PreviewHostSessionRestoreUseCase,
    RestoreHostSessionUseCase {
    @Transactional(readOnly = true)
    override fun preview(command: PreviewHostSessionRestoreCommand): HostSessionRestorePreview {
        requireHost(command.host)
        val change =
            recoveryPort.loadChange(command.host, command.sessionId, command.changeId)
                ?: throw HostSessionNotFoundException()
        val current =
            recoveryPort.loadCurrentState(
                command.host,
                command.sessionId,
                change.transitionMembershipIds(),
            )
        return change.toPreview(current)
    }

    @Transactional
    @Suppress("ThrowsCount")
    override fun restore(command: RestoreHostSessionCommand): HostSessionChangeReceipt {
        requireHost(command.host)
        if (!HostSessionRestoreHashes.isDigest(command.expectedCurrentHash)) {
            throw HostSessionRestoreStaleException()
        }
        val locked =
            recoveryPort.lockForRestore(command.host, command.sessionId, command.changeId)
                ?: throw HostSessionNotFoundException()
        val evaluation = locked.change.evaluate(locked.current)
        if (!evaluation.canRestore) {
            throw HostSessionChangeNotRestorableException(evaluation.blockedReason ?: SNAPSHOT_UNAVAILABLE)
        }
        if (!HostSessionRestoreHashes.matches(command.expectedCurrentHash, evaluation.hashValues)) {
            throw HostSessionRestoreStaleException()
        }
        val receipt = applyRestore(command, locked)
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return receipt
    }

    private fun applyRestore(
        command: RestoreHostSessionCommand,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt =
        if (locked.change.kind == HostSessionChangeKind.ATTENDANCE) {
            applyAttendanceRestore(command, locked)
        } else {
            applyBasicRestore(command, locked)
        }

    private fun applyBasicRestore(
        command: RestoreHostSessionCommand,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt {
        val current = locked.current.basic ?: throw HostSessionChangeNotRestorableException(SNAPSHOT_UNAVAILABLE)
        val expected =
            command.expectedSessionRevision
                ?: throw HostSessionRestoreStaleException()
        val update = locked.change.toUpdateCommand(command.host, current).copy(expectedSessionRevision = expected)
        draftPort.update(update)
        epochPort.bump(command.host.clubId, HostListEpochKind.MEETING, HostListEpochKind.RECORD)
        val after = auditPort.loadBasicSnapshot(command.host, locked.change.sessionId) ?: current
        return auditPort.recordBasicUpdate(
            host = command.host,
            sessionId = locked.change.sessionId,
            before = current,
            after = after,
            changedFields = locked.change.changedFields.toSet(),
            restoredFromChangeId = locked.change.changeId,
        )
    }

    private fun applyAttendanceRestore(
        command: RestoreHostSessionCommand,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt {
        val expectedAttendanceRevision =
            command.expectedAttendanceRevision ?: throw InvalidSessionScheduleException()
        val attendanceCommand = locked.change.toAttendanceCommand(command.host, expectedAttendanceRevision)
        val scoped =
            if (command.membershipId == null) {
                attendanceCommand
            } else {
                attendanceCommand.copy(
                    entries =
                        attendanceCommand.entries.filter { entry ->
                            entry.membershipId == command.membershipId.toString()
                        },
                )
            }
        if (scoped.entries.isEmpty()) {
            throw InvalidSessionScheduleException()
        }
        val withSetRevision =
            scoped.copy(
                expectedParticipantSetRevision =
                    locked.participantSetRevision.takeIf { scoped.entries.size > 1 },
            )
        attendancePort.confirmAttendance(withSetRevision)
        epochPort.bump(command.host.clubId, HostListEpochKind.MEETING)
        return auditPort.recordAttendanceUpdate(
            host = command.host,
            sessionId = locked.change.sessionId,
            transitions = locked.change.restoreAttendanceTransitions(locked.current.attendance),
            restoredFromChangeId = locked.change.changeId,
        )
    }
}

private const val SNAPSHOT_UNAVAILABLE = "SNAPSHOT_UNAVAILABLE"

private fun HostSessionRecoverableChange.toPreview(current: HostSessionRestoreCurrentState): HostSessionRestorePreview {
    val evaluation = evaluate(current)
    return HostSessionRestorePreview(
        sessionId = sessionId,
        changeId = changeId,
        kind = kind,
        items = evaluation.items,
        expectedCurrentHash = HostSessionRestoreHashes.digest(evaluation.hashValues),
        canRestore = evaluation.canRestore,
        blockedReason = evaluation.blockedReason,
    )
}

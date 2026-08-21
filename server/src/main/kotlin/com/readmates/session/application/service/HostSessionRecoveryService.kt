package com.readmates.session.application.service

import com.readmates.session.application.HostSessionChangeNotRestorableException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRestoreHashes
import com.readmates.session.application.HostSessionRestoreStaleException
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
        val receipt = applyRestore(command.host, locked)
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return receipt
    }

    private fun applyRestore(
        host: CurrentMember,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt =
        if (locked.change.kind == HostSessionChangeKind.ATTENDANCE) {
            applyAttendanceRestore(host, locked)
        } else {
            applyBasicRestore(host, locked)
        }

    private fun applyBasicRestore(
        host: CurrentMember,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt {
        val current = locked.current.basic ?: throw HostSessionChangeNotRestorableException(SNAPSHOT_UNAVAILABLE)
        val command = locked.change.toUpdateCommand(host, current)
        draftPort.update(command)
        val after = auditPort.loadBasicSnapshot(host, locked.change.sessionId) ?: current
        return auditPort.recordBasicUpdate(
            host = host,
            sessionId = locked.change.sessionId,
            before = current,
            after = after,
            changedFields = locked.change.changedFields.toSet(),
            restoredFromChangeId = locked.change.changeId,
        )
    }

    private fun applyAttendanceRestore(
        host: CurrentMember,
        locked: HostSessionRestoreLock,
    ): HostSessionChangeReceipt {
        attendancePort.confirmAttendance(locked.change.toAttendanceCommand(host))
        return auditPort.recordAttendanceUpdate(
            host = host,
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

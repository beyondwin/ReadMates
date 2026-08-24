package com.readmates.session.application.service

import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionTrashResponse
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.toTrashResponse
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionDeletionTransaction(
    private val deletionPort: HostSessionDeletionPort,
    private val lifecycleAudit: HostSessionLifecycleAuditPort,
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
) {
    @Transactional
    fun delete(command: HostSessionIdCommand): HostSessionTrashResponse {
        val assessment = deletionPort.lockAndAssess(command)
        if (!assessment.canDelete) {
            throw HostSessionDeletionBlockedException(assessment.blockers)
        }
        val trashed = deletionPort.moveToTrash(command, assessment.target)
        lifecycleAudit.record(
            HostSessionLifecycleAuditEntry(
                host = command.host,
                sessionId = command.sessionId,
                action = HostSessionLifecycleAction.DELETED,
                fromState = assessment.target.state,
                toState = null,
                reasonCode = HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
                reasonNote = null,
            ),
        )
        epochPort.bump(command.host.clubId, HostListEpochKind.MEETING, HostListEpochKind.RECORD)
        return assessment.toTrashResponse(
            deletedAt = trashed.deletedAt.toString(),
            purgeAfter = trashed.purgeAfter.toString(),
            sessionRevision = trashed.sessionRevision,
        )
    }
}

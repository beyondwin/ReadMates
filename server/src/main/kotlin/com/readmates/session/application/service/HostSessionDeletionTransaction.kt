package com.readmates.session.application.service

import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.toDeletionResponse
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionDeletionTransaction(
    private val deletionPort: HostSessionDeletionPort,
    private val lifecycleAudit: HostSessionLifecycleAuditPort,
) {
    @Transactional
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse {
        val assessment = deletionPort.lockAndAssess(command)
        if (!assessment.canDelete) {
            throw HostSessionDeletionBlockedException(assessment.blockers)
        }
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
        check(deletionPort.deleteAssessed(command, assessment.target))
        return assessment.toDeletionResponse()
    }
}

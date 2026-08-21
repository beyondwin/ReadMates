package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand

interface HostSessionDeletionPort {
    fun assess(command: HostSessionIdCommand): HostSessionDeletionAssessment

    fun lockAndAssess(command: HostSessionIdCommand): HostSessionDeletionAssessment

    fun deleteAssessed(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ): Boolean
}

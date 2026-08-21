package com.readmates.session.application.port.out

import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashPurgeTarget
import com.readmates.session.application.model.HostSessionTrashRecord
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.util.UUID

@Suppress("TooManyFunctions")
interface HostSessionDeletionPort {
    fun assess(command: HostSessionIdCommand): HostSessionDeletionAssessment

    fun lockAndAssess(command: HostSessionIdCommand): HostSessionDeletionAssessment

    fun deleteAssessed(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ): Boolean

    fun moveToTrash(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ): HostSessionTrashRecord

    fun listTrash(
        host: CurrentMember,
        pageRequest: PageRequest,
    ): HostSessionTrashPage

    fun findTrash(command: HostSessionIdCommand): HostSessionTrashRecord?

    fun lockClub(clubId: UUID)

    fun lockTrash(command: HostSessionIdCommand): HostSessionTrashRecord?

    fun restoreTrash(command: HostSessionIdCommand): Boolean

    fun findOpenSessionId(clubId: UUID): UUID?

    fun deletionCounts(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionDeletionCounts

    fun lockExpiredForPurge(limit: Int): List<HostSessionTrashPurgeTarget>

    fun purgeLocked(target: HostSessionTrashPurgeTarget): Boolean

    fun latestDeletedOrRestoredAction(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionLifecycleAction?
}

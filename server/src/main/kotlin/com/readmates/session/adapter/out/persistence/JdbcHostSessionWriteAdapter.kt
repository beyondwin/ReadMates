package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashPurgeTarget
import com.readmates.session.application.model.HostSessionTrashRecord
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
@Suppress("TooManyFunctions")
class JdbcHostSessionWriteAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val deletionQueries: HostSessionDeletionQueries,
    private val confirmationProperties: HostActionConfirmationProperties,
) : HostSessionQueryPort,
    HostSessionDraftPort,
    HostSessionLifecyclePort,
    HostSessionDeletionPort,
    HostSessionAttendancePort,
    HostSessionPublicationPort {
    private val attentionQueries = HostSessionAttentionQueries()
    private val queries = HostSessionQueries(attentionQueries)
    private val scheduleDefaultsQueries = HostSessionScheduleDefaultsQueries()
    private val writeQueries = HostSessionWriteQueries(jdbcTemplate, queries)
    private val writePolicy = HostSessionWritePolicy
    private val draftWrites = HostSessionDraftWriteOperations(jdbcTemplate, writeQueries, writePolicy)
    private val attendance = HostSessionAttendanceWriteOperations(jdbcTemplate, writeQueries, writePolicy)
    private val publication = HostSessionPublicationWriteOperations(jdbcTemplate, writeQueries, writePolicy)
    private val lifecycle = HostSessionLifecycleWriteOperations(jdbcTemplate, writeQueries, writePolicy)

    override fun create(command: HostSessionCommand) = draftWrites.create(command)

    override fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): HostSessionListPage =
        if (query.needsAttention == true) {
            attentionQueries.list(jdbcTemplate, host, pageRequest, query)
        } else {
            queries.list(jdbcTemplate, host, pageRequest, query)
        }

    override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> = queries.upcoming(jdbcTemplate, member)

    override fun scheduleDefaults(host: CurrentMember) = scheduleDefaultsQueries.load(jdbcTemplate, host)

    override fun detail(command: HostSessionIdCommand) = queries.findHostSession(jdbcTemplate, command.host, command.sessionId)

    override fun update(command: UpdateHostSessionCommand) = draftWrites.update(command)

    override fun assess(command: HostSessionIdCommand) = deletionQueries.assess(command, lock = false)

    override fun lockAndAssess(command: HostSessionIdCommand) = deletionQueries.assess(command, lock = true)

    override fun deleteAssessed(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ) = deletionQueries.deleteAssessed(command, target)

    override fun moveToTrash(
        command: HostSessionIdCommand,
        target: HostSessionDeletionTarget,
    ) = deletionQueries.moveToTrash(command, target)

    override fun listTrash(
        host: CurrentMember,
        pageRequest: PageRequest,
    ): HostSessionTrashPage = deletionQueries.listTrash(host, pageRequest)

    override fun findTrash(command: HostSessionIdCommand): HostSessionTrashRecord? = deletionQueries.findTrash(command)

    override fun lockClub(clubId: UUID) = deletionQueries.lockClub(clubId)

    override fun lockTrash(command: HostSessionIdCommand): HostSessionTrashRecord? = deletionQueries.lockTrash(command)

    override fun restoreTrash(command: HostSessionIdCommand): Boolean = deletionQueries.restoreTrash(command)

    override fun findOpenSessionId(clubId: UUID): UUID? = deletionQueries.findOpenSessionId(clubId)

    override fun deletionCounts(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionDeletionCounts = deletionQueries.deletionCounts(clubId, sessionId)

    override fun lockExpiredForPurge(limit: Int): List<HostSessionTrashPurgeTarget> = deletionQueries.lockExpiredForPurge(limit)

    override fun purgeLocked(target: HostSessionTrashPurgeTarget): Boolean = deletionQueries.purgeLocked(target)

    override fun latestDeletedOrRestoredAction(
        clubId: UUID,
        sessionId: UUID,
    ): HostSessionLifecycleAction? = deletionQueries.latestDeletedOrRestoredAction(clubId, sessionId)

    override fun confirmAttendance(command: ConfirmAttendanceCommand) = attendance.confirm(command)

    override fun upsertPublication(command: UpsertPublicationCommand) =
        publication.upsert(
            command,
            stagingRequired = confirmationProperties.required,
        )

    override fun dashboard(host: CurrentMember) = queries.hostDashboard(jdbcTemplate, host)

    override fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot =
        writeQueries.lockVisibilitySnapshot(command)

    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) = draftWrites.updateVisibility(command)

    override fun open(command: HostSessionIdCommand): HostSessionTransitionResult = lifecycle.open(command)

    override fun close(command: HostSessionIdCommand): HostSessionTransitionResult = lifecycle.close(command)

    override fun publish(command: HostSessionIdCommand): HostSessionTransitionResult = lifecycle.publish(command)

    override fun reopen(command: HostSessionIdCommand): HostSessionTransitionResult = lifecycle.reopen(command)

    override fun unpublish(command: HostSessionIdCommand): HostSessionTransitionResult = lifecycle.unpublish(command)

    override fun returnToDraft(command: HostSessionIdCommand) = lifecycle.returnToDraft(command)
}

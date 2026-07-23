package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
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
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcHostSessionWriteAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val deletionQueries: HostSessionDeletionQueries,
) : HostSessionQueryPort,
    HostSessionDraftPort,
    HostSessionLifecyclePort,
    HostSessionDeletionPort,
    HostSessionAttendancePort,
    HostSessionPublicationPort {
    private val queries = HostSessionQueries()
    private val writeOperations = HostSessionWriteOperations(queries)

    override fun create(command: HostSessionCommand) =
        writeOperations.createDraftSession(
            jdbcTemplate,
            command.host,
            command,
        )

    override fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): CursorPage<HostSessionListItem> = queries.list(jdbcTemplate, host, pageRequest, query)

    override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> = queries.upcoming(jdbcTemplate, member)

    override fun detail(command: HostSessionIdCommand) = queries.findHostSession(jdbcTemplate, command.host, command.sessionId)

    override fun update(command: UpdateHostSessionCommand) =
        writeOperations.updateHostSession(jdbcTemplate, command.host, command.sessionId, command.session)

    override fun deletionPreview(command: HostSessionIdCommand) =
        deletionQueries.previewOpenSessionDeletion(command.host, command.sessionId)

    override fun delete(command: HostSessionIdCommand) =
        deletionQueries.deleteOpenHostSession(
            command.host,
            command.sessionId,
        )

    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        writeOperations.confirmHostAttendance(
            jdbcTemplate,
            command,
        )

    override fun upsertPublication(command: UpsertPublicationCommand) =
        writeOperations.upsertHostPublication(
            jdbcTemplate,
            command,
        )

    override fun dashboard(host: CurrentMember) = queries.hostDashboard(jdbcTemplate, host)

    override fun detailForVisibility(command: HostSessionIdCommand): HostSessionDetailResponse =
        queries.findHostSession(jdbcTemplate, command.host, command.sessionId)

    @Suppress("MaxLineLength")
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) = writeOperations.updateVisibility(jdbcTemplate, command)

    override fun open(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.open(
            jdbcTemplate,
            command,
        )

    override fun close(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.close(
            jdbcTemplate,
            command,
        )

    override fun publish(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.publish(
            jdbcTemplate,
            command,
        )
}

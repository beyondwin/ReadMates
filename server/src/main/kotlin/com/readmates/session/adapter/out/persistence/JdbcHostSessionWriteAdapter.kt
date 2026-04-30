package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
class JdbcHostSessionWriteAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    private val deletionQueries: HostSessionDeletionQueries,
) : HostSessionWritePort {
    private val queries = HostSessionQueries()
    private val writeOperations = HostSessionWriteOperations(queries)

    @Transactional
    override fun create(command: HostSessionCommand) =
        writeOperations.createDraftSession(jdbcTemplate(), command.host, command)

    override fun list(host: CurrentMember, pageRequest: PageRequest): CursorPage<HostSessionListItem> =
        queries.list(jdbcTemplate(), host, pageRequest)

    override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> =
        queries.upcoming(jdbcTemplate(), member)

    override fun detail(command: HostSessionIdCommand) =
        queries.findHostSession(jdbcTemplate(), command.host, command.sessionId)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        writeOperations.updateHostSession(jdbcTemplate(), command.host, command.sessionId, command.session)

    override fun deletionPreview(command: HostSessionIdCommand) =
        deletionQueries.previewOpenSessionDeletion(command.host, command.sessionId)

    @Transactional
    override fun delete(command: HostSessionIdCommand) =
        deletionQueries.deleteOpenHostSession(command.host, command.sessionId)

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        writeOperations.confirmHostAttendance(jdbcTemplate(), command)

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) =
        writeOperations.upsertHostPublication(jdbcTemplate(), command)

    override fun dashboard(host: CurrentMember) =
        queries.hostDashboard(jdbcTemplate(), host)

    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse =
        writeOperations.updateVisibility(jdbcTemplate(), command)

    @Transactional
    override fun open(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.open(jdbcTemplate(), command)

    @Transactional
    override fun close(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.close(jdbcTemplate(), command)

    @Transactional
    override fun publish(command: HostSessionIdCommand): HostSessionTransitionResult =
        writeOperations.publish(jdbcTemplate(), command)

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateOrThrow(jdbcTemplateProvider)
}

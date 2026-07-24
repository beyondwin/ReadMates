package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionNotFoundException
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
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
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
    ): HostSessionListPage = queries.list(jdbcTemplate, host, pageRequest, query)

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

    override fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            command.host.clubId.dbString(),
        )
        return writeOperations.confirmHostAttendance(
            jdbcTemplate,
            command,
        )
    }

    override fun upsertPublication(command: UpsertPublicationCommand) =
        writeOperations.upsertHostPublication(
            jdbcTemplate,
            command,
            stagingRequired = confirmationProperties.required,
        )

    override fun dashboard(host: CurrentMember) = queries.hostDashboard(jdbcTemplate, host)

    override fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot {
        queries.requireHostSession(jdbcTemplate, command.host, command.sessionId)
        val updatedAt =
            jdbcTemplate
                .query(
                    """
                    select updated_at
                    from sessions
                    where id = ? and club_id = ?
                    for update
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.utcOffsetDateTime("updated_at") },
                    command.sessionId.dbString(),
                    command.host.clubId.dbString(),
                ).firstOrNull() ?: throw HostSessionNotFoundException()
        return HostSessionVisibilitySnapshot(
            detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
            contentUpdatedAt = updatedAt,
        )
    }

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

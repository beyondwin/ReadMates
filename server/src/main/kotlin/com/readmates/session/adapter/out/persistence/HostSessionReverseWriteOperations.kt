package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate

internal class HostSessionReverseWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
) {
    fun reopen(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        if (reopenDecision(state) == HostSessionTransitionDecision.UNCHANGED) {
            verifyRevision(command)
            return result(command, false)
        }
        return result(command, reopenClosedSession(command))
    }

    fun unpublish(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        val unpublishedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'CLOSED',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'PUBLISHED'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (unpublishedRows > 0) return result(command, true)
        verifyRevision(command)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        unpublishDecision(state)
        return result(command, false)
    }

    fun returnToDraft(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val returnedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'DRAFT',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'OPEN'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (returnedRows > 0) return result(command, true)
        verifyRevision(command)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        returnToDraftDecision(state)
        return result(command, false)
    }

    private fun reopenClosedSession(command: HostSessionIdCommand): Boolean {
        val openSessionId = queries.findOpenSessionId(command.host.clubId)
        if (openSessionId != null && openSessionId != command.sessionId) {
            throw OpenSessionAlreadyExistsException(openSessionId)
        }
        val reopenedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'OPEN',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'CLOSED'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (reopenedRows > 0) {
            hidePublicPlacement(command)
            return true
        }
        queries.revisions.throwIfStale(0, command.host, command.sessionId)
        val latest = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        reopenDecision(latest)
        return false
    }

    private fun verifyRevision(command: HostSessionIdCommand) {
        val expected = queries.expectedRevision(command.expectedSessionRevision)
        val current =
            queries.locks.sessionRevision(command.host, command.sessionId)
                ?: throw HostSessionNotFoundException()
        if (current != expected) {
            queries.revisions.throwIfStale(0, command.host, command.sessionId)
        }
    }

    private fun hidePublicPlacement(command: HostSessionIdCommand) {
        jdbcTemplate.update(
            """
            update public_session_publications
            set site_visibility = 'HIDDEN',
                visibility = 'MEMBER',
                is_public = false,
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
              and site_visibility = 'PUBLIC_RECORD'
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
        jdbcTemplate.update(
            """
            update sessions
            set visibility = case when visibility = 'PUBLIC' then 'MEMBER' else visibility end,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and deleted_at is null
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun result(
        command: HostSessionIdCommand,
        changed: Boolean,
    ) = HostSessionTransitionResult(
        detail = queries.detail(command.host, command.sessionId),
        changed = changed,
    )
}

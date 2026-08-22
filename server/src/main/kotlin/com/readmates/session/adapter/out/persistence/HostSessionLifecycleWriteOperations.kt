package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.requireHost
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.util.UUID

private const val SESSION_ID_PARAMETER = 3
private const val MEMBERSHIP_ID_PARAMETER = 4

internal class HostSessionLifecycleWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
) {
    fun open(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.lockClub(command.host.clubId)
        val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        if (policy.openDecision(state) == HostSessionTransitionDecision.UNCHANGED) {
            verifyRevision(command)
            return result(command, false)
        }
        val openSessionId = queries.findOpenSessionId(command.host.clubId)
        if (openSessionId != null) throw OpenSessionAlreadyExistsException(openSessionId)
        queries.requireActiveClubAndMembership(command.host.clubId, command.host.membershipId, hostRequired = true)
        val locked = queries.lockSession(command.host.clubId, command.sessionId) ?: throw HostSessionNotFoundException()
        if (locked.state != "DRAFT") {
            verifyRevision(command)
            policy.openDecision(locked.state)
            return result(command, false)
        }
        val updated =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'OPEN',
                    access_scope = 'GUEST_READABLE',
                    visibility = case when visibility = 'HOST_ONLY' then 'MEMBER' else visibility end,
                    session_revision = session_revision + 1,
                    participant_set_revision = participant_set_revision + 1,
                    exposure_revision = exposure_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'DRAFT'
                  and session_revision = ?
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        queries.throwIfStale(updated, command.host, command.sessionId)
        hidePublicPlacement(command)
        createActiveParticipants(command.host.clubId, command.sessionId)
        return result(command, true)
    }

    fun close(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        queries.requireActiveClubAndMembership(command.host.clubId, command.host.membershipId, hostRequired = true)
        val locked = queries.lockSession(command.host.clubId, command.sessionId) ?: throw HostSessionNotFoundException()
        verifyCloseExpected(command)
        if (locked.state != "OPEN") {
            verifyRevision(command)
            policy.closeDecision(locked.state)
            return result(command, false)
        }
        val closedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'CLOSED',
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
        queries.throwIfStale(closedRows, command.host, command.sessionId)
        return result(command, true)
    }

    fun publish(command: HostSessionIdCommand): HostSessionTransitionResult {
        requireHost(command.host)
        val publishedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'PUBLISHED',
                    session_revision = session_revision + 1,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and deleted_at is null
                  and state = 'CLOSED'
                  and session_revision = ?
                  and access_scope = 'GUEST_READABLE'
                  and exists (
                    select 1
                    from public_session_publications
                    where public_session_publications.session_id = sessions.id
                      and public_session_publications.club_id = sessions.club_id
                      and public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                      and trim(public_session_publications.public_summary) <> ''
                  )
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                queries.expectedRevision(command.expectedSessionRevision),
            )
        if (publishedRows == 0) {
            verifyRevision(command)
            val state = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
            policy.publishDecision(state)
            return result(command, false)
        }
        exposePublicPublication(command)
        return result(command, true)
    }

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
        queries.throwIfStale(0, command.host, command.sessionId)
        val latest = queries.state(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        reopenDecision(latest)
        return false
    }

    private fun verifyCloseExpected(command: HostSessionIdCommand) {
        command.expectedParticipantSetRevision?.let { expected ->
            val current =
                queries.lockParticipantSetRevision(command.host, command.sessionId)
                    ?: throw HostSessionNotFoundException()
            if (current != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
        command.expectedAttendanceSnapshotId?.let { expected ->
            if (queries.attendanceSnapshotId(command.host, command.sessionId) != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
    }

    private fun verifyRevision(command: HostSessionIdCommand) {
        val expected = queries.expectedRevision(command.expectedSessionRevision)
        val current = queries.sessionRevision(command.host, command.sessionId) ?: throw HostSessionNotFoundException()
        if (current != expected) {
            queries.throwIfStale(0, command.host, command.sessionId)
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

    private fun exposePublicPublication(command: HostSessionIdCommand) {
        jdbcTemplate.update(
            """
            update public_session_publications
            set is_public = true,
                site_visibility = 'PUBLIC_RECORD',
                published_at = coalesce(published_at, utc_timestamp(6)),
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
              and visibility = 'PUBLIC'
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun createActiveParticipants(
        clubId: UUID,
        sessionId: UUID,
    ) {
        val activeMembershipIds = queries.activeMembershipIds(clubId)
        if (activeMembershipIds.isEmpty()) return
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            on duplicate key update
              participation_status = values(participation_status),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    preparedStatement: PreparedStatement,
                    index: Int,
                ) {
                    preparedStatement.setString(1, UUID.randomUUID().dbString())
                    preparedStatement.setString(2, clubId.dbString())
                    preparedStatement.setString(SESSION_ID_PARAMETER, sessionId.dbString())
                    preparedStatement.setString(MEMBERSHIP_ID_PARAMETER, activeMembershipIds[index].dbString())
                }

                override fun getBatchSize(): Int = activeMembershipIds.size
            },
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
